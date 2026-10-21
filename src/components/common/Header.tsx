import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { Bell, LogOut, ChevronDown, Layers, Check } from 'lucide-react';
import { NotificationDrawer } from './NotificationDrawer.tsx';
import { CompanyLogo } from './CompanyLogo.tsx';
import { useBrand } from '../../context/BrandContext.tsx';
import { CRM_MODULES, CRMModule } from '../../config/modules';
import { ROLE_LABELS } from '../../config/roles';

interface HeaderProps {
  onLogoClick?: () => void;
  onNavigate?: (tab: string) => void;
  activeModuleId?: string;
  onSelectModule?: (moduleId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onLogoClick,
  onNavigate,
  activeModuleId = 'staff-ops',
  onSelectModule,
}) => {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { companyName, city } = useBrand();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false);

  if (!user) return null;

  const isOfficeRole = user.role === 'manager' || user.role === 'customer_service' || user.role === 'service_team';
  const currentModule = CRM_MODULES.find((m) => m.id === activeModuleId) || CRM_MODULES[0];

  return (
    <>
      <header
        id="main-app-header"
        className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <button
              type="button"
              onClick={onLogoClick}
              className="flex items-center gap-3 text-left group hover:opacity-90 transition-opacity cursor-pointer"
              title="Go to Dashboard"
            >
              <div className="p-1 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs group-hover:scale-105 transition-transform flex items-center justify-center">
                <CompanyLogo size={34} />
              </div>
              <div className="hidden sm:block">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-base leading-tight tracking-tight">
                    {companyName}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                      user.role === 'manager'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-[var(--color-brand-accent)]/15 text-emerald-800 border border-[var(--color-brand-accent)]/30'
                    }`}
                  >
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block leading-tight">
                  {city} Operations
                </span>
              </div>
            </button>

            {/* CRM Module Switcher (Office roles) */}
            {isOfficeRole && (
              <div className="relative pl-3 ml-2 border-l border-slate-200 hidden md:block">
                <button
                  type="button"
                  onClick={() => setModuleMenuOpen(!moduleMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>Module: {currentModule.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {/* Dropdown Menu */}
                {moduleMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setModuleMenuOpen(false)}
                    />
                    <div className="absolute left-3 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        CRM Operations Modules
                      </div>
                      {CRM_MODULES.map((mod) => {
                        const Icon = mod.icon;
                        const isSelected = mod.id === activeModuleId;
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => {
                              onSelectModule?.(mod.id);
                              setModuleMenuOpen(false);
                            }}
                            className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 transition-colors ${
                              isSelected ? 'bg-blue-50/60' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`p-1.5 rounded-lg ${
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{mod.name}</span>
                                  {mod.badge && (
                                    <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-semibold">
                                      {mod.badge}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 line-clamp-1">
                                  {mod.shortName}
                                </div>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

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

      <NotificationDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={onNavigate}
      />
    </>
  );
};
