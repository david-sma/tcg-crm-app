import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { NotificationProvider } from './context/NotificationContext.tsx';
import { useBrand } from './context/BrandContext.tsx';
import { LoginForm } from './components/auth/LoginForm.tsx';
import { Header } from './components/common/Header.tsx';
import { InstallPwaPrompt } from './components/common/InstallPwaPrompt.tsx';
import { CRM_MODULES } from './config/modules.ts';
import { ModuleRoadmapView } from './components/common/ModuleRoadmapModal.tsx';

// Staff Views
import { StaffDashboard } from './components/staff/StaffDashboard.tsx';
import { StaffAvailability } from './components/staff/StaffAvailability.tsx';
import { StaffRosterView } from './components/staff/StaffRosterView.tsx';
import { StaffTimesheetView } from './components/staff/StaffTimesheetView.tsx';
import { MyJobsView } from './components/staff/MyJobsView.tsx';

// Manager Views
import { ManagerDashboard } from './components/manager/ManagerDashboard.tsx';
import { ManagerTimesheetOverview } from './components/manager/ManagerTimesheetOverview.tsx';
import { ManagerRosterBuilder } from './components/manager/ManagerRosterBuilder.tsx';
import { ManagerAvailabilityOverview } from './components/manager/ManagerAvailabilityOverview.tsx';
import { StaffManagement } from './components/manager/StaffManagement.tsx';
import { ManagerResponseTracker } from './components/manager/ManagerResponseTracker.tsx';
import { ManagerAuditLog } from './components/manager/ManagerAuditLog.tsx';
import { JobsModule } from './components/manager/jobs/JobsModule.tsx';

import {
  LayoutDashboard,
  Calendar,
  Clock,
  Users,
  CheckSquare,
  ShieldAlert,
  ClipboardList,
  FileCheck,
  Briefcase,
  LayoutGrid,
  CalendarDays,
} from 'lucide-react';

function MainLayout() {
  const { user, loading } = useAuth();
  const { companyName } = useBrand();
  const [activeModuleId, setActiveModuleId] = useState<string>('staff-ops');
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Reset tab to dashboard whenever user or user role changes
  useEffect(() => {
    if (user?.id) {
      setActiveTab('dashboard');
      setActiveModuleId('staff-ops');
    }
  }, [user?.id, user?.role]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-600">
            Loading {companyName} Portal...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const isManager = user.role === 'manager';
  const isTeamLead = user.role === 'team_leader';

  const managerNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'timesheets', label: 'Timesheet', icon: ClipboardList },
    { id: 'roster-builder', label: 'Roster', icon: Calendar },
    { id: 'availability', label: 'Availability', icon: Clock },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'responses', label: 'Responses', icon: CheckSquare },
    { id: 'audit', label: 'Audit Log', icon: ShieldAlert },
  ];

  const staffNavItems = [
    { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
    { id: 'my-jobs', label: 'Jobs', icon: Briefcase },
    { id: 'my-timesheet', label: 'Timesheet', icon: FileCheck },
    { id: 'roster', label: 'Roster', icon: Calendar },
    { id: 'availability', label: 'Availability', icon: Clock },
  ];

  const teamLeaderNavItems = [
    { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
    { id: 'my-jobs', label: 'Jobs', icon: Briefcase },
    { id: 'my-timesheet', label: 'Timesheet', icon: FileCheck },
    { id: 'roster', label: 'Roster', icon: Calendar },
    { id: 'availability', label: 'Availability', icon: Clock },
  ];

  const jobsNavItems = [
    { id: 'jobs-board', label: 'Jobs Board', icon: LayoutGrid },
    { id: 'jobs-calendar', label: 'Calendar', icon: CalendarDays },
  ];

  const navItems = isManager ? managerNavItems : isTeamLead ? teamLeaderNavItems : staffNavItems;
  const barNavItems = activeModuleId === 'jobs-dispatches' ? jobsNavItems : navItems;
  const validTabIds = barNavItems.map((n) => n.id);

  // Guarantee a valid active tab for the current module
  const defaultTab = activeModuleId === 'jobs-dispatches' ? 'jobs-board' : 'dashboard';
  const currentTab = validTabIds.includes(activeTab) ? activeTab : defaultTab;

  const handleSelectModule = (moduleId: string) => {
    setActiveModuleId(moduleId);
    if (moduleId === 'staff-ops') {
      setActiveTab('dashboard');
    } else if (moduleId === 'jobs-dispatches') {
      setActiveTab('jobs-board');
    }
  };

  const handleNavigateToTab = (tab: string) => {
    if (tab === 'jobs-dispatches') {
      setActiveModuleId('jobs-dispatches');
      return;
    }
    setActiveModuleId('staff-ops');
    setActiveTab(tab);
  };

  const currentModule = CRM_MODULES.find((m) => m.id === activeModuleId) || CRM_MODULES[0];

  const renderContent = () => {
    if (activeModuleId === 'jobs-dispatches' && isManager) {
      return (
        <JobsModule
          activeTab={currentTab === 'jobs-calendar' ? 'calendar' : 'board'}
          onNavigate={handleNavigateToTab}
        />
      );
    }

    // If user is visiting an upcoming CRM module
    if (activeModuleId !== 'staff-ops' && isManager) {
      return (
        <ModuleRoadmapView
          module={currentModule}
          onReturnToStaffOps={() => setActiveModuleId('staff-ops')}
        />
      );
    }

    if (isManager) {
      switch (currentTab) {
        case 'timesheets':
          return <ManagerTimesheetOverview />;
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
        case 'my-jobs':
          return <MyJobsView onNavigate={setActiveTab as any} />;
        case 'my-timesheet':
          return <StaffTimesheetView onBackToDashboard={() => setActiveTab('dashboard')} />;
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
      <Header
        onLogoClick={() => {
          setActiveModuleId('staff-ops');
          setActiveTab('dashboard');
        }}
        onNavigate={(tab) => {
          handleNavigateToTab(tab);
        }}
        activeModuleId={activeModuleId}
        onSelectModule={handleSelectModule}
      />

      {/* Secondary Desktop & Tablet Tab Bar (module tabs share one seamless bar) */}
      {(activeModuleId === 'staff-ops' || activeModuleId === 'jobs-dispatches') && (
        <div className="bg-white border-b border-slate-200 sticky top-16 z-30 hidden sm:block shadow-2xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto scrollbar-none">
            {barNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`desktop-tab-${item.id}`}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 py-3.5 px-4 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                      : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-24 sm:pb-8">
        <InstallPwaPrompt />
        {renderContent()}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      {(activeModuleId === 'staff-ops' || activeModuleId === 'jobs-dispatches') && (
        <nav
          id="mobile-bottom-nav"
          className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2 flex items-center justify-around shadow-lg"
        >
          {barNavItems.map((item) => {
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
                className={`flex flex-col items-center justify-center p-1.5 rounded-xl text-center transition-all cursor-pointer ${
                  isActive ? 'text-blue-600 bg-blue-50/80 font-bold' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5] text-blue-600' : 'stroke-[1.75]'}`} />
                <span className="text-[10px] mt-0.5 max-w-[65px] truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
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
