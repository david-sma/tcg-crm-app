import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api.ts';
import { WeekNavigator } from '../common/WeekNavigator.tsx';
import { getCurrentMonday, getDefaultActiveMonday, formatDateTimeLocal, formatTimeLocal, calculateShiftDuration, DAY_NAMES } from '../../lib/dateUtils.ts';
import type { StaffRosterResponse } from '../../types/index.ts';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  RefreshCw,
  Phone,
  MessageSquare,
  ShieldCheck,
  Calendar,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';

export const ManagerResponseTracker: React.FC = () => {
  const [selectedWeek, setSelectedWeek] = useState(getDefaultActiveMonday());
  const [trackerData, setTrackerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'acknowledged' | 'conflict'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());

  const toggleExpand = (userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const loadResponses = useCallback(async (week: string, isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const data = await apiFetch(`/api/rosters/responses?week=${week}`);
      setTrackerData(data);
    } catch (err) {
      console.error('Failed to load roster responses:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadResponses(selectedWeek);
  }, [selectedWeek, loadResponses]);

  const isPublished = Boolean(trackerData?.is_published || trackerData?.published);
  const responses: (StaffRosterResponse & { shifts?: any[] })[] = trackerData?.responses || [];

  const filteredResponses = responses.filter((r) => {
    const matchesStatus = statusFilter === 'all' ? true : r.response_status === statusFilter;
    const q = (searchQuery || '').toLowerCase().trim();
    const nameStr = (r?.user_name || '').toLowerCase();
    const phoneStr = (r?.user_phone || '').toLowerCase();
    const reasonStr = (r?.response_reason || r?.conflict_reason || '').toLowerCase();
    const noteStr = (r?.response_note || r?.conflict_note || '').toLowerCase();
    const matchesSearch =
      !q || nameStr.includes(q) || phoneStr.includes(q) || reasonStr.includes(q) || noteStr.includes(q);
    return matchesStatus && matchesSearch;
  });

  const summary = trackerData?.summary || {
    total: responses.length,
    acknowledged: responses.filter((r) => r.response_status === 'acknowledged').length,
    pending: responses.filter((r) => r.response_status === 'pending').length,
    conflict: responses.filter((r) => r.response_status === 'conflict').length,
  };

  return (
    <div id="responses-tracker-view" className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Staff Roster Responses</h1>
            {isPublished && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                Live v{trackerData?.version_number || 1}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor worker acknowledgements, track per-shift confirmations, and resolve conflict reports.
          </p>
        </div>

        <button
          id="refresh-responses-btn"
          type="button"
          onClick={() => loadResponses(selectedWeek, true)}
          disabled={loading || refreshing}
          className="self-start sm:self-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Statuses'}</span>
        </button>
      </div>

      <WeekNavigator currentWeek={selectedWeek} onWeekChange={setSelectedWeek} />

      {!isPublished ? (
        <div id="responses-uncommitted-banner" className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">Roster Not Yet Published</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            The draft roster for the week of <strong className="text-slate-700">{selectedWeek}</strong> has not been published yet. Once you publish it in the Roster Builder, team acknowledgements and conflict reports will automatically sync and appear here.
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Active Team</span>
                <Calendar className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">{summary.total} staff</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Assigned or notified</div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Acknowledged</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-600 mt-2">{summary.acknowledged}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {summary.total > 0 ? Math.round((summary.acknowledged / summary.total) * 100) : 0}% of team confirmed
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Pending</span>
                <HelpCircle className="w-4 h-4 text-blue-500" />
              </div>
              <div className={`text-2xl font-bold mt-2 ${summary.pending > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                {summary.pending}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Awaiting staff response</div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Conflicts</span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className={`text-2xl font-bold mt-2 ${summary.conflict > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                {summary.conflict}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Requires manager action</div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="search-responses-input"
                type="text"
                placeholder="Search by name, phone, or conflict reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto shrink-0 overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({responses.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('acknowledged')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === 'acknowledged' ? 'bg-white text-emerald-700 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Acknowledged ({summary.acknowledged})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === 'pending' ? 'bg-white text-blue-700 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pending ({summary.pending})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('conflict')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === 'conflict' ? 'bg-white text-amber-700 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Conflict ({summary.conflict})
              </button>
            </div>
          </div>

          {/* Response Cards List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 text-sm animate-pulse">Loading roster responses...</div>
            ) : filteredResponses.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                No staff found matching current search or status filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredResponses.map((res) => {
                  const shiftCount = res.shift_count ?? res.shifts_count ?? 0;
                  const reason = res.response_reason || res.conflict_reason;
                  const note = res.response_note || res.conflict_note;
                  const userShifts = res.shifts || [];
                  const isExpanded = expandedUserIds.has(res.user_id);
                  const confirmedShiftsCount = userShifts.filter((s: any) => s.response_status === 'acknowledged').length;

                  return (
                    <div
                      key={res.user_id}
                      className={`p-4 sm:p-5 transition-colors ${
                        res.response_status === 'conflict' ? 'bg-amber-50/40' : 'hover:bg-slate-50/40'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-xs ${
                              res.response_status === 'acknowledged'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : res.response_status === 'conflict'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {res.user_name.charAt(0).toUpperCase()}
                          </div>

                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-slate-900 text-base leading-tight">{res.user_name}</h3>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border ${
                                  res.response_status === 'acknowledged'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : res.response_status === 'conflict'
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : confirmedShiftsCount > 0
                                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {res.response_status === 'conflict'
                                  ? 'Conflict Reported'
                                  : res.response_status === 'acknowledged'
                                  ? 'Acknowledged'
                                  : confirmedShiftsCount > 0
                                  ? `${confirmedShiftsCount}/${shiftCount} Confirmed`
                                  : 'Pending Response'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500">
                              <a
                                href={`tel:${res.user_phone}`}
                                className="font-mono text-slate-600 hover:text-slate-900 hover:underline flex items-center gap-1"
                              >
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{res.user_phone}</span>
                              </a>
                              <span>•</span>
                              <span className="font-medium text-slate-700">
                                {shiftCount} shift{shiftCount !== 1 ? 's' : ''} assigned
                              </span>
                              {res.responded_at && (
                                <>
                                  <span>•</span>
                                  <span>Responded {formatDateTimeLocal(res.responded_at)}</span>
                                </>
                              )}
                            </div>

                            {res.response_status === 'conflict' && (
                              <div className="mt-2.5 p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 space-y-1 max-w-xl">
                                <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                  <span>Reported Conflict: {reason || 'Unspecified conflict reason'}</span>
                                </div>
                                {note && (
                                  <div className="text-amber-800 pl-5.5 italic bg-amber-100/50 p-2 rounded-lg mt-1 border border-amber-200/60">
                                    "{note}"
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {userShifts.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(res.user_id)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              <span>{isExpanded ? 'Hide Shifts' : `View ${userShifts.length} Shifts`}</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          <a
                            href={`tel:${res.user_phone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs"
                            title={`Call ${res.user_name}`}
                          >
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            <span className="hidden sm:inline">Call</span>
                          </a>
                        </div>
                      </div>

                      {/* Granular Shift breakdown accordion */}
                      {isExpanded && userShifts.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-2">
                          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                            Individual Shift Confirmations
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {userShifts.map((s: any) => {
                              const dayName = DAY_NAMES[s.start_day_of_week] || `Day ${s.start_day_of_week}`;
                              const shiftStatus = s.response_status || 'pending';
                              return (
                                <div
                                  key={s.id}
                                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                                    shiftStatus === 'acknowledged'
                                      ? 'bg-emerald-50/70 border-emerald-200'
                                      : shiftStatus === 'conflict'
                                      ? 'bg-amber-50 border-amber-300'
                                      : 'bg-white border-slate-200'
                                  }`}
                                >
                                  <div>
                                    <div className="font-semibold text-slate-900">
                                      {dayName}: {formatTimeLocal(s.start_datetime)} – {formatTimeLocal(s.finish_datetime)}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {calculateShiftDuration(s.start_datetime, s.finish_datetime)}
                                      {s.label ? ` • ${s.label}` : ''}
                                    </div>
                                    {shiftStatus === 'conflict' && s.response_reason && (
                                      <div className="text-[11px] text-amber-900 font-medium mt-1">
                                        Conflict: {s.response_reason}
                                      </div>
                                    )}
                                  </div>

                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${
                                      shiftStatus === 'acknowledged'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : shiftStatus === 'conflict'
                                        ? 'bg-amber-100 text-amber-900'
                                        : 'bg-blue-50 text-blue-800'
                                    }`}
                                  >
                                    {shiftStatus === 'acknowledged'
                                      ? 'Confirmed'
                                      : shiftStatus === 'conflict'
                                      ? 'Conflict'
                                      : 'Pending'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
