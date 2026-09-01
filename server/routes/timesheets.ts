import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import {
  users,
  shiftReports,
  weeklyTimesheets,
  rosterWeeks,
  rosterVersions,
  rosterVersionShifts,
} from '../db/schema.ts';
import { eq, and, desc, inArray } from 'drizzle-orm';
import {
  getCurrentWeekMonday,
  isValidMondayDate,
  snapToMonday,
  getNowInNZ,
  TIMEZONE,
  getWeekDays,
  localToUtcDatetime,
  formatUtcToNZ,
} from '../services/timezone.ts';
import {
  calculateNetWorkedMinutes,
  recalculateWeeklyTimesheet,
  findScheduledShiftAndTeammates,
} from '../services/timesheet.ts';
import { logAuditEvent } from '../services/audit.ts';
import { createInAppNotification } from '../services/notification.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { uploadShiftPhoto, getPhotoBufferFromGCS } from '../services/storage.ts';
import { seedMockTimesheetData } from '../services/seed.ts';
import { parseISO, startOfWeek, addDays } from 'date-fns';
import { toZonedTime, format as formatZoned } from 'date-fns-tz';
import crypto from 'crypto';

export const timesheetsRouter = Router();

timesheetsRouter.use(requireAuth);

// Helper to get today's date string (YYYY-MM-DD) in NZ time
function getTodayDateNZ(): string {
  const nowNZ = getNowInNZ();
  return formatZoned(nowNZ, 'yyyy-MM-dd', { timeZone: TIMEZONE });
}

// Helper to format shift report and expose secure photo endpoints
function formatReportForResponse(report: any) {
  if (!report) return null;
  return {
    ...report,
    clock_in_photo: report.clock_in_photo
      ? report.clock_in_photo.startsWith('data:image/')
        ? report.clock_in_photo
        : `/api/timesheets/photo/${report.id}/clock-in`
      : null,
    clock_out_photo: report.clock_out_photo
      ? report.clock_out_photo.startsWith('data:image/')
        ? report.clock_out_photo
        : `/api/timesheets/photo/${report.id}/clock-out`
      : null,
    worked_with: typeof report.worked_with === 'string' ? JSON.parse(report.worked_with || '[]') : report.worked_with || [],
  };
}

// GET /api/timesheets/today - Get current user's today shift status
timesheetsRouter.get('/today', async (req: Request, res: Response) => {
  try {
    const todayDate = getTodayDateNZ();
    const currentMonday = getCurrentWeekMonday();
    const userId = req.user!.id;

    // Find any reports for today (or in-progress reports)
    const reports = await db
      .select()
      .from(shiftReports)
      .where(and(eq(shiftReports.user_id, userId), eq(shiftReports.shift_date, todayDate)))
      .orderBy(desc(shiftReports.created_at));

    // Also check if there is an in-progress report from yesterday (overnight edge case)
    const inProgressReport = (
      await db
        .select()
        .from(shiftReports)
        .where(and(eq(shiftReports.user_id, userId), eq(shiftReports.status, 'in_progress')))
        .limit(1)
    )[0];

    const activeReport = inProgressReport || (reports.length > 0 ? reports[0] : null);

    // Find today's scheduled roster shift and suggested teammates
    const { scheduledShift, suggestedCoworkers } = await findScheduledShiftAndTeammates(
      userId,
      todayDate,
      currentMonday
    );

    // Fetch all active staff names for selector
    const activeStaff = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.is_active, true), eq(users.role, 'staff')));

    const parsedActiveReport = activeReport ? formatReportForResponse(activeReport) : null;

    return res.json({
      today_date: todayDate,
      current_monday: currentMonday,
      active_report: parsedActiveReport,
      scheduled_shift: scheduledShift,
      suggested_coworkers: suggestedCoworkers,
      all_staff_names: activeStaff.map((s) => s.name).filter((n) => n !== req.user!.name),
    });
  } catch (err) {
    console.error('Get today timesheet status error:', err);
    return res.status(500).json({ error: 'Failed to retrieve today status' });
  }
});

