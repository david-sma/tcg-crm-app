import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  CheckCircle,
  AlertCircle,
  X,
  MapPin,
  Building,
  Briefcase,
  Coffee,
  Users,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { getNowInAuckland } from '../../lib/dateUtils';
import { ClockOutType, ShiftReport } from '../../types';

interface ClockOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClockOut: (data: {
    photo: string | null;
    type: ClockOutType;
    location: string;
    break_minutes: number;
    worked_with: string[];
    notes: string;
  }) => Promise<void>;
  activeReport: ShiftReport | null;
  suggestedCoworkers?: string[];
  allStaffNames?: string[];
}

const BREAK_OPTIONS = [
  { value: 0, label: 'No Break' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min (Standard)' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min (1 hr)' },
];

export const ClockOutModal: React.FC<ClockOutModalProps> = ({
  isOpen,
  onClose,
  onClockOut,
  activeReport,
  suggestedCoworkers = [],
  allStaffNames = [],
}) => {
  const [clockOutType, setClockOutType] = useState<ClockOutType>('closing_shift');
  const [locationName, setLocationName] = useState('');
  const [breakMinutes, setBreakMinutes] = useState<number>(30);
  const [selectedCoworkers, setSelectedCoworkers] = useState<string[]>([]);
  const [customCoworker, setCustomCoworker] = useState('');
  const [notes, setNotes] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected coworkers with suggested ones from roster
  useEffect(() => {
    if (suggestedCoworkers && suggestedCoworkers.length > 0) {
      setSelectedCoworkers(suggestedCoworkers);
    }
  }, [suggestedCoworkers]);

  if (!isOpen || !activeReport) return null;

  const { hour, minute } = getNowInAuckland();
  const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const clockInTime = new Date(activeReport.clock_in_at);
  const clockInFormatted = clockInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Calculate approximate duration
  const nowMs = Date.now();
  const startMs = clockInTime.getTime();
  const grossMinutes = Math.max(0, Math.round((nowMs - startMs) / (1000 * 60)));
  const grossHours = (grossMinutes / 60).toFixed(1);
  const netMinutes = Math.max(0, grossMinutes - breakMinutes);
  const netHours = (netMinutes / 60).toFixed(1);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Photo is too large (maximum 5MB). Please choose a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const toggleCoworker = (name: string) => {
    setSelectedCoworkers((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const addCustomCoworker = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    if (customCoworker.trim() && !selectedCoworkers.includes(customCoworker.trim())) {
      setSelectedCoworkers((prev) => [...prev, customCoworker.trim()]);
      setCustomCoworker('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate closing photo proof
    if (!photoPreview) {
      setError('Closing photo proof is required to finish your shift. Please take a photo or upload an image (e.g. completed site, keys, or depot lockup).');
      return;
    }

    setIsSubmitting(true);

    try {
      const defaultLoc =
        clockOutType === 'closing_shift'
          ? 'Base / Closing Shift'
          : locationName.trim() || 'Last Job Site';

      await onClockOut({
        photo: photoPreview,
        type: clockOutType,
        location: defaultLoc,
        break_minutes: breakMinutes,
        worked_with: selectedCoworkers,
        notes: notes.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit shift report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-5 sm:p-6 text-white relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 rounded-xl backdrop-blur-xs">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Finish Shift / Clock Out</h2>
              <p className="text-sm text-blue-100">
                Log closing photo proof, breaks, and who you worked with
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Shift Duration Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-2 text-center divide-x divide-slate-200">
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Started
              </span>
              <span className="text-base font-bold text-slate-800">{clockInFormatted}</span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Finishing
              </span>
              <span className="text-base font-bold text-slate-800">{timeFormatted}</span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider block">
                Est. Net Hours
              </span>
              <span className="text-base font-black text-blue-700">{netHours} hrs</span>
            </div>
          </div>

          {/* Closing Type Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Where are you finishing?
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setClockOutType('closing_shift')}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center font-medium transition-all ${
                  clockOutType === 'closing_shift'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Building className={`w-5 h-5 ${clockOutType === 'closing_shift' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="text-sm font-semibold">Base Office / Depot</span>
                <span className="text-xs text-slate-500">Back at headquarters</span>
              </button>

              <button
                type="button"
                onClick={() => setClockOutType('last_job')}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center font-medium transition-all ${
                  clockOutType === 'last_job'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Briefcase className={`w-5 h-5 ${clockOutType === 'last_job' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="text-sm font-semibold">Last Job Site</span>
                <span className="text-xs text-slate-500">Finished at client site</span>
              </button>
            </div>
          </div>

          {clockOutType === 'last_job' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Last Job Site / Location (Optional)
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g. Albany Commercial / 45 Beach Rd"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Break Duration Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Coffee className="w-4 h-4 text-amber-600" />
                Break Duration Taken
              </label>
              <span className="text-xs text-slate-500">Deducted from shift total</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {BREAK_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBreakMinutes(opt.value)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                    breakMinutes === opt.value
                      ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Worked With (Coworkers) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              Worked With Today
            </label>

            {/* Quick Chips for active staff */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {allStaffNames.map((name) => {
                const isSelected = selectedCoworkers.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleCoworker(name)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {name}
                  </button>
                );
              })}
            </div>

            {/* Manual Entry */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customCoworker}
                onChange={(e) => setCustomCoworker(e.target.value)}
                onKeyDown={addCustomCoworker}
                placeholder="Or type coworker name & enter..."
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addCustomCoworker}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Add
              </button>
            </div>

            {selectedCoworkers.length > 0 && (
              <div className="mt-2 text-xs text-slate-500">
                Logged with:{' '}
                <span className="font-semibold text-slate-800">
                  {selectedCoworkers.join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* Photo Proof for Clock Out */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-blue-600" />
                Closing Photo Proof
              </label>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300/60 rounded-md uppercase tracking-wider">
                Photo Required
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 group">
                <img
                  src={photoPreview}
                  alt="Clock out proof"
                  className="w-full h-44 object-cover"
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100 shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" /> Retake Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(null)}
                    className="px-3.5 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 bg-blue-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Closing Photo Attached
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer text-center ${
                  error && !photoPreview
                    ? 'border-rose-400 bg-rose-50/50 hover:bg-rose-50'
                    : 'border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30'
                }`}
              >
                <div className={`p-2.5 rounded-full shadow-xs border ${
                  error && !photoPreview
                    ? 'bg-rose-100 border-rose-300 text-rose-600'
                    : 'bg-white border-slate-200 text-blue-600'
                }`}>
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <span className={`text-sm font-bold block ${error && !photoPreview ? 'text-rose-900' : 'text-slate-800'}`}>
                    Take Closing Photo or Upload *
                  </span>
                  <span className="text-xs text-slate-500">
                    Snap last job completed, vehicle keys, or depot lockup
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes for Manager */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              Notes / Comments for Manager (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Extra deep clean requested on 2nd floor, van 4 refueled..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-md hover:shadow-blue-600/20 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Submit Shift Report</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
