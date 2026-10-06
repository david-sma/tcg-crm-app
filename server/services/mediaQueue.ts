import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { jobMedia, jobs } from '../db/schema.ts';
import {
  JOB_MEDIA_MAX_ATTEMPTS,
  JOB_MEDIA_QUEUE_INTERVAL_MS,
  JOB_VIDEO_TARGET_CRF,
  JOB_VIDEO_TARGET_MAX_EDGE_PX,
} from '../../src/config/jobs.ts';
import { compressPhotoBufferForStorage } from './image.ts';
import { createInAppNotification } from './notification.ts';
import {
  deleteFromStorageRef,
  getBufferFromStorage,
  uploadBufferToStorage,
} from './storage.ts';
import type { JobMediaRow } from './jobs.ts';

const FFMPEG_PATH: string | null = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;

let isRunning = false;
let queueTimer: ReturnType<typeof setInterval> | null = null;

function parseFfmpegDuration(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return Math.round(hours * 3600 + minutes * 60 + seconds);
}

function runFfmpeg(inputPath: string, outputPath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_PATH) {
      reject(new Error('ffmpeg binary is not available on this server.'));
      return;
    }

    const args = [
      '-y',
      '-i', inputPath,
      '-vf', `scale='min(${JOB_VIDEO_TARGET_MAX_EDGE_PX},iw)':-2`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', String(JOB_VIDEO_TARGET_CRF),
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      outputPath,
    ];

    const child = spawn(FFMPEG_PATH, args);
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 200_000) {
        stderr = stderr.slice(-100_000);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`ffmpeg failed to start: ${err.message}`));
    });

    child.on('close', (code) => {
      const durationSeconds = parseFfmpegDuration(stderr);
      if (code !== 0) {
        const snippet = stderr.trim().slice(-500);
        reject(new Error(`ffmpeg failed (exit ${code}): ${snippet}`));
        return;
      }
      resolve(durationSeconds);
    });
  });
}

async function claimNextMedia(): Promise<JobMediaRow | null> {
  const candidates = await db
    .select()
    .from(jobMedia)
    .where(and(eq(jobMedia.status, 'queued'), lt(jobMedia.attempt_count, JOB_MEDIA_MAX_ATTEMPTS)))
    .orderBy(asc(jobMedia.created_at))
    .limit(1);

  if (candidates.length === 0) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const claimed = await db
    .update(jobMedia)
    .set({
      status: 'processing',
      attempt_count: sql`attempt_count + 1`,
      updated_at: nowIso,
    })
    .where(and(eq(jobMedia.id, candidates[0].id), eq(jobMedia.status, 'queued')))
    .returning();

  return claimed[0] ?? null;
}

async function processMediaItem(item: JobMediaRow): Promise<void> {
  const originalRef = item.original_ref;

  if (!originalRef || !originalRef.startsWith('s3://')) {
    throw new Error('Original upload reference is missing for this media.');
  }

  const downloaded = await getBufferFromStorage(originalRef);
  if (!downloaded) {
    throw new Error('Original upload not found in storage.');
  }

  const extension = item.media_type === 'video' ? 'mp4' : 'webp';
  const inputPath = path.join(os.tmpdir(), `job-media-${item.id}-original`);
  const outputPath = path.join(os.tmpdir(), `job-media-${item.id}-processed.${extension}`);

  try {
    await fsp.writeFile(inputPath, downloaded.buffer);

    let processedBuffer: Buffer;
    let contentType: string;
    let durationSeconds: number | null = item.duration_seconds ?? null;

    if (item.media_type === 'video') {
      durationSeconds = await runFfmpeg(inputPath, outputPath);
      processedBuffer = await fsp.readFile(outputPath);
      contentType = 'video/mp4';
    } else {
      const compressed = await compressPhotoBufferForStorage(downloaded.buffer);
      processedBuffer = compressed.buffer;
      contentType = compressed.contentType;
    }

    const processedKey = `job-media/${item.job_id}/${item.id}-processed.${extension}`;
    const processedRef = await uploadBufferToStorage(processedKey, processedBuffer, contentType);

    try {
      await deleteFromStorageRef(originalRef);
    } catch (err) {
      console.error('Failed to delete original job media object:', err);
    }

    await db
      .update(jobMedia)
      .set({
        original_ref: null,
        processed_ref: processedRef,
        content_type: contentType,
        byte_size: processedBuffer.length,
        duration_seconds: item.media_type === 'video' ? durationSeconds : null,
        status: 'ready',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .where(eq(jobMedia.id, item.id));
  } finally {
    await fsp.unlink(inputPath).catch(() => {});
    await fsp.unlink(outputPath).catch(() => {});
  }
}

async function handleMediaFailure(item: JobMediaRow, message: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const attempts = item.attempt_count;
  const exhausted = attempts >= JOB_MEDIA_MAX_ATTEMPTS;

  await db
    .update(jobMedia)
    .set({
      status: exhausted ? 'failed' : 'queued',
      error_message: message,
      updated_at: nowIso,
    })
    .where(eq(jobMedia.id, item.id));

  if (exhausted && item.created_by_user_id) {
    try {
      const job = (
        await db.select().from(jobs).where(eq(jobs.id, item.job_id)).limit(1)
      )[0];
      const jobTitle = job?.title || item.job_id;

      await createInAppNotification({
        userId: item.created_by_user_id,
        type: 'JOB_MEDIA_FAILED',
        title: 'Job media failed',
        body: `A ${item.media_type} uploaded for job "${jobTitle}" (${item.phase}) could not be processed after ${attempts} attempt(s): ${message}`,
        relatedEntityType: 'job_media',
        relatedEntityId: item.id,
      });
    } catch (err) {
      console.error('Failed to send job media failure notification:', err);
    }
  }
}

async function processQueue(): Promise<void> {
  if (isRunning) {
    return;
  }
  isRunning = true;

  try {
    for (;;) {
      let item: JobMediaRow | null = null;
      try {
        item = await claimNextMedia();
      } catch (err) {
        console.error('Media queue claim error:', err);
        break;
      }

      if (!item) {
        break;
      }

      try {
        await processMediaItem(item);
      } catch (err: any) {
        const message = err?.message || 'Unknown processing error';
        console.error(`Media queue processing error for ${item.id}:`, err);
        try {
          await handleMediaFailure(item, message);
        } catch (failErr) {
          console.error('Media queue failure handling error:', failErr);
        }
      }
    }
  } catch (err) {
    console.error('Media queue loop error:', err);
  } finally {
    isRunning = false;
  }
}

/** Trigger processing soon. Safe to call often; the loop runs serially. */
export function kickMediaQueue(): void {
  void processQueue();
}

/** Start the periodic media processing loop (unref'd so it never blocks shutdown). */
export function startMediaQueue(): void {
  if (queueTimer) {
    return;
  }

  queueTimer = setInterval(() => {
    kickMediaQueue();
  }, JOB_MEDIA_QUEUE_INTERVAL_MS);
  (queueTimer as unknown as { unref?: () => void }).unref?.();

  kickMediaQueue();
}
