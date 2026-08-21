import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { DAY_NAMES, getDayDateStr, formatTimeToNZ } from '../../lib/dateUtils.ts';
import type { DraftShift, User } from '../../types/index.ts';
import { X, Clock, AlertTriangle, Trash2, ShieldAlert } from 'lucide-react';

interface ShiftEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  rosterWeekId: string;
  weekStartDate: string;
  draftRevisionNumber: number;
  activeStaff: User[];
  shiftToEdit?: DraftShift | null;
  defaultDayIndex?: number;
  defaultUserId?: string;
  onSuccess: () => void;
}

export const ShiftEditModal: React.FC<ShiftEditModalProps> = ({
  isOpen,
  onClose,
  rosterWeekId,
  weekStartDate,
  draftRevisionNumber,
  activeStaff,
  shiftToEdit,
  defaultDayIndex = 0,
  defaultUserId,
  onSuccess,
}) => {
  const [userId, setUserId] = useState<string>(
    shiftToEdit?.user_id || defaultUserId || (activeStaff.length > 0 ? activeStaff[0].id : '')
  );
  const [dayIndex, setDayIndex] = useState<number>(shiftToEdit?.start_day_of_week ?? defaultDayIndex ?? 0);
  const [startTime, setStartTime] = useState<string>(
    shiftToEdit ? formatTimeToNZ(shiftToEdit.start_datetime) : '08:00'
  );
  const [finishTime, setFinishTime] = useState<string>(
    shiftToEdit ? formatTimeToNZ(shiftToEdit.finish_datetime) : '17:00'
  );
  const [label, setLabel] = useState(shiftToEdit?.label || '');
  const [notes, setNotes] = useState(shiftToEdit?.notes || '');
  const [overrideReason, setOverrideReason] = useState(shiftToEdit?.override_reason || '');

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (shiftToEdit) {
      setUserId(shiftToEdit.user_id);
      setDayIndex(shiftToEdit.start_day_of_week);
      setStartTime(formatTimeToNZ(shiftToEdit.start_datetime));
      setFinishTime(formatTimeToNZ(shiftToEdit.finish_datetime));
      setLabel(shiftToEdit.label || '');
      setNotes(shiftToEdit.notes || '');
      setOverrideReason(shiftToEdit.override_reason || '');
    } else {
      if (defaultUserId) {
        setUserId(defaultUserId);
      } else if (activeStaff.length > 0) {
        setUserId((current) => (current && activeStaff.some((s) => s.id === current) ? current : activeStaff[0].id));
      }
      setDayIndex(defaultDayIndex ?? 0);
      setStartTime('08:00');
      setFinishTime('17:00');
      setLabel('');
      setNotes('');
      setOverrideReason('');
    }
    setError('');
    setConfirmDelete(false);
  }, [shiftToEdit, defaultUserId, defaultDayIndex, activeStaff, isOpen]);

  if (!isOpen) return null;

  // Detect overnight
  const isNight = finishTime <= startTime;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!userId) {
      setError('Please select a staff member.');
      return;
    }
    if (!startTime || !finishTime) {
      setError('Start time and finish time are required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      if (shiftToEdit) {
        // Edit existing
        await apiFetch(`/api/rosters/shifts/${shiftToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            user_id: userId,
            start_day_of_week: dayIndex,
            start_time: startTime,
            finish_time: finishTime,
            is_overnight: isNight,
            label: label.trim() || null,
            notes: notes.trim() || null,
            override_reason: overrideReason.trim() || null,
            draft_revision_number: draftRevisionNumber,
          }),
        });
      } else {
        // Create new
        await apiFetch('/api/rosters/shifts', {
          method: 'POST',
          body: JSON.stringify({
            roster_week_id: rosterWeekId,
            user_id: userId,
            start_day_of_week: dayIndex,
            start_time: startTime,
            finish_time: finishTime,
            is_overnight: isNight,
            label: label.trim() || null,
            notes: notes.trim() || null,
            override_reason: overrideReason.trim() || null,
            draft_revision_number: draftRevisionNumber,
          }),
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save shift:', err);
      setError(err?.message || 'Failed to save shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!shiftToEdit) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      setDeleting(true);
      await apiFetch(`/api/rosters/shifts/${shiftToEdit.id}`, {
        method: 'DELETE',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete shift');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div id="shift-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="shift-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-100 text-slate-800">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {shiftToEdit ? 'Edit Roster Shift' : 'Create Roster Shift'}
              </h2>
              <p className="text-xs text-slate-500">Week of {weekStartDate}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="shift-edit-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div id="shift-modal-error-banner" className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
              {error}
            </div>
          )}

          {/* Staff Member Selection */}
          <div>
            <label htmlFor="shift-staff-select" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Assigned Staff Member <span className="text-rose-500">*</span>
            </label>
            <select
              id="shift-staff-select"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            >
              {activeStaff.length === 0 ? (
                <option value="" disabled>No staff available</option>
              ) : (
                activeStaff.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} ({staff.phone_e164}) {staff.role === 'manager' ? '• Manager' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Day Selection */}
          <div>
            <label htmlFor="shift-day-select" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Starting Day <span className="text-rose-500">*</span>
            </label>
            <select
              id="shift-day-select"
              value={dayIndex}
              onChange={(e) => setDayIndex(Number(e.target.value))}
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            >
              {DAY_NAMES.map((name, idx) => (
                <option key={idx} value={idx}>
                  {name} ({getDayDateStr(weekStartDate, idx)})
                </option>
              ))}
            </select>
          </div>

          {/* Time pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="shift-start-time-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Start Time <span className="text-rose-500">*</span>
              </label>
              <input
                id="shift-start-time-input"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label htmlFor="shift-finish-time-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Finish Time <span className="text-rose-500">*</span>
              </label>
              <input
                id="shift-finish-time-input"
                type="time"
                value={finishTime}
                onChange={(e) => setFinishTime(e.target.value)}
                required
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {isNight && (
            <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center gap-2">
              <span className="font-semibold">Overnight Shift:</span>
              <span>Starts on {DAY_NAMES[dayIndex]} and finishes early next morning.</span>
            </div>
          )}

          {/* Label & Notes */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="shift-label-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Cleaning Job / Shift Label
              </label>
              <span className="text-[10px] text-slate-400">Quick presets</span>
            </div>
            
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                'Residential Clean',
                'Office / Commercial',
                'End of Tenancy',
                'Carpet & Deep Clean',
                'Builders Clean',
                'Rubbish Removal',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLabel(preset)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-all cursor-pointer ${
                    label === preset
                      ? 'bg-sky-100 text-sky-800 border-sky-300 font-semibold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <input
              id="shift-label-input"
              type="text"
              placeholder="e.g. Residential Clean, Office Clean, Lead Specialist"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-600"
            />
          </div>

          <div>
            <label htmlFor="shift-notes-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Site / Job Notes (Visible to Staff)
            </label>
            <textarea
              id="shift-notes-input"
              rows={2}
              placeholder="e.g. Bring keycard, carpet steamer, or meet at Morrin Rd depot"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-600"
            />
          </div>

          {/* Override Reason input */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>Availability Override Reason</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              If this shift falls outside the worker's reported availability (or if availability is missing), an explicit override reason is mandatory before publication.
            </p>
            <input
              id="shift-override-reason-input"
              type="text"
              placeholder="e.g. Worker agreed verbally to cover extra shift"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </form>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
          {shiftToEdit ? (
            <button
              id="delete-shift-btn"
              type="button"
              onClick={handleDelete}
              disabled={deleting || submitting}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl transition-colors ${
                confirmDelete
                  ? 'bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs'
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>{deleting ? 'Removing...' : confirmDelete ? 'Confirm Remove?' : 'Delete'}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              id="submit-shift-btn"
              type="submit"
              form="shift-edit-form"
              disabled={submitting || deleting}
              className="py-2 px-4 rounded-xl bg-slate-900 text-white font-medium text-xs hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50"
            >
              {submitting ? 'Saving...' : shiftToEdit ? 'Update Shift' : 'Create Shift'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
