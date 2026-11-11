import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job, JobAssignment, JobMedia, JobMediaPhase, JobStatus, LeadSource } from '../../../types/index.ts';
import {
  JOB_TYPE_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  getJobTypeLabel,
  getLeadSourceLabel,
} from '../../../config/jobServices.ts';
import { formatDateTimeLocal } from '../../../lib/dateUtils.ts';
import { amountInputToCents, centsToInput, formatCents, isValidAmountInput } from '../../../lib/money.ts';
import {
  describeJobFrequency,
  describeRecurrence,
  JOB_FREQUENCIES,
  JOB_FREQUENCY_LABELS,
} from '../../../config/jobs.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import { JobMediaUploader } from '../../common/JobMediaUploader.tsx';
import { ScheduleJobModal } from './ScheduleJobModal.tsx';
import { JobStatusChip, RecurringBadge, formatJobTimeWindow } from './JobsBoardView.tsx';
import {
  X,
  Loader2,
  AlertTriangle,
  Pencil,
  Save,
  Ban,
  Repeat,
  ArrowRight,
  RotateCcw,
  CalendarClock,
  MapPin,
  Phone,
  Mail,
  User as UserIcon,
  DollarSign,
  Clock,
  CheckCircle2,
  Trash2,
  History,
  ClipboardList,
  Camera,
} from 'lucide-react';

interface JobDetailModalProps {
  isOpen: boolean;
  jobId: string | null;
  onClose: () => void;
  onChanged: () => void;
  /** Open the Recurring tab editor for this job's series (manager/customer service). */
  onOpenSeries?: (seriesId: string) => void;
  /** Open the linked customer's profile (Customers module). */
  onOpenCustomer?: (customerId: string) => void;
}

interface JobDraft {
  title: string;
  job_type: string;
  services_text: string;
  lead_source: LeadSource;
  frequency: string; // '' = not set (older jobs)
  frequency_note: string;
  site_contact_name: string;
  site_contact_phone: string;
  address: string;
  location_notes: string;
  access_notes: string;
}

const draftFromJob = (job: Job): JobDraft => ({
  title: job.title || '',
  job_type: job.job_type || '',
  services_text: job.services_text || '',
  lead_source: job.lead_source || 'manual',
  frequency: job.frequency || '',
  frequency_note: job.frequency_note || '',
  site_contact_name: job.site_contact_name || '',
  site_contact_phone: job.site_contact_phone || '',
  address: job.address || '',
  location_notes: job.location_notes || '',
  access_notes: job.access_notes || '',
});

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-1.5">
    <div className="w-full sm:w-40 shrink-0 text-[11px] font-semibold text-slate-500 uppercase tracking-wider pt-0.5">
      {label}
    </div>
    <div className="flex-1 min-w-0 text-sm text-slate-900">{children}</div>
  </div>
);

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="p-4 bg-white rounded-2xl border border-slate-200">
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{title}</h3>
    </div>
    <div className="divide-y divide-slate-100">{children}</div>
  </div>
);

const EmptyValue: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <span className="text-slate-400 italic">{children || '—'}</span>
);

