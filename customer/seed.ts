import type { SeedConfig } from '../src/config/customerSchema.ts';

/**
 * Per-customer seed data, applied on first boot when the `users` table is empty.
 * SECURITY: this file contains initial account passwords — import it from
 * server code only, never from frontend code.
 */
export const seedConfig: SeedConfig = {
  team: [
    {
      name: 'Mike',
      role: 'manager',
      phone: '0210000012',
      title: 'Operations Manager',
      initialPassword: '***REMOVED***',
    },
    {
      name: 'StaffOne',
      role: 'staff',
      phone: '0210000016',
      title: 'Staff Cleaning Specialist',
      initialPassword: '***REMOVED***',
    },
    {
      name: 'StaffTwo',
      role: 'staff',
      phone: '0210000013',
      title: 'Staff Cleaning Specialist',
      initialPassword: '***REMOVED***',
    },
    {
      name: 'Anna',
      role: 'customer_service',
      phone: '0220000001',
      title: 'Customer Service',
      initialPassword: '***REMOVED***',
    },
    {
      name: 'Ben',
      role: 'service_team',
      phone: '0220000002',
      title: 'Service Team Coordinator',
      initialPassword: '***REMOVED***',
    },
    {
      name: 'David',
      role: 'staff',
      phone: '0210000011',
      title: 'Field Cleaning Specialist',
      initialPassword: '***REMOVED***',
    },
    {
      name: 'StaffThree',
      role: 'staff',
      phone: '0210000014',
      title: 'Staff Cleaning Specialist',
      initialPassword: '***REMOVED***',
    },
    {
      name: 'Saved',
      role: 'staff',
      phone: '0210000015',
      title: 'Staff Cleaning Specialist',
      initialPassword: '***REMOVED***',
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
