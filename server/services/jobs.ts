import crypto from 'crypto';
import { db } from '../db/index.ts';
import {
  jobAssignments,
  jobMedia,
  jobOrderCounters,
  jobs,
  rosterWeeks,
  staffRosterSnapshots,
  users,
} from '../db/schema.ts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type {
  Job,
  JobAssignment,
  JobMedia,
  JobMediaPhase,
  JobMediaStatus,
  JobMediaType,
  JobStatus,
  LeadSource,
} from '../../src/types/index.ts';
import { logAuditEvent } from './audit.ts';
import { createInAppNotification } from './notification.ts';

export type JobRow = typeof jobs.$inferSelect;
export type JobAssignmentRow = typeof jobAssignments.$inferSelect;
export type JobMediaRow = typeof jobMedia.$inferSelect;

export type JobRowWithCreator = JobRow & { created_by_name: string | null };

export type NotificationType = Parameters<typeof createInAppNotification>[0]['type'];

export class JobTransitionError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'JobTransitionError';
  }
}

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  new: ['enriching', 'confirmed', 'cancelled'],
  enriching: ['new', 'confirmed', 'cancelled'],
  confirmed: ['new', 'enriching', 'scheduled', 'cancelled'],
  scheduled: ['ongoing', 'in_progress', 'cancelled'],
  ongoing: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (from === to) {
    return;
  }
  const allowed = JOB_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new JobTransitionError(`Cannot change job status from '${from}' to '${to}'.`);
  }
}

/** Atomic per-year job order number: JO-YYYY-0001 */
export async function nextJobOrderNumber(): Promise<string> {
  const year = String(new Date().getFullYear());

  await db
    .insert(jobOrderCounters)
    .values({ year, last_number: 0 })
    .onConflictDoNothing();

  const rows = await db
    .update(jobOrderCounters)
    .set({ last_number: sql`last_number + 1` })
    .where(eq(jobOrderCounters.year, year))
    .returning({ last_number: jobOrderCounters.last_number });

  const next = rows[0]?.last_number ?? 1;
  return `JO-${year}-${String(next).padStart(4, '0')}`;
}

export async function getJobById(id: string): Promise<JobRowWithCreator | undefined> {
  const rows = await db
    .select({ job: jobs, created_by_name: users.name })
    .from(jobs)
    .leftJoin(users, eq(jobs.created_by_user_id, users.id))
    .where(eq(jobs.id, id))
    .limit(1);

  if (!rows[0]) {
    return undefined;
  }

  return { ...rows[0].job, created_by_name: rows[0].created_by_name ?? null };
}

export async function getJobAssignment(
  jobId: string,
  userId: string,
): Promise<JobAssignmentRow | undefined> {
  const rows = await db
    .select()
    .from(jobAssignments)
    .where(and(eq(jobAssignments.job_id, jobId), eq(jobAssignments.user_id, userId)))
    .limit(1);

  return rows[0];
}

export async function listJobAssignmentRows(jobId: string): Promise<JobAssignmentRow[]> {
  return db.select().from(jobAssignments).where(eq(jobAssignments.job_id, jobId));
}

export async function loadJobAssignments(
  jobId: string,
  onlyUserId?: string,
): Promise<JobAssignment[]> {
  const conditions = [eq(jobAssignments.job_id, jobId)];
  if (onlyUserId) {
    conditions.push(eq(jobAssignments.user_id, onlyUserId));
  }

  const rows = await db
    .select({ assignment: jobAssignments, user_name: users.name })
    .from(jobAssignments)
    .leftJoin(users, eq(jobAssignments.user_id, users.id))
    .where(and(...conditions));

  return rows.map((row) => ({
    id: row.assignment.id,
    job_id: row.assignment.job_id,
    shift_id: row.assignment.shift_id,
    user_id: row.assignment.user_id,
    user_name: row.user_name ?? undefined,
    is_lead: row.assignment.is_lead,
    created_at: row.assignment.created_at,
  }));
}

