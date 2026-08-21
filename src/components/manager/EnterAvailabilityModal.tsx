import React, { useState } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { DAY_NAMES, getDayDateStr } from '../../lib/dateUtils.ts';
import type { AvailabilityWindow, DayOfWeekIndex } from '../../types/index.ts';
import { X, Clock, Plus, Trash2, Moon, MessageSquareText, Repeat } from 'lucide-react';

interface EnterAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
  weekStartDate: string;
  initialWindows?: AvailabilityWindow[];
  onSuccess: () => void;
}

export const EnterAvailabilityModal: React.FC<EnterAvailabilityModalProps> = ({
  isOpen,
  onClose,
  staffId,
  staffName,
  weekStartDate,
  initialWindows,
  onSuccess,
}) => {
  const [reason, setReason] = useState('Communicated manually via WhatsApp');
  const [repeatOption, setRepeatOption] = useState<'single' | '4weeks' | '8weeks' | '12weeks' | 'indefinite'>('single');
  const [windows, setWindows] = useState<AvailabilityWindow[]>(() => {
    if (initialWindows && initialWindows.length > 0) return initialWindows;
    return Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i as DayOfWeekIndex,
      type: 'unavailable',
      start_time: '08:00',
      finish_time: '17:00',
      is_overnight: false,
    }));
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleTypeChange = (dayIdx: number, type: 'unavailable' | 'all_day' | 'custom') => {
    setWindows((prev) => {
      const otherDays = prev.filter((w) => w.day_of_week !== dayIdx);
      if (type === 'custom') {
        return [
          ...otherDays,
          {
            day_of_week: dayIdx as DayOfWeekIndex,
            type: 'custom',
            start_time: '08:00',
            finish_time: '17:00',
            is_overnight: false,
          },
        ].sort((a, b) => a.day_of_week - b.day_of_week);
      } else {
        return [
          ...otherDays,
          { day_of_week: dayIdx as DayOfWeekIndex, type },
        ].sort((a, b) => a.day_of_week - b.day_of_week);
      }
    });
  };

  const handleTimeChange = (
    dayIdx: number,
    field: 'start_time' | 'finish_time',
    value: string,
    winIdx: number = 0
  ) => {
    setWindows((prev) => {
      const dayWins = prev.filter((w) => w.day_of_week === dayIdx);
      const otherWins = prev.filter((w) => w.day_of_week !== dayIdx);

      if (dayWins[winIdx]) {
        const target = { ...dayWins[winIdx], [field]: value };
        if (target.start_time && target.finish_time) {
          target.is_overnight = target.finish_time < target.start_time;
        }
        dayWins[winIdx] = target;
      }

      return [...otherWins, ...dayWins].sort((a, b) => a.day_of_week - b.day_of_week);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for updating availability on behalf of the staff member.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      let repeatWeeks = 1;
      if (repeatOption === '4weeks') repeatWeeks = 4;
      else if (repeatOption === '8weeks') repeatWeeks = 8;
      else if (repeatOption === '12weeks') repeatWeeks = 12;
      else if (repeatOption === 'indefinite') repeatWeeks = 16;

      await apiFetch('/api/availability/on-behalf', {
        method: 'POST',
        body: JSON.stringify({
          user_id: staffId,
          week_start_date: weekStartDate,
          reason: reason.trim(),
          windows,
          repeat_weeks: repeatWeeks,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to enter availability on behalf');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="on-behalf-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="on-behalf-modal-card" className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Enter Availability on Behalf</h2>
            <p className="text-xs text-slate-500">
              For {staffName} • Week of {weekStartDate}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="on-behalf-reason-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason / Communication Channel <span className="text-rose-500">*</span>
            </label>
            <input
              id="on-behalf-reason-input"
              type="text"
              required
              placeholder="e.g. Received availability update via WhatsApp from worker"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="space-y-3 pt-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Set Daily Availability
            </label>

            {Array.from({ length: 7 }, (_, dayIdx) => {
              const dayWins = windows.filter((w) => w.day_of_week === dayIdx);
              const primaryType = dayWins[0]?.type || 'unavailable';

              return (
                <div key={dayIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="text-xs font-semibold text-slate-900">
                      {DAY_NAMES[dayIdx]} ({getDayDateStr(weekStartDate, dayIdx)})
                    </div>

                    <div className="grid grid-cols-3 gap-1 p-1 bg-white rounded-lg border border-slate-200 max-w-xs w-full">
                      <button
                        type="button"
                        onClick={() => handleTypeChange(dayIdx, 'unavailable')}
                        className={`py-1 text-xs font-medium rounded-md transition-all ${
                          primaryType === 'unavailable' ? 'bg-slate-900 text-white' : 'text-slate-600'
                        }`}
                      >
                        Unavail
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTypeChange(dayIdx, 'all_day')}
                        className={`py-1 text-xs font-medium rounded-md transition-all ${
                          primaryType === 'all_day' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                        }`}
                      >
                        All Day
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTypeChange(dayIdx, 'custom')}
                        className={`py-1 text-xs font-medium rounded-md transition-all ${
                          primaryType === 'custom' ? 'bg-slate-900 text-white' : 'text-slate-600'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  </div>

                  {primaryType === 'custom' && (
                    <div className="space-y-2 pt-1">
                      {dayWins.map((win, winIdx) => {
                        const isOvernight = win.is_overnight || (win.start_time && win.finish_time && win.finish_time < win.start_time);
                        return (
                          <div key={winIdx} className="flex items-center gap-2 text-xs">
                            <input
                              type="time"
                              value={win.start_time || '08:00'}
                              onChange={(e) => handleTimeChange(dayIdx, 'start_time', e.target.value, winIdx)}
                              className="p-1 bg-white border border-slate-300 rounded-md text-xs"
                            />
                            <span>to</span>
                            <input
                              type="time"
                              value={win.finish_time || '17:00'}
                              onChange={(e) => handleTimeChange(dayIdx, 'finish_time', e.target.value, winIdx)}
                              className="p-1 bg-white border border-slate-300 rounded-md text-xs"
                            />
                            {isOvernight && (
                              <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-sm border border-purple-200">
                                Overnight
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Repeat Schedule & Duration Option */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Repeat className="w-3.5 h-3.5 text-[#5371FF]" />
              <span>Repeat Schedule / Duration</span>
            </div>
            <p className="text-[11px] text-slate-500">Apply this availability across future weeks automatically</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 pt-1">
              {[
                { id: 'single', label: '1 Week', sub: 'This only' },
                { id: '4weeks', label: '4 Weeks', sub: '1 month' },
                { id: '8weeks', label: '8 Weeks', sub: '2 months' },
                { id: '12weeks', label: '12 Weeks', sub: '3 months' },
                { id: 'indefinite', label: 'Ongoing', sub: '16 weeks' },
              ].map((opt) => {
                const isSelected = repeatOption === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRepeatOption(opt.id as any)}
                    className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#5371FF] bg-[#5371FF]/10 text-[#5371FF] font-bold ring-1 ring-[#5371FF]'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs">{opt.label}</div>
                    <div className="text-[9px] text-slate-400">{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="submit-on-behalf-btn"
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="py-2 px-4 rounded-xl bg-slate-900 text-white font-medium text-xs hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            {submitting ? 'Saving...' : repeatOption !== 'single' ? `Save & Repeat (${repeatOption === 'indefinite' ? 'Ongoing' : repeatOption})` : 'Save Availability & Log Reason'}
          </button>
        </div>
      </div>
    </div>
  );
};
