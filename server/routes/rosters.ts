import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import {
  users,
  rosterWeeks,
  rosterDraftShifts,
  rosterVersions,
  rosterVersionShifts,
  staffRosterSnapshots,
} from '../db/schema.ts';
import { eq, and, desc, inArray } from 'drizzle-orm';
import {
  getCurrentWeekMonday,
  isValidMondayDate,
  localToUtcDatetime,
} from '../services/timezone.ts';
import {
  validateShift,
  evaluateDraftShiftsContainment,
  publishRosterWeek,
} from '../services/roster.ts';
import { logAuditEvent } from '../services/audit.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import crypto from 'crypto';

export const rosterRouter = Router();

rosterRouter.use(requireAuth, requireRole('manager'));

// GET /api/rosters/week - Get draft shifts, published version info, and availability warnings
rosterRouter.get('/week', async (req: Request, res: Response) => {
  try {
    const week = (req.query.week as string) || getCurrentWeekMonday();
    if (!isValidMondayDate(week)) {
      return res.status(400).json({ error: 'Invalid week start date' });
    }

    // Ensure roster week container exists
    let rosterWeek = (
      await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, week)).limit(1)
    )[0];

    const nowIso = new Date().toISOString();

    if (!rosterWeek) {
      const weekId = crypto.randomUUID();
      await db.insert(rosterWeeks).values({
        id: weekId,
        week_start_date: week,
        draft_revision_number: 1,
        updated_at: nowIso,
      });
      rosterWeek = (await db.select().from(rosterWeeks).where(eq(rosterWeeks.id, weekId)))[0];
    }

    // Fetch draft shifts
    const rawDraftShifts = await db
      .select({
        id: rosterDraftShifts.id,
        roster_week_id: rosterDraftShifts.roster_week_id,
        user_id: rosterDraftShifts.user_id,
        start_datetime: rosterDraftShifts.start_datetime,
        finish_datetime: rosterDraftShifts.finish_datetime,
        start_day_of_week: rosterDraftShifts.start_day_of_week,
        label: rosterDraftShifts.label,
        notes: rosterDraftShifts.notes,
        override_reason: rosterDraftShifts.override_reason,
      })
      .from(rosterDraftShifts)
      .where(eq(rosterDraftShifts.roster_week_id, rosterWeek.id));

    // Evaluate availability containment
    const evaluatedShifts = await evaluateDraftShiftsContainment(week, rawDraftShifts);

    // Fetch active staff/users for shift metadata
    const activeStaff = await db
      .select({ id: users.id, name: users.name, phone_e164: users.phone_e164, role: users.role })
      .from(users)
      .where(eq(users.is_active, true));

    const staffMap = new Map(activeStaff.map((s) => [s.id, s.name]));

    const enrichedShifts = evaluatedShifts.map((s) => {
      const name = staffMap.get(s.user_id) || 'Unknown Staff';
      return {
        ...s,
        staff_name: name,
        user_name: name,
        is_contained_in_availability: s.is_contained,
      };
    });

    // Latest published version info if exists
    let latestPublishedVersion = null;
    if (rosterWeek.latest_published_version_id) {
      const v = (
        await db
          .select()
          .from(rosterVersions)
          .where(eq(rosterVersions.id, rosterWeek.latest_published_version_id))
          .limit(1)
      )[0];
      if (v) {
        latestPublishedVersion = v;
      }
    }

    return res.json({
      roster_week: {
        id: rosterWeek.id,
        week_start_date: rosterWeek.week_start_date,
        draft_revision_number: rosterWeek.draft_revision_number,
        latest_published_version_id: rosterWeek.latest_published_version_id,
        latest_published_version_number: latestPublishedVersion?.version_number || null,
        published_at: latestPublishedVersion?.published_at || null,
      },
      draft_shifts: enrichedShifts,
      shifts: enrichedShifts,
      active_staff: activeStaff,
      validation: {
        warnings: enrichedShifts
          .filter((s) => !s.is_contained)
          .map((s) => ({
            shift_id: s.id,
            user_id: s.user_id,
            staff_name: s.staff_name,
            user_name: s.user_name,
            day_of_week: s.start_day_of_week,
            message: s.containment_warning || 'Shift hours not fully contained in availability.',
          })),
      },
    });
  } catch (err) {
    console.error('Get roster week error:', err);
    return res.status(500).json({ error: 'Failed to retrieve roster week' });
  }
});

