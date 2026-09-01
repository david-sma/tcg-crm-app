import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { WeekNavigator } from '../common/WeekNavigator.tsx';
import { EnterAvailabilityModal } from './EnterAvailabilityModal.tsx';
import { getCurrentMonday, getDefaultActiveMonday, DAY_NAMES, SHORT_DAY_NAMES, getDayDateStr } from '../../lib/dateUtils.ts';
import type { AvailabilityWindow } from '../../types/index.ts';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Check,
  RotateCcw,
  Sparkles,
  Phone,
  Moon,
} from 'lucide-react';

export const ManagerAvailabilityOverview: React.FC = () => {
  const [selectedWeek, setSelectedWeek] = useState(getDefaultActiveMonday());
  const [staffReports, setStaffReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaffForOnBehalf, setSelectedStaffForOnBehalf] = useState<any | null>(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((c) => (c?.text === text ? null : c));
    }, 4000);
  };

  const loadOverview = useCallback(async (week: string) => {
    try {
      setLoading(true);
      const data = await apiFetch(`/api/availability/overview?week=${week}`);
      setStaffReports(data.staff_reports || []);
    } catch (err: any) {
      console.error('Failed to load availability overview:', err);
      showToast(err?.message || 'Failed to load availability overview', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview(selectedWeek);
  }, [selectedWeek, loadOverview]);

  const handleMarkReviewed = async (userId: string) => {
    try {
      await apiFetch('/api/availability/review', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, week_start_date: selectedWeek }),
      });
      showToast('Marked availability as reviewed', 'success');
      loadOverview(selectedWeek);
    } catch (err: any) {
      showToast(err?.message || 'Failed to mark review', 'error');
    }
  };

  const missingCount = staffReports.filter((r) => r.is_missing).length;
  const changedCount = staffReports.filter((r) => r.is_changed_since_review && !r.is_missing).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Toast Banner */}
      {toastMessage && (
        <div
          id="overview-toast-banner"
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium border animate-in fade-in duration-150 ${
            toastMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-black/5 rounded-lg text-slate-500 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Staff Availability Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review reported staff availability, identify missing reports, and enter updates on behalf of workers.
          </p>
        </div>
      </div>

      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Active Staff</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{staffReports.length}</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Submitted</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {staffReports.length - missingCount}
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Missing Availability</div>
          <div className={`text-2xl font-bold mt-1 ${missingCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            {missingCount}
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Changed Since Review</div>
          <div className={`text-2xl font-bold mt-1 ${changedCount > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
            {changedCount}
          </div>
        </div>
      </div>

      {/* Responsive Staff Availability Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm animate-pulse">Loading availability reports...</div>
        ) : staffReports.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No active staff found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {staffReports.map((report) => (
              <div key={report.user_id} className="p-4 sm:p-5 space-y-3 hover:bg-slate-50/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-800 shrink-0">
                      {report.user_name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 text-base">{report.user_name}</h3>

                        {report.is_missing ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">
                            Missing
                          </span>
                        ) : report.is_changed_since_review ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider">
                            Changed Since Review
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                            Reviewed (v{report.latest_version?.version_number})
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 font-mono">{report.user_phone}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {!report.is_missing && report.is_changed_since_review && (
                      <button
                        type="button"
                        onClick={() => handleMarkReviewed(report.user_id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors border border-emerald-200"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark Reviewed</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedStaffForOnBehalf(report)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors shadow-2xs"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Enter on Behalf</span>
                    </button>
                  </div>
                </div>

                {/* 7 Days Availability Bar */}
                <div className="grid grid-cols-7 gap-1.5 pt-1">
                  {Array.from({ length: 7 }, (_, dayIdx) => {
                    const dayWins = (report.windows || []).filter((w: any) => w.day_of_week === dayIdx);
                    const primaryType = dayWins[0]?.type || 'unavailable';

                    return (
                      <div
                        key={dayIdx}
                        className={`p-2 rounded-xl border text-center transition-all ${
                          report.is_missing
                            ? 'bg-slate-50 border-slate-200 text-slate-400'
                            : primaryType === 'all_day'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : primaryType === 'custom'
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider">{SHORT_DAY_NAMES[dayIdx]}</div>
                        <div className="text-xs font-semibold mt-1 truncate">
                          {report.is_missing
                            ? '—'
                            : primaryType === 'all_day'
                            ? 'All Day'
                            : primaryType === 'custom'
                            ? `${dayWins[0]?.start_time}-${dayWins[0]?.finish_time}`
                            : 'Off'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {report.latest_version?.is_manager_entered && (
                  <div className="text-[11px] text-purple-700 bg-purple-50/70 p-2 rounded-lg border border-purple-200 flex items-center gap-1.5">
                    <span className="font-semibold">Manager Entered:</span>
                    <span>{report.latest_version.manager_reason}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enter on behalf modal */}
      {selectedStaffForOnBehalf && (
        <EnterAvailabilityModal
          isOpen={Boolean(selectedStaffForOnBehalf)}
          onClose={() => setSelectedStaffForOnBehalf(null)}
          staffId={selectedStaffForOnBehalf.user_id}
          staffName={selectedStaffForOnBehalf.user_name}
          weekStartDate={selectedWeek}
          initialWindows={selectedStaffForOnBehalf.windows}
          onSuccess={() => loadOverview(selectedWeek)}
        />
      )}
    </div>
  );
};
