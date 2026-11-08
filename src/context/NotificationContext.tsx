import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from './AuthContext.tsx';
import { isStandaloneApp } from '../lib/pwa.ts';
import type { NotificationItem } from '../types/index.ts';

export type PushStatus = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  /** null while the subscription check is still running — render nothing until resolved. */
  pushStatus: PushStatus | null;
  enablePush: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

/** VAPID applicationServerKey must be the raw bytes of the URL-safe base64 key. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function isPushCapable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function sameKey(existing: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!existing) return false;
  const current = new Uint8Array(existing);
  if (current.length !== expected.length) return false;
  return current.every((byte, i) => byte === expected[i]);
}

/**
 * Ensure this browser has a live PushManager subscription bound to the signed-in
 * user, re-subscribing when missing or created with a stale VAPID key, and always
 * upserting it server-side (this also re-binds a shared phone to the new user).
 * Never calls requestPermission() — permission must already be 'granted'.
 * Returns true when a subscription exists and is registered server-side.
 */
async function syncPushSubscription(): Promise<boolean> {
  const keyRes = await apiFetch<{ publicKey: string | null; enabled: boolean }>(
    '/api/notifications/vapid-public-key',
  );
  if (!keyRes.enabled || !keyRes.publicKey) {
    // server has no VAPID key configured — in-app notifications still work
    return false;
  }
  const appServerKey = urlBase64ToUint8Array(keyRes.publicKey);

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (sub && !sameKey(sub.options.applicationServerKey, appServerKey)) {
    // Stale subscription from a previous VAPID pair — start over
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  }

  const subJson = sub.toJSON();
  await apiFetch('/api/notifications/push-subscription', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: {
        p256dh: subJson.keys?.p256dh || '',
        auth: subJson.keys?.auth || '',
      },
    }),
  });
  return true;
}

/** Compute the display status and repair a lost/stale subscription when allowed. */
async function resolvePushStatus(): Promise<PushStatus> {
  if (!isPushCapable()) return 'unsupported';
  if (!isStandaloneApp()) {
    // Installed-app is the supported target; still keep an existing granted
    // subscription healthy so alerts don't silently stop.
    if (Notification.permission === 'granted') {
      try {
        await syncPushSubscription();
      } catch {
        // silent — the install prompt is what the user needs to act on
      }
    }
    return 'needs-install';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  try {
    return (await syncPushSubscription()) ? 'on' : 'off';
  } catch {
    // Silent subscribe can throw on iOS without a user gesture — surface the prompt
    return 'off';
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);

  // Self-healing push sync on every signed-in load and after login
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    resolvePushStatus().then((status) => {
      if (!cancelled) setPushStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      const data = await apiFetch<{ notifications: NotificationItem[]; unread_count: number }>('/api/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      console.warn('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshNotifications();
    // Poll notifications every 30 seconds
    const interval = setInterval(refreshNotifications, 30000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiFetch('/api/notifications/mark-all-read', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  /** User-tap flow: request permission, then subscribe + upsert. */
  const enablePush = useCallback(async () => {
    if (!isPushCapable()) {
      setPushStatus('unsupported');
      return;
    }
    if (!isStandaloneApp()) {
      setPushStatus('needs-install');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setPushStatus('denied');
        return;
      }
      if (permission !== 'granted') {
        setPushStatus('off');
        return;
      }
      const ok = await syncPushSubscription();
      setPushStatus(ok ? 'on' : 'off');
    } catch {
      setPushStatus('off');
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        pushStatus,
        enablePush,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
