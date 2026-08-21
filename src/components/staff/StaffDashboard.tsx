import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { apiFetch } from '../../lib/api.ts';
import { getCurrentMonday, getOffsetMonday, formatWeekRange, formatTimeToNZ, calculateShiftDuration } from '../../lib/dateUtils.ts';
import { Calendar, Clock, CheckCircle2, AlertTriangle, ArrowRight, Bell, Shield, Sparkles } from 'lucide-react';

interface StaffDashboardProps {
  onNavigate: (tab: 'dashboard' | 'availability' | 'roster') => void;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { unreadCount, isPushSupported, pushSubscribed, requestPushPermission } = useNotifications();

  const currentMonday = getCurrentMonday();
  const nextMonday = getOffsetMonday(currentMonday, 1);

  const [currentRoster, setCurrentRoster] = useState<any>(null);
  const [nextAvailability, setNextAvailability] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const [rosterRes, availRes] = await Promise.all([
          apiFetch(`/api/personal-roster?week=${currentMonday}`).catch(() => null),
          apiFetch(`/api/availability/me?week=${nextMonday}`).catch(() => null),
        ]);
        setCurrentRoster(rosterRes);
        setNextAvailability(availRes);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, [currentMonday, nextMonday]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="p-6 sm:p-7 bg-gradient-to-br from-[#0c1322] via-[#111e38] to-[#0c1322] text-white rounded-3xl shadow-lg shadow-[#5371FF]/5 relative overflow-hidden border border-[#5371FF]/20">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#5095FC]">TCG</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">Hi, {user?.name}</h1>
          <p className="text-sm text-slate-300 mt-1 max-w-lg">
            View your cleaning schedule, confirm shifts, submit availability, and stay in sync with operations.
          </p>
        </div>
      </div>

      {/* Push notification banner if supported */}
      {isPushSupported && !pushSubscribed && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-900">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <strong className="font-semibold block">Enable Web Notifications</strong>
              Get instant alerts on your phone whenever your manager publishes new rosters.
            </div>
          </div>
          <button
            type="button"
            onClick={requestPushPermission}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shrink-0 transition-colors shadow-xs"
          >
            Enable
          </button>
        </div>
      )}

      {/* Quick Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current Week Roster Card */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                This Week ({formatWeekRange(currentMonday)})
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
                    {currentRoster.response_status}
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

        {/* Next Week Availability Card */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Next Week Availability ({formatWeekRange(nextMonday)})
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
                  Please let your manager know your available days/hours for next week.
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
    </div>
  );
};
