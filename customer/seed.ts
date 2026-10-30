import type { SeedConfig } from '../src/config/customerSchema.ts';

/**
 * Per-customer seed data, applied on first boot when the `users` table is empty.
 * Initial passwords are NOT stored here: they come from SEED_MANAGER_PASSWORD /
 * SEED_STAFF_PASSWORD, or are generated and printed once in the boot log.
 * Import from server code only, never from frontend code.
 */
export const seedConfig: SeedConfig = {
  team: [
    {
      name: 'Alex',
      role: 'manager',
      phone: '0210000001',
      title: 'Operations Manager',
    },
    {
      name: 'Sam',
      role: 'staff',
      phone: '0210000002',
      title: 'Staff Cleaning Specialist',
    },
    {
      name: 'Jordan',
      role: 'staff',
      phone: '0210000003',
      title: 'Staff Cleaning Specialist',
    },
    {
      name: 'Taylor',
      role: 'customer_service',
      phone: '0210000004',
      title: 'Customer Service',
    },
    {
      name: 'Casey',
      role: 'service_team',
      phone: '0210000005',
      title: 'Service Team Coordinator',
    },
    {
      name: 'Riley',
      role: 'staff',
      phone: '0210000006',
      title: 'Field Cleaning Specialist',
    },
    {
      name: 'Morgan',
      role: 'staff',
      phone: '0210000007',
      title: 'Staff Cleaning Specialist',
    },
    {
      name: 'Jamie',
      role: 'staff',
      phone: '0210000008',
      title: 'Staff Cleaning Specialist',
    },
  ],
  availability: [
    { day_of_week: 0, type: 'all_day' },
    { day_of_week: 1, type: 'all_day' },
    { day_of_week: 2, type: 'all_day' },
    { day_of_week: 3, type: 'all_day' },
    { day_of_week: 4, type: 'all_day' },
    { day_of_week: 5, type: 'custom', start_time: '08:00', finish_time: '16:00' },
    { day_of_week: 6, type: 'unavailable' },
  ],
  demoData: false,
};
