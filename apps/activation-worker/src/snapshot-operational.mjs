import { createHash } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { init } from '@instantdb/admin';
import schema from '../../../packages/data/src/instant.schema.ts';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const outputPath = resolve(
  process.cwd(),
  process.env.CUTOVER_SNAPSHOT_PATH ?? '../../report/cutover/development-operational-snapshot.json',
);
const entityNames = Object.keys(schema.entities).sort();
const query = Object.fromEntries(entityNames.map((name) => [name, {}]));
const db = init({ appId, adminToken, schema });
const data = await db.query(query);
const capturedAt = new Date().toISOString();
const snapshot = { appId, capturedAt, data };
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
const sha256 = createHash('sha256').update(serialized).digest('hex');

const numericFields = {
  stockItems: ['quantityMilli'],
  deliveryLines: ['quantityMilli', 'priceTiyin'],
  writeOffLines: ['quantityMilli'],
  transferLines: ['quantityMilli'],
  inventoryLines: ['theoreticalMilli', 'actualMilli', 'unitPriceTiyin', 'deltaMilli', 'deltaTiyin'],
};
const invalidNumericValues = [];
for (const [entity, fields] of Object.entries(numericFields)) {
  for (const record of data[entity] ?? []) {
    for (const field of fields) {
      if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
        invalidNumericValues.push({ entity, id: record.id, field, valueType: typeof record[field] });
      }
    }
  }
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, serialized, { mode: 0o600 });
await chmod(outputPath, 0o600);

const counts = Object.fromEntries(entityNames.map((name) => [name, data[name]?.length ?? 0]));
console.log(JSON.stringify({
  status: invalidNumericValues.length === 0 ? 'ok' : 'invalid',
  outputPath,
  sha256,
  capturedAt,
  counts,
  invalidNumericValues,
}, null, 2));

if (invalidNumericValues.length > 0) process.exitCode = 1;
