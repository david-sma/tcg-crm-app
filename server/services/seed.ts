import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { hashPassword, normalizePhone } from './crypto.ts';
import { saveAvailabilityVersion } from './availability.ts';
import { getCurrentWeekMonday, getOffsetWeekMonday } from './timezone.ts';
import crypto from 'crypto';

export async function bootstrapInitialData() {
  const existingUsers = await db.select().from(users);

  // If users already exist, check if Mike or other members need updating/syncing
  if (existingUsers.length > 0) {
    // If old placeholder users exist or phone numbers don't match, sync the exact team
    await syncExactTeam();
    return;
  }

  console.log('Bootstrapping initial team members into database...');
  await seedFreshTeam();
}

const TEAM_MEMBERS = [
  // 1. Manager
  {
    name: 'Mike',
    role: 'manager' as const,
    rawPhone: '0210000012',
    notes: 'Operations Manager',
  },
  // 2. Staff Members
  {
    name: 'StaffOne',
    role: 'staff' as const,
    rawPhone: '0210000016',
    notes: 'Staff Cleaning Specialist',
  },
  {
    name: 'StaffTwo',
    role: 'staff' as const,
    rawPhone: '0210000013',
    notes: 'Staff Cleaning Specialist',
  },
  {
    name: 'David',
    role: 'staff' as const,
    rawPhone: '0210000011',
    notes: 'Staff Cleaning Specialist',
  },
  {
    name: 'StaffThree',
    role: 'staff' as const,
    rawPhone: '0210000014',
    notes: 'Staff Cleaning Specialist',
  },
  {
    name: 'Saved',
    role: 'staff' as const,
    rawPhone: '0210000015',
    notes: 'Staff Cleaning Specialist',
  },
];

async function seedFreshTeam() {
  const nowIso = new Date().toISOString();
  const currentMonday = getCurrentWeekMonday();

  for (const member of TEAM_MEMBERS) {
    const userId = crypto.randomUUID();
    const phoneNorm = normalizePhone(member.rawPhone).e164;
    const defaultPassword = member.role === 'manager' ? '***REMOVED***' : '***REMOVED***';
    const passwordHash = await hashPassword(defaultPassword);

    await db.insert(users).values({
      id: userId,
      phone_e164: phoneNorm,
      password_hash: passwordHash,
      role: member.role,
      name: member.name,
      notes: member.notes,
      is_active: true,
      password_version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Provide default open availability for staff
    if (member.role === 'staff') {
      await saveAvailabilityVersion({
        userId: userId,
        mondayStr: currentMonday,
        submittedByUserId: userId,
        windows: [
          { day_of_week: 0, type: 'all_day' },
          { day_of_week: 1, type: 'all_day' },
          { day_of_week: 2, type: 'all_day' },
          { day_of_week: 3, type: 'all_day' },
          { day_of_week: 4, type: 'all_day' },
          { day_of_week: 5, type: 'custom', start_time: '08:00', finish_time: '16:00' },
          { day_of_week: 6, type: 'unavailable' },
        ],
      });
    }
  }

  console.log('Seed completed successfully for team: Mike (Manager), StaffOne, StaffTwo, David, StaffThree, Saved.');
}

export async function syncExactTeam() {
  const nowIso = new Date().toISOString();
  const currentMonday = getCurrentWeekMonday();

  // Ensure each defined team member exists with correct role and phone
  for (const member of TEAM_MEMBERS) {
    const phoneNorm = normalizePhone(member.rawPhone).e164;
    const existing = await db.select().from(users).where(eq(users.phone_e164, phoneNorm));

    if (existing.length > 0) {
      // Update name & role if needed
      await db.update(users).set({
        name: member.name,
        role: member.role,
        notes: member.notes,
        is_active: true,
        updated_at: nowIso,
      }).where(eq(users.phone_e164, phoneNorm));
    } else {
      // Create missing member
      const userId = crypto.randomUUID();
      const defaultPassword = member.role === 'manager' ? '***REMOVED***' : '***REMOVED***';
      const passwordHash = await hashPassword(defaultPassword);

      await db.insert(users).values({
        id: userId,
        phone_e164: phoneNorm,
        password_hash: passwordHash,
        role: member.role,
        name: member.name,
        notes: member.notes,
        is_active: true,
        password_version: 1,
        created_at: nowIso,
        updated_at: nowIso,
      });

      if (member.role === 'staff') {
        await saveAvailabilityVersion({
          userId: userId,
          mondayStr: currentMonday,
          submittedByUserId: userId,
          windows: [
            { day_of_week: 0, type: 'all_day' },
            { day_of_week: 1, type: 'all_day' },
            { day_of_week: 2, type: 'all_day' },
            { day_of_week: 3, type: 'all_day' },
            { day_of_week: 4, type: 'all_day' },
            { day_of_week: 5, type: 'custom', start_time: '08:00', finish_time: '16:00' },
            { day_of_week: 6, type: 'unavailable' },
          ],
        });
      }
    }
  }

  // Deactivate or remove any old dummy accounts that are not in TEAM_MEMBERS
  const allowedPhones = new Set(TEAM_MEMBERS.map(m => normalizePhone(m.rawPhone).e164));
  const allCurrent = await db.select().from(users);
  for (const u of allCurrent) {
    if (!allowedPhones.has(u.phone_e164)) {
      await db.delete(users).where(eq(users.id, u.id));
    }
  }
}
