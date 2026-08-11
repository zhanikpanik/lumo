import { init } from '@instantdb/admin';
import schema, { type AppSchema } from './instant.schema.js';

const appId = process.env.INSTANT_APP_ID!;
const adminToken = process.env.INSTANT_ADMIN_TOKEN!;
const db = init<AppSchema>({ appId, adminToken, schema });

const venueId = 'a9c5ebae-e754-53ac-88a9-30e0014814b1';

// Check venue exists
const venueRes = await db.query({ venues: { $: { where: { id: venueId } } } });
console.log('Venue:', venueRes.venues.length ? 'found' : 'NOT FOUND');

// Check employees linked to venue
const empRes = await db.query({
  venues: {
    $: { where: { id: venueId } },
    employees: { pinCredential: {} },
  },
});
console.log('Query result:', JSON.stringify(empRes, null, 2));

// Also check all employees
const allEmp = await db.query({ employees: { venue: {} } });
console.log('\nAll employees:', allEmp.employees.length);
for (const e of allEmp.employees) {
  console.log(`  ${e.displayName} (${e.role}) venue=${e.venue?.id ?? 'none'} status=${e.status}`);
}

process.exit(0);
