import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import type { Customer, CustomerListItem, CustomerProfile, Job } from '../../types/index.ts';
import { CUSTOMER_TYPE_LABELS } from '../../config/customers.ts';
import { getJobTypeLabel } from '../../config/jobServices.ts';
import { describeRecurrence } from '../../config/jobs.ts';
import { formatCents } from '../../lib/money.ts';
import { JobStatusChip, RecurringBadge, formatScheduledDay } from '../manager/jobs/JobsBoardView.tsx';
import { JobDetailModal } from '../manager/jobs/JobDetailModal.tsx';
import { CustomerFormModal } from './CustomerFormModal.tsx';
import {
  ProfileHeader,
  ProfileSection,
  StatGrid,
  StatTile,
  initialsOf,
} from '../common/profile/ProfileLayout.tsx';
import {
  Archive,
  ArchiveRestore,
  Building2,
  ChevronRight,
  ClipboardList,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Repeat,
  Search,
  StickyNote,
  UserRound,
} from 'lucide-react';

interface CustomersModuleProps {
  /** Open this customer's profile on arrival (e.g. from a job's "Open profile"). */
  initialCustomerId?: string | null;
  onInitialCustomerHandled?: () => void;
  /** Managers only: open the Staff Directory filtered to this staff member. */
  onOpenStaff?: (staffName: string) => void;
  /** Open a recurring series in the Jobs module's Recurring tab. */
  onOpenSeries?: (seriesId: string) => void;
}

/** Visit date of a job: scheduled date, recurring visit date, or creation day. */
function jobDay(job: Job): string {
  return job.scheduled_date || job.occurrence_date || job.created_at.slice(0, 10);
}

