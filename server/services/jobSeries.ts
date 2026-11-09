/**
 * Recurring job series: pattern math, visit generation, reconciliation and
 * series ending. Generated visits are normal jobs sitting in the Process Queue
 * (status 'ready'); the service team schedules and allocates each one.
 *
 * Generation is notification-free by design: system-created visits must not
 * spam JOB_READY_FOR_HANDOFF or JOB_NEEDS_PRICING. The only alerts are the
 * regular ones from human actions (scheduling, cancelling, ending a series).
 */
import { and, eq, gte, inArray, gt } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { jobSeries, jobs } from '../db/schema.ts';
import type { JobSeriesRecurrence } from '../../src/types/index.ts';
import {
  addDaysToDateString,
  cancelJobWithReason,
  listJobAssignmentRows,
  listJobMediaRows,
  mondayOfDateString,
  newId,
  nextJobOrderNumber,
  parseWeekdays,
  type ActorInfo,
  type JobRowWithCreator,
} from './jobs.ts';
import { logAuditEvent } from './audit.ts';
import { formatUtcToBusinessTz, getNowInBusinessTz } from './timezone.ts';

export type JobSeriesRow = typeof jobSeries.$inferSelect;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_FREQUENCIES = new Set(['daily', 'weekly', 'fortnightly']);

/** Business-local today (YYYY-MM-DD). */
export function businessToday(): string {
  return formatUtcToBusinessTz(getNowInBusinessTz(), 'yyyy-MM-dd');
}

function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** ISO weekday of a YYYY-MM-DD date: 1=Monday .. 7=Sunday. */
export function isoWeekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); // 0=Sun
  return day === 0 ? 7 : day;
}

/**
 * Pattern match for a date. For fortnightly, week parity is counted from the
 * Monday of visit 1's week (anchorMonday), which is always an "on" week.
 */
export function matchesPattern(
  pattern: { frequency: string; days_of_week: number[] },
  dateStr: string,
  anchorMonday: string,
): boolean {
  if (pattern.frequency === 'daily') return true;
  if (!pattern.days_of_week.includes(isoWeekdayOf(dateStr))) return false;
  if (pattern.frequency === 'weekly') return true;
  const weeks = Math.round(
    (Date.parse(mondayOfDateString(dateStr)) - Date.parse(anchorMonday)) / WEEK_MS,
  );
  return ((weeks % 2) + 2) % 2 === 0;
}

/**
 * Visit 1 = the first date on/after start_date matching the weekday pattern
 * (start_date itself for daily). The fortnightly parity anchor is that date's
 * own week, so week parity is not part of this first-match search.
 */
export function firstOccurrenceDate(recurrence: {
  frequency: string;
  days_of_week: number[];
  start_date: string;
}): string | null {
  for (let i = 0; i < 30; i += 1) {
    const date = addDaysToDateString(recurrence.start_date, i);
    if (recurrence.frequency === 'daily' || recurrence.days_of_week.includes(isoWeekdayOf(date))) {
      return date;
    }
  }
  return null;
}

