import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { addDays, startOfWeek, parseISO } from 'date-fns';
import { getAppSettings } from '../../src/config/appSettings.ts';

/**
 * Business timezone (from customer settings, e.g. 'Pacific/Auckland').
 * Server-side week logic is anchored to this timezone.
 */
export function getBusinessTimezone(): string {
  return getAppSettings().timezone;
}

/**
 * Gets the current zoned date in the business timezone
 */
export function getNowInBusinessTz(): Date {
  return toZonedTime(new Date(), getBusinessTimezone());
}

/**
 * Gets the Monday of the current week in the business timezone as YYYY-MM-DD string
 */
export function getCurrentWeekMonday(): string {
  const nowTz = getNowInBusinessTz();
  // startOfWeek with weekStartsOn: 1 (Monday)
  const monday = startOfWeek(nowTz, { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd', { timeZone: getBusinessTimezone() });
}

/**
 * Gets the default active week Monday.
 * If it is Sunday at or after 3:00 PM (15:00) in the business timezone,
 * returns NEXT week's Monday. Otherwise returns current week Monday.
 */
export function getDefaultActiveWeek(): string {
  const nowTz = getNowInBusinessTz();
  const dayOfWeek = nowTz.getDay(); // 0 is Sunday
  const hour = nowTz.getHours();
  if (dayOfWeek === 0 && hour >= 15) {
    return getOffsetWeekMonday(1);
  }
  return getCurrentWeekMonday();
}

/**
 * Gets the Monday of a given week offset (e.g. +1 for next week, -1 for previous week)
 */
export function getOffsetWeekMonday(weekOffset: number = 0): string {
  const nowTz = getNowInBusinessTz();
  const baseMonday = startOfWeek(nowTz, { weekStartsOn: 1 });
  const offsetMonday = addDays(baseMonday, weekOffset * 7);
  return format(offsetMonday, 'yyyy-MM-dd', { timeZone: getBusinessTimezone() });
}

/**
 * Returns an array of consecutive Monday date strings starting from a given Monday for count weeks
 */
export function getConsecutiveMondays(startMondayStr: string, count: number): string[] {
  const mondays: string[] = [];
  const baseMonday = parseISO(`${startMondayStr}T12:00:00`);
  for (let i = 0; i < count; i++) {
    const nextMon = addDays(baseMonday, i * 7);
    mondays.push(format(nextMon, 'yyyy-MM-dd', { timeZone: getBusinessTimezone() }));
  }
  return mondays;
}

/**
 * Validates whether a week string is a valid Monday in YYYY-MM-DD format
 */
export function isValidMondayDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return utcDate.getUTCDay() === 1;
  } catch {
    return false;
  }
}

/**
 * Snaps any date string (YYYY-MM-DD) to its corresponding week's Monday
 */
export function snapToMonday(dateStr?: string): string {
  if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return getCurrentWeekMonday();
  }
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const day = date.getUTCDay(); // 0 is Sun, 1 is Mon, 6 is Sat
    const diff = (day === 0 ? -6 : 1) - day;
    date.setUTCDate(date.getUTCDate() + diff);
    return date.toISOString().slice(0, 10);
  } catch {
    return getCurrentWeekMonday();
  }
}

/**
 * Returns array of 7 day info objects for a given Monday date (Monday 0 to Sunday 6)
 */
export function getWeekDays(mondayStr: string): Array<{
  dayIndex: number;
  dateStr: string;
  dayName: string;
  shortName: string;
  formattedDate: string;
}> {
  const mondayZoned = parseISO(`${mondayStr}T12:00:00`);
  const days = [];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const shortNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    const currentDay = addDays(mondayZoned, i);
    const dateStr = format(currentDay, 'yyyy-MM-dd', { timeZone: getBusinessTimezone() });
    const formattedDate = format(currentDay, 'd MMM', { timeZone: getBusinessTimezone() });
    days.push({
      dayIndex: i,
      dateStr,
      dayName: dayNames[i],
      shortName: shortNames[i],
      formattedDate,
    });
  }

  return days;
}

/**
 * Converts a business-timezone local day (Monday + dayOffset) + time (HH:mm) into a UTC Date
 * If isOvernightNextDay is true, adds 1 day to the calendar date.
 */
export function localToUtcDatetime(
  mondayStr: string,
  dayOffset: number,
  timeStr: string,
  isOvernightNextDay: boolean = false
): Date {
  const mondayDate = parseISO(`${mondayStr}T00:00:00`);
  const effectiveDay = addDays(mondayDate, dayOffset + (isOvernightNextDay ? 1 : 0));
  const effectiveDateStr = format(effectiveDay, 'yyyy-MM-dd');

  // Handle "24:00" as end of day
  if (timeStr === '24:00') {
    const nextDay = addDays(effectiveDay, 1);
    const nextDayStr = format(nextDay, 'yyyy-MM-dd');
    return fromZonedTime(`${nextDayStr}T00:00:00`, getBusinessTimezone());
  }

  return fromZonedTime(`${effectiveDateStr}T${timeStr}:00`, getBusinessTimezone());
}

/**
 * Formats a UTC ISO datetime into business-timezone display strings
 */
export function formatUtcToBusinessTz(utcIso: string | Date, formatPattern: string = 'yyyy-MM-dd HH:mm'): string {
  const date = typeof utcIso === 'string' ? parseISO(utcIso) : utcIso;
  return format(toZonedTime(date, getBusinessTimezone()), formatPattern, { timeZone: getBusinessTimezone() });
}

/**
 * Checks if a week date is in the past compared to current Monday in the business timezone
 */
export function isPastWeek(mondayStr: string): boolean {
  const currentMonday = getCurrentWeekMonday();
  return mondayStr < currentMonday;
}
