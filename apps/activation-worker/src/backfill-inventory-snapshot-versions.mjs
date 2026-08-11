import { init } from '@instantdb/admin';
import { instantSchema } from '@lumo/data';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');

const db = init({ appId, adminToken, schema: instantSchema });
const data = await db.query({
  inventoryLines: { session: { warehouse: {} }, product: {} },
  stockItems: { warehouse: {}, product: {} },
});

const linkedId = (value) => Array.isArray(value) ? value[0]?.id : value?.id;
const stockVersions = new Map(
  data.stockItems.map((item) => [
    `${linkedId(item.warehouse)}:${linkedId(item.product)}`,
    Number.isSafeInteger(item.version) && item.version >= 0 ? item.version : 0,
  ]),
);
const pending = data.inventoryLines.filter((line) => !Number.isSafeInteger(line.theoreticalStockVersion) || line.theoreticalStockVersion < 0);
const updates = pending.map((line) => {
  const warehouseId = linkedId(Array.isArray(line.session) ? line.session[0]?.warehouse : line.session?.warehouse);
  const productId = linkedId(line.product);
  return db.tx.inventoryLines[line.id].update({
    theoreticalStockVersion: stockVersions.get(`${warehouseId}:${productId}`) ?? 0,
  });
});

for (let offset = 0; offset < updates.length; offset += 100) {
  await db.transact(updates.slice(offset, offset + 100));
}

console.log(JSON.stringify({ status: 'ok', scanned: data.inventoryLines.length, updated: updates.length }));
