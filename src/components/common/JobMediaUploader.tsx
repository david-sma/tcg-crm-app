import React, { useEffect, useRef, useState } from 'react';
import { Camera, Film, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { JobMedia, JobMediaPhase } from '../../types/index.ts';
import {
  JOB_PHOTO_MAX_BYTES,
  JOB_PHOTO_MIME_TYPES,
  JOB_VIDEO_MAX_BYTES,
  JOB_VIDEO_MIME_TYPES,
} from '../../config/jobs.ts';
import {
  completeJobMediaUpload,
  deleteJobMedia,
  fetchJobMedia,
  requestJobMediaUploadUrl,
  retryJobMedia,
  uploadFileToPresignedUrl,
} from '../../lib/jobUpload.ts';

interface PendingUpload {
  localId: string;
  file: File;
  previewUrl?: string;
  progress: number;
  error?: string;
  mediaType: 'photo' | 'video';
}

export interface JobMediaUploaderProps {
  jobId: string;
  phase: JobMediaPhase;
  media: JobMedia[];
  onMediaChange: (media: JobMedia[]) => void;
  allowVideo?: boolean;
  photoLimit?: number;
  disabled?: boolean;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  uploading: { label: 'Uploading', className: 'bg-blue-100 text-blue-700' },
  queued: { label: 'Waiting', className: 'bg-slate-100 text-slate-600' },
  processing: { label: 'Processing', className: 'bg-amber-100 text-amber-700' },
  ready: { label: 'Ready', className: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
};

export const JobMediaUploader: React.FC<JobMediaUploaderProps> = ({
  jobId,
  phase,
  media,
  onMediaChange,
  allowVideo = false,
  photoLimit,
  disabled = false,
}) => {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const photoCount = media.filter((item) => item.media_type === 'photo').length + pending.filter((p) => p.mediaType === 'photo').length;

  // Background refresh while items are still queued/processing (async compression pipeline).
  const hasActive = media.some((item) => item.status === 'queued' || item.status === 'processing' || item.status === 'uploading');
  useEffect(() => {
    if (!hasActive) return undefined;
    const timer = setInterval(async () => {
      try {
        const fresh = await fetchJobMedia(jobId);
        onMediaChange(fresh.filter((item) => item.phase === phase));
      } catch {
        // keep polling quietly
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [hasActive, jobId, phase, onMediaChange]);

  const uploadOne = async (upload: PendingUpload) => {
    try {
      const { media_id: mediaId, upload_url: uploadUrl } = await requestJobMediaUploadUrl({
        jobId,
        phase,
        mediaType: upload.mediaType,
        filename: upload.file.name,
        contentType: upload.file.type || (upload.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
        byteSize: upload.file.size,
      });

      await uploadFileToPresignedUrl({
        uploadUrl,
        file: upload.file,
        contentType: upload.file.type || (upload.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
        onProgress: (percent) => {
          setPending((current) =>
            current.map((item) => (item.localId === upload.localId ? { ...item, progress: percent } : item)),
          );
        },
      });

      const mediaItem = await completeJobMediaUpload(mediaId);
      setPending((current) => current.filter((item) => item.localId !== upload.localId));
      onMediaChange([...media.filter((item) => item.id !== mediaItem.id), mediaItem]);
    } catch (err: any) {
      setPending((current) =>
        current.map((item) =>
          item.localId === upload.localId ? { ...item, error: err?.message || 'Upload failed' } : item,
        ),
      );
    }
  };

  const handleFilesSelected = (files: FileList | null, mediaType: 'photo' | 'video') => {
    if (!files || disabled) return;
    setListError(null);

    const accepted: PendingUpload[] = [];
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith('video/');
      const mimeOk = mediaType === 'video' ? JOB_VIDEO_MIME_TYPES.includes(file.type) || isVideo : JOB_PHOTO_MIME_TYPES.includes(file.type) || file.type.startsWith('image/');
      if (!mimeOk) {
        setListError(`"${file.name}" is not a supported ${mediaType} format.`);
        continue;
      }
      const maxBytes = mediaType === 'video' ? JOB_VIDEO_MAX_BYTES : JOB_PHOTO_MAX_BYTES;
      if (file.size > maxBytes) {
        setListError(
          mediaType === 'video'
            ? `"${file.name}" is too large (max ${formatBytes(maxBytes)}).`
            : `"${file.name}" is too large (max ${formatBytes(maxBytes)}).`,
        );
        continue;
      }
      if (mediaType === 'photo' && photoLimit && photoCount + accepted.length >= photoLimit) {
        setListError(`You can attach up to ${photoLimit} photos here.`);
        break;
      }
      accepted.push({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: mediaType === 'photo' ? URL.createObjectURL(file) : undefined,
        progress: 0,
        mediaType,
      });
    }

    if (accepted.length === 0) return;
    setPending((current) => [...current, ...accepted]);
    accepted.forEach((upload) => void uploadOne(upload));
  };

  const handleRetryUpload = (localId: string) => {
    const upload = pending.find((item) => item.localId === localId);
    if (!upload) return;
    setPending((current) =>
      current.map((item) => (item.localId === localId ? { ...item, error: undefined, progress: 0 } : item)),
    );
    void uploadOne({ ...upload, error: undefined, progress: 0 });
  };

  const handleRemovePending = (localId: string) => {
    setPending((current) => current.filter((item) => item.localId !== localId));
  };

  const handleDeleteMedia = async (item: JobMedia) => {
    try {
      await deleteJobMedia(item.id);
      onMediaChange(media.filter((entry) => entry.id !== item.id));
    } catch (err: any) {
      setListError(err?.message || 'Failed to remove media.');
    }
  };

  const handleRetryMedia = async (item: JobMedia) => {
    try {
      const fresh = await retryJobMedia(item.id);
      onMediaChange(media.map((entry) => (entry.id === fresh.id ? fresh : entry)));
    } catch (err: any) {
      setListError(err?.message || 'Failed to retry processing.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          <Camera className="w-4 h-4" />
          Add photos
        </button>
        {allowVideo && (
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            <Film className="w-4 h-4" />
            Add video
          </button>
        )}
        {photoLimit !== undefined && (
          <span className="text-xs text-slate-500">
            {photoCount}/{photoLimit} photos
          </span>
        )}
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          handleFilesSelected(event.target.files, 'photo');
          event.target.value = '';
        }}
      />
      {allowVideo && (
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            handleFilesSelected(event.target.files, 'video');
            event.target.value = '';
          }}
        />
      )}

      {listError && (
        <div className="flex items-start justify-between gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
          <span>{listError}</span>
          <button type="button" onClick={() => setListError(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {(media.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {pending.map((item) => (
            <div key={item.localId} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <Film className="w-8 h-8" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 text-white text-[11px] px-2 py-1">
                {item.error ? (
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-red-200 truncate">{item.error}</span>
                    <button type="button" onClick={() => handleRetryUpload(item.localId)} aria-label="Retry upload">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-1">
                    <span>Uploading {item.progress}%</span>
                    <button type="button" onClick={() => handleRemovePending(item.localId)} aria-label="Cancel upload">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {media.map((item) => {
            const chip = STATUS_CHIP[item.status] || STATUS_CHIP.queued;
            return (
              <div key={item.id} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-square">
                {item.status === 'ready' && item.media_type === 'photo' && item.url ? (
                  <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : item.status === 'ready' && item.media_type === 'video' && item.url ? (
                  <video src={item.url} className="w-full h-full object-cover" controls preload="metadata" />
                ) : item.media_type === 'video' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1">
                    <Film className="w-8 h-8" />
                    {item.duration_seconds ? <span className="text-[11px]">{item.duration_seconds}s</span> : null}
                  </div>
                ) : item.url ? (
                  <img src={item.url} alt="" className="w-full h-full object-cover opacity-60" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    {item.status === 'processing' || item.status === 'queued' ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <Camera className="w-8 h-8" />
                    )}
                  </div>
                )}

                <div className="absolute top-1.5 left-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${chip.className}`}>
                    {item.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin mr-0.5" />}
                    {chip.label}
                  </span>
                </div>

                {!disabled && (
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    {item.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => handleRetryMedia(item)}
                        className="p-1 rounded-full bg-white/90 text-slate-700 hover:bg-white"
                        aria-label="Retry processing"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteMedia(item)}
                      className="p-1 rounded-full bg-white/90 text-red-600 hover:bg-white"
                      aria-label="Remove media"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {item.status === 'ready' && item.byte_size ? (
                  <div className="absolute inset-x-0 bottom-0 bg-slate-900/50 text-white text-[10px] px-2 py-0.5">
                    {formatBytes(item.byte_size)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {media.length === 0 && pending.length === 0 && (
        <div className="border border-dashed border-slate-300 rounded-xl px-4 py-6 text-center text-sm text-slate-500">
          <Plus className="w-5 h-5 mx-auto mb-1 text-slate-400" />
          No media yet. Photos and video upload in the background while you keep working.
        </div>
      )}
    </div>
  );
};
