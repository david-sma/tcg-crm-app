import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { apiFetch } from '../../lib/api.ts';
import {
  getCurrentMonday,
  getDefaultActiveMonday,
  getOffsetMonday,
  formatWeekRange,
  formatTimeToNZ,
} from '../../lib/dateUtils.ts';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Bell,
  Camera,
  CheckCircle,
  FileCheck,
  Building,
  Briefcase,
  Coffee,
  Users,
  LogIn,
  LogOut,
  Navigation,
  MapPin,
} from 'lucide-react';
import { ClockInModal } from './ClockInModal';
import { ClockOutModal } from './ClockOutModal';
import { PhotoViewerModal } from '../common/PhotoViewerModal';

interface StaffDashboardProps {
  onNavigate: (tab: 'dashboard' | 'availability' | 'roster' | 'my-timesheet') => void;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { isPushSupported, pushSubscribed, requestPushPermission } = useNotifications();

  const currentMonday = getCurrentMonday();
  const activeWeekMonday = getDefaultActiveMonday();
  const followingMonday = getOffsetMonday(activeWeekMonday, 1);

  const isDenied =
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied';

  const [currentRoster, setCurrentRoster] = useState<any>(null);
  const [nextAvailability, setNextAvailability] = useState<any>(null);
  const [todayShiftData, setTodayShiftData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isClockInOpen, setIsClockInOpen] = useState(false);
  const [isClockOutOpen, setIsClockOutOpen] = useState(false);
  const [clockOutInitialClosing, setClockOutInitialClosing] = useState(false);
  const [activePhoto, setActivePhoto] = useState<{
    url: string;
    title: string;
    timestamp?: string;
    location?: string;
    typeLabel?: string;
  } | null>(null);

