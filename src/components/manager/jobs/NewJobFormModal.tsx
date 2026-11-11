import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job, JobFrequency, JobSeriesFrequency, LeadSource } from '../../../types/index.ts';
import {
  JOB_TYPE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
} from '../../../config/jobServices.ts';
import {
  describeRecurrence,
  JOB_FREQUENCIES,
  JOB_FREQUENCY_LABELS,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
  WEEKDAYS_ISO,
  WEEKDAY_LABELS,
} from '../../../config/jobs.ts';
import { JobMediaUploader } from '../../common/JobMediaUploader.tsx';
import { CustomerPicker, type CustomerSelection } from '../../customers/CustomerPicker.tsx';
import { isValidAmountInput } from '../../../lib/money.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import { X, FilePlus2, CheckCircle2, Camera, Loader2, ImagePlus, Repeat } from 'lucide-react';
import { format } from 'date-fns';

interface NewJobFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (job: Job) => void;
}

interface FormErrors {
  title?: string;
  customer?: string;
  price?: string;
  address?: string;
  recurrence?: string;
}

const EMPTY_FORM = {
  title: '',
  job_type: JOB_TYPE_OPTIONS[0]?.id || 'other',
  services_text: '',
  lead_source: 'manual' as LeadSource,
  // Frequency TAG (required, One-off pre-selected). Independent of "Recurring job".
  frequency: 'one_off' as JobFrequency,
  frequency_note: '',
  site_contact_name: '',
  site_contact_phone: '',
  address: '',
  location_notes: '',
  access_notes: '',
  price_amount: '',
  price_note: '',
};

const emptyRecurrence = () => ({
  frequency: 'weekly' as JobSeriesFrequency,
  days_of_week: [] as number[],
  // Computed when the form opens, so a long-open app never defaults to a past date.
  start_date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '09:00',
  finish_time: '11:00',
  end_mode: 'never' as 'never' | 'on',
  end_date: '',
});

