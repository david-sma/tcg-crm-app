import React, { useState } from 'react';
import { Send, AlertTriangle, ShieldCheck, Check, X, Users, Calendar } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatWeekRange } from '../../lib/dateUtils.ts';

interface PublishConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  rosterWeekId: string;
  weekStartDate: string;
  draftRevisionNumber: number;
  totalShiftsCount: number;
  activeStaffCount: number;
  isInitialPublish: boolean;
  warnings: Array<{ type: string; message: string; shift_id?: string; user_name?: string }>;
  onSuccess: () => void;
}

export const PublishConfirmationModal: React.FC<PublishConfirmationModalProps> = ({
  isOpen,
  onClose,
  rosterWeekId,
  weekStartDate,
  draftRevisionNumber,
  totalShiftsCount,
  activeStaffCount,
  isInitialPublish,
  warnings,
  onSuccess,
}) => {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handlePublish = async () => {
    try {
      setPublishing(true);
      setError('');
      await apiFetch(`/api/rosters/${rosterWeekId}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          draft_revision_number: draftRevisionNumber,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to publish roster');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div id="publish-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="publish-modal-card" className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isInitialPublish ? 'Publish Weekly Roster' : 'Publish Roster Revision'}
              </h2>
              <p className="text-xs text-slate-500">Week of {formatWeekRange(weekStartDate)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
              {error}
            </div>
          )}

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-slate-600" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Total Shifts</div>
                <div className="text-base font-bold text-slate-900">{totalShiftsCount} shifts</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-slate-600" />
              <div>
                <div className="text-xs text-slate-500 font-medium">Active Staff Count</div>
                <div className="text-base font-bold text-slate-900">{activeStaffCount} members</div>
              </div>
            </div>
          </div>

          {/* Warnings list if any */}
          {warnings.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Notice: {warnings.length} Shift Warning{warnings.length !== 1 ? 's' : ''} Detected</span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 divide-y divide-amber-200/50">
                {warnings.map((warn, i) => (
                  <div key={i} className="py-1.5 first:pt-0 last:pb-0">
                    <span className="font-semibold">{warn.user_name ? `${warn.user_name}: ` : ''}</span>
                    <span>{warn.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900 font-medium">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>All scheduled shifts comply cleanly with staff availability.</span>
            </div>
          )}

          <div className="p-3.5 bg-slate-50 rounded-xl text-xs text-slate-600 leading-relaxed border border-slate-200">
            {isInitialPublish ? (
              <span>
                Publishing will generate an immutable roster version (v1), dispatch in-app notifications and web push alerts to all staff, and open acknowledgements.
              </span>
            ) : (
              <span>
                Publishing this revision will update the official roster to the next version number. Only workers whose shifts were added, removed, or changed will receive revision alerts.
              </span>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            id="confirm-publish-btn"
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 transition-colors shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{publishing ? 'Publishing...' : isInitialPublish ? 'Confirm & Publish Roster' : 'Publish Revision'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
