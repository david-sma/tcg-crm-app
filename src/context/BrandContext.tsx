import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  getAppSettings,
  setAppSettings,
  type AppSettings,
} from '../config/appSettings.ts';
import { apiFetch } from '../lib/api.ts';

const BrandContext = createContext<AppSettings>(getAppSettings());

function applyCssVars(settings: AppSettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--color-brand', settings.colors.primary);
  root.style.setProperty('--color-brand-hover', settings.colors.primaryHover);
  root.style.setProperty('--color-brand-secondary', settings.colors.secondary);
  root.style.setProperty('--color-brand-secondary-hover', settings.colors.secondaryHover);
  root.style.setProperty('--color-brand-accent', settings.colors.accent);
  root.style.setProperty('--color-brand-bg', settings.colors.background);
}

export const BrandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(getAppSettings());

  useEffect(() => {
    applyCssVars(getAppSettings());
    let cancelled = false;

    apiFetch<AppSettings>('/api/settings')
      .then((data) => {
        if (cancelled || !data) return;
        setAppSettings(data);
        setSettings(getAppSettings());
        applyCssVars(data);
        if (typeof document !== 'undefined' && data.companyName) {
          document.title = `${data.companyName} | ${data.portalSubtitle}`;
        }
      })
      .catch(() => {
        // Settings endpoint unavailable — keep compile-time defaults
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <BrandContext.Provider value={settings}>{children}</BrandContext.Provider>;
};

export function useBrand(): AppSettings {
  return useContext(BrandContext);
}
