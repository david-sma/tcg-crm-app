import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal, X } from 'lucide-react';

export interface MobileNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface MobileBottomNavProps {
  items: MobileNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Tabs kept in the bar when there are too many; the rest go under "More". */
  primaryIds?: string[];
}

/** The bar holds at most this many buttons (including "More"). */
const MAX_BUTTONS = 5;
const MAX_PRIMARY = MAX_BUTTONS - 1;

/**
 * Phone bottom navigation. Up to 5 tabs show directly; with more (the manager
 * has 7) the bar shows 4 tabs plus "More", which opens a sheet with the rest,
 * so every tab (e.g. Audit Log) stays reachable without overflowing the screen.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ items, activeId, onSelect, primaryIds }) => {
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [activeId]);

  const needsMore = items.length > MAX_BUTTONS;
  const preferred = (primaryIds ?? []).filter((id) => items.some((item) => item.id === id));
  const primary = needsMore
    ? [
        ...items.filter((item) => preferred.includes(item.id)),
        ...items.filter((item) => !preferred.includes(item.id)),
      ].slice(0, MAX_PRIMARY)
    : items;
  // Keep the bar in the original tab order.
  const primaryInOrder = items.filter((item) => primary.includes(item));
  const overflow = needsMore ? items.filter((item) => !primary.includes(item)) : [];
  const overflowActive = overflow.some((item) => item.id === activeId);

  const buttonClass = (active: boolean) =>
    `flex flex-col items-center justify-center p-1.5 rounded-xl text-center transition-all cursor-pointer min-w-0 flex-1 ${
      active ? 'text-blue-600 bg-blue-50/80 font-bold' : 'text-slate-400 hover:text-slate-600'
    }`;

  return (
    <>
      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)} aria-hidden="true" />
      )}
      {moreOpen && (
        <div
          id="mobile-nav-more-sheet"
          role="menu"
          className="sm:hidden fixed left-3 right-3 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-2 mobile-more-sheet"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">More</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setMoreOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {overflow.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                id={`mobile-nav-${item.id}`}
                type="button"
                role="menuitem"
                onClick={() => onSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer ${
                  active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      <nav
        id="mobile-bottom-nav"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 pt-2 safe-bottom-nav flex items-center justify-around gap-1 shadow-lg"
      >
        {primaryInOrder.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              id={`mobile-nav-${item.id}`}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-label={item.label}
              title={item.label}
              className={buttonClass(isActive)}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5] text-blue-600' : 'stroke-[1.75]'}`} />
              <span className="text-[10px] mt-0.5 max-w-full truncate">{item.label}</span>
            </button>
          );
        })}
        {needsMore && (
          <button
            id="mobile-nav-more"
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-label="More"
            aria-expanded={moreOpen}
            className={buttonClass(overflowActive || moreOpen)}
          >
            <MoreHorizontal className={`w-5 h-5 ${overflowActive ? 'stroke-[2.5] text-blue-600' : 'stroke-[1.75]'}`} />
            <span className="text-[10px] mt-0.5 max-w-full truncate">More</span>
          </button>
        )}
      </nav>
    </>
  );
};