// POST /api/timesheets/clock-in - Staff clock in
timesheetsRouter.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const { photo, type = 'base_arrival', location } = req.body;
    const userId = req.user!.id;
    const nowNZ = getNowInNZ();
    const todayDate = getTodayDateNZ();
    const currentMonday = getCurrentWeekMonday();
    const dayOfWeek = (nowNZ.getDay() + 6) % 7; // 0=Mon, 6=Sun
    const nowIso = new Date().toISOString();

    // Check if there is already an active shift in progress
    const existingInProgress = (
      await db
        .select()
        .from(shiftReports)
        .where(and(eq(shiftReports.user_id, userId), eq(shiftReports.status, 'in_progress')))
        .limit(1)
    )[0];

    if (existingInProgress) {
      return res.status(400).json({ error: 'You already have an active shift in progress. Please finish it before clocking in again.' });
    }

    // Find linked scheduled shift if one exists
    const { scheduledShift } = await findScheduledShiftAndTeammates(userId, todayDate, currentMonday);

    const reportId = crypto.randomUUID();

    // Upload clock-in photo to Google Cloud Storage (or fallback to local buffer)
    let storedClockInPhoto = null;
    if (photo) {
      storedClockInPhoto = await uploadShiftPhoto({
        userId,
        shiftDate: todayDate,
        photoType: 'clock_in',
        base64Data: photo,
      });
    }

    await db.insert(shiftReports).values({
      id: reportId,
      user_id: userId,
      roster_version_shift_id: scheduledShift?.id || null,
      shift_date: todayDate,
      week_start_date: currentMonday,
      day_of_week: dayOfWeek,
      clock_in_at: nowIso,
      clock_in_photo: storedClockInPhoto,
      clock_in_type: type,
      clock_in_location: location || (type === 'base_arrival' ? 'Main Office / Base' : 'First Job Site'),
      break_minutes: 0,
      status: 'in_progress',
      total_worked_minutes: 0,
      created_at: nowIso,
      updated_at: nowIso,
    });

    await logAuditEvent({
      actor_user_id: userId,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'SHIFT_CLOCK_IN',
      entity_type: 'shift_report',
      entity_id: reportId,
      metadata: { shift_date: todayDate, type, has_photo: Boolean(photo) },
      ip_address: req.ip,
    });

    // Notify managers
    const managers = await db.select().from(users).where(and(eq(users.role, 'manager'), eq(users.is_active, true)));
    for (const mgr of managers) {
      await createInAppNotification({
        userId: mgr.id,
        type: 'SHIFT_STARTED',
        title: `Clock In: ${req.user!.name}`,
        body: `${req.user!.name} clocked in for shift on ${todayDate} (${type === 'base_arrival' ? 'Base Arrival' : 'First Job'}).`,
        relatedEntityType: 'shift_report',
        relatedEntityId: reportId,
      });
    }

    const createdReport = (await db.select().from(shiftReports).where(eq(shiftReports.id, reportId)))[0];

    return res.json({
      success: true,
      report: formatReportForResponse(createdReport),
    });
  } catch (err: any) {
    console.error('Clock in error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to clock in' });
  }
});

// POST /api/timesheets/clock-out - Staff clock out & submit daily report
timesheetsRouter.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const {
      report_id,
      photo,
      type = 'closing_shift',
      location,
      break_minutes = 0,
      worked_with = [],
      notes,
    } = req.body;

    const userId = req.user!.id;
    const nowIso = new Date().toISOString();

    // Find the report to clock out
    let report = null;
    if (report_id) {
      report = (
        await db
          .select()
          .from(shiftReports)
          .where(and(eq(shiftReports.id, report_id), eq(shiftReports.user_id, userId)))
          .limit(1)
      )[0];
    } else {
      report = (
        await db
          .select()
          .from(shiftReports)
          .where(and(eq(shiftReports.user_id, userId), eq(shiftReports.status, 'in_progress')))
          .orderBy(desc(shiftReports.created_at))
          .limit(1)
      )[0];
    }

    if (!report) {
      return res.status(404).json({ error: 'No active shift found to clock out.' });
    }

    const netMinutes = calculateNetWorkedMinutes(report.clock_in_at, nowIso, Number(break_minutes) || 0);

    const workedWithArray = Array.isArray(worked_with) ? worked_with : [];

    // Upload clock-out photo to Google Cloud Storage
    let storedClockOutPhoto = report.clock_out_photo;
    if (photo) {
      storedClockOutPhoto = await uploadShiftPhoto({
        userId,
        shiftDate: report.shift_date,
        photoType: 'clock_out',
        base64Data: photo,
      });
    }

    await db
      .update(shiftReports)
      .set({
        clock_out_at: nowIso,
        clock_out_photo: storedClockOutPhoto,
        clock_out_type: type,
        clock_out_location: location || (type === 'closing_shift' ? 'Base / Closing Shift' : 'Last Job Site'),
        break_minutes: Number(break_minutes) || 0,
        worked_with: JSON.stringify(workedWithArray),
        staff_notes: notes?.trim() || null,
        status: 'completed',
        total_worked_minutes: netMinutes,
        updated_at: nowIso,
      })
      .where(eq(shiftReports.id, report.id));

    // Recalculate weekly timesheet totals
    await recalculateWeeklyTimesheet(userId, report.week_start_date);

    await logAuditEvent({
      actor_user_id: userId,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'SHIFT_CLOCK_OUT',
      entity_type: 'shift_report',
      entity_id: report.id,
      metadata: {
        shift_date: report.shift_date,
        total_worked_minutes: netMinutes,
        break_minutes: Number(break_minutes) || 0,
        worked_with: workedWithArray,
      },
      ip_address: req.ip,
    });

    const updatedReport = (await db.select().from(shiftReports).where(eq(shiftReports.id, report.id)))[0];

    return res.json({
      success: true,
      report: formatReportForResponse(updatedReport),
    });
  } catch (err: any) {
    console.error('Clock out error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to clock out' });
  }
});

