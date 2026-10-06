import React from 'react';
import {
  Users,
  Briefcase,
  Building2,
  Truck,
  Package,
  Settings,
  Calendar,
  Clock,
  ClipboardList,
  CheckSquare,
  ShieldAlert,
  LayoutDashboard,
  LucideIcon,
} from 'lucide-react';

export interface SubTab {
  id: string;
  label: string;
  icon: LucideIcon;
  minRole: 'staff' | 'manager';
}

export interface CRMModule {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  isUpcoming?: boolean;
  minRole: 'staff' | 'manager';
  subTabs: SubTab[];
}

export const CRM_MODULES: CRMModule[] = [
  {
    id: 'staff-ops',
    name: 'Staff Operations',
    shortName: 'Staff',
    description: 'Workforce scheduling, availability, shift reporting & timesheets',
    icon: Users,
    minRole: 'staff',
    subTabs: [
      // Manager Tabs
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, minRole: 'manager' },
      { id: 'timesheets', label: 'Timesheets & Duty', icon: ClipboardList, minRole: 'manager' },
      { id: 'roster-builder', label: 'Roster Builder', icon: Calendar, minRole: 'manager' },
      { id: 'availability', label: 'Availability', icon: Clock, minRole: 'manager' },
      { id: 'staff', label: 'Staff Directory', icon: Users, minRole: 'manager' },
      { id: 'responses', label: 'Responses', icon: CheckSquare, minRole: 'manager' },
      { id: 'audit', label: 'Audit Log', icon: ShieldAlert, minRole: 'manager' },

      // Staff Tabs
      { id: 'home', label: 'Today & Shift', icon: LayoutDashboard, minRole: 'staff' },
      { id: 'my-timesheet', label: 'My Timesheet', icon: ClipboardList, minRole: 'staff' },
      { id: 'roster', label: 'My Roster', icon: Calendar, minRole: 'staff' },
      { id: 'my-availability', label: 'My Availability', icon: Clock, minRole: 'staff' },
    ],
  },
  {
    id: 'jobs-dispatches',
    name: 'Jobs & Dispatches',
    shortName: 'Jobs',
    description: 'Job orders, crew scheduling, on-site photo audits and completion reports',
    icon: Briefcase,
    minRole: 'manager',
    subTabs: [],
  },
  {
    id: 'clients-sites',
    name: 'Clients & Locations',
    shortName: 'Clients',
    description: 'Client records, site access codes, keys, and special instructions',
    icon: Building2,
    badge: 'Roadmap',
    isUpcoming: true,
    minRole: 'manager',
    subTabs: [],
  },
  {
    id: 'fleet-vehicles',
    name: 'Fleet & Vehicles',
    shortName: 'Fleet',
    description: 'Van assignments, maintenance records, fuel & mileage logs',
    icon: Truck,
    badge: 'Roadmap',
    isUpcoming: true,
    minRole: 'manager',
    subTabs: [],
  },
  {
    id: 'inventory-supplies',
    name: 'Supplies & Inventory',
    shortName: 'Inventory',
    description: 'Chemical stocks, cleaning equipment, and restock tracking',
    icon: Package,
    badge: 'Roadmap',
    isUpcoming: true,
    minRole: 'manager',
    subTabs: [],
  },
  {
    id: 'settings',
    name: 'System Settings',
    shortName: 'Settings',
    description: 'Company profiles, role permissions, and notification rules',
    icon: Settings,
    badge: 'Roadmap',
    isUpcoming: true,
    minRole: 'manager',
    subTabs: [],
  },
];
