import { Router, Request, Response } from 'express';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { jobAssignments, jobMedia, jobs, users } from '../db/schema.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { logAuditEvent } from '../services/audit.ts';
import {
  addDaysToDateString,
  assertJobTransition,
  formatJob,
  formatJobMedia,
  getJobAssignment,
  getJobById,
  getJobMediaById,
  listJobAssignmentRows,
  listJobMediaRows,
  newId,
  notifyManagers,
  notifyUserSafe,
  nextJobOrderNumber,
  type JobRowWithCreator,
} from '../services/jobs.ts';
import { kickMediaQueue } from '../services/mediaQueue.ts';
import {
  buildStorageRef,
  deleteFromStorageRef,
  getBufferFromStorage,
  getPresignedUploadUrl,
  objectExistsByRef,
} from '../services/storage.ts';
import {
  JOB_MEDIA_UPLOAD_URL_TTL_SECONDS,
  JOB_PHOTO_MAX_BYTES,
  JOB_PHOTO_MIME_TYPES,
  JOB_VIDEO_MAX_BYTES,
  JOB_VIDEO_MIME_TYPES,
} from '../../src/config/jobs.ts';
import { getCurrentWeekMonday } from '../services/timezone.ts';
import type { JobStatus, LeadSource } from '../../src/types/index.ts';

export const jobsRouter = Router();

jobsRouter.use(requireAuth);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_JOB_STATUSES = new Set<string>([
  'new',
  'enriching',
  'confirmed',
  'scheduled',
  'ongoing',
  'in_progress',
  'completed',
  'cancelled',
]);
const VALID_LEAD_SOURCES = new Set<string>([
  'manual',
  'phone',
  'facebook',
  'website',
  'referral',
  'other',
]);
const VALID_PHASES = new Set<string>(['intake', 'start', 'completion', 'other']);
const VALID_MEDIA_TYPES = new Set<string>(['photo', 'video']);
const STATUS_ENDPOINT_VALUES = new Set<string>(['new', 'enriching', 'confirmed', 'cancelled']);
const CANCELLABLE_STATUSES = new Set<string>([
  'new',
  'enriching',
  'confirmed',
  'scheduled',
  'ongoing',
  'in_progress',
]);

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
};

type Body = Record<string, unknown>;

function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function readRequiredText(body: Body, key: string): { value: string; error?: string } {
  const raw = body[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { value: '', error: `${key} is required` };
  }
  return { value: raw.trim() };
}

function readOptionalText(
  body: Body,
  key: string,
): { value?: string | null; error?: string } {
  const raw = body[key];
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: `${key} must be a string` };
  return { value: raw.trim() };
}

function readServices(raw: unknown): { value?: string[]; error?: string } {
  if (raw === undefined) return { value: undefined };
  if (!Array.isArray(raw)) return { error: 'services must be an array of service ids' };
  const values: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return { error: 'services must be an array of service ids' };
    }
    values.push(entry.trim());
  }
  return { value: values };
}

function readPrice(raw: unknown): { value?: string | null; error?: string } {
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: null };
  if (typeof raw === 'string') return { value: raw.trim() };
  if (typeof raw === 'number' && Number.isFinite(raw)) return { value: String(raw) };
  return { error: 'agreed_price must be a string' };
}

function readLeadSource(raw: unknown): { value?: LeadSource; error?: string } {
  if (raw === undefined || raw === null) return { value: undefined };
  if (typeof raw !== 'string' || !VALID_LEAD_SOURCES.has(raw)) {
    return { error: `lead_source must be one of: ${[...VALID_LEAD_SOURCES].join(', ')}` };
  }
  return { value: raw as LeadSource };
}

function hasField(body: Body, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
}

function extensionForUpload(filename: string, contentType: string): string {
  const fromName = /\.([A-Za-z0-9]{1,8})$/.exec(filename || '');
  if (fromName) {
    return fromName[1].toLowerCase();
  }
  return MIME_EXTENSIONS[contentType] || 'bin';
}

function jobNotFoundError(res: Response) {
  return res.status(404).json({ error: 'Job not found' });
}

function serverError(res: Response, context: string, err: any) {
  if (err?.status === 400) {
    return res.status(400).json({ error: err.message || 'Invalid request' });
  }
  console.error(`${context} error:`, err);
  return res.status(500).json({ error: err?.message || 'Internal server error' });
}

async function auditJob(
  req: Request,
  eventType: string,
  entityId: string,
  metadata?: Record<string, unknown> | null,
  entityType: string = 'job',
) {
  await logAuditEvent({
    actor_user_id: req.user!.id,
    actor_name: req.user!.name,
    actor_role: req.user!.role,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ?? null,
    ip_address: req.ip,
  });
}

async function loadJobOr404(req: Request, res: Response): Promise<JobRowWithCreator | null> {
  const job = await getJobById(String(req.params.id));
  if (!job) {
    jobNotFoundError(res);
    return null;
  }
  return job;
}

