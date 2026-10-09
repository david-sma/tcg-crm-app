import { db } from '../db/index.ts';
import {
  users,
  rosterWeeks,
  rosterDraftShifts,
  rosterVersions,
  rosterVersionShifts,
  staffRosterSnapshots,
  staffRosterResponses,
  notifications,
} from '../db/schema.ts';
import { eq, and, desc, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import {
  getLatestUserAvailability,
  getAvailabilityIntervalsForWeek,
  checkShiftAvailabilityContainment,
} from './availability.ts';
import { sendPushNotificationToUser } from './notification.ts';
import { logAuditEvent } from './audit.ts';
import type { DayOfWeekIndex, DraftShift } from '../../src/types/index.ts';

/**
 * Calculates deterministic SHA-256 hash of staff-visible shifts
 */
export function computeStaffVisibleRosterHash(shifts: Array<{
  start_datetime: string;
  finish_datetime: string;
  label?: string | null;
  notes?: string | null;
}>): string {
  // Sort shifts by start_datetime ascending
  const sorted = [...shifts].sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  // Canonical payload containing ONLY staff-visible properties
  const payload = sorted.map((s) => ({
    start: s.start_datetime,
    finish: s.finish_datetime,
    label: s.label || '',
    notes: s.notes || '',
  }));

  const jsonStr = JSON.stringify(payload);
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

/**
 * Validates a shift interval and checks overlaps against existing shifts for the same user
 */
export function validateShift(
  newShift: {
    start: Date;
    finish: Date;
    userId: string;
    excludeShiftId?: string;
  },
  existingShifts: Array<{ id: string; user_id: string; start_datetime: string; finish_datetime: string }>
): { isValid: boolean; error?: string } {
  const startTime = newShift.start.getTime();
  const finishTime = newShift.finish.getTime();

  if (finishTime <= startTime) {
    return { isValid: false, error: 'Shift finish time must be strictly after start time.' };
  }

  const durationHours = (finishTime - startTime) / (1000 * 60 * 60);
  if (durationHours > 24) {
    return { isValid: false, error: 'Shift duration cannot exceed 24 hours.' };
  }

  // Check overlap with other shifts for the same staff member
  for (const ex of existingShifts) {
    if (ex.id === newShift.excludeShiftId) continue;
    if (ex.user_id !== newShift.userId) continue;

    const exStart = new Date(ex.start_datetime).getTime();
    const exFinish = new Date(ex.finish_datetime).getTime();

    // Overlap condition: max(S1, S2) < min(F1, F2)
    if (Math.max(startTime, exStart) < Math.min(finishTime, exFinish)) {
      return {
        isValid: false,
        error: `This shift overlaps another shift for this staff member (${ex.start_datetime.substring(11, 16)} - ${ex.finish_datetime.substring(11, 16)}).`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Evaluates availability containment for a list of draft shifts
 */
export async function evaluateDraftShiftsContainment<
  T extends {
    id: string;
    user_id: string;
    start_datetime: string;
    finish_datetime: string;
    override_reason?: string | null;
  }
>(
  mondayStr: string,
  shifts: T[]
): Promise<Array<T & { is_contained: boolean; containment_warning: string | null }>> {
  const userIds = Array.from(new Set(shifts.map((s) => s.user_id)));
  const userAvailabilityMap = new Map<string, { intervals: any[]; hasReport: boolean }>();

  for (const uid of userIds) {
    const avail = await getLatestUserAvailability(uid, mondayStr);
    if (!avail || !avail.windows) {
      userAvailabilityMap.set(uid, { intervals: [], hasReport: false });
    } else {
      const intervals = getAvailabilityIntervalsForWeek(mondayStr, avail.windows);
      userAvailabilityMap.set(uid, { intervals, hasReport: true });
    }
  }

  return shifts.map((shift) => {
    const avail = userAvailabilityMap.get(shift.user_id) || { intervals: [], hasReport: false };
    const check = checkShiftAvailabilityContainment(
      new Date(shift.start_datetime),
      new Date(shift.finish_datetime),
      avail.intervals,
      avail.hasReport
    );

    return {
      ...shift,
      is_contained: check.isContained,
      containment_warning: check.warning || null,
    };
  });
}

/**
 * Atomically publishes a weekly roster or revision
 */
export async function publishRosterWeek(params: {
  rosterWeekId: string;
  publishedByUserId: string;
  publishedByName: string;
  clientRevisionNumber: number;
  ipAddress?: string;
}) {
  const { rosterWeekId, publishedByUserId, publishedByName, clientRevisionNumber, ipAddress } = params;

  // 1. Fetch roster week record
  const week = (await db.select().from(rosterWeeks).where(eq(rosterWeeks.id, rosterWeekId)).limit(1))[0];
  if (!week) {
    throw new Error('Roster week not found');
  }

  // 2. Concurrency check
  if (week.draft_revision_number !== clientRevisionNumber) {
    throw new Error('Draft was updated by another user or window. Please refresh and review latest changes.');
  }

  // 3. Fetch all draft shifts
  const draftShifts = await db
    .select()
    .from(rosterDraftShifts)
    .where(eq(rosterDraftShifts.roster_week_id, rosterWeekId));

  // 4. Fetch all active staff
  const activeStaff = await db.select().from(users).where(and(inArray(users.role, ['staff', 'team_leader']), eq(users.is_active, true)));
  const activeStaffMap = new Map(activeStaff.map((u) => [u.id, u]));

  // Verify that all shifts belong to active staff
  for (const shift of draftShifts) {
    if (!activeStaffMap.has(shift.user_id)) {
      throw new Error(`Cannot publish roster: shift assigned to inactive or non-existent staff member.`);
    }
  }

  // Verify shift overlaps
  for (let i = 0; i < draftShifts.length; i++) {
    const shiftA = draftShifts[i];
    const validation = validateShift(
      {
        start: new Date(shiftA.start_datetime),
        finish: new Date(shiftA.finish_datetime),
        userId: shiftA.user_id,
        excludeShiftId: shiftA.id,
      },
      draftShifts
    );
    if (!validation.isValid) {
      throw new Error(`Roster validation error: ${validation.error}`);
    }
  }

  // 5. Evaluate availability containment and check required overrides
  const evaluatedShifts = await evaluateDraftShiftsContainment(week.week_start_date, draftShifts);
  for (const s of evaluatedShifts) {
    if (!s.is_contained && (!s.override_reason || s.override_reason.trim() === '')) {
      throw new Error(
        `Cannot publish roster: Shift with availability warning requires an explicit override reason.`
      );
    }
  }

  // 6. Determine new version number
  const existingVersions = await db
    .select()
    .from(rosterVersions)
    .where(eq(rosterVersions.roster_week_id, rosterWeekId))
    .orderBy(desc(rosterVersions.version_number));

  const newVersionNumber = existingVersions.length > 0 ? existingVersions[0].version_number + 1 : 1;
  const isRevision = newVersionNumber > 1;
  const previousVersion = isRevision ? existingVersions[0] : null;

  // Fetch previous snapshots and shifts if revision
  let previousSnapshotsMap = new Map<string, any>();
  let previousShifts: any[] = [];
  if (previousVersion) {
    const [prevSnapshots, prevShifts] = await Promise.all([
      db
        .select()
        .from(staffRosterSnapshots)
        .where(eq(staffRosterSnapshots.roster_version_id, previousVersion.id)),
      db
        .select()
        .from(rosterVersionShifts)
        .where(eq(rosterVersionShifts.roster_version_id, previousVersion.id)),
    ]);
    previousSnapshotsMap = new Map(prevSnapshots.map((s) => [s.user_id, s]));
    previousShifts = prevShifts;
  }

  const nowIso = new Date().toISOString();
  const versionId = crypto.randomUUID();

  // 7. Insert immutable roster version
  await db.insert(rosterVersions).values({
    id: versionId,
    roster_week_id: rosterWeekId,
    version_number: newVersionNumber,
    published_by_user_id: publishedByUserId,
    published_at: nowIso,
  });

  // 8. Insert version shifts snapshot (carrying over previous confirmation if shift is unchanged)
  const insertedShiftsByUser = new Map<string, any[]>();
  for (const shift of draftShifts) {
    const staff = activeStaffMap.get(shift.user_id);

    // Check if shift is identical to a previously published shift
    const matchingPrevShift = isRevision
      ? previousShifts.find(
          (ps) =>
            ps.user_id === shift.user_id &&
            ps.start_datetime === shift.start_datetime &&
            ps.finish_datetime === shift.finish_datetime &&
            (ps.label || '') === (shift.label || '') &&
            (ps.notes || '') === (shift.notes || '')
        )
      : null;

    const shiftStatus: 'pending' | 'acknowledged' | 'conflict' = matchingPrevShift
      ? matchingPrevShift.response_status || 'pending'
      : 'pending';
    const shiftReason = matchingPrevShift ? matchingPrevShift.response_reason : null;
    const shiftNote = matchingPrevShift ? matchingPrevShift.response_note : null;
    const shiftRespondedAt = matchingPrevShift ? matchingPrevShift.responded_at : null;

    const shiftRecord = {
      id: crypto.randomUUID(),
      roster_version_id: versionId,
      user_id: shift.user_id,
      staff_name_snapshot: staff ? staff.name : 'Staff',
      start_datetime: shift.start_datetime,
      finish_datetime: shift.finish_datetime,
      start_day_of_week: shift.start_day_of_week,
      label: shift.label || null,
      notes: shift.notes || null,
      override_reason: shift.override_reason || null,
      response_status: shiftStatus,
      response_reason: shiftReason,
      response_note: shiftNote,
      responded_at: shiftRespondedAt,
    };

    await db.insert(rosterVersionShifts).values(shiftRecord);

    const userShifts = insertedShiftsByUser.get(shift.user_id) || [];
    userShifts.push(shiftRecord);
    insertedShiftsByUser.set(shift.user_id, userShifts);
  }

  // 9. Generate Staff Snapshots based on per-shift statuses
  const staffToNotify: Array<{ user_id: string; title: string; body: string }> = [];

  for (const staff of activeStaff) {
    const staffShifts = insertedShiftsByUser.get(staff.id) || [];
    const contentHash = computeStaffVisibleRosterHash(staffShifts);
    const hasShifts = staffShifts.length > 0;
    const shiftCount = staffShifts.length;

    let responseStatus: 'pending' | 'acknowledged' | 'conflict' = 'pending';
    let responseReason: string | null = null;
    let responseNote: string | null = null;
    let respondedAt: string | null = null;
    let shouldNotify = false;

    if (!hasShifts) {
      // No shifts assigned: automatically acknowledged
      responseStatus = 'acknowledged';
      respondedAt = nowIso;
      shouldNotify = !isRevision; // Only notify on initial publish
    } else {
      const pendingCount = staffShifts.filter((s) => s.response_status === 'pending').length;
      const conflictShifts = staffShifts.filter((s) => s.response_status === 'conflict');
      const allConfirmed = staffShifts.every((s) => s.response_status === 'acknowledged');

      if (conflictShifts.length > 0) {
        responseStatus = 'conflict';
        responseReason = conflictShifts[0].response_reason;
        responseNote = conflictShifts[0].response_note;
        respondedAt = conflictShifts[0].responded_at || nowIso;
        // If there are pending shifts or if revision changed something, notify
        shouldNotify = pendingCount > 0;
      } else if (allConfirmed) {
        responseStatus = 'acknowledged';
        respondedAt = staffShifts[0].responded_at || nowIso;
        shouldNotify = false; // All shifts were already confirmed from previous version
      } else {
        responseStatus = 'pending';
        shouldNotify = true; // Staff needs to confirm pending shift(s)
      }
    }

    const snapshotId = crypto.randomUUID();
    await db.insert(staffRosterSnapshots).values({
      id: snapshotId,
      roster_version_id: versionId,
      user_id: staff.id,
      has_shifts: hasShifts,
      shift_count: shiftCount,
      content_hash: contentHash,
      response_status: responseStatus,
      response_reason: responseReason,
      response_note: responseNote,
      responded_at: respondedAt,
    });

    if (shouldNotify) {
      const pendingCount = staffShifts.filter((s) => s.response_status === 'pending').length;
      const title = isRevision
        ? `Roster Updated (Week of ${week.week_start_date})`
        : `New Roster Published (Week of ${week.week_start_date})`;
      const body = hasShifts
        ? pendingCount > 0 && isRevision
          ? `Your roster was updated with ${pendingCount} shift${pendingCount > 1 ? 's' : ''} requiring your confirmation.`
          : `Your roster has ${shiftCount} shift${shiftCount > 1 ? 's' : ''} for the week starting ${week.week_start_date}. Please review and confirm.`
        : `Your roster has been published with No shifts assigned for the week starting ${week.week_start_date}.`;

      staffToNotify.push({ user_id: staff.id, title, body });

      // Create persistent in-app notification
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        user_id: staff.id,
        type: isRevision ? 'ROSTER_REVISED' : 'ROSTER_PUBLISHED',
        title,
        body,
        related_entity_type: 'roster_version',
        related_entity_id: versionId,
        is_read: false,
        created_at: nowIso,
      });
    }
  }

  // 10. Update Roster Week pointer and increment draft revision number
  await db
    .update(rosterWeeks)
    .set({
      latest_published_version_id: versionId,
      draft_revision_number: week.draft_revision_number + 1,
      updated_at: nowIso,
    })
    .where(eq(rosterWeeks.id, rosterWeekId));

  // 11. Audit Log
  await logAuditEvent({
    actor_user_id: publishedByUserId,
    actor_name: publishedByName,
    actor_role: 'manager',
    event_type: isRevision ? 'ROSTER_REVISED' : 'ROSTER_PUBLISHED',
    entity_type: 'roster_version',
    entity_id: versionId,
    metadata: {
      week_start_date: week.week_start_date,
      version_number: newVersionNumber,
      shift_count: draftShifts.length,
      notified_staff_count: staffToNotify.length,
    },
    ip_address: ipAddress,
  });

  // 12. Non-blocking asynchronous Web Push notifications
  setImmediate(async () => {
    for (const item of staffToNotify) {
      try {
        await sendPushNotificationToUser(item.user_id, {
          title: item.title,
          body: item.body,
          url: '/staff/roster',
        });
      } catch (err) {
        console.error(`Push notification failed for user ${item.user_id}:`, err);
      }
    }
  });

  return {
    versionId,
    versionNumber: newVersionNumber,
    notifiedCount: staffToNotify.length,
  };
}