export const JobDetailModal: React.FC<JobDetailModalProps> = ({
  isOpen,
  jobId,
  onClose,
  onChanged,
  onOpenSeries,
  onOpenCustomer,
}) => {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const canProcess = user?.role === 'manager' || user?.role === 'service_team';
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [mutating, setMutating] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelScope, setCancelScope] = useState<'this' | 'future'>('this');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const [clearingLate, setClearingLate] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const [priceNoteDraft, setPriceNoteDraft] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState('');

  const loadJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      setError('');
      setActionError('');
      setPriceError('');
      const res = await apiFetch<{ job: Job }>(`/api/jobs/${jobId}`);
      setJob(res.job);
      setPriceDraft(centsToInput(res.job.price_cents));
      setPriceNoteDraft(res.job.price_note || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (isOpen && jobId) {
      setJob(null);
      setEditing(false);
      setDraft(null);
      setConfirmingCancel(false);
      setCancelReason('');
      setScheduleOpen(false);
      loadJob();
    }
  }, [isOpen, jobId, loadJob]);

  if (!isOpen || !jobId) return null;

  const changeStatus = async (status: JobStatus, reason?: string, scope: 'this' | 'future' = 'this') => {
    if (!job) return;
    try {
      setMutating(status);
      setActionError('');
      const res = await apiFetch<{ job: Job }>(`/api/jobs/${job.id}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          ...(reason ? { reason } : {}),
          ...(scope === 'future' ? { scope } : {}),
        }),
      });
      setJob(res.job);
      setConfirmingCancel(false);
      setCancelReason('');
      setCancelScope('this');
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update job status');
    } finally {
      setMutating(null);
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    if (!job) return;
    try {
      setRemovingAssignmentId(assignmentId);
      setActionError('');
      const res = await apiFetch<{ job: Job }>(`/api/jobs/${job.id}/assignments/${assignmentId}`, {
        method: 'DELETE',
      });
      setJob(res.job);
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to remove assignment');
    } finally {
      setRemovingAssignmentId(null);
    }
  };

  const setLead = async (assignmentId: string) => {
    if (!job) return;
    try {
      setRemovingAssignmentId(assignmentId);
      setActionError('');
      const res = await apiFetch<{ job: Job }>(
        `/api/jobs/${job.id}/assignments/${assignmentId}/set-lead`,
        { method: 'POST' },
      );
      setJob(res.job);
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to set team lead');
    } finally {
      setRemovingAssignmentId(null);
    }
  };

  const startEdit = () => {
    if (!job) return;
    setDraft(draftFromJob(job));
    setEditing(true);
  };

  const clearLate = async () => {
    if (!job) return;
    try {
      setClearingLate(true);
      setActionError('');
      const res = await apiFetch<{ job: Job }>(`/api/jobs/${job.id}/clear-late`, {
        method: 'POST',
      });
      setJob(res.job);
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to clear running-late status');
    } finally {
      setClearingLate(false);
    }
  };

  const saveEdit = async () => {
    if (!job || !draft) return;
    try {
      setSavingEdit(true);
      setActionError('');
      const res = await apiFetch<{ job: Job }>(`/api/jobs/${job.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: draft.title.trim(),
          job_type: draft.job_type,
          services: [],
          services_text: draft.services_text.trim() || null,
          lead_source: draft.lead_source,
          ...(draft.frequency
            ? {
                frequency: draft.frequency,
                frequency_note: draft.frequency === 'custom' ? draft.frequency_note.trim() || null : null,
              }
            : {}),
          site_contact_name: draft.site_contact_name.trim() || null,
          site_contact_phone: draft.site_contact_phone.trim() || null,
          address: draft.address.trim(),
          location_notes: draft.location_notes.trim() || null,
          access_notes: draft.access_notes.trim() || null,
        }),
      });
      setJob(res.job);
      setPriceDraft(centsToInput(res.job.price_cents));
      setPriceNoteDraft(res.job.price_note || '');
      setEditing(false);
      setDraft(null);
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save job');
    } finally {
      setSavingEdit(false);
    }
  };

  const setDraftField = (field: keyof JobDraft, value: string) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  // Pricing is saved independently of "Edit job" and never changes job status.
  const savePrice = async () => {
    if (!job) return;
    if (!isValidAmountInput(priceDraft)) {
      setPriceError('Enter an amount like 450 or 450.50');
      return;
    }
    try {
      setSavingPrice(true);
      setPriceError('');
      const res = await apiFetch<{ job: Job }>(`/api/jobs/${job.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          price_amount: priceDraft.trim() || null,
          price_note: priceNoteDraft.trim() || null,
        }),
      });
      setJob(res.job);
      setPriceDraft(centsToInput(res.job.price_cents));
      setPriceNoteDraft(res.job.price_note || '');
      onChanged();
    } catch (err: any) {
      setPriceError(err?.message || 'Failed to save price');
    } finally {
      setSavingPrice(false);
    }
  };

  const phaseMedia = (phase: JobMediaPhase): JobMedia[] =>
    (job.media || []).filter((item) => item.phase === phase);

  const setPhaseMedia = (phase: JobMediaPhase, items: JobMedia[]) => {
    setJob((current) =>
      current
        ? {
            ...current,
            media: [...(current.media || []).filter((item) => item.phase !== phase), ...items],
          }
        : current,
    );
  };

  const busy = mutating !== null || savingEdit || removingAssignmentId !== null || clearingLate || savingPrice;
  const status = job?.status;
  const canCancel = !!job && status !== 'completed' && status !== 'cancelled' && canProcess;
  const canIntake = canProcess || user?.role === 'customer_service';

  const inputClass =
    'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500';
  const labelClass = 'block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-gradient-to-r from-indigo-600 to-violet-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-white/80">{job?.job_order_number}</span>
              <JobStatusChip status={job?.status ?? 'awaiting_info'} className="!bg-white/20 !text-white !border-white/30" />
              {job?.series_id ? <RecurringBadge className="!bg-white/20 !text-white !border-white/30" /> : null}
            </div>
            <h2 className="text-lg font-semibold text-white truncate mt-1">{job?.title}</h2>
            <p className="text-xs text-white/80 mt-0.5">
              {job?.customer_name}
              {job?.scheduled_date ? ` · ${formatJobTimeWindow(job)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit job
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Loading job…</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              {error}
            </div>
          )}

          {actionError && !loading && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 rounded-xl border border-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              {actionError}
            </div>
          )}

          {job && !loading && (
            <>
              {(status === 'in_progress' || status === 'completed') && (
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="w-4 h-4 text-blue-700" />
                    <h3 className="text-xs font-bold text-blue-950 uppercase tracking-wider">Execution</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">Started</div>
                      <div className="text-sm text-blue-950">
                        {job.started_at ? formatDateTimeLocal(job.started_at) : <EmptyValue />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">Completed</div>
                      <div className="text-sm text-blue-950">
                        {job.completed_at ? formatDateTimeLocal(job.completed_at) : <EmptyValue />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">Start notes</div>
                      <div className="text-sm text-blue-950 whitespace-pre-wrap">
                        {job.start_notes || <EmptyValue />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">Completion notes</div>
                      <div className="text-sm text-blue-950 whitespace-pre-wrap">
                        {job.completion_notes || <EmptyValue />}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-blue-900 uppercase tracking-wider">Faults or damages checked</div>
                      <div className="text-sm text-blue-950">
                        {job.faults_damages_checked ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Yes
                            {job.faults_damages_checked_at && (
                              <span className="text-blue-900 font-normal">
                                · {formatDateTimeLocal(job.faults_damages_checked_at)}
                                {job.faults_damages_checked_by_name ? ` · ${job.faults_damages_checked_by_name}` : ''}
                              </span>
                            )}
                          </span>
                        ) : (
                          <EmptyValue />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editing && draft ? (
                <>
                  <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Job &amp; services</h3>
                    <div>
                      <label className={labelClass} htmlFor="edit-job-title">Job name</label>
                      <input
                        id="edit-job-title"
                        type="text"
                        value={draft.title}
                        onChange={(e) => setDraftField('title', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass} htmlFor="edit-job-type">Job type</label>
                        <select
                          id="edit-job-type"
                          value={draft.job_type}
                          onChange={(e) => setDraftField('job_type', e.target.value)}
                          className={inputClass}
                        >
                          {JOB_TYPE_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="edit-job-lead-source">Lead source</label>
                        <select
                          id="edit-job-lead-source"
                          value={draft.lead_source}
                          onChange={(e) => setDraftField('lead_source', e.target.value)}
                          className={inputClass}
                        >
                          {LEAD_SOURCE_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-3">
                      <div>
                        <label className={labelClass} htmlFor="edit-job-frequency">Frequency</label>
                        <select
                          id="edit-job-frequency"
                          value={draft.frequency}
                          onChange={(e) => setDraftField('frequency', e.target.value)}
                          className={inputClass}
                        >
                          {!draft.frequency && <option value="">Not set</option>}
                          {JOB_FREQUENCIES.map((value) => (
                            <option key={value} value={value}>{JOB_FREQUENCY_LABELS[value]}</option>
                          ))}
                        </select>
                      </div>
                      {draft.frequency === 'custom' && (
                        <div>
                          <label className={labelClass} htmlFor="edit-job-frequency-note">Custom frequency</label>
                          <input
                            id="edit-job-frequency-note"
                            type="text"
                            value={draft.frequency_note}
                            onChange={(e) => setDraftField('frequency_note', e.target.value)}
                            placeholder="e.g. every 3 weeks"
                            className={inputClass}
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="edit-job-services-text">Services Required / Job Scope</label>
                      <textarea
                        id="edit-job-services-text"
                        rows={3}
                        value={draft.services_text}
                        onChange={(e) => setDraftField('services_text', e.target.value)}
                        placeholder="Sugar soap all walls and ceilings, clean stove and oven…"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="edit-job-access-notes">Access Requirements</label>
                      <textarea
                        id="edit-job-access-notes"
                        rows={2}
                        value={draft.access_notes}
                        onChange={(e) => setDraftField('access_notes', e.target.value)}
                        placeholder="e.g. Key under mat, gate code 1234, dog in property"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Customer</h3>
                    <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <span className="font-semibold text-slate-700">{job.customer_name || 'No customer'}</span>
                      {' · '}Customer contact details are edited on the customer profile.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass} htmlFor="edit-job-site-contact-name">Site contact name</label>
                        <input
                          id="edit-job-site-contact-name"
                          type="text"
                          value={draft.site_contact_name}
                          onChange={(e) => setDraftField('site_contact_name', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass} htmlFor="edit-job-site-contact-phone">Site contact phone</label>
                        <input
                          id="edit-job-site-contact-phone"
                          type="tel"
                          value={draft.site_contact_phone}
                          onChange={(e) => setDraftField('site_contact_phone', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Location</h3>
                    <div>
                      <label className={labelClass} htmlFor="edit-job-address">Address</label>
                      <input
                        id="edit-job-address"
                        type="text"
                        value={draft.address}
                        onChange={(e) => setDraftField('address', e.target.value)}
                        placeholder="e.g. 12 Harbour View Road, Devonport, Auckland 0624"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="edit-job-location-notes">Location notes</label>
                      <textarea
                        id="edit-job-location-notes"
                        rows={2}
                        value={draft.location_notes}
                        onChange={(e) => setDraftField('location_notes', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </>
              ) : (
                job && (
                  <>
                    <Section title="Job & services" icon={<ClipboardList className="w-4 h-4 text-indigo-600" />}>
                      <Row label="Job type">
                        {job.job_type ? getJobTypeLabel(job.job_type) : <EmptyValue />}
                      </Row>
                      <Row label="Services Required / Job Scope">
                        {job.services_text ? (
                          <span className="whitespace-pre-wrap">{job.services_text}</span>
                        ) : (
                          <EmptyValue />
                        )}
                      </Row>
                      <Row label="Access Requirements">
                        {job.access_notes ? (
                          <span className="whitespace-pre-wrap">{job.access_notes}</span>
                        ) : (
                          <EmptyValue />
                        )}
                      </Row>
                      <Row label="Lead source">
                        {job.lead_source ? getLeadSourceLabel(job.lead_source) : <EmptyValue />}
                      </Row>
                      <Row label="Frequency">
                        {job.frequency ? describeJobFrequency(job.frequency, job.frequency_note) : <EmptyValue>Not set</EmptyValue>}
                      </Row>
                    </Section>

                    <Section title="Customer" icon={<UserIcon className="w-4 h-4 text-indigo-600" />}>
                      <Row label="Name">
                        {job.customer_name ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <span className="font-medium">{job.customer_name}</span>
                            {job.customer_id && onOpenCustomer && (
                              <button
                                type="button"
                                onClick={() => onOpenCustomer(job.customer_id!)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                              >
                                Open profile
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ) : (
                          <EmptyValue />
                        )}
                      </Row>
                      <Row label="Phone">
                        {job.customer_phone ? (
                          <a href={`tel:${job.customer_phone}`} className="text-indigo-600 hover:underline inline-flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {job.customer_phone}
                          </a>
                        ) : (
                          <EmptyValue />
                        )}
                      </Row>
                      <Row label="Email">
                        {job.customer_email ? (
                          <a href={`mailto:${job.customer_email}`} className="text-indigo-600 hover:underline inline-flex items-center gap-1 break-all">
                            <Mail className="w-3.5 h-3.5" />
                            {job.customer_email}
                          </a>
                        ) : (
                          <EmptyValue />
                        )}
                      </Row>
                      <Row label="Site contact">
                        {job.site_contact_name || job.site_contact_phone ? (
                          <span>
                            {job.site_contact_name || '—'}
                            {job.site_contact_phone ? (
                              <a href={`tel:${job.site_contact_phone}`} className="text-indigo-600 hover:underline ml-2">
                                {job.site_contact_phone}
                              </a>
                            ) : null}
                          </span>
                        ) : (
                          <EmptyValue />
                        )}
                      </Row>
                    </Section>

                    <Section title="Location" icon={<MapPin className="w-4 h-4 text-indigo-600" />}>
                      <Row label="Address">{job.address || <EmptyValue />}</Row>
                      <Row label="Location notes">
                        {job.location_notes ? (
                          <span className="whitespace-pre-wrap">{job.location_notes}</span>
                        ) : (
                          <EmptyValue />
                        )}
                      </Row>
                    </Section>
                  </>
                )
              )}

              {job && isManager && (
                <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Pricing</h3>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Managers only — handled in parallel. Pricing never blocks confirming, scheduling or the crew.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3">
                    <div>
                      <label className={labelClass} htmlFor="job-price-amount">Amount (NZD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                        <input
                          id="job-price-amount"
                          type="text"
                          inputMode="decimal"
                          value={priceDraft}
                          onChange={(e) => setPriceDraft(e.target.value)}
                          placeholder="450.00"
                          className={`${inputClass} pl-7`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="job-price-note">Note (optional)</label>
                      <input
                        id="job-price-note"
                        type="text"
                        value={priceNoteDraft}
                        onChange={(e) => setPriceNoteDraft(e.target.value)}
                        placeholder="e.g. incl. GST, quote #123"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  {priceError && (
                    <p className="text-[11px] text-rose-600">{priceError}</p>
                  )}
                  {(() => {
                    const dirty =
                      amountInputToCents(priceDraft) !== (job.price_cents ?? null) ||
                      !isValidAmountInput(priceDraft) ||
                      priceNoteDraft.trim() !== (job.price_note || '').trim();
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500">
                          Saved: <span className="font-semibold text-slate-700">{formatCents(job.price_cents, 'not priced')}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          {dirty && (
                            <button
                              type="button"
                              onClick={() => {
                                setPriceDraft(centsToInput(job.price_cents));
                                setPriceNoteDraft(job.price_note || '');
                                setPriceError('');
                              }}
                              disabled={savingPrice}
                              className="py-2 px-3.5 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Reset
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={savePrice}
                            disabled={savingPrice || !dirty}
                            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                          >
                            {savingPrice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            {savingPrice ? 'Saving…' : 'Save price'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {job && !editing && (
                <Section title="Schedule & crew" icon={<CalendarClock className="w-4 h-4 text-indigo-600" />}>
                  <Row label="Scheduled">
                    {job.scheduled_date ? (
                      <span className="font-medium">{formatJobTimeWindow(job)}</span>
                    ) : (
                      <EmptyValue>Not scheduled</EmptyValue>
                    )}
                  </Row>
                  {job.series_id && job.occurrence_date && (
                    <Row label="Visit date">
                      <span className="font-medium">{job.occurrence_date}</span>
                    </Row>
                  )}
                  {job.series && (
                    <Row label="Recurring">
                      <div className="flex flex-wrap items-center gap-2">
                        <Repeat className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        <span className="font-medium">{describeRecurrence(job.series)}</span>
                        {onOpenSeries &&
                          job.series_id &&
                          (user?.role === 'manager' || user?.role === 'customer_service') && (
                            <button
                              type="button"
                              onClick={() => onOpenSeries(job.series_id!)}
                              className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 underline underline-offset-2 cursor-pointer"
                            >
                              Manage series
                            </button>
                          )}
                      </div>
                    </Row>
                  )}
                  <Row label="Crew">
                    {(job.assignments?.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(job.assignments || []).map((assignment: JobAssignment) => (
                          <span
                            key={assignment.id}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                              assignment.is_lead
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {assignment.user_name || 'Staff'}
                            {assignment.is_lead && (
                              <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded-sm bg-indigo-200 text-indigo-900">
                                Lead
                              </span>
                            )}
                            {!assignment.is_lead && canProcess && (
                              <button
                                type="button"
                                onClick={() => setLead(assignment.id)}
                                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-white/80 text-indigo-700 hover:bg-white cursor-pointer"
                                title="Make this person the team lead"
                              >
                                Make lead
                              </button>
                            )}
                            {canProcess && (
                              <button
                                type="button"
                                onClick={() => removeAssignment(assignment.id)}
                                disabled={removingAssignmentId === assignment.id}
                                className="p-0.5 rounded-full hover:bg-white/70 text-slate-500 hover:text-rose-600 cursor-pointer disabled:opacity-50"
                                title="Remove from job"
                              >
                                {removingAssignmentId === assignment.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <X className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <EmptyValue>No crew assigned</EmptyValue>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1.5">
                      Add or change crew via <span className="font-semibold text-slate-500">Schedule</span>.
                    </div>
                  </Row>
                </Section>
              )}

              {job && !editing && (
                <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Media</h3>
                  </div>

                  <div>
                    <h4 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
                      Job photos (intake)
                    </h4>
                    <JobMediaUploader
                      jobId={job.id}
                      phase="intake"
                      media={phaseMedia('intake')}
                      onMediaChange={(items) => setPhaseMedia('intake', items)}
                      allowVideo
                    />
                  </div>

                  <div>
                    <h4 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
                      Start evidence
                    </h4>
                    <JobMediaUploader
                      jobId={job.id}
                      phase="start"
                      media={phaseMedia('start')}
                      onMediaChange={(items) => setPhaseMedia('start', items)}
                      allowVideo
                    />
                  </div>

                  <div>
                    <h4 className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">
                      Completion evidence
                    </h4>
                    <JobMediaUploader
                      jobId={job.id}
                      phase="completion"
                      media={phaseMedia('completion')}
                      onMediaChange={(items) => setPhaseMedia('completion', items)}
                      allowVideo
                      photoLimit={60}
                    />
                  </div>
                </div>
              )}

              {job && (
                <div className="p-4 bg-white rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Timeline</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <Row label="Inquiry received (first contact)">
                      <span>
                        {formatDateTimeLocal(job.created_at)}
                        {job.created_by_name ? <span className="text-slate-500"> · {job.created_by_name}</span> : null}
                      </span>
                    </Row>
                    {job.ready_at && (
                      <Row label="Ready for processing">
                        <span>{formatDateTimeLocal(job.ready_at)}</span>
                      </Row>
                    )}
                    <Row label="Started on site">
                      {job.started_at ? formatDateTimeLocal(job.started_at) : <EmptyValue />}
                    </Row>
                    <Row label="Completed">
                      {job.completed_at ? formatDateTimeLocal(job.completed_at) : <EmptyValue />}
                    </Row>
                    <Row label="Faults or damages checked">
                      {job.faults_damages_checked ? (
                        <span>
                          Yes
                          {job.faults_damages_checked_at && (
                            <span className="text-slate-500">
                              {' · '}{formatDateTimeLocal(job.faults_damages_checked_at)}
                              {job.faults_damages_checked_by_name ? ` · ${job.faults_damages_checked_by_name}` : ''}
                            </span>
                          )}
                        </span>
                      ) : (
                        <EmptyValue />
                      )}
                    </Row>
                    {job.cancelled_reason && (
                      <Row label="Cancelled">
                        <div>
                          {job.cancelled_at ? (
                            <div className="text-slate-500">{formatDateTimeLocal(job.cancelled_at)}</div>
                          ) : null}
                          <div className="text-rose-700">{job.cancelled_reason}</div>
                        </div>
                      </Row>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {job && !loading && (
          <div className="p-4 border-t border-slate-100 bg-slate-50">
            {job.running_late && (
              <div className="mb-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 justify-between">
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        Running late
                        {job.late_reported_at ? ` · reported ${formatDateTimeLocal(job.late_reported_at)}` : ''}
                      </p>
                      <p className="text-sm text-amber-800 mt-0.5">{job.late_note || 'No details provided'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearLate}
                    disabled={clearingLate}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {clearingLate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {clearingLate ? 'Updating…' : 'Mark back on track'}
                  </button>
                </div>
              </div>
            )}
            {confirmingCancel ? (
              <div className="space-y-2">
                <label className={labelClass} htmlFor="cancel-job-reason">
                  Cancellation reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="cancel-job-reason"
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Why is this job being cancelled?"
                  className={inputClass}
                />
                {job?.series_id && isManager && (
                  <div className="space-y-1.5 p-3 bg-rose-50/60 border border-rose-200 rounded-xl">
                    <span className={labelClass}>Scope</span>
                    <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="cancel-scope"
                        checked={cancelScope === 'this'}
                        onChange={() => setCancelScope('this')}
                        className="mt-0.5 accent-rose-600"
                      />
                      <span>
                        <span className="font-semibold">This visit only</span> — the recurring series keeps going.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="cancel-scope"
                        checked={cancelScope === 'future'}
                        onChange={() => setCancelScope('future')}
                        className="mt-0.5 accent-rose-600"
                      />
                      <span>
                        <span className="font-semibold">This and all future visits</span> — ends the series; future visits
                        are removed or cancelled and the crew notified.
                      </span>
                    </label>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingCancel(false);
                      setCancelReason('');
                      setCancelScope('this');
                    }}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer"
                  >
                    Keep job
                  </button>
                  <button
                    type="button"
                    onClick={() => changeStatus('cancelled', cancelReason.trim(), cancelScope)}
                    disabled={mutating === 'cancelled' || !cancelReason.trim()}
                    className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {mutating === 'cancelled' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                    Confirm cancel
                  </button>
                </div>
              </div>
            ) : editing ? (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(null);
                  }}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit || !draft?.title.trim() || !draft?.address.trim()}
                  className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px] text-[11px] text-slate-500">
                  {status === 'scheduled' && (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      Scheduled — waiting for the team lead to start on site
                    </span>
                  )}
                  {status === 'ready' && (
                    <span className="inline-flex items-center gap-1 text-teal-700 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      In the Process Queue — schedule and allocate the crew
                    </span>
                  )}
                </div>

                {status === 'awaiting_info' && canIntake && (
                  <button
                    type="button"
                    onClick={() => changeStatus('ready')}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {mutating === 'ready' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                    Send to Process Queue
                  </button>
                )}

                {status === 'ready' && (
                  <>
                    {canIntake && (
                      <button
                        type="button"
                        onClick={() => changeStatus('awaiting_info')}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {mutating === 'awaiting_info' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        Back to awaiting info
                      </button>
                    )}
                    {canProcess && (
                      <>
                        <button
                          type="button"
                          onClick={() => setScheduleOpen(true)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          Schedule &amp; allocate staff
                        </button>
                        {!isManager && (
                          <p className="w-full text-[11px] text-slate-500">
                            Pricing is handled separately by the manager. You don&apos;t need to wait for it.
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}

                {(status === 'scheduled' || status === 'in_progress') && canProcess && (
                  <button
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white font-medium text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    Reschedule
                  </button>
                )}

                {canCancel && (
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-rose-200 text-rose-600 font-medium text-xs hover:bg-rose-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Cancel job
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {scheduleOpen && job && (
        <ScheduleJobModal
          isOpen={scheduleOpen}
          job={job}
          onClose={() => setScheduleOpen(false)}
          onScheduled={(updated) => {
            setJob(updated);
            onChanged();
          }}
          prefill={
            job.occurrence_date
              ? {
                  date: job.occurrence_date,
                  startTime: job.series?.start_time || '',
                  finishTime: job.series?.finish_time || '',
                }
              : undefined
          }
        />
      )}
    </div>
  );
};
