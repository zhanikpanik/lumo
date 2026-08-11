import { init } from '@instantdb/admin';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');

const db = init({ appId, adminToken });
const entities = [
  'venues',
  'tables',
  'shifts',
  'orders',
  'stockItems',
  'deliveryDocuments',
  'writeOffDocuments',
  'transferDocuments',
  'inventorySessions',
];
const data = await db.query(Object.fromEntries(entities.map((entity) => [entity, {}])));
const updates = entities.flatMap((entity) =>
  (data[entity] ?? [])
    .filter((record) => !Number.isSafeInteger(record.version) || record.version < 0)
    .map((record) => db.tx[entity][record.id].update({ version: 0 })),
);

for (let offset = 0; offset < updates.length; offset += 100) {
  await db.transact(updates.slice(offset, offset + 100));
}

const counts = Object.fromEntries(entities.map((entity) => [
  entity,
  (data[entity] ?? []).filter((record) => !Number.isSafeInteger(record.version) || record.version < 0).length,
]));
console.log(JSON.stringify({ status: 'ok', updated: updates.length, counts }, null, 2));
