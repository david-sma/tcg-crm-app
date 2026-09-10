import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { WeekNavigator } from '../common/WeekNavigator.tsx';
import {
  getCurrentMonday,
  getDefaultActiveMonday,
  DAY_NAMES,
  getDayDateStr,
  formatTimeToNZ,
  calculateShiftDuration,
} from '../../lib/dateUtils.ts';
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
  Check,
  Flag,
} from 'lucide-react';

interface StaffRosterViewProps {
  initialWeek?: string;
}

export const StaffRosterView: React.FC<StaffRosterViewProps> = ({ initialWeek }) => {
  const [selectedWeek, setSelectedWeek] = useState(initialWeek || getDefaultActiveMonday());
  const [rosterData, setRosterData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeShiftLoadingId, setActiveShiftLoadingId] = useState<string | null>(null);

  // Conflict modal state (can be for whole roster or a specific shift)
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictShiftTarget, setConflictShiftTarget] = useState<{
    id: string;
    dateStr: string;
    timeStr: string;
    label?: string;
  } | null>(null);

  const [error, setError] = useState('');
  const [successToast, setSuccessToast] = useState('');

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => {
      setSuccessToast((prev) => (prev === msg ? '' : prev));
    }, 4000);
  };

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

  // Accept all pending shifts (top banner action)
  const handleAcceptAllShifts = async () => {
    if (!rosterData?.snapshot_id) return;
    try {
      setActionLoading(true);
      setError('');
      await apiFetch('/api/personal-roster/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ snapshot_id: rosterData.snapshot_id }),
      });
      showToast('All shifts confirmed successfully!');
      loadPersonalRoster(selectedWeek);
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm all shifts');
    } finally {
      setActionLoading(false);
    }
  };

  // Per-shift acknowledge
  const handleAcknowledgeSingleShift = async (shiftId: string) => {
    if (!rosterData?.snapshot_id) return;
    try {
      setActiveShiftLoadingId(shiftId);
      setError('');
      await apiFetch('/api/personal-roster/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ snapshot_id: rosterData.snapshot_id, shift_id: shiftId }),
      });
      showToast('Shift confirmed successfully.');
      loadPersonalRoster(selectedWeek);
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm shift');
    } finally {
      setActiveShiftLoadingId(null);
    }
  };

  const openShiftConflictModal = (shift: any, dayIdx: number) => {
    const dateStr = getDayDateStr(selectedWeek, dayIdx);
    const timeStr = `${formatTimeToNZ(shift.start_datetime)} – ${formatTimeToNZ(shift.finish_datetime)}`;
    setConflictShiftTarget({
      id: shift.id,
      dateStr,
      timeStr,
      label: shift.label,
    });
    setConflictModalOpen(true);
  };

  const shiftsList = rosterData?.shifts || [];
  const pendingShiftsCount = shiftsList.filter(
    (s: any) => s.response_status === 'pending' || !s.response_status
  ).length;
  const conflictShiftsCount = shiftsList.filter((s: any) => s.response_status === 'conflict').length;
  const acknowledgedShiftsCount = shiftsList.filter((s: any) => s.response_status === 'acknowledged').length;
  const totalShiftsCount = shiftsList.length;
  const isFullyConfirmed = totalShiftsCount > 0 && acknowledgedShiftsCount === totalShiftsCount;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">My Weekly Roster</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review and confirm your shifts.
          </p>
        </div>
      </div>

      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {successToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

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
          {/* Summary / Status & Accept All Shifts Banner */}
          <div
            className={`p-5 rounded-2xl border shadow-xs transition-all ${
              isFullyConfirmed || (totalShiftsCount === 0 && rosterData.response_status === 'acknowledged')
                ? 'bg-emerald-50/70 border-emerald-200'
                : conflictShiftsCount > 0
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-blue-50/70 border-blue-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5">
                  {isFullyConfirmed || (totalShiftsCount === 0 && rosterData.response_status === 'acknowledged') ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  ) : conflictShiftsCount > 0 ? (
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  ) : (
                    <Clock className="w-6 h-6 text-blue-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      {isFullyConfirmed
                        ? 'All Shifts Confirmed'
                        : totalShiftsCount === 0
                        ? 'No Shifts Scheduled'
                        : conflictShiftsCount > 0
                        ? 'Shift Conflict Reported'
                        : 'Awaiting Confirmation'}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-600">
                      v{rosterData.version_number}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-1">
                    {isFullyConfirmed
                      ? `All shifts confirmed.`
                      : totalShiftsCount === 0
                      ? 'No shifts assigned for this week.'
                      : conflictShiftsCount > 0
                      ? `${conflictShiftsCount} conflict reported.${pendingShiftsCount > 0 ? ` ${pendingShiftsCount} pending.` : ''}`
                      : `${pendingShiftsCount} shift${pendingShiftsCount !== 1 ? 's' : ''} awaiting confirmation.`}
                  </p>
                </div>
              </div>

              {/* Accept All Shifts Button */}
              {pendingShiftsCount > 0 && (
                <div className="flex items-center gap-2 pt-2 sm:pt-0">
                  <button
                    id="accept-all-shifts-btn"
                    type="button"
                    onClick={handleAcceptAllShifts}
                    disabled={actionLoading}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{actionLoading ? 'Confirming...' : `Accept All (${pendingShiftsCount})`}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Shifts Container with per-shift responses */}
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
                  You are not scheduled for any shifts this week.
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

                      <div className="space-y-3">
                        {dayShifts.map((shift: any) => {
                          const isShiftAcknowledged = shift.response_status === 'acknowledged';
                          const isShiftConflict = shift.response_status === 'conflict';
                          const isShiftPending = !shift.response_status || shift.response_status === 'pending';
                          const isShiftBusy = activeShiftLoadingId === shift.id;

                          return (
                            <div
                              key={shift.id}
                              id={`staff-shift-card-${shift.id}`}
                              className={`p-4 rounded-xl border transition-all ${
                                isShiftAcknowledged
                                  ? 'bg-emerald-50/40 border-emerald-200/80'
                                  : isShiftConflict
                                  ? 'bg-amber-50/40 border-amber-200/80'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-base font-bold text-slate-900">
                                      {formatTimeToNZ(shift.start_datetime)} – {formatTimeToNZ(shift.finish_datetime)}
                                    </span>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700">
                                      {calculateShiftDuration(shift.start_datetime, shift.finish_datetime)}
                                    </span>

                                    {/* Shift Status Badge */}
                                    {isShiftAcknowledged && (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        <span>Confirmed</span>
                                      </span>
                                    )}

                                    {isShiftConflict && (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                                        <span>Conflict</span>
                                      </span>
                                    )}

                                    {isShiftPending && (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300">
                                        <Clock className="w-3 h-3 text-blue-600" />
                                        <span>Pending</span>
                                      </span>
                                    )}

                                    {shift.label && (
                                      <div className="flex flex-wrap gap-1">
                                        {shift.label.split(',').map((tag: string, idx: number) => {
                                          const trimmed = tag.trim();
                                          if (!trimmed) return null;
                                          return (
                                            <span
                                              key={idx}
                                              className="text-xs font-medium px-2 py-0.5 rounded-md bg-[#5371FF]/10 text-[#5371FF] border border-[#5371FF]/25"
                                            >
                                              {trimmed}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  {shift.notes && (
                                    <p className="text-xs text-slate-600 mt-2 flex items-start gap-1.5">
                                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                      <span>{shift.notes}</span>
                                    </p>
                                  )}

                                  {isShiftConflict && shift.response_reason && (
                                    <div className="mt-2 p-2 bg-amber-100/60 rounded-lg text-xs text-amber-900 border border-amber-200 flex items-start gap-1.5">
                                      <Flag className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-semibold">Reason:</span> {shift.response_reason}
                                        {shift.response_note && (
                                          <div className="text-[11px] text-amber-800 mt-0.5">
                                            "{shift.response_note}"
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Shift Action Buttons */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {!isShiftAcknowledged && (
                                    <button
                                      type="button"
                                      onClick={() => handleAcknowledgeSingleShift(shift.id)}
                                      disabled={isShiftBusy}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>{isShiftBusy ? 'Confirming...' : 'Confirm'}</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => openShiftConflictModal(shift, dayIdx)}
                                    disabled={isShiftBusy}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                      isShiftConflict
                                        ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                    <span>{isShiftConflict ? 'Edit' : 'Conflict'}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
          shiftId={conflictShiftTarget?.id || null}
          shiftDetails={conflictShiftTarget}
          onSuccess={() => {
            showToast('Conflict report submitted to manager.');
            loadPersonalRoster(selectedWeek);
          }}
        />
      )}
    </div>
  );
};
