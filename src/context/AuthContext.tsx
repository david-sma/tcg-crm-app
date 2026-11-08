import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.ts';
import type { User } from '../types/index.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: User }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (phone: string, password: string): Promise<User> => {
    const data = await apiFetch<{ user: User; sessionId?: string; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    const token = data.sessionId || data.token;
    if (token && typeof window !== 'undefined') {
      localStorage.setItem('roster_session_token', token);
    }
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      // Best-effort: unbind this device's push subscription while the session is
      // still valid, then drop the browser-side subscription. Never blocks logout.
      try {
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
          const reg = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          const sub = reg ? await reg.pushManager.getSubscription() : null;
          if (sub) {
            try {
              await apiFetch('/api/notifications/push-subscription', {
                method: 'DELETE',
                body: JSON.stringify({ endpoint: sub.endpoint }),
              });
            } catch (deleteErr) {
              console.warn('Push subscription cleanup during logout failed:', deleteErr);
            }
            try {
              await sub.unsubscribe();
            } catch (unsubErr) {
              console.warn('Push unsubscribe during logout failed:', unsubErr);
            }
          }
        }
      } catch (pushErr) {
        console.warn('Push cleanup during logout failed:', pushErr);
      }
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('roster_session_token');
      }
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
