import { init } from '@instantdb/admin';
import { commandVersionResources, planCommandVersionRepairs } from './command-version-repair.mjs';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');

const db = init({ appId, adminToken });
const entities = commandVersionResources.map(({ entity }) => entity);
const data = await db.query({
  ...Object.fromEntries(entities.map((entity) => [entity, {}])),
  commandClaims: {},
});
const repairs = planCommandVersionRepairs(data);
const updates = repairs.map(({ entity, record, versionField, nextVersion }) =>
  db.tx[entity][record.id].update({ [versionField]: nextVersion }),
);

for (let offset = 0; offset < updates.length; offset += 100) {
  await db.transact(updates.slice(offset, offset + 100));
}

const counts = Object.fromEntries(commandVersionResources.map(({ entity }) => [
  entity,
  repairs.filter((repair) => repair.entity === entity).length,
]));
const staleAgainstClaims = repairs.filter((repair) => repair.staleClaim).length;
console.log(JSON.stringify({ status: 'ok', updated: updates.length, staleAgainstClaims, counts }, null, 2));
