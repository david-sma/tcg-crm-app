import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../lib/api.ts';
import type { Job, LeadSource } from '../../../types/index.ts';
import {
  JOB_TYPE_OPTIONS,
  JOB_SERVICE_CATEGORIES,
  LEAD_SOURCE_OPTIONS,
} from '../../../config/jobServices.ts';
import { JobMediaUploader } from '../../common/JobMediaUploader.tsx';
import { X, FilePlus2, CheckCircle2, Camera, Loader2, ImagePlus } from 'lucide-react';

interface NewJobFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (job: Job) => void;
}

interface FormErrors {
  title?: string;
  customer_name?: string;
  address?: string;
}

const EMPTY_FORM = {
  title: '',
  job_type: JOB_TYPE_OPTIONS[0]?.id || 'other',
  services: [] as string[],
  details: '',
  lead_source: 'manual' as LeadSource,
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  site_contact_name: '',
  site_contact_phone: '',
  address: '',
  suburb: '',
  city: '',
  postcode: '',
  location_notes: '',
  access_notes: '',
  scope_notes: '',
  agreed_price: '',
};

export const NewJobFormModal: React.FC<NewJobFormModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [phase, setPhase] = useState<'details' | 'photos'>('details');
  const [createdJob, setCreatedJob] = useState<Job | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm({ ...EMPTY_FORM, services: [] });
      setErrors({});
      setSubmitError('');
      setSubmitting(false);
      setPhase('details');
      setCreatedJob(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const setField = (field: keyof typeof EMPTY_FORM, value: string | string[]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const toggleService = (serviceId: string) => {
    setForm((current) => ({
      ...current,
      services: current.services.includes(serviceId)
        ? current.services.filter((id) => id !== serviceId)
        : [...current.services, serviceId],
    }));
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.title.trim()) next.title = 'Job name is required.';
    if (!form.customer_name.trim()) next.customer_name = 'Customer name is required.';
    if (!form.address.trim()) next.address = 'Address is required.';
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
          services: form.services,
          details: form.details.trim(),
          lead_source: form.lead_source,
          customer_name: form.customer_name.trim(),
          customer_phone: form.customer_phone.trim() || null,
          customer_email: form.customer_email.trim() || null,
          site_contact_name: form.site_contact_name.trim() || null,
          site_contact_phone: form.site_contact_phone.trim() || null,
          address: form.address.trim(),
          suburb: form.suburb.trim() || null,
          city: form.city.trim() || null,
          postcode: form.postcode.trim() || null,
          location_notes: form.location_notes.trim() || null,
          access_notes: form.access_notes.trim() || null,
          scope_notes: form.scope_notes.trim() || null,
          agreed_price: form.agreed_price.trim() || null,
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
                  ? 'Capture the enquiry — you can refine it later.'
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
                <span className={labelClass}>Services</span>
                <div className="space-y-2.5">
                  {JOB_SERVICE_CATEGORIES.map((category) => (
                    <div key={category.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        {category.label}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {category.services.map((service) => {
                          const selected = form.services.includes(service.id);
                          return (
                            <button
                              key={service.id}
                              type="button"
                              onClick={() => toggleService(service.id)}
                              title={service.hints?.join(' · ')}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                                selected
                                  ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                              }`}
                            >
                              {selected && <CheckCircle2 className="w-3 h-3" />}
                              <span>{service.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="new-job-details">
                  Details
                </label>
                <textarea
                  id="new-job-details"
                  rows={3}
                  value={form.details}
                  onChange={(e) => setField('details', e.target.value)}
                  placeholder="What does the customer need done?"
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
              <div>
                <label className={labelClass} htmlFor="new-job-customer-name">
                  Customer name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-job-customer-name"
                  type="text"
                  value={form.customer_name}
                  onChange={(e) => setField('customer_name', e.target.value)}
                  className={inputClass(!!errors.customer_name)}
                />
                {errors.customer_name && <p className="text-[11px] text-rose-600 mt-1">{errors.customer_name}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="new-job-customer-phone">
                    Customer phone
                  </label>
                  <input
                    id="new-job-customer-phone"
                    type="tel"
                    value={form.customer_phone}
                    onChange={(e) => setField('customer_phone', e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="new-job-customer-email">
                    Customer email
                  </label>
                  <input
                    id="new-job-customer-email"
                    type="email"
                    value={form.customer_email}
                    onChange={(e) => setField('customer_email', e.target.value)}
                    className={inputClass()}
                  />
                </div>
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
                  className={inputClass(!!errors.address)}
                />
                {errors.address && <p className="text-[11px] text-rose-600 mt-1">{errors.address}</p>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass} htmlFor="new-job-suburb">
                    Suburb
                  </label>
                  <input
                    id="new-job-suburb"
                    type="text"
                    value={form.suburb}
                    onChange={(e) => setField('suburb', e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="new-job-city">
                    City
                  </label>
                  <input
                    id="new-job-city"
                    type="text"
                    value={form.city}
                    onChange={(e) => setField('city', e.target.value)}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="new-job-postcode">
                    Postcode
                  </label>
                  <input
                    id="new-job-postcode"
                    type="text"
                    value={form.postcode}
                    onChange={(e) => setField('postcode', e.target.value)}
                    className={inputClass()}
                  />
                </div>
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

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Scope &amp; access</h3>
              <div>
                <label className={labelClass} htmlFor="new-job-access-notes">
                  Access notes
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
                <label className={labelClass} htmlFor="new-job-scope-notes">
                  Scope notes
                </label>
                <textarea
                  id="new-job-scope-notes"
                  rows={2}
                  value={form.scope_notes}
                  onChange={(e) => setField('scope_notes', e.target.value)}
                  className={inputClass()}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="new-job-agreed-price">
                  Agreed price
                </label>
                <input
                  id="new-job-agreed-price"
                  type="text"
                  value={form.agreed_price}
                  onChange={(e) => setField('agreed_price', e.target.value)}
                  placeholder="e.g. $450 incl. GST"
                  className={inputClass()}
                />
              </div>
            </div>
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