export const NewJobFormModal: React.FC<NewJobFormModalProps> = ({ isOpen, onClose, onCreated }) => {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const canRepeat = isManager || user?.role === 'customer_service';
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [repeatOn, setRepeatOn] = useState(false);
  const [recurrence, setRecurrence] = useState(emptyRecurrence);
  const [customer, setCustomer] = useState<CustomerSelection>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [phase, setPhase] = useState<'details' | 'photos'>('details');
  const [createdJob, setCreatedJob] = useState<Job | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...EMPTY_FORM });
      setRepeatOn(false);
      setRecurrence(emptyRecurrence());
      setCustomer(null);
      setErrors({});
      setSubmitError('');
      setSubmitting(false);
      setPhase('details');
      setCreatedJob(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const setField = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleWeekday = (day: number) => {
    setRecurrence((current) => ({
      ...current,
      days_of_week: current.days_of_week.includes(day)
        ? current.days_of_week.filter((d) => d !== day)
        : [...current.days_of_week, day].sort((a, b) => a - b),
    }));
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.title.trim()) next.title = 'Job name is required.';
    if (!customer) next.customer = 'Pick a customer or add a new one.';
    else if (customer.mode === 'new' && !customer.draft.name.trim()) next.customer = 'Customer name is required.';
    if (isManager && !isValidAmountInput(form.price_amount)) next.price = 'Enter an amount like 450 or 450.50.';
    if (!form.address.trim()) next.address = 'Address is required.';
    if (repeatOn) {
      if (recurrence.frequency !== 'daily' && recurrence.days_of_week.length === 0) {
        next.recurrence = 'Pick at least one weekday for weekly or fortnightly repeats.';
      } else if (recurrence.finish_time <= recurrence.start_time) {
        next.recurrence = 'The finish time must be after the start time.';
      } else if (recurrence.end_mode === 'on' && recurrence.end_date && recurrence.end_date < recurrence.start_date) {
        next.recurrence = 'The end date must not be before the start date.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      setSubmitError('');
      const res = await apiFetch<{ job: Job }>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          job_type: form.job_type,
          services: [],
          services_text: form.services_text.trim() || undefined,
          lead_source: form.lead_source,
          frequency: form.frequency,
          frequency_note: form.frequency === 'custom' ? form.frequency_note.trim() || null : null,
          ...(customer?.mode === 'existing'
            ? { customer_id: customer.customer.id }
            : customer?.mode === 'new'
              ? {
                  customer: {
                    name: customer.draft.name.trim(),
                    customer_type: customer.draft.customer_type,
                    phone: customer.draft.phone.trim() || null,
                    email: customer.draft.email.trim() || null,
                  },
                }
              : {}),
          site_contact_name: form.site_contact_name.trim() || null,
          site_contact_phone: form.site_contact_phone.trim() || null,
          address: form.address.trim(),
          location_notes: form.location_notes.trim() || null,
          access_notes: form.access_notes.trim() || null,
          ...(isManager
            ? { price_amount: form.price_amount.trim() || null, price_note: form.price_note.trim() || null }
            : {}),
          ...(repeatOn
            ? {
                recurrence: {
                  frequency: recurrence.frequency,
                  days_of_week: recurrence.days_of_week,
                  start_date: recurrence.start_date,
                  start_time: recurrence.start_time,
                  finish_time: recurrence.finish_time,
                  ...(recurrence.end_mode === 'on' && recurrence.end_date ? { end_date: recurrence.end_date } : {}),
                },
              }
            : {}),
        }),
      });
      setCreatedJob(res.job);
      setPhase('photos');
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (hasError?: boolean) =>
    `w-full rounded-xl border ${hasError ? 'border-rose-400' : 'border-slate-300'} px-3 py-2.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500`;

  const labelClass = 'block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/15 text-white">
              {phase === 'details' ? <FilePlus2 className="w-5 h-5" /> : <ImagePlus className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {phase === 'details' ? 'New job order' : 'Add job photos'}
              </h2>
              <p className="text-xs text-white/80">
                {phase === 'details'
                  ? 'Capture the inquiry — you can refine it later.'
                  : 'Intake photos help the crew prepare. Upload in the background as you finish up.'}
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

        {phase === 'details' ? (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
            {submitError && (
              <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
                {submitError}
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Job</h3>

              <div>
                <label className={labelClass} htmlFor="new-job-title">
                  Job name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-job-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  placeholder="e.g. Deep clean — Harbour View apartment"
                  className={inputClass(!!errors.title)}
                />
                {errors.title && <p className="text-[11px] text-rose-600 mt-1">{errors.title}</p>}
              </div>

              {isManager && (
                <div>
                  <span className={labelClass}>Pricing</span>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                      <input
                        id="new-job-price-amount"
                        type="text"
                        inputMode="decimal"
                        aria-label="Amount (NZD)"
                        value={form.price_amount}
                        onChange={(e) => setField('price_amount', e.target.value)}
                        placeholder="450.00"
                        className={`${inputClass(!!errors.price)} pl-7`}
                      />
                    </div>
                    <input
                      id="new-job-price-note"
                      type="text"
                      aria-label="Pricing note"
                      value={form.price_note}
                      onChange={(e) => setField('price_note', e.target.value)}
                      placeholder="Note (optional), e.g. incl. GST"
                      className={inputClass()}
                    />
                  </div>
                  {errors.price && <p className="text-[11px] text-rose-600 mt-1">{errors.price}</p>}
                  <p className="text-[11px] text-slate-400 mt-1">Managers only — other roles cannot see this.</p>
                </div>
              )}

              <div>
                <label className={labelClass} htmlFor="new-job-type">
                  Job type
                </label>
                <select
                  id="new-job-type"
                  value={form.job_type}
                  onChange={(e) => setField('job_type', e.target.value)}
                  className={inputClass()}
                >
                  {JOB_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass} htmlFor="new-job-frequency">
                  Frequency <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-3">
                  <select
                    id="new-job-frequency"
                    value={form.frequency}
                    onChange={(e) => setField('frequency', e.target.value)}
                    className={inputClass()}
                  >
                    {JOB_FREQUENCIES.map((value) => (
                      <option key={value} value={value}>
                        {JOB_FREQUENCY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  {form.frequency === 'custom' && (
                    <input
                      id="new-job-frequency-note"
                      type="text"
                      aria-label="Custom frequency note"
                      value={form.frequency_note}
                      onChange={(e) => setField('frequency_note', e.target.value)}
                      placeholder="e.g. every 3 weeks"
                      className={inputClass()}
                    />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  How often this customer books this job. For records only — it doesn't create a recurring series.
                </p>
              </div>

              <div>
                <label className={labelClass} htmlFor="new-job-services-text">
                  Services Required / Job Scope
                </label>
                <textarea
                  id="new-job-services-text"
                  rows={3}
                  value={form.services_text}
                  onChange={(e) => setField('services_text', e.target.value)}
                  placeholder="Sugar soap all walls and ceilings, clean stove and oven…"
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="new-job-access-notes">
                  Access Requirements
                </label>
                <textarea
                  id="new-job-access-notes"
                  rows={2}
                  value={form.access_notes}
                  onChange={(e) => setField('access_notes', e.target.value)}
                  placeholder="e.g. Key under mat, gate code 1234, dog in property"
                  className={inputClass()}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="new-job-lead-source">
                  Lead source
                </label>
                <select
                  id="new-job-lead-source"
                  value={form.lead_source}
                  onChange={(e) => setField('lead_source', e.target.value)}
                  className={inputClass()}
                >
                  {LEAD_SOURCE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Customer</h3>
              <CustomerPicker
                value={customer}
                onChange={(next) => {
                  setCustomer(next);
                  if (next) setErrors((current) => ({ ...current, customer: undefined }));
                  // Prefill the job address from the customer's main address.
                  if (next?.mode === 'existing' && next.customer.address && !form.address.trim()) {
                    setField('address', next.customer.address);
                  }
                }}
                error={errors.customer}
                inputClass={inputClass}
                labelClass={labelClass}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="new-job-site-contact-name">
                    Site contact name
                  </label>
                  <input
                    id="new-job-site-contact-name"
                    type="text"
                    value={form.site_contact_name}
                    onChange={(e) => setField('site_contact_name', e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="new-job-site-contact-phone">
                    Site contact phone
                  </label>
                  <input
                    id="new-job-site-contact-phone"
                    type="tel"
                    value={form.site_contact_phone}
                    onChange={(e) => setField('site_contact_phone', e.target.value)}
                    className={inputClass()}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Location</h3>
              <div>
                <label className={labelClass} htmlFor="new-job-address">
                  Address <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-job-address"
                  type="text"
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  placeholder="e.g. 12 Harbour View Road, Devonport, Auckland 0624"
                  className={inputClass(!!errors.address)}
                />
                {errors.address && <p className="text-[11px] text-rose-600 mt-1">{errors.address}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="new-job-location-notes">
                  Location notes
                </label>
                <textarea
                  id="new-job-location-notes"
                  rows={2}
                  value={form.location_notes}
                  onChange={(e) => setField('location_notes', e.target.value)}
                  placeholder="e.g. Unit 4B, upstairs of the dairy"
                  className={inputClass()}
                />
              </div>
            </div>

            {canRepeat && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  {repeatOn ? (
                    <div className="flex items-center gap-2">
                      <Repeat className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Recurring job</h3>
                    </div>
                  ) : (
                    <span />
                  )}
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-xs font-semibold text-slate-600">Recurring job</span>
                    <input
                      id="new-job-repeat"
                      type="checkbox"
                      checked={repeatOn}
                      onChange={(e) => setRepeatOn(e.target.checked)}
                      className="w-9 h-5 rounded-full appearance-none bg-slate-300 checked:bg-indigo-600 relative transition-colors cursor-pointer before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-4 before:h-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
                    />
                  </label>
                </div>

                {repeatOn && (
                  <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass} htmlFor="new-job-repeat-frequency">Repeats</label>
                        <select
                          id="new-job-repeat-frequency"
                          value={recurrence.frequency}
                          onChange={(e) =>
                            setRecurrence((c) => ({ ...c, frequency: e.target.value as JobSeriesFrequency }))
                          }
                          className={inputClass()}
                        >
                          {RECURRENCE_FREQUENCIES.map((freq) => (
                            <option key={freq} value={freq}>{RECURRENCE_FREQUENCY_LABELS[freq]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="new-job-repeat-start">Starts</label>
                        <input
                          id="new-job-repeat-start"
                          type="date"
                          value={recurrence.start_date}
                          min={format(new Date(), 'yyyy-MM-dd')}
                          onChange={(e) => setRecurrence((c) => ({ ...c, start_date: e.target.value }))}
                          className={inputClass()}
                        />
                      </div>
                    </div>

                    {recurrence.frequency !== 'daily' && (
                      <div>
                        <span className={labelClass}>On these days</span>
                        <div className="flex flex-wrap gap-1.5">
                          {WEEKDAYS_ISO.map((day, index) => {
                            const selected = recurrence.days_of_week.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleWeekday(day)}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
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
                        <label className={labelClass} htmlFor="new-job-repeat-start-time">Start time</label>
                        <input
                          id="new-job-repeat-start-time"
                          type="time"
                          value={recurrence.start_time}
                          onChange={(e) => setRecurrence((c) => ({ ...c, start_time: e.target.value }))}
                          className={inputClass()}
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="new-job-repeat-finish-time">Finish time</label>
                        <input
                          id="new-job-repeat-finish-time"
                          type="time"
                          value={recurrence.finish_time}
                          onChange={(e) => setRecurrence((c) => ({ ...c, finish_time: e.target.value }))}
                          className={inputClass()}
                        />
                      </div>
                    </div>

                    <div>
                      <span className={labelClass}>Ends</span>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="new-job-repeat-ends"
                            checked={recurrence.end_mode === 'never'}
                            onChange={() => setRecurrence((c) => ({ ...c, end_mode: 'never' }))}
                            className="accent-indigo-600"
                          />
                          Never
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                          <input
                            type="radio"
                            name="new-job-repeat-ends"
                            checked={recurrence.end_mode === 'on'}
                            onChange={() => setRecurrence((c) => ({ ...c, end_mode: 'on' }))}
                            className="accent-indigo-600"
                          />
                          On date
                        </label>
                        {recurrence.end_mode === 'on' && (
                          <input
                            id="new-job-repeat-end-date"
                            type="date"
                            value={recurrence.end_date}
                            min={recurrence.start_date}
                            onChange={(e) => setRecurrence((c) => ({ ...c, end_date: e.target.value }))}
                            className={inputClass()}
                          />
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-indigo-800 font-medium">
                      {describeRecurrence({
                        frequency: recurrence.frequency,
                        days_of_week: recurrence.days_of_week,
                        start_time: recurrence.start_time,
                        finish_time: recurrence.finish_time,
                        end_date: recurrence.end_mode === 'on' && recurrence.end_date ? recurrence.end_date : null,
                      })}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      The first visit follows the normal flow. Once it reaches the Process Queue, the next 14 days of visits are created there automatically.
                    </p>
                    {errors.recurrence && <p className="text-[11px] text-rose-600">{errors.recurrence}</p>}
                  </div>
                )}
              </div>
            )}
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {createdJob && (
              <>
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Job order created</p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Order number{' '}
                      <span className="font-mono font-bold text-emerald-950">{createdJob.job_order_number}</span>
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Job photos (intake)</h3>
                  </div>
                  <JobMediaUploader
                    jobId={createdJob.id}
                    phase="intake"
                    media={[]}
                    onMediaChange={() => {}}
                    allowVideo={false}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          {phase === 'details' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitting ? 'Creating…' : 'Create job order'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => createdJob && onCreated(createdJob)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => createdJob && onCreated(createdJob)}
                className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-medium text-xs transition-all shadow-xs cursor-pointer"
              >
                Finish
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