/** Validate an API recurrence payload. Returns a normalized value or an error. */
export function parseRecurrence(raw: unknown): { value?: JobSeriesRecurrence; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: 'recurrence must be an object' };
  const body = raw as Record<string, unknown>;

  const frequency = typeof body.frequency === 'string' ? body.frequency : '';
  if (!VALID_FREQUENCIES.has(frequency)) {
    return { error: `recurrence.frequency must be one of: ${[...VALID_FREQUENCIES].join(', ')}` };
  }

  let daysOfWeek: number[] = [];
  if (body.days_of_week !== undefined && body.days_of_week !== null) {
    if (!Array.isArray(body.days_of_week)) return { error: 'recurrence.days_of_week must be an array of ISO weekdays' };
    for (const entry of body.days_of_week) {
      if (!Number.isInteger(entry) || (entry as number) < 1 || (entry as number) > 7) {
        return { error: 'recurrence.days_of_week must contain ISO weekdays 1..7' };
      }
      daysOfWeek.push(entry as number);
    }
    daysOfWeek = [...new Set(daysOfWeek)].sort((a, b) => a - b);
  }
  if (frequency !== 'daily' && daysOfWeek.length === 0) {
    return { error: 'recurrence.days_of_week is required for weekly and fortnightly repeats' };
  }
  if (frequency === 'daily') daysOfWeek = [];

  const startDate = typeof body.start_date === 'string' ? body.start_date.trim() : '';
  if (!isValidDateString(startDate)) return { error: 'recurrence.start_date must be a valid YYYY-MM-DD date' };

  const startTime = typeof body.start_time === 'string' ? body.start_time.trim() : '';
  const finishTime = typeof body.finish_time === 'string' ? body.finish_time.trim() : '';
  if (!TIME_PATTERN.test(startTime)) return { error: 'recurrence.start_time must be a valid HH:mm time' };
  if (!TIME_PATTERN.test(finishTime)) return { error: 'recurrence.finish_time must be a valid HH:mm time' };
  if (finishTime <= startTime) return { error: 'recurrence.finish_time must be after recurrence.start_time' };

  let endDate: string | null = null;
  if (body.end_date !== undefined && body.end_date !== null && body.end_date !== '') {
    if (typeof body.end_date !== 'string' || !isValidDateString(body.end_date.trim())) {
      return { error: 'recurrence.end_date must be a valid YYYY-MM-DD date' };
    }
    endDate = body.end_date.trim();
    if (endDate < startDate) return { error: 'recurrence.end_date must not be before recurrence.start_date' };
  }

  return {
    value: {
      frequency: frequency as JobSeriesRecurrence['frequency'],
      days_of_week: daysOfWeek,
      start_date: startDate,
      start_time: startTime,
      finish_time: finishTime,
      end_date: endDate,
    },
  };
}

/** Create the series row (first_job_id is attached after visit 1 is inserted). */
export async function createSeriesRow(params: {
  recurrence: JobSeriesRecurrence;
  template: SeriesTemplateFields;
  createdByUserId: string | null;
}): Promise<JobSeriesRow> {
  const nowIso = new Date().toISOString();
  const id = newId();
  await db.insert(jobSeries).values({
    id,
    status: 'pending',
    frequency: params.recurrence.frequency,
    days_of_week: JSON.stringify(params.recurrence.days_of_week),
    start_date: params.recurrence.start_date,
    end_date: params.recurrence.end_date,
    start_time: params.recurrence.start_time,
    finish_time: params.recurrence.finish_time,
    ...templateToColumns(params.template),
    created_by_user_id: params.createdByUserId,
    created_at: nowIso,
    updated_at: nowIso,
  });
  return (await db.select().from(jobSeries).where(eq(jobSeries.id, id)).limit(1))[0];
}

export async function attachFirstJob(seriesId: string, jobId: string): Promise<void> {
  await db.update(jobSeries).set({ first_job_id: jobId, updated_at: new Date().toISOString() }).where(eq(jobSeries.id, seriesId));
}

/** Template fields copied onto every generated visit. */
export interface SeriesTemplateFields {
  title: string;
  job_type: string;
  services_text: string | null;
  lead_source: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  site_contact_name: string | null;
  site_contact_phone: string | null;
  address: string;
  location_notes: string | null;
  access_notes: string | null;
  agreed_price: string | null;
}

export function templateFromJobRow(job: {
  title: string;
  job_type: string;
  services_text: string | null;
  lead_source: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  site_contact_name: string | null;
  site_contact_phone: string | null;
  address: string;
  location_notes: string | null;
  access_notes: string | null;
  agreed_price: string | null;
}): SeriesTemplateFields {
  return {
    title: job.title,
    job_type: job.job_type,
    services_text: job.services_text,
    lead_source: job.lead_source,
    customer_name: job.customer_name,
    customer_phone: job.customer_phone,
    customer_email: job.customer_email,
    site_contact_name: job.site_contact_name,
    site_contact_phone: job.site_contact_phone,
    address: job.address,
    location_notes: job.location_notes,
    access_notes: job.access_notes,
    agreed_price: job.agreed_price,
  };
}

