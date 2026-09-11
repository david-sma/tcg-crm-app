import React, { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, CheckCircle, AlertCircle, X, MapPin, Building, Briefcase } from 'lucide-react';
import { getNowInAuckland } from '../../lib/dateUtils';
import { ClockInType } from '../../types';

interface ClockInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClockIn: (data: { photo: string | null; type: ClockInType; location: string }) => Promise<void>;
  scheduledShift?: any;
}

export const ClockInModal: React.FC<ClockInModalProps> = ({
  isOpen,
  onClose,
  onClockIn,
  scheduledShift,
}) => {
  const [clockInType, setClockInType] = useState<ClockInType>('base_arrival');
  const [locationName, setLocationName] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const { hour, minute, dayOfWeek } = getNowInAuckland();
  const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 5MB)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const defaultLoc =
        clockInType === 'base_arrival' ? 'Main Office / Base' : locationName.trim() || 'First Job Site';

      await onClockIn({
        photo: photoPreview,
        type: clockInType,
        location: defaultLoc,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to clock in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 sm:p-6 text-white relative shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/15 rounded-xl backdrop-blur-xs">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Start Shift</h2>
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

          {/* Current Time Badge */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Time (NZT)
              </span>
              <div className="text-2xl font-bold text-slate-900 tracking-tight">{timeFormatted}</div>
            </div>
            {scheduledShift && (
              <div className="text-right">
                <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                  Rostered Shift
                </span>
                <div className="text-sm font-bold text-slate-700">
                  {scheduledShift.start_datetime ? new Date(scheduledShift.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  {' - '}
                  {scheduledShift.finish_datetime ? new Date(scheduledShift.finish_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            )}
          </div>

          {/* Starting Location / Type Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Starting Location
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setClockInType('base_arrival')}
                className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border text-center font-medium transition-all ${
                  clockInType === 'base_arrival'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Building className={`w-5 h-5 ${clockInType === 'base_arrival' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span className="text-sm font-semibold">Base / Main Office</span>
              </button>

              <button
                type="button"
                onClick={() => setClockInType('first_job')}
                className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border text-center font-medium transition-all ${
                  clockInType === 'first_job'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Briefcase className={`w-5 h-5 ${clockInType === 'first_job' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span className="text-sm font-semibold">First Job Site</span>
              </button>
            </div>
          </div>

          {clockInType === 'first_job' && (
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
                  placeholder="e.g. Sylvia Park Commercial"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Photo Proof (In-app camera or file upload) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Arrival Photo
            </label>

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
                  alt="Clock in proof"
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-100 shadow-md flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" /> Retake Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(null)}
                    className="px-3.5 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 shadow-md flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 bg-emerald-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Photo Attached
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-5 flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-emerald-50/30 transition-colors cursor-pointer text-center"
              >
                <div className="p-2.5 bg-white rounded-full shadow-xs border border-slate-200 text-emerald-600">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-800 block">
                    Upload Photo
                  </span>
                </div>
              </div>
            )}
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
              className="flex-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-md hover:shadow-emerald-600/20 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Clock In</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
