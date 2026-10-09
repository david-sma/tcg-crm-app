import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  FileCheck,
  Camera,
  Coffee,
  Users,
  AlertCircle,
  ShieldCheck,
  Eye,
  Info,
} from 'lucide-react';
import { formatWeekRange, getOffsetMonday, getDefaultActiveMonday } from '../../lib/dateUtils';
import { apiFetch } from '../../lib/api';
import { useBrand } from '../../context/BrandContext.tsx';
import { DayTimesheetRow, WeeklyTimesheet } from '../../types';
import { PhotoViewerModal } from '../common/PhotoViewerModal';
import { WeekNavigator } from '../common/WeekNavigator.tsx';

interface StaffTimesheetViewProps {
  onBackToDashboard?: () => void;
}

export const StaffTimesheetView: React.FC<StaffTimesheetViewProps> = ({ onBackToDashboard }) => {
  const { defaultLocations } = useBrand();
  const [selectedWeek, setSelectedWeek] = useState<string>(getDefaultActiveMonday());
  const [loading, setLoading] = useState<boolean>(true);
  const [signing, setSigning] = useState<boolean>(false);
  const [signArmed, setSignArmed] = useState<boolean>(false);
  const signArmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [days, setDays] = useState<DayTimesheetRow[]>([]);
  const [timesheet, setTimesheet] = useState<WeeklyTimesheet | null>(null);
  const [totalHours, setTotalHours] = useState<string>('0.00');
  const [employeeName, setEmployeeName] = useState<string>('');
  const [employeePhone, setEmployeePhone] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Photo viewer modal state
  const [activePhoto, setActivePhoto] = useState<{
    url: string;
    title: string;
    timestamp?: string;
    location?: string;
    typeLabel?: string;
  } | null>(null);

  const fetchWeeklyTimesheet = async (week: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/timesheets/my-week?week=${week}`);
      setDays(data.days || []);
      setTimesheet(data.timesheet || null);
      setTotalHours(data.total_worked_hours || '0.00');
      setEmployeeName(data.employee_name || '');
      setEmployeePhone(data.employee_phone || '');
    } catch (err: any) {
      setError(err?.message || 'Error fetching timesheet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeeklyTimesheet(selectedWeek);
  }, [selectedWeek]);

  useEffect(() => () => {
    if (signArmTimer.current) clearTimeout(signArmTimer.current);
  }, []);

  const handleSignClick = () => {
    if (!signArmed) {
      setSignArmed(true);
      if (signArmTimer.current) clearTimeout(signArmTimer.current);
      signArmTimer.current = setTimeout(() => setSignArmed(false), 5000);
      return;
    }
    if (signArmTimer.current) {
      clearTimeout(signArmTimer.current);
      signArmTimer.current = null;
    }
    setSignArmed(false);
    void handleSignWeeklyTimesheet();
  };

  const handleSignWeeklyTimesheet = async () => {
    setSigning(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await apiFetch('/api/timesheets/sign-week', {
        method: 'POST',
        body: JSON.stringify({ week_start_date: selectedWeek }),
      });

      setSuccessMsg('Timesheet submitted and signed successfully!');
      // Refresh
      await fetchWeeklyTimesheet(selectedWeek);
    } catch (err: any) {
      setError(err?.message || 'Failed to sign timesheet');
    } finally {
      setSigning(false);
    }
  };

  const handlePrevWeek = () => {
    setSelectedWeek(getOffsetMonday(selectedWeek, -1));
  };

  const handleNextWeek = () => {
    setSelectedWeek(getOffsetMonday(selectedWeek, 1));
  };

  const handleCurrentWeek = () => {
    setSelectedWeek(getDefaultActiveMonday());
  };

  const formatTimeOfDay = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileCheck className="w-6 h-6 text-emerald-600" />
            Weekly Timesheet
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review your shift hours, break times, and digital sign-off
          </p>
        </div>
      </div>

      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center gap-2.5">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* PAPER-REPLICA TIMESHEET CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Paper Sheet Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Timesheet & Shift Log
            </span>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {employeeName || 'Staff Member'}
            </h2>
            {employeePhone && (
              <p className="text-xs text-slate-500">Phone: {employeePhone}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Worked
              </span>
              <span className="text-xl font-bold text-slate-900">{totalHours} hrs</span>
            </div>

            <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Status
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md mt-0.5 ${
                  timesheet?.status === 'approved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : timesheet?.status === 'submitted'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {timesheet?.status === 'approved'
                  ? '✓ Approved'
                  : timesheet?.status === 'submitted'
                  ? 'Submitted'
                  : 'Draft'}
              </span>
            </div>
          </div>
        </div>

        {/* Days Table (Replicating paper columns) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-3">Day</th>
                <th className="py-3.5 px-4">Start Time</th>
                <th className="py-3.5 px-4">Finish Time</th>
                <th className="py-3.5 px-3">Break</th>
                <th className="py-3.5 px-4">Worked With</th>
                <th className="py-3.5 px-4 text-right">Total Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading weekly timesheet...
                  </td>
                </tr>
              ) : (
                days.map((row) => {
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

                  const durationHours =
                    rep && rep.total_worked_minutes > 0
                      ? (rep.total_worked_minutes / 60).toFixed(2)
                      : rep?.status === 'in_progress'
                      ? 'In Progress'
                      : '—';

                  const dateParts = row.date.split('-');
                  const shortDate = `${dateParts[2]}/${dateParts[1]}`;

                  return (
                    <tr
                      key={row.date}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        rep?.status === 'in_progress' ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      {/* Date */}
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        {shortDate}
                      </td>

                      {/* Day */}
                      <td className="py-3.5 px-3 font-semibold text-slate-700">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-xs">
                          {row.short_day}
                        </span>
                      </td>

                      {/* Start Time & Photo Proof */}
                      <td className="py-3.5 px-4">
                        {rep?.clock_in_at ? (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {formatTimeOfDay(effectiveStart)}
                            </span>
                            {rep.clock_in_photo && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActivePhoto({
                                    url: rep.clock_in_photo!,
                                    title: `Arrival Photo Proof - ${row.short_day} ${shortDate}`,
                                    timestamp: rep.clock_in_at,
                                    location: rep.clock_in_location || (rep.clock_in_type === 'base_arrival' ? defaultLocations.base : defaultLocations.firstJob),
                                    typeLabel:
                                      rep.clock_in_type === 'base_arrival'
                                        ? 'Base Office Arrival'
                                        : 'First Job Site',
                                  })
                                }
                                className="p-1 text-white bg-emerald-600 hover:bg-emerald-700 rounded-md border border-emerald-600 transition-colors"
                                title="View Arrival Photo"
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {rep.clock_in_type === 'first_job' && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                Job Site
                              </span>
                            )}
                          </div>
                        ) : row.scheduled_shift ? (
                          <span className="text-xs text-slate-400 italic">
                            Sched: {formatTimeOfDay(row.scheduled_shift.start_datetime)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Finish Time & Photo Proof */}
                      <td className="py-3.5 px-4">
                        {rep?.clock_out_at || rep?.manager_override_finish_at ? (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {formatTimeOfDay(effectiveFinish)}
                            </span>
                            {rep?.clock_out_photo && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActivePhoto({
                                    url: rep.clock_out_photo!,
                                    title: `Closing Photo Proof - ${row.short_day} ${shortDate}`,
                                    timestamp: rep.clock_out_at || undefined,
                                    location: rep.clock_out_location || (rep.clock_out_type === 'closing_shift' ? defaultLocations.closing : defaultLocations.lastJob),
                                    typeLabel:
                                      rep.clock_out_type === 'closing_shift'
                                        ? 'Base Office Lockup'
                                        : 'Last Job Site',
                                  })
                                }
                                className="p-1 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
                                title="View Closing Photo"
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : rep?.status === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            On Duty Now
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}

                        {/* Intermediate Site Event Reports Gallery */}
                        {rep?.events && rep.events.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap pt-1">
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
                      </td>

                      {/* Break & Travel */}
                      <td className="py-3.5 px-3">
                        {rep && rep.status !== 'in_progress' ? (
                          <div>
                            <span className="text-xs font-semibold text-slate-700">
                              {effectiveBreak > 0 ? `${effectiveBreak}m` : '0m'}
                            </span>
                            {rep?.travel_minutes > 0 && (
                              <div className="text-[10px] text-blue-600 font-medium whitespace-nowrap">
                                +{rep.travel_minutes}m travel
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Worked With */}
                      <td className="py-3.5 px-4">
                        {rep?.worked_with && rep.worked_with.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {rep.worked_with.map((name: string, i: number) => (
                              <span
                                key={i}
                                className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Total Hours */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex flex-col items-end">
                          <span
                            className={`font-bold text-sm ${
                              durationHours !== '—' && durationHours !== 'In Progress'
                                ? 'text-slate-900'
                                : 'text-slate-400'
                            }`}
                          >
                            {durationHours !== '—' && durationHours !== 'In Progress'
                              ? `${durationHours}h`
                              : durationHours}
                          </span>
                          {hasOverride && (
                            <span className="text-[10px] text-amber-600 font-bold">
                              Manager Adjusted
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/80 font-bold border-t border-slate-300 text-slate-900">
                <td colSpan={6} className="py-4 px-4 text-right uppercase text-xs tracking-wider">
                  Total Worked Hours
                </td>
                <td className="py-4 px-4 text-right text-base font-bold text-emerald-700">
                  {totalHours} hrs
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* SIGN-OFF & APPROVAL SECTION */}
        <div className="p-6 bg-slate-50/70 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Employee Signature Box */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                Employee Signature
              </span>
              {timesheet?.staff_signed_at ? (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-md flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Signed
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-md">
                  Action Required
                </span>
              )}
            </div>

            {timesheet?.staff_signed_at ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-bold text-slate-900 text-sm">
                  {timesheet.staff_signed_name}
                </div>
                <div className="text-xs text-slate-500">
                  Signed on:{' '}
                  {new Date(timesheet.staff_signed_at).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </div>
                <p className="text-[11px] text-emerald-700 font-medium pt-1">
                  ✓ Confirmed hours and shift times.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  I confirm that the recorded times and breaks above are accurate.
                </p>
                <button
                  type="button"
                  onClick={handleSignClick}
                  disabled={signing || totalHours === '0.00'}
                  className={`w-full py-2.5 px-4 text-white rounded-xl font-bold text-xs transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-2 ${
                    signArmed ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {signing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>{signArmed ? 'Tap again to confirm' : 'Sign Timesheet'}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Supervisor Review & Approval Box */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Supervisor Approval
              </span>
              {timesheet?.supervisor_signed_at ? (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded-md flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-blue-600" /> Approved
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">
                  Pending Review
                </span>
              )}
            </div>

            {timesheet?.supervisor_signed_at ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="font-bold text-slate-900 text-sm">
                  {timesheet.supervisor_signed_name}
                </div>
                <div className="text-xs text-slate-500">
                  Approved on:{' '}
                  {new Date(timesheet.supervisor_signed_at).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </div>
                {timesheet.manager_notes && (
                  <div className="text-xs text-slate-600 pt-1 border-t border-slate-200 mt-2">
                    <span className="font-semibold text-slate-700">Manager Note:</span>{' '}
                    {timesheet.manager_notes}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-500 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  Once you sign and submit this timesheet, your manager will review the worked
                  hours and photo proofs for approval and payroll processing.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

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