// GET /api/timesheets/my-week - Full weekly paper-sheet format for logged in staff
timesheetsRouter.get('/my-week', async (req: Request, res: Response) => {
  try {
    const rawWeek = (req.query.week as string) || '';
    const week = rawWeek ? (isValidMondayDate(rawWeek) ? rawWeek : snapToMonday(rawWeek)) : getCurrentWeekMonday();

    const userId = req.user!.id;
    const weekDays = getWeekDays(week);

    // Fetch shift reports for this user in this week
    const reports = await db
      .select()
      .from(shiftReports)
      .where(and(eq(shiftReports.user_id, userId), eq(shiftReports.week_start_date, week)))
      .orderBy(shiftReports.day_of_week);

    const reportByDate = new Map<string, any>();
    for (const r of reports) {
      reportByDate.set(r.shift_date, formatReportForResponse(r));
    }

    // Fetch scheduled roster shifts for this user in this week
    let scheduledShiftsByDate = new Map<string, any>();
    try {
      const rosterWeek = (
        await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, week)).limit(1)
      )[0];

      if (rosterWeek && rosterWeek.latest_published_version_id) {
        const vShifts = await db
          .select()
          .from(rosterVersionShifts)
          .where(
            and(
              eq(rosterVersionShifts.roster_version_id, rosterWeek.latest_published_version_id),
              eq(rosterVersionShifts.user_id, userId)
            )
          );

        for (const s of vShifts) {
          try {
            const dateObj = typeof s.start_datetime === 'string' ? parseISO(s.start_datetime) : new Date(s.start_datetime);
            const sDate = formatZoned(toZonedTime(dateObj, TIMEZONE), 'yyyy-MM-dd', {
              timeZone: TIMEZONE,
            });
            scheduledShiftsByDate.set(sDate, s);
          } catch (dateErr) {
            console.warn('Error formatting shift date:', dateErr);
          }
        }
      }
    } catch (rosterErr) {
      console.warn('Error fetching roster for timesheet:', rosterErr);
    }

    // Fetch weeklyTimesheet record
    const sheet = (
      await db
        .select()
        .from(weeklyTimesheets)
        .where(and(eq(weeklyTimesheets.user_id, userId), eq(weeklyTimesheets.week_start_date, week)))
        .limit(1)
    )[0];

    const days = weekDays.map((d) => {
      const rep = reportByDate.get(d.dateStr) || null;
      const sched = scheduledShiftsByDate.get(d.dateStr) || null;
      return {
        date: d.dateStr,
        day_of_week: d.dayIndex,
        day_name: d.dayName,
        short_day: d.shortName,
        formatted_date: d.formattedDate,
        report: rep,
        scheduled_shift: sched,
      };
    });

    // Compute total logged hours
    let totalMinutes = 0;
    for (const r of reports) {
      if (r.clock_in_at && (r.clock_out_at || r.manager_override_finish_at)) {
        const effectiveStart = r.manager_override_start_at || r.clock_in_at;
        const effectiveFinish = r.manager_override_finish_at || r.clock_out_at!;
        const effectiveBreak =
          r.manager_override_break_minutes !== null && r.manager_override_break_minutes !== undefined
            ? r.manager_override_break_minutes
            : r.break_minutes;
        totalMinutes += calculateNetWorkedMinutes(effectiveStart, effectiveFinish, effectiveBreak);
      }
    }

    const totalHoursStr = (totalMinutes / 60).toFixed(2);

    return res.json({
      week_start_date: week,
      employee_name: req.user!.name,
      employee_phone: req.user!.phone_e164,
      days,
      timesheet: sheet || {
        id: null,
        user_id: userId,
        week_start_date: week,
        staff_signed_name: null,
        staff_signed_at: null,
        supervisor_signed_name: null,
        supervisor_signed_at: null,
        status: 'draft',
        total_worked_hours: totalHoursStr,
      },
      total_worked_hours: totalHoursStr,
      has_completed_shifts: reports.some((r) => r.status !== 'in_progress'),
    });
  } catch (err) {
    console.error('Get my week timesheet error:', err);
    return res.status(500).json({ error: 'Failed to retrieve weekly timesheet' });
  }
});

