import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job } from '../../../types/index.ts';
import { PROCESS_TARGET_HOURS } from '../../../config/jobs.ts';
import { JobStatusChip, formatJobTimeWindow } from './JobsBoardView.tsx';
import { TargetChip } from './TargetChip.tsx';
import { AlertTriangle, CheckCircle2, MapPin, RefreshCw } from 'lucide-react';

const Row: React.FC<{ job: Job; onOpen: (id: string) => void; soft: number; hard: number; since: string | null | undefined; targetLabel: string }> = ({
  job,
  onOpen,
  soft,
  hard,
  since,
  targetLabel,
}) => {
  const where = [job.address, job.suburb, job.city].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      onClick={() => onOpen(job.id)}
      className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="font-mono">{job.job_order_number}</span>
            {formatJobTimeWindow(job) && (
              <>
                <span className="text-slate-300">•</span>
                <span>{formatJobTimeWindow(job)}</span>
              </>
            )}
          </div>
          <h3 className="text-sm font-bold text-slate-900 mt-1 truncate">{job.title}</h3>
          {where && (
            <div className="flex items-center gap-1.5 mt-1.5 text-slate-600 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-xs truncate">{where}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <TargetChip sinceIso={since} softHours={soft} hardHours={hard} label={targetLabel} />
          <JobStatusChip status={job.status} />
        </div>
      </div>
    </button>
  );
};

interface ProcessQueueViewProps {
  onOpenJob: (jobId: string) => void;
  refreshKey?: number;
}

/** Service team work queue: jobs waiting to be processed + completed jobs awaiting final check. */
export const ProcessQueueView: React.FC<ProcessQueueViewProps> = ({ onOpenJob, refreshKey = 0 }) => {
  const [toProcess, setToProcess] = useState<Job[]>([]);
  const [finalCheck, setFinalCheck] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      setError('');
      const [readyRes, completedRes] = await Promise.all([
        apiFetch<{ jobs: Job[] }>('/api/jobs?status=ready'),
        apiFetch<{ jobs: Job[] }>('/api/jobs?status=completed'),
      ]);
      const byReadyAt = (a: Job, b: Job) => (a.ready_at || a.created_at).localeCompare(b.ready_at || b.created_at);
      const byCompletedAt = (a: Job, b: Job) => (b.completed_at || b.created_at).localeCompare(a.completed_at || a.created_at);
      setToProcess((readyRes.jobs || []).slice().sort(byReadyAt));
      setFinalCheck((completedRes.jobs || []).slice().sort(byCompletedAt));
    } catch (err: any) {
      setError(err?.message || 'Failed to load the process queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-sm text-rose-900">{error}</span>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
              <div className="h-3 w-32 bg-slate-200 rounded" />
              <div className="h-4 w-48 bg-slate-200 rounded mt-2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-teal-600" />
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                To process <span className="text-slate-400">({toProcess.length})</span>
              </h2>
              <span className="text-[11px] text-slate-400">New job to process — confirm, schedule and allocate the crew (target: 24h)</span>
            </div>
            {toProcess.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                Nothing waiting — jobs marked ready by customer service will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {toProcess.map((job) => (
                  <Row
                    key={job.id}
                    job={job}
                    onOpen={onOpenJob}
                    since={job.ready_at || job.created_at}
                    soft={PROCESS_TARGET_HOURS}
                    hard={PROCESS_TARGET_HOURS}
                    targetLabel="Processing"
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Final check <span className="text-slate-400">({finalCheck.length})</span>
              </h2>
              <span className="text-[11px] text-slate-400">Completed jobs — review the full record before invoicing</span>
            </div>
            {finalCheck.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                No completed jobs waiting for review.
              </div>
            ) : (
              <div className="space-y-3">
                {finalCheck.map((job) => (
                  <Row
                    key={job.id}
                    job={job}
                    onOpen={onOpenJob}
                    since={job.completed_at || job.created_at}
                    soft={PROCESS_TARGET_HOURS}
                    hard={PROCESS_TARGET_HOURS * 2}
                    targetLabel="Final check"
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
