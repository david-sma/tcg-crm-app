import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { users, availabilityReports, availabilityVersions, availabilityWindows } from '../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import {
  getLatestUserAvailability,
  saveAvailabilityVersion,
} from '../services/availability.ts';
import {
  getCurrentWeekMonday,
  getOffsetWeekMonday,
  getConsecutiveMondays,
  isValidMondayDate,
  isPastWeek,
} from '../services/timezone.ts';
import { logAuditEvent } from '../services/audit.ts';
import { createInAppNotification } from '../services/notification.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import type { AvailabilityWindow } from '../../src/types/index.ts';

export const availabilityRouter = Router();

availabilityRouter.use(requireAuth);

// GET /api/availability/me - Get caller's own availability for a week
availabilityRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const week = (req.query.week as string) || getCurrentWeekMonday();
    if (!isValidMondayDate(week)) {
      return res.status(400).json({ error: 'Invalid week start date. Must be Monday (YYYY-MM-DD).' });
    }

    const avail = await getLatestUserAvailability(req.user!.id, week);
    return res.json({
      week_start_date: week,
      availability: avail,
      is_past: isPastWeek(week),
    });
  } catch (err) {
    console.error('Get my availability error:', err);
    return res.status(500).json({ error: 'Failed to retrieve availability' });
  }
});

// POST /api/availability/me - Submit or update caller's availability (supports repeating for N weeks or ongoing)
availabilityRouter.post('/me', async (req: Request, res: Response) => {
  try {
    const { week_start_date, windows, repeat_weeks } = req.body;

    if (!isValidMondayDate(week_start_date)) {
      return res.status(400).json({ error: 'Invalid week start date. Must be Monday (YYYY-MM-DD).' });
    }

    if (!Array.isArray(windows)) {
      return res.status(400).json({ error: 'Windows must be an array of day entries.' });
    }

    // Validate repeat_weeks (e.g. 1 = this week only, or ongoing up to 104 weeks ~ 2 years)
    const repeatCount = Math.max(1, Math.min(Number(repeat_weeks) || 1, 104));

    // Validate windows
    const typedWindows: AvailabilityWindow[] = windows.map((w: any) => ({
      day_of_week: Number(w.day_of_week) as any,
      type: w.type,
      start_time: w.start_time || null,
      finish_time: w.finish_time || null,
      is_overnight: Boolean(w.is_overnight),
    }));

    const mondaysToSave = getConsecutiveMondays(week_start_date, repeatCount);
    let firstResult: any = null;

    for (const monday of mondaysToSave) {
      const result = await saveAvailabilityVersion({
        userId: req.user!.id,
        mondayStr: monday,
        submittedByUserId: req.user!.id,
        isManagerEntered: false,
        windows: typedWindows,
      });

      if (!firstResult) {
        firstResult = result;
      }
    }

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'AVAILABILITY_SUBMITTED',
      entity_type: 'availability_version',
      entity_id: firstResult?.versionId,
      metadata: {
        week_start_date,
        repeat_weeks: repeatCount,
        applied_weeks_count: mondaysToSave.length,
        first_version_number: firstResult?.versionNumber,
      },
      ip_address: req.ip,
    });

    const updated = await getLatestUserAvailability(req.user!.id, week_start_date);
    return res.json({
      success: true,
      availability: updated,
      applied_weeks: mondaysToSave,
      repeat_weeks: repeatCount,
    });
  } catch (err: any) {
    console.error('Submit availability error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to submit availability' });
  }
});

// GET /api/availability/copy-previous - Get previous week's windows to prefill (does NOT save)
availabilityRouter.get('/copy-previous', async (req: Request, res: Response) => {
  try {
    const currentWeek = (req.query.week as string) || getCurrentWeekMonday();
    const userId = (req.query.userId as string) || req.user!.id;

    // Only manager can specify other userId
    if (userId !== req.user!.id && req.user!.role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!isValidMondayDate(currentWeek)) {
      return res.status(400).json({ error: 'Invalid week start date' });
    }

    // Determine previous week Monday
    const prevDate = new Date(`${currentWeek}T12:00:00`);
    prevDate.setDate(prevDate.getDate() - 7);
    const prevMondayStr = prevDate.toISOString().split('T')[0];

    const prevAvail = await getLatestUserAvailability(userId, prevMondayStr);
    if (!prevAvail || !prevAvail.windows || prevAvail.windows.length === 0) {
      return res.status(404).json({ error: 'No availability found for the previous week to copy.' });
    }

    return res.json({
      copied_from_week: prevMondayStr,
      windows: prevAvail.windows,
    });
  } catch (err) {
    console.error('Copy previous availability error:', err);
    return res.status(500).json({ error: 'Failed to copy previous week availability' });
  }
});

