import { z } from 'zod';

export const phoneConfigSchema = z.object({
  country: z.string().min(2).max(3),
  example: z.string().min(1),
  help: z.string().min(1),
});

export const brandColorsSchema = z.object({
  primary: z.string().min(1),
  primaryHover: z.string().min(1),
  secondary: z.string().min(1),
  secondaryHover: z.string().min(1),
  accent: z.string().min(1),
  background: z.string().min(1),
});

export const defaultLocationsSchema = z.object({
  base: z.string().min(1),
  firstJob: z.string().min(1),
  lastJob: z.string().min(1),
  closing: z.string().min(1),
});

export const brandConfigSchema = z.object({
  companyName: z.string().min(1),
  shortName: z.string().min(1),
  appTitle: z.string().min(1),
  portalSubtitle: z.string().min(1),
  tagline: z.string().min(1),
  city: z.string().min(1),
  address: z.string(),
  supportEmail: z.string(),
  timezone: z.string().min(1),
  locale: z.string().min(1),
  phone: phoneConfigSchema,
  colors: brandColorsSchema,
  shiftPresets: z.array(z.string()),
  defaultLocations: defaultLocationsSchema,
});

export const seedMemberSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['manager', 'customer_service', 'service_team', 'staff']),
  phone: z.string().min(5),
  title: z.string(),
  // Optional override; otherwise SEED_MANAGER_PASSWORD / SEED_STAFF_PASSWORD or a generated one.
  initialPassword: z.string().min(6).optional(),
});

export const seedAvailabilityWindowSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  type: z.enum(['unavailable', 'all_day', 'custom']),
  start_time: z.string().optional(),
  finish_time: z.string().optional(),
});

export const seedConfigSchema = z.object({
  team: z.array(seedMemberSchema).min(1),
  availability: z.array(seedAvailabilityWindowSchema).length(7),
  demoData: z.boolean(),
});

export type BrandConfig = z.infer<typeof brandConfigSchema>;
export type SeedConfig = z.infer<typeof seedConfigSchema>;
export type SeedMember = z.infer<typeof seedMemberSchema>;
export type SeedAvailabilityWindow = z.infer<typeof seedAvailabilityWindowSchema>;
