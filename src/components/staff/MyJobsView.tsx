import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowRight, Briefcase, MapPin, RefreshCw, Star, Users } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { getNowInBusinessTz } from '../../lib/dateUtils.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { getJobTypeLabel } from '../../config/jobServices.ts';
import { JOB_STATUS_LABELS } from '../../config/jobs.ts';
import type { Job } from '../../types/index.ts';
import { StaffJobDetailModal } from './StaffJobDetailModal.tsx';

const STATUS_CHIP_CLASS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600',
  awaiting_info: 'bg-amber-100 text-amber-700',
  ready: 'bg-teal-100 text-teal-700',
  deal_confirmed: 'bg-sky-100 text-sky-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

function formatDateLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unscheduled';
  try {
    return format(parseISO(`${dateStr}T12:00:00`), 'EEE, d MMM');
  } catch {
    return dateStr;
  }
}

function formatTimeWindow(job: Job): string {
  const start = job.scheduled_start_time;
  const finish = job.scheduled_finish_time;
  if (start && finish) return `${start}–${finish}`;
  return start || finish || 'Time not set';
}

function addressLine(job: Job): string {
  return [job.address, job.suburb, job.city].filter(Boolean).join(', ');
}

function bySchedule(a: Job, b: Job): number {
  const da = a.scheduled_date || '';
  const db = b.scheduled_date || '';
  if (da !== db) return da < db ? -1 : 1;
  return (a.scheduled_start_time || '').localeCompare(b.scheduled_start_time || '');
}

const isDone = (job: Job) => job.status === 'completed' || job.status === 'cancelled';

export const MyJobsView: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { user } = useAuth();

  const todayStr = useMemo(() => {
    const { yyyy, mm, dd } = getNowInBusinessTz();
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }, []);

  const loadJobs = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      setError(null);
      const data = await apiFetch<{ jobs: Job[] }>('/api/jobs/my');
      setJobs(data.jobs || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load your jobs.');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const groups = useMemo(() => {
    const active = jobs.filter((job) => !isDone(job));
    return [
      {
        key: 'today',
        label: 'Today',
        items: active.filter((job) => job.scheduled_date && job.scheduled_date <= todayStr).sort(bySchedule),
      },
      {
        key: 'upcoming',
        label: 'Upcoming',
        items: active.filter((job) => job.scheduled_date && job.scheduled_date > todayStr).sort(bySchedule),
      },
      {
        key: 'later',
        label: 'Later / unscheduled',
        items: active.filter((job) => !job.scheduled_date).sort(bySchedule),
      },
      {
        key: 'done',
        label: 'Completed',
        items: jobs.filter(isDone).sort(bySchedule),
      },
    ];
  }, [jobs, todayStr]);

  const renderCard = (job: Job) => {
    const isLeadJob = job.assignments?.some((a) => a.user_id === user?.id && a.is_lead) ?? false;
    const crewCount = job.assignments?.length ?? 0;
    const chipClass = STATUS_CHIP_CLASS[job.status] || 'bg-slate-100 text-slate-600';
    const showStartHint =
      isLeadJob && job.status === 'scheduled' && job.scheduled_date === todayStr;

    const cardBody = (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span>{formatTimeWindow(job)}</span>
              <span className="text-slate-300">•</span>
              <span>{formatDateLabel(job.scheduled_date)}</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-1 truncate">{job.title}</h3>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${chipClass}`}
            >
              {JOB_STATUS_LABELS[job.status] || job.status}
            </span>
            {job.running_late && (
              <span
                title={job.late_note || 'Running behind schedule'}
                className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700"
              >
                Running late
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2 text-slate-600 min-w-0">
          <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-sm truncate">{addressLine(job) || 'Address not set'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600">
            {getJobTypeLabel(job.job_type)}
          </span>
          {isLeadJob && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700">
              <Star className="w-3 h-3" />
              Lead
            </span>
          )}
          {crewCount > 1 && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600">
              <Users className="w-3 h-3" />
              {crewCount} crew
            </span>
          )}
        </div>

        {job.customer_name && (
          <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Customer</span>
              <span className="text-[13px] font-semibold text-slate-900 text-right">{job.customer_name}</span>
            </div>
            {job.customer_phone ? (
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Phone</span>
                <a href={`tel:${job.customer_phone}`} className="text-[13px] font-semibold text-blue-600">
                  {job.customer_phone}
                </a>
              </div>
            ) : null}
            {job.site_contact_name || job.site_contact_phone ? (
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Site contact</span>
                <span className="text-[13px] text-slate-700 text-right">
                  {job.site_contact_name}
                  {job.site_contact_name && job.site_contact_phone ? ' · ' : null}
                  {job.site_contact_phone ? (
                    <a href={`tel:${job.site_contact_phone}`} className="font-semibold text-blue-600">
                      {job.site_contact_phone}
                    </a>
                  ) : null}
                </span>
              </div>
            ) : null}
            {job.services_text ? (
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Services Required / Job Scope</span>
                <p className="text-[13px] text-slate-700 leading-snug mt-0.5">{job.services_text}</p>
              </div>
            ) : null}
          </div>
        )}
        {showStartHint && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            Start job
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        )}
      </>
    );
    return (
      <button
        key={job.id}
        type="button"
        onClick={() => setSelectedJobId(job.id)}
        className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
      >
        {cardBody}
      </button>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">My Jobs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Jobs assigned to you. Tap one to see the details.
          </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-sm text-rose-900">{error}</span>
          <button
            type="button"
            onClick={() => loadJobs()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-slate-200 rounded" />
                  <div className="h-4 w-48 bg-slate-200 rounded" />
                </div>
                <div className="h-6 w-20 bg-slate-200 rounded-full" />
              </div>
              <div className="h-3 w-40 bg-slate-200 rounded mt-3" />
              <div className="h-6 w-24 bg-slate-200 rounded-full mt-3" />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 && !error ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <Briefcase className="w-12 h-12 text-slate-300 mx-auto" />
          <h2 className="text-lg font-semibold text-slate-900">No Jobs Assigned</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            No jobs assigned yet — check your roster or ask your coordinator.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.key} className="space-y-3">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {group.label} <span className="text-slate-400">({group.items.length})</span>
                </h2>
                <div className="space-y-3">{group.items.map(renderCard)}</div>
              </section>
            ))}
        </div>
      )}

      <StaffJobDetailModal
        isOpen={selectedJobId !== null}
        jobId={selectedJobId}
        onClose={() => setSelectedJobId(null)}
        onChanged={() => loadJobs({ silent: true })}
        onNavigate={onNavigate}
      />
    </div>
  );
};