// POST /api/timesheets/sign-week - Staff 1-tap sign-off on the weekly sheet
timesheetsRouter.post('/sign-week', async (req: Request, res: Response) => {
  try {
    const rawWeek = req.body.week_start_date;
    const week_start_date = rawWeek ? (isValidMondayDate(rawWeek) ? rawWeek : snapToMonday(rawWeek)) : getCurrentWeekMonday();

    const userId = req.user!.id;
    const nowIso = new Date().toISOString();

    // Ensure totals are fresh
    const { hoursStr } = await recalculateWeeklyTimesheet(userId, week_start_date);

    const existing = (
      await db
        .select()
        .from(weeklyTimesheets)
        .where(and(eq(weeklyTimesheets.user_id, userId), eq(weeklyTimesheets.week_start_date, week_start_date)))
        .limit(1)
    )[0];

    let sheetId = existing?.id;

    if (existing) {
      await db
        .update(weeklyTimesheets)
        .set({
          staff_signed_name: req.user!.name,
          staff_signed_at: nowIso,
          status: 'submitted',
          total_worked_hours: hoursStr,
          updated_at: nowIso,
        })
        .where(eq(weeklyTimesheets.id, existing.id));
    } else {
      sheetId = crypto.randomUUID();
      await db.insert(weeklyTimesheets).values({
        id: sheetId,
        user_id: userId,
        week_start_date,
        staff_signed_name: req.user!.name,
        staff_signed_at: nowIso,
        status: 'submitted',
        total_worked_hours: hoursStr,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    await logAuditEvent({
      actor_user_id: userId,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'TIMESHEET_STAFF_SIGNED',
      entity_type: 'weekly_timesheet',
      entity_id: sheetId!,
      metadata: { week_start_date, total_worked_hours: hoursStr },
      ip_address: req.ip,
    });

    // Notify managers
    const managers = await db.select().from(users).where(and(eq(users.role, 'manager'), eq(users.is_active, true)));
    for (const mgr of managers) {
      await createInAppNotification({
        userId: mgr.id,
        type: 'TIMESHEET_SUBMITTED',
        title: `Timesheet Submitted: ${req.user!.name}`,
        body: `${req.user!.name} confirmed and signed their weekly timesheet for ${week_start_date} (${hoursStr} hrs).`,
        relatedEntityType: 'weekly_timesheet',
        relatedEntityId: sheetId!,
      });
    }

    return res.json({
      success: true,
      signed_name: req.user!.name,
      signed_at: nowIso,
      status: 'submitted',
    });
  } catch (err: any) {
    console.error('Sign week timesheet error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to sign timesheet' });
  }
});

// ==========================================
// MANAGER-ONLY ENDPOINTS
// ==========================================

// GET /api/timesheets/live-duty - Get list of staff currently on duty
timesheetsRouter.get('/live-duty', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const todayDate = getTodayDateNZ();
    const currentMonday = getCurrentWeekMonday();

    const activeReports = await db
      .select({
        id: shiftReports.id,
        user_id: shiftReports.user_id,
        user_name: users.name,
        user_phone: users.phone_e164,
        shift_date: shiftReports.shift_date,
        clock_in_at: shiftReports.clock_in_at,
        clock_in_photo: shiftReports.clock_in_photo,
        clock_in_type: shiftReports.clock_in_type,
        clock_in_location: shiftReports.clock_in_location,
        status: shiftReports.status,
      })
      .from(shiftReports)
      .innerJoin(users, eq(shiftReports.user_id, users.id))
      .where(eq(shiftReports.status, 'in_progress'))
      .orderBy(shiftReports.clock_in_at);

    const formattedStaff = activeReports.map((r) => ({
      ...r,
      clock_in_photo: r.clock_in_photo
        ? r.clock_in_photo.startsWith('data:image/')
          ? r.clock_in_photo
          : `/api/timesheets/photo/${r.id}/clock-in`
        : null,
    }));

    return res.json({
      today_date: todayDate,
      active_count: activeReports.length,
      on_duty_staff: formattedStaff,
    });
  } catch (err) {
    console.error('Get live duty error:', err);
    return res.status(500).json({ error: 'Failed to retrieve live duty staff' });
  }
});

