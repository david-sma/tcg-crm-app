import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job } from '../../../types/index.ts';
import {
  CALENDAR_END_HOUR,
  CALENDAR_PX_PER_HOUR,
  CALENDAR_SLOT_MINUTES,
  CALENDAR_START_HOUR,
  JOB_STATUS_LABELS,
} from '../../../config/jobs.ts';
import {
  JOB_TYPE_GROUP_BLOCKS,
  JOB_TYPE_GROUP_LABELS,
  getJobTypeColorGroup,
  type JobTypeColorGroup,
} from '../../../config/jobServices.ts';
import { WeekNavigator } from '../../common/WeekNavigator.tsx';
import { getDefaultActiveMonday, DAY_NAMES, SHORT_DAY_NAMES, getDayDateStr, getNowInBusinessTz } from '../../../lib/dateUtils.ts';
import { ScheduleJobModal } from './ScheduleJobModal.tsx';
import { parseISO, format, addDays } from 'date-fns';
import { Loader2, AlertTriangle, CalendarDays, X, Clock } from 'lucide-react';

interface JobsCalendarViewProps {
  onOpenJob: (jobId: string) => void;
  refreshKey?: number;
}

const PX_PER_MIN = CALENDAR_PX_PER_HOUR / 60;
const GRID_HEIGHT = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_PX_PER_HOUR;
const SLOT_COUNT = ((CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60) / CALENDAR_SLOT_MINUTES;

const isoDate = (d: Date): string => format(d, 'yyyy-MM-dd');

const dayDateStr = (weekMonday: string, dayIdx: number): string => {
  try {
    return isoDate(addDays(parseISO(`${weekMonday}T12:00:00`), dayIdx));
  } catch {
    return weekMonday;
  }
};

const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

interface Placement {
  job: Job;
  col: number;
  cols: number;
  top: number;
  height: number;
}

/**
 * Position job blocks on the grid and split overlapping jobs into
 * side-by-side columns (Google-Calendar style interval partitioning).
 */
function layoutDay(dayJobs: Job[]): { placed: Placement[]; untimed: Job[] } {
  const untimed = dayJobs.filter((job) => !job.scheduled_start_time || !job.scheduled_finish_time);
  const timed = dayJobs
    .filter((job) => job.scheduled_start_time && job.scheduled_finish_time)
    .slice()
    .sort((a, b) => {
      const startDiff = toMinutes(a.scheduled_start_time!) - toMinutes(b.scheduled_start_time!);
      if (startDiff !== 0) return startDiff;
      return toMinutes(b.scheduled_finish_time!) - toMinutes(a.scheduled_finish_time!);
    });

  const placed: Placement[] = [];
  let cluster: Job[] = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    const cols: Array<{ job: Job; col: number }> = [];
    for (const job of cluster) {
      const start = toMinutes(job.scheduled_start_time!);
      const end = toMinutes(job.scheduled_finish_time!);
      let col = colEnds.findIndex((endMinute) => endMinute <= start);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(end);
      } else {
        colEnds[col] = end;
      }
      cols.push({ job, col });
    }
    const totalCols = colEnds.length;
    for (const { job, col } of cols) {
      const start = Math.max(CALENDAR_START_HOUR * 60, toMinutes(job.scheduled_start_time!));
      const end = Math.min(CALENDAR_END_HOUR * 60, toMinutes(job.scheduled_finish_time!));
      placed.push({
        job,
        col,
        cols: totalCols,
        top: (start - CALENDAR_START_HOUR * 60) * PX_PER_MIN,
        height: Math.max(24, (end - start) * PX_PER_MIN),
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const job of timed) {
    const start = toMinutes(job.scheduled_start_time!);
    const end = toMinutes(job.scheduled_finish_time!);
    if (cluster.length > 0 && start >= clusterEnd) {
      flushCluster();
    }
    cluster.push(job);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flushCluster();

  return { placed, untimed };
}

interface SlotPick {
  date: string;
  minutes: number;
}

export const JobsCalendarView: React.FC<JobsCalendarViewProps> = ({ onOpenJob, refreshKey = 0 }) => {
  const [selectedWeek, setSelectedWeek] = useState(getDefaultActiveMonday());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() => {
    const { dayOfWeek } = getNowInBusinessTz();
    return Math.min(6, Math.max(0, dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  });
  const [slotPick, setSlotPick] = useState<SlotPick | null>(null);
  const [schedulable, setSchedulable] = useState<Job[]>([]);
  const [scheduleTarget, setScheduleTarget] = useState<Job | null>(null);
  const [schedulePrefill, setSchedulePrefill] = useState<{ date: string; startTime: string } | null>(null);

  const loadJobs = useCallback(async (week: string) => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ jobs: Job[] }>(`/api/jobs/calendar?week=${week}`);
      setJobs(res.jobs || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load scheduled jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSchedulable = useCallback(async () => {
    try {
      const res = await apiFetch<{ jobs: Job[] }>('/api/jobs?status=ready,deal_confirmed');
      setSchedulable((res.jobs || []).filter((job) => !job.scheduled_date));
    } catch {
      setSchedulable([]);
    }
  }, []);

  useEffect(() => {
    loadJobs(selectedWeek);
  }, [selectedWeek, loadJobs, refreshKey]);

  useEffect(() => {
    loadSchedulable();
  }, [loadSchedulable, refreshKey]);

  const jobsByDay = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.scheduled_date) continue;
      const list = map.get(job.scheduled_date) || [];
      list.push(job);
      map.set(job.scheduled_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.scheduled_start_time || 'zz').localeCompare(b.scheduled_start_time || 'zz'));
    }
    return map;
  }, [jobs]);

  const jobsForDay = (dateStr: string) => jobsByDay.get(dateStr) || [];

  const hourMarks = Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 }, (_, i) => CALENDAR_START_HOUR + i);

  const renderJobCard = (job: Job) => {
    const group = getJobTypeColorGroup(job.job_type);
    const tones = JOB_TYPE_GROUP_BLOCKS[group];
    const timeLabel =
      job.scheduled_start_time && job.scheduled_finish_time
        ? `${job.scheduled_start_time}–${job.scheduled_finish_time}`
        : 'Time TBC';
    return (
      <div
        key={job.id}
        onClick={() => onOpenJob(job.id)}
        title={`${job.job_order_number} · ${JOB_STATUS_LABELS[job.status] || job.status} · ${job.address || ''}`}
        className={`rounded-xl border px-2 py-1.5 hover:shadow-xs cursor-pointer transition-all ${tones.block}`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${tones.bar}`} />
          <span className="text-[10px] font-mono font-semibold text-slate-600 shrink-0">{timeLabel}</span>
          <span className="font-bold text-slate-900 text-xs truncate flex-1">{job.title}</span>
          {job.running_late && (
            <span title={job.late_note || 'Running behind schedule'} className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          )}
        </div>
      </div>
    );
  };

  const renderBlock = (placement: Placement) => {
    const { job, col, cols, top, height } = placement;
    const group = getJobTypeColorGroup(job.job_type);
    const tones = JOB_TYPE_GROUP_BLOCKS[group];
    const widthPct = 100 / cols;
    const crewNames = (job.assignments || []).map((a) => `${a.user_name || 'Staff'}${a.is_lead ? ' (lead)' : ''}`).join(', ');
    return (
      <div
        key={job.id}
        onClick={() => onOpenJob(job.id)}
        title={`${job.job_order_number} · ${JOB_STATUS_LABELS[job.status] || job.status} · ${job.address || ''}${crewNames ? ` · ${crewNames}` : ''}`}
        style={{
          top: `${top}px`,
          height: `${height}px`,
          left: `calc(${col * widthPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
        }}
        className={`absolute rounded-lg border px-1.5 py-1 overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${tones.block}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${tones.bar}`} />
        <div className="pl-1.5 min-w-0">
          <div className="text-[10px] font-mono font-semibold text-slate-600 truncate">
            {job.scheduled_start_time}–{job.scheduled_finish_time}
          </div>
          <div className="text-[11px] font-bold text-slate-900 truncate leading-tight">{job.title}</div>
          {height > 60 && job.address && (
            <div className="text-[10px] text-slate-500 truncate">{job.address}</div>
          )}
          {job.running_late && (
            <div className="text-[9px] font-bold text-amber-700 uppercase">Running late</div>
          )}
        </div>
      </div>
    );
  };

  const openSlot = (date: string, minutes: number) => {
    setSlotPick({ date, minutes });
    loadSchedulable();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Legend</span>
        {(Object.keys(JOB_TYPE_GROUP_LABELS) as JobTypeColorGroup[]).map((group) => (
          <span key={group} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded border ${JOB_TYPE_GROUP_BLOCKS[group].legend}`} />
            <span className="text-[11px] text-slate-500 font-medium">{JOB_TYPE_GROUP_LABELS[group]}</span>
          </span>
        ))}
      </div>

      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm">Loading scheduled jobs…</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          {error}
        </div>
      ) : (
        <>
          {/* Mobile: day picker + day list */}
          <div className="block lg:hidden">
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const dateStr = dayDateStr(selectedWeek, dayIdx);
                const count = jobsForDay(dateStr).length;
                const isSelected = selectedDayIdx === dayIdx;
                return (
                  <button
                    key={dayIdx}
                    type="button"
                    onClick={() => setSelectedDayIdx(dayIdx)}
                    className={`flex-1 min-w-[76px] py-2 px-2.5 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider">{SHORT_DAY_NAMES[dayIdx]}</div>
                    <div className="text-xs font-semibold mt-0.5">{getDayDateStr(selectedWeek, dayIdx).split(', ')[1]}</div>
                    <div
                      className={`text-[10px] font-medium mt-1 px-1.5 py-0.2 rounded-full inline-block ${
                        isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {count} job{count !== 1 ? 's' : ''}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-base">{DAY_NAMES[selectedDayIdx]}</h3>
                <span className="text-xs text-slate-500">{getDayDateStr(selectedWeek, selectedDayIdx)}</span>
              </div>
              <div className="p-4 space-y-2.5">
                {jobsForDay(dayDateStr(selectedWeek, selectedDayIdx)).length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">No jobs</div>
                ) : (
                  jobsForDay(dayDateStr(selectedWeek, selectedDayIdx)).map((job) => renderJobCard(job))
                )}
              </div>
            </div>
          </div>

          {/* Desktop: time grid 06:00-18:00 with 30-min slots and side-by-side overlaps */}
          <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200 bg-slate-50/80">
              <div className="border-r border-slate-200" />
              {Array.from({ length: 7 }, (_, dayIdx) => (
                <div key={dayIdx} className="p-3 text-center border-r border-slate-200 last:border-r-0">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {SHORT_DAY_NAMES[dayIdx]}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">
                    {getDayDateStr(selectedWeek, dayIdx).split(', ')[1]}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
              {/* Time gutter */}
              <div className="relative border-r border-slate-200" style={{ height: GRID_HEIGHT }}>
                {hourMarks.map((hour) => (
                  <div
                    key={hour}
                    className="absolute right-2 -translate-y-1/2 text-[10px] font-semibold text-slate-400"
                    style={{ top: (hour - CALENDAR_START_HOUR) * CALENDAR_PX_PER_HOUR }}
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const dateStr = dayDateStr(selectedWeek, dayIdx);
                const { placed, untimed } = layoutDay(jobsForDay(dateStr));
                return (
                  <div key={dayIdx} className="relative border-r border-slate-200 last:border-r-0" style={{ height: GRID_HEIGHT }}>
                    {/* Hour + half-hour grid lines */}
                    {hourMarks.map((hour) => (
                      <div
                        key={`h-${hour}`}
                        className="absolute left-0 right-0 border-t border-slate-200"
                        style={{ top: (hour - CALENDAR_START_HOUR) * CALENDAR_PX_PER_HOUR }}
                      />
                    ))}
                    {Array.from({ length: (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 2 }, (_, i) => (
                      <div
                        key={`s-${i}`}
                        className="absolute left-0 right-0 border-t border-slate-100"
                        style={{ top: i * CALENDAR_SLOT_MINUTES * PX_PER_MIN }}
                      />
                    ))}

                    {/* Clickable 30-min slots (behind blocks) */}
                    {Array.from({ length: SLOT_COUNT }, (_, slotIdx) => {
                      const minutes = CALENDAR_START_HOUR * 60 + slotIdx * CALENDAR_SLOT_MINUTES;
                      return (
                        <button
                          key={`slot-${slotIdx}`}
                          type="button"
                          title={`Schedule a job at ${minutesToTime(minutes)}`}
                          onClick={() => openSlot(dateStr, minutes)}
                          className="absolute left-0 right-0 hover:bg-indigo-50/60 transition-colors cursor-pointer"
                          style={{
                            top: slotIdx * CALENDAR_SLOT_MINUTES * PX_PER_MIN,
                            height: CALENDAR_SLOT_MINUTES * PX_PER_MIN,
                          }}
                        />
                      );
                    })}

                    {untimed.map((job) => (
                      <div key={`u-${job.id}`} className="absolute top-0.5 left-0.5 right-0.5 z-10">
                        {renderJobCard(job)}
                      </div>
                    ))}
                    {placed.map(renderBlock)}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {jobs.length === 0 && !loading && !error && (
        <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
          <CalendarDays className="w-4 h-4 text-slate-300" />
          No jobs scheduled this week. Click a time slot to schedule one.
        </div>
      )}

      {/* Slot picker: choose which waiting job to place here */}
      {slotPick && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Schedule a job here</h2>
                <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {DAY_NAMES[
                    Math.min(
                      6,
                      Math.max(
                        0,
                        (() => {
                          const dow = parseISO(`${slotPick.date}T12:00:00`).getDay();
                          return dow === 0 ? 6 : dow - 1;
                        })(),
                      ),
                    )
                  ]}{' '}
                  {slotPick.date} · from {minutesToTime(slotPick.minutes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSlotPick(null)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2 max-h-[50vh] overflow-y-auto">
              {schedulable.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">
                  No jobs waiting to be scheduled. Confirm a deal first.
                </p>
              ) : (
                schedulable.map((job) => {
                  const group = getJobTypeColorGroup(job.job_type);
                  const tones = JOB_TYPE_GROUP_BLOCKS[group];
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        setScheduleTarget(job);
                        setSchedulePrefill({
                          date: slotPick.date,
                          startTime: minutesToTime(slotPick.minutes),
                        });
                        setSlotPick(null);
                      }}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 hover:shadow-sm transition-all cursor-pointer ${tones.block}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${tones.bar}`} />
                        <span className="text-xs font-bold text-slate-900 truncate flex-1">{job.title}</span>
                        <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                          {JOB_TYPE_GROUP_LABELS[group]}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {job.job_order_number} · {job.address || 'Address TBC'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {scheduleTarget && (
        <ScheduleJobModal
          isOpen={!!scheduleTarget}
          job={scheduleTarget}
          prefill={schedulePrefill}
          onClose={() => {
            setScheduleTarget(null);
            setSchedulePrefill(null);
          }}
          onScheduled={() => {
            setScheduleTarget(null);
            setSchedulePrefill(null);
            loadJobs(selectedWeek);
            loadSchedulable();
          }}
        />
      )}
    </div>
  );
};
