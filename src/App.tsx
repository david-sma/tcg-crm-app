import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { LoginForm } from './components/auth/LoginForm.tsx';
import { Header } from './components/common/Header.tsx';
import { InstallPwaPrompt } from './components/common/InstallPwaPrompt.tsx';

// Staff Views
import { StaffDashboard } from './components/staff/StaffDashboard.tsx';
import { StaffAvailability } from './components/staff/StaffAvailability.tsx';
import { StaffRosterView } from './components/staff/StaffRosterView.tsx';

// Manager Views
import { ManagerDashboard } from './components/manager/ManagerDashboard.tsx';
import { ManagerRosterBuilder } from './components/manager/ManagerRosterBuilder.tsx';
import { ManagerAvailabilityOverview } from './components/manager/ManagerAvailabilityOverview.tsx';
import { StaffManagement } from './components/manager/StaffManagement.tsx';
import { ManagerResponseTracker } from './components/manager/ManagerResponseTracker.tsx';
import { ManagerAuditLog } from './components/manager/ManagerAuditLog.tsx';

import {
  LayoutDashboard,
  Calendar,
  Clock,
  Users,
  CheckSquare,
  ShieldAlert,
  Menu,
} from 'lucide-react';

function MainLayout() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Reset tab to dashboard whenever user or user role changes
  useEffect(() => {
    if (user?.id) {
      setActiveTab('dashboard');
    }
  }, [user?.id, user?.role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 border-3 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-600">Loading The Cleaning Guys Portal...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const isManager = user.role === 'manager';

  const managerNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'roster-builder', label: 'Roster Builder', icon: Calendar },
    { id: 'availability', label: 'Availability', icon: Clock },
    { id: 'staff', label: 'Staff Directory', icon: Users },
    { id: 'responses', label: 'Responses', icon: CheckSquare },
    { id: 'audit', label: 'Audit Log', icon: ShieldAlert },
  ];

  const staffNavItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'availability', label: 'My Availability', icon: Clock },
    { id: 'roster', label: 'My Roster', icon: Calendar },
  ];

  const navItems = isManager ? managerNavItems : staffNavItems;
  const validTabIds = navItems.map((n) => n.id);

  // Guarantee a valid active tab; always default to dashboard if invalid/empty
  const currentTab = validTabIds.includes(activeTab) ? activeTab : 'dashboard';

  const renderContent = () => {
    if (isManager) {
      switch (currentTab) {
        case 'roster-builder':
          return <ManagerRosterBuilder />;
        case 'availability':
          return <ManagerAvailabilityOverview />;
        case 'staff':
          return <StaffManagement />;
        case 'responses':
          return <ManagerResponseTracker />;
        case 'audit':
          return <ManagerAuditLog />;
        case 'dashboard':
        default:
          return <ManagerDashboard onNavigate={setActiveTab} />;
      }
    } else {
      switch (currentTab) {
        case 'availability':
          return <StaffAvailability />;
        case 'roster':
          return <StaffRosterView />;
        case 'dashboard':
        default:
          return <StaffDashboard onNavigate={setActiveTab as any} />;
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-slate-900 selection:text-white">
      <Header onLogoClick={() => setActiveTab('dashboard')} />

      {/* Secondary Desktop & Tablet Tab Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-30 hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`desktop-tab-${item.id}`}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'border-[#5371FF] text-[#5371FF] bg-[#5371FF]/5'
                    : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#5371FF]' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-24 sm:pb-8">
        <InstallPwaPrompt />
        {renderContent()}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav id="mobile-bottom-nav" className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2.5 flex items-center justify-around shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              id={`mobile-nav-${item.id}`}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-label={item.label}
              title={item.label}
              className={`flex items-center justify-center p-2 rounded-xl text-center transition-all cursor-pointer ${
                isActive ? 'text-[#5371FF] bg-[#5371FF]/10' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5] text-[#5371FF]' : 'stroke-[1.75]'}`} />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <MainLayout />
      </NotificationProvider>
    </AuthProvider>
  );
}
