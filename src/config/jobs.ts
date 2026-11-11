import type { JobFrequency } from '../types/index.ts';

/** Job module limits & tunables (upload pipeline, media queue). */

export const JOB_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const JOB_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const JOB_VIDEO_MAX_SECONDS = 600;

export const JOB_PHOTO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const JOB_VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/3gpp', 'video/webm'];

/** Soft UI guidance only — no server-side minimums on completion photos (per product decision). */
export const COMPLETION_PHOTO_SUGGESTED = 40;
export const COMPLETION_MAX_PHOTOS = 60;

export const JOB_MEDIA_UPLOAD_URL_TTL_SECONDS = 900;

export const JOB_MEDIA_QUEUE_INTERVAL_MS = 15000;
export const JOB_MEDIA_MAX_ATTEMPTS = 3;

export const JOB_VIDEO_TARGET_MAX_EDGE_PX = 1280;
export const JOB_VIDEO_TARGET_CRF = 26;

/** Workflow time targets (dashboard chips; soft = amber warning, hard = red overdue). */
export const INTAKE_TARGET_SOFT_HOURS = 2;
export const INTAKE_TARGET_HARD_HOURS = 4;
export const PROCESS_TARGET_HOURS = 24;

/** Calendar time grid bounds (business-local) and slot geometry. */
export const CALENDAR_START_HOUR = 6;
export const CALENDAR_END_HOUR = 18;
export const CALENDAR_SLOT_MINUTES = 30;
export const CALENDAR_PX_PER_HOUR = 64;

export const JOB_STATUSES = [
  'awaiting_info',
  'ready',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export const JOB_STATUS_LABELS: Record<string, string> = {
  // Legacy values ('new', 'deal_confirmed') are kept for status history and
  // audit display only — they are no longer valid job statuses.
  new: 'New',
  deal_confirmed: 'Deal Confirmed',
  awaiting_info: 'Awaiting Info',
  ready: 'Process Queue',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Recurring series (job_series). */
export const JOB_SERIES_INTERVAL_MS = 60 * 60 * 1000; // hourly generation of upcoming visits

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'fortnightly'] as const;

export const RECURRENCE_FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
};

/** ISO weekdays 1=Monday..7=Sunday. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_ISO = [1, 2, 3, 4, 5, 6, 7] as const;

export interface RecurrenceSummaryInput {
  frequency: string;
  days_of_week: number[];
  start_time: string;
  finish_time: string;
  end_date?: string | null;
}

/** Human pattern summary, e.g. "Weekly on Tue & Thu, 09:00–11:00 · ends 30 Jan". */
export function describeRecurrence(input: RecurrenceSummaryInput): string {
  const freq = RECURRENCE_FREQUENCY_LABELS[input.frequency] ?? input.frequency;
  const days = (input.days_of_week || [])
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d - 1] ?? String(d));
  const when =
    input.frequency === 'daily'
      ? 'Every day'
      : `${freq} on ${days.length > 1 ? `${days.slice(0, -1).join(', ')} & ${days[days.length - 1]}` : days[0] ?? ''}`;
  const time = `${input.start_time}–${input.finish_time}`;
  const ends = input.end_date ? `ends ${input.end_date}` : 'never ends';
  return `${when}, ${time} · ${ends}`;
}

/** Frequency tag options for a job (data capture only — not tied to recurring series). */
export const JOB_FREQUENCIES: JobFrequency[] = ['one_off', 'weekly', 'two_weekly', 'monthly', 'custom'];

export const JOB_FREQUENCY_LABELS: Record<JobFrequency, string> = {
  one_off: 'One-off',
  weekly: 'Weekly',
  two_weekly: 'Two-weekly',
  monthly: 'Monthly',
  custom: 'Custom',
};

/** "Custom — every 3 weeks", "Weekly", or "Not set". */
export function describeJobFrequency(frequency?: string | null, note?: string | null): string {
  if (!frequency) return 'Not set';
  const label = JOB_FREQUENCY_LABELS[frequency as JobFrequency] ?? frequency;
  return frequency === 'custom' && note ? `${label} — ${note}` : label;
}