export function formatJobMedia(
  row: JobMediaRow,
  createdByName?: string | null,
): JobMedia {
  return {
    id: row.id,
    job_id: row.job_id,
    phase: row.phase as JobMediaPhase,
    media_type: row.media_type as JobMediaType,
    status: row.status as JobMediaStatus,
    url: `/api/jobs/media/${row.id}`,
    content_type: row.content_type,
    byte_size: row.byte_size,
    duration_seconds: row.duration_seconds,
    error_message: row.error_message,
    attempt_count: row.attempt_count,
    created_by_user_id: row.created_by_user_id,
    created_by_name: createdByName ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listJobMediaRows(jobId: string): Promise<
  Array<JobMediaRow & { created_by_name: string | null }>
> {
  return db
    .select({ media: jobMedia, created_by_name: users.name })
    .from(jobMedia)
    .leftJoin(users, eq(jobMedia.created_by_user_id, users.id))
    .where(eq(jobMedia.job_id, jobId))
    .orderBy(sql`${jobMedia.created_at} desc`)
    .then((rows) => rows.map((row) => ({ ...row.media, created_by_name: row.created_by_name ?? null })));
}

export async function getJobMediaById(
  mediaId: string,
): Promise<(JobMediaRow & { created_by_name: string | null }) | undefined> {
  const rows = await db
    .select({ media: jobMedia, created_by_name: users.name })
    .from(jobMedia)
    .leftJoin(users, eq(jobMedia.created_by_user_id, users.id))
    .where(eq(jobMedia.id, mediaId))
    .limit(1);

  if (!rows[0]) {
    return undefined;
  }

  return { ...rows[0].media, created_by_name: rows[0].created_by_name ?? null };
}

function parseServices(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

export interface FormatJobOptions {
  includeAssignments?: boolean;
  includeMedia?: boolean;
  viewer?: { id: string; role: string } | null;
  forStaff?: boolean;
  onlyAssignmentsForUserId?: string;
}

export async function formatJob(
  row: JobRowWithCreator,
  opts: FormatJobOptions = {},
): Promise<Job> {
  const forStaff = Boolean(opts.forStaff || (opts.viewer && opts.viewer.role !== 'manager'));

  let driverName: string | null = null;
  if (row.allocated_driver_user_id) {
    try {
      const driverRows = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, row.allocated_driver_user_id))
        .limit(1);
      driverName = driverRows[0]?.name ?? null;
    } catch {
      driverName = null;
    }
  }

  let lateReportedByName: string | null = null;
  if (row.late_reported_by_user_id) {
    try {
      const reporterRows = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, row.late_reported_by_user_id))
        .limit(1);
      lateReportedByName = reporterRows[0]?.name ?? null;
    } catch {
      lateReportedByName = null;
    }
  }

  const job: Job = {
    id: row.id,
    job_order_number: row.job_order_number,
    title: row.title,
    status: row.status as JobStatus,
    job_type: row.job_type,
    services: parseServices(row.services),
    services_text: row.services_text ?? null,
    allocated_driver_user_id: row.allocated_driver_user_id ?? null,
    driver_name: driverName,
    details: row.details,
    lead_source: row.lead_source as LeadSource,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_email: row.customer_email,
    site_contact_name: row.site_contact_name,
    site_contact_phone: row.site_contact_phone,
    address: row.address,
    suburb: row.suburb,
    city: row.city,
    postcode: row.postcode,
    location_notes: row.location_notes,
    access_notes: row.access_notes,
    scope_notes: row.scope_notes,
    agreed_price: forStaff ? undefined : row.agreed_price,
    scheduled_date: row.scheduled_date,
    scheduled_start_time: row.scheduled_start_time,
    scheduled_finish_time: row.scheduled_finish_time,
    start_notes: row.start_notes,
    completion_notes: row.completion_notes,
    running_late: Boolean(row.running_late),
    late_reported_at: row.late_reported_at ?? null,
    late_reported_by_user_id: row.late_reported_by_user_id ?? null,
    late_reported_by_name: lateReportedByName,
    late_note: row.late_note ?? null,
    started_at: row.started_at,
    completed_at: row.completed_at,
    cancelled_reason: row.cancelled_reason,
    cancelled_at: row.cancelled_at,
    created_by_user_id: row.created_by_user_id,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (opts.includeAssignments) {
    job.assignments = await loadJobAssignments(row.id, opts.onlyAssignmentsForUserId);
  }

  if (opts.includeMedia) {
    const mediaRows = await listJobMediaRows(row.id);
    job.media = mediaRows.map((mediaRow) => formatJobMedia(mediaRow, mediaRow.created_by_name));
  }

  return job;
}

