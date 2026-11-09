import { Router, Request, Response } from 'express';
import { and, asc, desc, eq, gte, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';
import { jobSeries, jobs } from '../../src/db/schema.ts';
import { requireAuth, requireAnyRole } from '../middleware/auth.ts';
import { logAuditEvent } from '../services/audit.ts';
import {
  addDaysToDateString,
  formatJob,
  parseWeekdays,
} from '../services/jobs.ts';
import {
  businessToday,
  endSeries,
  getSeriesById,
  parseRecurrence,
  reconcileSeriesVisits,
  type JobSeriesRow,
} from '../services/jobSeries.ts';
import type { JobSeries, JobSeriesRecurrence, LeadSource } from '../../src/types/index.ts';

export const jobSeriesRouter = Router();

jobSeriesRouter.use(requireAuth);
// Recurring series are managed by managers and customer service only.
jobSeriesRouter.use(requireAnyRole('manager', 'customer_service'));

const VALID_LEAD_SOURCES = new Set<string>(['manual', 'phone', 'facebook', 'website', 'referral', 'other']);

type Body = Record<string, unknown>;

function serverError(res: Response, context: string, err: any) {
  console.error(`${context} error:`, err);
  return res.status(500).json({ error: err?.message || 'Internal server error' });
}

async function auditSeries(
  req: Request,
  eventType: string,
  seriesId: string,
  metadata?: Record<string, unknown> | null,
) {
  await logAuditEvent({
    actor_user_id: req.user!.id,
    actor_name: req.user!.name,
    actor_role: req.user!.role,
    event_type: eventType,
    entity_type: 'job_series',
    entity_id: seriesId,
    metadata: metadata ?? null,
    ip_address: req.ip,
  });
}

/** Serialize a series row; pricing only ever reaches managers. */
function formatSeries(row: JobSeriesRow, isManager: boolean, nextVisitDate: string | null = null): JobSeries {
  return {
    id: row.id,
    status: row.status as JobSeries['status'],
    frequency: row.frequency as JobSeries['frequency'],
    days_of_week: parseWeekdays(row.days_of_week),
    start_date: row.start_date,
    end_date: row.end_date,
    start_time: row.start_time,
    finish_time: row.finish_time,
    title: row.title,
    job_type: row.job_type,
    services_text: row.services_text,
    lead_source: row.lead_source as LeadSource,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_email: row.customer_email,
    site_contact_name: row.site_contact_name,
    site_contact_phone: row.site_contact_phone,
    address: row.address,
    location_notes: row.location_notes,
    access_notes: row.access_notes,
    ...(isManager ? { agreed_price: row.agreed_price } : {}),
    first_job_id: row.first_job_id,
    generated_through: row.generated_through,
    ended_at: row.ended_at,
    ended_by_user_id: row.ended_by_user_id,
    end_reason: row.end_reason,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    next_visit_date: nextVisitDate,
  };
}

/** Next upcoming (not completed/cancelled) visit date per series. */
async function nextVisitDates(seriesIds: string[], today: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (seriesIds.length === 0) return map;
  const rows = await db
    .select({ series_id: jobs.series_id, next: sql<string>`min(${jobs.occurrence_date})` })
    .from(jobs)
    .where(
      and(
        inArray(jobs.series_id, seriesIds),
        gte(jobs.occurrence_date, today),
        notInArray(jobs.status, ['completed', 'cancelled']),
      ),
    )
    .groupBy(jobs.series_id);
  for (const row of rows) {
    if (row.series_id && row.next) map.set(row.series_id, row.next);
  }
  return map;
}

// GET /api/job-series - List all series (manager + customer service)
jobSeriesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const today = businessToday();
    const rows = await db
      .select()
      .from(jobSeries)
      .orderBy(
        sql`case ${jobSeries.status} when 'pending' then 0 when 'active' then 1 else 2 end`,
        desc(jobSeries.created_at),
      );
    const next = await nextVisitDates(rows.map((row) => row.id), today);
    const isManager = req.user!.role === 'manager';
    return res.json({
      series: rows.map((row) => formatSeries(row, isManager, next.get(row.id) ?? null)),
    });
  } catch (err: any) {
    return serverError(res, 'List job series', err);
  }
});

// GET /api/job-series/:id - Series detail with its visits
jobSeriesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const series = await getSeriesById(String(req.params.id));
    if (!series) return res.status(404).json({ error: 'Series not found' });

    const visitRows = await db
      .select()
      .from(jobs)
      .where(eq(jobs.series_id, series.id))
      .orderBy(asc(jobs.occurrence_date), asc(jobs.created_at));

    const visits = [];
    for (const row of visitRows) {
      visits.push(
        await formatJob({ ...row, created_by_name: null }, {
          includeAssignments: true,
          viewer: req.user,
        }),
      );
    }

    const isManager = req.user!.role === 'manager';
    return res.json({ series: formatSeries(series, isManager), visits });
  } catch (err: any) {
    return serverError(res, 'Get job series', err);
  }
});

