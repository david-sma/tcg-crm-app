import type { UserRole } from '../types/index.ts';

/**
 * Central role vocabulary. One user role describes the person's day job;
 * the per-job team lead is a job assignment flag (job_assignments.is_lead),
 * never a user role.
 */
export const USER_ROLES = ['manager', 'customer_service', 'service_team', 'staff'] as const;

/** Field workers and office staff who can be rostered and submit timesheets. */
export const WORKER_ROLES: UserRole[] = ['staff', 'customer_service', 'service_team'];

/** Office roles that manage job orders (intake, processing, scheduling). */
export const OFFICE_ROLES: UserRole[] = ['manager', 'customer_service', 'service_team'];

/** Roles that may confirm deals, schedule, allocate crew and cancel jobs. */
export const PROCESSING_ROLES: UserRole[] = ['manager', 'service_team'];

export const ROLE_LABELS: Record<UserRole, string> = {
  manager: 'Manager',
  customer_service: 'Customer Service',
  service_team: 'Service Team',
  staff: 'Staff',
};

export const ROLE_HINTS: Record<UserRole, string> = {
  manager: 'Full access to everything',
  customer_service: 'Intake, enquiries and gathering job details',
  service_team: 'Process jobs: confirm, schedule and allocate crews',
  staff: 'Field work: see and run assigned jobs',
};
