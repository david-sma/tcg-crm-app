import { db } from '../db/index.ts';
import { users, shiftReports, weeklyTimesheets } from '../db/schema.ts';
import { getCurrentWeekMonday, getOffsetWeekMonday, getWeekDays } from './timezone.ts';
import { recalculateWeeklyTimesheet } from './timesheet.ts';
import { getAppSettings } from '../../src/config/appSettings.ts';
import crypto from 'crypto';

/**
 * Seeds generic demo shift reports + weekly timesheets for testing/demos.
 * Uses the actual seeded users (first manager + first staff members) and the
 * configured default locations, so it works for any customer. Only enabled
 * when `demoData: true` in customer/seed.ts.
 */
export async function seedMockTimesheetData() {
  try {
    const existingReports = await db.select().from(shiftReports).limit(5);
    if (existingReports.length > 0) {
      return;
    }

    console.log('Seeding demo shift reports & weekly timesheets...');
    const loc = getAppSettings().defaultLocations;

    const allUsers = await db.select().from(users);
    const manager = allUsers.find((u) => u.role === 'manager');
    const staffList = allUsers.filter((u) => u.role === 'staff' || u.role === 'team_leader');

    const [staffA, staffB, staffC, staffD, staffE] = staffList;

    if (!staffA || !staffB || !staffC) {
      console.log('Staff members not yet created, skipping demo timesheet seed.');
      return;
    }

    const currentMonday = getCurrentWeekMonday();
    const lastMonday = getOffsetWeekMonday(-1);
    const currentWeekDays = getWeekDays(currentMonday);
    const tuesdayStr = currentWeekDays[1].dateStr;

    // ----------------------------------------------------
    // 1. CURRENT WEEK - Active & Recent Shifts
    // ----------------------------------------------------

    await db.insert(shiftReports).values([
      {
        id: crypto.randomUUID(),
        user_id: staffA.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: `${currentMonday}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: loc.closing,
        break_minutes: 30,
        worked_with: JSON.stringify([staffB.name, staffC.name]),
        staff_notes: 'Completed scheduled shifts.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T07:30:00.000Z`,
        updated_at: `${currentMonday}T16:00:00.000Z`,
      },
      {
        id: crypto.randomUUID(),
        user_id: staffA.id,
        shift_date: tuesdayStr,
        week_start_date: currentMonday,
        day_of_week: 1,
        clock_in_at: `${tuesdayStr}T07:45:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: null,
        break_minutes: 0,
        worked_with: JSON.stringify([staffC.name]),
        staff_notes: `Morning departure to ${loc.firstJob}.`,
        status: 'in_progress',
        total_worked_minutes: 0,
        created_at: `${tuesdayStr}T07:45:00.000Z`,
        updated_at: `${tuesdayStr}T07:45:00.000Z`,
      },
    ]);

    await db.insert(shiftReports).values([
      {
        id: crypto.randomUUID(),
        user_id: staffB.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: `${currentMonday}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: loc.closing,
        break_minutes: 30,
        worked_with: JSON.stringify([staffA.name, staffC.name]),
        staff_notes: 'Scheduled route completed.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T07:30:00.000Z`,
        updated_at: `${currentMonday}T16:00:00.000Z`,
      },
      {
        id: crypto.randomUUID(),
        user_id: staffB.id,
        shift_date: tuesdayStr,
        week_start_date: currentMonday,
        day_of_week: 1,
        clock_in_at: `${tuesdayStr}T08:00:00.000Z`,
        clock_in_type: 'first_job',
        clock_in_location: loc.firstJob,
        clock_out_at: `${tuesdayStr}T16:30:00.000Z`,
        clock_out_type: 'last_job',
        clock_out_location: loc.lastJob,
        break_minutes: 30,
        worked_with: JSON.stringify([staffD ? staffD.name : staffE?.name].filter(Boolean)),
        staff_notes: 'Full job list completed.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${tuesdayStr}T08:00:00.000Z`,
        updated_at: `${tuesdayStr}T16:30:00.000Z`,
      },
    ]);

    await db.insert(shiftReports).values([
      {
        id: crypto.randomUUID(),
        user_id: staffC.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: `${currentMonday}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: loc.closing,
        break_minutes: 30,
        worked_with: JSON.stringify([staffA.name, staffB.name]),
        staff_notes: 'Scheduled shift completed.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T07:30:00.000Z`,
        updated_at: `${currentMonday}T16:00:00.000Z`,
      },
      {
        id: crypto.randomUUID(),
        user_id: staffC.id,
        shift_date: tuesdayStr,
        week_start_date: currentMonday,
        day_of_week: 1,
        clock_in_at: `${tuesdayStr}T07:45:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: null,
        break_minutes: 0,
        worked_with: JSON.stringify([staffA.name]),
        staff_notes: `Assisting team at ${loc.firstJob}.`,
        status: 'in_progress',
        total_worked_minutes: 0,
        created_at: `${tuesdayStr}T07:45:00.000Z`,
        updated_at: `${tuesdayStr}T07:45:00.000Z`,
      },
    ]);

    if (staffD) {
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: staffD.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T08:00:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: `${currentMonday}T16:30:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: loc.closing,
        break_minutes: 30,
        worked_with: JSON.stringify([staffE?.name].filter(Boolean)),
        staff_notes: 'Deep sanitation shift.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T08:00:00.000Z`,
        updated_at: `${currentMonday}T16:30:00.000Z`,
      });
    }

    if (staffE) {
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: staffE.id,
        shift_date: currentMonday,
        week_start_date: currentMonday,
        day_of_week: 0,
        clock_in_at: `${currentMonday}T08:00:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: `${currentMonday}T16:30:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: loc.closing,
        break_minutes: 30,
        worked_with: JSON.stringify([staffD?.name].filter(Boolean)),
        staff_notes: 'Scheduled deep clean.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${currentMonday}T08:00:00.000Z`,
        updated_at: `${currentMonday}T16:30:00.000Z`,
      });
    }

    // ----------------------------------------------------
    // 2. PREVIOUS WEEK - Completed & Timesheets
    // ----------------------------------------------------

    const lastWeekDates = getWeekDays(lastMonday).slice(0, 5).map((d) => d.dateStr);

    // Staff A Mon-Fri (40.0h) - Approved
    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
      const dStr = lastWeekDates[dayIndex];
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: staffA.id,
        shift_date: dStr,
        week_start_date: lastMonday,
        day_of_week: dayIndex,
        clock_in_at: `${dStr}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: `${dStr}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: loc.closing,
        break_minutes: 30,
        worked_with: JSON.stringify([staffB.name, staffC.name]),
        staff_notes: 'Scheduled regular shift.',
        status: 'manager_approved',
        total_worked_minutes: 480,
        created_at: `${dStr}T07:30:00.000Z`,
        updated_at: `${dStr}T16:00:00.000Z`,
      });
    }

    await db.insert(weeklyTimesheets).values({
      id: crypto.randomUUID(),
      user_id: staffA.id,
      week_start_date: lastMonday,
      staff_signed_name: staffA.name,
      staff_signed_at: `${lastWeekDates[4]}T16:30:00.000Z`,
      supervisor_signed_name: manager?.name || null,
      supervisor_signed_at: `${lastWeekDates[4]}T18:00:00.000Z`,
      supervisor_id: manager?.id,
      status: 'approved',
      total_worked_hours: '40.00',
      manager_notes: 'Excellent performance and attendance.',
      created_at: `${lastWeekDates[4]}T16:30:00.000Z`,
      updated_at: `${lastWeekDates[4]}T18:00:00.000Z`,
    });

    // Staff B Mon-Fri (37.5h) - Submitted (Pending approval)
    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
      const dStr = lastWeekDates[dayIndex];
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: staffB.id,
        shift_date: dStr,
        week_start_date: lastMonday,
        day_of_week: dayIndex,
        clock_in_at: `${dStr}T08:00:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: `${dStr}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: loc.closing,
        break_minutes: 30,
        worked_with: JSON.stringify([staffA.name]),
        staff_notes: 'Regular scheduled shift.',
        status: 'completed',
        total_worked_minutes: 450,
        created_at: `${dStr}T08:00:00.000Z`,
        updated_at: `${dStr}T16:00:00.000Z`,
      });
    }

    await db.insert(weeklyTimesheets).values({
      id: crypto.randomUUID(),
      user_id: staffB.id,
      week_start_date: lastMonday,
      staff_signed_name: staffB.name,
      staff_signed_at: `${lastWeekDates[4]}T17:15:00.000Z`,
      supervisor_signed_name: null,
      supervisor_signed_at: null,
      status: 'submitted',
      total_worked_hours: '37.50',
      created_at: `${lastWeekDates[4]}T17:15:00.000Z`,
      updated_at: `${lastWeekDates[4]}T17:15:00.000Z`,
    });

    // Staff C Mon-Fri (40.0h) - Draft
    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
      const dStr = lastWeekDates[dayIndex];
      await db.insert(shiftReports).values({
        id: crypto.randomUUID(),
        user_id: staffC.id,
        shift_date: dStr,
        week_start_date: lastMonday,
        day_of_week: dayIndex,
        clock_in_at: `${dStr}T07:30:00.000Z`,
        clock_in_type: 'base_arrival',
        clock_in_location: loc.base,
        clock_out_at: `${dStr}T16:00:00.000Z`,
        clock_out_type: 'closing_shift',
        clock_out_location: loc.closing,
        break_minutes: 30,
        worked_with: JSON.stringify([staffA.name, staffB.name]),
        staff_notes: 'Standard shifts.',
        status: 'completed',
        total_worked_minutes: 480,
        created_at: `${dStr}T07:30:00.000Z`,
        updated_at: `${dStr}T16:00:00.000Z`,
      });
    }

    // Recalculate timesheets for current week for all staff
    for (const member of staffList) {
      await recalculateWeeklyTimesheet(member.id, currentMonday);
    }

    console.log('Demo shift reports & weekly timesheets seeded successfully!');
  } catch (seedErr) {
    console.error('Error seeding demo timesheet data:', seedErr);
  }
}
