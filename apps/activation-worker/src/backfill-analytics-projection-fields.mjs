import { createHash } from 'node:crypto';
import { init } from '@instantdb/admin';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
const apply = process.env.ANALYTICS_BACKFILL_APPLY === '1';
const db = init({ appId, adminToken });
const result = await db.query({ venueDailyStats: { venue: {} } });
const seen = new Set();
const steps = [];

for (const stats of result.venueDailyStats) {
  const venue = Array.isArray(stats.venue) ? stats.venue[0] : stats.venue;
  if (!venue?.id || typeof stats.day !== 'string') {
    throw new Error(`Daily stats ${stats.id} is missing venue or day`);
  }
  const statsKey = `${venue.id}:${stats.day}`;
  if (seen.has(statsKey)) throw new Error(`Duplicate daily stats key: ${statsKey}`);
  seen.add(statsKey);
  const sourceCount = Number.isSafeInteger(stats.sourceCount) ? stats.sourceCount : 0;
  const sourceHash = typeof stats.sourceHash === 'string'
    ? stats.sourceHash
    : `legacy:${createHash('sha256').update(JSON.stringify({
        revenueTiyin: stats.revenueTiyin,
        orderCount: stats.orderCount,
        foodCostTiyin: stats.foodCostTiyin,
        cashExpenseTiyin: stats.cashExpenseTiyin,
      })).digest('hex')}`;
  steps.push(db.tx.venueDailyStats[stats.id].update({
    statsKey,
    sourceCount,
    sourceHash,
    version: Number.isSafeInteger(stats.version) ? stats.version : 0,
  }));
}

if (apply) {
  for (let offset = 0; offset < steps.length; offset += 100) {
    await db.transact(steps.slice(offset, offset + 100));
  }
}
console.log(JSON.stringify({ status: apply ? 'applied' : 'dry-run', rows: steps.length }, null, 2));