// GET /api/timesheets/manager-week - Weekly timesheets overview across all staff
timesheetsRouter.get('/manager-week', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const rawWeek = (req.query.week as string) || '';
    const week = rawWeek ? (isValidMondayDate(rawWeek) ? rawWeek : snapToMonday(rawWeek)) : getCurrentWeekMonday();

    const activeStaff = await db
      .select({
        id: users.id,
        name: users.name,
        phone_e164: users.phone_e164,
        notes: users.notes,
      })
      .from(users)
      .where(and(eq(users.is_active, true), eq(users.role, 'staff')))
      .orderBy(users.name);

    // Fetch all shift reports for this week
    const allReports = await db
      .select()
      .from(shiftReports)
      .where(eq(shiftReports.week_start_date, week));

    const reportsByUser = new Map<string, any[]>();
    for (const r of allReports) {
      const list = reportsByUser.get(r.user_id) || [];
      let parsedCoworkers: any[] = [];
      if (typeof r.worked_with === 'string') {
        try {
          parsedCoworkers = JSON.parse(r.worked_with);
        } catch {
          parsedCoworkers = [];
        }
      } else if (Array.isArray(r.worked_with)) {
        parsedCoworkers = r.worked_with;
      }
      list.push({
        ...r,
        worked_with: parsedCoworkers,
      });
      reportsByUser.set(r.user_id, list);
    }

    // Fetch all published roster shifts for this week to compute scheduled hours
    const rosterWeek = (
      await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, week)).limit(1)
    )[0];

    const scheduledMinutesByUser = new Map<string, number>();
    if (rosterWeek && rosterWeek.latest_published_version_id) {
      const publishedShifts = await db
        .select()
        .from(rosterVersionShifts)
        .where(eq(rosterVersionShifts.roster_version_id, rosterWeek.latest_published_version_id));

      for (const s of publishedShifts) {
        try {
          const startMs = new Date(s.start_datetime).getTime();
          const finishMs = new Date(s.finish_datetime).getTime();
          const durationMins = Math.max(0, Math.round((finishMs - startMs) / (1000 * 60)));
          const current = scheduledMinutesByUser.get(s.user_id) || 0;
          scheduledMinutesByUser.set(s.user_id, current + durationMins);
        } catch (dateErr) {
          console.warn('Error calculating scheduled shift duration:', dateErr);
        }
      }
    }

    // Fetch weekly timesheet submission records
    const allSheets = await db
      .select()
      .from(weeklyTimesheets)
      .where(eq(weeklyTimesheets.week_start_date, week));

    const sheetByUser = new Map<string, any>();
    for (const sh of allSheets) {
      sheetByUser.set(sh.user_id, sh);
    }

    const staffSummaries = activeStaff.map((staff) => {
      const userReports = reportsByUser.get(staff.id) || [];
      const userSheet = sheetByUser.get(staff.id) || null;

      // Calculate total worked minutes
      let totalWorkedMinutes = 0;
      for (const r of userReports) {
        if (r.clock_in_at && (r.clock_out_at || r.manager_override_finish_at)) {
          const effectiveStart = r.manager_override_start_at || r.clock_in_at;
          const effectiveFinish = r.manager_override_finish_at || r.clock_out_at!;
          const effectiveBreak =
            r.manager_override_break_minutes !== null && r.manager_override_break_minutes !== undefined
              ? r.manager_override_break_minutes
              : r.break_minutes || 0;
          totalWorkedMinutes += calculateNetWorkedMinutes(effectiveStart, effectiveFinish, effectiveBreak);
        }
      }

      const scheduledMins = scheduledMinutesByUser.get(staff.id) || 0;
      const loggedHours = (totalWorkedMinutes / 60).toFixed(2);
      const scheduledHours = (scheduledMins / 60).toFixed(2);
      const varianceHours = ((totalWorkedMinutes - scheduledMins) / 60).toFixed(2);

      return {
        user_id: staff.id,
        name: staff.name,
        phone_e164: staff.phone_e164,
        notes: staff.notes,
        shifts_count: userReports.length,
        completed_shifts_count: userReports.filter((r) => r.status !== 'in_progress').length,
        has_in_progress: userReports.some((r) => r.status === 'in_progress'),
        total_worked_hours: loggedHours,
        total_scheduled_hours: scheduledHours,
        variance_hours: varianceHours,
        status: userSheet?.status || (userReports.length > 0 ? 'draft' : 'no_activity'),
        staff_signed_name: userSheet?.staff_signed_name || null,
        staff_signed_at: userSheet?.staff_signed_at || null,
        supervisor_signed_name: userSheet?.supervisor_signed_name || null,
        supervisor_signed_at: userSheet?.supervisor_signed_at || null,
        timesheet_id: userSheet?.id || null,
      };
    });

    const summary = {
      total_staff: activeStaff.length,
      submitted: staffSummaries.filter((s) => s.status === 'submitted').length,
      approved: staffSummaries.filter((s) => s.status === 'approved').length,
      draft_or_in_progress: staffSummaries.filter((s) => s.status === 'draft' || s.has_in_progress).length,
      total_logged_hours: staffSummaries.reduce((sum, s) => sum + parseFloat(s.total_worked_hours), 0).toFixed(2),
    };

    return res.json({
      week_start_date: week,
      summary,
      staff_timesheets: staffSummaries,
    });
  } catch (err) {
    console.error('Get manager week timesheets error:', err);
    return res.status(500).json({ error: 'Failed to retrieve manager timesheet overview' });
  }
});

