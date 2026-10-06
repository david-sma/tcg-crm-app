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
  Navigation,
  CheckSquare,
  Square,
  ArrowRightCircle,
  LogIn,
  LogOut,
  Upload,
} from 'lucide-react';
import { getNowInBusinessTz } from '../../lib/dateUtils';
import { ClockOutType, ShiftReport } from '../../types';
import { apiFetch } from '../../lib/api';
import { useBrand } from '../../context/BrandContext.tsx';

export interface ClockOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClockOut: (data: {
    photo: string | null;
    type: ClockOutType;
    location: string;
    break_minutes: number;
    travel_minutes: number;
    worked_with: string[];
    notes: string;
  }) => Promise<void>;
  onEventReport?: (data: {
    event_type: 'arrival' | 'leaving';
    location_name?: string;
    photo: string;
    notes?: string;
  }) => Promise<void>;
  activeReport: ShiftReport | null;
  suggestedCoworkers?: string[];
  allStaffNames?: string[];
  initialClosing?: boolean;
}

export const ClockOutModal: React.FC<ClockOutModalProps> = ({
  isOpen,
  onClose,
  onClockOut,
  onEventReport,
  activeReport,
  suggestedCoworkers = [],
  allStaffNames = [],
  initialClosing = false,
}) => {
  const { defaultLocations } = useBrand();
  // Intermediate report type: 'arrival' | 'leaving'
  const [eventType, setEventType] = useState<'arrival' | 'leaving'>('arrival');

  // Checkmark: Is this a final shift closing report?
  const [isClosingReport, setIsClosingReport] = useState<boolean>(initialClosing);

  // Common fields
  const [locationName, setLocationName] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  // Closing report fields
  const [clockOutType, setClockOutType] = useState<ClockOutType>('closing_shift');
  // Manual numeric inputs (NOT pills/buttons)
  const [breakMinutesInput, setBreakMinutesInput] = useState<string>('30');
  const [travelMinutesInput, setTravelMinutesInput] = useState<string>('0');
  // Worked with (pills/chips)
  const [selectedCoworkers, setSelectedCoworkers] = useState<string[]>([]);
  const [customCoworker, setCustomCoworker] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initialClosing state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsClosingReport(initialClosing);
      setError(null);
      setPhotoPreview(null);
      setLocationName('');
      setNotes('');
    }
  }, [isOpen, initialClosing]);

  // Initialize selected coworkers with suggested ones from roster
  useEffect(() => {
    if (suggestedCoworkers && suggestedCoworkers.length > 0) {
      setSelectedCoworkers(suggestedCoworkers);
    }
  }, [suggestedCoworkers]);

  if (!isOpen || !activeReport) return null;

  const { hour, minute } = getNowInBusinessTz();
  const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const clockInTime = new Date(activeReport.clock_in_at);
  const clockInFormatted = clockInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Calculate approximate duration
  const nowMs = Date.now();
  const startMs = clockInTime.getTime();
  const grossMinutes = Math.max(0, Math.round((nowMs - startMs) / (1000 * 60)));
  const parsedBreak = Math.max(0, parseInt(breakMinutesInput) || 0);
  const parsedTravel = Math.max(0, parseInt(travelMinutesInput) || 0);
  const netMinutes = Math.max(0, grossMinutes - parsedBreak);
  const netHours = (netMinutes / 60).toFixed(2);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError('Photo is too large (maximum 8MB). Please take or select a smaller photo.');
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

    // Photo proof is mandatory for tracking where the team is
    if (!photoPreview) {
      if (isClosingReport) {
        setError('A closing photo proof is required to finish your shift (e.g. final site, lockup, or vehicle keys).');
      } else {
        setError(`A photo proof is required to report your ${eventType === 'arrival' ? 'arrival' : 'leaving'} at the site.`);
      }
      return;
    }

    setIsSubmitting(true);

    try {
      if (isClosingReport) {
        // Submit full closing shift report
        const defaultLoc =
          clockOutType === 'closing_shift'
            ? defaultLocations.closing
            : locationName.trim() || defaultLocations.lastJob;

        await onClockOut({
          photo: photoPreview,
          type: clockOutType,
          location: defaultLoc,
          break_minutes: parsedBreak,
          travel_minutes: parsedTravel,
          worked_with: selectedCoworkers,
          notes: notes.trim(),
        });
        onClose();
      } else {
        // Submit intermediate arrival or leaving event report
        if (onEventReport) {
          await onEventReport({
            event_type: eventType,
            location_name: locationName.trim() || undefined,
            photo: photoPreview,
            notes: notes.trim() || undefined,
          });
        } else {
          // Direct fallback
          await apiFetch('/api/timesheets/event-report', {
            method: 'POST',
            body: JSON.stringify({
              report_id: activeReport.id,
              event_type: eventType,
              location_name: locationName.trim() || undefined,
              photo: photoPreview,
              notes: notes.trim() || undefined,
            }),
          });
        }
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to submit report. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div
          className={`p-5 sm:p-6 text-white relative shrink-0 transition-colors ${
            isClosingReport
              ? 'bg-gradient-to-r from-blue-700 to-indigo-800'
              : eventType === 'arrival'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-700'
              : 'bg-gradient-to-r from-amber-600 to-orange-700'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 rounded-xl backdrop-blur-xs">
              {isClosingReport ? (
                <Clock className="w-6 h-6 text-white" />
              ) : eventType === 'arrival' ? (
                <LogIn className="w-6 h-6 text-white" />
              ) : (
                <LogOut className="w-6 h-6 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">
                {isClosingReport ? 'Finish Shift' : 'Report Activity'}
              </h2>
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

          {/* CHECKMARK: Is this a closing shift report? */}
          <div
            onClick={() => setIsClosingReport(!isClosingReport)}
            className={`p-4 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-3.5 ${
              isClosingReport
                ? 'bg-blue-50/80 border-blue-400 text-blue-950 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/80'
            }`}
          >
            <div className="mt-0.5 text-blue-600 shrink-0">
              {isClosingReport ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : (
                <Square className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-bold text-sm leading-snug">
                Closing Shift Report (Finish & Clock Out)
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isClosingReport
                  ? 'Includes break deduction, travel time, and final hours.'
                  : 'Uncheck if reporting arrival or departure at a job site.'}
              </p>
            </div>
          </div>

          {/* SECTION A: If NOT closing report, choose Arrival or Leaving */}
          {!isClosingReport && (
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Report Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setEventType('arrival')}
                  className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center font-medium transition-all cursor-pointer ${
                    eventType === 'arrival'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      eventType === 'arrival' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    <LogIn className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold block">Arrival</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setEventType('leaving')}
                  className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center font-medium transition-all cursor-pointer ${
                    eventType === 'leaving'
                      ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-500/20 shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      eventType === 'leaving' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold block">Leaving</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* SITE / LOCATION NAME (Optional text field for all report types) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Site Name (Optional)
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. Sylvia Park Mall"
                className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* PHOTO PROOF (MANDATORY FOR ARRIVAL, LEAVING, AND CLOSING) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Camera
                  className={`w-4 h-4 ${
                    isClosingReport
                      ? 'text-blue-600'
                      : eventType === 'arrival'
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                />
                {isClosingReport
                  ? 'Closing Photo'
                  : eventType === 'arrival'
                  ? 'Arrival Photo'
                  : 'Leaving Photo'}
              </label>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300/60 rounded-md uppercase tracking-wider">
                Required
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
                  alt="Proof preview"
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
                <div className="absolute bottom-2 left-2 bg-slate-900/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1 shadow-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Photo Attached
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
                <div
                  className={`p-2.5 rounded-full shadow-xs border ${
                    error && !photoPreview
                      ? 'bg-rose-100 border-rose-300 text-rose-600'
                      : 'bg-white border-slate-200 text-blue-600'
                  }`}
                >
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <span
                    className={`text-sm font-bold block ${
                      error && !photoPreview ? 'text-rose-900' : 'text-slate-800'
                    }`}
                  >
                    Upload Photo *
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* SECTION B: LONG FORM WHEN isClosingReport IS TRUE */}
          {isClosingReport && (
            <div className="space-y-5 pt-2 border-t border-slate-200 animate-in fade-in duration-200">
              {/* Shift Duration Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-3 gap-2 text-center divide-x divide-slate-200">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Started
                  </span>
                  <span className="text-sm font-bold text-slate-800">{clockInFormatted}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Finishing
                  </span>
                  <span className="text-sm font-bold text-slate-800">{timeFormatted}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">
                    Est. Net Hours
                  </span>
                  <span className="text-sm font-bold text-blue-700">{netHours} hrs</span>
                </div>
              </div>

              {/* Where are you finishing? */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Finishing Location
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setClockOutType('closing_shift')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center font-medium transition-all cursor-pointer ${
                      clockOutType === 'closing_shift'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Building
                      className={`w-4 h-4 ${
                        clockOutType === 'closing_shift' ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    />
                    <span className="text-xs font-bold">Base Office / Depot</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setClockOutType('last_job')}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center font-medium transition-all cursor-pointer ${
                      clockOutType === 'last_job'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Briefcase
                      className={`w-4 h-4 ${
                        clockOutType === 'last_job' ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    />
                    <span className="text-xs font-bold">{defaultLocations.lastJob}</span>
                  </button>
                </div>
              </div>

              {/* MANUAL BREAK TIME INPUT */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Coffee className="w-4 h-4 text-amber-600" />
                    Break Time (Minutes)
                  </label>
                  <span className="text-[11px] text-slate-500">Deducted from hours</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="720"
                    step="1"
                    value={breakMinutesInput}
                    onChange={(e) => setBreakMinutesInput(e.target.value)}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 pr-16"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                    minutes
                  </span>
                </div>
              </div>

              {/* MANUAL TRAVEL TIME INPUT */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 text-blue-600" />
                    Travel Time (Minutes)
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">Informational</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="720"
                    step="1"
                    value={travelMinutesInput}
                    onChange={(e) => setTravelMinutesInput(e.target.value)}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pr-16"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">
                    minutes
                  </span>
                </div>
              </div>

              {/* WORKED WITH */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Worked With (Optional)
                </label>

                {/* Quick Chips / Pills for active staff */}
                <div className="flex flex-wrap gap-1.5 mb-2.5 max-h-36 overflow-y-auto p-1 bg-slate-50/50 rounded-xl border border-slate-100">
                  {allStaffNames.length > 0 ? (
                    allStaffNames.map((name) => {
                      const isSelected = selectedCoworkers.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => toggleCoworker(name)}
                          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}
                          {name}
                        </button>
                      );
                    })
                  ) : (
                    <span className="text-xs text-slate-400 py-1 px-2">No team members listed</span>
                  )}
                </div>

                {/* Manual custom coworker input */}
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
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {selectedCoworkers.length > 0 && (
                  <div className="mt-2 text-xs text-slate-600">
                    Selected team:{' '}
                    <span className="font-semibold text-indigo-900">
                      {selectedCoworkers.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NOTES / COMMENTS */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Completed site clean, access notes..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-2 py-3 px-4 rounded-xl font-bold transition-all shadow-md disabled:opacity-50 text-sm flex items-center justify-center gap-2 cursor-pointer text-white ${
                isClosingReport
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                  : eventType === 'arrival'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
              }`}
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isClosingReport ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Clock Out</span>
                </>
              ) : eventType === 'arrival' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Submit Arrival</span>
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4" />
                  <span>Submit Leaving</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
