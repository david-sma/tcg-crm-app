import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  Briefcase,
  Car,
  CheckCircle2,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Star,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatDateTimeLocal } from '../../lib/dateUtils.ts';
import { getJobTypeLabel } from '../../config/jobServices.ts';
import { COMPLETION_MAX_PHOTOS, COMPLETION_PHOTO_SUGGESTED, JOB_STATUS_LABELS } from '../../config/jobs.ts';
import type { Job, JobMedia } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { JobMediaUploader } from '../common/JobMediaUploader.tsx';

const STATUS_CHIP_CLASS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600',
  enriching: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-teal-100 text-teal-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  ongoing: 'bg-violet-100 text-violet-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

function formatDateLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unscheduled';
  try {
    return format(parseISO(`${dateStr}T12:00:00`), 'EEE, d MMM yyyy');
  } catch {
    return dateStr;
  }
}

function formatTimeWindow(job: Job): string {
  const start = job.scheduled_start_time;
  const finish = job.scheduled_finish_time;
  if (start && finish) return `${start} – ${finish}`;
  return start || finish || 'Time TBC';
}

interface StaffJobDetailModalProps {
  isOpen: boolean;
  jobId: string | null;
  onClose: () => void;
  onChanged: () => void;
  onNavigate?: (tab: string) => void;
}

