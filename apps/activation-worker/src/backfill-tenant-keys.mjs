import { init } from '@instantdb/admin';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');

const db = init({ appId, adminToken });
const entities = {
  employees: 'venue', categories: 'venue', products: 'venue', modifierGroups: 'venue',
  modifiers: 'group.venue', recipeItems: 'dish.venue', zones: 'venue', tables: 'venue',
  shifts: 'venue', orders: 'venue', orderItems: 'order.venue', orderItemModifiers: 'orderItem.order.venue',
  kitchenTickets: 'venue', payments: 'venue', cashMovements: 'venue',
  inventoryMovements: 'venue', fiscalReceipts: 'venue', auditEvents: 'venue',
  orderEvents: 'venue', venueDailyStats: 'venue', warehouses: 'venue', stockItems: 'warehouse.venue',
  deliveryDocuments: 'venue', deliveryLines: 'document.venue', writeOffDocuments: 'venue',
  writeOffLines: 'document.venue', transferDocuments: 'venue', transferLines: 'document.venue',
  inventorySessions: 'venue', inventoryLines: 'session.venue',
};

function first(value) { return Array.isArray(value) ? value[0] : value; }
function linkedVenueId(record, path) {
  return path.split('.').reduce((node, key) => first(node?.[key]), record)?.id;
}
function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

const query = Object.fromEntries(Object.entries(entities).map(([entity, path]) => {
  const relation = path.split('.').reduceRight((nested, key) => ({ [key]: nested }), {});
  return [entity, relation];
}));
const data = await db.query(query);
const updates = [];
const unresolved = [];
const conflicts = [];

for (const [entity, path] of Object.entries(entities)) {
  for (const record of data[entity] ?? []) {
    const venueId = linkedVenueId(record, path);
    if (!venueId) {
      unresolved.push({ entity, id: record.id, path });
    } else if (record.venueId && record.venueId !== venueId) {
      conflicts.push({ entity, id: record.id, venueId: record.venueId, linkedVenueId: venueId });
    } else if (!record.venueId) {
      updates.push({ entity, id: record.id, venueId });
    }
  }
}

if (conflicts.length) {
  console.error(JSON.stringify({ status: 'blocked', conflicts, unresolved }, null, 2));
  process.exitCode = 1;
} else {
  for (const batch of chunks(updates, 100)) {
    await db.transact(batch.map(({ entity, id, venueId }) => db.tx[entity][id].update({ venueId })));
  }
  console.log(JSON.stringify({ status: unresolved.length ? 'partial' : 'ok', updated: updates.length, unresolved }, null, 2));
  if (unresolved.length) process.exitCode = 1;
}