// GET /api/timesheets/staff-sheet - Specific staff member's detailed Mon-Sun sheet for manager inspection
timesheetsRouter.get('/staff-sheet', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const rawWeek = (req.query.week as string) || '';
    const week = rawWeek ? (isValidMondayDate(rawWeek) ? rawWeek : snapToMonday(rawWeek)) : getCurrentWeekMonday();

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const staff = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    const weekDays = getWeekDays(week);

    // Fetch shift reports
    const reports = await db
      .select()
      .from(shiftReports)
      .where(and(eq(shiftReports.user_id, userId), eq(shiftReports.week_start_date, week)))
      .orderBy(shiftReports.day_of_week);

    const reportByDate = new Map<string, any>();
    for (const r of reports) {
      reportByDate.set(r.shift_date, formatReportForResponse(r));
    }

    // Fetch scheduled roster shifts
    const scheduledShiftsByDate = new Map<string, any>();
    try {
      const rosterWeek = (
        await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, week)).limit(1)
      )[0];

      if (rosterWeek && rosterWeek.latest_published_version_id) {
        const vShifts = await db
          .select()
          .from(rosterVersionShifts)
          .where(
            and(
              eq(rosterVersionShifts.roster_version_id, rosterWeek.latest_published_version_id),
              eq(rosterVersionShifts.user_id, userId)
            )
          );

        for (const s of vShifts) {
          try {
            const dateObj = typeof s.start_datetime === 'string' ? parseISO(s.start_datetime) : new Date(s.start_datetime);
            const sDate = formatZoned(toZonedTime(dateObj, TIMEZONE), 'yyyy-MM-dd', {
              timeZone: TIMEZONE,
            });
            scheduledShiftsByDate.set(sDate, s);
          } catch (dateErr) {
            console.warn('Error formatting scheduled shift date:', dateErr);
          }
        }
      }
    } catch (rosterErr) {
      console.warn('Error fetching roster for staff sheet:', rosterErr);
    }

    // Fetch timesheet record
    const sheet = (
      await db
        .select()
        .from(weeklyTimesheets)
        .where(and(eq(weeklyTimesheets.user_id, userId), eq(weeklyTimesheets.week_start_date, week)))
        .limit(1)
    )[0];

    const days = weekDays.map((d) => {
      return {
        date: d.dateStr,
        day_of_week: d.dayIndex,
        day_name: d.dayName,
        short_day: d.shortName,
        formatted_date: d.formattedDate,
        report: reportByDate.get(d.dateStr) || null,
        scheduled_shift: scheduledShiftsByDate.get(d.dateStr) || null,
      };
    });

    let totalMinutes = 0;
    for (const r of reports) {
      if (r.clock_in_at && (r.clock_out_at || r.manager_override_finish_at)) {
        const effectiveStart = r.manager_override_start_at || r.clock_in_at;
        const effectiveFinish = r.manager_override_finish_at || r.clock_out_at!;
        const effectiveBreak =
          r.manager_override_break_minutes !== null && r.manager_override_break_minutes !== undefined
            ? r.manager_override_break_minutes
            : r.break_minutes;
        totalMinutes += calculateNetWorkedMinutes(effectiveStart, effectiveFinish, effectiveBreak);
      }
    }

    const totalHoursStr = (totalMinutes / 60).toFixed(2);

    return res.json({
      week_start_date: week,
      staff: {
        id: staff.id,
        name: staff.name,
        phone_e164: staff.phone_e164,
      },
      days,
      timesheet: sheet || {
        id: null,
        user_id: userId,
        week_start_date: week,
        staff_signed_name: null,
        staff_signed_at: null,
        supervisor_signed_name: null,
        supervisor_signed_at: null,
        status: 'draft',
        total_worked_hours: totalHoursStr,
      },
      total_worked_hours: totalHoursStr,
    });
  } catch (err) {
    console.error('Get staff sheet error:', err);
    return res.status(500).json({ error: 'Failed to retrieve staff timesheet' });
  }
});

