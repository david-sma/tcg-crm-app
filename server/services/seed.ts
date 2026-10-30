import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { hashPassword, normalizePhone } from './crypto.ts';
import { saveAvailabilityVersion } from './availability.ts';
import { getCurrentWeekMonday } from './timezone.ts';
import { loadCompanySettings } from './companySettings.ts';
import { loadSeedConfig } from '../../src/config/loadCustomer.ts';
import { WORKER_ROLES } from '../../src/config/roles.ts';
import type { SeedAvailabilityWindow } from '../../src/config/customerSchema.ts';
import type { DayOfWeekIndex } from '../../src/types/index.ts';
import crypto from 'crypto';

export async function bootstrapInitialData() {
  // Apply pending schema/data migrations to whichever database the env points at.
  // Databases built with `drizzle-kit push` are baselined automatically on first run.
  await runMigrations();

  // Branding/settings row is seeded from customer/brand.ts when missing,
  // then loaded into memory for server-side logic (timezone, phone country).
  await loadCompanySettings();

  const existingUsers = await db.select().from(users).limit(1);

  // If users already exist in the database, keep existing data intact
  if (existingUsers.length > 0) {
    return;
  }

  await seedFreshTeam();
}

/**
 * Resolves a seeded member's first password without ever committing it to the repo:
 * explicit config value, then role-level env var, then a random one printed once.
 */
function resolveInitialPassword(member: { role: string; initialPassword?: string }): {
  password: string;
  generated: boolean;
} {
  if (member.initialPassword) return { password: member.initialPassword, generated: false };
  const envPassword =
    member.role === 'manager' ? process.env.SEED_MANAGER_PASSWORD : process.env.SEED_STAFF_PASSWORD;
  if (envPassword && envPassword.length >= 6) return { password: envPassword, generated: false };
  return { password: crypto.randomBytes(9).toString('base64url'), generated: true };
}

async function seedFreshTeam() {
  const seed = loadSeedConfig();
  const nowIso = new Date().toISOString();
  const currentMonday = getCurrentWeekMonday();

  console.log(`Bootstrapping initial team members from customer/seed.ts (${seed.team.length} members)...`);

  for (const member of seed.team) {
    const userId = crypto.randomUUID();
    const phoneNorm = normalizePhone(member.phone).e164;
    const { password, generated } = resolveInitialPassword(member);
    const passwordHash = await hashPassword(password);
    if (generated) {
      console.log(`  Generated initial password for ${member.name} (${phoneNorm}): ${password}`);
    }

    await db.insert(users).values({
      id: userId,
      phone_e164: phoneNorm,
      password_hash: passwordHash,
      role: member.role,
      name: member.name,
      notes: member.title,
      is_active: true,
      password_version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Provide default open availability for staff and team leaders
    if (WORKER_ROLES.includes(member.role as never)) {
      await saveAvailabilityVersion({
        userId: userId,
        mondayStr: currentMonday,
        submittedByUserId: userId,
        windows: seed.availability.map((w: SeedAvailabilityWindow) => ({
          day_of_week: w.day_of_week as DayOfWeekIndex,
          type: w.type,
          start_time: w.start_time,
          finish_time: w.finish_time,
        })),
      });
    }
  }

  const roster = seed.team.map((m) => `${m.name}${m.role === 'manager' ? ' (Manager)' : ''}`).join(', ');
  console.log(`Seed completed successfully for team: ${roster}.`);
}
