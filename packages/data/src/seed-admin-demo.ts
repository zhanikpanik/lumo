import { init } from '@instantdb/admin';
import schema, { type AppSchema } from './instant.schema.js';
import { deterministicId, TEST_VENUE_IDS as IDS } from './ids.js';

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_ADMIN_TOKEN;
if (!appId || !adminToken) {
  throw new Error('INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const db = init<AppSchema>({ appId, adminToken, schema });
const venueId = IDS.venue;
const deviceId = IDS.deviceTablet1;
const now = new Date();
type TransactionOperation = Exclude<Parameters<typeof db.transact>[0], unknown[]>;

function id(kind: string, ...parts: Array<string | number>): string {
  return deterministicId(`admin-demo-${kind}`, ...parts.map(String));
}

function localDate(daysAgo: number, hour: number, minute = 0): Date {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}


async function transactInChunks(ops: TransactionOperation[], size = 50): Promise<void> {
  for (let offset = 0; offset < ops.length; offset += size) {
    await db.transact(ops.slice(offset, offset + size));
  }
}

const categories = [
  { id: IDS.categoryCoffee, name: 'Кофе', color: '#4A2C2A' },
  { id: IDS.categoryTea, name: 'Чай', color: '#2A4A2A' },
  { id: id('category', 'breakfast'), name: 'Завтраки', color: '#D97706' },
  { id: id('category', 'bakery'), name: 'Выпечка', color: '#B45309' },
  { id: id('category', 'cold-drinks'), name: 'Холодные напитки', color: '#2563EB' },
];

const dishes = [
  { id: IDS.productEspresso, categoryId: IDS.categoryCoffee, name: 'Эспрессо', price: 15000, cost: 3500 },
  { id: IDS.productLatte, categoryId: IDS.categoryCoffee, name: 'Латте', price: 25000, cost: 7200 },
  { id: IDS.productTea, categoryId: IDS.categoryTea, name: 'Чай чёрный', price: 8000, cost: 1800 },
  { id: id('dish', 'cappuccino'), categoryId: IDS.categoryCoffee, name: 'Капучино', price: 22000, cost: 6100 },
  { id: id('dish', 'flat-white'), categoryId: IDS.categoryCoffee, name: 'Флэт уайт', price: 26000, cost: 6800 },
  { id: id('dish', 'raf'), categoryId: IDS.categoryCoffee, name: 'Раф', price: 28000, cost: 9500 },
  { id: id('dish', 'croissant'), categoryId: id('category', 'bakery'), name: 'Круассан', price: 18000, cost: 5200 },
  { id: id('dish', 'cheesecake'), categoryId: id('category', 'bakery'), name: 'Чизкейк', price: 30000, cost: 9800 },
  { id: id('dish', 'sandwich'), categoryId: id('category', 'breakfast'), name: 'Сэндвич с курицей', price: 35000, cost: 13200 },
  { id: id('dish', 'pancakes'), categoryId: id('category', 'breakfast'), name: 'Панкейки', price: 28000, cost: 7600 },
  { id: id('dish', 'lemonade'), categoryId: id('category', 'cold-drinks'), name: 'Лимонад', price: 20000, cost: 4200 },
  { id: id('dish', 'smoothie'), categoryId: id('category', 'cold-drinks'), name: 'Смузи', price: 28000, cost: 10200 },
];

const ingredients = [
  { id: IDS.productCoffeeBeans, name: 'Кофе в зёрнах', unit: 'g', cost: 120, threshold: 2_000_000 },
  { id: IDS.productMilk, name: 'Молоко 3.2%', unit: 'ml', cost: 8, threshold: 8_000_000 },
  { id: id('ingredient', 'cream'), name: 'Сливки 33%', unit: 'ml', cost: 35, threshold: 2_000_000 },
  { id: id('ingredient', 'flour'), name: 'Мука пшеничная', unit: 'g', cost: 6, threshold: 5_000_000 },
  { id: id('ingredient', 'butter'), name: 'Масло сливочное', unit: 'g', cost: 80, threshold: 1_500_000 },
  { id: id('ingredient', 'eggs'), name: 'Яйца', unit: 'pcs', cost: 1500, threshold: 30_000 },
  { id: id('ingredient', 'chicken'), name: 'Куриное филе', unit: 'g', cost: 45, threshold: 3_000_000 },
  { id: id('ingredient', 'cream-cheese'), name: 'Сыр творожный', unit: 'g', cost: 70, threshold: 2_000_000 },
  { id: id('ingredient', 'lemon'), name: 'Лимон', unit: 'g', cost: 25, threshold: 1_000_000 },
  { id: id('ingredient', 'berries'), name: 'Ягоды замороженные', unit: 'g', cost: 60, threshold: 1_000_000 },
];

const employees = [
  { id: IDS.employeeWaiter, name: 'Айжан', role: 'waiter' },
  { id: IDS.employeeCashier, name: 'Эрмек', role: 'cashier' },
  { id: id('employee', 'bekzhan'), name: 'Бекжан', role: 'waiter' },
  { id: id('employee', 'gulya'), name: 'Гуля', role: 'cashier' },
  { id: id('employee', 'daniyar'), name: 'Данияр', role: 'waiter' },
  { id: id('employee', 'aida'), name: 'Аида', role: 'manager' },
];

const warehouses = [
  { id: id('warehouse', 'bar'), name: 'Бар' },
  { id: id('warehouse', 'kitchen'), name: 'Кухня' },
];

const setupOps: TransactionOperation[] = [];
for (const [index, category] of categories.entries()) {
  setupOps.push(db.tx.categories[category.id]
    .update({ venueId, name: category.name, color: category.color, sortOrder: index + 1, status: 'active', createdAt: now.toISOString() })
    .link({ venue: venueId }));
}
for (const [index, dish] of dishes.entries()) {
  setupOps.push(db.tx.products[dish.id]
    .update({ venueId, name: dish.name, kind: 'dish', priceTiyin: dish.price, costTiyin: dish.cost, unit: 'portions', sortOrder: index + 1, status: 'active', version: 0, createdAt: now.toISOString() })
    .link({ venue: venueId, category: dish.categoryId }));
}
for (const [index, ingredient] of ingredients.entries()) {
  setupOps.push(db.tx.products[ingredient.id]
    .update({ venueId, name: ingredient.name, kind: 'ingredient', priceTiyin: 0, costTiyin: ingredient.cost, unit: ingredient.unit, lowStockThresholdMilli: ingredient.threshold, sortOrder: index + 1, status: 'active', version: 0, createdAt: now.toISOString() })
    .link({ venue: venueId }));
}
for (const employee of employees) {
  setupOps.push(db.tx.employees[employee.id]
    .update({ venueId, displayName: employee.name, role: employee.role, status: 'active', createdAt: now.toISOString() })
    .link({ venue: venueId }));
}
for (const warehouse of warehouses) {
  setupOps.push(db.tx.warehouses[warehouse.id]
    .update({ venueId, name: warehouse.name, createdAt: now.toISOString() })
    .link({ venue: venueId, products: ingredients.map((ingredient) => ingredient.id) }));
}

const zoneTerrace = id('zone', 'terrace');
setupOps.push(
  db.tx.zones[zoneTerrace]
    .update({ venueId, name: 'Веранда', gridCols: 6, gridRows: 4, sortOrder: 2, status: 'active', createdAt: now.toISOString() })
    .link({ venue: venueId }),
);
const tableIds: string[] = [IDS.table1, IDS.table2];
for (let index = 0; index < 8; index++) {
  const tableId = index < 2 ? tableIds[index] : id('table', index + 1);
  if (index >= 2) tableIds.push(tableId);
  const onTerrace = index >= 5;
  setupOps.push(db.tx.tables[tableId]
    .update({
      venueId,
      number: String(onTerrace ? 20 + index - 4 : index + 1),
      capacity: index % 3 === 0 ? 4 : 2,
      col: onTerrace ? (index - 5) * 2 : (index % 3) * 2,
      row: onTerrace ? 0 : Math.floor(index / 3) * 2,
      colSpan: 2,
      rowSpan: 2,
      size: index % 4 === 0 ? 'round' : 'square',
      status: index === 2 ? 'occupied' : 'free',
      createdAt: now.toISOString(),
      version: 0,
    })
    .link({ venue: venueId, zone: onTerrace ? zoneTerrace : IDS.zoneMain }));
}

const cashCategories = [
  ['Хозяйственные расходы', 'expense'],
  ['Доставка', 'expense'],
  ['Ремонт и обслуживание', 'expense'],
  ['Закупка вне склада', 'expense'],
  ['Возврат от поставщика', 'income'],
  ['Прочий приход', 'income'],
] as const;
for (const [index, [name, type]] of cashCategories.entries()) {
  setupOps.push(db.tx.cashTransactionCategories[id('cash-category', type, index)]
    .update({ venueId, name, type, sortOrder: index + 1, createdAt: now.toISOString() })
    .link({ venue: venueId }));
}

for (const [warehouseIndex, warehouse] of warehouses.entries()) {
  for (const [ingredientIndex, ingredient] of ingredients.entries()) {
    const quantity = warehouseIndex === 0
      ? [1_200_000, 6_500_000, 800_000, 0, 500_000, 0, 0, 0, 750_000, 400_000][ingredientIndex]
      : [0, 0, 300_000, 12_000_000, 2_600_000, 48_000, 4_500_000, 1_700_000, 0, 0][ingredientIndex];
    setupOps.push(db.tx.stockItems[id('stock', warehouseIndex, ingredientIndex)]
      .update({ venueId, quantityMilli: quantity, unit: ingredient.unit, updatedAt: now.toISOString(), version: 1 })
      .link({ warehouse: warehouse.id, product: ingredient.id }));
  }
}
await transactInChunks(setupOps);

const operationOps: TransactionOperation[] = [];
const dailyStats = new Map<string, { revenue: number; count: number; foodCost: number; expense: number }>();
const shiftIds: string[] = [];
let orderNumber = 1001;

for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
  const shiftId = id('shift', daysAgo);
  shiftIds.push(shiftId);
  const openedAt = localDate(daysAgo, 8, 30);
  const isToday = daysAgo === 0;
  const closedAt = localDate(daysAgo, 23, 20);
  const cashier = employees[(13 - daysAgo) % 2 === 0 ? 1 : 3];
  operationOps.push(db.tx.shifts[shiftId]
    .update({
      venueId,
      operationId: id('shift-operation', daysAgo),
      openedAt: openedAt.toISOString(),
      ...(isToday ? {} : { closedAt: closedAt.toISOString(), countedCashTiyin: 31_000_00 + daysAgo * 17_000 }),
      startingCashTiyin: 500_000,
      openingNote: 'Размен на начало смены',
      ...(isToday ? {} : { closingNote: daysAgo === 1 ? 'Закрыто без расхождений' : 'Смена закрыта' }),
      status: isToday ? 'open' : 'closed',
      createdAt: openedAt.toISOString(),
      version: 1,
    })
    .link({ venue: venueId, openedBy: cashier.id, device: deviceId }));

  const ordersForDay = isToday ? 14 : 18 + ((daysAgo * 7) % 8);
  const stats = { revenue: 0, count: 0, foodCost: 0, expense: 0 };
  for (let orderIndex = 0; orderIndex < ordersForDay; orderIndex++) {
    const orderId = id('order', daysAgo, orderIndex);
    const openedHour = 9 + ((orderIndex * 3) % 13);
    const openedMinute = (orderIndex * 11) % 60;
    const opened = localDate(daysAgo, openedHour, openedMinute);
    const closed = new Date(opened.getTime() + (18 + (orderIndex % 5) * 7) * 60_000);
    const cancelled = orderIndex > 0 && orderIndex % 19 === 0;
    const dishA = dishes[(orderIndex + daysAgo) % dishes.length];
    const dishB = orderIndex % 3 === 0 ? dishes[(orderIndex + daysAgo + 4) % dishes.length] : null;
    const quantityA = orderIndex % 7 === 0 ? 2 : 1;
    const total = dishA.price * quantityA + (dishB?.price ?? 0);
    const foodCost = dishA.cost * quantityA + (dishB?.cost ?? 0);
    const waiter = employees[[0, 2, 4][orderIndex % 3]];
    const tableId = tableIds[orderIndex % tableIds.length];

    operationOps.push(db.tx.orders[orderId]
      .update({
        venueId,
        operationId: id('order-operation', daysAgo, orderIndex),
        number: String(orderNumber++),
        status: cancelled ? 'cancelled' : 'paid',
        guestCount: 1 + (orderIndex % 4),
        tableNumber: String((orderIndex % tableIds.length) + 1),
        zoneName: orderIndex % tableIds.length >= 5 ? 'Веранда' : 'Основной зал',
        orderType: orderIndex % 6 === 0 ? 'takeaway' : 'dine_in',
        ...(orderIndex % 11 === 0 ? { comment: 'Без сахара' } : {}),
        isQuickCheck: orderIndex % 6 === 0,
        openedAt: opened.toISOString(),
        closedAt: closed.toISOString(),
        totalAmountTiyin: total,
        source: orderIndex % 13 === 0 ? 'glovo' : 'pos',
        ...(cancelled ? { closeReason: 'Ошибка ввода' } : {}),
        createdAt: opened.toISOString(),
        version: 1,
      })
      .link({ venue: venueId, shift: shiftId, table: tableId, ownerEmployee: waiter.id, device: deviceId }));

    const itemAId = id('order-item', daysAgo, orderIndex, 0);
    operationOps.push(db.tx.orderItems[itemAId]
      .update({
        venueId,
        operationId: id('order-item-operation', daysAgo, orderIndex, 0),
        productName: dishA.name,
        productPriceTiyin: dishA.price,
        quantity: quantityA,
        guestNumber: 1,
        consumptionSnapshotJson: JSON.stringify({ consumption: [] }),
        createdAt: opened.toISOString(),
        sentAt: new Date(opened.getTime() + 2 * 60_000).toISOString(),
      })
      .link({ order: orderId, product: dishA.id }));
    if (dishB) {
      const itemBId = id('order-item', daysAgo, orderIndex, 1);
      operationOps.push(db.tx.orderItems[itemBId]
        .update({
          venueId,
          operationId: id('order-item-operation', daysAgo, orderIndex, 1),
          productName: dishB.name,
          productPriceTiyin: dishB.price,
          quantity: 1,
          guestNumber: Math.min(2, 1 + (orderIndex % 2)),
          consumptionSnapshotJson: JSON.stringify({ consumption: [] }),
          createdAt: opened.toISOString(),
          sentAt: new Date(opened.getTime() + 2 * 60_000).toISOString(),
        })
        .link({ order: orderId, product: dishB.id }));
    }

    const createdEventId = id('order-event', daysAgo, orderIndex, 'created');
    operationOps.push(db.tx.orderEvents[createdEventId]
      .update({ venueId, operationId: id('order-event-operation', daysAgo, orderIndex, 'created'), action: 'created', occurredAt: opened.toISOString(), metadata: { tableNumber: String((orderIndex % tableIds.length) + 1) } })
      .link({ order: orderId, venue: venueId, actorEmployee: waiter.id, device: deviceId }));

    if (!cancelled) {
      const paymentId = id('payment', daysAgo, orderIndex);
      const method = orderIndex % 4 === 0 ? 'cash' : 'card';
      operationOps.push(db.tx.payments[paymentId]
        .update({
          venueId,
          operationId: id('payment-operation', daysAgo, orderIndex),
          method,
          amountTiyin: total,
          changeTiyin: 0,
          foodCostTiyin: foodCost,
          fiscalStatus: 'printed',
          fiscalNumber: `FD-${daysAgo}-${orderIndex}`,
          idempotencyKey: `admin-demo-payment:${daysAgo}:${orderIndex}`,
          createdAt: closed.toISOString(),
        })
        .link({ order: orderId, shift: shiftId, venue: venueId, actorEmployee: cashier.id, device: deviceId }));
      operationOps.push(db.tx.orderEvents[id('order-event', daysAgo, orderIndex, 'paid')]
        .update({ venueId, operationId: id('order-event-operation', daysAgo, orderIndex, 'paid'), action: 'paid', occurredAt: closed.toISOString(), metadata: { method } })
        .link({ order: orderId, venue: venueId, actorEmployee: cashier.id, device: deviceId }));
      stats.revenue += total;
      stats.count += 1;
      stats.foodCost += foodCost;
    } else {
      operationOps.push(db.tx.orderEvents[id('order-event', daysAgo, orderIndex, 'cancelled')]
        .update({ venueId, operationId: id('order-event-operation', daysAgo, orderIndex, 'cancelled'), action: 'cancelled', occurredAt: closed.toISOString(), metadata: { reason: 'Ошибка ввода' } })
        .link({ order: orderId, venue: venueId, actorEmployee: cashier.id, device: deviceId }));
    }
  }

  const expenseCount = 2 + (daysAgo % 2);
  for (let expenseIndex = 0; expenseIndex < expenseCount; expenseIndex++) {
    const amount = 45_000 + ((daysAgo + expenseIndex) % 5) * 25_000;
    const occurredAt = localDate(daysAgo, 11 + expenseIndex * 3, 15);
    operationOps.push(db.tx.cashMovements[id('cash-movement', daysAgo, expenseIndex)]
      .update({
        venueId,
        operationId: id('cash-movement-operation', daysAgo, expenseIndex),
        movementType: 'float_out',
        amountTiyin: amount,
        note: ['Проезд курьера', 'Хозяйственные расходы', 'Мелкий ремонт'][expenseIndex % 3],
        version: 1,
        occurredAt: occurredAt.toISOString(),
        createdAt: occurredAt.toISOString(),
      })
      .link({ shift: shiftId, venue: venueId }));
    stats.expense += amount;
  }
  dailyStats.set(openedAt.toISOString().slice(0, 10), stats);
}

const activeShiftId = shiftIds[shiftIds.length - 1];
for (let index = 0; index < 3; index++) {
  const orderId = id('active-order', index);
  const opened = new Date(now.getTime() - (index + 1) * 75 * 60_000);
  const dish = dishes[index + 1];
  const waiter = employees[index * 2];
  operationOps.push(
    db.tx.orders[orderId]
      .update({ venueId, operationId: id('active-order-operation', index), number: String(orderNumber++), status: 'active', guestCount: index + 1, tableNumber: String(index + 1), zoneName: 'Основной зал', orderType: 'dine_in', isQuickCheck: false, openedAt: opened.toISOString(), totalAmountTiyin: dish.price, source: 'pos', createdAt: opened.toISOString(), version: 1 })
      .link({ venue: venueId, shift: activeShiftId, table: tableIds[index], ownerEmployee: waiter.id, device: deviceId }),
    db.tx.orderItems[id('active-order-item', index)]
      .update({ venueId, operationId: id('active-order-item-operation', index), productName: dish.name, productPriceTiyin: dish.price, quantity: 1, guestNumber: 1, consumptionSnapshotJson: JSON.stringify({ consumption: [] }), createdAt: opened.toISOString(), sentAt: opened.toISOString() })
      .link({ order: orderId, product: dish.id }),
    db.tx.orderEvents[id('active-order-event', index)]
      .update({ venueId, operationId: id('active-order-event-operation', index), action: 'created', occurredAt: opened.toISOString(), metadata: { tableNumber: String(index + 1) } })
      .link({ order: orderId, venue: venueId, actorEmployee: waiter.id, device: deviceId }),
  );
}

const existingStatsResult = await db.query({
  venueDailyStats: { $: { where: { venueId } } },
});
const existingStatIdByKey = new Map(
  existingStatsResult.venueDailyStats.map((stat) => [stat.statsKey, stat.id]),
);

for (const [day, stats] of dailyStats) {
  const statsKey = `${venueId}:${day}`;
  operationOps.push(db.tx.venueDailyStats[existingStatIdByKey.get(statsKey) ?? id('daily-stats', day)]
    .update({
      venueId,
      day,
      revenueTiyin: stats.revenue,
      orderCount: stats.count,
      foodCostTiyin: stats.foodCost,
      cashExpenseTiyin: stats.expense,
      updatedAt: now.toISOString(),
      statsKey,
      sourceCount: stats.count,
      sourceHash: `admin-demo:${day}:${stats.count}:${stats.revenue}`,
      version: 1,
    })
    .link({ venue: venueId }));
}
await transactInChunks(operationOps);

const warehouseOps: TransactionOperation[] = [];
for (let index = 0; index < 12; index++) {
  const documentId = id('delivery', index);
  const warehouse = warehouses[index % warehouses.length];
  const ingredientA = ingredients[index % ingredients.length];
  const ingredientB = ingredients[(index + 3) % ingredients.length];
  const deliveryDate = localDate(index, 10, 0);
  const status = index === 0 ? 'В пути' : index === 4 ? 'Отменено' : 'Принято';
  const amount = 180_000 + index * 37_000;
  warehouseOps.push(db.tx.deliveryDocuments[documentId]
    .update({ venueId, operationId: id('delivery-operation', index), supplier: ['Coffee Bean KG', 'Молочный Дом', 'Фермер Маркет'][index % 3], deliveryDate: deliveryDate.toISOString(), amountTiyin: amount, status, source: index % 4 === 0 ? 'manual' : 'supplier', comment: index % 5 === 0 ? 'Проверить сертификаты' : '', createdAt: deliveryDate.toISOString(), version: 1 })
    .link({ venue: venueId, warehouse: warehouse.id }));
  for (const [lineIndex, ingredient] of [ingredientA, ingredientB].entries()) {
    warehouseOps.push(db.tx.deliveryLines[id('delivery-line', index, lineIndex)]
      .update({ venueId, name: ingredient.name, quantityMilli: (5 + lineIndex * 3) * 1_000_000, unit: ingredient.unit, priceTiyin: ingredient.cost * 1000 })
      .link({ document: documentId, product: ingredient.id }));
  }
}

for (let index = 0; index < 8; index++) {
  const documentId = id('write-off', index);
  const warehouse = warehouses[index % warehouses.length];
  const ingredient = ingredients[(index + 2) % ingredients.length];
  const date = localDate(index, 16, 30);
  warehouseOps.push(
    db.tx.writeOffDocuments[documentId]
      .update({ venueId, operationId: id('write-off-operation', index), reasonSummary: ['Порча', 'Истёк срок годности', 'Брак'][index % 3], writeOffDate: date.toISOString(), status: index === 0 ? 'Черновик' : index === 5 ? 'Отменено' : 'Проведено', createdByName: employees[index % employees.length].name, comment: index % 3 === 0 ? 'Проверено менеджером' : '', createdAt: date.toISOString(), version: 1 })
      .link({ venue: venueId, warehouse: warehouse.id }),
    db.tx.writeOffLines[id('write-off-line', index)]
      .update({ venueId, name: ingredient.name, quantityMilli: (1 + index % 3) * 250_000, unit: ingredient.unit, reason: ['Порча', 'Просрочка', 'Производственный брак'][index % 3] })
      .link({ document: documentId, product: ingredient.id }),
  );
}

for (let index = 0; index < 5; index++) {
  const documentId = id('transfer', index);
  const ingredient = ingredients[(index + 4) % ingredients.length];
  const date = localDate(index * 2, 13, 0);
  warehouseOps.push(
    db.tx.transferDocuments[documentId]
      .update({ venueId, operationId: id('transfer-operation', index), transferDate: date.toISOString(), status: index === 0 ? 'Черновик' : index === 4 ? 'Отменено' : 'Проведено', comment: `${ingredients[(index + 4) % ingredients.length].name}: пополнение`, createdAt: date.toISOString(), version: 1 })
      .link({ venue: venueId, fromWarehouse: warehouses[index % 2].id, toWarehouse: warehouses[(index + 1) % 2].id }),
    db.tx.transferLines[id('transfer-line', index)]
      .update({ venueId, name: ingredient.name, quantityMilli: (index + 1) * 500_000, unit: ingredient.unit })
      .link({ document: documentId, product: ingredient.id }),
  );
}

for (let index = 0; index < 3; index++) {
  const sessionId = id('inventory-session', index);
  const warehouse = warehouses[index % warehouses.length];
  const date = localDate(4 + index * 10, 9, 0);
  let delta = 0;
  warehouseOps.push(db.tx.inventorySessions[sessionId]
    .update({ venueId, operationId: id('inventory-session-operation', index), inventoryType: index === 2 ? 'partial' : 'full', conductedAt: date.toISOString(), status: index === 0 ? 'Черновик' : 'Проведено', resultDeltaTiyin: index === 1 ? -124_500 : 38_000, createdAt: date.toISOString(), version: 1 })
    .link({ venue: venueId, warehouse: warehouse.id }));
  for (let lineIndex = 0; lineIndex < 6; lineIndex++) {
    const ingredient = ingredients[lineIndex];
    const theoretical = (lineIndex + 2) * 1_000_000;
    const actual = theoretical + ((lineIndex % 3) - 1) * 120_000;
    delta += actual - theoretical;
    warehouseOps.push(db.tx.inventoryLines[id('inventory-line', index, lineIndex)]
      .update({ venueId, name: ingredient.name, unit: ingredient.unit, theoreticalMilli: theoretical, actualMilli: actual, unitPriceTiyin: ingredient.cost, theoreticalStockVersion: 1 })
      .link({ session: sessionId, product: ingredient.id }));
  }
  void delta;
}
await transactInChunks(warehouseOps);

console.log(`Seeded populated admin demo for ${venueId}:`);
console.log(`  ${dishes.length} dishes, ${ingredients.length} ingredients, ${employees.length} employees`);
console.log(`  ${shiftIds.length} shifts, ${orderNumber - 1001} orders, ${warehouses.length} warehouses`);
console.log('  12 deliveries, 8 write-offs, 5 transfers, 3 inventories');
