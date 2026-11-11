import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job, JobSeries, JobSeriesFrequency, LeadSource } from '../../../types/index.ts';
import {
  describeRecurrence,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
  WEEKDAYS_ISO,
  WEEKDAY_LABELS,
} from '../../../config/jobs.ts';
import { JOB_TYPE_OPTIONS, LEAD_SOURCE_OPTIONS } from '../../../config/jobServices.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import { centsToInput, isValidAmountInput } from '../../../lib/money.ts';
import { JobStatusChip } from './JobsBoardView.tsx';
import { formatDateLabel } from './RecurringSeriesView.tsx';
import { AlertTriangle, Ban, CalendarClock, Loader2, Repeat, Save, X } from 'lucide-react';

interface SeriesDetailModalProps {
  seriesId: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenJob?: (jobId: string) => void;
  onToast?: (text: string, type?: 'success' | 'error') => void;
}

interface Draft {
  title: string;
  job_type: string;
  services_text: string;
  lead_source: string;
  site_contact_name: string;
  site_contact_phone: string;
  address: string;
  location_notes: string;
  access_notes: string;
  price_amount: string;
  price_note: string;
  frequency: JobSeriesFrequency;
  days_of_week: number[];
  start_time: string;
  finish_time: string;
  end_mode: 'never' | 'on';
  end_date: string;
}

function draftFromSeries(series: JobSeries): Draft {
  return {
    title: series.title,
    job_type: series.job_type || JOB_TYPE_OPTIONS[0]?.id || 'other',
    services_text: series.services_text || '',
    lead_source: series.lead_source || 'manual',
    site_contact_name: series.site_contact_name || '',
    site_contact_phone: series.site_contact_phone || '',
    address: series.address,
    location_notes: series.location_notes || '',
    access_notes: series.access_notes || '',
    price_amount: centsToInput(series.price_cents),
    price_note: series.price_note || '',
    frequency: series.frequency,
    days_of_week: [...series.days_of_week],
    start_time: series.start_time,
    finish_time: series.finish_time,
    end_mode: series.end_date ? 'on' : 'never',
    end_date: series.end_date || '',
  };
}

