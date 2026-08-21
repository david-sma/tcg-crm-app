import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { formatDateTimeToNZ } from '../../lib/dateUtils.ts';
import type { AuditEvent } from '../../types/index.ts';
import { ShieldCheck, Clock, User, FileText, Search, RefreshCw } from 'lucide-react';

export const ManagerAuditLog: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ audit_events: AuditEvent[] }>('/api/audit');
      setEvents(data.audit_events || []);
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const filteredEvents = events.filter((e) => {
    const query = (search || '').toLowerCase().trim();
    if (!query) return true;
    const actionStr = (e?.action || '').toLowerCase();
    const actorStr = (e?.actor_name || '').toLowerCase();
    const entityStr = (e?.entity_type || '').toLowerCase();
    const metaStr = e?.metadata ? JSON.stringify(e.metadata).toLowerCase() : '';
    return (
      actionStr.includes(query) ||
      actorStr.includes(query) ||
      entityStr.includes(query) ||
      metaStr.includes(query)
    );
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">System Audit Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Immutable chronological record of administrative actions, roster publications, and availability updates.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAuditLogs}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Log</span>
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Filter audit logs by action, manager, or entity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900 shadow-xs"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm animate-pulse">Loading audit history...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No audit events match your query.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEvents.map((evt) => (
              <div key={evt.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-900 text-white">
                      {evt.action}
                    </span>
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      {evt.entity_type}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 flex items-center gap-2 pt-1">
                    <span className="font-semibold text-slate-900">Actor:</span>
                    <span>{evt.actor_name || 'System'}</span>
                    {evt.ip_address && <span className="text-slate-400">({evt.ip_address})</span>}
                  </div>

                  {evt.metadata && (
                    <pre className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-mono text-slate-700 overflow-x-auto max-w-2xl">
                      {JSON.stringify(evt.metadata, null, 2)}
                    </pre>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 font-mono shrink-0">
                  {formatDateTimeToNZ(evt.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
