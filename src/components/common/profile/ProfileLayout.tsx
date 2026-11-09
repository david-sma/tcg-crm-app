import React from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * Shared building blocks for entity profiles (Customers now; Staff and Fleet
 * later), so every profile has the same header, summary tiles and sections.
 */

export const ProfileHeader: React.FC<{
  onBack?: () => void;
  backLabel?: string;
  initials: string;
  title: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ onBack, backLabel = 'Back', initials, title, subtitle, badges, actions }) => (
  <div className="space-y-3">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {backLabel}
      </button>
    )}
    <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight break-words">{title}</h1>
            {badges}
          </div>
          {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </div>
);

export const StatTile: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({
  label,
  value,
  hint,
}) => (
  <div className="p-3.5 bg-white rounded-2xl border border-slate-200 min-w-0">
    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
    <div className="text-lg sm:text-xl font-bold text-slate-900 mt-1 truncate">{value}</div>
    {hint && <div className="text-[11px] text-slate-500 mt-0.5 truncate">{hint}</div>}
  </div>
);

export const StatGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
);

export const ProfileSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, actions, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200">
    <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{title}</h2>
      </div>
      {actions}
    </div>
    <div className="px-4 pb-4">{children}</div>
  </section>
);

/** Two initials from a display name ("Harbour View Ltd" → "HV"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '';
  return (first + second).toUpperCase();
}
