import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.ts';
import type { Customer, CustomerType } from '../../types/index.ts';
import { CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES } from '../../config/customers.ts';
import { Loader2, Save, X } from 'lucide-react';

interface CustomerFormModalProps {
  /** Existing customer to edit; omit to create a new one. */
  customer?: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
  /** Called when the API reports a duplicate name, to offer opening that customer. */
  onOpenExisting?: (customerId: string) => void;
}

const labelClass = 'block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1';
const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500';

/** Create or edit a customer — the only place customer contact details change. */
export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({ customer, onClose, onSaved, onOpenExisting }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomerType>('residential');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  useEffect(() => {
    setName(customer?.name ?? '');
    setType(customer?.customer_type ?? 'residential');
    setPhone(customer?.phone ?? '');
    setEmail(customer?.email ?? '');
    setAddress(customer?.address ?? '');
    setNotes(customer?.notes ?? '');
    setError('');
    setDuplicateId(null);
  }, [customer]);

  const save = async (allowDuplicate = false) => {
    if (!name.trim()) {
      setError('Customer name is required.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      setDuplicateId(null);
      const body = JSON.stringify({
        name: name.trim(),
        customer_type: type,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        ...(allowDuplicate ? { allow_duplicate: true } : {}),
      });
      const res = customer
        ? await apiFetch<{ customer: Customer }>(`/api/customers/${customer.id}`, { method: 'PUT', body })
        : await apiFetch<{ customer: Customer }>('/api/customers', { method: 'POST', body });
      onSaved(res.customer);
    } catch (err: any) {
      setError(err?.message || 'Failed to save customer');
      const existingId = err?.data?.existing_customer_id ?? err?.body?.existing_customer_id ?? null;
      if (err?.status === 409 || /already exists|already named/i.test(err?.message || '')) {
        setDuplicateId(existingId ?? 'unknown');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 safe-overlay z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-3xl shadow-xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{customer ? 'Edit customer' : 'New customer'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem] gap-3">
            <div>
              <label className={labelClass} htmlFor="customer-form-name">
                Name <span className="text-rose-500">*</span>
              </label>
              <input id="customer-form-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="customer-form-type">Type</label>
              <select id="customer-form-type" value={type} onChange={(e) => setType(e.target.value as CustomerType)} className={inputClass}>
                {CUSTOMER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CUSTOMER_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="customer-form-phone">Phone</label>
              <input id="customer-form-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="customer-form-email">Email</label>
              <input id="customer-form-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="customer-form-address">Main address</label>
            <input
              id="customer-form-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Prefills the address on new jobs"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="customer-form-notes">Notes</label>
            <textarea id="customer-form-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>

          {customer && (
            <p className="text-[11px] text-slate-500">
              Name, phone and email changes also update this customer's jobs and recurring series.
            </p>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-2">
              <p>{error}</p>
              {duplicateId && (
                <div className="flex flex-wrap gap-2">
                  {duplicateId !== 'unknown' && onOpenExisting && (
                    <button
                      type="button"
                      onClick={() => onOpenExisting(duplicateId)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                    >
                      Open existing customer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => save(true)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                  >
                    Save anyway
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="py-2 px-4 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : 'Save customer'}
          </button>
        </div>
      </div>
    </div>
  );
};
