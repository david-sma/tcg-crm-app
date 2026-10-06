import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { WeekNavigator } from '../common/WeekNavigator.tsx';
import { getDefaultActiveMonday, DAY_NAMES, getDayDateStr, formatTimestampLocal } from '../../lib/dateUtils.ts';
import type { AvailabilityWindow, DayOfWeekIndex } from '../../types/index.ts';
import { Clock, Copy, Check, Save, Plus, Trash2, AlertCircle, Sparkles, Moon, Repeat, CalendarRange } from 'lucide-react';

export const StaffAvailability: React.FC = () => {
  const [selectedWeek, setSelectedWeek] = useState(getDefaultActiveMonday());
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [initialWindowsJson, setInitialWindowsJson] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [repeatOption, setRepeatOption] = useState<'single' | 'indefinite'>('single');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Initialize empty default 7 days
  const createDefaultWindows = (): AvailabilityWindow[] => {
    return Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i as DayOfWeekIndex,
      type: 'unavailable',
      start_time: '08:00',
      finish_time: '17:00',
      is_overnight: false,
    }));
  };

  const loadAvailability = useCallback(async (week: string) => {
    try {
      setLoading(true);
      setMessage(null);
      const data = await apiFetch(`/api/availability/me?week=${week}`);

      if (data.availability?.windows && data.availability.windows.length > 0) {
        // Map stored windows to 7 days
        const rawWindows = data.availability.windows as AvailabilityWindow[];
        setWindows(rawWindows);
        setInitialWindowsJson(JSON.stringify(rawWindows));
        setVersionNumber(data.availability.version?.version_number || null);
        setLastUpdated(data.availability.version?.created_at || null);
      } else {
        const defaults = createDefaultWindows();
        setWindows(defaults);
        setInitialWindowsJson(JSON.stringify(defaults));
        setVersionNumber(null);
        setLastUpdated(null);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to load availability' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAvailability(selectedWeek);
  }, [selectedWeek, loadAvailability]);

  const hasUnsavedChanges = JSON.stringify(windows) !== initialWindowsJson;

  const handleTypeChange = (dayIndex: number, type: 'unavailable' | 'all_day' | 'custom') => {
    setWindows((prev) => {
      // Find all windows for this day
      const otherDays = prev.filter((w) => w.day_of_week !== dayIndex);
      if (type === 'custom') {
        return [
          ...otherDays,
          {
            day_of_week: dayIndex as DayOfWeekIndex,
            type: 'custom',
            start_time: '08:00',
            finish_time: '17:00',
            is_overnight: false,
          },
        ].sort((a, b) => a.day_of_week - b.day_of_week);
      } else {
        return [
          ...otherDays,
          {
            day_of_week: dayIndex as DayOfWeekIndex,
            type,
          },
        ].sort((a, b) => a.day_of_week - b.day_of_week);
      }
    });
  };

  const handleTimeChange = (
    dayIndex: number,
    field: 'start_time' | 'finish_time',
    value: string,
    windowIndexInDay: number = 0
  ) => {
    setWindows((prev) => {
      const dayWindows = prev.filter((w) => w.day_of_week === dayIndex);
      const otherWindows = prev.filter((w) => w.day_of_week !== dayIndex);

      if (dayWindows[windowIndexInDay]) {
        const target = { ...dayWindows[windowIndexInDay], [field]: value };
        // Auto-detect overnight
        if (target.start_time && target.finish_time) {
          target.is_overnight = target.finish_time < target.start_time;
        }
        dayWindows[windowIndexInDay] = target;
      }

      return [...otherWindows, ...dayWindows].sort((a, b) => a.day_of_week - b.day_of_week);
    });
  };

  const handleAddWindow = (dayIndex: number) => {
    setWindows((prev) => [
      ...prev,
      {
        day_of_week: dayIndex as DayOfWeekIndex,
        type: 'custom',
        start_time: '18:00',
        finish_time: '22:00',
        is_overnight: false,
      },
    ]);
  };

  const handleRemoveWindow = (dayIndex: number, windowIndexInDay: number) => {
    setWindows((prev) => {
      const dayWindows = prev.filter((w) => w.day_of_week === dayIndex);
      const otherWindows = prev.filter((w) => w.day_of_week !== dayIndex);

      dayWindows.splice(windowIndexInDay, 1);
      if (dayWindows.length === 0) {
        dayWindows.push({ day_of_week: dayIndex as DayOfWeekIndex, type: 'unavailable' });
      }

      return [...otherWindows, ...dayWindows].sort((a, b) => a.day_of_week - b.day_of_week);
    });
  };

  const handleCopyPreviousWeek = async () => {
    try {
      setCopying(true);
      setMessage(null);
      const data = await apiFetch(`/api/availability/copy-previous?week=${selectedWeek}`);

      if (data.windows && data.windows.length > 0) {
        setWindows(data.windows);
        setMessage({
          type: 'info',
          text: `Loaded availability from previous week (${data.copied_from_week}). Review your days and click "Save Availability" to submit.`,
        });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'No availability found in the previous week to copy.',
      });
    } finally {
      setCopying(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      // Convert repeatOption to number of weeks (1 week vs 104 weeks ongoing ~ 2 years)
      const repeatWeeks = repeatOption === 'indefinite' ? 104 : 1;

      const response = await apiFetch('/api/availability/me', {
        method: 'POST',
        body: JSON.stringify({
          week_start_date: selectedWeek,
          windows,
          repeat_weeks: repeatWeeks,
        }),
      });

      setInitialWindowsJson(JSON.stringify(windows));
      
      if (repeatWeeks > 1) {
        setMessage({
          type: 'success',
          text: `Availability saved as your ongoing regular routine starting from ${selectedWeek}!`,
        });
      } else {
        setMessage({ type: 'success', text: 'Availability saved for this week successfully!' });
      }

      loadAvailability(selectedWeek);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to save availability' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">My Weekly Availability</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Set your available hours for the week.
          </p>
        </div>

        <button
          id="copy-previous-week-btn"
          type="button"
          onClick={handleCopyPreviousWeek}
          disabled={copying || saving}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm transition-colors shadow-xs shrink-0"
        >
          <Copy className="w-4 h-4 text-slate-500" />
          <span>{copying ? 'Copying...' : 'Copy Previous Week'}</span>
        </button>
      </div>

      {/* Week selection */}
      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {/* Status banner */}
      {message && (
        <div
          className={`p-4 rounded-xl text-sm flex items-start gap-3 border ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : message.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          {message.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">{message.text}</div>
        </div>
      )}

      {/* Unsaved changes notice */}
      {hasUnsavedChanges && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-amber-900 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-medium">You have unsaved changes.</span>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 bg-amber-600 text-white font-medium rounded-lg text-xs hover:bg-amber-700 transition-colors shadow-xs"
          >
            {saving ? 'Saving...' : 'Save Now'}
          </button>
        </div>
      )}

      {/* Days editor */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 shadow-xs overflow-hidden">
        {Array.from({ length: 7 }, (_, dayIdx) => {
          const dayWindows = windows.filter((w) => w.day_of_week === dayIdx);
          const primaryType = dayWindows[0]?.type || 'unavailable';

          return (
            <div key={dayIdx} id={`day-availability-row-${dayIdx}`} className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900 text-base">{DAY_NAMES[dayIdx]}</h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {getDayDateStr(selectedWeek, dayIdx)}
                  </span>
                </div>

                {/* Day options buttons */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl max-w-xs w-full">
                  <button
                    type="button"
                    onClick={() => handleTypeChange(dayIdx, 'unavailable')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all text-center ${
                      primaryType === 'unavailable'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Unavailable
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange(dayIdx, 'all_day')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all text-center ${
                      primaryType === 'all_day'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Day
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTypeChange(dayIdx, 'custom')}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all text-center ${
                      primaryType === 'custom'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Window details */}
              {primaryType === 'all_day' && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-emerald-900 text-xs flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Available entire day (00:00 – 24:00)</span>
                </div>
              )}

              {primaryType === 'custom' && (
                <div className="space-y-2.5 pt-2">
                  {dayWindows.map((win, winIdx) => {
                    const isOvernight = win.is_overnight || (win.start_time && win.finish_time && win.finish_time < win.start_time);

                    return (
                      <div
                        key={winIdx}
                        className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl"
                      >
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-slate-600">From:</label>
                          <input
                            type="time"
                            value={win.start_time || '08:00'}
                            onChange={(e) => handleTimeChange(dayIdx, 'start_time', e.target.value, winIdx)}
                            className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-slate-600">To:</label>
                          <input
                            type="time"
                            value={win.finish_time || '17:00'}
                            onChange={(e) => handleTimeChange(dayIdx, 'finish_time', e.target.value, winIdx)}
                            className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900"
                          />
                        </div>

                        {isOvernight && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[11px] font-semibold border border-purple-200">
                            <Moon className="w-3 h-3" /> Overnight (ends next day)
                          </span>
                        )}

                        {dayWindows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveWindow(dayIdx, winIdx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg ml-auto"
                            title="Remove window"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => handleAddWindow(dayIdx)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 py-1 px-2 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Window
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Repeat Schedule & Duration Selector */}
      <div className="p-4 sm:p-5 bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[var(--color-brand)]/10 text-[var(--color-brand)]">
            <Repeat className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900">Schedule Duration</h3>
            <p className="text-[11px] text-slate-500">Apply to this week or make ongoing</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            id="repeat-opt-single-btn"
            type="button"
            onClick={() => setRepeatOption('single')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
              repeatOption === 'single'
                ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5 ring-2 ring-[var(--color-brand)]/30 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div>
              <div className={`text-xs font-bold ${repeatOption === 'single' ? 'text-[var(--color-brand)]' : 'text-slate-900'}`}>
                This Week Only
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Week of {selectedWeek}</div>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${repeatOption === 'single' ? 'border-[var(--color-brand)] bg-[var(--color-brand)]' : 'border-slate-300'}`}>
              {repeatOption === 'single' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>

          <button
            id="repeat-opt-ongoing-btn"
            type="button"
            onClick={() => setRepeatOption('indefinite')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
              repeatOption === 'indefinite'
                ? 'border-[var(--color-brand)] bg-[var(--color-brand)]/5 ring-2 ring-[var(--color-brand)]/30 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
            }`}
          >
            <div>
              <div className={`text-xs font-bold flex items-center gap-1.5 ${repeatOption === 'indefinite' ? 'text-[var(--color-brand)]' : 'text-slate-900'}`}>
                <span>Ongoing Schedule</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-[var(--color-brand)]/15 text-[var(--color-brand)]">Ongoing</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Repeats for future weeks</div>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${repeatOption === 'indefinite' ? 'border-[var(--color-brand)] bg-[var(--color-brand)]' : 'border-slate-300'}`}>
              {repeatOption === 'indefinite' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </button>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div className="text-xs text-slate-500 text-center sm:text-left">
          {versionNumber ? (
            <span>
              Saved Version <strong>v{versionNumber}</strong> • Last updated{' '}
              {lastUpdated ? formatTimestampLocal(lastUpdated) : ''}
            </span>
          ) : (
            <span>No availability saved yet for this week.</span>
          )}
        </div>

        <button
          id="save-availability-btn"
          type="button"
          onClick={handleSave}
          disabled={saving || (!hasUnsavedChanges && repeatOption === 'single')}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-40 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : repeatOption !== 'single' ? 'Save Ongoing' : 'Save Availability'}</span>
        </button>
      </div>
    </div>
  );
};
