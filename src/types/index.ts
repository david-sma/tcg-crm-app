export type UserRole = 'manager' | 'customer_service' | 'service_team' | 'staff';

export interface User {
  id: string;
  phone_e164: string;
  role: UserRole;
  name: string;
  notes?: string | null;
  is_active: boolean;
  password_version: number;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  password_version: number;
  user_agent?: string | null;
  ip_address?: string | null;
  expires_at: string;
  created_at: string;
}

export type DayOfWeekIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Mon, 6 = Sun

export type AvailabilityWindowType = 'unavailable' | 'all_day' | 'custom';

export interface AvailabilityWindow {
  id?: string;
  day_of_week: DayOfWeekIndex;
  type: AvailabilityWindowType;
  start_time?: string | null; // "HH:mm" e.g. "08:00"
  finish_time?: string | null; // "HH:mm" e.g. "17:00" or overnight "02:00"
  is_overnight?: boolean;
}

export interface AvailabilityVersion {
  id: string;
  report_id: string;
  version_number: number;
  submitted_by_user_id: string;
  submitted_by_name?: string;
  is_manager_entered: boolean;
  manager_reason?: string | null;
  created_at: string;
  windows: AvailabilityWindow[];
}

export interface AvailabilityReport {
  id: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  week_start_date: string; // YYYY-MM-DD (Monday in business-local time)
  latest_version?: AvailabilityVersion | null;
  manager_reviewed_at?: string | null;
  is_missing: boolean;
  is_changed_since_review: boolean;
}

export interface DraftShift {
  id: string;
  roster_week_id: string;
  user_id: string;
  user_name?: string;
  staff_name?: string;
  start_datetime: string; // ISO UTC
  finish_datetime: string; // ISO UTC
  start_day_of_week: DayOfWeekIndex;
  label?: string | null;
  notes?: string | null;
  override_reason?: string | null;
  // Computed containment status
  is_contained?: boolean;
  is_contained_in_availability?: boolean;
  containment_warning?: string | null;
}

export interface RosterWeek {
  id: string;
  week_start_date: string; // YYYY-MM-DD (Monday)
  draft_revision_number: number;
  latest_published_version_id?: string | null;
  latest_published_version_number?: number | null;
  published_at?: string | null;
  updated_at: string;
}

export interface PublishedShiftSnapshot {
  id: string;
  roster_version_id: string;
  user_id: string;
  staff_name_snapshot: string;
  start_datetime: string;
  finish_datetime: string;
  start_day_of_week: DayOfWeekIndex;
  label?: string | null;
  notes?: string | null;
  override_reason?: string | null;
  response_status?: StaffResponseStatus;
  response_reason?: string | null;
  response_note?: string | null;
  responded_at?: string | null;
}

export type StaffResponseStatus = 'pending' | 'acknowledged' | 'conflict';

export interface StaffRosterSnapshot {
  id: string;
  roster_version_id: string;
  roster_version_number: number;
  week_start_date: string;
  user_id: string;
  has_shifts: boolean;
  shift_count: number;
  content_hash: string;
  response_status: StaffResponseStatus;
  response_reason?: string | null;
  response_note?: string | null;
  responded_at?: string | null;
  shifts: PublishedShiftSnapshot[];
}

export interface StaffRosterResponse {
  user_id: string;
  user_name: string;
  user_phone: string;
  response_status: StaffResponseStatus;
  response_reason?: string | null;
  response_note?: string | null;
  conflict_reason?: string | null;
  conflict_note?: string | null;
  responded_at?: string | null;
  shifts_count: number;
  shift_count?: number;
  snapshot_id?: string;
  shifts?: PublishedShiftSnapshot[];
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: 'ROSTER_PUBLISHED' | 'ROSTER_REVISED' | 'AVAILABILITY_CHANGED' | 'CONFLICT_REPORTED' | 'TIMESHEET_SUBMITTED' | 'TIMESHEET_APPROVED' | 'SHIFT_STARTED' | 'JOB_ASSIGNED' | 'JOB_STATUS_CHANGED' | 'JOB_STARTED' | 'JOB_COMPLETED' | 'JOB_MEDIA_FAILED' | 'JOB_RUNNING_LATE';
  title: string;
  body: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  event_type: string;
  action?: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, any> | null;
  ip_address?: string | null;
  created_at: string;
}

export type ShiftReportStatus = 'in_progress' | 'completed' | 'manager_approved' | 'manager_overridden';
export type ClockInType = 'base_arrival' | 'first_job';
export type ClockOutType = 'last_job' | 'closing_shift';
export type ShiftEventType = 'arrival' | 'leaving' | 'closing';

