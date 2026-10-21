import { sql } from 'drizzle-orm';
import { pgTable, text, integer, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const companySettings = pgTable('company_settings', {
  id: text('id').primaryKey(),
  company_name: text('company_name').notNull(),
  short_name: text('short_name').notNull(),
  app_title: text('app_title').notNull(),
  portal_subtitle: text('portal_subtitle').notNull(),
  tagline: text('tagline').notNull(),
  city: text('city').notNull(),
  address: text('address').notNull().default(''),
  support_email: text('support_email').notNull().default(''),
  logo_svg: text('logo_svg').notNull().default(''),
  timezone: text('timezone').notNull(),
  locale: text('locale').notNull(),
  phone_country: text('phone_country').notNull(),
  phone_example: text('phone_example').notNull(),
  phone_help: text('phone_help').notNull(),
  color_primary: text('color_primary').notNull(),
  color_primary_hover: text('color_primary_hover').notNull(),
  color_secondary: text('color_secondary').notNull(),
  color_secondary_hover: text('color_secondary_hover').notNull(),
  color_accent: text('color_accent').notNull(),
  color_background: text('color_background').notNull(),
  shift_presets: text('shift_presets').notNull().default('[]'),
  default_locations: text('default_locations').notNull().default('{}'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  phone_e164: text('phone_e164').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role').notNull().default('staff'), // 'manager' | 'customer_service' | 'service_team' | 'staff'
  name: text('name').notNull(),
  notes: text('notes'),
  is_active: boolean('is_active').notNull().default(true),
  password_version: integer('password_version').notNull().default(1),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('users_phone_idx').on(table.phone_e164),
]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  password_version: integer('password_version').notNull().default(1),
  user_agent: text('user_agent'),
  ip_address: text('ip_address'),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').notNull(),
}, (table) => [
  index('sessions_user_idx').on(table.user_id),
]);

export const availabilityReports = pgTable('availability_reports', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  week_start_date: text('week_start_date').notNull(), // YYYY-MM-DD
  latest_version_id: text('latest_version_id'),
  manager_reviewed_at: text('manager_reviewed_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('avail_user_week_idx').on(table.user_id, table.week_start_date),
]);

export const availabilityVersions = pgTable('availability_versions', {
  id: text('id').primaryKey(),
  report_id: text('report_id').notNull().references(() => availabilityReports.id, { onDelete: 'cascade' }),
  version_number: integer('version_number').notNull(),
  submitted_by_user_id: text('submitted_by_user_id').notNull().references(() => users.id),
  is_manager_entered: boolean('is_manager_entered').notNull().default(false),
  manager_reason: text('manager_reason'),
  created_at: text('created_at').notNull(),
}, (table) => [
  index('avail_ver_report_idx').on(table.report_id),
]);

export const availabilityWindows = pgTable('availability_windows', {
  id: text('id').primaryKey(),
  version_id: text('version_id').notNull().references(() => availabilityVersions.id, { onDelete: 'cascade' }),
  day_of_week: integer('day_of_week').notNull(), // 0=Mon, 6=Sun
  type: text('type').notNull(), // 'unavailable' | 'all_day' | 'custom'
  start_time: text('start_time'), // "HH:mm"
  finish_time: text('finish_time'), // "HH:mm"
  is_overnight: boolean('is_overnight').notNull().default(false),
}, (table) => [
  index('avail_win_version_idx').on(table.version_id),
]);

export const rosterWeeks = pgTable('roster_weeks', {
  id: text('id').primaryKey(),
  week_start_date: text('week_start_date').notNull().unique(), // YYYY-MM-DD
  draft_revision_number: integer('draft_revision_number').notNull().default(1),
  latest_published_version_id: text('latest_published_version_id'),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('roster_week_date_idx').on(table.week_start_date),
]);

export const rosterDraftShifts = pgTable('roster_draft_shifts', {
  id: text('id').primaryKey(),
  roster_week_id: text('roster_week_id').notNull().references(() => rosterWeeks.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  start_datetime: text('start_datetime').notNull(), // ISO UTC
  finish_datetime: text('finish_datetime').notNull(), // ISO UTC
  start_day_of_week: integer('start_day_of_week').notNull(),
  label: text('label'),
  notes: text('notes'),
  override_reason: text('override_reason'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  index('draft_shifts_week_idx').on(table.roster_week_id),
  index('draft_shifts_user_idx').on(table.user_id),
]);

export const rosterVersions = pgTable('roster_versions', {
  id: text('id').primaryKey(),
  roster_week_id: text('roster_week_id').notNull().references(() => rosterWeeks.id),
  version_number: integer('version_number').notNull(),
  published_by_user_id: text('published_by_user_id').notNull().references(() => users.id),
  published_at: text('published_at').notNull(),
}, (table) => [
  index('roster_vers_week_idx').on(table.roster_week_id),
]);

export const rosterVersionShifts = pgTable('roster_version_shifts', {
  id: text('id').primaryKey(),
  roster_version_id: text('roster_version_id').notNull().references(() => rosterVersions.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id),
  staff_name_snapshot: text('staff_name_snapshot').notNull(),
  start_datetime: text('start_datetime').notNull(),
  finish_datetime: text('finish_datetime').notNull(),
  start_day_of_week: integer('start_day_of_week').notNull(),
  label: text('label'),
  notes: text('notes'),
  override_reason: text('override_reason'),
  response_status: text('response_status').notNull().default('pending'), // 'pending' | 'acknowledged' | 'conflict'
  response_reason: text('response_reason'),
  response_note: text('response_note'),
  responded_at: text('responded_at'),
}, (table) => [
  index('version_shifts_version_idx').on(table.roster_version_id),
  index('version_shifts_user_idx').on(table.user_id),
]);

export const staffRosterSnapshots = pgTable('staff_roster_snapshots', {
  id: text('id').primaryKey(),
  roster_version_id: text('roster_version_id').notNull().references(() => rosterVersions.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id),
  has_shifts: boolean('has_shifts').notNull(),
  shift_count: integer('shift_count').notNull().default(0),
  content_hash: text('content_hash').notNull(),
  response_status: text('response_status').notNull().default('pending'), // 'pending' | 'acknowledged' | 'conflict'
  response_reason: text('response_reason'),
  response_note: text('response_note'),
  responded_at: text('responded_at'),
}, (table) => [
  uniqueIndex('staff_snapshot_ver_user_idx').on(table.roster_version_id, table.user_id),
  index('staff_snapshot_user_idx').on(table.user_id),
]);

export const staffRosterResponses = pgTable('staff_roster_responses', {
  id: text('id').primaryKey(),
  snapshot_id: text('snapshot_id').notNull().references(() => staffRosterSnapshots.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id),
  shift_id: text('shift_id'), // null for full roster bulk action, or specific shift_id
  response_status: text('response_status').notNull(), // 'pending' | 'acknowledged' | 'conflict'
  reason: text('reason'),
  note: text('note'),
  created_at: text('created_at').notNull(),
}, (table) => [
  index('responses_snapshot_idx').on(table.snapshot_id),
  index('responses_user_idx').on(table.user_id),
]);

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  related_entity_type: text('related_entity_type'),
  related_entity_id: text('related_entity_id'),
  is_read: boolean('is_read').notNull().default(false),
  read_at: text('read_at'),
  created_at: text('created_at').notNull(),
}, (table) => [
  index('notifs_user_idx').on(table.user_id),
]);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  user_agent: text('user_agent'),
  created_at: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('push_endpoint_idx').on(table.endpoint),
  index('push_user_idx').on(table.user_id),
]);

