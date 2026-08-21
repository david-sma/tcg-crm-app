import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { WeekNavigator } from '../common/WeekNavigator.tsx';
import { getCurrentMonday, DAY_NAMES, getDayDateStr, formatTimeToNZ, calculateShiftDuration } from '../../lib/dateUtils.ts';
import { ConflictReportModal } from './ConflictReportModal.tsx';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  ShieldCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface StaffRosterViewProps {
  initialWeek?: string;
}

export const StaffRosterView: React.FC<StaffRosterViewProps> = ({ initialWeek }) => {
  const [selectedWeek, setSelectedWeek] = useState(initialWeek || getCurrentMonday());
  const [rosterData, setRosterData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [error, setError] = useState('');

  const loadPersonalRoster = useCallback(async (week: string) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch(`/api/personal-roster?week=${week}`);
      setRosterData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load personal roster');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPersonalRoster(selectedWeek);
  }, [selectedWeek, loadPersonalRoster]);

  const handleAcknowledge = async () => {
    if (!rosterData?.snapshot_id) return;
    try {
      setActionLoading(true);
      setError('');
      await apiFetch('/api/personal-roster/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ snapshot_id: rosterData.snapshot_id }),
      });
      loadPersonalRoster(selectedWeek);
    } catch (err: any) {
      setError(err?.message || 'Failed to acknowledge roster');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">My Weekly Roster</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review your published shifts and acknowledge your schedule.
          </p>
        </div>
      </div>

      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
          <div className="animate-pulse">Loading your roster...</div>
        </div>
      ) : !rosterData?.is_published ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
          <h2 className="text-lg font-semibold text-slate-900">Roster Not Published Yet</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Your manager has not published the roster for this week yet. Check back soon or submit your availability.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status & Response Card */}
          <div
            className={`p-5 rounded-2xl border shadow-xs transition-all ${
              rosterData.response_status === 'acknowledged'
                ? 'bg-emerald-50/70 border-emerald-200'
                : rosterData.response_status === 'conflict'
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-blue-50/70 border-blue-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5">
                  {rosterData.response_status === 'acknowledged' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  ) : rosterData.response_status === 'conflict' ? (
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  ) : (
                    <Clock className="w-6 h-6 text-blue-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 capitalize">
                      {rosterData.response_status === 'acknowledged'
                        ? 'Roster Acknowledged'
                        : rosterData.response_status === 'conflict'
                        ? 'Conflict Reported'
                        : 'Awaiting Your Acknowledgement'}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-600">
                      v{rosterData.version_number}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-1">
                    {rosterData.response_status === 'acknowledged'
                      ? `You confirmed this roster on ${new Date(rosterData.responded_at).toLocaleDateString('en-NZ')}.`
                      : rosterData.response_status === 'conflict'
                      ? `Reason: ${rosterData.response_reason}`
                      : 'Please review all shifts below and confirm your schedule.'}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2 sm:pt-0">
                {rosterData.response_status !== 'acknowledged' && (
                  <button
                    id="acknowledge-roster-btn"
                    type="button"
                    onClick={handleAcknowledge}
                    disabled={actionLoading}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Acknowledge Roster</span>
                  </button>
                )}

                {rosterData.response_status !== 'conflict' && (
                  <button
                    id="report-conflict-btn"
                    type="button"
                    onClick={() => setConflictModalOpen(true)}
                    disabled={actionLoading}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-amber-300 text-amber-900 hover:bg-amber-50 rounded-xl text-xs font-medium transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Report Conflict</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Shifts container or No Shifts Assigned */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-base">Published Shifts</h3>
              <span className="text-xs text-slate-500 font-medium">
                {rosterData.shift_count} shift{rosterData.shift_count !== 1 ? 's' : ''} assigned
              </span>
            </div>

            {!rosterData.has_shifts || rosterData.shifts.length === 0 ? (
              <div id="no-shifts-assigned-card" className="p-12 text-center space-y-2 bg-slate-50/50">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-base font-semibold text-slate-800">No shifts assigned</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  You are not scheduled for any shifts this week. Please still acknowledge your roster schedule above.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {Array.from({ length: 7 }, (_, dayIdx) => {
                  const dayShifts = rosterData.shifts.filter((s: any) => s.start_day_of_week === dayIdx);
                  if (dayShifts.length === 0) return null;

                  return (
                    <div key={dayIdx} className="p-4 sm:p-5">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                        {getDayDateStr(selectedWeek, dayIdx)}
                      </div>

                      <div className="space-y-2.5">
                        {dayShifts.map((shift: any) => (
                          <div
                            key={shift.id}
                            id={`staff-shift-card-${shift.id}`}
                            className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-base font-bold text-slate-900">
                                  {formatTimeToNZ(shift.start_datetime)} – {formatTimeToNZ(shift.finish_datetime)}
                                </span>
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700">
                                  {calculateShiftDuration(shift.start_datetime, shift.finish_datetime)}
                                </span>
                                {shift.label && (
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                                    {shift.label}
                                  </span>
                                )}
                              </div>

                              {shift.notes && (
                                <p className="text-xs text-slate-600 mt-2 flex items-start gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                  <span>{shift.notes}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conflict report modal */}
      {rosterData?.snapshot_id && (
        <ConflictReportModal
          isOpen={conflictModalOpen}
          onClose={() => setConflictModalOpen(false)}
          snapshotId={rosterData.snapshot_id}
          onSuccess={() => loadPersonalRoster(selectedWeek)}
        />
      )}
    </div>
  );
};
