import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { getOffsetMonday, formatWeekRange, getCurrentMonday } from '../../lib/dateUtils.ts';

interface WeekNavigatorProps {
  currentWeek: string; // YYYY-MM-DD (Monday)
  onWeekChange: (newWeek: string) => void;
}

export const WeekNavigator: React.FC<WeekNavigatorProps> = ({ currentWeek, onWeekChange }) => {
  const currentActualMonday = getCurrentMonday();
  const isThisWeek = currentWeek === currentActualMonday;

  const handlePrev = () => {
    onWeekChange(getOffsetMonday(currentWeek, -1));
  };

  const handleNext = () => {
    onWeekChange(getOffsetMonday(currentWeek, 1));
  };

  const handleResetToCurrent = () => {
    onWeekChange(currentActualMonday);
  };

  return (
    <div id="week-navigator-container" className="flex items-center justify-between gap-2 p-2 bg-white rounded-2xl border border-slate-200 shadow-xs">
      <button
        id="prev-week-btn"
        type="button"
        onClick={handlePrev}
        className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
        aria-label="Previous week"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2 text-center min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar className="w-4 h-4 text-slate-500 shrink-0 hidden sm:inline" />
          <span className="text-sm font-semibold text-slate-900 truncate">
            {formatWeekRange(currentWeek)}
          </span>
        </div>

        {!isThisWeek && (
          <button
            id="jump-to-this-week-btn"
            type="button"
            onClick={handleResetToCurrent}
            className="px-2 py-0.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors shrink-0"
          >
            This Week
          </button>
        )}
      </div>

      <button
        id="next-week-btn"
        type="button"
        onClick={handleNext}
        className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
        aria-label="Next week"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};