export interface ShiftEventReport {
  id: string;
  shift_report_id: string;
  user_id: string;
  event_type: ShiftEventType;
  location_name?: string | null;
  photo_url?: string | null;
  notes?: string | null;
  timestamp: string; // ISO
  created_at: string;
}

export interface ShiftReport {
  id: string;
  user_id: string;
  user_name?: string;
  user_phone?: string;
  roster_version_shift_id?: string | null;
  shift_date: string; // YYYY-MM-DD
  week_start_date: string; // YYYY-MM-DD (Monday)
  day_of_week: DayOfWeekIndex;
  clock_in_at: string; // ISO
  clock_in_photo?: string | null;
  clock_in_type: ClockInType;
  clock_in_location?: string | null;
  clock_out_at?: string | null; // ISO
  clock_out_photo?: string | null;
  clock_out_type?: ClockOutType | null;
  clock_out_location?: string | null;
  break_minutes: number; // manual minutes
  travel_minutes?: number; // manual travel minutes
  worked_with?: string[] | null; // coworker names
  staff_notes?: string | null;
  status: ShiftReportStatus;
  total_worked_minutes: number;
  manager_override_start_at?: string | null;
  manager_override_finish_at?: string | null;
  manager_override_break_minutes?: number | null;
  manager_override_reason?: string | null;
  manager_overridden_by_id?: string | null;
  manager_overridden_at?: string | null;
  events?: ShiftEventReport[];
  created_at: string;
  updated_at: string;
  // Computed / joined helpers
  scheduled_start?: string | null;
  scheduled_finish?: string | null;
  scheduled_duration_minutes?: number | null;
}

export type TimesheetStatus = 'draft' | 'submitted' | 'approved';

export interface WeeklyTimesheet {
  id: string;
  user_id: string;
  user_name?: string;
  user_phone?: string;
  week_start_date: string; // YYYY-MM-DD
  staff_signed_name?: string | null;
  staff_signed_at?: string | null;
  supervisor_signed_name?: string | null;
  supervisor_signed_at?: string | null;
  supervisor_id?: string | null;
  status: TimesheetStatus;
  total_worked_hours: string;
  manager_notes?: string | null;
  reports?: ShiftReport[];
  created_at: string;
  updated_at: string;
}

export interface DayTimesheetRow {
  date: string; // YYYY-MM-DD
  day_of_week: number;
  day_name: string;
  short_day: string;
  report?: ShiftReport | null;
  scheduled_shift?: PublishedShiftSnapshot | null;
}

export type JobStatus =
  | 'new'
  | 'awaiting_info'
  | 'ready'
  | 'deal_confirmed'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type LeadSource = 'manual' | 'phone' | 'facebook' | 'website' | 'referral' | 'other';

export type JobMediaType = 'photo' | 'video';

export type JobMediaPhase = 'intake' | 'start' | 'completion' | 'other';

export type JobMediaStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';

export interface JobAssignment {
  id: string;
  job_id: string;
  shift_id?: string | null;
  user_id: string;
  user_name?: string;
  is_lead: boolean;
  created_at: string;
}

export interface JobMedia {
  id: string;
  job_id: string;
  phase: JobMediaPhase;
  media_type: JobMediaType;
  status: JobMediaStatus;
  original_ref?: string | null;
  processed_ref?: string | null;
  url?: string | null; // authenticated API url for viewing
  content_type?: string | null;
  byte_size?: number | null;
  duration_seconds?: number | null;
  error_message?: string | null;
  attempt_count: number;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  job_order_number: string;
  title: string;
  status: JobStatus;
  job_type: string;
  services: string[]; // legacy structured selection (superseded by services_text)
  services_text?: string | null; // free-text services required / job scope
  lead_source?: LeadSource;
  customer_name?: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  site_contact_name?: string | null;
  site_contact_phone?: string | null;
  address: string;
  suburb?: string | null;
  city?: string | null;
  postcode?: string | null;
  location_notes?: string | null;
  access_notes?: string | null;
  agreed_price?: string | null; // omitted in non-manager payloads
  scheduled_date?: string | null;
  scheduled_start_time?: string | null;
  scheduled_finish_time?: string | null;
  ready_at?: string | null;
  start_notes?: string | null;
  completion_notes?: string | null;
  faults_damages_checked: boolean;
  faults_damages_checked_at?: string | null;
  faults_damages_checked_by_user_id?: string | null;
  faults_damages_checked_by_name?: string | null;
  running_late: boolean;
  late_reported_at?: string | null;
  late_reported_by_user_id?: string | null;
  late_reported_by_name?: string | null;
  late_note?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_reason?: string | null;
  cancelled_at?: string | null;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  assignments?: JobAssignment[];
  media?: JobMedia[];
}

