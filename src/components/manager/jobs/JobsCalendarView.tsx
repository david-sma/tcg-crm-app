import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job, JobAssignment } from '../../../types/index.ts';
import { JOB_STATUSES, JOB_STATUS_LABELS } from '../../../config/jobs.ts';
import { WeekNavigator } from '../../common/WeekNavigator.tsx';
import { getDefaultActiveMonday, DAY_NAMES, SHORT_DAY_NAMES, getDayDateStr, getNowInBusinessTz } from '../../../lib/dateUtils.ts';
import { JobStatusChip, JOB_STATUS_CHIP } from './JobsBoardView.tsx';
import { parseISO, format, addDays } from 'date-fns';
import { Loader2, AlertTriangle, MapPin, Users, CalendarDays } from 'lucide-react';

interface JobsCalendarViewProps {
  onOpenJob: (jobId: string) => void;
  refreshKey?: number;
}

const isoDate = (d: Date): string => format(d, 'yyyy-MM-dd');

const dayDateStr = (weekMonday: string, dayIdx: number): string => {
  try {
    return isoDate(addDays(parseISO(`${weekMonday}T12:00:00`), dayIdx));
  } catch {
    return weekMonday;
  }
};

export const JobsCalendarView: React.FC<JobsCalendarViewProps> = ({ onOpenJob, refreshKey = 0 }) => {
  const [selectedWeek, setSelectedWeek] = useState(getDefaultActiveMonday());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() => {
    const { dayOfWeek } = getNowInBusinessTz();
    return Math.min(6, Math.max(0, dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  });

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

  useEffect(() => {
    loadJobs(selectedWeek);
  }, [selectedWeek, loadJobs, refreshKey]);

  const jobsForDay = (dateStr: string) => jobs.filter((job) => job.scheduled_date === dateStr);

  const renderJobCard = (job: Job, compact = false) => (
    <div
      key={job.id}
      onClick={() => onOpenJob(job.id)}
      className={`rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs cursor-pointer transition-all ${
        compact ? 'p-3' : 'p-2.5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-mono font-semibold text-slate-400">{job.job_order_number}</span>
        <JobStatusChip status={job.status} />
      </div>
      {job.scheduled_start_time && job.scheduled_finish_time && (
        <div className="text-[11px] font-mono font-semibold text-indigo-700 mt-1">
          {job.scheduled_start_time}–{job.scheduled_finish_time}
        </div>
      )}
      <div className="font-bold text-slate-900 text-sm truncate" title={job.title}>
        {job.title}
      </div>
      {(job.suburb || job.city || job.address) && (
        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{job.suburb || job.city || job.address}</span>
        </div>
      )}
      {(job.assignments?.length ?? 0) > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Users className="w-3 h-3 text-slate-400" />
          {(job.assignments || []).map((a: JobAssignment) => (
            <span
              key={a.id}
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                a.is_lead
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {a.user_name || 'Staff'}
              {a.is_lead && <span className="text-[9px] font-bold uppercase">Lead</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Legend</span>
        {JOB_STATUSES.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full border ${JOB_STATUS_CHIP[status]}`} />
            <span className="text-[11px] text-slate-500 font-medium">{JOB_STATUS_LABELS[status]}</span>
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
                  jobsForDay(dayDateStr(selectedWeek, selectedDayIdx)).map((job) => renderJobCard(job, true))
                )}
              </div>
            </div>
          </div>

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
                const dayJobs = jobsForDay(dayDateStr(selectedWeek, dayIdx));
                return (
                  <div key={dayIdx} className="p-2 space-y-2">
                    {dayJobs.length === 0 ? (
                      <div className="py-6 text-center text-[11px] text-slate-400">No jobs</div>
                    ) : (
                      dayJobs.map((job) => renderJobCard(job))
                    )}
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
          No jobs scheduled this week.
        </div>
      )}
    </div>
  );
};