// POST /api/rosters/shifts - Create draft shift
rosterRouter.post('/shifts', async (req: Request, res: Response) => {
  try {
    const {
      roster_week_id,
      user_id,
      start_day_of_week,
      start_time, // "HH:mm"
      finish_time, // "HH:mm"
      is_overnight = false,
      label,
      notes,
      override_reason,
      draft_revision_number,
    } = req.body;

    const week = (await db.select().from(rosterWeeks).where(eq(rosterWeeks.id, roster_week_id)).limit(1))[0];
    if (!week) return res.status(404).json({ error: 'Roster week not found' });

    // Concurrency check
    if (draft_revision_number !== undefined && week.draft_revision_number !== draft_revision_number) {
      return res.status(409).json({
        error: 'This roster changed in another session. Please refresh to see latest shifts.',
      });
    }

    // Verify staff is active
    const staff = (
      await db.select().from(users).where(and(eq(users.id, user_id), eq(users.is_active, true))).limit(1)
    )[0];
    if (!staff) {
      return res.status(400).json({ error: 'Cannot assign shift to inactive or non-existent staff.' });
    }

    // Calculate absolute UTC datetimes from NZ local inputs
    const startUtc = localToUtcDatetime(week.week_start_date, Number(start_day_of_week), start_time);
    const finishUtc = localToUtcDatetime(
      week.week_start_date,
      Number(start_day_of_week),
      finish_time,
      Boolean(is_overnight || finish_time <= start_time)
    );

    // Existing shifts for overlap detection
    const existingDrafts = await db
      .select()
      .from(rosterDraftShifts)
      .where(eq(rosterDraftShifts.roster_week_id, roster_week_id));

    const validation = validateShift(
      {
        start: startUtc,
        finish: finishUtc,
        userId: user_id,
      },
      existingDrafts
    );

    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    const shiftId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await db.insert(rosterDraftShifts).values({
      id: shiftId,
      roster_week_id,
      user_id,
      start_datetime: startUtc.toISOString(),
      finish_datetime: finishUtc.toISOString(),
      start_day_of_week: Number(start_day_of_week),
      label: label?.trim() || null,
      notes: notes?.trim() || null,
      override_reason: override_reason?.trim() || null,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Bump draft revision number
    await db
      .update(rosterWeeks)
      .set({
        draft_revision_number: week.draft_revision_number + 1,
        updated_at: nowIso,
      })
      .where(eq(rosterWeeks.id, roster_week_id));

    return res.status(201).json({ success: true, shift_id: shiftId });
  } catch (err: any) {
    console.error('Create shift error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create shift' });
  }
});

// PUT /api/rosters/shifts/:id - Edit draft shift
rosterRouter.put('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      user_id,
      start_day_of_week,
      start_time,
      finish_time,
      is_overnight = false,
      label,
      notes,
      override_reason,
      draft_revision_number,
    } = req.body;

    const existingShift = (
      await db.select().from(rosterDraftShifts).where(eq(rosterDraftShifts.id, id)).limit(1)
    )[0];
    if (!existingShift) return res.status(404).json({ error: 'Shift not found' });

    const week = (
      await db.select().from(rosterWeeks).where(eq(rosterWeeks.id, existingShift.roster_week_id)).limit(1)
    )[0];
    if (!week) return res.status(404).json({ error: 'Roster week not found' });

    // Concurrency check
    if (draft_revision_number !== undefined && week.draft_revision_number !== draft_revision_number) {
      return res.status(409).json({
        error: 'This roster changed in another session. Please refresh to see latest shifts.',
      });
    }

    const targetUserId = user_id || existingShift.user_id;
    const targetDay = start_day_of_week !== undefined ? Number(start_day_of_week) : existingShift.start_day_of_week;

    let startUtc = new Date(existingShift.start_datetime);
    let finishUtc = new Date(existingShift.finish_datetime);

    if (start_time && finish_time) {
      startUtc = localToUtcDatetime(week.week_start_date, targetDay, start_time);
      finishUtc = localToUtcDatetime(
        week.week_start_date,
        targetDay,
        finish_time,
        Boolean(is_overnight || finish_time <= start_time)
      );
    }

    const existingDrafts = await db
      .select()
      .from(rosterDraftShifts)
      .where(eq(rosterDraftShifts.roster_week_id, existingShift.roster_week_id));

    const validation = validateShift(
      {
        start: startUtc,
        finish: finishUtc,
        userId: targetUserId,
        excludeShiftId: id,
      },
      existingDrafts
    );

    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }

    const nowIso = new Date().toISOString();
    await db
      .update(rosterDraftShifts)
      .set({
        user_id: targetUserId,
        start_datetime: startUtc.toISOString(),
        finish_datetime: finishUtc.toISOString(),
        start_day_of_week: targetDay,
        label: label !== undefined ? (label ? label.trim() : null) : existingShift.label,
        notes: notes !== undefined ? (notes ? notes.trim() : null) : existingShift.notes,
        override_reason: override_reason !== undefined ? (override_reason ? override_reason.trim() : null) : existingShift.override_reason,
        updated_at: nowIso,
      })
      .where(eq(rosterDraftShifts.id, id));

    await db
      .update(rosterWeeks)
      .set({
        draft_revision_number: week.draft_revision_number + 1,
        updated_at: nowIso,
      })
      .where(eq(rosterWeeks.id, week.id));

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Update shift error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to update shift' });
  }
});

