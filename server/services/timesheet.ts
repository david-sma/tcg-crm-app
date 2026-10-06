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
import { getCurrentWeekMonday, getNowInBusinessTz, getBusinessTimezone, getWeekDays } from './timezone.ts';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { logAuditEvent } from './audit.ts';
import { createInAppNotification } from './notification.ts';
import crypto from 'crypto';

/**
 * Calculates net worked minutes from start, finish, and break
 */
export function calculateNetWorkedMinutes(
  startIso: string,
  finishIso: string,
  breakMinutes: number = 0
): number {
  try {
    const startMs = new Date(startIso).getTime();
    const finishMs = new Date(finishIso).getTime();
    if (isNaN(startMs) || isNaN(finishMs) || finishMs <= startMs) {
      return 0;
    }
    const elapsedMinutes = Math.round((finishMs - startMs) / (1000 * 60));
    return Math.max(0, elapsedMinutes - (breakMinutes || 0));
  } catch {
    return 0;
  }
}

/**
 * Recalculates total worked hours for a user's week and updates weeklyTimesheets
 */
export async function recalculateWeeklyTimesheet(userId: string, weekStartDate: string) {
  const reports = await db
    .select()
    .from(shiftReports)
    .where(and(eq(shiftReports.user_id, userId), eq(shiftReports.week_start_date, weekStartDate)));

  let totalMinutes = 0;
  for (const r of reports) {
    if (r.clock_in_at && (r.clock_out_at || r.manager_override_finish_at)) {
      const effectiveStart = r.manager_override_start_at || r.clock_in_at;
      const effectiveFinish = r.manager_override_finish_at || r.clock_out_at!;
      const effectiveBreak =
        r.manager_override_break_minutes !== null && r.manager_override_break_minutes !== undefined
          ? r.manager_override_break_minutes
          : r.break_minutes;

      const netMins = calculateNetWorkedMinutes(effectiveStart, effectiveFinish, effectiveBreak);
      totalMinutes += netMins;
    }
  }

  const hoursFloat = totalMinutes / 60;
  const hoursStr = hoursFloat.toFixed(2);
  const nowIso = new Date().toISOString();

  const existingSheet = (
    await db
      .select()
      .from(weeklyTimesheets)
      .where(and(eq(weeklyTimesheets.user_id, userId), eq(weeklyTimesheets.week_start_date, weekStartDate)))
      .limit(1)
  )[0];

  if (existingSheet) {
    await db
      .update(weeklyTimesheets)
      .set({
        total_worked_hours: hoursStr,
        updated_at: nowIso,
      })
      .where(eq(weeklyTimesheets.id, existingSheet.id));
  } else {
    await db.insert(weeklyTimesheets).values({
      id: crypto.randomUUID(),
      user_id: userId,
      week_start_date: weekStartDate,
      status: 'draft',
      total_worked_hours: hoursStr,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  return { totalMinutes, hoursStr };
}

/**
 * Finds scheduled roster shift and coworkers on the same day for a user
 */
export async function findScheduledShiftAndTeammates(userId: string, dateStr: string, mondayStr: string) {
  const rosterWeek = (
    await db.select().from(rosterWeeks).where(eq(rosterWeeks.week_start_date, mondayStr)).limit(1)
  )[0];

  if (!rosterWeek || !rosterWeek.latest_published_version_id) {
    return { scheduledShift: null, suggestedCoworkers: [] };
  }

  const versionShifts = await db
    .select()
    .from(rosterVersionShifts)
    .where(eq(rosterVersionShifts.roster_version_id, rosterWeek.latest_published_version_id));

  // Find caller's shift that falls on this date in business-local time
  const myShift = versionShifts.find((s) => {
    if (s.user_id !== userId) return false;
    const shiftDateLocal = format(toZonedTime(parseISO(s.start_datetime), getBusinessTimezone()), 'yyyy-MM-dd');
    return shiftDateLocal === dateStr;
  });

  // Find coworkers scheduled on the same date (excluding self)
  const coworkerMap = new Map<string, string>();
  for (const s of versionShifts) {
    if (s.user_id !== userId) {
      const sDate = format(toZonedTime(parseISO(s.start_datetime), getBusinessTimezone()), 'yyyy-MM-dd');
      if (sDate === dateStr) {
        coworkerMap.set(s.user_id, s.staff_name_snapshot);
      }
    }
  }

  return {
    scheduledShift: myShift || null,
    suggestedCoworkers: Array.from(coworkerMap.values()),
  };
}