async function buildJobsQuery(params: {
  status?: string;
  search?: string;
  week?: string;
}): Promise<{ rows?: JobRowWithCreator[]; error?: string }> {
  const conditions: SQL[] = [];

  if (params.status !== undefined && params.status !== '') {
    const statuses = params.status
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const status of statuses) {
      if (!VALID_JOB_STATUSES.has(status)) {
        return { error: `Invalid status filter value: ${status}` };
      }
    }
    if (statuses.length > 0) {
      conditions.push(inArray(jobs.status, statuses));
    }
  }

  if (params.search !== undefined && params.search !== '') {
    const pattern = `%${params.search.trim()}%`;
    const searchCondition = or(
      ilike(jobs.title, pattern),
      ilike(jobs.customer_name, pattern),
      ilike(jobs.address, pattern),
      ilike(jobs.job_order_number, pattern),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (params.week !== undefined && params.week !== '') {
    if (!isValidDateString(params.week)) {
      return { error: 'week must be a valid YYYY-MM-DD date' };
    }
    const weekEnd = addDaysToDateString(params.week, 6);
    conditions.push(and(gte(jobs.scheduled_date, params.week), lte(jobs.scheduled_date, weekEnd))!);
  }

  const rows = await db
    .select({ job: jobs, created_by_name: users.name })
    .from(jobs)
    .leftJoin(users, eq(jobs.created_by_user_id, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${jobs.scheduled_date} asc nulls last`, desc(jobs.created_at));

  return {
    rows: rows.map((row) => ({ ...row.job, created_by_name: row.created_by_name ?? null })),
  };
}

// POST /api/jobs - Create job order (manager only)
jobsRouter.post('/', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const body: Body = req.body || {};

    const title = readRequiredText(body, 'title');
    if (title.error) return res.status(400).json({ error: title.error });

    const customerName = readRequiredText(body, 'customer_name');
    if (customerName.error) return res.status(400).json({ error: 'customer_name is required' });

    const address = readRequiredText(body, 'address');
    if (address.error) return res.status(400).json({ error: 'address is required' });

    const jobType = readOptionalText(body, 'job_type');
    if (jobType.error) return res.status(400).json({ error: jobType.error });

    const services = readServices(body.services);
    if (services.error) return res.status(400).json({ error: services.error });

    const details = readOptionalText(body, 'details');
    if (details.error) return res.status(400).json({ error: details.error });

    const leadSource = readLeadSource(body.lead_source);
    if (leadSource.error) return res.status(400).json({ error: leadSource.error });

    const optionalText: Record<string, string | null | undefined> = {};
    for (const key of [
      'customer_phone',
      'customer_email',
      'site_contact_name',
      'site_contact_phone',
      'suburb',
      'city',
      'postcode',
      'location_notes',
      'access_notes',
      'scope_notes',
    ]) {
      const result = readOptionalText(body, key);
      if (result.error) return res.status(400).json({ error: result.error });
      optionalText[key] = result.value ?? null;
    }

    const price = readPrice(body.agreed_price);
    if (price.error) return res.status(400).json({ error: price.error });

    const servicesText = readOptionalText(body, 'services_text');
    if (servicesText.error) return res.status(400).json({ error: servicesText.error });
    const servicesTextValue =
      servicesText.value === undefined || servicesText.value === null
        ? null
        : servicesText.value.trim().length > 0
          ? servicesText.value.trim()
          : null;

    let allocatedDriverUserId: string | null = null;
    const rawDriver = body.allocated_driver_user_id;
    if (rawDriver !== undefined && rawDriver !== null) {
      if (typeof rawDriver !== 'string') {
        return res.status(400).json({ error: 'Allocated driver must be an active staff member' });
      }
      const trimmedDriver = rawDriver.trim();
      if (trimmedDriver.length > 0) {
        const driverRows = await db
          .select()
          .from(users)
          .where(eq(users.id, trimmedDriver))
          .limit(1);
        const driver = driverRows[0];
        if (!driver || !driver.is_active) {
          return res.status(400).json({ error: 'Allocated driver must be an active staff member' });
        }
        allocatedDriverUserId = trimmedDriver;
      }
    }

    const id = newId();
    const nowIso = new Date().toISOString();
    const jobOrderNumber = await nextJobOrderNumber();

    await db.insert(jobs).values({
      id,
      job_order_number: jobOrderNumber,
      title: title.value,
      status: 'new',
      job_type: (jobType.value as string) ?? '',
      services: JSON.stringify(services.value ?? []),
      details: (details.value as string) ?? '',
      lead_source: leadSource.value ?? 'manual',
      customer_name: customerName.value,
      customer_phone: optionalText.customer_phone ?? null,
      customer_email: optionalText.customer_email ?? null,
      site_contact_name: optionalText.site_contact_name ?? null,
      site_contact_phone: optionalText.site_contact_phone ?? null,
      address: address.value,
      suburb: optionalText.suburb ?? null,
      city: optionalText.city ?? null,
      postcode: optionalText.postcode ?? null,
      location_notes: optionalText.location_notes ?? null,
      access_notes: optionalText.access_notes ?? null,
      scope_notes: optionalText.scope_notes ?? null,
      agreed_price: price.value ?? null,
      services_text: servicesTextValue,
      allocated_driver_user_id: allocatedDriverUserId,
      created_by_user_id: req.user!.id,
      created_at: nowIso,
      updated_at: nowIso,
    });

    await auditJob(req, 'job_created', id, {
      job_order_number: jobOrderNumber,
      title: title.value,
    });

    const created = await getJobById(id);
    const job = await formatJob(created!, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.status(201).json({ job });
  } catch (err: any) {
    return serverError(res, 'Create job', err);
  }
});

// GET /api/jobs - List jobs (manager only)
jobsRouter.get('/', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const result = await buildJobsQuery({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      week: typeof req.query.week === 'string' ? req.query.week : undefined,
    });

    if (result.error || !result.rows) {
      return res.status(400).json({ error: result.error || 'Invalid query' });
    }

    const list = [];
    for (const row of result.rows) {
      list.push(
        await formatJob(row, { includeAssignments: true, includeMedia: false, viewer: req.user }),
      );
    }

    return res.json({ jobs: list });
  } catch (err: any) {
    return serverError(res, 'List jobs', err);
  }
});

// GET /api/jobs/calendar - Jobs scheduled within a week (manager only)
jobsRouter.get('/calendar', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const week =
      typeof req.query.week === 'string' && req.query.week !== ''
        ? req.query.week
        : getCurrentWeekMonday();

    const result = await buildJobsQuery({ week });
    if (result.error || !result.rows) {
      return res.status(400).json({ error: result.error || 'Invalid query' });
    }

    const list = [];
    for (const row of result.rows) {
      list.push(
        await formatJob(row, { includeAssignments: true, includeMedia: false, viewer: req.user }),
      );
    }

    return res.json({ jobs: list });
  } catch (err: any) {
    return serverError(res, 'Jobs calendar', err);
  }
});

// GET /api/jobs/my - Jobs assigned to the caller (any authenticated user)
jobsRouter.get('/my', async (req: Request, res: Response) => {
  try {
    if (req.user!.role === 'staff') {
      return res.status(403).json({ error: 'My Jobs is available to team leaders' });
    }
    const assignmentRows = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.user_id, req.user!.id));

    const jobIds = [...new Set(assignmentRows.map((row) => row.job_id))];
    if (jobIds.length === 0) {
      return res.json({ jobs: [] });
    }

    const rows = await db
      .select({ job: jobs, created_by_name: users.name })
      .from(jobs)
      .leftJoin(users, eq(jobs.created_by_user_id, users.id))
      .where(inArray(jobs.id, jobIds))
      .orderBy(sql`${jobs.scheduled_date} asc nulls last`, desc(jobs.created_at));

    const list = [];
    for (const row of rows) {
      list.push(
        await formatJob(
          { ...row.job, created_by_name: row.created_by_name ?? null },
          {
            includeAssignments: true,
            includeMedia: false,
            forStaff: true,
            onlyAssignmentsForUserId: req.user!.id,
          },
        ),
      );
    }

    return res.json({ jobs: list });
  } catch (err: any) {
    return serverError(res, 'My jobs', err);
  }
});

// POST /api/jobs/media/upload-url - Create media row + presigned upload URL
jobsRouter.post('/media/upload-url', async (req: Request, res: Response) => {
  try {
    const body: Body = req.body || {};

    const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
    if (!jobId) {
      return res.status(400).json({ error: 'job_id is required' });
    }

    const job = await getJobById(jobId);
    if (!job) {
      return jobNotFoundError(res);
    }

    const phase = typeof body.phase === 'string' ? body.phase : '';
    if (!VALID_PHASES.has(phase)) {
      return res.status(400).json({ error: 'phase must be one of: intake, start, completion, other' });
    }

    const mediaType = typeof body.media_type === 'string' ? body.media_type : '';
    if (!VALID_MEDIA_TYPES.has(mediaType)) {
      return res.status(400).json({ error: 'media_type must be either photo or video' });
    }

    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    if (!filename) {
      return res.status(400).json({ error: 'filename is required' });
    }

    const contentType = typeof body.content_type === 'string' ? body.content_type.trim() : '';
    const allowedMimeTypes = mediaType === 'video' ? JOB_VIDEO_MIME_TYPES : JOB_PHOTO_MIME_TYPES;
    if (!allowedMimeTypes.includes(contentType)) {
      return res.status(400).json({
        error: `content_type must be one of: ${allowedMimeTypes.join(', ')}`,
      });
    }

    const byteSize = body.byte_size;
    const maxBytes = mediaType === 'video' ? JOB_VIDEO_MAX_BYTES : JOB_PHOTO_MAX_BYTES;
    if (typeof byteSize !== 'number' || !Number.isFinite(byteSize)) {
      return res.status(400).json({ error: 'byte_size must be a number' });
    }
    if (byteSize <= 0) {
      return res.status(400).json({ error: 'byte_size must be greater than 0' });
    }
    if (byteSize > maxBytes) {
      const maxMb = Math.floor(maxBytes / (1024 * 1024));
      return res.status(400).json({
        error: `File is too large. Maximum ${mediaType} size is ${maxMb}MB`,
      });
    }

    if (req.user!.role !== 'manager') {
      const assignment = await getJobAssignment(job.id, req.user!.id);
      if (!assignment) {
        return res.status(403).json({ error: 'You are not assigned to this job' });
      }
      if (phase === 'intake') {
        return res.status(403).json({ error: 'Only managers can upload intake media' });
      }
    }

    const mediaId = newId();
    const nowIso = new Date().toISOString();
    const extension = extensionForUpload(filename, contentType);
    const key = `job-media/${job.id}/${mediaId}-original.${extension}`;
    const originalRef = buildStorageRef(key);

    await db.insert(jobMedia).values({
      id: mediaId,
      job_id: job.id,
      phase,
      media_type: mediaType,
      status: 'uploading',
      original_ref: originalRef,
      content_type: contentType,
      byte_size: Math.round(byteSize),
      attempt_count: 0,
      created_by_user_id: req.user!.id,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const uploadUrl = await getPresignedUploadUrl({
      key,
      contentType,
      ttlSeconds: JOB_MEDIA_UPLOAD_URL_TTL_SECONDS,
    });

    return res.json({ media_id: mediaId, upload_url: uploadUrl });
  } catch (err: any) {
    return serverError(res, 'Request job media upload', err);
  }
});

// POST /api/jobs/media/:mediaId/complete - Mark upload complete and enqueue processing
jobsRouter.post('/media/:mediaId/complete', async (req: Request, res: Response) => {
  try {
    const media = await getJobMediaById(String(req.params.mediaId));
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (req.user!.role !== 'manager' && media.created_by_user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to complete this media upload' });
    }

    if (!media.original_ref || !(await objectExistsByRef(media.original_ref))) {
      return res.status(404).json({ error: 'Uploaded file not found in storage' });
    }

    const nowIso = new Date().toISOString();
    await db
      .update(jobMedia)
      .set({ status: 'queued', updated_at: nowIso })
      .where(eq(jobMedia.id, media.id));

    kickMediaQueue();

    await auditJob(req, 'job_media_uploaded', media.id, {
      job_id: media.job_id,
      phase: media.phase,
      media_type: media.media_type,
    }, 'job_media');

    const updated = await getJobMediaById(media.id);
    return res.json({ media: formatJobMedia(updated!, updated!.created_by_name) });
  } catch (err: any) {
    return serverError(res, 'Complete job media upload', err);
  }
});

// GET /api/jobs/:jobId/media - List media for a job
jobsRouter.get('/:jobId/media', async (req: Request, res: Response) => {
  try {
    const job = await getJobById(String(req.params.jobId));
    if (!job) {
      return jobNotFoundError(res);
    }

    if (req.user!.role !== 'manager') {
      const assignment = await getJobAssignment(job.id, req.user!.id);
      if (!assignment) {
        return res.status(403).json({ error: 'You are not assigned to this job' });
      }
    }

    const mediaRows = await listJobMediaRows(job.id);
    return res.json({
      media: mediaRows.map((row) => formatJobMedia(row, row.created_by_name)),
    });
  } catch (err: any) {
    return serverError(res, 'List job media', err);
  }
});

// GET /api/jobs/media/:mediaId - Stream media binary
jobsRouter.get('/media/:mediaId', async (req: Request, res: Response) => {
  try {
    const media = await getJobMediaById(String(req.params.mediaId));
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const isUploader = media.created_by_user_id === req.user!.id;
    if (req.user!.role !== 'manager' && !isUploader) {
      const assignment = await getJobAssignment(media.job_id, req.user!.id);
      if (!assignment) {
        return res.status(403).json({ error: 'Not authorized to view this media' });
      }
    }

    const storageRef = media.status === 'ready' ? media.processed_ref : media.original_ref;
    if (!storageRef) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    const fileData = await getBufferFromStorage(storageRef);
    if (!fileData) {
      return res.status(404).json({ error: 'Media file not found in storage' });
    }

    const contentType =
      media.content_type ||
      (media.media_type === 'video' ? 'video/mp4' : 'image/webp');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Accept-Ranges', 'bytes');

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader));
      if (match) {
        const total = fileData.buffer.length;
        let start = match[1] ? parseInt(match[1], 10) : 0;
        let end = match[2] ? parseInt(match[2], 10) : total - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
          res.setHeader('Content-Range', `bytes */${total}`);
          return res.status(416).json({ error: 'Requested range not satisfiable' });
        }
        end = Math.min(end, total - 1);
        const slice = fileData.buffer.subarray(start, end + 1);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(slice.length));
        return res.status(206).send(slice);
      }
    }

    res.setHeader('Content-Length', String(fileData.buffer.length));
    return res.send(fileData.buffer);
  } catch (err: any) {
    return serverError(res, 'Stream job media', err);
  }
});

// DELETE /api/jobs/media/:mediaId - Delete media
jobsRouter.delete('/media/:mediaId', async (req: Request, res: Response) => {
  try {
    const media = await getJobMediaById(String(req.params.mediaId));
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (req.user!.role !== 'manager' && media.created_by_user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to delete this media' });
    }

    for (const ref of [media.original_ref, media.processed_ref]) {
      if (ref) {
        try {
          await deleteFromStorageRef(ref);
        } catch (err) {
          console.error('Failed to delete job media object:', err);
        }
      }
    }

    await db.delete(jobMedia).where(eq(jobMedia.id, media.id));

    await auditJob(req, 'job_media_deleted', media.id, {
      job_id: media.job_id,
      phase: media.phase,
      media_type: media.media_type,
    }, 'job_media');

    return res.json({ success: true });
  } catch (err: any) {
    return serverError(res, 'Delete job media', err);
  }
});

// POST /api/jobs/media/:mediaId/retry - Re-queue failed media
jobsRouter.post('/media/:mediaId/retry', async (req: Request, res: Response) => {
  try {
    const media = await getJobMediaById(String(req.params.mediaId));
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (req.user!.role !== 'manager' && media.created_by_user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to retry this media' });
    }

    if (media.status !== 'failed') {
      return res.status(409).json({ error: 'Only failed media can be retried' });
    }

    const nowIso = new Date().toISOString();
    await db
      .update(jobMedia)
      .set({ status: 'queued', error_message: null, updated_at: nowIso })
      .where(eq(jobMedia.id, media.id));

    kickMediaQueue();

    const updated = await getJobMediaById(media.id);
    return res.json({ media: formatJobMedia(updated!, updated!.created_by_name) });
  } catch (err: any) {
    return serverError(res, 'Retry job media', err);
  }
});

// GET /api/jobs/:id - Get one job (manager or assigned staff)
jobsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await loadJobOr404(req, res);
    if (!job) return;

    if (req.user!.role !== 'manager') {
      const assignment = await getJobAssignment(job.id, req.user!.id);
      if (!assignment) {
        return res.status(403).json({ error: 'You are not assigned to this job' });
      }
    }

    const formatted = await formatJob(job, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.json({ job: formatted });
  } catch (err: any) {
    return serverError(res, 'Get job', err);
  }
});

// PUT /api/jobs/:id - Partial update (manager only)
jobsRouter.put('/:id', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const job = await loadJobOr404(req, res);
    if (!job) return;

    const body: Body = req.body || {};
    const patch: Record<string, unknown> = {};

    if (hasField(body, 'title')) {
      const value = readRequiredText(body, 'title');
      if (value.error) return res.status(400).json({ error: 'title cannot be empty' });
      patch.title = value.value;
    }

    if (hasField(body, 'customer_name')) {
      const value = readRequiredText(body, 'customer_name');
      if (value.error) return res.status(400).json({ error: 'customer_name cannot be empty' });
      patch.customer_name = value.value;
    }

    if (hasField(body, 'address')) {
      const value = readRequiredText(body, 'address');
      if (value.error) return res.status(400).json({ error: 'address cannot be empty' });
      patch.address = value.value;
    }

    if (hasField(body, 'job_type')) {
      const value = readOptionalText(body, 'job_type');
      if (value.error) return res.status(400).json({ error: value.error });
      patch.job_type = value.value ?? '';
    }

    if (hasField(body, 'details')) {
      const value = readOptionalText(body, 'details');
      if (value.error) return res.status(400).json({ error: value.error });
      patch.details = value.value ?? '';
    }

    if (hasField(body, 'services')) {
      const value = readServices(body.services);
      if (value.error) return res.status(400).json({ error: value.error });
      patch.services = JSON.stringify(value.value ?? []);
    }

    if (hasField(body, 'lead_source')) {
      const value = readLeadSource(body.lead_source);
      if (value.error) return res.status(400).json({ error: value.error });
      patch.lead_source = value.value ?? 'manual';
    }

    for (const key of [
      'customer_phone',
      'customer_email',
      'site_contact_name',
      'site_contact_phone',
      'suburb',
      'city',
      'postcode',
      'location_notes',
      'access_notes',
      'scope_notes',
    ]) {
      if (hasField(body, key)) {
        const value = readOptionalText(body, key);
        if (value.error) return res.status(400).json({ error: value.error });
        patch[key] = value.value ?? null;
      }
    }

    if (hasField(body, 'agreed_price')) {
      const value = readPrice(body.agreed_price);
      if (value.error) return res.status(400).json({ error: value.error });
      patch.agreed_price = value.value ?? null;
    }

    if (hasField(body, 'services_text')) {
      const value = readOptionalText(body, 'services_text');
      if (value.error) return res.status(400).json({ error: value.error });
      patch.services_text =
        value.value === undefined || value.value === null
          ? null
          : value.value.trim().length > 0
            ? value.value.trim()
            : null;
    }

    if (hasField(body, 'allocated_driver_user_id')) {
      const rawDriver = body.allocated_driver_user_id;
      if (rawDriver === null) {
        patch.allocated_driver_user_id = null;
      } else if (typeof rawDriver === 'string') {
        const trimmedDriver = rawDriver.trim();
        if (trimmedDriver.length === 0) {
          patch.allocated_driver_user_id = null;
        } else {
          const driverRows = await db
            .select()
            .from(users)
            .where(eq(users.id, trimmedDriver))
            .limit(1);
          const driver = driverRows[0];
          if (!driver || !driver.is_active) {
            return res.status(400).json({ error: 'Allocated driver must be an active staff member' });
          }
          patch.allocated_driver_user_id = trimmedDriver;
        }
      } else {
        return res.status(400).json({ error: 'Allocated driver must be an active staff member' });
      }
    }

    const changedFields = Object.keys(patch);
    if (changedFields.length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    patch.updated_at = new Date().toISOString();
    await db.update(jobs).set(patch).where(eq(jobs.id, job.id));

    await auditJob(req, 'job_updated', job.id, { fields: changedFields });

    const updated = await getJobById(job.id);
    const formatted = await formatJob(updated!, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.json({ job: formatted });
  } catch (err: any) {
    return serverError(res, 'Update job', err);
  }
});

// POST /api/jobs/:id/status - Pipeline status transitions (manager only)
jobsRouter.post('/:id/status', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const job = await loadJobOr404(req, res);
    if (!job) return;

    const body: Body = req.body || {};
    const status = typeof body.status === 'string' ? body.status : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!STATUS_ENDPOINT_VALUES.has(status)) {
      return res.status(400).json({
        error: `status must be one of: ${[...STATUS_ENDPOINT_VALUES].join(', ')}`,
      });
    }

    const fromStatus = job.status as JobStatus;
    const nowIso = new Date().toISOString();

    if (status === 'cancelled') {
      if (!CANCELLABLE_STATUSES.has(fromStatus)) {
        return res.status(400).json({ error: `Cannot cancel a job that is ${fromStatus}` });
      }
      if (reason.length === 0) {
        return res.status(400).json({ error: 'A cancellation reason is required' });
      }

      await db
        .update(jobs)
        .set({
          status: 'cancelled',
          cancelled_reason: reason,
          cancelled_at: nowIso,
          updated_at: nowIso,
        })
        .where(eq(jobs.id, job.id));

      await auditJob(req, 'job_status_changed', job.id, {
        from: fromStatus,
        to: 'cancelled',
        reason,
      });

      const assigned = await listJobAssignmentRows(job.id);
      for (const assignment of assigned) {
        await notifyUserSafe({
          userId: assignment.user_id,
          type: 'JOB_STATUS_CHANGED',
          title: `Job cancelled: ${job.title}`,
          body: `Job ${job.job_order_number} at ${job.address} was cancelled. Reason: ${reason}`,
          relatedEntityId: job.id,
        });
      }
    } else {
      assertJobTransition(fromStatus, status as JobStatus);

      await db
        .update(jobs)
        .set({ status, updated_at: nowIso })
        .where(eq(jobs.id, job.id));

      await auditJob(req, 'job_status_changed', job.id, {
        from: fromStatus,
        to: status,
        reason: reason || null,
      });
    }

    const updated = await getJobById(job.id);
    const formatted = await formatJob(updated!, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.json({ job: formatted });
  } catch (err: any) {
    return serverError(res, 'Change job status', err);
  }
});

// POST /api/jobs/:id/schedule - Schedule visit and (re)assign staff (manager only)
jobsRouter.post('/:id/schedule', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const job = await loadJobOr404(req, res);
    if (!job) return;

    const body: Body = req.body || {};
    const scheduledDate = typeof body.scheduled_date === 'string' ? body.scheduled_date.trim() : '';
    const startTime =
      typeof body.scheduled_start_time === 'string' ? body.scheduled_start_time.trim() : '';
    const finishTime =
      typeof body.scheduled_finish_time === 'string' ? body.scheduled_finish_time.trim() : '';

    if (!isValidDateString(scheduledDate)) {
      return res.status(400).json({ error: 'scheduled_date must be a valid YYYY-MM-DD date' });
    }
    if (!TIME_PATTERN.test(startTime)) {
      return res.status(400).json({ error: 'scheduled_start_time must be in HH:mm format' });
    }
    if (!TIME_PATTERN.test(finishTime)) {
      return res.status(400).json({ error: 'scheduled_finish_time must be in HH:mm format' });
    }
    if (finishTime <= startTime) {
      return res.status(400).json({
        error: 'scheduled_finish_time must be after scheduled_start_time (overnight jobs are not supported)',
      });
    }

    const rawAssignments = body.assignments;
    if (!Array.isArray(rawAssignments) || rawAssignments.length === 0) {
      return res.status(400).json({ error: 'assignments must be a non-empty array' });
    }

    const requested: Array<{ user_id: string; shift_id: string | null; is_lead: boolean }> = [];
    const seenUserIds = new Set<string>();
    for (const entry of rawAssignments) {
      const record: Body = entry && typeof entry === 'object' ? (entry as Body) : {};
      const userId = typeof record.user_id === 'string' ? record.user_id.trim() : '';
      if (!userId) {
        return res.status(400).json({ error: 'Each assignment requires a user_id' });
      }
      if (seenUserIds.has(userId)) {
        return res.status(400).json({ error: 'Duplicate user_id in assignments' });
      }
      seenUserIds.add(userId);

      let shiftId: string | null = null;
      if (record.shift_id !== undefined && record.shift_id !== null) {
        if (typeof record.shift_id !== 'string' || record.shift_id.trim().length === 0) {
          return res.status(400).json({ error: 'shift_id must be a non-empty string' });
        }
        shiftId = record.shift_id.trim();
      }

      requested.push({
        user_id: userId,
        shift_id: shiftId,
        is_lead: record.is_lead === true,
      });
    }

    const assigneeRows = await db
      .select()
      .from(users)
      .where(inArray(users.id, [...seenUserIds]));

    const assigneeMap = new Map(assigneeRows.map((row) => [row.id, row]));
    for (const userId of seenUserIds) {
      const assignee = assigneeMap.get(userId);
      if (!assignee) {
        return res.status(400).json({ error: `Assigned user not found: ${userId}` });
      }
      if (!assignee.is_active) {
        return res.status(400).json({
          error: `Assigned user is not active: ${assignee.name}`,
        });
      }
    }

    const currentStatus = job.status as JobStatus;
    if (currentStatus !== 'confirmed' && currentStatus !== 'scheduled') {
      return res.status(400).json({ error: 'Confirm the deal before scheduling' });
    }

    if (!requested.some((assignment) => assignment.is_lead)) {
      requested[0].is_lead = true;
    }

    const nowIso = new Date().toISOString();
    const existing = await listJobAssignmentRows(job.id);
    const existingByUser = new Map(existing.map((row) => [row.user_id, row]));

    for (const assignment of requested) {
      const match = existingByUser.get(assignment.user_id);
      if (match) {
        await db
          .update(jobAssignments)
          .set({ shift_id: assignment.shift_id, is_lead: assignment.is_lead })
          .where(eq(jobAssignments.id, match.id));
      } else {
        await db.insert(jobAssignments).values({
          id: newId(),
          job_id: job.id,
          shift_id: assignment.shift_id,
          user_id: assignment.user_id,
          is_lead: assignment.is_lead,
          created_at: nowIso,
        });
      }
    }

    for (const row of existing) {
      if (!seenUserIds.has(row.user_id)) {
        await db.delete(jobAssignments).where(eq(jobAssignments.id, row.id));
      }
    }

    assertJobTransition(currentStatus, 'scheduled');

    await db
      .update(jobs)
      .set({
        scheduled_date: scheduledDate,
        scheduled_start_time: startTime,
        scheduled_finish_time: finishTime,
        status: 'scheduled',
        updated_at: nowIso,
      })
      .where(eq(jobs.id, job.id));

    const notificationBody =
      `You have been assigned to "${job.title}" on ${scheduledDate} ` +
      `from ${startTime} to ${finishTime} at ${job.address}.`;

    for (const assignment of requested) {
      await notifyUserSafe({
        userId: assignment.user_id,
        type: 'JOB_ASSIGNED',
        title: `New job assigned: ${job.title}`,
        body: notificationBody,
        relatedEntityId: job.id,
      });
    }

    if (job.allocated_driver_user_id && !seenUserIds.has(job.allocated_driver_user_id)) {
      const driverRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, job.allocated_driver_user_id))
        .limit(1);
      if (driverRows[0]) {
        await notifyUserSafe({
          userId: job.allocated_driver_user_id,
          type: 'JOB_ASSIGNED',
          title: `New job assigned: ${job.title}`,
          body: notificationBody,
          relatedEntityId: job.id,
        });
      }
    }

    await auditJob(req, 'job_scheduled', job.id, {
      scheduled_date: scheduledDate,
      scheduled_start_time: startTime,
      scheduled_finish_time: finishTime,
      assigned_user_ids: requested.map((assignment) => assignment.user_id),
    });

    const updated = await getJobById(job.id);
    const formatted = await formatJob(updated!, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.json({ job: formatted });
  } catch (err: any) {
    return serverError(res, 'Schedule job', err);
  }
});

// DELETE /api/jobs/:id/assignments/:assignmentId - Remove one assignment (manager only)
jobsRouter.delete(
  '/:id/assignments/:assignmentId',
  requireRole('manager'),
  async (req: Request, res: Response) => {
    try {
      const job = await loadJobOr404(req, res);
      if (!job) return;

      const assignmentId = String(req.params.assignmentId);
      const assignment = (
        await db
          .select()
          .from(jobAssignments)
          .where(and(eq(jobAssignments.id, assignmentId), eq(jobAssignments.job_id, job.id)))
          .limit(1)
      )[0];

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      await db.delete(jobAssignments).where(eq(jobAssignments.id, assignment.id));

      await auditJob(req, 'job_assignment_removed', job.id, {
        assignment_id: assignment.id,
        user_id: assignment.user_id,
      });

      const formatted = await formatJob(job, {
        includeAssignments: true,
        includeMedia: true,
        viewer: req.user,
      });

      return res.json({ job: formatted });
    } catch (err: any) {
      return serverError(res, 'Remove job assignment', err);
    }
  },
);

async function assertExecutionAccess(
  req: Request,
  res: Response,
  job: JobRowWithCreator,
): Promise<boolean> {
  const assignment = await getJobAssignment(job.id, req.user!.id);
  if (!assignment) {
    res.status(403).json({ error: 'You are not assigned to this job' });
    return false;
  }
  if (!assignment.is_lead && req.user!.role !== 'manager') {
    res.status(403).json({ error: 'Only the lead or a manager can do this' });
    return false;
  }
  return true;
}

// POST /api/jobs/:id/start - Start execution (assigned lead or manager)
jobsRouter.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const job = await loadJobOr404(req, res);
    if (!job) return;

    if (!(await assertExecutionAccess(req, res, job))) return;

    const currentStatus = job.status as JobStatus;
    if (currentStatus !== 'scheduled' && currentStatus !== 'ongoing') {
      return res.status(409).json({
        error: `Job cannot be started from status '${currentStatus}'`,
      });
    }

    const body: Body = req.body || {};
    const rawNotes = body.notes;
    if (rawNotes !== undefined && rawNotes !== null && typeof rawNotes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string' });
    }
    const startNotes = typeof rawNotes === 'string' && rawNotes.trim().length > 0 ? rawNotes.trim() : null;

    const nowIso = new Date().toISOString();
    await db
      .update(jobs)
      .set({
        status: 'in_progress',
        started_at: nowIso,
        start_notes: startNotes,
        updated_at: nowIso,
      })
      .where(eq(jobs.id, job.id));

    await auditJob(req, 'job_started', job.id, {
      from: currentStatus,
      to: 'in_progress',
      notes: startNotes,
    });

    await notifyManagers(
      'JOB_STARTED',
      `Job started: ${job.title}`,
      `${req.user!.name} started job ${job.job_order_number} at ${job.address}.`,
      job.id,
    );

    const updated = await getJobById(job.id);
    const formatted = await formatJob(updated!, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.json({ job: formatted });
  } catch (err: any) {
    return serverError(res, 'Start job', err);
  }
});

// POST /api/jobs/:id/complete - Complete execution (assigned lead or manager)
jobsRouter.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const job = await loadJobOr404(req, res);
    if (!job) return;

    if (!(await assertExecutionAccess(req, res, job))) return;

    const currentStatus = job.status as JobStatus;
    if (currentStatus !== 'in_progress') {
      return res.status(409).json({
        error: `Job cannot be completed from status '${currentStatus}'`,
      });
    }

    const body: Body = req.body || {};
    const rawNotes = body.notes;
    if (rawNotes !== undefined && rawNotes !== null && typeof rawNotes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string' });
    }
    const completionNotes =
      typeof rawNotes === 'string' && rawNotes.trim().length > 0 ? rawNotes.trim() : null;

    const nowIso = new Date().toISOString();
    const wasFlaggedLate = Boolean(job.running_late);
    await db
      .update(jobs)
      .set(
        wasFlaggedLate
          ? {
              status: 'completed',
              completed_at: nowIso,
              completion_notes: completionNotes,
              running_late: false,
              updated_at: nowIso,
            }
          : {
              status: 'completed',
              completed_at: nowIso,
              completion_notes: completionNotes,
              updated_at: nowIso,
            },
      )
      .where(eq(jobs.id, job.id));

    await auditJob(req, 'job_completed', job.id, {
      from: currentStatus,
      to: 'completed',
      notes: completionNotes,
    });

    if (wasFlaggedLate) {
      await auditJob(req, 'job_late_cleared', job.id);
    }

    await notifyManagers(
      'JOB_COMPLETED',
      `Job completed: ${job.title}`,
      `${req.user!.name} completed job ${job.job_order_number} at ${job.address}.`,
      job.id,
    );

    const updated = await getJobById(job.id);
    const formatted = await formatJob(updated!, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.json({ job: formatted });
  } catch (err: any) {
    return serverError(res, 'Complete job', err);
  }
});

// POST /api/jobs/:id/running-late - Flag job as running late (assigned lead or manager)
jobsRouter.post('/:id/running-late', async (req: Request, res: Response) => {
  try {
    const job = await loadJobOr404(req, res);
    if (!job) return;

    if (!(await assertExecutionAccess(req, res, job))) return;

    const currentStatus = job.status as JobStatus;
    if (currentStatus !== 'ongoing' && currentStatus !== 'in_progress') {
      return res.status(409).json({
        error: `Job cannot be flagged as running late from status '${currentStatus}'`,
      });
    }

    const body: Body = req.body || {};
    const rawNote = body.note;
    if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') {
      return res.status(400).json({ error: 'note must be a string' });
    }
    const lateNote =
      typeof rawNote === 'string' && rawNote.trim().length > 0 ? rawNote.trim() : null;

    const nowIso = new Date().toISOString();
    await db
      .update(jobs)
      .set({
        running_late: true,
        late_reported_at: nowIso,
        late_reported_by_user_id: req.user!.id,
        late_note: lateNote,
        updated_at: nowIso,
      })
      .where(eq(jobs.id, job.id));

    await auditJob(req, 'job_running_late', job.id, { note: lateNote });

    await notifyManagers(
      'JOB_RUNNING_LATE',
      `Job running late: ${job.title}`,
      lateNote
        ? `${req.user!.name} reported job ${job.job_order_number} at ${job.address} running late. Note: ${lateNote}`
        : `${req.user!.name} reported job ${job.job_order_number} at ${job.address} running late.`,
      job.id,
    );

    const updated = await getJobById(job.id);
    const formatted = await formatJob(updated!, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.json({ job: formatted });
  } catch (err: any) {
    return serverError(res, 'Flag job running late', err);
  }
});

// POST /api/jobs/:id/clear-late - Clear running-late flag (manager only)
jobsRouter.post('/:id/clear-late', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const job = await loadJobOr404(req, res);
    if (!job) return;

    const nowIso = new Date().toISOString();
    await db
      .update(jobs)
      .set({ running_late: false, updated_at: nowIso })
      .where(eq(jobs.id, job.id));

    await auditJob(req, 'job_late_cleared', job.id);

    const updated = await getJobById(job.id);
    const formatted = await formatJob(updated!, {
      includeAssignments: true,
      includeMedia: true,
      viewer: req.user,
    });

    return res.json({ job: formatted });
  } catch (err: any) {
    return serverError(res, 'Clear job late flag', err);
  }
});
