import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiFetch } from '../../lib/api.ts';
import { getCurrentMonday, getDefaultActiveMonday, getOffsetMonday, formatWeekRange } from '../../lib/dateUtils.ts';
import {
  Calendar,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Send,
  UserPlus,
  ShieldCheck,
  RotateCw,
  Sparkles,
  ClipboardList,
  Camera,
} from 'lucide-react';

interface ManagerDashboardProps {
  onNavigate: (tab: string) => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const currentMonday = getCurrentMonday();
  const activeMonday = getDefaultActiveMonday();
  const followingMonday = getOffsetMonday(activeMonday, 1);

  const [activeWeekData, setActiveWeekData] = useState<any>(null);
  const [followingWeekData, setFollowingWeekData] = useState<any>(null);
  const [followingAvailOverview, setFollowingAvailOverview] = useState<any>(null);
  const [staffCount, setStaffCount] = useState<number>(0);
  const [liveDutyStaff, setLiveDutyStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const [actRoster, follRoster, follAvail, staffRes, liveRes] = await Promise.all([
          apiFetch(`/api/rosters/week?week=${activeMonday}`).catch(() => null),
          apiFetch(`/api/rosters/week?week=${followingMonday}`).catch(() => null),
          apiFetch(`/api/availability/overview?week=${followingMonday}`).catch(() => null),
          apiFetch<{ staff: any[] }>('/api/staff?status=active').catch(() => ({ staff: [] })),
          apiFetch<{ on_duty_staff: any[] }>('/api/timesheets/live-duty').catch(() => ({ on_duty_staff: [] })),
        ]);

        setActiveWeekData(actRoster);
        setFollowingWeekData(follRoster);
        setFollowingAvailOverview(follAvail);
        setStaffCount(staffRes.staff?.length || 0);
        setLiveDutyStaff(liveRes.on_duty_staff || []);
      } catch (err) {
        console.error('Failed to load manager dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [activeMonday, followingMonday]);

  const missingNextAvailCount =
    followingAvailOverview?.staff_reports?.filter((r: any) => r.is_missing).length || 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="p-6 sm:p-7 bg-gradient-to-br from-[#0c1322] via-[#111e38] to-[#0c1322] text-white rounded-3xl shadow-lg shadow-[#5371FF]/5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[#5371FF]/20">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-[#5095FC]">TCG</span>
            <span className="text-xs text-slate-400 font-medium">• Auckland Operations</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 text-white">
            Welcome, {user?.name}
          </h1>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">
            Roster management, live duty tracking, photo verification, and timesheet approvals.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('timesheets')}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/20 flex items-center gap-1.5 cursor-pointer"
          >
            <ClipboardList className="w-4 h-4 text-emerald-400" />
            <span>Timesheets & Duty ({liveDutyStaff.length} On Duty)</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('roster-builder')}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>Roster Builder</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('timesheets')}
          className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-slate-300 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live On Duty</span>
            <div className="flex items-center gap-1.5">
              {liveDutyStaff.length > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
              <ClipboardList className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-2">
            <span>{liveDutyStaff.length}</span>
            <span className="text-xs font-medium text-slate-400">staff active</span>
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">Click to view photo proofs</div>
        </div>

        <div
          onClick={() => onNavigate('staff')}
          className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-slate-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Staff</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{staffCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Ready for assignment</div>
        </div>

        <div
          onClick={() => onNavigate('availability')}
          className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-slate-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Missing Availability</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className={`text-2xl font-black mt-2 ${missingNextAvailCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {missingNextAvailCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">For week of {formatWeekRange(followingMonday)}</div>
        </div>

        <div
          onClick={() => onNavigate('roster-builder')}
          className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs cursor-pointer hover:border-slate-300 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Roster</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-lg font-black text-slate-900 mt-2 truncate">
            {activeWeekData?.roster_week?.published_version_number > 0
              ? `Published v${activeWeekData.roster_week.published_version_number}`
              : 'Draft Only'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{activeWeekData?.draft_shifts?.length || 0} shifts scheduled</div>
        </div>
      </div>

      {/* Two Column Operational Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Next Week Planning Card */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Next Week Scheduling</h3>
                <span className="text-xs text-slate-500">{formatWeekRange(followingMonday)}</span>
              </div>
              <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Calendar className="w-5 h-5" />
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-600 font-medium">Draft Shifts:</span>
                <span className="font-bold text-slate-900">{followingWeekData?.draft_shifts?.length || 0}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-600 font-medium">Availability Missing:</span>
                <span className="font-bold text-amber-600">{missingNextAvailCount} staff</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-600 font-medium">Publication Status:</span>
                <span className="font-bold text-slate-900">
                  {followingWeekData?.roster_week?.published_version_number > 0
                    ? `Published v${followingWeekData.roster_week.published_version_number}`
                    : 'Draft'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('roster-builder')}
            className="mt-6 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Open Builder for Next Week</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Management Actions */}
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Quick Actions</h3>
                <span className="text-xs text-slate-500">Administrative tools</span>
              </div>
              <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <Users className="w-5 h-5" />
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('timesheets')}
                className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ClipboardList className="w-4 h-4 text-emerald-600" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Approve Timesheets & Audits</div>
                    <div className="text-[11px] text-slate-500">Check photo proofs, break deductions & variances</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('staff')}
                className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <UserPlus className="w-4 h-4 text-slate-700" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Add or Manage Staff</div>
                    <div className="text-[11px] text-slate-500">Create credentials & view phones</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('audit')}
                className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-slate-700" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900">View Audit Logs</div>
                    <div className="text-[11px] text-slate-500">Track all operational activities & overrides</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
