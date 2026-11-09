import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api.ts';
import type { CustomerListItem, CustomerType } from '../../types/index.ts';
import { CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES } from '../../config/customers.ts';
import { Loader2, Mail, Phone, Plus, Search, UserRound, X } from 'lucide-react';

export interface NewCustomerDraft {
  name: string;
  customer_type: CustomerType;
  phone: string;
  email: string;
}

/** What the job form sends: an existing customer, or details for a new one. */
export type CustomerSelection =
  | { mode: 'existing'; customer: CustomerListItem }
  | { mode: 'new'; draft: NewCustomerDraft }
  | null;

interface CustomerPickerProps {
  value: CustomerSelection;
  onChange: (value: CustomerSelection) => void;
  error?: string;
  inputClass: (hasError?: boolean) => string;
  labelClass: string;
}

const EMPTY_DRAFT: NewCustomerDraft = { name: '', customer_type: 'residential', phone: '', email: '' };

/**
 * Customer field for the New Job form: search existing customers by name,
 * phone or email, or add a new one. Contact details of an existing customer
 * are read-only here — they are edited on the customer profile.
 */
export const CustomerPicker: React.FC<CustomerPickerProps> = ({ value, onChange, error, inputClass, labelClass }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (value) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetch<{ customers: CustomerListItem[] }>(
          `/api/customers?limit=8&search=${encodeURIComponent(term)}`,
        );
        if (id === requestId.current) setResults(res.customers || []);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, value]);

  if (value?.mode === 'existing') {
    const c = value.customer;
    return (
      <div>
        <span className={labelClass}>
          Customer <span className="text-rose-500">*</span>
        </span>
        <div className="flex items-start justify-between gap-3 p-3 rounded-xl border border-indigo-200 bg-indigo-50/50">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 truncate">{c.name}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                {CUSTOMER_TYPE_LABELS[c.customer_type]}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
              {c.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {c.phone}
                </span>
              )}
              {c.email && (
                <span className="inline-flex items-center gap-1 break-all">
                  <Mail className="w-3 h-3" />
                  {c.email}
                </span>
              )}
              {!c.phone && !c.email && <span className="italic text-slate-400">No contact details</span>}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {c.job_count} previous job{c.job_count === 1 ? '' : 's'} · contact details are edited on the customer profile
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
            className="shrink-0 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  if (value?.mode === 'new') {
    const draft = value.draft;
    const set = (patch: Partial<NewCustomerDraft>) => onChange({ mode: 'new', draft: { ...draft, ...patch } });
    return (
      <div className="space-y-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">New customer</span>
          <button
            type="button"
            onClick={() => {
              setQuery(draft.name);
              onChange(null);
            }}
            className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
          >
            Search existing instead
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem] gap-3">
          <div>
            <label className={labelClass} htmlFor="new-customer-name">
              Customer name <span className="text-rose-500">*</span>
            </label>
            <input
              id="new-customer-name"
              type="text"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className={inputClass(!!error)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-customer-type">Type</label>
            <select
              id="new-customer-type"
              value={draft.customer_type}
              onChange={(e) => set({ customer_type: e.target.value as CustomerType })}
              className={inputClass()}
            >
              {CUSTOMER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CUSTOMER_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="new-customer-phone">Phone</label>
            <input
              id="new-customer-phone"
              type="tel"
              value={draft.phone}
              onChange={(e) => set({ phone: e.target.value })}
              className={inputClass()}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-customer-email">Email</label>
            <input
              id="new-customer-email"
              type="email"
              value={draft.email}
              onChange={(e) => set({ email: e.target.value })}
              className={inputClass()}
            />
          </div>
        </div>
        {error && <p className="text-[11px] text-rose-600">{error}</p>}
        <p className="text-[10px] text-slate-400">
          If a customer with exactly this name already exists, the job is linked to that customer.
        </p>
      </div>
    );
  }

  const term = query.trim();
  return (
    <div className="relative">
      <label className={labelClass} htmlFor="customer-search">
        Customer <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id="customer-search"
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Search by name, phone or email"
          className={`${inputClass(!!error)} pl-9 pr-9`}
        />
        {searching && <Loader2 className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />}
        {!searching && query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-600 mt-1">{error}</p>}

      {open && term.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
          {results.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ mode: 'existing', customer });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
            >
              <UserRound className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900 truncate">{customer.name}</span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {[customer.phone, customer.email].filter(Boolean).join(' · ') || CUSTOMER_TYPE_LABELS[customer.customer_type]}
                </span>
              </span>
              <span className="text-[10px] text-slate-400 shrink-0">
                {customer.job_count} job{customer.job_count === 1 ? '' : 's'}
              </span>
            </button>
          ))}
          {!searching && results.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-slate-500">No matching customers.</div>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange({ mode: 'new', draft: { ...EMPTY_DRAFT, name: term } });
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 border-t border-slate-100 bg-slate-50/70 hover:bg-slate-100 flex items-center gap-2 text-sm font-semibold text-indigo-700 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New customer “{term}”
          </button>
        </div>
      )}
      {term.length < 2 && (
        <p className="text-[10px] text-slate-400 mt-1">
          Type at least 2 characters, or{' '}
          <button
            type="button"
            onClick={() => onChange({ mode: 'new', draft: { ...EMPTY_DRAFT } })}
            className="font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
          >
            add a new customer
          </button>
          .
        </p>
      )}
    </div>
  );
};
