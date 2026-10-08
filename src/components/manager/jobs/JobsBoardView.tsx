import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job, JobAssignment, JobStatus } from '../../../types/index.ts';
import { JOB_STATUSES, JOB_STATUS_LABELS } from '../../../config/jobs.ts';
import { NewJobFormModal } from './NewJobFormModal.tsx';
import { Plus, Search, AlertTriangle, CheckCircle2, X, MapPin, Users, Loader2, Briefcase, CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { parseISO, format } from 'date-fns';

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

const PIPELINE_STATUSES: JobStatus[] = ['new', 'enriching', 'confirmed', 'scheduled', 'ongoing', 'in_progress', 'completed'];

interface JobsBoardViewProps {
  onOpenJob: (jobId: string) => void;
  refreshKey?: number;
}

export const JobsBoardView: React.FC<JobsBoardViewProps> = ({ onOpenJob, refreshKey = 0 }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | JobStatus>('all');
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [cancelledCollapsed, setCancelledCollapsed] = useState(true);
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

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [job.title, job.customer_name, job.address, job.suburb, job.city, job.job_order_number]
      .filter(Boolean)
      .some((value) => (value as string).toLowerCase().includes(q));
  });

  const columnStatuses: (JobStatus | 'cancelled')[] =
    statusFilter === 'all' ? [...PIPELINE_STATUSES, 'cancelled'] : [statusFilter];

  const jobsForStatus = (status: JobStatus | 'cancelled') => filteredJobs.filter((job) => job.status === status);

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
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          All
        </button>
        {JOB_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors cursor-pointer ${
              statusFilter === status
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {JOB_STATUS_LABELS[status]}
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columnStatuses.map((status) => {
            const columnJobs = jobsForStatus(status);
            const isCancelled = status === 'cancelled';
            const isCollapsed = isCancelled && cancelledCollapsed && statusFilter === 'all';

            return (
              <div key={status} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
                <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70">
                  <div className="flex items-center gap-2 min-w-0">
                    {isCancelled && statusFilter === 'all' ? (
                      <button
                        type="button"
                        onClick={() => setCancelledCollapsed((c) => !c)}
                        className="p-0.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                        aria-label={isCollapsed ? 'Expand cancelled jobs' : 'Collapse cancelled jobs'}
                      >
                        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    ) : null}
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                      {JOB_STATUS_LABELS[status]}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${JOB_STATUS_CHIP[status]}`}>
                      {columnJobs.length}
                    </span>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="p-2.5 space-y-2.5 min-h-[120px]">
                    {columnJobs.length === 0 ? (
                      <div className="py-6 text-center text-[11px] text-slate-400">No jobs</div>
                    ) : (
                      columnJobs.map((job) => (
                        <div
                          key={job.id}
                          onClick={() => onOpenJob(job.id)}
                          className="p-3 rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs cursor-pointer transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-mono font-semibold text-slate-400">
                              {job.job_order_number}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {job.running_late && (
                                <span
                                  title={job.late_note || 'Running behind schedule'}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-100 text-amber-800 border-amber-200"
                                >
                                  Running late
                                </span>
                              )}
                              <JobStatusChip status={job.status} />
                            </div>
                          </div>

                          <div className="font-bold text-slate-900 text-sm mt-1 truncate" title={job.title}>
                            {job.title}
                          </div>
                          <div className="text-xs text-slate-600 truncate">{job.customer_name}</div>
                          {(job.suburb || job.city) && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{[job.suburb, job.city].filter(Boolean).join(', ')}</span>
                            </div>
                          )}

                          {job.scheduled_date && (
                            <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5">
                              <CalendarDays className="w-3 h-3" />
                              {formatJobTimeWindow(job)}
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
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
