import React, { useState } from 'react';
import { JobsBoardView } from './JobsBoardView.tsx';
import { JobsCalendarView } from './JobsCalendarView.tsx';
import { JobDetailModal } from './JobDetailModal.tsx';
import { Briefcase, LayoutGrid, CalendarDays } from 'lucide-react';

interface JobsModuleProps {
  onNavigate?: (tab: string) => void;
}

const TABS = [
  { id: 'board', label: 'Board', icon: LayoutGrid },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
] as const;

export const JobsModule: React.FC<JobsModuleProps> = () => {
  const [activeTab, setActiveTab] = useState<'board' | 'calendar'>('board');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
              <Briefcase className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Jobs &amp; Dispatches</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Job orders, scheduling, crew dispatch and photo evidence in one place.
          </p>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 rounded-2xl shadow-2xs">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none px-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'board' ? (
        <JobsBoardView onOpenJob={(id) => setSelectedJobId(id)} refreshKey={refreshKey} />
      ) : (
        <JobsCalendarView onOpenJob={(id) => setSelectedJobId(id)} refreshKey={refreshKey} />
      )}

      {selectedJobId && (
        <JobDetailModal
          isOpen={!!selectedJobId}
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
};
