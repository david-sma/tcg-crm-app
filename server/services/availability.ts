import { db } from '../db/index.ts';
import {
  availabilityReports,
  availabilityVersions,
  availabilityWindows,
  users,
} from '../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { localToUtcDatetime, getOffsetWeekMonday } from './timezone.ts';
import type { AvailabilityWindow, DayOfWeekIndex } from '../../src/types/index.ts';
import crypto from 'crypto';

export interface AbsoluteInterval {
  start: Date;
  finish: Date;
}

/**
 * Converts a set of availability windows for a given Monday into concrete UTC datetime intervals
 */
export function getAvailabilityIntervalsForWeek(
  mondayStr: string,
  windows: AvailabilityWindow[]
): AbsoluteInterval[] {
  const intervals: AbsoluteInterval[] = [];

  for (const win of windows) {
    if (win.type === 'unavailable') {
      continue;
    }

    if (win.type === 'all_day') {
      // 00:00 to 24:00 for day win.day_of_week
      const start = localToUtcDatetime(mondayStr, win.day_of_week, '00:00');
      const finish = localToUtcDatetime(mondayStr, win.day_of_week, '24:00');
      intervals.push({ start, finish });
      continue;
    }

    if (win.type === 'custom' && win.start_time && win.finish_time) {
      const isOvernight = win.is_overnight || win.finish_time < win.start_time;
      const start = localToUtcDatetime(mondayStr, win.day_of_week, win.start_time);
      const finish = localToUtcDatetime(mondayStr, win.day_of_week, win.finish_time, isOvernight);
      intervals.push({ start, finish });
    }
  }

  return intervals;
}

/**
 * Checks whether a proposed shift [shiftStart, shiftFinish] is completely contained in the staff's availability
 */
export function checkShiftAvailabilityContainment(
  shiftStart: Date,
  shiftFinish: Date,
  availabilityIntervals: AbsoluteInterval[],
  hasAvailabilityReport: boolean
): { isContained: boolean; warning?: string } {
  if (!hasAvailabilityReport) {
    return {
      isContained: false,
      warning: 'No availability report submitted for this week (Missing).',
    };
  }

  if (availabilityIntervals.length === 0) {
    return {
      isContained: false,
      warning: 'Staff reported Unavailable for this period.',
    };
  }

  // Check if shift is completely contained inside at least one availability window
  const shiftStartTime = shiftStart.getTime();
  const shiftFinishTime = shiftFinish.getTime();

  for (const interval of availabilityIntervals) {
    const intervalStartTime = interval.start.getTime();
    const intervalFinishTime = interval.finish.getTime();

    if (shiftStartTime >= intervalStartTime && shiftFinishTime <= intervalFinishTime) {
      return { isContained: true };
    }
  }

  return {
    isContained: false,
    warning: 'Shift hours are not fully contained within reported availability.',
  };
}

/**
 * Loads the latest availability report and windows for a user and week
 */
export async function getLatestUserAvailability(userId: string, mondayStr: string) {
  const reports = await db
    .select()
    .from(availabilityReports)
    .where(and(eq(availabilityReports.user_id, userId), eq(availabilityReports.week_start_date, mondayStr)))
    .limit(1);

  if (reports.length === 0 || !reports[0].latest_version_id) {
    return null;
  }

  const report = reports[0];
  const versions = await db
    .select()
    .from(availabilityVersions)
    .where(eq(availabilityVersions.id, report.latest_version_id!))
    .limit(1);

  if (versions.length === 0) return null;

  const version = versions[0];
  const windowsList = await db
    .select()
    .from(availabilityWindows)
    .where(eq(availabilityWindows.version_id, version.id));

  const typedWindows: AvailabilityWindow[] = windowsList.map((w) => ({
    id: w.id,
    day_of_week: w.day_of_week as DayOfWeekIndex,
    type: w.type as any,
    start_time: w.start_time,
    finish_time: w.finish_time,
    is_overnight: Boolean(w.is_overnight),
  }));

  return {
    report,
    version,
    windows: typedWindows,
  };
}

/**
 * Saves a new immutable version of availability
 */
export async function saveAvailabilityVersion(params: {
  userId: string;
  mondayStr: string;
  submittedByUserId: string;
  isManagerEntered?: boolean;
  managerReason?: string;
  windows: AvailabilityWindow[];
}) {
  const { userId, mondayStr, submittedByUserId, isManagerEntered = false, managerReason, windows } = params;

  // 1. Ensure report container exists
  let report = (
    await db
      .select()
      .from(availabilityReports)
      .where(and(eq(availabilityReports.user_id, userId), eq(availabilityReports.week_start_date, mondayStr)))
      .limit(1)
  )[0];

  const nowIso = new Date().toISOString();

  if (!report) {
    const reportId = crypto.randomUUID();
    await db.insert(availabilityReports).values({
      id: reportId,
      user_id: userId,
      week_start_date: mondayStr,
      created_at: nowIso,
      updated_at: nowIso,
    });
    report = (await db.select().from(availabilityReports).where(eq(availabilityReports.id, reportId)))[0];
  }

  // 2. Determine new version number
  const existingVersions = await db
    .select()
    .from(availabilityVersions)
    .where(eq(availabilityVersions.report_id, report.id))
    .orderBy(desc(availabilityVersions.version_number))
    .limit(1);

  const newVersionNumber = existingVersions.length > 0 ? existingVersions[0].version_number + 1 : 1;
  const versionId = crypto.randomUUID();

  // 3. Insert immutable version record
  await db.insert(availabilityVersions).values({
    id: versionId,
    report_id: report.id,
    version_number: newVersionNumber,
    submitted_by_user_id: submittedByUserId,
    is_manager_entered: isManagerEntered,
    manager_reason: managerReason || null,
    created_at: nowIso,
  });

  // 4. Insert windows
  for (const win of windows) {
    const winId = crypto.randomUUID();
    const isOvernight = win.is_overnight || (win.start_time && win.finish_time && win.finish_time < win.start_time) || false;

    await db.insert(availabilityWindows).values({
      id: winId,
      version_id: versionId,
      day_of_week: win.day_of_week,
      type: win.type,
      start_time: win.type === 'custom' ? win.start_time || null : null,
      finish_time: win.type === 'custom' ? win.finish_time || null : null,
      is_overnight: Boolean(isOvernight),
    });
  }

  // 5. Update report pointer and timestamp
  await db
    .update(availabilityReports)
    .set({
      latest_version_id: versionId,
      updated_at: nowIso,
    })
    .where(eq(availabilityReports.id, report.id));

  return { versionId, versionNumber: newVersionNumber };
}