export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(),
  actor_user_id: text('actor_user_id'),
  actor_name: text('actor_name'),
  actor_role: text('actor_role'),
  event_type: text('event_type').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  metadata: text('metadata'), // JSON string
  ip_address: text('ip_address'),
  created_at: text('created_at').notNull(),
}, (table) => [
  index('audit_event_type_idx').on(table.event_type),
  index('audit_entity_idx').on(table.entity_type, table.entity_id),
]);

export const shiftReports = pgTable('shift_reports', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roster_version_shift_id: text('roster_version_shift_id'),
  shift_date: text('shift_date').notNull(), // YYYY-MM-DD
  week_start_date: text('week_start_date').notNull(), // YYYY-MM-DD (Monday)
  day_of_week: integer('day_of_week').notNull(), // 0=Mon, 6=Sun
  clock_in_at: text('clock_in_at').notNull(), // ISO timestamp
  clock_in_photo: text('clock_in_photo'), // Data URL / photo reference
  clock_in_type: text('clock_in_type').notNull().default('base_arrival'), // 'base_arrival' | 'first_job'
  clock_in_location: text('clock_in_location'),
  clock_out_at: text('clock_out_at'), // ISO timestamp (null when in progress)
  clock_out_photo: text('clock_out_photo'),
  clock_out_type: text('clock_out_type'), // 'last_job' | 'closing_shift'
  clock_out_location: text('clock_out_location'),
  break_minutes: integer('break_minutes').notNull().default(0), // manual minutes
  travel_minutes: integer('travel_minutes').notNull().default(0), // manual travel minutes
  worked_with: text('worked_with'), // JSON array of coworker names/IDs
  staff_notes: text('staff_notes'),
  status: text('status').notNull().default('in_progress'), // 'in_progress' | 'completed' | 'manager_approved' | 'manager_overridden'
  total_worked_minutes: integer('total_worked_minutes').notNull().default(0),
  manager_override_start_at: text('manager_override_start_at'),
  manager_override_finish_at: text('manager_override_finish_at'),
  manager_override_break_minutes: integer('manager_override_break_minutes'),
  manager_override_reason: text('manager_override_reason'),
  manager_overridden_by_id: text('manager_overridden_by_id').references(() => users.id),
  manager_overridden_at: text('manager_overridden_at'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  index('shift_reports_user_date_idx').on(table.user_id, table.shift_date),
  index('shift_reports_week_idx').on(table.week_start_date),
  index('shift_reports_status_idx').on(table.status),
]);