/** Monday (YYYY-MM-DD) of the week containing dateStr. Week starts Monday. */
export function mondayOfDateString(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const offset = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Notify every active manager; never throws. */
export async function notifyManagers(
  type: NotificationType,
  title: string,
  body: string,
  relatedEntityId?: string,
): Promise<void> {
  try {
    const managers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'manager'), eq(users.is_active, true)));

    for (const manager of managers) {
      try {
        await createInAppNotification({
          userId: manager.id,
          type,
          title,
          body,
          relatedEntityType: 'job',
          relatedEntityId,
        });
      } catch (err) {
        console.error('Failed to notify manager:', err);
      }
    }
  } catch (err) {
    console.error('notifyManagers error:', err);
  }
}

/**
 * When every user assigned to a scheduled job has acknowledged the published
 * roster for that job's week, promote the job from 'scheduled' to 'ongoing'.
 * Never throws to callers.
 */
export async function maybePromoteJobsToOngoing(userId: string): Promise<void> {
  try {
    const assignmentRows = await db
      .select({ job_id: jobAssignments.job_id })
      .from(jobAssignments)
      .where(eq(jobAssignments.user_id, userId));

    const candidateJobIds = [...new Set(assignmentRows.map((row) => row.job_id))];
    if (candidateJobIds.length === 0) {
      return;
    }

    const candidates = await db
      .select()
      .from(jobs)
      .where(and(inArray(jobs.id, candidateJobIds), eq(jobs.status, 'scheduled')));

    for (const job of candidates) {
      if (!job.scheduled_date) {
        continue;
      }

      const assignments = await db
        .select()
        .from(jobAssignments)
        .where(eq(jobAssignments.job_id, job.id));

      const assignedUserIds = [...new Set(assignments.map((a) => a.user_id))];
      if (assignedUserIds.length === 0) {
        continue;
      }

      const weekStart = mondayOfDateString(job.scheduled_date);
      const rosterWeek = (
        await db
          .select()
          .from(rosterWeeks)
          .where(eq(rosterWeeks.week_start_date, weekStart))
          .limit(1)
      )[0];

      if (!rosterWeek?.latest_published_version_id) {
        continue;
      }

      const snapshots = await db
        .select()
        .from(staffRosterSnapshots)
        .where(eq(staffRosterSnapshots.roster_version_id, rosterWeek.latest_published_version_id));

      const acknowledgedUserIds = new Set(
        snapshots
          .filter((snapshot) => snapshot.response_status === 'acknowledged')
          .map((snapshot) => snapshot.user_id),
      );

      const allAcknowledged = assignedUserIds.every((id) => acknowledgedUserIds.has(id));
      if (!allAcknowledged) {
        continue;
      }

      const nowIso = new Date().toISOString();
      await db
        .update(jobs)
        .set({ status: 'ongoing', updated_at: nowIso })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, 'scheduled')));

      await logAuditEvent({
        actor_user_id: userId,
        event_type: 'job_status_changed',
        entity_type: 'job',
        entity_id: job.id,
        metadata: { from: 'scheduled', to: 'ongoing', trigger: 'roster_ack' },
      });

      await notifyManagers(
        'JOB_STATUS_CHANGED',
        `Job ongoing: ${job.title}`,
        `All assigned staff acknowledged their roster for job ${job.job_order_number}.`,
        job.id,
      );
    }
  } catch (err) {
    console.error('maybePromoteJobsToOngoing error:', err);
  }
}

/** Notify a single user without letting failures bubble up. */
export async function notifyUserSafe(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedEntityId?: string;
}): Promise<void> {
  try {
    await createInAppNotification({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      relatedEntityType: 'job',
      relatedEntityId: params.relatedEntityId,
    });
  } catch (err) {
    console.error('Failed to notify user:', err);
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
