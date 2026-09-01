import { format, parseISO, addDays, startOfWeek } from 'date-fns';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const SHORT_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Gets current Auckland date and time components
 */
export function getNowInAuckland(): { dayOfWeek: number; hour: number; minute: number; yyyy: number; mm: number; dd: number } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

    const weekdayStr = getPart('weekday');
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const dayOfWeek = weekdayMap[weekdayStr] ?? now.getDay();
    const hour = parseInt(getPart('hour'), 10) || 0;
    const minute = parseInt(getPart('minute'), 10) || 0;
    const yyyy = parseInt(getPart('year'), 10) || now.getFullYear();
    const mm = parseInt(getPart('month'), 10) || now.getMonth() + 1;
    const dd = parseInt(getPart('day'), 10) || now.getDate();

    return { dayOfWeek, hour, minute, yyyy, mm, dd };
  } catch {
    const now = new Date();
    return {
      dayOfWeek: now.getDay(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      yyyy: now.getFullYear(),
      mm: now.getMonth() + 1,
      dd: now.getDate(),
    };
  }
}

/**
 * Calculates current Monday date string (YYYY-MM-DD) in Pacific/Auckland
 */
export function getCurrentMonday(): string {
  const { yyyy, mm, dd } = getNowInAuckland();
  const aucklandToday = parseISO(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T12:00:00`);
  const mon = startOfWeek(aucklandToday, { weekStartsOn: 1 });
  return format(mon, 'yyyy-MM-dd');
}

/**
 * Returns default active week Monday:
 * If it is Sunday at or after 3:00 PM (15:00) in Pacific/Auckland, automatically defaults to Next Week's Monday.
 * Otherwise defaults to current week's Monday.
 */
export function getDefaultActiveMonday(): string {
  const { dayOfWeek, hour } = getNowInAuckland();
  const curMonday = getCurrentMonday();
  // 0 is Sunday. At or after 15:00 (3pm), roll over to next Monday
  if (dayOfWeek === 0 && hour >= 15) {
    return getOffsetMonday(curMonday, 1);
  }
  return curMonday;
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