export const StaffJobDetailModal: React.FC<StaffJobDetailModalProps> = ({
  isOpen,
  jobId,
  onClose,
  onChanged,
  onNavigate,
}) => {
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startMedia, setStartMedia] = useState<JobMedia[]>([]);
  const [completionMedia, setCompletionMedia] = useState<JobMedia[]>([]);
  const [startStep, setStartStep] = useState<'review' | 'capture'>('review');
  const [startNotes, setStartNotes] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [mutating, setMutating] = useState(false);
  const [lateNote, setLateNote] = useState('');
  const [lateSubmitting, setLateSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const startEvidenceRef = useRef<HTMLElement>(null);

  const refreshJob = useCallback(async () => {
    if (!jobId) return;
    const data = await apiFetch<{ job: Job }>(`/api/jobs/${jobId}`);
    setJob(data.job);
  }, [jobId]);

  useEffect(() => {
    if (!isOpen || !jobId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      setJob(null);
      setStartStep('review');
      setStartNotes('');
      setCompletionNotes('');
      setLateNote('');
      setActionError(null);
      setSuccessBanner(null);
      try {
        const data = await apiFetch<{ job: Job }>(`/api/jobs/${jobId}`);
        if (!cancelled) {
          setJob(data.job);
          setLateNote(data.job.late_note || '');
        }
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || 'Failed to load the job.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, jobId]);

  useEffect(() => {
    if (!job) return;
    setStartMedia((job.media || []).filter((item) => item.phase === 'start'));
    setCompletionMedia((job.media || []).filter((item) => item.phase === 'completion'));
  }, [job]);

  const handleStart = async () => {
    if (!jobId) return;
    setMutating(true);
    setActionError(null);
    try {
      await apiFetch(`/api/jobs/${jobId}/start`, {
        method: 'POST',
        body: JSON.stringify({ notes: startNotes.trim() || undefined }),
      });
      await refreshJob();
      setSuccessBanner('Job in progress — uploads keep processing in the background');
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to start the job.');
    } finally {
      setMutating(false);
    }
  };

  const handleComplete = async () => {
    if (!jobId) return;
    setMutating(true);
    setActionError(null);
    try {
      await apiFetch(`/api/jobs/${jobId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ notes: completionNotes.trim() || undefined }),
      });
      await refreshJob();
      setSuccessBanner(null);
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to complete the job.');
    } finally {
      setMutating(false);
    }
  };

  const handleReportLate = async () => {
    if (!jobId) return;
    setLateSubmitting(true);
    setActionError(null);
    try {
      const data = await apiFetch<{ job: Job }>(`/api/jobs/${jobId}/running-late`, {
        method: 'POST',
        body: JSON.stringify({ note: lateNote.trim() || undefined }),
      });
      setJob(data.job);
      setLateNote(data.job.late_note || '');
      setSuccessBanner(null);
      onChanged();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to report running late.');
    } finally {
      setLateSubmitting(false);
    }
  };

  const handleCloseShift = () => {
    onNavigate?.('my-timesheet');
    onClose();
  };

  if (!isOpen || !jobId) return null;

  const isLead = job?.assignments?.find((assignment) => assignment.user_id === user?.id)?.is_lead === true;
  const status = job?.status;
  const canStart = isLead && (status === 'scheduled' || status === 'ongoing');
  const canComplete = isLead && status === 'in_progress';
  const canReportLate = isLead && (status === 'ongoing' || status === 'in_progress');
  const showCompletedPanel = isLead && status === 'completed';
  const fullAddress = job ? [job.address, job.suburb, job.city, job.postcode].filter(Boolean).join(', ') : '';
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-5 text-white relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 pr-10">
            <div className="p-3 bg-white/15 rounded-xl backdrop-blur-xs">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold truncate">{job?.title || 'Job'}</h2>
                {job && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_CHIP_CLASS[job.status] || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {JOB_STATUS_LABELS[job.status] || job.status}
                  </span>
                )}
              </div>
              {job && <div className="text-sm text-white/80 mt-0.5">{job.job_order_number}</div>}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {loading && (
            <div className="py-10 text-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto mb-2" />
              <div className="animate-pulse text-sm">Loading job details...</div>
            </div>
          )}

          {!loading && loadError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <div className="flex items-start gap-2.5 text-sm text-rose-900">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <span>{loadError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null);
                  refreshJob().catch((err: any) => setLoadError(err?.message || 'Failed to load the job.'));
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !loadError && job && (
            <>
              {job.running_late && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                  <div className="min-w-0">
                    <div className="font-semibold">
                      Running late reported
                      {job.late_reported_at ? ` • ${formatDateTimeLocal(job.late_reported_at)}` : ''}
                    </div>
                    <div className="whitespace-pre-wrap mt-0.5">{job.late_note || 'No details provided'}</div>
                  </div>
                </div>
              )}

              <section>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">When &amp; where</h3>
                <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div>
                    <div className="text-base font-bold text-slate-900">{formatDateLabel(job.scheduled_date)}</div>
                    <div className="text-2xl font-bold text-slate-900 tracking-tight">{formatTimeWindow(job)}</div>
                  </div>
                  <div className="flex items-start gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-700">{job.address || 'Address TBC'}</div>
                      {[job.suburb, job.city, job.postcode].filter(Boolean).length > 0 && (
                        <div className="text-xs text-slate-500">
                          {[job.suburb, job.city, job.postcode].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  {job.driver_name && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Car className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">Driver</div>
                        <div className="text-sm font-medium text-slate-700 truncate">{job.driver_name}</div>
                      </div>
                    </div>
                  )}
                  {job.location_notes && (
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold">Location notes:</span>{' '}
                      <span className="whitespace-pre-wrap">{job.location_notes}</span>
                    </div>
                  )}
                  {job.access_notes && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Access notes</div>
                        <div className="whitespace-pre-wrap">{job.access_notes}</div>
                      </div>
                    </div>
                  )}
                  {fullAddress && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors"
                    >
                      <Navigation className="w-4 h-4" />
                      Open in maps
                    </a>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</h3>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500">Customer</div>
                      <div className="text-sm font-semibold text-slate-800 truncate">{job.customer_name}</div>
                    </div>
                    {job.customer_phone && (
                      <a
                        href={`tel:${job.customer_phone}`}
                        className="p-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                        aria-label="Call customer"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  {(job.site_contact_name || job.site_contact_phone) && (
                    <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">Site contact</div>
                        <div className="text-sm font-semibold text-slate-800 truncate">
                          {job.site_contact_name || 'Site contact'}
                        </div>
                      </div>
                      {job.site_contact_phone && (
                        <a
                          href={`tel:${job.site_contact_phone}`}
                          className="p-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                          aria-label="Call site contact"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">What to do</h3>
                <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div>
                    <div className="text-xs text-slate-500">Job type</div>
                    <div className="text-sm font-semibold text-slate-800">{getJobTypeLabel(job.job_type)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Services</div>
                    {job.services_text?.trim() ? (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.services_text}</p>
                    ) : (
                      <p className="text-sm text-slate-400">—</p>
                    )}
                  </div>
                  {job.details && (
                    <div>
                      <div className="text-xs text-slate-500">Details</div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.details}</p>
                    </div>
                  )}
                  {job.scope_notes && (
                    <div>
                      <div className="text-xs text-slate-500">Scope notes</div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.scope_notes}</p>
                    </div>
                  )}
                </div>
              </section>

              {(job.assignments?.length ?? 0) > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Crew</h3>
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {job.assignments!.map((assignment) => (
                      <div key={assignment.id} className="flex items-center justify-between gap-2 p-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Users className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="text-sm font-medium text-slate-800 truncate">
                            {assignment.user_name || 'Crew member'}
                          </span>
                          {assignment.user_id === user?.id && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-blue-100 text-blue-700 shrink-0">
                              You
                            </span>
                          )}
                        </div>
                        {assignment.is_lead && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700 shrink-0">
                            <Star className="w-3 h-3" />
                            Lead
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(status === 'scheduled' || status === 'ongoing' || status === 'in_progress') && (
                <section ref={startEvidenceRef}>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Start evidence</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Record a walkthrough video of the building and take a few photos before you start.
                  </p>
                  <div className="mt-2">
                    <JobMediaUploader
                      jobId={job.id}
                      phase="start"
                      media={startMedia}
                      onMediaChange={setStartMedia}
                      allowVideo={true}
                      disabled={!isLead}
                    />
                  </div>
                </section>
              )}

              {(status === 'in_progress' || status === 'completed') && (
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completion evidence</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Add photos of the finished job — most crews send about {COMPLETION_PHOTO_SUGGESTED} so every area is
                    covered.
                  </p>
                  <div className="mt-2">
                    <JobMediaUploader
                      jobId={job.id}
                      phase="completion"
                      media={completionMedia}
                      onMediaChange={setCompletionMedia}
                      allowVideo={false}
                      photoLimit={COMPLETION_MAX_PHOTOS}
                      disabled={!isLead}
                    />
                  </div>
                </section>
              )}

              {(job.start_notes || job.completion_notes || job.started_at || job.completed_at) && (
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Execution</h3>
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    {job.started_at && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">Started</span>
                        <span className="text-sm font-medium text-slate-800">{formatDateTimeLocal(job.started_at)}</span>
                      </div>
                    )}
                    {job.start_notes && (
                      <div>
                        <div className="text-xs text-slate-500">Start note</div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.start_notes}</p>
                      </div>
                    )}
                    {job.completed_at && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-500">Completed</span>
                        <span className="text-sm font-medium text-slate-800">
                          {formatDateTimeLocal(job.completed_at)}
                        </span>
                      </div>
                    )}
                    {job.completion_notes && (
                      <div>
                        <div className="text-xs text-slate-500">Completion note</div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{job.completion_notes}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {canReportLate && (
                <section>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Report running late</h3>
                  <div className="mt-2 space-y-2.5">
                    <textarea
                      id="job-late-note"
                      value={lateNote}
                      onChange={(e) => setLateNote(e.target.value)}
                      placeholder="What's causing the delay? e.g. waiting on access, ~30 min behind"
                      rows={2}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                    />
                    <button
                      type="button"
                      onClick={handleReportLate}
                      disabled={lateSubmitting}
                      className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md hover:shadow-amber-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {lateSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {lateSubmitting
                        ? 'Submitting...'
                        : job.running_late
                          ? 'Update running late report'
                          : 'Report running late'}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {(canStart || canComplete || showCompletedPanel) && (
          <div className="border-t border-slate-100 p-4 bg-white shrink-0 space-y-3">
            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                <span>{actionError}</span>
              </div>
            )}
            {successBanner && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
                <span>{successBanner}</span>
              </div>
            )}

            {canStart && startStep === 'review' && job && (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">You are about to start:</span> {job.title} at{' '}
                    {job.scheduled_start_time || 'the scheduled time'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStartStep('capture');
                    setActionError(null);
                    window.setTimeout(() => {
                      startEvidenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                  }}
                  disabled={mutating}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  I&apos;m on site — add start evidence
                </button>
              </>
            )}

            {canStart && startStep === 'capture' && (
              <>
                <div>
                  <label
                    htmlFor="job-start-note"
                    className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5"
                  >
                    Start note
                  </label>
                  <textarea
                    id="job-start-note"
                    value={startNotes}
                    onChange={(e) => setStartNotes(e.target.value)}
                    placeholder="Optional — anything worth noting when you arrived"
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={mutating}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {mutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {mutating ? 'Starting...' : 'Confirm job in process'}
                </button>
              </>
            )}

            {canComplete && (
              <>
                <div>
                  <label
                    htmlFor="job-completion-note"
                    className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5"
                  >
                    Completion note
                  </label>
                  <textarea
                    id="job-completion-note"
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    placeholder="Optional — anything worth noting about the finished job"
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={mutating}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {mutating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {mutating ? 'Submitting...' : 'Report job completed'}
                </button>
              </>
            )}

            {showCompletedPanel && job && (
              <>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-1">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="text-base font-bold text-emerald-900">Job completed</h3>
                  {job.started_at && (
                    <p className="text-xs text-emerald-800">Started {formatDateTimeLocal(job.started_at)}</p>
                  )}
                  {job.completed_at && (
                    <p className="text-xs text-emerald-800">Completed {formatDateTimeLocal(job.completed_at)}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseShift}
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    Close shift / timesheet
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
                  >
                    Next job
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
