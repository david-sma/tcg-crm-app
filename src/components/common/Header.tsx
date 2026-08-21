import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { Bell, LogOut, Sparkles } from 'lucide-react';
import { NotificationDrawer } from './NotificationDrawer.tsx';
import { TCGLogo } from './TCGLogo.tsx';

interface HeaderProps {
  onLogoClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLogoClick }) => {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <header id="main-app-header" className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onLogoClick}
            className="flex items-center gap-3 text-left group hover:opacity-90 transition-opacity cursor-pointer"
            title="Go to Dashboard"
          >
            <div className="p-1 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs group-hover:scale-105 transition-transform flex items-center justify-center">
              <TCGLogo size={36} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-base leading-tight tracking-tight sm:hidden">
                  TCG
                </span>
                <span className="font-extrabold text-slate-900 text-base leading-tight tracking-tight hidden sm:inline">
                  The Cleaning Guys
                </span>
                <span
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-md uppercase tracking-wider ${
                    user.role === 'manager'
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : 'bg-[#7FD858]/15 text-emerald-800 border border-[#7FD858]/30 font-bold'
                  }`}
                >
                  {user.role}
                </span>
              </div>
              <span className="text-xs text-slate-500 hidden sm:inline-block">Auckland Operations & Rosters</span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <button
              id="header-notification-bell-btn"
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="relative p-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Open notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span
                  id="unread-badge-pill"
                  className="absolute top-1.5 right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-xs"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* User details */}
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200 text-right">
              <div>
                <p className="text-xs font-semibold text-slate-900 leading-tight">{user.name}</p>
                <p className="text-[11px] text-slate-500 font-mono">{user.phone_e164}</p>
              </div>
            </div>

            {/* Logout button */}
            <button
              id="header-logout-btn"
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <NotificationDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
};
