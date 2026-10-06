import type { BrandConfig } from './customerSchema.ts';
import { brandConfig } from '../../customer/brand.ts';

export interface AppSettings {
  companyName: string;
  shortName: string;
  appTitle: string;
  portalSubtitle: string;
  tagline: string;
  city: string;
  address: string;
  supportEmail: string;
  timezone: string;
  locale: string;
  phone: {
    country: string;
    example: string;
    help: string;
  };
  colors: {
    primary: string;
    primaryHover: string;
    secondary: string;
    secondaryHover: string;
    accent: string;
    background: string;
  };
  logoSvg: string;
  shiftPresets: string[];
  defaultLocations: {
    base: string;
    firstJob: string;
    lastJob: string;
    closing: string;
  };
}

export function brandConfigToSettings(brand: BrandConfig, logoSvg: string = ''): AppSettings {
  return {
    companyName: brand.companyName,
    shortName: brand.shortName,
    appTitle: brand.appTitle,
    portalSubtitle: brand.portalSubtitle,
    tagline: brand.tagline,
    city: brand.city,
    address: brand.address,
    supportEmail: brand.supportEmail,
    timezone: brand.timezone,
    locale: brand.locale,
    phone: { ...brand.phone },
    colors: { ...brand.colors },
    logoSvg,
    shiftPresets: [...brand.shiftPresets],
    defaultLocations: { ...brand.defaultLocations },
  };
}

let current: AppSettings = brandConfigToSettings(brandConfig);

export function getAppSettings(): AppSettings {
  return current;
}

export function setAppSettings(next: AppSettings): void {
  current = next;
}
