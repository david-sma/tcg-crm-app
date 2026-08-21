import { format, parseISO, addDays, startOfWeek } from 'date-fns';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const SHORT_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Calculates current Monday date string (YYYY-MM-DD)
 */
export function getCurrentMonday(): string {
  const now = new Date();
  const mon = startOfWeek(now, { weekStartsOn: 1 });
  return format(mon, 'yyyy-MM-dd');
}

/**
 * Shifts Monday by +/- offset weeks
 */
export function getOffsetMonday(baseMondayStr: string, offsetWeeks: number): string {
  const mon = parseISO(`${baseMondayStr}T12:00:00`);
  const shifted = addDays(mon, offsetWeeks * 7);
  return format(shifted, 'yyyy-MM-dd');
}

/**
 * Returns formatted week range label, e.g. "18 Aug – 24 Aug 2026"
 */
export function formatWeekRange(mondayStr: string): string {
  try {
    const monday = parseISO(`${mondayStr}T12:00:00`);
    const sunday = addDays(monday, 6);
    const startPart = format(monday, 'd MMM');
    const endPart = format(sunday, 'd MMM yyyy');
    return `${startPart} – ${endPart}`;
  } catch {
    return mondayStr;
  }
}

/**
 * Returns full date for specific day offset from Monday (0 = Mon, ..., 6 = Sun)
 */
export function getDayDateStr(mondayStr: string, dayIndex: number): string {
  try {
    const monday = parseISO(`${mondayStr}T12:00:00`);
    const target = addDays(monday, dayIndex);
    return format(target, 'EEE, d MMM');
  } catch {
    return `${DAY_NAMES[dayIndex]}`;
  }
}

/**
 * Formats ISO datetime string to Pacific/Auckland time string (HH:mm)
 */
export function formatTimeToNZ(utcIso: string): string {
  try {
    const date = parseISO(utcIso);
    return format(date, 'HH:mm');
  } catch {
    return utcIso;
  }
}

/**
 * Formats ISO datetime string to date + time
 */
export function formatDateTimeToNZ(utcIso: string): string {
  try {
    const date = parseISO(utcIso);
    return format(date, 'd MMM, HH:mm');
  } catch {
    return utcIso;
  }
}

/**
 * Calculates duration string (e.g. "8.5 hrs")
 */
export function calculateShiftDuration(startIso: string, finishIso: string): string {
  try {
    const start = new Date(startIso).getTime();
    const finish = new Date(finishIso).getTime();
    const hours = (finish - start) / (1000 * 60 * 60);
    return `${hours.toFixed(1).replace('.0', '')} hrs`;
  } catch {
    return '';
  }
}
