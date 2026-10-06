import { apiFetch } from './api.ts';
import type { JobMedia, JobMediaPhase, JobMediaType } from '../types/index.ts';

export interface RequestedJobMediaUpload {
  media_id: string;
  upload_url: string;
}

export async function requestJobMediaUploadUrl(params: {
  jobId: string;
  phase: JobMediaPhase;
  mediaType: JobMediaType;
  filename: string;
  contentType: string;
  byteSize: number;
}): Promise<RequestedJobMediaUpload> {
  return apiFetch<RequestedJobMediaUpload>('/api/jobs/media/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      job_id: params.jobId,
      phase: params.phase,
      media_type: params.mediaType,
      filename: params.filename,
      content_type: params.contentType,
      byte_size: params.byteSize,
    }),
  });
}

export function uploadFileToPresignedUrl(params: {
  uploadUrl: string;
  file: File;
  contentType: string;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', params.uploadUrl);
    xhr.setRequestHeader('Content-Type', params.contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && params.onProgress) {
        params.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection and try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(params.file);
  });
}

export async function completeJobMediaUpload(mediaId: string): Promise<JobMedia> {
  const data = await apiFetch<{ media: JobMedia }>(`/api/jobs/media/${mediaId}/complete`, {
    method: 'POST',
  });
  return data.media;
}

export async function fetchJobMedia(jobId: string): Promise<JobMedia[]> {
  const data = await apiFetch<{ media: JobMedia[] }>(`/api/jobs/${jobId}/media`);
  return data.media;
}

export async function deleteJobMedia(mediaId: string): Promise<void> {
  await apiFetch(`/api/jobs/media/${mediaId}`, { method: 'DELETE' });
}

export async function retryJobMedia(mediaId: string): Promise<JobMedia> {
  const data = await apiFetch<{ media: JobMedia }>(`/api/jobs/media/${mediaId}/retry`, {
    method: 'POST',
  });
  return data.media;
}
