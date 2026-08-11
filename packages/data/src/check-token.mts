import { init } from '@instantdb/admin';

const appId = process.env.INSTANT_APP_ID!;
const adminToken = process.env.INSTANT_ADMIN_TOKEN!;
const db = init({ appId, adminToken });

// Query the dev token user
const res = await db.query({ devices: {} });
console.log('Devices:', JSON.stringify(res, null, 2).slice(0, 1500));
process.exit(0);