// GET /api/availability/overview - Manager overview of all staff for a week
availabilityRouter.get('/overview', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const week = (req.query.week as string) || getCurrentWeekMonday();
    if (!isValidMondayDate(week)) {
      return res.status(400).json({ error: 'Invalid week start date' });
    }

    const activeStaff = await db
      .select({
        id: users.id,
        name: users.name,
        phone_e164: users.phone_e164,
        is_active: users.is_active,
      })
      .from(users)
      .where(and(eq(users.role, 'staff'), eq(users.is_active, true)))
      .orderBy(users.name);

    const reportsList = await Promise.all(
      activeStaff.map(async (staff) => {
        const avail = await getLatestUserAvailability(staff.id, week);
        const isMissing = !avail || !avail.version;

        // Check if changed since review
        let isChangedSinceReview = false;
        if (avail?.report?.latest_version_id && avail.version) {
          if (!avail.report.manager_reviewed_at) {
            isChangedSinceReview = true;
          } else {
            const reviewedTime = new Date(avail.report.manager_reviewed_at).getTime();
            const versionTime = new Date(avail.version.created_at).getTime();
            isChangedSinceReview = versionTime > reviewedTime;
          }
        }

        return {
          user_id: staff.id,
          user_name: staff.name,
          user_phone: staff.phone_e164,
          week_start_date: week,
          latest_version: avail ? avail.version : null,
          windows: avail ? avail.windows : [],
          manager_reviewed_at: avail?.report?.manager_reviewed_at || null,
          is_missing: isMissing,
          is_changed_since_review: isChangedSinceReview,
        };
      })
    );

    return res.json({ week_start_date: week, staff_reports: reportsList });
  } catch (err) {
    console.error('Availability overview error:', err);
    return res.status(500).json({ error: 'Failed to retrieve availability overview' });
  }
});

// POST /api/availability/review - Manager marks availability as reviewed
availabilityRouter.post('/review', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const { user_id, week_start_date } = req.body;
    if (!user_id || !week_start_date) {
      return res.status(400).json({ error: 'user_id and week_start_date are required' });
    }

    const report = (
      await db
        .select()
        .from(availabilityReports)
        .where(and(eq(availabilityReports.user_id, user_id), eq(availabilityReports.week_start_date, week_start_date)))
        .limit(1)
    )[0];

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const nowIso = new Date().toISOString();
    await db
      .update(availabilityReports)
      .set({
        manager_reviewed_at: nowIso,
        updated_at: nowIso,
      })
      .where(eq(availabilityReports.id, report.id));

    return res.json({ success: true, manager_reviewed_at: nowIso });
  } catch (err) {
    console.error('Mark review error:', err);
    return res.status(500).json({ error: 'Failed to mark report as reviewed' });
  }
});

// POST /api/availability/on-behalf - Manager submits availability on behalf of staff (e.g. via WhatsApp)
availabilityRouter.post('/on-behalf', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const { user_id, week_start_date, reason, windows, repeat_weeks } = req.body;

    if (!user_id || !week_start_date || !reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'user_id, week_start_date, and a valid reason are required.' });
    }

    if (!isValidMondayDate(week_start_date)) {
      return res.status(400).json({ error: 'Invalid week start date. Must be Monday (YYYY-MM-DD).' });
    }

    if (!Array.isArray(windows)) {
      return res.status(400).json({ error: 'Windows must be an array.' });
    }

    const targetStaff = (await db.select().from(users).where(eq(users.id, user_id)).limit(1))[0];
    if (!targetStaff) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    const repeatCount = Math.max(1, Math.min(Number(repeat_weeks) || 1, 104));

    const typedWindows: AvailabilityWindow[] = windows.map((w: any) => ({
      day_of_week: Number(w.day_of_week) as any,
      type: w.type,
      start_time: w.start_time || null,
      finish_time: w.finish_time || null,
      is_overnight: Boolean(w.is_overnight),
    }));

    const mondaysToSave = getConsecutiveMondays(week_start_date, repeatCount);
    let firstResult: any = null;

    for (const monday of mondaysToSave) {
      const result = await saveAvailabilityVersion({
        userId: user_id,
        mondayStr: monday,
        submittedByUserId: req.user!.id,
        isManagerEntered: true,
        managerReason: reason.trim(),
        windows: typedWindows,
      });

      if (!firstResult) {
        firstResult = result;
      }
    }

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'AVAILABILITY_ENTERED_ON_BEHALF',
      entity_type: 'availability_version',
      entity_id: firstResult?.versionId,
      metadata: {
        target_staff_name: targetStaff.name,
        target_user_id: user_id,
        week_start_date,
        reason: reason.trim(),
        repeat_weeks: repeatCount,
        applied_weeks_count: mondaysToSave.length,
      },
      ip_address: req.ip,
    });

    // Notify staff member that manager updated their availability
    const durationText = repeatCount > 1 ? ` for the next ${repeatCount} weeks` : '';
    await createInAppNotification({
      userId: user_id,
      type: 'AVAILABILITY_CHANGED',
      title: `Availability Updated by Manager${durationText}`,
      body: `Your manager updated your availability starting week ${week_start_date}${durationText}. Reason: ${reason.trim()}`,
      relatedEntityType: 'availability_version',
      relatedEntityId: firstResult?.versionId,
    });

    const updated = await getLatestUserAvailability(user_id, week_start_date);
    return res.json({
      success: true,
      availability: updated,
      applied_weeks: mondaysToSave,
      repeat_weeks: repeatCount,
    });
  } catch (err: any) {
    console.error('Enter on-behalf error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to update availability on behalf' });
  }
});
