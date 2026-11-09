import { Router, Request, Response } from 'express';
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { customers, jobSeries, jobs, users } from '../db/schema.ts';
import { requireAuth, requireAnyRole } from '../middleware/auth.ts';
import { OFFICE_ROLES } from '../../src/config/roles.ts';
import { logAuditEvent } from '../services/audit.ts';
import { formatJob } from '../services/jobs.ts';
import { businessToday, formatSeries } from '../services/jobSeries.ts';
import {
  createCustomer,
  findActiveCustomerByName,
  getCustomerById,
  parseCustomerInput,
  syncCustomerMirrors,
  type CustomerInput,
  type CustomerRow,
} from '../services/customers.ts';
import type {
  Customer,
  CustomerListItem,
  CustomerProfileStats,
  CustomerType,
} from '../../src/types/index.ts';

export const customersRouter = Router();

customersRouter.use(requireAuth);
// Customers are visible to office roles (manager, customer service, service team).
customersRouter.use(requireAnyRole(...OFFICE_ROLES));

/** Creating/editing/archiving customers: the roles that take job intake. */
const requireCustomerEditor = requireAnyRole('manager', 'customer_service');

type Body = Record<string, unknown>;

function serverError(res: Response, context: string, err: any) {
  console.error(`${context} error:`, err);
  return res.status(500).json({ error: err?.message || 'Internal server error' });
}

async function auditCustomer(
  req: Request,
  eventType: string,
  customerId: string,
  metadata?: Record<string, unknown> | null,
) {
  await logAuditEvent({
    actor_user_id: req.user!.id,
    actor_name: req.user!.name,
    actor_role: req.user!.role,
    event_type: eventType,
    entity_type: 'customer',
    entity_id: customerId,
    metadata: metadata ?? null,
    ip_address: req.ip,
  });
}

function formatCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    customer_type: row.customer_type as CustomerType,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    archived_at: row.archived_at,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** A job's visit date: scheduled date, else recurring visit date, else the day it was created. */
const jobDay = sql<string>`coalesce(${jobs.scheduled_date}, ${jobs.occurrence_date}, substr(${jobs.created_at}, 1, 10))`;

// GET /api/customers?search=&type=&include_archived=1&limit= - List with activity summary
customersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const includeArchived = req.query.include_archived === '1' || req.query.include_archived === 'true';
    const limitRaw = Number(req.query.limit);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 500;

    const conditions: SQL[] = [];
    if (!includeArchived) conditions.push(isNull(customers.archived_at));
    if (type === 'residential' || type === 'commercial') conditions.push(eq(customers.customer_type, type));
    if (search) {
      const pattern = `%${search}%`;
      const digits = search.replace(/\D/g, '');
      const match = or(
        ilike(customers.name, pattern),
        ilike(customers.email, pattern),
        ilike(customers.phone, pattern),
        // Phone numbers match regardless of spaces/dashes/+ formatting.
        ...(digits.length >= 3
          ? [sql`regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g') like ${`%${digits}%`}`]
          : []),
      );
      if (match) conditions.push(match);
    }

    const rows = await db
      .select()
      .from(customers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(sql`lower(${customers.name})`))
      .limit(limit);

    const ids = rows.map((row) => row.id);
    const today = businessToday();
    const jobStats = new Map<string, { job_count: number; last_job_date: string | null; next_visit_date: string | null }>();
    const seriesCounts = new Map<string, number>();
    if (ids.length > 0) {
      const statRows = await db
        .select({
          customer_id: jobs.customer_id,
          job_count: sql<number>`count(*)::int`,
          last_job_date: sql<string | null>`max(${jobDay}) filter (where ${jobs.status} <> 'cancelled' and ${jobDay} <= ${today})`,
          next_visit_date: sql<string | null>`min(${jobDay}) filter (where ${jobs.status} not in ('completed', 'cancelled') and ${jobDay} >= ${today})`,
        })
        .from(jobs)
        .where(inArray(jobs.customer_id, ids))
        .groupBy(jobs.customer_id);
      for (const row of statRows) {
        if (row.customer_id) {
          jobStats.set(row.customer_id, {
            job_count: Number(row.job_count) || 0,
            last_job_date: row.last_job_date ?? null,
            next_visit_date: row.next_visit_date ?? null,
          });
        }
      }
      const seriesRows = await db
        .select({ customer_id: jobSeries.customer_id, count: sql<number>`count(*)::int` })
        .from(jobSeries)
        .where(and(inArray(jobSeries.customer_id, ids), inArray(jobSeries.status, ['pending', 'active'])))
        .groupBy(jobSeries.customer_id);
      for (const row of seriesRows) {
        if (row.customer_id) seriesCounts.set(row.customer_id, Number(row.count) || 0);
      }
    }

    const list: CustomerListItem[] = rows.map((row) => {
      const stats = jobStats.get(row.id);
      return {
        ...formatCustomer(row),
        job_count: stats?.job_count ?? 0,
        last_job_date: stats?.last_job_date ?? null,
        next_visit_date: stats?.next_visit_date ?? null,
        active_series_count: seriesCounts.get(row.id) ?? 0,
      };
    });

    return res.json({ customers: list });
  } catch (err: any) {
    return serverError(res, 'List customers', err);
  }
});

