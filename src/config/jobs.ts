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

export const JOB_STATUSES = [
  'new',
  'awaiting_info',
  'ready',
  'deal_confirmed',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export const JOB_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  awaiting_info: 'Awaiting Info',
  ready: 'Ready for Processing',
  deal_confirmed: 'Deal Confirmed',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
