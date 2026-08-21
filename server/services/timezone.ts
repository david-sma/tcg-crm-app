import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import { addDays, startOfWeek, parseISO, isBefore, isAfter, isEqual } from 'date-fns';

export const TIMEZONE = 'Pacific/Auckland';

/**
 * Gets the current zoned date in Pacific/Auckland
 */
export function getNowInNZ(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

/**
 * Gets the Monday of the current week in Pacific/Auckland as YYYY-MM-DD string
 */
export function getCurrentWeekMonday(): string {
  const nowNZ = getNowInNZ();
  // startOfWeek with weekStartsOn: 1 (Monday)
  const monday = startOfWeek(nowNZ, { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd', { timeZone: TIMEZONE });
}

/**
 * Gets the Monday of a given week offset (e.g. +1 for next week, -1 for previous week)
 */
export function getOffsetWeekMonday(weekOffset: number = 0): string {
  const nowNZ = getNowInNZ();
  const baseMonday = startOfWeek(nowNZ, { weekStartsOn: 1 });
  const offsetMonday = addDays(baseMonday, weekOffset * 7);
  return format(offsetMonday, 'yyyy-MM-dd', { timeZone: TIMEZONE });
}

/**
 * Returns an array of consecutive Monday date strings starting from a given Monday for count weeks
 */
export function getConsecutiveMondays(startMondayStr: string, count: number): string[] {
  const mondays: string[] = [];
  const baseMonday = parseISO(`${startMondayStr}T12:00:00`);
  for (let i = 0; i < count; i++) {
    const nextMon = addDays(baseMonday, i * 7);
    mondays.push(format(nextMon, 'yyyy-MM-dd', { timeZone: TIMEZONE }));
  }
  return mondays;
}

/**
 * Validates whether a week string is a valid Monday in YYYY-MM-DD format
 */
export function isValidMondayDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  try {
    const zonedDate = parseISO(`${dateStr}T12:00:00`);
    const dayOfWeek = zonedDate.getDay(); // 0 is Sunday, 1 is Monday
    return dayOfWeek === 1;
  } catch {
    return false;
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
    const dateStr = format(currentDay, 'yyyy-MM-dd', { timeZone: TIMEZONE });
    const formattedDate = format(currentDay, 'd MMM', { timeZone: TIMEZONE });
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
 * Converts a Pacific/Auckland local day (Monday + dayOffset) + time (HH:mm) into a UTC Date
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
    return fromZonedTime(`${nextDayStr}T00:00:00`, TIMEZONE);
  }

  return fromZonedTime(`${effectiveDateStr}T${timeStr}:00`, TIMEZONE);
}

/**
 * Formats a UTC ISO datetime into Pacific/Auckland display strings
 */
export function formatUtcToNZ(utcIso: string | Date, formatPattern: string = 'yyyy-MM-dd HH:mm'): string {
  const date = typeof utcIso === 'string' ? parseISO(utcIso) : utcIso;
  return format(toZonedTime(date, TIMEZONE), formatPattern, { timeZone: TIMEZONE });
}

/**
 * Checks if a week date is in the past compared to current Monday in Pacific/Auckland
 */
export function isPastWeek(mondayStr: string): boolean {
  const currentMonday = getCurrentWeekMonday();
  return mondayStr < currentMonday;
}
