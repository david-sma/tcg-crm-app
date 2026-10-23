import crypto from 'crypto';
import { db } from '../db/index.ts';
import {
  jobAssignments,
  jobMedia,
  jobOrderCounters,
  jobs,
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
  new: ['awaiting_info', 'ready', 'cancelled'],
  awaiting_info: ['ready', 'cancelled'],
  ready: ['deal_confirmed', 'awaiting_info', 'cancelled'],
  deal_confirmed: ['scheduled', 'ready', 'cancelled'],
  scheduled: ['in_progress', 'cancelled'],
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
  /** True when the viewer is the per-job team lead (job_assignments.is_lead). */
  viewerIsLead?: boolean;
}

export async function formatJob(
  row: JobRowWithCreator,
  opts: FormatJobOptions = {},
): Promise<Job> {
  const role = opts.viewer?.role ?? null;
  const isManager = role === 'manager';
  const isOfficeRole = isManager || role === 'customer_service' || role === 'service_team';
  // Field users (staff) get the full scope only when they are the job's team lead.
  const seesFullScope = isOfficeRole || Boolean(opts.viewerIsLead);
  // Pricing is visible to managers only.
  const seesPricing = isManager;
  // Customer service owns intake only; staff/crew details belong to the service team.
  const seesCrew = role !== 'customer_service';

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

  let faultsCheckedByName: string | null = null;
  if (row.faults_damages_checked_by_user_id) {
    try {
      const checkerRows = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, row.faults_damages_checked_by_user_id))
        .limit(1);
      faultsCheckedByName = checkerRows[0]?.name ?? null;
    } catch {
      faultsCheckedByName = null;
    }
  }

  // Basic card payload: job name, location, schedule and status only.
  // Field users without the lead flag never receive customer contacts,
  // scope, access details, notes or pricing.
  const job: Job = {
    id: row.id,
    job_order_number: row.job_order_number,
    title: row.title,
    status: row.status as JobStatus,
    job_type: row.job_type,
    services: [],
    address: row.address,
    location_notes: row.location_notes,
    scheduled_date: row.scheduled_date,
    scheduled_start_time: row.scheduled_start_time,
    scheduled_finish_time: row.scheduled_finish_time,
    running_late: Boolean(row.running_late),
    late_note: row.late_note ?? null,
    faults_damages_checked: Boolean(row.faults_damages_checked),
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as Job;

  if (seesFullScope) {
    job.services = parseServices(row.services);
    job.services_text = row.services_text ?? null;
    job.lead_source = row.lead_source as LeadSource;
    job.customer_name = row.customer_name;
    job.customer_phone = row.customer_phone;
    job.customer_email = row.customer_email;
    job.site_contact_name = row.site_contact_name;
    job.site_contact_phone = row.site_contact_phone;
    job.access_notes = row.access_notes;
    job.ready_at = row.ready_at;
    job.start_notes = row.start_notes;
    job.completion_notes = row.completion_notes;
    job.faults_damages_checked_at = row.faults_damages_checked_at;
    job.faults_damages_checked_by_user_id = row.faults_damages_checked_by_user_id;
    job.faults_damages_checked_by_name = faultsCheckedByName;
    job.late_reported_at = row.late_reported_at ?? null;
    job.late_reported_by_user_id = row.late_reported_by_user_id ?? null;
    job.late_reported_by_name = lateReportedByName;
    job.started_at = row.started_at;
    job.completed_at = row.completed_at;
    job.cancelled_reason = row.cancelled_reason;
    job.cancelled_at = row.cancelled_at;
    job.created_by_user_id = row.created_by_user_id;
    job.created_by_name = row.created_by_name;
    if (seesPricing) {
      job.agreed_price = row.agreed_price;
    }
  }

  if (opts.includeAssignments && seesCrew) {
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

/** Notify every active user in the given roles; never throws. */
export async function notifyRoles(
  roles: string[],
  type: NotificationType,
  title: string,
  body: string,
  relatedEntityId?: string,
): Promise<void> {
  try {
    const recipients = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, roles), eq(users.is_active, true)));

    for (const recipient of recipients) {
      try {
        await createInAppNotification({
          userId: recipient.id,
          type,
          title,
          body,
          relatedEntityType: 'job',
          relatedEntityId,
        });
      } catch (err) {
        console.error('Failed to notify user:', err);
      }
    }
  } catch (err) {
    console.error('notifyRoles error:', err);
  }
}

/** Notify every active manager; never throws. */
export async function notifyManagers(
  type: NotificationType,
  title: string,
  body: string,
  relatedEntityId?: string,
): Promise<void> {
  await notifyRoles(['manager'], type, title, body, relatedEntityId);
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
