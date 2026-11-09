/**
 * Customers: the single source of truth for customer contact details.
 *
 * Jobs and recurring series keep customer_name / customer_phone /
 * customer_email columns as a mirror of the linked customer, so every
 * existing read path (boards, staff job cards, notifications, search) keeps
 * working. Only the customer profile may change contact details; after an
 * edit, syncCustomerMirrors() copies them onto every linked job and series.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { customers, jobSeries, jobs } from '../db/schema.ts';
import type { CustomerType } from '../../src/types/index.ts';
import { newId } from './jobs.ts';

export type CustomerRow = typeof customers.$inferSelect;

export const CUSTOMER_TYPES: CustomerType[] = ['residential', 'commercial'];

/** Largest accepted amount (NZD 10,000,000.00) — guards against typos. */
const MAX_PRICE_CENTS = 1_000_000_000;

/**
 * Parse a manager-entered amount ("450", "450.5", "$1,250.00", 450.5) into
 * integer cents. null/'' clears the price. Never uses float maths for the
 * string form, so 0.1 + 0.2 style rounding cannot creep in.
 */
export function parsePriceAmount(raw: unknown): { value?: number | null; error?: string } {
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: null };
  let text: string;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return { error: 'price_amount must be a positive amount' };
    text = raw.toFixed(2);
  } else if (typeof raw === 'string') {
    text = raw.replace(/[\s$,]/g, '');
    if (text === '') return { value: null };
  } else {
    return { error: 'price_amount must be a number' };
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return { error: 'price_amount must be an amount like 450 or 450.50' };
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(cents) || cents > MAX_PRICE_CENTS) {
    return { error: 'price_amount is too large' };
  }
  return { value: cents };
}

/** Optional pricing note (free text, manager-only). '' clears it. */
export function parsePriceNote(raw: unknown): { value?: string | null; error?: string } {
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: 'price_note must be text' };
  const trimmed = raw.trim();
  return { value: trimmed.length > 0 ? trimmed : null };
}

export interface CustomerInput {
  name: string;
  customer_type: CustomerType;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validate a customer payload. With `partial`, absent keys are left out of
 * the result (for PUT); otherwise name is required.
 */
export function parseCustomerInput(
  raw: unknown,
  partial = false,
): { value?: Partial<CustomerInput>; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: 'customer details are required' };
  const body = raw as Record<string, unknown>;
  const value: Partial<CustomerInput> = {};

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length === 0) return { error: 'Customer name is required' };
    if (name.length > 200) return { error: 'Customer name is too long' };
    value.name = name;
  }
  if (!partial || body.customer_type !== undefined) {
    const type = body.customer_type ?? 'residential';
    if (typeof type !== 'string' || !CUSTOMER_TYPES.includes(type as CustomerType)) {
      return { error: `customer_type must be one of: ${CUSTOMER_TYPES.join(', ')}` };
    }
    value.customer_type = type as CustomerType;
  }
  for (const key of ['phone', 'email', 'address', 'notes'] as const) {
    if (partial && body[key] === undefined) continue;
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') {
      return { error: `${key} must be text` };
    }
    value[key] = optionalText(body[key]);
  }
  if (value.email && !/^[^\s@]+@[^\s@]+$/.test(value.email)) {
    return { error: 'email must be a valid email address' };
  }
  return { value };
}

export async function getCustomerById(id: string): Promise<CustomerRow | undefined> {
  return (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
}

/** Active (not archived) customer with the same name, case/space-insensitive. */
export async function findActiveCustomerByName(name: string): Promise<CustomerRow | undefined> {
  return (
    await db
      .select()
      .from(customers)
      .where(
        and(
          sql`lower(btrim(${customers.name})) = lower(btrim(${name}))`,
          isNull(customers.archived_at),
        ),
      )
      .limit(1)
  )[0];
}

export async function createCustomer(input: CustomerInput, createdByUserId: string | null): Promise<CustomerRow> {
  const nowIso = new Date().toISOString();
  const id = newId();
  await db.insert(customers).values({
    id,
    name: input.name,
    customer_type: input.customer_type,
    phone: input.phone,
    email: input.email,
    address: input.address,
    notes: input.notes,
    created_by_user_id: createdByUserId,
    created_at: nowIso,
    updated_at: nowIso,
  });
  return (await getCustomerById(id))!;
}

/** The job/series columns that mirror a customer's contact details. */
export function customerMirror(customer: CustomerRow) {
  return {
    customer_id: customer.id,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_email: customer.email,
  };
}

/** Copy the customer's current contact details onto every linked job and series. */
export async function syncCustomerMirrors(customer: CustomerRow): Promise<void> {
  const nowIso = new Date().toISOString();
  const mirror = {
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_email: customer.email,
  };
  await db.update(jobs).set({ ...mirror, updated_at: nowIso }).where(eq(jobs.customer_id, customer.id));
  await db.update(jobSeries).set({ ...mirror, updated_at: nowIso }).where(eq(jobSeries.customer_id, customer.id));
}

/**
 * Work out the customer for a new job:
 * - `customer_id`: an existing, active customer (picked in the form);
 * - otherwise `customer` (or the legacy flat customer_name/phone/email
 *   fields): reuse the active customer with the same name, unless
 *   `customer.force_new` is set, else create a new one.
 * Intake is never blocked by a missing customer record.
 */
export async function resolveCustomerForNewJob(
  body: Record<string, unknown>,
  createdByUserId: string,
): Promise<{ customer?: CustomerRow; created?: boolean; error?: string; status?: number }> {
  if (typeof body.customer_id === 'string' && body.customer_id.trim()) {
    const customer = await getCustomerById(body.customer_id.trim());
    if (!customer) return { error: 'Customer not found', status: 400 };
    if (customer.archived_at) return { error: 'This customer is archived. Restore it before adding jobs.', status: 400 };
    return { customer, created: false };
  }

  const raw =
    body.customer && typeof body.customer === 'object'
      ? (body.customer as Record<string, unknown>)
      : {
          name: body.customer_name,
          phone: body.customer_phone,
          email: body.customer_email,
        };
  const parsed = parseCustomerInput({ customer_type: 'residential', ...raw });
  if (parsed.error) return { error: parsed.error, status: 400 };
  const input = parsed.value as CustomerInput;

  if (raw.force_new !== true) {
    const existing = await findActiveCustomerByName(input.name);
    if (existing) return { customer: existing, created: false };
  }
  const customer = await createCustomer(input, createdByUserId);
  return { customer, created: true };
}
