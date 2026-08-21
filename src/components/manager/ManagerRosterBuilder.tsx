import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { WeekNavigator } from '../common/WeekNavigator.tsx';
import { ShiftEditModal } from './ShiftEditModal.tsx';
import { PublishConfirmationModal } from './PublishConfirmationModal.tsx';
import {
  getCurrentMonday,
  DAY_NAMES,
  SHORT_DAY_NAMES,
  getDayDateStr,
  formatTimeToNZ,
  calculateShiftDuration,
  formatWeekRange,
} from '../../lib/dateUtils.ts';
import type { DraftShift, User } from '../../types/index.ts';
import {
  Calendar,
  Plus,
  Send,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Edit2,
  Sparkles,
  Users,
  Layers,
  X,
} from 'lucide-react';

export const ManagerRosterBuilder: React.FC = () => {
  const [selectedWeek, setSelectedWeek] = useState(getCurrentMonday());
  const [rosterData, setRosterData] = useState<any>(null);
  const [activeStaff, setActiveStaff] = useState<User[]>([]);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  // Shift Modal State
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftToEdit, setShiftToEdit] = useState<DraftShift | null>(null);
  const [defaultStaffId, setDefaultStaffId] = useState<string | undefined>();
  const [defaultDay, setDefaultDay] = useState<number>(0);

  // Publish Modal State
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  // Toast banner state
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((c) => (c?.text === text ? null : c));
    }, 4000);
  };

  const loadRoster = useCallback(async (week: string) => {
    try {
      setLoading(true);
      const [rosterRes, staffRes] = await Promise.all([
        apiFetch(`/api/rosters/week?week=${week}`),
        apiFetch<{ staff: User[] }>('/api/staff?status=active'),
      ]);

      setRosterData(rosterRes);
      setActiveStaff(staffRes.staff || []);
    } catch (err: any) {
      console.error('Failed to load roster builder:', err);
      showToast(err?.message || 'Failed to load roster', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoster(selectedWeek);
  }, [selectedWeek, loadRoster]);

  const handleOpenAddShift = (dayIdx: number, staffId?: string) => {
    setShiftToEdit(null);
    setDefaultDay(dayIdx);
    setDefaultStaffId(staffId);
    setShiftModalOpen(true);
  };

  const handleOpenEditShift = (shift: DraftShift) => {
    setShiftToEdit(shift);
    setShiftModalOpen(true);
  };

  const handleConfirmCopyPriorWeek = async () => {
    if (!rosterData?.roster_week?.id) return;

    try {
      setCopying(true);
      const res = await apiFetch<{ copied_shifts_count: number }>(
        `/api/rosters/${rosterData.roster_week.id}/copy-prior-week`,
        { method: 'POST' }
      );
      setCopyModalOpen(false);
      showToast(`Successfully copied ${res.copied_shifts_count} shifts from prior published roster.`, 'success');
      loadRoster(selectedWeek);
    } catch (err: any) {
      showToast(err?.message || 'Failed to copy prior week shifts', 'error');
    } finally {
      setCopying(false);
    }
  };

  const draftShifts: DraftShift[] = rosterData?.draft_shifts || rosterData?.shifts || [];
  const validationWarnings = rosterData?.validation?.warnings || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          id="roster-toast-banner"
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium border animate-in fade-in duration-150 ${
            toastMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-black/5 rounded-lg text-slate-500 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Roster Builder</h1>
            <span className="text-[10px] font-bold text-[#5371FF] bg-[#5371FF]/10 px-2 py-0.5 rounded-md border border-[#5371FF]/20 uppercase">
              TCG
            </span>
            {rosterData?.roster_week?.published_version_number > 0 ? (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#7FD858]/20 text-emerald-900 font-bold border border-[#7FD858]/40">
                Published v{rosterData.roster_week.published_version_number}
              </span>
            ) : (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                Draft
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Construct cleaning shifts with real-time availability validation and Auckland timezone compliance.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="copy-prior-week-shifts-btn"
            type="button"
            onClick={() => setCopyModalOpen(true)}
            disabled={copying || loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Copy className="w-4 h-4 text-slate-500" />
            <span>{copying ? 'Copying...' : 'Copy Prior Week'}</span>
          </button>

          <button
            id="open-add-shift-header-btn"
            type="button"
            onClick={() => handleOpenAddShift(selectedDayIdx)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Shift</span>
          </button>

          <button
            id="open-publish-modal-btn"
            type="button"
            onClick={() => setPublishModalOpen(true)}
            disabled={loading || draftShifts.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#5371FF] to-[#5095FC] hover:from-[#4360ee] hover:to-[#3e86f5] text-white text-xs font-bold transition-all shadow-md shadow-[#5371FF]/20 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>
              {rosterData?.roster_week?.published_version_number > 0
                ? 'Publish Revision'
                : 'Publish Roster'}
            </span>
          </button>
        </div>
      </div>

      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {/* Warnings Bar */}
      {validationWarnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="font-bold text-amber-950">
              {validationWarnings.length} Availability Warning{validationWarnings.length !== 1 ? 's' : ''} Detected
            </div>
            <p className="text-amber-800">
              Some shifts overlap unavailable hours or lack reported availability. Ensure override reasons are documented before publishing.
            </p>
          </div>
        </div>
      )}

      {/* Mobile Day Selector (Horizontal Pills) */}
      <div className="block lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          {Array.from({ length: 7 }, (_, dayIdx) => {
            const count = draftShifts.filter((s) => s.start_day_of_week === dayIdx).length;
            const isSelected = selectedDayIdx === dayIdx;

            return (
              <button
                key={dayIdx}
                type="button"
                onClick={() => setSelectedDayIdx(dayIdx)}
                className={`flex-1 min-w-[76px] py-2 px-2.5 rounded-xl border text-center transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">{SHORT_DAY_NAMES[dayIdx]}</div>
                <div className="text-xs font-semibold mt-0.5">{getDayDateStr(selectedWeek, dayIdx).split(', ')[1]}</div>
                <div
                  className={`text-[10px] font-medium mt-1 px-1.5 py-0.2 rounded-full inline-block ${
                    isSelected ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count} shift{count !== 1 ? 's' : ''}
                </div>
              </button>
            );
          })}
        </div>

        {/* Mobile Single Day View */}
        <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">{DAY_NAMES[selectedDayIdx]}</h3>
              <span className="text-xs text-slate-500">{getDayDateStr(selectedWeek, selectedDayIdx)}</span>
            </div>
            <button
              type="button"
              onClick={() => handleOpenAddShift(selectedDayIdx)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Shift
            </button>
          </div>

          <div className="p-4 divide-y divide-slate-100">
            {draftShifts.filter((s) => s.start_day_of_week === selectedDayIdx).length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No shifts scheduled for {DAY_NAMES[selectedDayIdx]}.
              </div>
            ) : (
              draftShifts
                .filter((s) => s.start_day_of_week === selectedDayIdx)
                .map((shift) => (
                  <div
                    key={shift.id}
                    onClick={() => handleOpenEditShift(shift)}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {shift.user_name || shift.staff_name || 'Staff Member'}
                        </span>
                        {shift.label && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                            {shift.label}
                          </span>
                        )}
                        {(shift.is_contained_in_availability ?? shift.is_contained ?? true) ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-sm border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> Override
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-mono font-semibold text-slate-600 mt-1">
                        {formatTimeToNZ(shift.start_datetime)} – {formatTimeToNZ(shift.finish_datetime)}{' '}
                        <span className="font-sans font-normal text-slate-400">
                          ({calculateShiftDuration(shift.start_datetime, shift.finish_datetime)})
                        </span>
                      </div>

                      {shift.override_reason && (
                        <div className="text-[11px] text-amber-800 mt-1 italic">
                          Reason: {shift.override_reason}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 group-hover:text-slate-900 group-hover:bg-slate-100"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Desktop Roster Matrix View (7 Days Grid) */}
      <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 divide-x divide-slate-200 text-center">
          {Array.from({ length: 7 }, (_, dayIdx) => (
            <div key={dayIdx} className="p-3.5">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {SHORT_DAY_NAMES[dayIdx]}
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5">
                {getDayDateStr(selectedWeek, dayIdx).split(', ')[1]}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 divide-x divide-slate-200 min-h-[460px] bg-slate-50/30">
          {Array.from({ length: 7 }, (_, dayIdx) => {
            const dayShifts = draftShifts.filter((s) => s.start_day_of_week === dayIdx);

            return (
              <div key={dayIdx} className="p-2 space-y-2 flex flex-col justify-between">
                <div className="space-y-2">
                  {dayShifts.map((shift) => (
                    <div
                      key={shift.id}
                      onClick={() => handleOpenEditShift(shift)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer hover:shadow-xs transition-all ${
                        (shift.is_contained_in_availability ?? shift.is_contained ?? true)
                          ? 'bg-white border-slate-200 text-slate-800'
                          : 'bg-amber-50/80 border-amber-300 text-amber-950'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-bold text-slate-900 truncate block">
                          {shift.user_name || shift.staff_name || 'Staff Member'}
                        </span>
                        {(shift.is_contained_in_availability ?? shift.is_contained ?? true) ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        )}
                      </div>

                      <div className="font-mono font-semibold text-[11px] text-slate-700 mt-1">
                        {formatTimeToNZ(shift.start_datetime)} - {formatTimeToNZ(shift.finish_datetime)}
                      </div>

                      {shift.label && (
                        <div className="mt-1">
                          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded-sm bg-blue-100 text-blue-800">
                            {shift.label}
                          </span>
                        </div>
                      )}

                      {shift.override_reason && (
                        <div className="mt-1 text-[10px] text-amber-800 truncate" title={shift.override_reason}>
                          ⚠️ {shift.override_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddShift(dayIdx)}
                  className="w-full py-2 border border-dashed border-slate-300 hover:border-slate-400 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-medium flex items-center justify-center gap-1 transition-colors bg-white/50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Shift</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shift Edit/Create Modal */}
      {shiftModalOpen && (
        <ShiftEditModal
          isOpen={shiftModalOpen}
          onClose={() => setShiftModalOpen(false)}
          rosterWeekId={rosterData.roster_week.id}
          weekStartDate={selectedWeek}
          draftRevisionNumber={rosterData.roster_week.draft_revision_number}
          activeStaff={activeStaff}
          shiftToEdit={shiftToEdit}
          defaultDayIndex={defaultDay}
          defaultUserId={defaultStaffId}
          onSuccess={() => loadRoster(selectedWeek)}
        />
      )}

      {/* Copy Prior Week Confirmation Modal */}
      {copyModalOpen && (
        <div id="copy-prior-week-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div id="copy-prior-week-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <Copy className="w-5 h-5 text-slate-800" />
                  <h2 className="text-base font-semibold text-slate-900">Copy Prior Week Roster</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCopyModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Copy published shifts from the previous week into this week ({selectedWeek})?
                </p>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">What happens next:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Creates draft shifts matching the roles and times from last week's published roster.</li>
                    <li>Re-evaluates each assigned worker's availability for the new dates.</li>
                    <li>Highlights any availability conflicts as warnings for review before publishing.</li>
                  </ul>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCopyModalOpen(false)}
                    disabled={copying}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-copy-prior-week-btn"
                    type="button"
                    onClick={handleConfirmCopyPriorWeek}
                    disabled={copying}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm transition-colors shadow-xs disabled:opacity-50"
                  >
                    {copying ? 'Copying...' : 'Copy Shifts'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      {publishModalOpen && (
        <PublishConfirmationModal
          isOpen={publishModalOpen}
          onClose={() => setPublishModalOpen(false)}
          rosterWeekId={rosterData.roster_week.id}
          weekStartDate={selectedWeek}
          draftRevisionNumber={rosterData.roster_week.draft_revision_number}
          totalShiftsCount={draftShifts.length}
          activeStaffCount={activeStaff.length}
          isInitialPublish={!(rosterData.roster_week.published_version_number > 0)}
          warnings={validationWarnings}
          onSuccess={() => loadRoster(selectedWeek)}
        />
      )}
    </div>
  );
};
