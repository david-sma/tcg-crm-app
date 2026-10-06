import type { BrandConfig } from '../src/config/customerSchema.ts';

/**
 * Per-customer branding + locale configuration.
 * This file is the source of truth for a deployment; it seeds the
 * `company_settings` DB row on first boot. After seeding, the DB row wins
 * for display data (delete the row to re-seed from this file).
 */
export const brandConfig: BrandConfig = {
  companyName: 'The Cleaning Guys',
  shortName: 'TCG',
  appTitle: 'TCG Portal',
  portalSubtitle: 'Staff & Roster Portal',
  tagline: 'Professional Quality Service with Care',
  city: 'Auckland',
  address: 'Unit 4/65 Morrin Road, St Johns, Auckland',
  supportEmail: 'admin@workforce-roster.internal',
  timezone: 'Pacific/Auckland',
  locale: 'en-NZ',
  phone: {
    country: 'NZ',
    example: '027 123 4567',
    help: 'Accepts local New Zealand numbers (027/021/022) or +64 format',
  },
  colors: {
    primary: '#5371FF',
    primaryHover: '#4360ee',
    secondary: '#5095FC',
    secondaryHover: '#3e86f5',
    accent: '#7FD858',
    background: '#0c1322',
  },
  shiftPresets: [
    'Residential Clean',
    'Office / Commercial',
    'End of Tenancy',
    'Carpet & Deep Clean',
    'Builders Clean',
    'Rubbish Removal',
  ],
  defaultLocations: {
    base: 'Main Office / Base',
    firstJob: 'First Job Site',
    lastJob: 'Last Job Site',
    closing: 'Base / Closing Shift',
  },
};
