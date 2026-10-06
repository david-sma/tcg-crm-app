import React from 'react';
import { CRMModule } from '../../config/modules';
import { Sparkles, ArrowLeft, CheckCircle, ShieldCheck, Clock, Layers } from 'lucide-react';

interface ModuleRoadmapViewProps {
  module: CRMModule;
  onReturnToStaffOps: () => void;
}

export const ModuleRoadmapView: React.FC<ModuleRoadmapViewProps> = ({
  module,
  onReturnToStaffOps,
}) => {
  const Icon = module.icon;

  const featuresByModule: Record<string, string[]> = {
    'jobs-dispatches': [
      'Client job booking & service dispatch calendar',
      'Site opening & closing photo audit check-ins',
      'Before & after deep-cleaning verification logs',
      'Job task checklist (carpets, windows, sanitization)',
      'Client feedback and completion sign-off',
    ],
    'clients-sites': [
      'Client database with commercial & residential tags',
      'Premise access codes, alarm pins & key safe locations',
      'Special site instructions and safety hazards',
      'Invoice history and rate card attachments',
    ],
    'fleet-vehicles': [
      'Company van assignments & key management',
      'Weekly vehicle inspection & damage photo logs',
      'Odometer, fuel receipt and WoF / Rego expiry alerts',
      'Equipment loadouts assigned to each vehicle',
    ],
    'inventory-supplies': [
      'Chemical & consumable stock level tracking',
      'Depot restock requests and low-supply warnings',
      'Equipment serial numbers & maintenance schedule',
      'Uniform and safety gear distribution log',
    ],
    settings: [
      'Company branch profiles & timezone defaults',
      'Manager & supervisor permissions hierarchy',
      'Automated SMS & Web push notification triggers',
      'Export timesheets & payroll audit reports',
    ],
  };

  const featureList = featuresByModule[module.id] || [
    'Integrated with Staff Operations and Rostering',
    'Real-time status updates and photo evidence',
    'Role-based access control and audit tracking',
  ];

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 text-center space-y-6">
      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 shadow-sm">
        <Icon className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Planned CRM Module</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{module.name}</h1>
        <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
          {module.description}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-left max-w-xl mx-auto space-y-4">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-blue-600" />
          Planned Architecture & Capabilities
        </h2>
        <div className="space-y-2.5">
          {featureList.map((feat, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{feat}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={onReturnToStaffOps}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Staff Operations Module</span>
        </button>
      </div>
    </div>
  );
};
