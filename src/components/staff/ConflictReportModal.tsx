import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';

interface ConflictReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshotId: string;
  shiftId?: string | null;
  shiftDetails?: { dateStr?: string; timeStr?: string; label?: string } | null;
  onSuccess: () => void;
}

export const ConflictReportModal: React.FC<ConflictReportModalProps> = ({
  isOpen,
  onClose,
  snapshotId,
  shiftId,
  shiftDetails,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for the conflict.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await apiFetch('/api/personal-roster/conflict', {
        method: 'POST',
        body: JSON.stringify({
          snapshot_id: snapshotId,
          shift_id: shiftId || undefined,
          reason: reason.trim(),
          note: note.trim() || undefined,
        }),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to report conflict');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="conflict-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="conflict-modal-card" className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2.5 text-amber-600">
              <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {shiftId ? 'Report Shift Conflict' : 'Report Roster Conflict'}
                </h2>
                {shiftDetails && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {shiftDetails.dateStr} • {shiftDetails.timeStr}
                    {shiftDetails.label ? ` (${shiftDetails.label})` : ''}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="conflict-reason-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Reason for Conflict <span className="text-rose-500">*</span>
              </label>
              <select
                id="conflict-reason-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                required
              >
                <option value="">Select a reason...</option>
                <option value="Unavailability overlap / Prior commitment">Unavailability overlap / Prior commitment</option>
                <option value="Medical / Health appointment">Medical / Health appointment</option>
                <option value="Family / Childcare responsibility">Family / Childcare responsibility</option>
                <option value="Transport / Commute constraint">Transport / Commute constraint</option>
                <option value="Double booked with study / other work">Double booked with study / other work</option>
                <option value="Other constraint">Other constraint</option>
              </select>
            </div>

            <div>
              <label htmlFor="conflict-note-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Additional Details (Optional)
              </label>
              <textarea
                id="conflict-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Explain the specific conflict or alternative times you can work..."
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 leading-relaxed border border-slate-200">
              Your manager will be notified immediately of this {shiftId ? 'shift' : 'roster'} conflict report to review adjustments.
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="submit-conflict-btn"
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 text-white font-medium text-sm hover:bg-amber-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Submitting...' : 'Submit Conflict'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
