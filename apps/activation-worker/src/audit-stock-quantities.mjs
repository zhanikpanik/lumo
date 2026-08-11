import { init } from '@instantdb/admin';
import { instantSchema } from '@lumo/data';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');

const db = init({ appId, adminToken, schema: instantSchema });
const data = await db.query({
  stockItems: {},
  deliveryLines: {},
  writeOffLines: {},
  transferLines: {},
  inventoryLines: {},
  inventoryMovements: {},
});

const failures = [];
const checkInteger = (namespace, row, field, minimum) => {
  const value = row[field];
  if (!Number.isSafeInteger(value) || value < minimum) {
    failures.push({ namespace, id: row.id, field, value });
  }
};

for (const row of data.stockItems) checkInteger('stockItems', row, 'quantityMilli', 0);
for (const row of data.deliveryLines) checkInteger('deliveryLines', row, 'quantityMilli', 1);
for (const row of data.writeOffLines) checkInteger('writeOffLines', row, 'quantityMilli', 1);
for (const row of data.transferLines) checkInteger('transferLines', row, 'quantityMilli', 1);
for (const row of data.inventoryLines) {
  checkInteger('inventoryLines', row, 'theoreticalMilli', 0);
  checkInteger('inventoryLines', row, 'actualMilli', 0);
  checkInteger('inventoryLines', row, 'unitPriceTiyin', 0);
  checkInteger('inventoryLines', row, 'theoreticalStockVersion', 0);
}
for (const row of data.inventoryMovements) {
  if (!Number.isSafeInteger(row.quantityDeltaMilli) || (row.quantityDeltaMilli === 0 && row.reason !== 'opening_balance')) {
    failures.push({ namespace: 'inventoryMovements', id: row.id, field: 'quantityDeltaMilli', value: row.quantityDeltaMilli });
  }
}

console.log(JSON.stringify({
  status: failures.length === 0 ? 'ok' : 'invalid_quantities',
  counts: Object.fromEntries(Object.entries(data).map(([namespace, rows]) => [namespace, rows.length])),
  failures,
}, null, 2));
if (failures.length > 0) process.exitCode = 2;