// POST /api/timesheets/manager-approve - Supervisor 1-tap approval signature
timesheetsRouter.post('/manager-approve', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const { user_id, manager_notes } = req.body;
    const rawWeek = req.body.week_start_date;
    const week_start_date = rawWeek ? (isValidMondayDate(rawWeek) ? rawWeek : snapToMonday(rawWeek)) : getCurrentWeekMonday();

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const nowIso = new Date().toISOString();
    const { hoursStr } = await recalculateWeeklyTimesheet(user_id, week_start_date);

    const existing = (
      await db
        .select()
        .from(weeklyTimesheets)
        .where(and(eq(weeklyTimesheets.user_id, user_id), eq(weeklyTimesheets.week_start_date, week_start_date)))
        .limit(1)
    )[0];

    let sheetId = existing?.id;

    if (existing) {
      await db
        .update(weeklyTimesheets)
        .set({
          supervisor_signed_name: req.user!.name,
          supervisor_signed_at: nowIso,
          supervisor_id: req.user!.id,
          status: 'approved',
          total_worked_hours: hoursStr,
          manager_notes: manager_notes?.trim() || existing.manager_notes,
          updated_at: nowIso,
        })
        .where(eq(weeklyTimesheets.id, existing.id));
    } else {
      sheetId = crypto.randomUUID();
      await db.insert(weeklyTimesheets).values({
        id: sheetId,
        user_id,
        week_start_date,
        supervisor_signed_name: req.user!.name,
        supervisor_signed_at: nowIso,
        supervisor_id: req.user!.id,
        status: 'approved',
        total_worked_hours: hoursStr,
        manager_notes: manager_notes?.trim() || null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    // Mark shift reports for that week as manager_approved (if completed)
    await db
      .update(shiftReports)
      .set({
        status: 'manager_approved',
        updated_at: nowIso,
      })
      .where(
        and(
          eq(shiftReports.user_id, user_id),
          eq(shiftReports.week_start_date, week_start_date),
          eq(shiftReports.status, 'completed')
        )
      );

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'TIMESHEET_SUPERVISOR_APPROVED',
      entity_type: 'weekly_timesheet',
      entity_id: sheetId!,
      metadata: { target_user_id: user_id, week_start_date, total_hours: hoursStr },
      ip_address: req.ip,
    });

    // Notify the staff member
    await createInAppNotification({
      userId: user_id,
      type: 'TIMESHEET_APPROVED',
      title: 'Timesheet Approved',
      body: `Your supervisor ${req.user!.name} approved your timesheet for ${week_start_date} (${hoursStr} paid hours).`,
      relatedEntityType: 'weekly_timesheet',
      relatedEntityId: sheetId!,
    });

    return res.json({
      success: true,
      supervisor_signed_name: req.user!.name,
      supervisor_signed_at: nowIso,
      status: 'approved',
    });
  } catch (err: any) {
    console.error('Manager approve timesheet error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to approve timesheet' });
  }
});