// DELETE /api/rosters/shifts/:id - Remove draft shift
rosterRouter.delete('/shifts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = (await db.select().from(rosterDraftShifts).where(eq(rosterDraftShifts.id, id)).limit(1))[0];
    if (!existing) return res.status(404).json({ error: 'Shift not found' });

    const week = (await db.select().from(rosterWeeks).where(eq(rosterWeeks.id, existing.roster_week_id)).limit(1))[0];

    await db.delete(rosterDraftShifts).where(eq(rosterDraftShifts.id, id));

    const nowIso = new Date().toISOString();
    if (week) {
      await db
        .update(rosterWeeks)
        .set({
          draft_revision_number: week.draft_revision_number + 1,
          updated_at: nowIso,
        })
        .where(eq(rosterWeeks.id, week.id));
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete shift error:', err);
    return res.status(500).json({ error: 'Failed to delete shift' });
  }
});

// POST /api/rosters/copy-prior-week or /:id/copy-prior-week
rosterRouter.post(['/copy-prior-week', '/:id/copy-prior-week'], async (req: Request, res: Response) => {
  try {
    const roster_week_id = req.params.id || req.body.roster_week_id;
    const currentWeek = (await db.select().from(rosterWeeks).where(eq(rosterWeeks.id, roster_week_id)).limit(1))[0];
    if (!currentWeek) return res.status(404).json({ error: 'Roster week not found' });

    // Determine previous Monday
    const prevDate = new Date(`${currentWeek.week_start_date}T12:00:00`);
    prevDate.setDate(prevDate.getDate() - 7);
    const prevMondayStr = prevDate.toISOString().split('T')[0];

    const prevWeek = (
      await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, prevMondayStr)).limit(1)
    )[0];

    if (!prevWeek || !prevWeek.latest_published_version_id) {
      return res.status(404).json({ error: 'No published roster found for the previous week to copy.' });
    }

    const prevShifts = await db
      .select()
      .from(rosterVersionShifts)
      .where(eq(rosterVersionShifts.roster_version_id, prevWeek.latest_published_version_id));

    if (prevShifts.length === 0) {
      return res.status(400).json({ error: 'Previous week published roster has no shifts.' });
    }

    // Clear existing draft shifts or merge
    await db.delete(rosterDraftShifts).where(eq(rosterDraftShifts.roster_week_id, roster_week_id));

    const nowIso = new Date().toISOString();
    let copiedCount = 0;

    for (const ps of prevShifts) {
      // Shift dates forward by exactly 7 days
      const oldStart = new Date(ps.start_datetime);
      const oldFinish = new Date(ps.finish_datetime);
      const newStart = new Date(oldStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const newFinish = new Date(oldFinish.getTime() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(rosterDraftShifts).values({
        id: crypto.randomUUID(),
        roster_week_id,
        user_id: ps.user_id,
        start_datetime: newStart.toISOString(),
        finish_datetime: newFinish.toISOString(),
        start_day_of_week: ps.start_day_of_week,
        label: ps.label,
        notes: ps.notes,
        override_reason: ps.override_reason,
        created_at: nowIso,
        updated_at: nowIso,
      });
      copiedCount++;
    }

    await db
      .update(rosterWeeks)
      .set({
        draft_revision_number: currentWeek.draft_revision_number + 1,
        updated_at: nowIso,
      })
      .where(eq(rosterWeeks.id, roster_week_id));

    return res.json({ success: true, copied_shifts_count: copiedCount });
  } catch (err) {
    console.error('Copy prior week error:', err);
    return res.status(500).json({ error: 'Failed to copy prior week roster' });
  }
});

