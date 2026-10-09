import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  FileCheck,
  Camera,
  Coffee,
  Users,
  Eye,
  ShieldCheck,
  Edit3,
  Search,
  Filter,
  UserCheck,
  Building,
  Briefcase,
  X,
  MessageSquare,
} from 'lucide-react';
import { formatWeekRange, getOffsetMonday, getDefaultActiveMonday } from '../../lib/dateUtils';
import { apiFetch } from '../../lib/api';
import { PhotoViewerModal } from '../common/PhotoViewerModal';
import { WeekNavigator } from '../common/WeekNavigator.tsx';

interface ManagerTimesheetOverviewProps {
  onNavigateToStaff?: (staffId: string) => void;
}

export const ManagerTimesheetOverview: React.FC<ManagerTimesheetOverviewProps> = () => {
  const [selectedWeek, setSelectedWeek] = useState<string>(getDefaultActiveMonday());
  const [loading, setLoading] = useState<boolean>(true);
  const [liveDutyStaff, setLiveDutyStaff] = useState<any[]>([]);
  const [staffTimesheets, setStaffTimesheets] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({
    total_staff: 0,
    submitted: 0,
    approved: 0,
    draft_or_in_progress: 0,
    total_logged_hours: '0.00',
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inspector Modal state
  const [inspectingUser, setInspectingUser] = useState<any | null>(null);
  const [inspectData, setInspectData] = useState<any | null>(null);
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [approveArmed, setApproveArmed] = useState<boolean>(false);
  const approveArmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (approveArmTimer.current) clearTimeout(approveArmTimer.current);
  }, []);

  const handleApproveClick = () => {
    if (!approveArmed) {
      setApproveArmed(true);
      if (approveArmTimer.current) clearTimeout(approveArmTimer.current);
      approveArmTimer.current = setTimeout(() => setApproveArmed(false), 5000);
      return;
    }
    if (approveArmTimer.current) {
      clearTimeout(approveArmTimer.current);
      approveArmTimer.current = null;
    }
    setApproveArmed(false);
    void handleApproveTimesheet();
  };

  // Override Modal state (Manager only)
  const [overrideReport, setOverrideReport] = useState<any | null>(null);
  const [overrideStartTime, setOverrideStartTime] = useState<string>('');
  const [overrideFinishTime, setOverrideFinishTime] = useState<string>('');
  const [overrideBreak, setOverrideBreak] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [isOverriding, setIsOverriding] = useState<boolean>(false);

  // Photo viewer modal state
  const [activePhoto, setActivePhoto] = useState<{
    url: string;
    title: string;
    timestamp?: string;
    location?: string;
    typeLabel?: string;
  } | null>(null);

  const fetchData = async (week: string) => {
    setLoading(true);
    setError(null);
    try {
      const [liveRes, weekRes] = await Promise.all([
        apiFetch('/api/timesheets/live-duty').catch(() => ({ on_duty_staff: [] })),
        apiFetch(`/api/timesheets/manager-week?week=${week}`).catch(() => ({ staff_timesheets: [], summary: {} })),
      ]);

      setLiveDutyStaff(liveRes.on_duty_staff || []);
      setStaffTimesheets(weekRes.staff_timesheets || []);
      setSummary(
        weekRes.summary || {
          total_staff: 0,
          submitted: 0,
          approved: 0,
          draft_or_in_progress: 0,
          total_logged_hours: '0.00',
        }
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to load manager timesheet data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedWeek);
  }, [selectedWeek]);

  // Load detailed inspection sheet for a specific staff member
  const handleInspectStaff = async (staffSummary: any) => {
    setInspectingUser(staffSummary);
    setInspectLoading(true);
    setApprovalNotes('');
    try {
      const data = await apiFetch(
        `/api/timesheets/staff-sheet?userId=${staffSummary.user_id}&week=${selectedWeek}`
      );
      setInspectData(data);
    } catch (err: any) {
      setError(err?.message || 'Error loading timesheet details');
    } finally {
      setInspectLoading(false);
    }
  };

  // Supervisor 1-tap approval
  const handleApproveTimesheet = async () => {
    if (!inspectingUser) return;
    setIsApproving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch('/api/timesheets/manager-approve', {
        method: 'POST',
        body: JSON.stringify({
          user_id: inspectingUser.user_id,
          week_start_date: selectedWeek,
          manager_notes: approvalNotes,
        }),
      });

      setSuccessMsg(`Timesheet for ${inspectingUser.name} approved successfully!`);
      // Refresh inspection sheet & list
      await handleInspectStaff(inspectingUser);
      await fetchData(selectedWeek);
    } catch (err: any) {
      setError(err?.message || 'Failed to approve timesheet');
    } finally {
      setIsApproving(false);
    }
  };

  // Open Manager Override Modal
  const openOverrideModal = (report: any) => {
    setOverrideReport(report);
    const effectiveStart = report.manager_override_start_at || report.clock_in_at;
    const effectiveFinish = report.manager_override_finish_at || report.clock_out_at;
    const effectiveBreak =
      report.manager_override_break_minutes !== null &&
      report.manager_override_break_minutes !== undefined
        ? report.manager_override_break_minutes
        : report.break_minutes || 0;

    if (effectiveStart) {
      const d = new Date(effectiveStart);
      setOverrideStartTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    } else {
      setOverrideStartTime('');
    }

    if (effectiveFinish) {
      const d = new Date(effectiveFinish);
      setOverrideFinishTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    } else {
      setOverrideFinishTime('');
    }

    setOverrideBreak(effectiveBreak);
    setOverrideReason(report.manager_override_reason || '');
  };

  // Submit Manager Override
  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReport || !overrideReason.trim()) {
      setError('Please provide a reason for the shift override.');
      return;
    }

    setIsOverriding(true);
    setError(null);
    try {
      await apiFetch('/api/timesheets/manager-override', {
        method: 'POST',
        body: JSON.stringify({
          report_id: overrideReport.id,
          override_start_time: overrideStartTime || undefined,
          override_finish_time: overrideFinishTime || undefined,
          override_break_minutes: Number(overrideBreak),
          reason: overrideReason.trim(),
        }),
      });

      setOverrideReport(null);
      setSuccessMsg('Shift record adjusted and audited successfully.');
      if (inspectingUser) {
        await handleInspectStaff(inspectingUser);
      }
      await fetchData(selectedWeek);
    } catch (err: any) {
      setError(err?.message || 'Error applying override');
    } finally {
      setIsOverriding(false);
    }
  };

  const handlePrevWeek = () => setSelectedWeek(getOffsetMonday(selectedWeek, -1));
  const handleNextWeek = () => setSelectedWeek(getOffsetMonday(selectedWeek, 1));
  const handleCurrentWeek = () => setSelectedWeek(getDefaultActiveMonday());

  const formatTimeOfDay = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const filteredStaff = staffTimesheets.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'submitted') return s.status === 'submitted';
    if (statusFilter === 'approved') return s.status === 'approved';
    if (statusFilter === 'draft') return s.status === 'draft' || s.has_in_progress;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Timesheets & Live Duty Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor staff clock-ins, photo proofs, break deductions, and approve weekly timesheets
          </p>
        </div>
      </div>

      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Worked Hours
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">
            {summary.total_logged_hours} hrs
          </div>
          <span className="text-xs text-slate-500 mt-0.5 block">Across all active shifts</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
            Ready for Approval
          </span>
          <div className="text-2xl font-bold text-blue-700 mt-1 tracking-tight">
            {summary.submitted} / {summary.total_staff}
          </div>
          <span className="text-xs text-slate-500 mt-0.5 block">Staff signed & submitted</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">
            Supervisor Approved
          </span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 tracking-tight">
            {summary.approved}
          </div>
          <span className="text-xs text-slate-500 mt-0.5 block">Signed off for payroll</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block">
            Currently On Duty
          </span>
          <div className="text-2xl font-bold text-amber-700 mt-1 tracking-tight flex items-center gap-2">
            <span>{liveDutyStaff.length}</span>
            {liveDutyStaff.length > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            )}
          </div>
          <span className="text-xs text-slate-500 mt-0.5 block">Clocked in today</span>
        </div>
      </div>

      {/* LIVE ON-DUTY STAFF BANNER (If any staff currently working) */}
      {liveDutyStaff.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-5 border border-slate-700 shadow-md">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="font-bold text-sm text-white">Live On-Duty Staff Right Now</h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              {liveDutyStaff.length} worker{liveDutyStaff.length !== 1 ? 's' : ''} active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {liveDutyStaff.map((staff) => (
              <div
                key={staff.id}
                className="bg-slate-800/80 border border-slate-700 rounded-xl p-3.5 flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="font-bold text-sm text-white flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    {staff.user_name}
                  </div>
                  <div className="text-xs text-slate-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Clocked in: <strong className="text-white">{formatTimeOfDay(staff.clock_in_at)}</strong>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    {staff.clock_in_type === 'base_arrival' ? (
                      <Building className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Briefcase className="w-3 h-3 text-blue-400" />
                    )}
                    <span>{staff.clock_in_location || 'Base Office'}</span>
                  </div>

                  {staff.latest_event && (
                    <div className="text-[11px] text-emerald-300 font-medium flex items-center gap-1.5 pt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>
                        {staff.latest_event.event_type === 'arrival' ? 'Arrived at' : 'Left'}{' '}
                        <strong>{staff.latest_event.location_name || 'Job Site'}</strong> (
                        {formatTimeOfDay(staff.latest_event.timestamp)})
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {staff.clock_in_photo && (
                    <button
                      type="button"
                      onClick={() =>
                        setActivePhoto({
                          url: staff.clock_in_photo,
                          title: `Clock In Photo - ${staff.user_name}`,
                          timestamp: staff.clock_in_at,
                          location: staff.clock_in_location,
                          typeLabel:
                            staff.clock_in_type === 'base_arrival'
                              ? 'Base Office Arrival'
                              : 'First Job Site',
                        })
                      }
                      className="relative group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-400 text-xs font-semibold text-emerald-400 transition-all cursor-pointer"
                      title="View Start Photo"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Start</span>
                      <Eye className="w-3 h-3 text-slate-400 group-hover:text-white" />
                    </button>
                  )}

                  {staff.latest_event?.photo_url && (
                    <button
                      type="button"
                      onClick={() =>
                        setActivePhoto({
                          url: staff.latest_event.photo_url,
                          title: `${staff.latest_event.event_type === 'arrival' ? 'Arrival' : 'Leaving'} Photo - ${staff.user_name}`,
                          timestamp: staff.latest_event.timestamp,
                          location: staff.latest_event.location_name,
                          typeLabel: `${staff.latest_event.event_type.toUpperCase()} - ${staff.latest_event.location_name || 'Site'}`,
                        })
                      }
                      className="relative group flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700 text-[11px] font-semibold text-emerald-300 transition-all cursor-pointer"
                      title="View Latest Site Photo"
                    >
                      <Camera className="w-3 h-3" />
                      <span>Latest Site</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WEEKLY TIMESHEETS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Filters Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff member..."
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All Statuses ({staffTimesheets.length})</option>
              <option value="submitted">Submitted / Ready ({summary.submitted})</option>
              <option value="approved">Approved ({summary.approved})</option>
              <option value="draft">Draft / In Progress ({summary.draft_or_in_progress})</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Staff Member</th>
                <th className="py-3.5 px-3">Shifts</th>
                <th className="py-3.5 px-4">Worked Hours</th>
                <th className="py-3.5 px-4">Rostered Hours</th>
                <th className="py-3.5 px-3">Variance</th>
                <th className="py-3.5 px-4">Staff Signed</th>
                <th className="py-3.5 px-4">Supervisor Approval</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading weekly timesheets...
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No timesheets found matching the current filters.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => {
                  const varianceNum = parseFloat(staff.variance_hours);
                  const isPositive = varianceNum > 0.05;
                  const isNegative = varianceNum < -0.05;

                  return (
                    <tr key={staff.user_id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Staff Name & Phone */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{staff.name}</div>
                        {staff.phone_e164 && (
                          <div className="text-xs text-slate-400">{staff.phone_e164}</div>
                        )}
                      </td>

                      {/* Shifts Count */}
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md font-semibold text-xs text-slate-700">
                          {staff.shifts_count}
                        </span>
                      </td>

                      {/* Worked Hours */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {staff.total_worked_hours} hrs
                      </td>

                      {/* Rostered Scheduled Hours */}
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {staff.total_scheduled_hours} hrs
                      </td>

                      {/* Variance */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            isPositive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isNegative
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {varianceNum > 0 ? `+${staff.variance_hours}` : staff.variance_hours}h
                        </span>
                      </td>

                      {/* Staff Signed */}
                      <td className="py-3.5 px-4">
                        {staff.staff_signed_at ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Signed ({new Date(staff.staff_signed_at).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                            Pending Staff
                          </span>
                        )}
                      </td>

                      {/* Supervisor Approval */}
                      <td className="py-3.5 px-4">
                        {staff.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Approved
                          </span>
                        ) : staff.status === 'submitted' ? (
                          <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md animate-pulse">
                            Ready to Approve
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleInspectStaff(staff)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ml-auto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Sheet</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INSPECT STAFF TIMESHEET MODAL / PAPER REPLICA DRAWER */}
      {inspectingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 my-8">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold text-xs rounded-md">
                    Timesheet Inspection & Sign-off
                  </span>
                  <span className="text-xs text-slate-400">
                    Week of {formatWeekRange(selectedWeek)}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white">{inspectingUser.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setInspectingUser(null)}
                className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {inspectLoading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                Loading shift reports and audit proofs...
              </div>
            ) : inspectData ? (
              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Paper Table View */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-2">Day</th>
                        <th className="py-3 px-3">Start & Photo</th>
                        <th className="py-3 px-3">Finish & Photo</th>
                        <th className="py-3 px-2">Break</th>
                        <th className="py-3 px-3">Worked With</th>
                        <th className="py-3 px-3 text-right">Worked Hrs</th>
                        <th className="py-3 px-2 text-right">Override</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inspectData.days.map((row: any) => {
                        const rep = row.report;
                        const hasOverride = Boolean(
                          rep?.manager_override_start_at ||
                            rep?.manager_override_finish_at ||
                            rep?.manager_override_break_minutes !== null &&
                            rep?.manager_override_break_minutes !== undefined
                        );

                        const effectiveStart = rep?.manager_override_start_at || rep?.clock_in_at;
                        const effectiveFinish = rep?.manager_override_finish_at || rep?.clock_out_at;
                        const effectiveBreak =
                          rep?.manager_override_break_minutes !== null &&
                          rep?.manager_override_break_minutes !== undefined
                            ? rep.manager_override_break_minutes
                            : rep?.break_minutes || 0;

                        const dateParts = row.date.split('-');
                        const shortDate = `${dateParts[2]}/${dateParts[1]}`;

                        return (
                          <tr key={row.date} className="hover:bg-slate-50/60">
                            {/* Date */}
                            <td className="py-3 px-3 font-bold text-slate-800">{shortDate}</td>

                            {/* Day */}
                            <td className="py-3 px-2 font-semibold text-slate-700">
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">
                                {row.short_day}
                              </span>
                            </td>

                            {/* Start Time & Photo Proof */}
                            <td className="py-3 px-3">
                              {rep?.clock_in_at ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900">
                                    {formatTimeOfDay(effectiveStart)}
                                  </span>
                                  {rep.clock_in_photo && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActivePhoto({
                                          url: rep.clock_in_photo,
                                          title: `Start Photo Proof - ${row.short_day} ${shortDate}`,
                                          timestamp: rep.clock_in_at,
                                          location: rep.clock_in_location,
                                          typeLabel:
                                            rep.clock_in_type === 'base_arrival'
                                              ? 'Base Arrival'
                                              : 'First Job Site',
                                        })
                                      }
                                      className="p-1 text-white bg-emerald-600 hover:bg-emerald-700 rounded border border-emerald-600"
                                      title="View Start Photo"
                                    >
                                      <Camera className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Finish Time & Photo Proof */}
                            <td className="py-3 px-3">
                              {rep?.clock_out_at || rep?.manager_override_finish_at ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-900">
                                      {formatTimeOfDay(effectiveFinish)}
                                    </span>
                                    {rep?.clock_out_photo && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setActivePhoto({
                                            url: rep.clock_out_photo,
                                            title: `Finish Photo Proof - ${row.short_day} ${shortDate}`,
                                            timestamp: rep.clock_out_at,
                                            location: rep.clock_out_location,
                                            typeLabel:
                                              rep.clock_out_type === 'closing_shift'
                                                ? 'Base Lockup'
                                                : 'Last Job Site',
                                          })
                                        }
                                        className="p-1 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200"
                                        title="View Finish Photo"
                                      >
                                        <Camera className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {/* Intermediate Site Event Reports Gallery */}
                                  {rep?.events && rep.events.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                      {rep.events.map((ev: any, idx: number) => {
                                        const isArr = ev.event_type === 'arrival';
                                        const isLv = ev.event_type === 'leaving';
                                        return (
                                          <button
                                            key={ev.id || idx}
                                            type="button"
                                            onClick={() =>
                                              setActivePhoto({
                                                url: ev.photo_url,
                                                title: `${isArr ? 'Arrival' : isLv ? 'Leaving' : 'Closing'} Photo - ${row.short_day} ${shortDate}`,
                                                timestamp: ev.timestamp,
                                                location: ev.location_name,
                                                typeLabel: `${ev.event_type.toUpperCase()} - ${ev.location_name || 'Site'}`,
                                              })
                                            }
                                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                                              isArr
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                : isLv
                                                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                            }`}
                                            title={`View ${ev.event_type} photo: ${ev.location_name || 'Job Site'}`}
                                          >
                                            <Camera className="w-2.5 h-2.5" />
                                            <span>{isArr ? 'Arr' : isLv ? 'Dep' : 'End'}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : rep?.status === 'in_progress' ? (
                                <div className="space-y-1">
                                  <span className="text-xs font-bold text-emerald-600">On Duty</span>
                                  {rep?.events && rep.events.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                                      {rep.events.map((ev: any, idx: number) => {
                                        const isArr = ev.event_type === 'arrival';
                                        const isLv = ev.event_type === 'leaving';
                                        return (
                                          <button
                                            key={ev.id || idx}
                                            type="button"
                                            onClick={() =>
                                              setActivePhoto({
                                                url: ev.photo_url,
                                                title: `${isArr ? 'Arrival' : isLv ? 'Leaving' : 'Closing'} Photo - ${row.short_day} ${shortDate}`,
                                                timestamp: ev.timestamp,
                                                location: ev.location_name,
                                                typeLabel: `${ev.event_type.toUpperCase()} - ${ev.location_name || 'Site'}`,
                                              })
                                            }
                                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                                              isArr
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                : isLv
                                                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                            }`}
                                            title={`View ${ev.event_type} photo: ${ev.location_name || 'Job Site'}`}
                                          >
                                            <Camera className="w-2.5 h-2.5" />
                                            <span>{isArr ? 'Arr' : isLv ? 'Dep' : 'End'}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Break & Travel */}
                            <td className="py-3 px-2 text-xs font-semibold text-slate-700">
                              <div>{rep && rep.status !== 'in_progress' ? `${effectiveBreak}m` : '—'}</div>
                              {rep?.travel_minutes > 0 && (
                                <div className="text-[10px] text-blue-600 font-medium whitespace-nowrap">
                                  +{rep.travel_minutes}m travel
                                </div>
                              )}
                            </td>

                            {/* Worked With */}
                            <td className="py-3 px-3">
                              {rep?.worked_with && rep.worked_with.length > 0 ? (
                                <span className="text-xs text-slate-700">
                                  {rep.worked_with.join(', ')}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Worked Hours */}
                            <td className="py-3 px-3 text-right font-bold text-slate-900">
                              {rep && rep.total_worked_minutes > 0
                                ? `${(rep.total_worked_minutes / 60).toFixed(2)}h`
                                : '—'}
                            </td>

                            {/* Manager Override Trigger */}
                            <td className="py-3 px-2 text-right">
                              {rep && (
                                <button
                                  type="button"
                                  onClick={() => openOverrideModal(rep)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Override Shift Times / Break"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t border-slate-300">
                        <td colSpan={6} className="py-3 px-3 text-right uppercase text-xs">
                          Total Approved Hours
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700 text-base">
                          {inspectData.total_worked_hours} hrs
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Sign-off statuses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Staff Digital Confirmation
                    </span>
                    {inspectData.timesheet?.staff_signed_at ? (
                      <div className="mt-2 space-y-1">
                        <div className="font-bold text-emerald-800 text-sm flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          Signed by {inspectData.timesheet.staff_signed_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(inspectData.timesheet.staff_signed_at).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-amber-700 font-medium">
                        Staff member has not submitted digital signature yet.
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Supervisor Approval
                    </span>
                    {inspectData.timesheet?.supervisor_signed_at ? (
                      <div className="mt-2 space-y-1">
                        <div className="font-bold text-blue-800 text-sm flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-blue-600" />
                          Approved by {inspectData.timesheet.supervisor_signed_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(inspectData.timesheet.supervisor_signed_at).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-500">
                        Pending supervisor sign-off.
                      </div>
                    )}
                  </div>
                </div>

                {/* Supervisor Approval Action */}
                <div className="p-5 bg-blue-50 border border-blue-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      Supervisor Sign-off & Payroll Notes
                    </label>
                  </div>
                  <input
                    type="text"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Optional supervisor comment / payroll notes..."
                    className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={handleApproveClick}
                    disabled={isApproving}
                    className={`w-full py-3 text-white rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2 ${
                      approveArmed ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {isApproving ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>
                          {approveArmed
                            ? 'Tap again to confirm'
                            : inspectData.timesheet?.status === 'approved'
                            ? 'Re-Approve Timesheet'
                            : 'Approve & Sign Weekly Timesheet'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MANAGER OVERRIDE MODAL (Strictly Manager Only) */}
      {overrideReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-amber-600 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Manager Shift Override</h3>
                <p className="text-xs text-amber-100">
                  Adjust recorded hours with mandatory audit reason
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideReport(null)}
                className="p-1 text-white/80 hover:text-white rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitOverride} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={overrideStartTime}
                    onChange={(e) => setOverrideStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Finish Time
                  </label>
                  <input
                    type="time"
                    value={overrideFinishTime}
                    onChange={(e) => setOverrideFinishTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Break Duration (Minutes)
                </label>
                <select
                  value={overrideBreak}
                  onChange={(e) => setOverrideBreak(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
                >
                  <option value={0}>0 min (No Break)</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min (Standard)</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min (1 hour)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Override Reason (Mandatory Audit Trail)
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="e.g. Staff forgot to clock out at depot, confirmed with supervisor John..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOverrideReport(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isOverriding}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  {isOverriding ? 'Saving...' : 'Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      <PhotoViewerModal
        isOpen={Boolean(activePhoto)}
        onClose={() => setActivePhoto(null)}
        photoUrl={activePhoto?.url || null}
        title={activePhoto?.title || 'Photo Proof'}
        timestamp={activePhoto?.timestamp}
        location={activePhoto?.location}
        typeLabel={activePhoto?.typeLabel}
      />
    </div>
  );
};
