import React, { useState, useEffect } from 'react';
import { X, Clock, MapPin, AlertCircle, Loader2, RefreshCw, ZoomIn, Download } from 'lucide-react';
import { getAuthToken } from '../../lib/api.ts';

interface PhotoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  photoUrl: string | null;
  title: string;
  timestamp?: string;
  location?: string;
  typeLabel?: string;
}

export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({
  isOpen,
  onClose,
  photoUrl,
  title,
  timestamp,
  location,
  typeLabel,
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !photoUrl) {
      setResolvedSrc(null);
      setLoading(false);
      setLoadError(null);
      return;
    }

    let isMounted = true;
    let blobUrlToClean: string | null = null;

    async function loadPhoto() {
      setLoading(true);
      setLoadError(null);

      // If it's already a base64 data URI or blob URL, load directly
      if (photoUrl?.startsWith('data:image/') || photoUrl?.startsWith('blob:')) {
        if (isMounted) {
          setResolvedSrc(photoUrl);
          setLoading(false);
        }
        return;
      }

      // If it's an API route or relative URL, fetch with Auth Bearer header
      try {
        const token = getAuthToken();
        const urlToFetch = photoUrl?.startsWith('http')
          ? photoUrl
          : `${photoUrl}${photoUrl?.includes('?') ? '&' : '?'}token=${token || ''}`;

        const res = await fetch(urlToFetch, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
          throw new Error(`Failed to load photo (Status ${res.status})`);
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        blobUrlToClean = objectUrl;

        if (isMounted) {
          setResolvedSrc(objectUrl);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Error loading shift photo:', err);
        if (isMounted) {
          // Fallback to direct src just in case
          setResolvedSrc(photoUrl);
          setLoadError(err?.message || 'Could not load the photo from storage');
          setLoading(false);
        }
      }
    }

    loadPhoto();

    return () => {
      isMounted = false;
      if (blobUrlToClean) {
        URL.revokeObjectURL(blobUrlToClean);
      }
    };
  }, [isOpen, photoUrl]);

  if (!isOpen || !photoUrl) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-base text-white">{title}</h3>
            {typeLabel && (
              <span className="inline-block mt-0.5 text-xs text-emerald-400 font-medium">
                {typeLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image Content */}
        <div className="relative bg-slate-950 flex-1 flex items-center justify-center min-h-[300px] max-h-[65vh] overflow-hidden p-3">
          {loading && (
            <div className="flex flex-col items-center gap-2 text-slate-400 py-16">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <span className="text-xs">Loading shift proof photo...</span>
            </div>
          )}

          {!loading && loadError && !resolvedSrc && (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-slate-300">
              <AlertCircle className="w-10 h-10 text-rose-500" />
              <p className="text-sm font-semibold">{loadError}</p>
              <p className="text-xs text-slate-500 max-w-sm">
                The photo might still be synchronizing or unavailable.
              </p>
            </div>
          )}

          {!loading && resolvedSrc && (
            <img
              src={resolvedSrc}
              alt={title}
              onError={() => setLoadError('Image failed to render')}
              className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
            />
          )}
        </div>

        {/* Metadata Footer */}
        {(timestamp || location) && (
          <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 shrink-0">
            {timestamp && (
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Recorded: {new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
            )}
            {location && (
              <div className="flex items-center gap-1.5 text-slate-300">
                <MapPin className="w-4 h-4 text-blue-400" />
                <span>{location}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
