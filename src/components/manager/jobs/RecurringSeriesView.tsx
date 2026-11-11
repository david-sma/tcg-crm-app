import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { JobSeries } from '../../../types/index.ts';
import { describeRecurrence } from '../../../config/jobs.ts';
import { SeriesDetailModal } from './SeriesDetailModal.tsx';
import { AlertTriangle, Loader2, Repeat, Search, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type StatusFilter = 'active' | 'ended';

const STATUS_CHIP_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  active: 'bg-teal-100 text-teal-800 border-teal-200',
  ended: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting for details',
  active: 'Active',
  ended: 'Ended',
};

export const formatDateLabel = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  try {
    return format(parseISO(`${dateStr}T12:00:00`), 'd MMM yyyy');
  } catch {
    return dateStr;
  }
};

interface RecurringSeriesViewProps {
  refreshKey?: number;
  initialSeriesId?: string | null;
  onInitialSeriesHandled?: () => void;
  onOpenJob?: (jobId: string) => void;
}

export const RecurringSeriesView: React.FC<RecurringSeriesViewProps> = ({
  refreshKey = 0,
  initialSeriesId,
  onInitialSeriesHandled,
  onOpenJob,
}) => {
  const [series, setSeries] = useState<JobSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [openSeriesId, setOpenSeriesId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((c) => (c?.text === text ? null : c));
    }, 4000);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ series: JobSeries[] }>('/api/job-series');
      setSeries(res.series || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load recurring series');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Deep link from a job's "Manage series" link.
  useEffect(() => {
    if (initialSeriesId) {
      setOpenSeriesId(initialSeriesId);
      onInitialSeriesHandled?.();
    }
  }, [initialSeriesId, onInitialSeriesHandled]);

  const searched = series.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [item.title, item.customer_name, item.address]
      .filter(Boolean)
      .some((value) => (value as string).toLowerCase().includes(q));
  });

  const matchesFilter = (item: JobSeries) =>
    statusFilter === 'ended' ? item.status === 'ended' : item.status !== 'ended';

  const filtered = searched.filter(matchesFilter);
  const activeCount = searched.filter((item) => item.status !== 'ended').length;
  const endedCount = searched.filter((item) => item.status === 'ended').length;

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
              <Repeat className="w-4 h-4 text-emerald-600 shrink-0" />
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search series by customer, address or job name…"
          className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ['active', `Active · ${activeCount}`],
            ['ended', `Ended · ${endedCount}`],
          ] as [StatusFilter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors cursor-pointer ${
              statusFilter === value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm">Loading recurring series…</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-200">
          <Repeat className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-600">No recurring series</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Switch on “Recurring job” when creating a job to set up a daily, weekly or fortnightly series.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenSeriesId(item.id)}
              className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_CHIP_CLASS[item.status] || STATUS_CHIP_CLASS.ended}`}
                    >
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 truncate">{item.customer_name}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-1 truncate">{item.title}</h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{item.address}</p>
                  <p className="text-[11px] text-indigo-700 font-medium mt-1.5">
                    {describeRecurrence(item)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Next visit</div>
                  <div className="text-xs font-semibold text-slate-700">{formatDateLabel(item.next_visit_date)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-1">Ends</div>
                  <div className="text-xs font-semibold text-slate-700">
                    {item.end_date ? formatDateLabel(item.end_date) : 'Never'}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {openSeriesId && (
        <SeriesDetailModal
          seriesId={openSeriesId}
          onClose={() => setOpenSeriesId(null)}
          onChanged={() => {
            load();
          }}
          onOpenJob={
            onOpenJob
              ? (jobId) => {
                  setOpenSeriesId(null);
                  onOpenJob(jobId);
                }
              : undefined
          }
          onToast={showToast}
        />
      )}
    </div>
  );
};