export const shiftEventReports = pgTable('shift_event_reports', {
  id: text('id').primaryKey(),
  shift_report_id: text('shift_report_id').notNull().references(() => shiftReports.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  event_type: text('event_type').notNull(), // 'arrival' | 'leaving' | 'closing'
  location_name: text('location_name'),
  photo_url: text('photo_url'),
  notes: text('notes'),
  timestamp: text('timestamp').notNull(), // ISO timestamp
  created_at: text('created_at').notNull(),
}, (table) => [
  index('shift_events_report_idx').on(table.shift_report_id),
  index('shift_events_user_idx').on(table.user_id),
  index('shift_events_timestamp_idx').on(table.timestamp),
]);

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  job_order_number: text('job_order_number').notNull().unique(), // JO-YYYY-####
  title: text('title').notNull(),
  status: text('status').notNull().default('new'), // 'new' | 'awaiting_info' | 'ready' | 'deal_confirmed' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  job_type: text('job_type').notNull().default(''), // primary category id from JOB_TYPE_OPTIONS
  services: text('services').notNull().default('[]'), // legacy JSON array of service catalog ids (superseded by services_text)
  services_text: text('services_text'), // free-text services required / job scope
  lead_source: text('lead_source').notNull().default('manual'), // 'manual' | 'phone' | 'facebook' | 'website' | 'referral' | 'other'
  customer_name: text('customer_name').notNull().default(''),
  customer_phone: text('customer_phone'),
  customer_email: text('customer_email'),
  site_contact_name: text('site_contact_name'),
  site_contact_phone: text('site_contact_phone'),
  address: text('address').notNull().default(''),
  suburb: text('suburb'),
  city: text('city'),
  postcode: text('postcode'),
  location_notes: text('location_notes'),
  access_notes: text('access_notes'), // access requirements
  agreed_price: text('agreed_price'),
  scheduled_date: text('scheduled_date'), // YYYY-MM-DD (job visit date, business-local)
  scheduled_start_time: text('scheduled_start_time'), // HH:mm business-local
  scheduled_finish_time: text('scheduled_finish_time'), // HH:mm business-local
  ready_at: text('ready_at'), // when customer service marked the job ready for processing (handoff timestamp)
  start_notes: text('start_notes'), // staff note when confirming job in process
  completion_notes: text('completion_notes'), // staff note when reporting job completed
  faults_damages_checked: boolean('faults_damages_checked').notNull().default(false), // required on-site faults/damages confirmation before closing
  faults_damages_checked_at: text('faults_damages_checked_at'),
  faults_damages_checked_by_user_id: text('faults_damages_checked_by_user_id').references(() => users.id),
  running_late: boolean('running_late').notNull().default(false),
  late_reported_at: text('late_reported_at'),
  late_reported_by_user_id: text('late_reported_by_user_id').references(() => users.id),
  late_note: text('late_note'),
  started_at: text('started_at'),
  completed_at: text('completed_at'),
  cancelled_reason: text('cancelled_reason'),
  cancelled_at: text('cancelled_at'),
  created_by_user_id: text('created_by_user_id').references(() => users.id),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('jobs_order_number_idx').on(table.job_order_number),
  index('jobs_status_idx').on(table.status),
  index('jobs_scheduled_date_idx').on(table.scheduled_date),
]);