// PUT /api/job-series/:id - Edit template/pattern/times/end date and re-apply
jobSeriesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const series = await getSeriesById(String(req.params.id));
    if (!series) return res.status(404).json({ error: 'Series not found' });

    const body: Body = req.body || {};
    const isManager = req.user!.role === 'manager';

    // start_date is immutable: it anchors visit 1 and the fortnightly cycle.
    if (body.start_date !== undefined && body.start_date !== series.start_date) {
      return res.status(400).json({ error: 'The series start date cannot be changed' });
    }

    // ---- Pattern (absent = keep current; end_date null = never ends) ----
    const recurrence: JobSeriesRecurrence = {
      frequency: (typeof body.frequency === 'string' ? body.frequency : series.frequency) as JobSeriesRecurrence['frequency'],
      days_of_week: Array.isArray(body.days_of_week)
        ? (body.days_of_week as number[])
        : parseWeekdays(series.days_of_week),
      start_date: series.start_date,
      start_time: typeof body.start_time === 'string' ? body.start_time.trim() : series.start_time,
      finish_time: typeof body.finish_time === 'string' ? body.finish_time.trim() : series.finish_time,
      end_date:
        body.end_date === undefined
          ? series.end_date
          : body.end_date === null || body.end_date === ''
            ? null
            : String(body.end_date).trim(),
    };
    const parsed = parseRecurrence(recurrence);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // ---- Template fields (absent = keep current; null = clear) ----
    const nextTemplate = {
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
    for (const key of ['title', 'job_type', 'lead_source', 'customer_name', 'address'] as const) {
      if (body[key] === undefined) continue;
      const value = typeof body[key] === 'string' ? body[key].trim() : '';
      if (value.length === 0) return res.status(400).json({ error: `${key} is required` });
      if (key === 'lead_source' && !VALID_LEAD_SOURCES.has(value)) {
        return res.status(400).json({ error: `lead_source must be one of: ${[...VALID_LEAD_SOURCES].join(', ')}` });
      }
      nextTemplate[key] = value;
    }
    for (const key of [
      'services_text',
      'customer_phone',
      'customer_email',
      'site_contact_name',
      'site_contact_phone',
      'location_notes',
      'access_notes',
    ] as const) {
      if (body[key] === undefined) continue;
      nextTemplate[key] = typeof body[key] === 'string' ? (body[key].trim() || null) : null;
    }
    // Pricing is manager-only; other roles' values are ignored.
    if (isManager && body.agreed_price !== undefined) {
      nextTemplate.agreed_price =
        typeof body.agreed_price === 'string' ? body.agreed_price.trim() || null : null;
    }

    const nowIso = new Date().toISOString();
    await db
      .update(jobSeries)
      .set({
        frequency: parsed.value!.frequency,
        days_of_week: JSON.stringify(parsed.value!.days_of_week),
        start_time: parsed.value!.start_time,
        finish_time: parsed.value!.finish_time,
        end_date: parsed.value!.end_date,
        ...nextTemplate,
        updated_at: nowIso,
      })
      .where(eq(jobSeries.id, series.id));

    await auditSeries(req, 'job_series_updated', series.id, {
      frequency: parsed.value!.frequency,
      days_of_week: parsed.value!.days_of_week,
      end_date: parsed.value!.end_date,
    });

    // Re-apply to future unscheduled visits and top up the 14-day window.
    const updated = await getSeriesById(series.id);
    if (updated) await reconcileSeriesVisits(updated, businessToday());

    const refreshed = await getSeriesById(series.id);
    return res.json({ series: formatSeries(refreshed ?? series, isManager) });
  } catch (err: any) {
    return serverError(res, 'Update job series', err);
  }
});

// POST /api/job-series/:id/end - End series and clean up future visits
jobSeriesRouter.post('/:id/end', async (req: Request, res: Response) => {
  try {
    const series = await getSeriesById(String(req.params.id));
    if (!series) return res.status(404).json({ error: 'Series not found' });
    if (series.status === 'ended') return res.status(400).json({ error: 'Series is already ended' });

    const body: Body = req.body || {};
    const reason =
      typeof body.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim()
        : 'Series ended';

    // Visits from today onward are future visits ("from today" is inclusive).
    await endSeries({
      seriesId: series.id,
      reason,
      actor: {
        userId: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
        ipAddress: req.ip ?? null,
      },
      afterDate: addDaysToDateString(businessToday(), -1),
    });

    const refreshed = await getSeriesById(series.id);
    const isManager = req.user!.role === 'manager';
    return res.json({ series: formatSeries(refreshed ?? series, isManager) });
  } catch (err: any) {
    return serverError(res, 'End job series', err);
  }
});
