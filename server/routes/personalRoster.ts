import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import {
  users,
  rosterWeeks,
  rosterVersions,
  rosterVersionShifts,
  staffRosterSnapshots,
  staffRosterResponses,
  notifications,
} from '../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { getCurrentWeekMonday, isValidMondayDate } from '../services/timezone.ts';
import { logAuditEvent } from '../services/audit.ts';
import { createInAppNotification } from '../services/notification.ts';
import { requireAuth } from '../middleware/auth.ts';
import crypto from 'crypto';

export const personalRosterRouter = Router();

personalRosterRouter.use(requireAuth);

// GET /api/personal-roster - Get caller's own personal roster for a week
personalRosterRouter.get('/', async (req: Request, res: Response) => {
  try {
    const week = (req.query.week as string) || getCurrentWeekMonday();
    if (!isValidMondayDate(week)) {
      return res.status(400).json({ error: 'Invalid week start date' });
    }

    const rosterWeek = (
      await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, week)).limit(1)
    )[0];

    if (!rosterWeek || !rosterWeek.latest_published_version_id) {
      return res.json({
        is_published: false,
        week_start_date: week,
        message: 'Roster for this week is not published yet.',
      });
    }

    const version = (
      await db
        .select()
        .from(rosterVersions)
        .where(eq(rosterVersions.id, rosterWeek.latest_published_version_id))
        .limit(1)
    )[0];

    // Find caller's personal snapshot
    const snapshot = (
      await db
        .select()
        .from(staffRosterSnapshots)
        .where(
          and(
            eq(staffRosterSnapshots.roster_version_id, version.id),
            eq(staffRosterSnapshots.user_id, req.user!.id)
          )
        )
        .limit(1)
    )[0];

    // Find caller's shifts in this published version
    const shifts = await db
      .select({
        id: rosterVersionShifts.id,
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
      .where(
        and(
          eq(rosterVersionShifts.roster_version_id, version.id),
          eq(rosterVersionShifts.user_id, req.user!.id)
        )
      )
      .orderBy(rosterVersionShifts.start_datetime);

    return res.json({
      is_published: true,
      week_start_date: week,
      version_number: version.version_number,
      published_at: version.published_at,
      snapshot_id: snapshot?.id || null,
      response_status: snapshot?.response_status || 'pending',
      response_reason: snapshot?.response_reason || null,
      response_note: snapshot?.response_note || null,
      responded_at: snapshot?.responded_at || null,
      has_shifts: shifts.length > 0,
      shift_count: shifts.length,
      shifts,
    });
  } catch (err) {
    console.error('Get personal roster error:', err);
    return res.status(500).json({ error: 'Failed to retrieve personal roster' });
  }
});

// POST /api/personal-roster/acknowledge - Acknowledge entire weekly personal roster or individual shift
personalRosterRouter.post('/acknowledge', async (req: Request, res: Response) => {
  try {
    const { snapshot_id, shift_id } = req.body;
    if (!snapshot_id) {
      return res.status(400).json({ error: 'snapshot_id is required' });
    }

    const snapshot = (
      await db
        .select()
        .from(staffRosterSnapshots)
        .where(
          and(
            eq(staffRosterSnapshots.id, snapshot_id),
            eq(staffRosterSnapshots.user_id, req.user!.id)
          )
        )
        .limit(1)
    )[0];

    if (!snapshot) {
      return res.status(404).json({ error: 'Personal roster snapshot not found' });
    }

    const nowIso = new Date().toISOString();

    if (shift_id) {
      // Per-shift acknowledge
      const shift = (
        await db
          .select()
          .from(rosterVersionShifts)
          .where(
            and(
              eq(rosterVersionShifts.id, shift_id),
              eq(rosterVersionShifts.roster_version_id, snapshot.roster_version_id),
              eq(rosterVersionShifts.user_id, req.user!.id)
            )
          )
          .limit(1)
      )[0];

      if (!shift) {
        return res.status(404).json({ error: 'Shift not found' });
      }

      await db
        .update(rosterVersionShifts)
        .set({
          response_status: 'acknowledged',
          response_reason: null,
          response_note: null,
          responded_at: nowIso,
        })
        .where(eq(rosterVersionShifts.id, shift_id));
    } else {
      // Bulk acknowledge all pending shifts for this version
      const allShifts = await db
        .select()
        .from(rosterVersionShifts)
        .where(
          and(
            eq(rosterVersionShifts.roster_version_id, snapshot.roster_version_id),
            eq(rosterVersionShifts.user_id, req.user!.id)
          )
        );

      for (const s of allShifts) {
        if (s.response_status === 'pending' || s.response_status === 'conflict') {
          await db
            .update(rosterVersionShifts)
            .set({
              response_status: 'acknowledged',
              response_reason: null,
              response_note: null,
              responded_at: nowIso,
            })
            .where(eq(rosterVersionShifts.id, s.id));
        }
      }
    }

    // Recompute overall snapshot status based on all shifts for this user in this version
    const updatedShifts = await db
      .select()
      .from(rosterVersionShifts)
      .where(
        and(
          eq(rosterVersionShifts.roster_version_id, snapshot.roster_version_id),
          eq(rosterVersionShifts.user_id, req.user!.id)
        )
      );

    let overallStatus = 'acknowledged';
    let conflictReason: string | null = null;
    let conflictNote: string | null = null;

    if (updatedShifts.length > 0) {
      const hasConflict = updatedShifts.some((s) => s.response_status === 'conflict');
      const hasPending = updatedShifts.some((s) => s.response_status === 'pending');

      if (hasConflict) {
        overallStatus = 'conflict';
        const conflictShift = updatedShifts.find((s) => s.response_status === 'conflict');
        conflictReason = conflictShift?.response_reason || 'Shift conflict';
        conflictNote = conflictShift?.response_note || null;
      } else if (hasPending) {
        overallStatus = 'pending';
      } else {
        overallStatus = 'acknowledged';
      }
    }

    // Update snapshot
    await db
      .update(staffRosterSnapshots)
      .set({
        response_status: overallStatus,
        response_reason: conflictReason,
        response_note: conflictNote,
        responded_at: nowIso,
      })
      .where(eq(staffRosterSnapshots.id, snapshot_id));

    // Record in response history
    await db.insert(staffRosterResponses).values({
      id: crypto.randomUUID(),
      snapshot_id: snapshot.id,
      user_id: req.user!.id,
      shift_id: shift_id || null,
      response_status: 'acknowledged',
      reason: null,
      note: null,
      created_at: nowIso,
    });

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: shift_id ? 'SHIFT_ACKNOWLEDGED' : 'ROSTER_ACKNOWLEDGED',
      entity_type: 'staff_roster_snapshot',
      entity_id: snapshot.id,
      metadata: { shift_id: shift_id || null, overall_status: overallStatus },
      ip_address: req.ip,
    });

    return res.json({
      success: true,
      response_status: overallStatus,
      shift_id: shift_id || null,
      responded_at: nowIso,
    });
  } catch (err) {
    console.error('Acknowledge roster error:', err);
    return res.status(500).json({ error: 'Failed to acknowledge roster' });
  }
});

