import { init } from '@instantdb/admin';
import schema, { type AppSchema } from './instant.schema.js';

const appId = process.env.INSTANT_APP_ID!;
const adminToken = process.env.INSTANT_ADMIN_TOKEN!;
const db = init<AppSchema>({ appId, adminToken });

const res = await db.query({ employeePinCredentials: {} });
console.log('Result:', JSON.stringify(res, null, 2).slice(0, 2000));
process.exit(0);
