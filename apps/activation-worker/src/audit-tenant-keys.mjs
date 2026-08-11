import { init } from '@instantdb/admin';

const { INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: adminToken } = process.env;
if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const db = init({ appId, adminToken });

// Every persistent record whose authorization path starts at a venue must carry
// the same scalar venueId before that scalar becomes schema-required.
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

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function linkedVenueId(record, path) {
  return path.split('.').reduce((node, key) => first(node?.[key]), record)?.id;
}

const query = Object.fromEntries(
  Object.entries(entities).map(([entity, path]) => {
    const relation = path.split('.').reduceRight((nested, key) => ({ [key]: nested }), {});
    return [entity, relation];
  }),
);
let data;
try {
  data = await db.query(query);
} catch {
  throw new Error('InstantDB admin credentials were rejected; refresh INSTANT_ADMIN_TOKEN before auditing tenant keys.');
}
const failures = [];

for (const [entity, path] of Object.entries(entities)) {
  for (const record of data[entity] ?? []) {
    const linkedId = linkedVenueId(record, path);
    if (!linkedId || !record.venueId || record.venueId !== linkedId) {
      failures.push({ entity, id: record.id, venueId: record.venueId ?? null, linkedVenueId: linkedId ?? null });
    }
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'ok', entities: Object.keys(entities).length }, null, 2));
}