const TypeBadge: React.FC<{ type: Customer['customer_type'] }> = ({ type }) => (
  <span
    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
      type === 'commercial'
        ? 'bg-sky-50 text-sky-800 border-sky-200'
        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
    }`}
  >
    {CUSTOMER_TYPE_LABELS[type]}
  </span>
);

export const CustomersModule: React.FC<CustomersModuleProps> = ({
  initialCustomerId,
  onInitialCustomerHandled,
  onOpenStaff,
  onOpenSeries,
}) => {
  const { user } = useAuth();
  const canEdit = user?.role === 'manager' || user?.role === 'customer_service';
  const [selectedId, setSelectedId] = useState<string | null>(initialCustomerId ?? null);
  const [creating, setCreating] = useState(false);
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    if (initialCustomerId) {
      setSelectedId(initialCustomerId);
      onInitialCustomerHandled?.();
    }
  }, [initialCustomerId, onInitialCustomerHandled]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {selectedId ? (
        <CustomerProfileView
          customerId={selectedId}
          canEdit={canEdit}
          onBack={() => {
            setSelectedId(null);
            setListKey((k) => k + 1);
          }}
          onOpenCustomer={setSelectedId}
          onOpenStaff={onOpenStaff}
          onOpenSeries={onOpenSeries}
        />
      ) : (
        <CustomerListView key={listKey} canEdit={canEdit} onOpen={setSelectedId} onCreate={() => setCreating(true)} />
      )}

      {creating && (
        <CustomerFormModal
          onClose={() => setCreating(false)}
          onSaved={(customer) => {
            setCreating(false);
            setSelectedId(customer.id);
          }}
          onOpenExisting={(id) => {
            setCreating(false);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
};

const CustomerListView: React.FC<{
  canEdit: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}> = ({ canEdit, onOpen, onCreate }) => {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'residential' | 'commercial'>('all');
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ customers: CustomerListItem[] }>(
        `/api/customers${showArchived ? '?include_archived=1' : ''}`,
      );
      setCustomers(res.customers || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return customers.filter((c) => {
      if (typeFilter !== 'all' && c.customer_type !== typeFilter) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term) ||
        (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits))
      );
    });
  }, [customers, search, typeFilter]);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
              <Building2 className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Customers</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Customer profiles with their full job history.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New customer
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone or email"
            aria-label="Search customers"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(['all', 'residential', 'commercial'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border shrink-0 cursor-pointer ${
                typeFilter === type
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {type === 'all' ? 'All' : CUSTOMER_TYPE_LABELS[type]}
            </button>
          ))}
          <label className="flex items-center gap-1.5 px-2 text-xs text-slate-600 shrink-0 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Archived
          </label>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 bg-white rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-500">
          {customers.length === 0 ? 'No customers yet.' : 'No customers match your search.'}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c.id)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-sm font-bold shrink-0">
                {initialsOf(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-slate-900 truncate">{c.name}</span>
                  <TypeBadge type={c.customer_type} />
                  {c.active_series_count > 0 && <RecurringBadge />}
                  {c.archived_at && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                      Archived
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details'}
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end text-[11px] text-slate-500 shrink-0">
                <span>
                  <span className="font-semibold text-slate-800">{c.job_count}</span> job{c.job_count === 1 ? '' : 's'}
                </span>
                <span>
                  {c.next_visit_date
                    ? `Next: ${formatScheduledDay(c.next_visit_date)}`
                    : c.last_job_date
                      ? `Last: ${formatScheduledDay(c.last_job_date)}`
                      : 'No visits yet'}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </>
  );
};

const CustomerProfileView: React.FC<{
  customerId: string;
  canEdit: boolean;
  onBack: () => void;
  onOpenCustomer: (id: string) => void;
  onOpenStaff?: (staffName: string) => void;
  onOpenSeries?: (seriesId: string) => void;
}> = ({ customerId, canEdit, onBack, onOpenCustomer, onOpenStaff, onOpenSeries }) => {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<CustomerProfile>(`/api/customers/${customerId}`);
      setProfile(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleArchive = async () => {
    if (!profile) return;
    const archived = Boolean(profile.customer.archived_at);
    if (!archived && !window.confirm(`Archive ${profile.customer.name}? Their history stays; they are hidden from the job form.`)) {
      return;
    }
    try {
      setArchiving(true);
      await apiFetch(`/api/customers/${customerId}/${archived ? 'unarchive' : 'archive'}`, { method: 'POST' });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update customer');
    } finally {
      setArchiving(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={onBack} className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer">
          ← All customers
        </button>
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error || 'Customer not found'}</div>
      </div>
    );
  }

  const { customer, stats, jobs, series } = profile;
  const visibleJobs = jobs.filter((job) =>
    statusFilter === 'all'
      ? true
      : statusFilter === 'completed'
        ? job.status === 'completed'
        : statusFilter === 'cancelled'
          ? job.status === 'cancelled'
          : job.status !== 'completed' && job.status !== 'cancelled',
  );
  const addresses = [...new Set(jobs.map((job) => job.address).filter(Boolean))];

  return (
    <>
      <ProfileHeader
        onBack={onBack}
        backLabel="All customers"
        initials={initialsOf(customer.name)}
        title={customer.name}
        badges={
          <>
            <TypeBadge type={customer.customer_type} />
            {customer.archived_at && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                Archived
              </span>
            )}
          </>
        }
        subtitle={`Customer since ${formatScheduledDay(customer.created_at.slice(0, 10))}`}
        actions={
          canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={toggleArchive}
                disabled={archiving}
                className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl border border-slate-300 text-slate-700 font-medium text-xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                {customer.archived_at ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {customer.archived_at ? 'Restore' : 'Archive'}
              </button>
            </>
          ) : undefined
        }
      />

      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

      <StatGrid>
        <StatTile label="Total jobs" value={stats.total_jobs} hint={`${stats.cancelled_jobs} cancelled`} />
        <StatTile label="Completed" value={stats.completed_jobs} />
        <StatTile label="Upcoming" value={stats.upcoming_jobs} hint={stats.active_series_count > 0 ? `${stats.active_series_count} recurring` : undefined} />
        {isManager ? (
          <StatTile
            label="Charged (completed)"
            value={formatCents(stats.completed_value_cents ?? 0)}
            hint={`Upcoming ${formatCents(stats.upcoming_value_cents ?? 0)}`}
          />
        ) : (
          <StatTile label="Recurring series" value={stats.active_series_count} />
        )}
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ProfileSection title="Contact" icon={<UserRound className="w-4 h-4 text-indigo-600" />}>
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-start gap-2">
              <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="text-indigo-600 hover:underline">{customer.phone}</a>
              ) : (
                <span className="text-slate-400 italic">No phone</span>
              )}
            </div>
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="text-indigo-600 hover:underline break-all">{customer.email}</a>
              ) : (
                <span className="text-slate-400 italic">No email</span>
              )}
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <span className={customer.address ? 'text-slate-800' : 'text-slate-400 italic'}>
                {customer.address || 'No main address'}
              </span>
            </div>
            {addresses.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Job addresses</div>
                <ul className="space-y-0.5 text-xs text-slate-600">
                  {addresses.map((address) => (
                    <li key={address} className="truncate">{address}</li>
                  ))}
                </ul>
              </div>
            )}
          </dl>
        </ProfileSection>

        <ProfileSection title="Notes" icon={<StickyNote className="w-4 h-4 text-indigo-600" />}>
          <p className={`text-sm whitespace-pre-wrap ${customer.notes ? 'text-slate-800' : 'text-slate-400 italic'}`}>
            {customer.notes || 'No notes yet.'}
          </p>
        </ProfileSection>

        <ProfileSection title="Recurring" icon={<Repeat className="w-4 h-4 text-indigo-600" />}>
          {series.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No recurring jobs.</p>
          ) : (
            <ul className="space-y-2">
              {series.map((item) => {
                const clickable = Boolean(onOpenSeries) && canEdit;
                const body = (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">{item.title}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                          item.status === 'ended'
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                      >
                        {item.status === 'pending' ? 'Waiting for details' : item.status === 'active' ? 'Active' : 'Ended'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{describeRecurrence(item)}</div>
                    {isManager && item.price_cents != null && (
                      <div className="text-[11px] text-slate-600 mt-0.5">{formatCents(item.price_cents)} per visit</div>
                    )}
                  </>
                );
                return (
                  <li key={item.id}>
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => onOpenSeries!(item.id)}
                        className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer"
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="p-2.5 rounded-xl border border-slate-200">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ProfileSection>
      </div>

      <ProfileSection
        title={`Job history (${jobs.length})`}
        icon={<ClipboardList className="w-4 h-4 text-indigo-600" />}
        actions={
          <div className="flex items-center gap-1 overflow-x-auto">
            {(['all', 'upcoming', 'completed', 'cancelled'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border shrink-0 cursor-pointer ${
                  statusFilter === key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        }
      >
        {visibleJobs.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-2">No jobs here yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 -mx-1">
            {visibleJobs.map((job) => {
              const crew = job.assignments || [];
              return (
                <li key={job.id} className="px-1 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className="flex-1 min-w-0 text-left group cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">{formatScheduledDay(jobDay(job))}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono">{job.job_order_number}</span>
                      {job.job_type && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span>{getJobTypeLabel(job.job_type)}</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-indigo-700">{job.title}</div>
                    <div className="text-[11px] text-slate-500 truncate">{job.address}</div>
                  </button>

                  {crew.length > 0 && (
                    <div className="flex flex-wrap gap-1 sm:max-w-[16rem]">
                      {crew.map((member) => {
                        const label = `${member.user_name || 'Staff'}${member.is_lead ? ' (lead)' : ''}`;
                        return onOpenStaff ? (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => onOpenStaff(member.user_name || '')}
                            title="Open in Staff Directory"
                            className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 hover:bg-indigo-100 hover:text-indigo-800 cursor-pointer"
                          >
                            {label}
                          </button>
                        ) : (
                          <span key={member.id} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-2 sm:justify-end shrink-0">
                    {isManager && (
                      <span className={`text-xs font-semibold ${job.price_cents != null ? 'text-slate-900' : 'text-slate-400'}`}>
                        {formatCents(job.price_cents, 'Not priced')}
                      </span>
                    )}
                    {job.series_id && <RecurringBadge />}
                    <JobStatusChip status={job.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ProfileSection>

      {editing && (
        <CustomerFormModal
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
          onOpenExisting={(id) => {
            setEditing(false);
            onOpenCustomer(id);
          }}
        />
      )}

      {selectedJobId && (
        <JobDetailModal
          isOpen={!!selectedJobId}
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onChanged={load}
          onOpenSeries={
            onOpenSeries && canEdit
              ? (seriesId) => {
                  setSelectedJobId(null);
                  onOpenSeries(seriesId);
                }
              : undefined
          }
        />
      )}
    </>
  );
};
