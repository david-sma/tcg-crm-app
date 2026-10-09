import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job, JobStatus } from '../../../types/index.ts';
import { JOB_STATUSES, JOB_STATUS_LABELS } from '../../../config/jobs.ts';
import { NewJobFormModal } from './NewJobFormModal.tsx';
import { Plus, Search, AlertTriangle, CheckCircle2, X, Loader2, Briefcase, ChevronDown, ChevronRight } from 'lucide-react';
import { parseISO, format } from 'date-fns';

export const JOB_STATUS_DOT: Record<string, string> = {
  new: 'bg-slate-400',
  enriching: 'bg-amber-400',
  confirmed: 'bg-sky-400',
  scheduled: 'bg-indigo-400',
  ongoing: 'bg-violet-400',
  in_progress: 'bg-blue-500',
  completed: 'bg-emerald-400',
  cancelled: 'bg-red-400',
};

export const JOB_STATUS_SOLID: Record<string, string> = {
  new: 'bg-slate-500 text-white border-slate-500',
  enriching: 'bg-amber-500 text-white border-amber-500',
  confirmed: 'bg-sky-500 text-white border-sky-500',
  scheduled: 'bg-indigo-500 text-white border-indigo-500',
  ongoing: 'bg-violet-500 text-white border-violet-500',
  in_progress: 'bg-blue-600 text-white border-blue-600',
  completed: 'bg-emerald-500 text-white border-emerald-500',
  cancelled: 'bg-red-500 text-white border-red-500',
};

export const JOB_STATUS_CHIP: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700 border-slate-200',
  enriching: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-sky-100 text-sky-800 border-sky-200',
  scheduled: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  ongoing: 'bg-violet-100 text-violet-800 border-violet-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
};

