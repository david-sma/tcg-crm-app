import fs from 'fs';
import path from 'path';
import { brandConfig } from '../../customer/brand.ts';
import { seedConfig } from '../../customer/seed.ts';
import {
  brandConfigSchema,
  seedConfigSchema,
  type BrandConfig,
  type SeedConfig,
} from './customerSchema.ts';

export const CUSTOMER_DIR = path.join(process.cwd(), 'customer');

function formatIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

export function loadBrandConfig(): BrandConfig {
  const parsed = brandConfigSchema.safeParse(brandConfig);
  if (!parsed.success) {
    throw new Error(`Invalid customer/brand.ts configuration:\n${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

export function loadSeedConfig(): SeedConfig {
  const parsed = seedConfigSchema.safeParse(seedConfig);
  if (!parsed.success) {
    throw new Error(`Invalid customer/seed.ts configuration:\n${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

export function readCustomerAsset(fileName: 'logo.svg' | 'app-icon.svg'): string {
  const filePath = path.join(CUSTOMER_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing customer asset: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

export function readCustomerLogoSvg(): string {
  try {
    return readCustomerAsset('logo.svg');
  } catch {
    return '';
  }
}
