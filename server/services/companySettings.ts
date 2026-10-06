import { db } from '../db/index.ts';
import { companySettings } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { loadBrandConfig, readCustomerLogoSvg } from '../../src/config/loadCustomer.ts';
import {
  brandConfigToSettings,
  getAppSettings,
  setAppSettings,
  type AppSettings,
} from '../../src/config/appSettings.ts';
import type { BrandConfig } from '../../src/config/customerSchema.ts';

export const COMPANY_SETTINGS_ID = 'default';

type CompanySettingsRow = typeof companySettings.$inferSelect;

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function companySettingsRowToAppSettings(row: CompanySettingsRow): AppSettings {
  return {
    companyName: row.company_name,
    shortName: row.short_name,
    appTitle: row.app_title,
    portalSubtitle: row.portal_subtitle,
    tagline: row.tagline,
    city: row.city,
    address: row.address || '',
    supportEmail: row.support_email || '',
    timezone: row.timezone,
    locale: row.locale,
    phone: {
      country: row.phone_country,
      example: row.phone_example,
      help: row.phone_help,
    },
    colors: {
      primary: row.color_primary,
      primaryHover: row.color_primary_hover,
      secondary: row.color_secondary,
      secondaryHover: row.color_secondary_hover,
      accent: row.color_accent,
      background: row.color_background,
    },
    logoSvg: row.logo_svg || '',
    shiftPresets: safeJsonParse<string[]>(row.shift_presets, []),
    defaultLocations: safeJsonParse<AppSettings['defaultLocations']>(row.default_locations, {
      base: 'Base',
      firstJob: 'First Job',
      lastJob: 'Last Job',
      closing: 'Closing',
    }),
  };
}

function brandToRow(brand: BrandConfig, logoSvg: string, nowIso: string) {
  return {
    id: COMPANY_SETTINGS_ID,
    company_name: brand.companyName,
    short_name: brand.shortName,
    app_title: brand.appTitle,
    portal_subtitle: brand.portalSubtitle,
    tagline: brand.tagline,
    city: brand.city,
    address: brand.address,
    support_email: brand.supportEmail,
    logo_svg: logoSvg,
    timezone: brand.timezone,
    locale: brand.locale,
    phone_country: brand.phone.country,
    phone_example: brand.phone.example,
    phone_help: brand.phone.help,
    color_primary: brand.colors.primary,
    color_primary_hover: brand.colors.primaryHover,
    color_secondary: brand.colors.secondary,
    color_secondary_hover: brand.colors.secondaryHover,
    color_accent: brand.colors.accent,
    color_background: brand.colors.background,
    shift_presets: JSON.stringify(brand.shiftPresets),
    default_locations: JSON.stringify(brand.defaultLocations),
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/**
 * Ensures a `company_settings` row exists. Seeds it from customer/brand.ts
 * (plus customer/logo.svg) only when missing, so manual DB edits keep winning.
 */
export async function ensureCompanySettings(): Promise<CompanySettingsRow> {
  const existing = await db.select().from(companySettings).where(eq(companySettings.id, COMPANY_SETTINGS_ID)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  const brand = loadBrandConfig();
  const logoSvg = readCustomerLogoSvg();
  const nowIso = new Date().toISOString();
  await db.insert(companySettings).values(brandToRow(brand, logoSvg, nowIso));
  console.log(`Seeded company_settings for "${brand.companyName}".`);
  const inserted = await db.select().from(companySettings).where(eq(companySettings.id, COMPANY_SETTINGS_ID)).limit(1);
  return inserted[0];
}

/**
 * Loads company settings from the DB (seeding the row when missing), refreshes
 * the in-memory runtime settings used by server-side logic (timezone, phone
 * country, locations), and returns the payload used by `GET /api/settings`.
 */
export async function loadCompanySettings(): Promise<AppSettings> {
  const row = await ensureCompanySettings();
  const settings = companySettingsRowToAppSettings(row);
  setAppSettings(settings);
  return settings;
}

/**
 * Reads settings from memory (populated at boot / by loadCompanySettings).
 * Falls back to customer/brand.ts defaults before the first DB load.
 */
export function currentSettings(): AppSettings {
  return getAppSettings();
}