// POST /api/timesheets/manager-override - Manager modifies start/finish/break on a shift
timesheetsRouter.post('/manager-override', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const {
      report_id,
      override_start_time, // "HH:mm" in NZ local
      override_finish_time, // "HH:mm" in NZ local
      override_break_minutes, // number (0, 15, 30, 45, 60)
      reason,
    } = req.body;

    if (!report_id || !reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'report_id and an override reason are required.' });
    }

    const report = (await db.select().from(shiftReports).where(eq(shiftReports.id, report_id)).limit(1))[0];
    if (!report) {
      return res.status(404).json({ error: 'Shift report not found.' });
    }

    const nowIso = new Date().toISOString();

    let startIso = report.clock_in_at;
    let finishIso = report.clock_out_at || nowIso;

    if (override_start_time) {
      const startUtc = localToUtcDatetime(report.week_start_date, report.day_of_week, override_start_time);
      startIso = startUtc.toISOString();
    }

    if (override_finish_time) {
      const isOvernight = override_start_time ? override_finish_time <= override_start_time : false;
      const finishUtc = localToUtcDatetime(report.week_start_date, report.day_of_week, override_finish_time, isOvernight);
      finishIso = finishUtc.toISOString();
    }

    const effectiveBreak =
      override_break_minutes !== undefined && override_break_minutes !== null
        ? Number(override_break_minutes)
        : report.break_minutes;

    const netMins = calculateNetWorkedMinutes(startIso, finishIso, effectiveBreak);

    await db
      .update(shiftReports)
      .set({
        manager_override_start_at: override_start_time ? startIso : report.manager_override_start_at,
        manager_override_finish_at: override_finish_time ? finishIso : report.manager_override_finish_at,
        manager_override_break_minutes:
          override_break_minutes !== undefined ? Number(override_break_minutes) : report.manager_override_break_minutes,
        manager_override_reason: reason.trim(),
        manager_overridden_by_id: req.user!.id,
        manager_overridden_at: nowIso,
        status: 'manager_overridden',
        total_worked_minutes: netMins,
        updated_at: nowIso,
      })
      .where(eq(shiftReports.id, report_id));

    // Recalculate weekly sheet
    await recalculateWeeklyTimesheet(report.user_id, report.week_start_date);

    await logAuditEvent({
      actor_user_id: req.user!.id,
      actor_name: req.user!.name,
      actor_role: req.user!.role,
      event_type: 'SHIFT_REPORT_OVERRIDDEN',
      entity_type: 'shift_report',
      entity_id: report_id,
      metadata: {
        target_user_id: report.user_id,
        override_start_time,
        override_finish_time,
        override_break_minutes,
        reason: reason.trim(),
      },
      ip_address: req.ip,
    });

    return res.json({
      success: true,
      message: 'Shift report overridden successfully',
    });
  } catch (err: any) {
    console.error('Manager override error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to override shift' });
  }
});

// GET /api/timesheets/photo/:reportId/:photoType - Authenticated streaming of shift photos from Google Cloud Storage
timesheetsRouter.get('/photo/:reportId/:photoType', async (req: Request, res: Response) => {
  try {
    const { reportId, photoType } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const report = (
      await db.select().from(shiftReports).where(eq(shiftReports.id, reportId)).limit(1)
    )[0];

    if (!report) {
      return res.status(404).json({ error: 'Shift report not found' });
    }

    // Role-based authorization: Only manager or the staff member who owns the report
    if (userRole !== 'manager' && report.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to view this photo' });
    }

    const photoRef = photoType === 'clock-out' ? report.clock_out_photo : report.clock_in_photo;

    if (!photoRef) {
      return res.status(404).json({ error: 'No photo on record for this shift' });
    }

    if (photoRef.startsWith('gcs://')) {
      const fileData = await getPhotoBufferFromGCS(photoRef);
      if (!fileData) {
        return res.status(404).json({ error: 'Photo file not found in storage bucket' });
      }

      res.setHeader('Content-Type', fileData.contentType);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.send(fileData.buffer);
    } else if (photoRef.startsWith('data:image/')) {
      const matches = photoRef.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', matches[1]);
        res.setHeader('Cache-Control', 'private, max-age=86400');
        return res.send(buffer);
      }
    }

    return res.redirect(photoRef);
  } catch (err) {
    console.error('Error fetching shift photo:', err);
    return res.status(500).json({ error: 'Failed to retrieve shift photo' });
  }
});

// POST /api/timesheets/seed-mock - Seed sample shifts and timesheets for testing (Manager only)
timesheetsRouter.post('/seed-mock', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    await seedMockTimesheetData();
    return res.json({ success: true, message: 'Mock timesheet data seeded successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to seed mock data' });
  }
});
