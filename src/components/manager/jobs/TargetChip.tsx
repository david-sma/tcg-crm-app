import React from 'react';
import type { Job } from '../../../types/index.ts';
import {
  INTAKE_TARGET_HARD_HOURS,
  INTAKE_TARGET_SOFT_HOURS,
} from '../../../config/jobs.ts';
import { Clock } from 'lucide-react';

type TargetState = 'ok' | 'soft' | 'hard';

/** Age chip for a workflow target: elapsed time + amber at soft, red at hard. */
export const TargetChip: React.FC<{
  sinceIso: string | null | undefined;
  softHours: number;
  hardHours: number;
  label?: string;
}> = ({ sinceIso, softHours, hardHours, label }) => {
  if (!sinceIso) return null;
  const started = Date.parse(sinceIso);
  if (Number.isNaN(started)) return null;
  const elapsedHours = (Date.now() - started) / 36e5;
  const totalMinutes = Math.max(0, Math.floor((Date.now() - started) / 6e4));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const state: TargetState = elapsedHours >= hardHours ? 'hard' : elapsedHours >= softHours ? 'soft' : 'ok';
  const tone =
    state === 'hard'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : state === 'soft'
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span
      title={
        label
          ? `${label} target: ${softHours}h soft / ${hardHours}h`
          : `Target: ${softHours}h soft / ${hardHours}h`
      }
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${tone}`}
    >
      <Clock className="w-3 h-3" />
      {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
    </span>
  );
};

/** Intake aging chip (customer service target: 2h soft / 4h hard from first contact). */
export const IntakeTargetChip: React.FC<{ job: Job }> = ({ job }) => (
  <TargetChip
    sinceIso={job.created_at}
    softHours={INTAKE_TARGET_SOFT_HOURS}
    hardHours={INTAKE_TARGET_HARD_HOURS}
    label="Intake"
  />
);