function templateToColumns(template: SeriesTemplateFields) {
  return {
    title: template.title,
    job_type: template.job_type,
    services_text: template.services_text,
    lead_source: template.lead_source,
    customer_name: template.customer_name,
    customer_phone: template.customer_phone,
    customer_email: template.customer_email,
    site_contact_name: template.site_contact_name,
    site_contact_phone: template.site_contact_phone,
    address: template.address,
    location_notes: template.location_notes,
    access_notes: template.access_notes,
    agreed_price: template.agreed_price,
  };
}

export async function getSeriesById(id: string): Promise<JobSeriesRow | undefined> {
  return (await db.select().from(jobSeries).where(eq(jobSeries.id, id)).limit(1))[0];
}

/**
 * Activation: visit 1 reached the Process Queue, so its details are complete.
 * Copy them into the series template, flip to 'active' and generate the next
 * 14 days of visits immediately.
 */
export async function activateSeries(series: JobSeriesRow, job: Parameters<typeof templateFromJobRow>[0]): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .update(jobSeries)
    .set({ ...templateToColumns(templateFromJobRow(job)), status: 'active', updated_at: nowIso })
    .where(eq(jobSeries.id, series.id));
  const refreshed = await getSeriesById(series.id);
  if (refreshed) await generateVisitsForSeries(refreshed, businessToday());
}

/** Visit 1's occurrence date (falls back to pattern math if the job is gone). */
async function visit1Date(series: JobSeriesRow): Promise<string | null> {
  if (series.first_job_id) {
    const rows = await db
      .select({ occurrence_date: jobs.occurrence_date })
      .from(jobs)
      .where(eq(jobs.id, series.first_job_id))
      .limit(1);
    const date = rows[0]?.occurrence_date;
    if (date) return date;
  }
  return firstOccurrenceDate(series);
}

function patternOf(series: JobSeriesRow): { frequency: string; days_of_week: number[] } {
  return { frequency: series.frequency, days_of_week: parseWeekdays(series.days_of_week) };
}

/**
 * Create every missing matching visit for one series up to today + 13 days.
 * Insert-or-ignore semantics: a date is never created twice (enforced both by
 * a pre-check and by the unique index on (series_id, occurrence_date)).
 * Never throws.
 */
