export type UserRole = 'manager' | 'staff';

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
  week_start_date: string; // YYYY-MM-DD (Monday in NZT)
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
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: 'ROSTER_PUBLISHED' | 'ROSTER_REVISED' | 'AVAILABILITY_CHANGED' | 'CONFLICT_REPORTED';
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
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, any> | null;
  ip_address?: string | null;
  created_at: string;
}
