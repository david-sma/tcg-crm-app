import { db } from '../db/index.ts';
import { notifications, pushSubscriptions } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import webPush from 'web-push';
import { getAppSettings } from '../../src/config/appSettings.ts';

export function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn('[web-push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing — push notifications are disabled (in-app notifications still work).');
    return;
  }
  const subject = process.env.VAPID_SUBJECT;
  if (!subject) {
    console.warn('[web-push] VAPID_SUBJECT missing — falling back to mailto:supportEmail. Set VAPID_SUBJECT to a real mailto: or https: contact.');
  }
  try {
    webPush.setVapidDetails(subject || `mailto:${getAppSettings().supportEmail}`, publicKey, privateKey);
  } catch (e) {
    console.error('[web-push] setVapidDetails failed — push notifications are disabled:', e);
  }
}

configureWebPush();

export type InAppNotificationType =
  | 'ROSTER_PUBLISHED'
  | 'ROSTER_REVISED'
  | 'AVAILABILITY_CHANGED'
  | 'CONFLICT_REPORTED'
  | 'SHIFT_STARTED'
  | 'SHIFT_EVENT'
  | 'TIMESHEET_SUBMITTED'
  | 'TIMESHEET_APPROVED'
  | 'JOB_ASSIGNED'
  | 'JOB_NEEDS_PRICING'
  | 'JOB_STATUS_CHANGED'
  | 'JOB_READY_FOR_HANDOFF'
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'JOB_RUNNING_LATE'
  | 'JOB_MEDIA_FAILED';

/**
 * Allow-list of notification types that also trigger an OS-level push.
 * Everything else is in-app only. Roster publishes/revisions and the manager-only
 * job pricing alert — no per-type settings UI. JOB_NEEDS_PRICING is only ever
 * sent to managers, so the type-based allow-list stays safe.
 */
export const PUSH_ENABLED_TYPES: InAppNotificationType[] = [
  'ROSTER_PUBLISHED',
  'ROSTER_REVISED',
  'JOB_NEEDS_PRICING',
];

export async function pushForType(
  type: InAppNotificationType,
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  if (!PUSH_ENABLED_TYPES.includes(type)) return { sent: 0, failed: 0 };
  return sendPushNotificationToUser(userId, payload);
}

export async function createInAppNotification(params: {
  userId: string;
  type: InAppNotificationType;
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  pushUrl?: string;
  pushTag?: string;
}) {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db.insert(notifications).values({
    id,
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    related_entity_type: params.relatedEntityType || null,
    related_entity_id: params.relatedEntityId || null,
    is_read: false,
    created_at: nowIso,
  });

  // Also attempt Web Push non-blockingly (allow-listed types only)
  setImmediate(async () => {
    try {
      const url = params.pushUrl
        || (params.type.startsWith('JOB_') ? '/?module=jobs-dispatches' : '/?module=staff-ops');
      await pushForType(params.type, params.userId, {
        title: params.title,
        body: params.body,
        url,
        tag: params.pushTag,
      });
    } catch {
      // Push error is non-blocking
    }
  });

  return id;
}

export async function sendPushNotificationToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<{ sent: number; failed: number }> {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.user_id, userId));
  if (subs.length === 0) return { sent: 0, failed: 0 };

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn(`[web-push] cannot deliver to user ${userId}: VAPID keys are not configured`);
    return { sent: 0, failed: subs.length };
  }

  const payloadString = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      await webPush.sendNotification(pushConfig, payloadString);
      sent += 1;
    } catch (err: any) {
      failed += 1;
      let endpointHost = sub.endpoint;
      try {
        endpointHost = new URL(sub.endpoint).host;
      } catch {
        // keep raw endpoint if it is not a valid URL
      }
      console.warn(
        `Web push delivery failed for user ${userId} via ${endpointHost}:`,
        `statusCode=${err?.statusCode ?? 'unknown'}`,
        `body=${typeof err?.body === 'string' ? err.body : JSON.stringify(err?.body ?? null)}`,
        err?.message || err
      );
      // Remove stale/expired subscriptions if 410 Gone
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
      }
    }
  }

  return { sent, failed };
}