export async function generateVisitsForSeries(series: JobSeriesRow, today: string): Promise<void> {
  if (series.status !== 'active') return;

  const nowIso = new Date().toISOString();
  if (series.end_date && series.end_date < today) {
    await markSeriesEnded(series.id, 'End date passed', null, nowIso);
    return;
  }

  const v1Date = await visit1Date(series);
  if (!v1Date) return;
  const anchorMonday = mondayOfDateString(v1Date);

  const rangeStart = [today, addDaysToDateString(v1Date, 1)].sort().pop()!; // max
  const rangeEnd = [addDaysToDateString(today, 13), series.end_date ?? '9999-12-31'].sort()[0]; // min
  if (rangeEnd < rangeStart) return;

  const existingRows = await db
    .select({ occurrence_date: jobs.occurrence_date })
    .from(jobs)
    .where(and(eq(jobs.series_id, series.id), gte(jobs.occurrence_date, rangeStart)));
  const existing = new Set(existingRows.map((row) => row.occurrence_date));

  const template: SeriesTemplateFields = {
    title: series.title,
    job_type: series.job_type,
    services_text: series.services_text,
    lead_source: series.lead_source,
    customer_name: series.customer_name,
    customer_phone: series.customer_phone,
    customer_email: series.customer_email,
    site_contact_name: series.site_contact_name,
    site_contact_phone: series.site_contact_phone,
    address: series.address,
    location_notes: series.location_notes,
    access_notes: series.access_notes,
    agreed_price: series.agreed_price,
  };

  let lastMatching: string | null = null;
  for (let date = rangeStart; date <= rangeEnd; date = addDaysToDateString(date, 1)) {
    if (!matchesPattern(patternOf(series), date, anchorMonday)) continue;
    lastMatching = date;
    if (existing.has(date)) continue;

    const jobId = newId();
    try {
      await db
        .insert(jobs)
        .values({
          id: jobId,
          job_order_number: await nextJobOrderNumber(),
          title: template.title,
          status: 'ready',
          job_type: template.job_type,
          services: '[]',
          services_text: template.services_text,
          lead_source: template.lead_source,
          customer_name: template.customer_name,
          customer_phone: template.customer_phone,
          customer_email: template.customer_email,
          site_contact_name: template.site_contact_name,
          site_contact_phone: template.site_contact_phone,
          address: template.address,
          location_notes: template.location_notes,
          access_notes: template.access_notes,
          agreed_price: template.agreed_price,
          ready_at: nowIso,
          series_id: series.id,
          occurrence_date: date,
          created_by_user_id: null,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .onConflictDoNothing();
    } catch (err) {
      // A single bad visit must never stop the rest of the series.
      console.error(`Recurring generation failed for series ${series.id} on ${date}:`, err);
      continue;
    }

    await logAuditEvent({
      actor_user_id: null,
      actor_name: 'Recurring scheduler',
      actor_role: null,
      event_type: 'job_created',
      entity_type: 'job',
      entity_id: jobId,
      metadata: { series_id: series.id, source: 'recurring', occurrence_date: date },
      ip_address: null,
    });
  }

  await db
    .update(jobSeries)
    .set({
      ...(lastMatching ? { generated_through: lastMatching } : {}),
      updated_at: nowIso,
    })
    .where(eq(jobSeries.id, series.id));
}

async function markSeriesEnded(
  seriesId: string,
  reason: string,
  actor: ActorInfo | null,
  nowIso: string,
): Promise<void> {
  await db
    .update(jobSeries)
    .set({
      status: 'ended',
      ended_at: nowIso,
      ended_by_user_id: actor?.userId ?? null,
      end_reason: reason,
      updated_at: nowIso,
    })
    .where(eq(jobSeries.id, seriesId));
  await logAuditEvent({
    actor_user_id: actor?.userId ?? null,
    actor_name: actor?.name ?? 'Recurring scheduler',
    actor_role: actor?.role ?? null,
    event_type: 'job_series_ended',
    entity_type: 'job_series',
    entity_id: seriesId,
    metadata: { reason },
    ip_address: actor?.ipAddress ?? null,
  });
}

/**
 * End a series and clean up its not-yet-started visits with
 * occurrence_date > afterDate: untouched visits (no assignments, no media) are
 * deleted, the rest are cancelled through the standard cancel logic (reason +
 * assigned staff notified). Used by "End series" (afterDate = today - 1) and by
 * cancel scope "this and all future visits" (afterDate = the visit's date).
 * Never throws.
 */
export async function endSeries(params: {
  seriesId: string;
  reason: string;
  actor: ActorInfo;
  afterDate: string;
}): Promise<void> {
  try {
    const series = await getSeriesById(params.seriesId);
    if (!series || series.status === 'ended') return;

    const nowIso = new Date().toISOString();
    await markSeriesEnded(params.seriesId, params.reason, params.actor, nowIso);

    const future = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.series_id, params.seriesId),
          inArray(jobs.status, ['ready', 'scheduled']),
          gt(jobs.occurrence_date, params.afterDate),
        ),
      )
      .orderBy(jobs.occurrence_date);

    for (const row of future) {
      const job: JobRowWithCreator = { ...row, created_by_name: null };
      const [assignments, media] = await Promise.all([
        listJobAssignmentRows(job.id),
        listJobMediaRows(job.id),
      ]);
      if (assignments.length === 0 && media.length === 0) {
        await db.delete(jobs).where(eq(jobs.id, job.id));
        await logAuditEvent({
          actor_user_id: params.actor.userId,
          actor_name: params.actor.name,
          actor_role: params.actor.role,
          event_type: 'job_deleted',
          entity_type: 'job',
          entity_id: job.id,
          metadata: {
            series_id: params.seriesId,
            source: 'recurring',
            occurrence_date: row.occurrence_date,
            reason: params.reason,
          },
          ip_address: params.actor.ipAddress ?? null,
        });
      } else {
        await cancelJobWithReason(job, params.reason, params.actor);
      }
    }
  } catch (err) {
    console.error(`Failed to end series ${params.seriesId}:`, err);
  }
}

