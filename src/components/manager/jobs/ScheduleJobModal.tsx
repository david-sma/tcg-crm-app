import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { DraftShift, Job, User } from '../../../types/index.ts';
import { getAppSettings } from '../../../config/appSettings.ts';
import { formatTimeLocal } from '../../../lib/dateUtils.ts';
import { format, parseISO, startOfWeek } from 'date-fns';
import { X, CalendarClock, Loader2, AlertTriangle, Users, CheckCircle2 } from 'lucide-react';

interface ScheduleJobModalProps {
  isOpen: boolean;
  job: Job;
  onClose: () => void;
  onScheduled: (job: Job) => void;
  /** Prefill from a calendar slot click (used when the job has no schedule yet). */
  prefill?: { date: string; startTime: string } | null;
}

const addHoursToTime = (time: string, hours: number): string => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + hours * 60;
  return `${String(Math.min(23, Math.floor(total / 60))).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const localDateFromIso = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: getAppSettings().timezone });
  } catch {
    return iso.slice(0, 10);
  }
};

const mondayOf = (dateStr: string): string => {
  try {
    return format(startOfWeek(parseISO(`${dateStr}T12:00:00`), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  } catch {
    return dateStr;
  }
};

const todayLocalDate = (): string => localDateFromIso(new Date().toISOString());

export const ScheduleJobModal: React.FC<ScheduleJobModalProps> = ({ isOpen, job, onClose, onScheduled, prefill }) => {
  const initialStart = job.scheduled_start_time || prefill?.startTime || '09:00';
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date || prefill?.date || todayLocalDate());
  const [startTime, setStartTime] = useState(initialStart);
  const [finishTime, setFinishTime] = useState(job.scheduled_finish_time || addHoursToTime(initialStart, 3));
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    (job.assignments || []).map((a) => a.user_id),
  );
  const [leadUserId, setLeadUserId] = useState<string | undefined>(
    (job.assignments || []).find((a) => a.is_lead)?.user_id || (job.assignments || [])[0]?.user_id,
  );
  const [staff, setStaff] = useState<User[]>([]);
  const [weekShifts, setWeekShifts] = useState<DraftShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const weekMonday = mondayOf(scheduledDate);

  const loadContext = useCallback(async () => {
    try {
      setLoading(true);
      const [staffRes, rosterRes] = await Promise.all([
        apiFetch<{ staff: User[] }>('/api/staff?status=active'),
        apiFetch<any>(`/api/rosters/week?week=${weekMonday}`).catch(() => null),
      ]);
      setStaff(staffRes.staff || []);
      setWeekShifts(rosterRes?.draft_shifts || rosterRes?.shifts || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load staff and roster context');
    } finally {
      setLoading(false);
    }
  }, [weekMonday]);

  useEffect(() => {
    if (isOpen) {
      const start = job.scheduled_start_time || prefill?.startTime || '09:00';
      setScheduledDate(job.scheduled_date || prefill?.date || todayLocalDate());
      setStartTime(start);
      setFinishTime(job.scheduled_finish_time || addHoursToTime(start, 3));
      const existing = job.assignments || [];
      setSelectedUserIds(existing.map((a) => a.user_id));
      setLeadUserId(existing.find((a) => a.is_lead)?.user_id || existing[0]?.user_id);
      setError('');
      setSubmitting(false);
      loadContext();
    }
  }, [isOpen, job.id, prefill?.date, prefill?.startTime]);

  if (!isOpen) return null;

  const shiftForUser = (userId: string): DraftShift | undefined =>
    weekShifts.find((shift) => shift.user_id === userId && localDateFromIso(shift.start_datetime) === scheduledDate);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((current) => {
      if (current.includes(userId)) {
        const next = current.filter((id) => id !== userId);
        if (leadUserId === userId) setLeadUserId(next[0]);
        return next;
      }
      const next = [...current, userId];
      if (!leadUserId) setLeadUserId(userId);
      return next;
    });
  };

  const timeInvalid = !!startTime && !!finishTime && finishTime <= startTime;
  const canSubmit = scheduledDate && startTime && finishTime && !timeInvalid && selectedUserIds.length > 0 && !!leadUserId && !submitting;

  const leadName = staff.find((s) => s.id === leadUserId)?.name || '—';
  const crewCount = Math.max(0, selectedUserIds.length - 1);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      setError('');
      const res = await apiFetch<{ job: Job }>(`/api/jobs/${job.id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
          scheduled_date: scheduledDate,
          scheduled_start_time: startTime,
          scheduled_finish_time: finishTime,
          assignments: selectedUserIds.map((userId) => ({
            user_id: userId,
            ...(shiftForUser(userId) ? { shift_id: shiftForUser(userId)!.id } : {}),
            is_lead: userId === leadUserId,
          })),
        }),
      });
      onScheduled(res.job);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to schedule job');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15 text-white">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Schedule job</h2>
              <p className="text-xs text-white/80 font-mono">{job.job_order_number}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="schedule-date-input">
              Date <span className="text-rose-500">*</span>
            </label>
            <input
              id="schedule-date-input"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="schedule-start-input">
                Start time <span className="text-rose-500">*</span>
              </label>
              <input
                id="schedule-start-input"
                type="time"
                step={1800}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="schedule-finish-input">
                Finish time <span className="text-rose-500">*</span>
              </label>
              <input
                id="schedule-finish-input"
                type="time"
                step={1800}
                value={finishTime}
                onChange={(e) => setFinishTime(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          {timeInvalid && (
            <p className="text-[11px] text-rose-600 -mt-2">Finish time must be after start time.</p>
          )}

          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Crew</span>
            </div>

            {loading ? (
              <div className="py-6 flex items-center justify-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading staff…
              </div>
            ) : staff.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">No active staff available.</div>
            ) : (
              <div className="space-y-1.5">
                {staff.map((member) => {
                  const selected = selectedUserIds.includes(member.id);
                  const shift = shiftForUser(member.id);
                  return (
                    <div
                      key={member.id}
                      className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-colors ${
                        selected ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        id={`schedule-crew-${member.id}`}
                        checked={selected}
                        onChange={() => toggleUser(member.id)}
                        className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                      />
                      <label htmlFor={`schedule-crew-${member.id}`} className="flex-1 min-w-0 cursor-pointer">
                        <div className="text-sm font-semibold text-slate-900 truncate">{member.name}</div>
                        {shift && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5 mt-1">
                            Shift {formatTimeLocal(shift.start_datetime)}–{formatTimeLocal(shift.finish_datetime)}
                          </div>
                        )}
                      </label>
                      {selected && (
                        <label className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 cursor-pointer shrink-0">
                          <input
                            type="radio"
                            name="schedule-lead"
                            checked={leadUserId === member.id}
                            onChange={() => setLeadUserId(member.id)}
                            className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                          />
                          Lead
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl">
            <div className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider mb-1">Summary</div>
            <p className="text-sm text-indigo-950 font-medium">
              {job.job_order_number} · {scheduledDate ? format(parseISO(`${scheduledDate}T12:00:00`), 'EEE d MMM') : '—'} ·{' '}
              {startTime || '—'}–{finishTime || '—'} ·{' '}
              {selectedUserIds.length === 0
                ? 'No crew selected'
                : `Lead: ${leadName}${crewCount > 0 ? ` + ${crewCount} crew` : ''}`}
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {submitting ? 'Scheduling…' : 'Schedule job'}
          </button>
        </div>
      </div>
    </div>
  );
};
