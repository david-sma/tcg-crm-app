import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from './AuthContext.tsx';
import type { NotificationItem } from '../types/index.ts';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  isPushSupported: boolean;
  pushSubscribed: boolean;
  requestPushPermission: () => Promise<void>;
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

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return false;
  });

  const isPushSupported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setPushSubscribed(true);
      }
    }
  }, []);

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

  const requestPushPermission = async () => {
    if (!isPushSupported) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setPushSubscribed(true);
        localStorage.setItem('portal_push_enabled', 'granted');

        if ('serviceWorker' in navigator && 'PushManager' in window) {
          try {
            const keyRes = await apiFetch<{ publicKey: string | null; enabled: boolean }>(
              '/api/notifications/vapid-public-key',
            );
            if (!keyRes.enabled || !keyRes.publicKey) {
              return; // server has no VAPID key configured yet — in-app notifications still work
            }

            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
              sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
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
          } catch (swErr) {
            console.warn('Service worker push sync:', swErr);
          }
        }
      } else {
        setPushSubscribed(false);
        if (permission === 'denied') {
          localStorage.setItem('portal_push_enabled', 'denied');
        }
      }
    } catch (e) {
      console.warn('Push registration warning:', e);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        isPushSupported,
        pushSubscribed,
        requestPushPermission,
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