export const jobAssignments = pgTable('job_assignments', {
  id: text('id').primaryKey(),
  job_id: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  shift_id: text('shift_id'), // roster_draft_shifts.id or roster_version_shifts.id (no FK: both possible)
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  is_lead: boolean('is_lead').notNull().default(false),
  created_at: text('created_at').notNull(),
}, (table) => [
  index('job_assignments_job_idx').on(table.job_id),
  index('job_assignments_user_idx').on(table.user_id),
  index('job_assignments_shift_idx').on(table.shift_id),
  uniqueIndex('job_assignments_one_lead_idx').on(table.job_id).where(sql`is_lead`),
]);

export const jobMedia = pgTable('job_media', {
  id: text('id').primaryKey(),
  job_id: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  phase: text('phase').notNull(), // 'intake' | 'start' | 'completion' | 'other'
  media_type: text('media_type').notNull(), // 'photo' | 'video'
  status: text('status').notNull().default('uploading'), // 'uploading' | 'queued' | 'processing' | 'ready' | 'failed'
  original_ref: text('original_ref'), // s3://... original upload; removed after successful compression
  processed_ref: text('processed_ref'), // s3://... compressed webp/mp4
  content_type: text('content_type'),
  byte_size: integer('byte_size'),
  duration_seconds: integer('duration_seconds'),
  error_message: text('error_message'),
  attempt_count: integer('attempt_count').notNull().default(0),
  created_by_user_id: text('created_by_user_id').references(() => users.id),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  index('job_media_job_idx').on(table.job_id),
  index('job_media_status_idx').on(table.status),
]);

export const jobOrderCounters = pgTable('job_order_counters', {
  year: text('year').primaryKey(), // YYYY
  last_number: integer('last_number').notNull().default(0),
});

export const weeklyTimesheets = pgTable('weekly_timesheets', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  week_start_date: text('week_start_date').notNull(), // YYYY-MM-DD
  staff_signed_name: text('staff_signed_name'),
  staff_signed_at: text('staff_signed_at'),
  supervisor_signed_name: text('supervisor_signed_name'),
  supervisor_signed_at: text('supervisor_signed_at'),
  supervisor_id: text('supervisor_id').references(() => users.id),
  status: text('status').notNull().default('draft'), // 'draft' | 'submitted' | 'approved'
  total_worked_hours: text('total_worked_hours').notNull().default('0.0'),
  manager_notes: text('manager_notes'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('weekly_timesheet_user_week_idx').on(table.user_id, table.week_start_date),
  index('weekly_timesheet_week_idx').on(table.week_start_date),
]);

