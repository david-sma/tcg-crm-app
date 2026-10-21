import React, { useState } from 'react';
import { JobsBoardView } from './JobsBoardView.tsx';
import { JobsCalendarView } from './JobsCalendarView.tsx';
import { JobDetailModal } from './JobDetailModal.tsx';
import { Briefcase } from 'lucide-react';

export type JobsTab = 'board' | 'calendar';

interface JobsModuleProps {
  activeTab: JobsTab;
  onNavigate?: (tab: string) => void;
}

export const JobsModule: React.FC<JobsModuleProps> = ({ activeTab }) => {
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
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Jobs</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Job orders, scheduling, crew allocation and photo evidence in one place.
          </p>
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
