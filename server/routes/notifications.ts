import { Router, Request, Response } from 'express';
import { db } from '../db/index.ts';
import { notifications, pushSubscriptions } from '../db/schema.ts';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { sendPushNotificationToUser } from '../services/notification.ts';
import crypto from 'crypto';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// GET /api/notifications - List caller's notifications
notificationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const list = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, req.user!.id))
      .orderBy(desc(notifications.created_at))
      .limit(50);

    const unreadCount = list.filter((n) => !n.is_read).length;

    return res.json({ notifications: list, unread_count: unreadCount });
  } catch (err) {
    console.error('List notifications error:', err);
    return res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

// POST /api/notifications/:id/read - Mark one notification as read
notificationsRouter.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const nowIso = new Date().toISOString();

    await db
      .update(notifications)
      .set({ is_read: true, read_at: nowIso })
      .where(and(eq(notifications.id, id), eq(notifications.user_id, req.user!.id)));

    return res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// POST /api/notifications/mark-all-read - Mark all caller notifications as read
notificationsRouter.post('/mark-all-read', async (req: Request, res: Response) => {
  try {
    const nowIso = new Date().toISOString();
    await db
      .update(notifications)
      .set({ is_read: true, read_at: nowIso })
      .where(and(eq(notifications.user_id, req.user!.id), eq(notifications.is_read, false)));

    return res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// GET /api/notifications/vapid-public-key - Public key for Web Push subscription
notificationsRouter.get('/vapid-public-key', async (req: Request, res: Response) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || null;
  return res.json({ publicKey, enabled: Boolean(publicKey) });
});

// POST /api/notifications/push-subscription - Register Web Push subscription
notificationsRouter.post('/push-subscription', async (req: Request, res: Response) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid push subscription payload' });
    }

    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    const nowIso = new Date().toISOString();

    if (existing.length > 0) {
      await db
        .update(pushSubscriptions)
        .set({
          user_id: req.user!.id,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: req.headers['user-agent'] || null,
        })
        .where(eq(pushSubscriptions.endpoint, endpoint));
    } else {
      await db.insert(pushSubscriptions).values({
        id: crypto.randomUUID(),
        user_id: req.user!.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: req.headers['user-agent'] || null,
        created_at: nowIso,
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Register push subscription error:', err);
    return res.status(500).json({ error: 'Failed to register push subscription' });
  }
});

// DELETE /api/notifications/push-subscription - Unregister a Web Push subscription (caller-owned only)
notificationsRouter.delete('/push-subscription', async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Invalid push subscription payload' });
    }

    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.user_id, req.user!.id)));

    return res.json({ success: true });
  } catch (err) {
    console.error('Unregister push subscription error:', err);
    return res.status(500).json({ error: 'Failed to unregister push subscription' });
  }
});

// POST /api/notifications/test - Send a test push to the caller's own devices (managers only)
notificationsRouter.post('/test', requireRole('manager'), async (req: Request, res: Response) => {
  try {
    const { sent, failed } = await sendPushNotificationToUser(req.user!.id, {
      title: 'Test notification',
      body: 'Push notifications are working on this device.',
      url: '/?module=staff-ops&tab=roster',
    });

    return res.json({ sent, failed });
  } catch (err) {
    console.error('Test push notification error:', err);
    return res.status(500).json({ error: 'Failed to send test notification' });
  }
});