/**
 * Apply the (already saved) series template/pattern to its future unscheduled
 * visits, per the edit rules:
 * - date no longer matches the pattern/end date: delete when untouched, else leave as is;
 * - date still matches: refresh the copied details (incl. price);
 * - visit 1 is never deleted; while unscheduled it gets details + a recomputed
 *   occurrence_date (first date matching the new pattern).
 * Scheduled/in-progress/completed/cancelled visits are never changed.
 * Then re-run generation for active series. Never throws.
 */
export async function reconcileSeriesVisits(series: JobSeriesRow, today: string): Promise<void> {
  try {
    const pattern = patternOf(series);
    const newFirst = firstOccurrenceDate(series);
    const anchorDate = newFirst ?? (await visit1Date(series));
    const anchorMonday = anchorDate ? mondayOfDateString(anchorDate) : mondayOfDateString(today);

    // Visit 1: refresh while unscheduled; never delete.
    if (series.first_job_id && newFirst) {
      const firstRows = await db.select().from(jobs).where(eq(jobs.id, series.first_job_id)).limit(1);
      const first = firstRows[0];
      if (first && (first.status === 'awaiting_info' || first.status === 'ready') && !first.scheduled_date) {
        const taken = (
          await db
            .select({ id: jobs.id })
            .from(jobs)
            .where(and(eq(jobs.series_id, series.id), eq(jobs.occurrence_date, newFirst)))
            .limit(1)
        )[0];
        await db
          .update(jobs)
          .set({
            ...templateToColumns(templateFromJobRow(series)),
            ...(!taken ? { occurrence_date: newFirst } : {}),
            updated_at: new Date().toISOString(),
          })
          .where(eq(jobs.id, first.id));
      }
    }

    const future = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.series_id, series.id),
          eq(jobs.status, 'ready'),
          gte(jobs.occurrence_date, today),
        ),
      );

    for (const row of future) {
      if (row.id === series.first_job_id) continue; // handled above
      const matches =
        (!series.end_date || row.occurrence_date! <= series.end_date) &&
        matchesPattern(pattern, row.occurrence_date!, anchorMonday);

      const [assignments, media] = await Promise.all([
        listJobAssignmentRows(row.id),
        listJobMediaRows(row.id),
      ]);
      const untouched = assignments.length === 0 && media.length === 0;

      if (!matches) {
        if (untouched) {
          await db.delete(jobs).where(eq(jobs.id, row.id));
          await logAuditEvent({
            actor_user_id: null,
            actor_name: 'Recurring scheduler',
            actor_role: null,
            event_type: 'job_deleted',
            entity_type: 'job',
            entity_id: row.id,
            metadata: {
              series_id: series.id,
              source: 'recurring',
              occurrence_date: row.occurrence_date,
              reason: 'Series pattern changed',
            },
            ip_address: null,
          });
        }
        continue;
      }

      if (untouched) {
        await db
          .update(jobs)
          .set({ ...templateToColumns(templateFromJobRow(series)), updated_at: new Date().toISOString() })
          .where(eq(jobs.id, row.id));
      }
    }

    await generateVisitsForSeries(series, today);
  } catch (err) {
    console.error(`Failed to reconcile series ${series.id}:`, err);
  }
}

/**
 * Hourly recurring-visit generation for every active series. Each series is
 * isolated in try/catch (generateVisitsForSeries never throws); this never
 * crashes the server.
 */
export async function generateRecurringVisits(today: string): Promise<void> {
  const seriesRows = await db.select().from(jobSeries).where(eq(jobSeries.status, 'active'));
  for (const series of seriesRows) {
    try {
      await generateVisitsForSeries(series, today);
    } catch (err) {
      console.error(`Recurring generation failed for series ${series.id}:`, err);
    }
  }
}

/** Boot + hourly driver (same pattern as the media queue). */
export function startJobSeriesGenerator(intervalMs: number): void {
  const run = async () => {
    try {
      await generateRecurringVisits(businessToday());
    } catch (err) {
      console.error('Recurring generation run failed:', err);
    }
  };
  void run();
  setInterval(run, intervalMs);
}