// POST /api/rosters/publish or /:id/publish - Atomically publish roster / revision
rosterRouter.post(['/publish', '/:id/publish'], async (req: Request, res: Response) => {
  try {
    const roster_week_id = req.params.id || req.body.roster_week_id;
    const client_revision_number = req.body.client_revision_number ?? req.body.draft_revision_number;

    if (!roster_week_id || client_revision_number === undefined) {
      return res.status(400).json({ error: 'roster_week_id and client_revision_number are required' });
    }

    const result = await publishRosterWeek({
      rosterWeekId: roster_week_id,
      publishedByUserId: req.user!.id,
      publishedByName: req.user!.name,
      clientRevisionNumber: Number(client_revision_number),
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      version_id: result.versionId,
      version_number: result.versionNumber,
      notified_count: result.notifiedCount,
    });
  } catch (err: any) {
    console.error('Publish error:', err);
    return res.status(400).json({ error: err?.message || 'Failed to publish roster' });
  }
});

// GET /api/rosters/responses - Manager response tracker for published week
rosterRouter.get('/responses', async (req: Request, res: Response) => {
  try {
    const week = (req.query.week as string) || getCurrentWeekMonday();
    const rosterWeek = (
      await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, week)).limit(1)
    )[0];

    if (!rosterWeek || !rosterWeek.latest_published_version_id) {
      return res.json({
        published: false,
        is_published: false,
        week_start_date: week,
        responses: [],
        summary: { total: 0, acknowledged: 0, pending: 0, conflict: 0 },
      });
    }

    const version = (
      await db
        .select()
        .from(rosterVersions)
        .where(eq(rosterVersions.id, rosterWeek.latest_published_version_id))
        .limit(1)
    )[0];

    const rawSnapshots = await db
      .select({
        id: staffRosterSnapshots.id,
        user_id: staffRosterSnapshots.user_id,
        user_name: users.name,
        user_phone: users.phone_e164,
        has_shifts: staffRosterSnapshots.has_shifts,
        shift_count: staffRosterSnapshots.shift_count,
        response_status: staffRosterSnapshots.response_status,
        response_reason: staffRosterSnapshots.response_reason,
        response_note: staffRosterSnapshots.response_note,
        responded_at: staffRosterSnapshots.responded_at,
      })
      .from(staffRosterSnapshots)
      .innerJoin(users, eq(staffRosterSnapshots.user_id, users.id))
      .where(eq(staffRosterSnapshots.roster_version_id, rosterWeek.latest_published_version_id))
      .orderBy(users.name);

    // Also fetch all published shifts for this version to include per-shift status
    const allVersionShifts = await db
      .select({
        id: rosterVersionShifts.id,
        user_id: rosterVersionShifts.user_id,
        start_datetime: rosterVersionShifts.start_datetime,
        finish_datetime: rosterVersionShifts.finish_datetime,
        start_day_of_week: rosterVersionShifts.start_day_of_week,
        label: rosterVersionShifts.label,
        notes: rosterVersionShifts.notes,
        response_status: rosterVersionShifts.response_status,
        response_reason: rosterVersionShifts.response_reason,
        response_note: rosterVersionShifts.response_note,
        responded_at: rosterVersionShifts.responded_at,
      })
      .from(rosterVersionShifts)
      .where(eq(rosterVersionShifts.roster_version_id, rosterWeek.latest_published_version_id))
      .orderBy(rosterVersionShifts.start_datetime);

    const shiftsByUser = new Map<string, typeof allVersionShifts>();
    for (const sh of allVersionShifts) {
      const list = shiftsByUser.get(sh.user_id) || [];
      list.push(sh);
      shiftsByUser.set(sh.user_id, list);
    }

    const snapshots = rawSnapshots.map((s) => ({
      id: s.id,
      snapshot_id: s.id,
      user_id: s.user_id,
      user_name: s.user_name,
      user_phone: s.user_phone,
      has_shifts: s.has_shifts,
      shift_count: s.shift_count,
      shifts_count: s.shift_count,
      response_status: s.response_status,
      response_reason: s.response_reason,
      response_note: s.response_note,
      conflict_reason: s.response_reason,
      conflict_note: s.response_note,
      responded_at: s.responded_at,
      shifts: shiftsByUser.get(s.user_id) || [],
    }));

    const summary = {
      total: snapshots.length,
      acknowledged: snapshots.filter((s) => s.response_status === 'acknowledged').length,
      pending: snapshots.filter((s) => s.response_status === 'pending').length,
      conflict: snapshots.filter((s) => s.response_status === 'conflict').length,
    };

    return res.json({
      published: true,
      is_published: true,
      week_start_date: week,
      latest_version_id: rosterWeek.latest_published_version_id,
      version_number: version?.version_number || 1,
      published_at: version?.published_at || null,
      responses: snapshots,
      summary,
    });
  } catch (err) {
    console.error('Roster responses error:', err);
    return res.status(500).json({ error: 'Failed to retrieve responses' });
  }
});

// GET /api/rosters/versions - History of published revisions for a week
rosterRouter.get('/versions', async (req: Request, res: Response) => {
  try {
    const week = (req.query.week as string) || getCurrentWeekMonday();
    const rosterWeek = (
      await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, week)).limit(1)
    )[0];

    if (!rosterWeek) {
      return res.json({ versions: [] });
    }

    const versionsList = await db
      .select({
        id: rosterVersions.id,
        version_number: rosterVersions.version_number,
        published_at: rosterVersions.published_at,
        published_by_name: users.name,
      })
      .from(rosterVersions)
      .innerJoin(users, eq(rosterVersions.published_by_user_id, users.id))
      .where(eq(rosterVersions.roster_week_id, rosterWeek.id))
      .orderBy(desc(rosterVersions.version_number));

    return res.json({ versions: versionsList });
  } catch (err) {
    console.error('Get versions error:', err);
    return res.status(500).json({ error: 'Failed to retrieve versions' });
  }
});
