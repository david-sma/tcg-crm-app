import { db } from '../db/index.ts';
import { users, shiftReports, weeklyTimesheets } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { hashPassword, normalizePhone } from './crypto.ts';
import { saveAvailabilityVersion } from './availability.ts';
import { getCurrentWeekMonday, getOffsetWeekMonday } from './timezone.ts';
import { recalculateWeeklyTimesheet } from './timesheet.ts';
import crypto from 'crypto';

export async function bootstrapInitialData() {
  const existingUsers = await db.select().from(users).limit(1);

  // If users already exist in Cloud SQL database, keep existing data intact
  if (existingUsers.length > 0) {
    return;
  }

  console.log('Bootstrapping initial team members into Cloud SQL database...');
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
}

export async function seedMockTimesheetData() {
  try {
    const existingReports = await db.select().from(shiftReports).limit(5);
    if (existingReports.length > 0) {
      // Data already seeded
      return;
    }

    console.log('Seeding mock shift reports & weekly timesheets...');
    const allUsers = await db.select().from(users);
    const userMap = new Map<string, any>();
    for (const u of allUsers) {
      userMap.set(u.name, u);
    }

    const staffOne = userMap.get('StaffOne');
    const staffTwo = userMap.get('StaffTwo');
    const david = userMap.get('David');
    const staffThree = userMap.get('StaffThree');
    const saved = userMap.get('Saved');
    const mike = userMap.get('Mike');

    if (!staffOne || !staffTwo || !david) {
      console.log('Staff members not yet created, skipping timesheet seed.');
      return;
    }

    const currentMonday = getCurrentWeekMonday(); // 2026-08-31
    const lastMonday = getOffsetWeekMonday(-1);   // 2026-08-24
    const nowIso = new Date().toISOString();

    // ----------------------------------------------------
    // 1. CURRENT WEEK (2026-08-31) - Active & Recent Shifts
    // ----------------------------------------------------

    // StaffOne: Mon completed (8.0h), Tue in progress
    await db.insert(shiftReports).values([
      {
        id: crypto.randomUUID(),
        user_id: staffOne.id,
        shift_date: currentMonday, // Monday 2026-08-31
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: `${currentMonday}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: 'Base / Closing Shift',
        break_minutes: 30,
        worked_with: JSON.stringify(['StaffTwo', 'David']),
        staff_notes: 'Completed office & commercial cleans.',
        status: 'completed',
        total_worked_minutes: 480, // 8.5h - 30m = 8.0h
        created_at: `${currentMonday}T07:30:00.000Z`,
        updated_at: `${currentMonday}T16:00:00.000Z`,
      },
      {
        id: crypto.randomUUID(),
        user_id: staffOne.id,
        shift_date: '2026-09-01', // Tuesday 2026-09-01
        week_start_date: currentMonday,
        day_of_week: 1,
        clock_in_at: `2026-09-01T07:45:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: null,
        break_minutes: 0,
        worked_with: JSON.stringify(['David']),
        staff_notes: 'Morning departure to Takapuna client site.',
        status: 'in_progress',
        total_worked_minutes: 0,
        created_at: `2026-09-01T07:45:00.000Z`,
        updated_at: `2026-09-01T07:45:00.000Z`,
      },
    ]);

    // StaffTwo: Mon completed (8.0h), Tue completed (8.0h)
    await db.insert(shiftReports).values([
      {
        id: crypto.randomUUID(),
        user_id: staffTwo.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: `${currentMonday}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: 'Base / Closing Shift',
        break_minutes: 30,
        worked_with: JSON.stringify(['StaffOne', 'David']),
        staff_notes: 'Standard route with StaffOne.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T07:30:00.000Z`,
        updated_at: `${currentMonday}T16:00:00.000Z`,
      },
      {
        id: crypto.randomUUID(),
        user_id: staffTwo.id,
        shift_date: '2026-09-01',
        week_start_date: currentMonday,
        day_of_week: 1,
        clock_in_at: `2026-09-01T08:00:00.000Z`,
        clock_in_type: 'first_job',
        clock_in_location: 'Newmarket Medical Centre',
        clock_out_at: `2026-09-01T16:30:00.000Z`,
        clock_out_type: 'last_job',
        clock_out_location: 'Ponsonby Clinic',
        break_minutes: 30,
        worked_with: JSON.stringify(['StaffThree']),
        staff_notes: 'Full clinical disinfection completed.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `2026-09-01T08:00:00.000Z`,
        updated_at: `2026-09-01T16:30:00.000Z`,
      },
    ]);

    // David: Mon completed (8.0h), Tue in progress
    await db.insert(shiftReports).values([
      {
        id: crypto.randomUUID(),
        user_id: david.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: `${currentMonday}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: 'Base / Closing Shift',
        break_minutes: 30,
        worked_with: JSON.stringify(['StaffOne', 'StaffTwo']),
        staff_notes: 'Carpet extraction and high dusting.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T07:30:00.000Z`,
        updated_at: `${currentMonday}T16:00:00.000Z`,
      },
      {
        id: crypto.randomUUID(),
        user_id: david.id,
        shift_date: '2026-09-01',
        week_start_date: currentMonday,
        day_of_week: 1,
        clock_in_at: `2026-09-01T07:45:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: null,
        break_minutes: 0,
        worked_with: JSON.stringify(['StaffOne']),
        staff_notes: 'Assisting team on Takapuna job.',
        status: 'in_progress',
        total_worked_minutes: 0,
        created_at: `2026-09-01T07:45:00.000Z`,
        updated_at: `2026-09-01T07:45:00.000Z`,
      },
    ]);

    if (staffThree) {
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: staffThree.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T08:00:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: `${currentMonday}T16:30:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: 'Base / Closing Shift',
        break_minutes: 30,
        worked_with: JSON.stringify(['Saved']),
        staff_notes: 'Deep sanitation shift.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T08:00:00.000Z`,
        updated_at: `${currentMonday}T16:30:00.000Z`,
      });
    }

    if (saved) {
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: saved.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T08:00:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: `${currentMonday}T16:30:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: 'Base / Closing Shift',
        break_minutes: 30,
        worked_with: JSON.stringify(['StaffThree']),
        staff_notes: 'Commercial kitchen deep clean.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T08:00:00.000Z`,
        updated_at: `${currentMonday}T16:30:00.000Z`,
      });
    }

    // ----------------------------------------------------
    // 2. PREVIOUS WEEK (2026-08-24) - Completed & Timesheets
    // ----------------------------------------------------

    // Days Mon-Fri for last week
    const lastWeekDates = [
      '2026-08-24', // Mon
      '2026-08-25', // Tue
      '2026-08-26', // Wed
      '2026-08-27', // Thu
      '2026-08-28', // Fri
    ];

    // StaffOne Mon-Fri (40.0h) - Approved
    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
      const dStr = lastWeekDates[dayIndex];
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: staffOne.id,
        shift_date: dStr,
        week_start_date: lastMonday,
        day_of_week: dayIndex,
        clock_in_at: `${dStr}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: `${dStr}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: 'Base / Closing Shift',
        break_minutes: 30,
        worked_with: JSON.stringify(['StaffTwo', 'David']),
        staff_notes: 'Scheduled regular cleaning shift.',
        status: 'manager_approved',
        total_worked_minutes: 480,
        created_at: `${dStr}T07:30:00.000Z`,
        updated_at: `${dStr}T16:00:00.000Z`,
      });
    }

    // Create Approved weekly timesheet for StaffOne for last week
    await db.insert(weeklyTimesheets).values({
      id: crypto.randomUUID(),
      user_id: staffOne.id,
      week_start_date: lastMonday,
      staff_signed_name: staffOne.name,
      staff_signed_at: '2026-08-28T16:30:00.000Z',
      supervisor_signed_name: mike?.name || 'Mike',
      supervisor_signed_at: '2026-08-29T09:00:00.000Z',
      supervisor_id: mike?.id,
      status: 'approved',
      total_worked_hours: '40.00',
      manager_notes: 'Excellent performance and attendance.',
      created_at: '2026-08-28T16:30:00.000Z',
      updated_at: '2026-08-29T09:00:00.000Z',
    });

    // StaffTwo Mon-Fri (37.5h) - Submitted (Pending approval)
    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
      const dStr = lastWeekDates[dayIndex];
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: staffTwo.id,
        shift_date: dStr,
        week_start_date: lastMonday,
        day_of_week: dayIndex,
        clock_in_at: `${dStr}T08:00:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: `${dStr}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: 'Base / Closing Shift',
        break_minutes: 30,
        worked_with: JSON.stringify(['StaffOne']),
        staff_notes: 'Regular scheduled shift.',
        status: 'completed',
        total_worked_minutes: 450, // 7.5 hrs
        created_at: `${dStr}T08:00:00.000Z`,
        updated_at: `${dStr}T16:00:00.000Z`,
      });
    }

    // Create Submitted weekly timesheet for StaffTwo for last week
    await db.insert(weeklyTimesheets).values({
      id: crypto.randomUUID(),
      user_id: staffTwo.id,
      week_start_date: lastMonday,
      staff_signed_name: staffTwo.name,
      staff_signed_at: '2026-08-29T10:15:00.000Z',
      supervisor_signed_name: null,
      supervisor_signed_at: null,
      status: 'submitted',
      total_worked_hours: '37.50',
      created_at: '2026-08-29T10:15:00.000Z',
      updated_at: '2026-08-29T10:15:00.000Z',
    });

    // David Mon-Fri (40.0h) - Draft
    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
      const dStr = lastWeekDates[dayIndex];
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: david.id,
        shift_date: dStr,
        week_start_date: lastMonday,
        day_of_week: dayIndex,
        clock_in_at: `${dStr}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: 'Main Office / Base',
        clock_out_at: `${dStr}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: 'Base / Closing Shift',
        break_minutes: 30,
        worked_with: JSON.stringify(['StaffOne', 'StaffTwo']),
        staff_notes: 'Standard shifts.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${dStr}T07:30:00.000Z`,
        updated_at: `${dStr}T16:00:00.000Z`,
      });
    }

    // Recalculate timesheets for current week for all staff
    for (const member of [staffOne, staffTwo, david, staffThree, saved]) {
      if (member) {
        await recalculateWeeklyTimesheet(member.id, currentMonday);
      }
    }

    console.log('Mock shift reports & weekly timesheets seeded successfully!');
  } catch (seedErr) {
    console.error('Error seeding mock timesheet data:', seedErr);
  }
}