export const SeriesDetailModal: React.FC<SeriesDetailModalProps> = ({
  seriesId,
  onClose,
  onChanged,
  onOpenJob,
  onToast,
}) => {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [series, setSeries] = useState<JobSeries | null>(null);
  const [visits, setVisits] = useState<Job[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [endReason, setEndReason] = useState('');
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ series: JobSeries; visits: Job[] }>(`/api/job-series/${seriesId}`);
      setSeries(res.series);
      setVisits(res.visits || []);
      setDraft(draftFromSeries(res.series));
    } catch (err: any) {
      setError(err?.message || 'Failed to load the series');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (field: keyof Draft, value: string | number[]) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const toggleWeekday = (day: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            days_of_week: current.days_of_week.includes(day)
              ? current.days_of_week.filter((d) => d !== day)
              : [...current.days_of_week, day].sort((a, b) => a - b),
          }
        : current,
    );
  };

  const save = async () => {
    if (!draft || !series) return;
    if (!draft.title.trim() || !draft.address.trim()) {
      setFormError('Job name and address are required.');
      return;
    }
    if (isManager && !isValidAmountInput(draft.price_amount)) {
      setFormError('Enter the price as an amount like 450 or 450.50.');
      return;
    }
    if (draft.frequency !== 'daily' && draft.days_of_week.length === 0) {
      setFormError('Pick at least one weekday for weekly or fortnightly repeats.');
      return;
    }
    if (draft.finish_time <= draft.start_time) {
      setFormError('The finish time must be after the start time.');
      return;
    }
    if (draft.end_mode === 'on' && draft.end_date && draft.end_date < series.start_date) {
      setFormError('The end date must not be before the series start date.');
      return;
    }
    try {
      setSaving(true);
      setFormError('');
      const res = await apiFetch<{ series: JobSeries }>(`/api/job-series/${seriesId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: draft.title.trim(),
          job_type: draft.job_type,
          services_text: draft.services_text.trim() || null,
          lead_source: draft.lead_source,
          site_contact_name: draft.site_contact_name.trim() || null,
          site_contact_phone: draft.site_contact_phone.trim() || null,
          address: draft.address.trim(),
          location_notes: draft.location_notes.trim() || null,
          access_notes: draft.access_notes.trim() || null,
          ...(isManager
            ? { price_amount: draft.price_amount.trim() || null, price_note: draft.price_note.trim() || null }
            : {}),
          frequency: draft.frequency,
          days_of_week: draft.days_of_week,
          start_time: draft.start_time,
          finish_time: draft.finish_time,
          end_date: draft.end_mode === 'on' && draft.end_date ? draft.end_date : null,
        }),
      });
      setSeries(res.series);
      setDraft(draftFromSeries(res.series));
      onToast?.('Series updated — future visits adjusted');
      onChanged();
      await load();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save the series');
    } finally {
      setSaving(false);
    }
  };

  const endSeriesNow = async () => {
    try {
      setEnding(true);
      const res = await apiFetch<{ series: JobSeries }>(`/api/job-series/${seriesId}/end`, {
        method: 'POST',
        body: JSON.stringify({ reason: endReason.trim() || 'Series ended' }),
      });
      setSeries(res.series);
      setConfirmingEnd(false);
      setEndReason('');
      onToast?.('Series ended');
      onChanged();
      await load();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to end the series');
    } finally {
      setEnding(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500';
  const labelClass = 'block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 safe-overlay z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-700">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-white/15 text-white">
              <Repeat className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white truncate">
                {series ? series.title || 'Recurring series' : 'Recurring series'}
              </h2>
              <p className="text-xs text-white/80 truncate">
                {series ? `${series.customer_name} · ${series.address}` : 'Loading…'}
              </p>
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

        {loading ? (
          <div className="flex-1 py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading series…</p>
          </div>
        ) : error || !series || !draft ? (
          <div className="flex-1 p-6">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              {error || 'Series not found'}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {(formError || error) && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
                {formError || error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-4 bg-indigo-50/60 border border-indigo-200 rounded-2xl">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-white text-indigo-800 border-indigo-200">
                {series.status === 'pending'
                  ? 'Waiting for details'
                  : series.status === 'active'
                    ? 'Active'
                    : 'Ended'}
              </span>
              <span className="text-xs font-semibold text-indigo-900">
                <CalendarClock className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                {describeRecurrence(draft)}
              </span>
              <span className="text-xs text-indigo-800">
                Next visit: <span className="font-semibold">{formatDateLabel(series.next_visit_date ?? null)}</span>
              </span>
              {series.status === 'ended' && series.end_reason && (
                <span className="text-xs text-slate-600">Ended: {series.end_reason}</span>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Pattern</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="series-frequency">Repeats</label>
                  <select
                    id="series-frequency"
                    value={draft.frequency}
                    disabled={series.status === 'ended'}
                    onChange={(e) => setField('frequency', e.target.value)}
                    className={inputClass}
                  >
                    {RECURRENCE_FREQUENCIES.map((freq) => (
                      <option key={freq} value={freq}>{RECURRENCE_FREQUENCY_LABELS[freq]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="series-start">Starts</label>
                  <input
                    id="series-start"
                    type="date"
                    value={series.start_date}
                    disabled
                    className={`${inputClass} bg-slate-50 text-slate-500`}
                  />
                </div>
              </div>

              {draft.frequency !== 'daily' && (
                <div>
                  <span className={labelClass}>On these days</span>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS_ISO.map((day, index) => {
                      const selected = draft.days_of_week.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={series.status === 'ended'}
                          onClick={() => toggleWeekday(day)}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                            selected
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {WEEKDAY_LABELS[index]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="series-start-time">Start time</label>
                  <input
                    id="series-start-time"
                    type="time"
                    value={draft.start_time}
                    disabled={series.status === 'ended'}
                    onChange={(e) => setField('start_time', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="series-finish-time">Finish time</label>
                  <input
                    id="series-finish-time"
                    type="time"
                    value={draft.finish_time}
                    disabled={series.status === 'ended'}
                    onChange={(e) => setField('finish_time', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <span className={labelClass}>Ends</span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="series-ends"
                      checked={draft.end_mode === 'never'}
                      disabled={series.status === 'ended'}
                      onChange={() => setField('end_mode', 'never')}
                      className="accent-indigo-600"
                    />
                    Never
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="series-ends"
                      checked={draft.end_mode === 'on'}
                      disabled={series.status === 'ended'}
                      onChange={() => setField('end_mode', 'on')}
                      className="accent-indigo-600"
                    />
                    On date
                  </label>
                  {draft.end_mode === 'on' && (
                    <input
                      id="series-end-date"
                      type="date"
                      value={draft.end_date}
                      min={series.start_date}
                      disabled={series.status === 'ended'}
                      onChange={(e) => setField('end_date', e.target.value)}
                      className={`${inputClass} max-w-[190px]`}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Job details</h3>
              <p className="text-[11px] text-slate-500">
                Applied to future visits that have not been scheduled yet. Visits already scheduled keep their own details.
              </p>
              <div>
                <label className={labelClass} htmlFor="series-title">Job name</label>
                <input
                  id="series-title"
                  type="text"
                  value={draft.title}
                  disabled={series.status === 'ended'}
                  onChange={(e) => setField('title', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className={labelClass}>Customer</span>
                  <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900 truncate">{series.customer_name}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {[series.customer_phone, series.customer_email].filter(Boolean).join(' · ') || 'No contact details'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Edited on the customer profile.</div>
                  </div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="series-address">Address</label>
                  <input
                    id="series-address"
                    type="text"
                    value={draft.address}
                    disabled={series.status === 'ended'}
                    onChange={(e) => setField('address', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="series-site-contact-name">Site contact name</label>
                  <input
                    id="series-site-contact-name"
                    type="text"
                    value={draft.site_contact_name}
                    disabled={series.status === 'ended'}
                    onChange={(e) => setField('site_contact_name', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="series-site-contact-phone">Site contact phone</label>
                  <input
                    id="series-site-contact-phone"
                    type="tel"
                    value={draft.site_contact_phone}
                    disabled={series.status === 'ended'}
                    onChange={(e) => setField('site_contact_phone', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="series-job-type">Job type</label>
                  <select
                    id="series-job-type"
                    value={draft.job_type}
                    disabled={series.status === 'ended'}
                    onChange={(e) => setField('job_type', e.target.value)}
                    className={inputClass}
                  >
                    {JOB_TYPE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="series-lead-source">Lead source</label>
                  <select
                    id="series-lead-source"
                    value={draft.lead_source}
                    disabled={series.status === 'ended'}
                    onChange={(e) => setField('lead_source', e.target.value)}
                    className={inputClass}
                  >
                    {LEAD_SOURCE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="series-services-text">Services Required / Job Scope</label>
                <textarea
                  id="series-services-text"
                  rows={2}
                  value={draft.services_text}
                  disabled={series.status === 'ended'}
                  onChange={(e) => setField('services_text', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="series-location-notes">Location notes</label>
                <textarea
                  id="series-location-notes"
                  rows={2}
                  value={draft.location_notes}
                  disabled={series.status === 'ended'}
                  onChange={(e) => setField('location_notes', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="series-access-notes">Access Requirements</label>
                <textarea
                  id="series-access-notes"
                  rows={2}
                  value={draft.access_notes}
                  disabled={series.status === 'ended'}
                  onChange={(e) => setField('access_notes', e.target.value)}
                  className={inputClass}
                />
              </div>

              {isManager && (
                <div>
                  <span className={labelClass}>Pricing</span>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                      <input
                        id="series-price-amount"
                        type="text"
                        inputMode="decimal"
                        aria-label="Amount (NZD)"
                        value={draft.price_amount}
                        disabled={series.status === 'ended'}
                        onChange={(e) => setField('price_amount', e.target.value)}
                        placeholder="450.00"
                        className={`${inputClass} pl-7`}
                      />
                    </div>
                    <input
                      id="series-price-note"
                      type="text"
                      aria-label="Pricing note"
                      value={draft.price_note}
                      disabled={series.status === 'ended'}
                      onChange={(e) => setField('price_note', e.target.value)}
                      placeholder="Note (optional), e.g. incl. GST"
                      className={inputClass}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Managers only — copied to future unscheduled visits. Pricing never blocks scheduling.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Visits <span className="text-slate-400">({visits.length})</span>
              </h3>
              {visits.length === 0 ? (
                <p className="text-xs text-slate-500">No visits yet.</p>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {visits.map((visit) => (
                    <div
                      key={visit.id}
                      onClick={() => onOpenJob?.(visit.id)}
                      className={`flex items-center gap-3 px-4 py-2.5 ${onOpenJob ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    >
                      <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {visit.job_order_number}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                        {formatDateLabel(visit.occurrence_date ?? null)}
                      </span>
                      <span className="flex-1 text-xs text-slate-500 truncate">{visit.title}</span>
                      <JobStatusChip status={visit.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {series && (
          <div className="p-4 border-t border-slate-100 bg-slate-50">
            {confirmingEnd ? (
              <div className="space-y-2">
                <label className={labelClass} htmlFor="series-end-reason">
                  Why is this series being ended?
                </label>
                <input
                  id="series-end-reason"
                  type="text"
                  value={endReason}
                  onChange={(e) => setEndReason(e.target.value)}
                  placeholder="e.g. Customer cancelled the contract"
                  className={inputClass}
                />
                <p className="text-[11px] text-slate-500">
                  This and all future visits will be removed or cancelled. Visits already scheduled will be cancelled and the crew notified.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingEnd(false)}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer"
                  >
                    Keep series
                  </button>
                  <button
                    type="button"
                    onClick={endSeriesNow}
                    disabled={ending}
                    className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                    End series
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {series.status !== 'ended' ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingEnd(true)}
                    className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-rose-200 text-rose-600 font-medium text-xs hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    End series
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    This series has ended — visits can no longer be generated.
                  </span>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  {series.status !== 'ended' && (
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