export const JobStatusChip: React.FC<{ status: JobStatus | string; className?: string }> = ({ status, className = '' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${JOB_STATUS_CHIP[status] || JOB_STATUS_CHIP.new} ${className}`}
  >
    {JOB_STATUS_LABELS[status] || status}
  </span>
);

export const formatScheduledDay = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  try {
    return format(parseISO(`${dateStr}T12:00:00`), 'EEE d MMM');
  } catch {
    return dateStr;
  }
};

export const formatJobTimeWindow = (job: Job): string => {
  if (!job.scheduled_date) return '';
  const day = formatScheduledDay(job.scheduled_date);
  if (job.scheduled_start_time && job.scheduled_finish_time) {
    return `${day} · ${job.scheduled_start_time}–${job.scheduled_finish_time}`;
  }
  return day;
};

const STATUS_ORDER: Record<string, number> = {
  new: 0,
  enriching: 1,
  confirmed: 2,
  scheduled: 3,
  ongoing: 4,
  in_progress: 5,
  completed: 6,
  cancelled: 7,
};

interface JobsBoardViewProps {
  onOpenJob: (jobId: string) => void;
  refreshKey?: number;
}

export const JobsBoardView: React.FC<JobsBoardViewProps> = ({ onOpenJob, refreshKey = 0 }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | JobStatus>('active');
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((c) => (c?.text === text ? null : c));
    }, 4000);
  };

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ jobs: Job[] }>('/api/jobs');
      setJobs(res.jobs || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs, refreshKey]);

  const searchedJobs = jobs.filter((job) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [job.title, job.customer_name, job.address, job.suburb, job.city, job.job_order_number]
      .filter(Boolean)
      .some((value) => (value as string).toLowerCase().includes(q));
  });

  const countFor = (status: JobStatus) => searchedJobs.filter((job) => job.status === status).length;
  const activeCount = searchedJobs.filter(
    (job) => job.status !== 'completed' && job.status !== 'cancelled',
  ).length;

  const filteredJobs = searchedJobs.filter((job) =>
    statusFilter === 'active'
      ? job.status !== 'completed' && job.status !== 'cancelled'
      : job.status === statusFilter,
  );

  // Morning-triage order: running late first, then pipeline order, then scheduled date.
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (!!a.running_late !== !!b.running_late) return a.running_late ? -1 : 1;
    const orderA = STATUS_ORDER[a.status] ?? 99;
    const orderB = STATUS_ORDER[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    if ((a.scheduled_date || '') !== (b.scheduled_date || '')) {
      if (!a.scheduled_date) return 1;
      if (!b.scheduled_date) return -1;
      return a.scheduled_date < b.scheduled_date ? -1 : 1;
    }
    return a.created_at < b.created_at ? 1 : -1;
  });

  const needsAttentionJobs = sortedJobs.filter(
    (job) =>
      job.running_late ||
      job.status === 'new' ||
      job.status === 'enriching' ||
      (job.status === 'confirmed' && !job.scheduled_date),
  );
  const needsAttentionIds = new Set(needsAttentionJobs.map((job) => job.id));
  const scheduledJobs = sortedJobs.filter(
    (job) => !needsAttentionIds.has(job.id) && job.status !== 'completed' && job.status !== 'cancelled',
  );
  const doneJobs = sortedJobs.filter(
    (job) => !needsAttentionIds.has(job.id) && (job.status === 'completed' || job.status === 'cancelled'),
  );

  const crewSummary = (job: Job): string => {
    const crew = job.assignments || [];
    if (crew.length === 0) return '—';
    const lead = crew.find((a) => a.is_lead);
    const leadName = lead?.user_name || crew[0]?.user_name || 'Crew';
    return crew.length > 1 ? `${leadName} +${crew.length - 1}` : leadName;
  };

  const whereSummary = (job: Job): string =>
    [job.suburb, job.city].filter(Boolean).join(', ') || job.address || '—';

  const renderCompactRow = (job: Job) => {
    const meta = [formatJobTimeWindow(job), whereSummary(job) === '—' ? '' : whereSummary(job), crewSummary(job) === '—' ? '' : crewSummary(job)]
      .filter(Boolean)
      .join(' · ');
    return (
      <div
        key={job.id}
        onClick={() => onOpenJob(job.id)}
        className="flex items-center gap-2.5 px-3 py-2.5 bg-white border-b border-slate-100 last:border-b-0 cursor-pointer active:bg-slate-50"
      >
        <span
          title={JOB_STATUS_LABELS[job.status] || job.status}
          className={`w-2 h-2 rounded-full shrink-0 ${JOB_STATUS_DOT[job.status] || JOB_STATUS_DOT.new}`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{job.title}</div>
          {meta ? <div className="text-[11px] text-slate-500 truncate">{meta}</div> : null}
        </div>
        {job.running_late ? (
          <span
            title={job.late_note || 'Running behind schedule'}
            className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
          />
        ) : null}
        <JobStatusChip status={job.status} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {toastMessage && (
        <div
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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={() => setNewJobOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Job
        </button>

        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, customer, address or order no…"
            className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setStatusFilter('active')}
          className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors cursor-pointer ${
            statusFilter === 'active'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          Active · <span className="font-extrabold">{activeCount}</span>
        </button>
        {JOB_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors cursor-pointer ${
              statusFilter === status
                ? JOB_STATUS_SOLID[status]
                : `${JOB_STATUS_CHIP[status]} hover:shadow-xs`
            }`}
          >
            {JOB_STATUS_LABELS[status]} · <span className="font-extrabold">{countFor(status)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm">Loading jobs…</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          {error}
        </div>
      ) : jobs.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-200">
          <Briefcase className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-600">No jobs yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">Create your first job order to start dispatching crews.</p>
        </div>
      ) : sortedJobs.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-200">
          <Search className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-600">No jobs match</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">Try a different search or status filter.</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50/70 border-b border-slate-100">
                  <th className="px-4 py-2.5 font-bold">Order</th>
                  <th className="px-4 py-2.5 font-bold">Job</th>
                  <th className="px-4 py-2.5 font-bold">When</th>
                  <th className="px-4 py-2.5 font-bold">Where</th>
                  <th className="px-4 py-2.5 font-bold">Crew</th>
                  <th className="px-4 py-2.5 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedJobs.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => onOpenJob(job.id)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {job.job_order_number}
                    </td>
                    <td className="px-4 py-3 min-w-0">
                      <div className="font-bold text-slate-900 truncate max-w-[260px]" title={job.title}>
                        {job.title}
                      </div>
                      <div className="text-xs text-slate-500 truncate max-w-[260px]">{job.customer_name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {formatJobTimeWindow(job) || '—'}
                    </td>
                    <td
                      className="px-4 py-3 text-xs text-slate-600 truncate max-w-[160px]"
                      title={whereSummary(job) === '—' ? undefined : `${job.address || ''} ${whereSummary(job)}`.trim()}
                    >
                      {whereSummary(job)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{crewSummary(job)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {job.running_late ? (
                        <span
                          title={job.late_note || 'Running behind schedule'}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-800 border-amber-200 mr-1"
                        >
                          Late
                        </span>
                      ) : null}
                      <JobStatusChip status={job.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-4">
            {needsAttentionJobs.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-1 pb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Needs attention
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
                    {needsAttentionJobs.length}
                  </span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {needsAttentionJobs.map(renderCompactRow)}
                </div>
              </div>
            )}
            {scheduledJobs.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-1 pb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Scheduled</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {scheduledJobs.length}
                  </span>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  {scheduledJobs.map(renderCompactRow)}
                </div>
              </div>
            )}
            {doneJobs.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setDoneExpanded((v) => !v)}
                  className="flex items-center gap-1.5 px-1 pb-1.5 cursor-pointer"
                  aria-label={doneExpanded ? 'Hide completed jobs' : 'Show completed jobs'}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Done</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {doneJobs.length}
                  </span>
                  {doneExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
                {doneExpanded && (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {doneJobs.map(renderCompactRow)}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {newJobOpen && (
        <NewJobFormModal
          isOpen={newJobOpen}
          onClose={() => setNewJobOpen(false)}
          onCreated={(job) => {
            setNewJobOpen(false);
            showToast(`Job order ${job.job_order_number} created`);
            loadJobs();
          }}
        />
      )}
    </div>
  );
};