// GET /api/customers/:id - Profile: details, stats, full job history, recurring series
customersRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const customer = await getCustomerById(String(req.params.id));
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const isManager = req.user!.role === 'manager';

    const jobRows = await db
      .select({ job: jobs, created_by_name: users.name })
      .from(jobs)
      .leftJoin(users, eq(jobs.created_by_user_id, users.id))
      .where(eq(jobs.customer_id, customer.id))
      .orderBy(desc(jobDay), desc(jobs.created_at));

    const formattedJobs = [];
    for (const row of jobRows) {
      formattedJobs.push(
        await formatJob(
          { ...row.job, created_by_name: row.created_by_name ?? null },
          { includeAssignments: true, viewer: req.user },
        ),
      );
    }

    const stats: CustomerProfileStats = {
      total_jobs: jobRows.length,
      completed_jobs: 0,
      upcoming_jobs: 0,
      cancelled_jobs: 0,
      active_series_count: 0,
    };
    let completedValue = 0;
    let upcomingValue = 0;
    for (const { job } of jobRows) {
      if (job.status === 'completed') {
        stats.completed_jobs += 1;
        completedValue += job.price_cents ?? 0;
      } else if (job.status === 'cancelled') {
        stats.cancelled_jobs += 1;
      } else {
        stats.upcoming_jobs += 1;
        upcomingValue += job.price_cents ?? 0;
      }
    }
    if (isManager) {
      stats.completed_value_cents = completedValue;
      stats.upcoming_value_cents = upcomingValue;
    }

    const seriesRows = await db
      .select()
      .from(jobSeries)
      .where(eq(jobSeries.customer_id, customer.id))
      .orderBy(desc(jobSeries.created_at));
    stats.active_series_count = seriesRows.filter((row) => row.status !== 'ended').length;

    return res.json({
      customer: formatCustomer(customer),
      stats,
      jobs: formattedJobs,
      series: seriesRows.map((row) => formatSeries(row, isManager)),
    });
  } catch (err: any) {
    return serverError(res, 'Get customer', err);
  }
});

/** 409 when another active customer already uses this name (unless allow_duplicate). */
async function duplicateNameConflict(name: string, body: Body, excludeId?: string) {
  if (body.allow_duplicate === true) return null;
  const existing = await findActiveCustomerByName(name);
  if (existing && existing.id !== excludeId) return existing;
  return null;
}

// POST /api/customers - Create (manager + customer service)
customersRouter.post('/', requireCustomerEditor, async (req: Request, res: Response) => {
  try {
    const body: Body = req.body || {};
    const parsed = parseCustomerInput(body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const input = parsed.value as CustomerInput;

    const duplicate = await duplicateNameConflict(input.name, body);
    if (duplicate) {
      return res.status(409).json({
        error: `A customer named "${duplicate.name}" already exists`,
        existing_customer_id: duplicate.id,
      });
    }

    const customer = await createCustomer(input, req.user!.id);
    await auditCustomer(req, 'customer_created', customer.id, { name: customer.name, source: 'customers' });
    return res.status(201).json({ customer: formatCustomer(customer) });
  } catch (err: any) {
    return serverError(res, 'Create customer', err);
  }
});

// PUT /api/customers/:id - Edit contact details (manager + customer service).
// The only place customer contact details can change; linked jobs and
// recurring series get the new details through syncCustomerMirrors().
customersRouter.put('/:id', requireCustomerEditor, async (req: Request, res: Response) => {
  try {
    const customer = await getCustomerById(String(req.params.id));
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const body: Body = req.body || {};
    const parsed = parseCustomerInput(body, true);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const patch = parsed.value!;

    if (patch.name && patch.name.toLowerCase() !== customer.name.toLowerCase()) {
      const duplicate = await duplicateNameConflict(patch.name, body, customer.id);
      if (duplicate) {
        return res.status(409).json({
          error: `A customer named "${duplicate.name}" already exists`,
          existing_customer_id: duplicate.id,
        });
      }
    }

    const changedFields = (Object.keys(patch) as (keyof CustomerInput)[]).filter(
      (key) => (patch[key] ?? null) !== ((customer as Record<string, unknown>)[key] ?? null),
    );
    if (changedFields.length === 0) {
      return res.json({ customer: formatCustomer(customer) });
    }

    await db
      .update(customers)
      .set({ ...patch, updated_at: new Date().toISOString() })
      .where(eq(customers.id, customer.id));
    const updated = (await getCustomerById(customer.id))!;

    if (changedFields.some((key) => key === 'name' || key === 'phone' || key === 'email')) {
      await syncCustomerMirrors(updated);
    }
    await auditCustomer(req, 'customer_updated', customer.id, { fields: changedFields });

    return res.json({ customer: formatCustomer(updated) });
  } catch (err: any) {
    return serverError(res, 'Update customer', err);
  }
});

// POST /api/customers/:id/archive | /unarchive - Hide from pickers (never deletes history)
for (const action of ['archive', 'unarchive'] as const) {
  customersRouter.post(`/:id/${action}`, requireCustomerEditor, async (req: Request, res: Response) => {
    try {
      const customer = await getCustomerById(String(req.params.id));
      if (!customer) return res.status(404).json({ error: 'Customer not found' });

      if (action === 'unarchive' && customer.archived_at) {
        const duplicate = await findActiveCustomerByName(customer.name);
        if (duplicate && duplicate.id !== customer.id) {
          return res.status(409).json({
            error: `Another active customer is already named "${duplicate.name}"`,
            existing_customer_id: duplicate.id,
          });
        }
      }

      const nowIso = new Date().toISOString();
      const archivedAt = action === 'archive' ? (customer.archived_at ?? nowIso) : null;
      await db
        .update(customers)
        .set({ archived_at: archivedAt, updated_at: nowIso })
        .where(eq(customers.id, customer.id));
      await auditCustomer(req, action === 'archive' ? 'customer_archived' : 'customer_unarchived', customer.id, {
        name: customer.name,
      });
      return res.json({ customer: formatCustomer((await getCustomerById(customer.id))!) });
    } catch (err: any) {
      return serverError(res, `${action === 'archive' ? 'Archive' : 'Restore'} customer`, err);
    }
  });
}
