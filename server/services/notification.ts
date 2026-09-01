import { db } from '../db/index.ts';
import { notifications, pushSubscriptions } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import webPush from 'web-push';

// Configure Web Push VAPID if available, or generate a development pair safely
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSPOSnfPrDHFiViT_00eb_g896_sample_key';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'sample_vapid_private_key_32chars_len__';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@workforce-roster.internal';

try {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  }
} catch (e) {
  // Graceful fallback for dev environment
}

export async function createInAppNotification(params: {
  userId: string;
  type:
    | 'ROSTER_PUBLISHED'
    | 'ROSTER_REVISED'
    | 'AVAILABILITY_CHANGED'
    | 'CONFLICT_REPORTED'
    | 'SHIFT_STARTED'
    | 'TIMESHEET_SUBMITTED'
    | 'TIMESHEET_APPROVED';
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
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

  // Also attempt Web Push non-blockingly
  setImmediate(async () => {
    try {
      await sendPushNotificationToUser(params.userId, {
        title: params.title,
        body: params.body,
        url: '/staff/roster',
      });
    } catch {
      // Push error is non-blocking
    }
  });

  return id;
}

export async function sendPushNotificationToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.user_id, userId));
  if (subs.length === 0) return;

  const payloadString = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        await webPush.sendNotification(pushConfig, payloadString);
      }
    } catch (err: any) {
      console.warn(`Web push delivery warning for user ${userId}:`, err?.message || err);
      // Remove stale/expired subscriptions if 410 Gone
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
      }
    }
  }
}