// POST /api/personal-roster/conflict - Report conflict on weekly roster or individual shift
personalRosterRouter.post('/conflict', async (req: Request, res: Response) => {
  try {
    const { snapshot_id, shift_id, reason, note } = req.body;

    if (!snapshot_id || !reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'snapshot_id and a valid conflict reason are required.' });
    }

    const snapshot = (
      await db
        .select()
        .from(staffRosterSnapshots)
        .where(
          and(
            eq(staffRosterSnapshots.id, snapshot_id),
            eq(staffRosterSnapshots.user_id, req.user!.id)
          )
        )
        .limit(1)
    )[0];

    if (!snapshot) {
      return res.status(404).json({ error: 'Personal roster snapshot not found' });
    }

    const nowIso = new Date().toISOString();
    let shiftInfoText = '';

    if (shift_id) {
      // Per-shift conflict
      const shift = (
        await db
          .select()
          .from(rosterVersionShifts)
          .where(
            and(
              eq(rosterVersionShifts.id, shift_id),
              eq(rosterVersionShifts.roster_version_id, snapshot.roster_version_id),
              eq(rosterVersionShifts.user_id, req.user!.id)
            )
          )
          .limit(1)
      )[0];

      if (!shift) {
        return res.status(404).json({ error: 'Shift not found' });
      }

      await db
        .update(rosterVersionShifts)
        .set({
          response_status: 'conflict',
          response_reason: reason.trim(),
          response_note: note?.trim() || null,
          responded_at: nowIso,
        })
        .where(eq(rosterVersionShifts.id, shift_id));

      shiftInfoText = ` on shift ${shift.start_datetime.substring(0, 16).replace('T', ' ')}`;
    } else {
      // Entire roster conflict
      const allShifts = await db
        .select()
        .from(rosterVersionShifts)
        .where(
          and(
            eq(rosterVersionShifts.roster_version_id, snapshot.roster_version_id),
            eq(rosterVersionShifts.user_id, req.user!.id)
          )
        );

      for (const s of allShifts) {
        await db
          .update(rosterVersionShifts)
          .set({
            response_status: 'conflict',
            response_reason: reason.trim(),
            response_note: note?.trim() || null,
            responded_at: nowIso,
          })
          .where(eq(rosterVersionShifts.id, s.id));
      }
    }

    // Update snapshot to conflict
    await db
      .update(staffRosterSnapshots)
      .set({
        response_status: 'conflict',
        response_reason: reason.trim(),
        response_note: note?.trim() || null,
        responded_at: nowIso,
      })
      .where(eq(staffRosterSnapshots.id, snapshot_id));

    // Record in response history
    await db.insert(staffRosterResponses).values({
      id: crypto.randomUUID(),
      snapshot_id: snapshot.id,
      user_id: req.user!.id,
      shift_id: shift_id || null,
      response_status: 'conflict',
      reason: reason.trim(),
      note: note?.trim() || null,
      created_at: nowIso,
    });

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: shift_id ? 'SHIFT_CONFLICT_REPORTED' : 'ROSTER_CONFLICT_REPORTED',
      entity_type: 'staff_roster_snapshot',
      entity_id: snapshot.id,
      metadata: {
        shift_id: shift_id || null,
        reason: reason.trim(),
        note: note?.trim() || null,
      },
      ip_address: req.ip,
    });

    // Notify all active managers about the conflict report
    const managers = await db.select().from(users).where(and(eq(users.role, 'manager'), eq(users.is_active, true)));
    for (const mgr of managers) {
      await createInAppNotification({
        userId: mgr.id,
        type: 'CONFLICT_REPORTED',
        title: `Shift Conflict: ${req.user!.name}`,
        body: `${req.user!.name} reported a conflict${shiftInfoText}. Reason: ${reason.trim()}`,
        relatedEntityType: 'staff_roster_snapshot',
        relatedEntityId: snapshot.id,
      });
    }

    return res.json({
      success: true,
      response_status: 'conflict',
      shift_id: shift_id || null,
      responded_at: nowIso,
    });
  } catch (err: any) {
    console.error('Report conflict error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to report conflict' });
  }
});
