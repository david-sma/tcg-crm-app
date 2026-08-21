import { pgTable, text, integer, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  phone_e164: text('phone_e164').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role').notNull().default('staff'), // 'manager' | 'staff'
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