  const [timerSeconds, setTimerSeconds] = useState<number>(0);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [rosterRes, availRes, todayRes] = await Promise.all([
        apiFetch(`/api/personal-roster?week=${activeWeekMonday}`).catch(() => null),
        apiFetch(`/api/availability/me?week=${followingMonday}`).catch(() => null),
        apiFetch('/api/timesheets/today').catch(() => null),
      ]);
      setCurrentRoster(rosterRes);
      setNextAvailability(availRes);
      setTodayShiftData(todayRes);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [activeWeekMonday, followingMonday]);

  // Live timer for active shift in progress
  useEffect(() => {
    if (todayShiftData?.active_report?.status === 'in_progress' && todayShiftData?.active_report?.clock_in_at) {
      const startMs = new Date(todayShiftData.active_report.clock_in_at).getTime();
      const updateTimer = () => {
        const nowMs = Date.now();
        setTimerSeconds(Math.max(0, Math.floor((nowMs - startMs) / 1000)));
      };
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }
  }, [todayShiftData]);

  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleClockIn = async (data: { photo: string | null; type: any; location: string }) => {
    await apiFetch('/api/timesheets/clock-in', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    await loadDashboardData();
  };

  const handleClockOut = async (data: {
    photo: string | null;
    type: any;
    location: string;
    break_minutes: number;
    travel_minutes: number;
    worked_with: string[];
    notes: string;
  }) => {
    await apiFetch('/api/timesheets/clock-out', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    await loadDashboardData();
  };

  const handleEventReport = async (data: {
    event_type: 'arrival' | 'leaving';
    location_name?: string;
    photo: string;
    notes?: string;
  }) => {
    await apiFetch('/api/timesheets/event-report', {
      method: 'POST',
      body: JSON.stringify({
        report_id: todayShiftData?.active_report?.id,
        ...data,
      }),
    });

    await loadDashboardData();
  };

  const activeReport = todayShiftData?.active_report;
  const isShiftInProgress = activeReport?.status === 'in_progress';
  const isShiftCompletedToday =
    activeReport?.status === 'completed' ||
    activeReport?.status === 'manager_approved' ||
    activeReport?.status === 'manager_overridden';

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="p-6 sm:p-7 bg-gradient-to-br from-[#0c1322] via-[#111e38] to-[#0c1322] text-white rounded-3xl shadow-lg shadow-[#5371FF]/5 relative overflow-hidden border border-[#5371FF]/20">
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Hi, {user?.name}</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-lg">
            Attendance and timesheet portal.
          </p>
        </div>
      </div>

      {/* Push notification banner */}
      {isPushSupported && !pushSubscribed && !isDenied && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-900">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <strong className="font-semibold block">Enable Web Notifications</strong>
              Get instant alerts when rosters are published or timesheets are approved.
            </div>
          </div>
          <button
            id="enable-web-notifications-btn"
            type="button"
            onClick={requestPushPermission}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shrink-0 transition-colors shadow-xs"
          >
            Enable
          </button>
        </div>
      )}

      {/* TODAY'S SHIFT & LIVE ATTENDANCE TRACKER */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Today's Shift
            </span>
            {isShiftInProgress && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                On Duty
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('my-timesheet')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 hover:underline"
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Timesheet</span>
          </button>
        </div>

        {isShiftInProgress ? (
          /* State 1: Active Shift in Progress */
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white rounded-2xl p-5 border border-emerald-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 block">
                  Active Shift Running
                </span>
                <div className="text-3xl sm:text-4xl font-black text-slate-900 font-mono tracking-tight mt-0.5">
                  {formatTimer(timerSeconds)}
                </div>
                <div className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  Clocked in at:{' '}
                  <strong className="text-slate-800">
                    {new Date(activeReport.clock_in_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </strong>{' '}
                  ({activeReport.clock_in_type === 'base_arrival' ? 'Base' : 'First Job'})
                </div>
              </div>

              {activeReport.clock_in_photo && (
                <button
                  type="button"
                  onClick={() =>
                    setActivePhoto({
                      url: activeReport.clock_in_photo,
                      title: 'Arrival Photo',
                      timestamp: activeReport.clock_in_at,
                      location: activeReport.clock_in_location,
                      typeLabel:
                        activeReport.clock_in_type === 'base_arrival'
                          ? 'Base Arrival'
                          : 'First Job Site',
                    })
                  }
                  className="flex items-center gap-2 p-2 bg-white rounded-xl border border-emerald-200 shadow-2xs hover:border-emerald-400 transition-colors shrink-0"
                >
                  <img
                    src={activeReport.clock_in_photo}
                    alt="Arrival"
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div className="text-left pr-2">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block">
                      Arrival Photo
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Camera className="w-3 h-3" /> View
                    </span>
                  </div>
                </button>
              )}
            </div>

            {/* Action Buttons for Field Staff */}
            <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setClockOutInitialClosing(false);
                  setIsClockOutOpen(true);
                }}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Arrival / Leaving</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setClockOutInitialClosing(true);
                  setIsClockOutOpen(true);
                }}
                className="py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-blue-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Finish Shift</span>
              </button>
            </div>

            {/* Today's Site Event Reports Timeline */}
            {activeReport.events && activeReport.events.length > 0 && (
              <div className="mt-3 pt-3 border-t border-emerald-200/70">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block mb-2">
                  Site Activity Logged Today ({activeReport.events.length})
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {activeReport.events.map((ev: any) => {
                    const isArrival = ev.event_type === 'arrival';
                    const isLeaving = ev.event_type === 'leaving';
                    const timeStr = new Date(ev.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={ev.id}
                        className="bg-white/90 border border-emerald-100 rounded-xl p-2.5 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg shrink-0 ${
                              isArrival
                                ? 'bg-emerald-100 text-emerald-700'
                                : isLeaving
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {isArrival ? (
                              <LogIn className="w-3.5 h-3.5" />
                            ) : isLeaving ? (
                              <LogOut className="w-3.5 h-3.5" />
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[11px] font-bold uppercase tracking-wider ${
                                  isArrival
                                    ? 'text-emerald-700'
                                    : isLeaving
                                    ? 'text-amber-700'
                                    : 'text-blue-700'
                                }`}
                              >
                                {isArrival ? 'Arrival' : isLeaving ? 'Leaving' : 'Closing'}
                              </span>
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {ev.location_name || 'Job Site'}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 block">{timeStr}</span>
                          </div>
                        </div>

                        {ev.photo_url && (
                          <button
                            type="button"
                            onClick={() =>
                              setActivePhoto({
                                url: ev.photo_url,
                                title: `${isArrival ? 'Arrival' : isLeaving ? 'Leaving' : 'Closing'} Proof`,
                                timestamp: ev.timestamp,
                                location: ev.location_name,
                                typeLabel: isArrival ? 'Arrival Report' : isLeaving ? 'Leaving Report' : 'Closing Report',
                              })
                            }
                            className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Camera className="w-3 h-3 text-slate-500" />
                            <span>Photo</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : isShiftCompletedToday ? (
          /* State 2: Shift Completed for Today */
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Shift Logged for Today
              </div>
              <div className="text-lg font-black text-slate-900">
                {(activeReport.total_worked_minutes / 60).toFixed(2)} hours logged
              </div>
              <div className="text-xs text-slate-500">
                {new Date(activeReport.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                {activeReport.clock_out_at
                  ? new Date(activeReport.clock_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Finished'}{' '}
                • {activeReport.break_minutes || 0}m break
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsClockInOpen(true)}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors"
              >
                + Add Another Shift
              </button>
              <button
                type="button"
                onClick={() => onNavigate('my-timesheet')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <span>View Timesheet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* State 3: Ready to Start Shift */
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Shift Status
              </span>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                Ready to Start Shift
              </div>
              {todayShiftData?.scheduled_shift ? (
                <div className="text-xs text-emerald-700 font-semibold mt-1">
                  Rostered Today:{' '}
                  {formatTimeToNZ(todayShiftData.scheduled_shift.start_datetime)} –{' '}
                  {formatTimeToNZ(todayShiftData.scheduled_shift.finish_datetime)}
                </div>
              ) : (
                <div className="text-xs text-slate-500 mt-1">
                  Clock in with arrival photo.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsClockInOpen(true)}
              className="py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <Camera className="w-4 h-4" />
              <span>Start Shift</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active Week Roster Card */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {activeWeekMonday === currentMonday ? 'This Week' : 'Next Week'} ({formatWeekRange(activeWeekMonday)})
              </span>
              <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                <Calendar className="w-4 h-4" />
              </span>
            </div>

            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Checking schedule...</div>
            ) : !currentRoster?.is_published ? (
              <div className="py-4 text-center">
                <p className="text-sm font-semibold text-slate-800">Roster Not Published Yet</p>
                <p className="text-xs text-slate-500 mt-1">Your manager is working on this week's schedule.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {currentRoster.shift_count} shift{currentRoster.shift_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">assigned</span>
                  </div>

                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                      currentRoster.response_status === 'acknowledged'
                        ? 'bg-emerald-100 text-emerald-800'
                        : currentRoster.response_status === 'conflict'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {currentRoster.response_status === 'acknowledged'
                      ? 'Confirmed'
                      : currentRoster.response_status === 'conflict'
                      ? 'Conflict'
                      : 'Pending'}
                  </span>
                </div>

                {currentRoster.shifts?.length > 0 && (
                  <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1.5 border border-slate-200">
                    <div className="font-semibold text-slate-700">First Upcoming Shift:</div>
                    <div className="font-mono text-sm font-bold text-slate-900">
                      {formatTimeToNZ(currentRoster.shifts[0].start_datetime)} –{' '}
                      {formatTimeToNZ(currentRoster.shifts[0].finish_datetime)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('roster')}
            className="mt-5 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>View Full Roster & Responses</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Availability Card */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {activeWeekMonday === currentMonday ? 'Next Week' : 'Following Week'} Availability ({formatWeekRange(followingMonday)})
              </span>
              <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                <Clock className="w-4 h-4" />
              </span>
            </div>

            {loading ? (
              <div className="py-6 text-center text-xs text-slate-400 animate-pulse">Checking availability...</div>
            ) : nextAvailability?.availability?.version ? (
              <div className="py-2 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Availability Submitted (v{nextAvailability.availability.version.version_number})</span>
                </div>
                <p className="text-xs text-slate-500">
                  You can update your availability anytime before your manager publishes the roster.
                </p>
              </div>
            ) : (
              <div className="py-2 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 text-xs font-semibold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Not submitted yet</span>
                </div>
                <p className="text-xs text-slate-500">
                  Please let your manager know your available days/hours for {activeWeekMonday === currentMonday ? 'next week' : 'the following week'}.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('availability')}
            className="mt-5 w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Manage Availability</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Clock In Modal */}
      <ClockInModal
        isOpen={isClockInOpen}
        onClose={() => setIsClockInOpen(false)}
        onClockIn={handleClockIn}
        scheduledShift={todayShiftData?.scheduled_shift}
      />

      {/* Clock Out / Shift Activity Report Modal */}
      <ClockOutModal
        isOpen={isClockOutOpen}
        onClose={() => setIsClockOutOpen(false)}
        onClockOut={handleClockOut}
        onEventReport={handleEventReport}
        initialClosing={clockOutInitialClosing}
        activeReport={activeReport}
        suggestedCoworkers={todayShiftData?.suggested_coworkers}
        allStaffNames={todayShiftData?.all_staff_names}
      />

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
