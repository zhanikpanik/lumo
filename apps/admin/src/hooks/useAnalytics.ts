import { useQuery } from '@tanstack/react-query';
import type { InstaQLParams } from '@instantdb/react';
import {
  adminDashboardDishesWithRecipesQuery,
  adminDashboardPeriodPaidOrdersQuery,
  adminDeliveriesQuery,
  adminTransfersQuery,
  adminWriteOffsQuery,
  type AppSchema,
} from '@lumo/data';
import { getInstantClient } from '@/data/instant';
import { instantOne } from '@/lib/instantLink';
import { useVenueId } from './useVenueId';

export interface Portion {
  orderId: string;
  date: string;
  hour: number;
  dayOfWeek: number;
  productName: string;
  price: number;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  shiftId: string;
}

export interface DailyStats {
  date: string;
  dayOfWeek: string;
  revenue: number;
  cost: number;
  margin: number;
  orderCount: number;
  avgCheck: number;
}

export interface HourlyBucket {
  dayIndex: number;
  hour: number;
  orderCount: number;
  revenue: number;
  avgCheck: number;
}

export interface DrinkStats {
  name: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  portions: number;
}

export interface ShiftStats {
  shiftId: string;
  cashierName: string;
  revenue: number;
  margin: number;
  marginPct: number;
  portions: number;
}

export interface IngredientDiscrepancy {
  ingredientName: string;
  unit: string;
  normativeConsumption: number;
  actualConsumption: number;
  discrepancy: number;
  discrepancySom: number;
  byShift: {
    shiftId: string;
    cashierName: string;
    discrepancy: number;
    discrepancySom: number;
  }[];
}

export interface StockStatus {
  productName: string;
  currentStock: number;
  unit: string;
  weeklyConsumption: number;
  daysLeft: number;
  isBar: boolean;
}

export interface ConsumptionRow {
  productId: string;
  productName: string;
  unit: string;
  consumption: number;
  incomingDelivery: number;
  transferNet: number;
  writeoffQty: number;
  coverageRatio: number;
}

export interface OverconsumptionRow {
  productId: string;
  productName: string;
  unit: string;
  theoretical: number;
  actual: number | null;
  delta: number | null;
  lossSom: number | null;
  startingStock: number | null;
  endingStock: number | null;
  deliveries: number;
  costPrice: number | null;
}

export interface OverconsumptionData {
  hasBoundaries: boolean;
  startInventoryDate: string | null;
  endInventoryDate: string | null;
  rows: OverconsumptionRow[];
  totalLossSom: number | null;
}

export interface AnalyticsData {
  portions: Portion[];
  dailyStats: DailyStats[];
  hourlyBuckets: HourlyBucket[];
  drinkStats: DrinkStats[];
  shiftStats: ShiftStats[];
  discrepancies: IngredientDiscrepancy[];
  consumptionRows: ConsumptionRow[];
  overconsumption: OverconsumptionData;
  stockStatus: StockStatus[];
  periodLabel: string;
}

interface IngredientFlow {
  consumption: number;
  incoming: number;
  transfer: number;
  writeoff: number;
}

interface IngredientInfo {
  name: string;
  unit: string;
  cost: number;
}

const DAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function dateKey(value: Date | string | number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function dayOfWeekIndex(value: Date | string | number): number {
  const day = new Date(value).getDay();
  return day === 0 ? 6 : day - 1;
}

function inPeriod(value: Date | string | number, start: string, end: string): boolean {
  const timestamp = new Date(value).getTime();
  return timestamp >= new Date(start).getTime() && timestamp < new Date(end).getTime();
}

function periodLabel(start: string, end: string): string {
  const first = new Date(start);
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}–${last.getDate()} ${MONTH_LABELS[last.getMonth()]} ${last.getFullYear()}`
    : `${first.getDate()} ${MONTH_LABELS[first.getMonth()]} – ${last.getDate()} ${MONTH_LABELS[last.getMonth()]} ${last.getFullYear()}`;
}

function warehouseOperationsQuery(venueId: string) {
  return {
    shifts: {
      $: { where: { 'venue.id': venueId }, limit: 1000 },
      openedBy: {},
    },
    stockItems: {
      $: { where: { venueId }, limit: 9999 },
      product: {},
      warehouse: {},
    },
    inventorySessions: {
      $: { where: { 'venue.id': venueId }, limit: 1000 },
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

async function fetchAnalytics(venueId: string, start: string, end: string): Promise<AnalyticsData> {
  const db = getInstantClient();
  const [ordersResult, dishesResult, operationsResult, deliveriesResult, writeOffsResult, transfersResult] = await Promise.all([
    db.queryOnce(adminDashboardPeriodPaidOrdersQuery(venueId, start, end)),
    db.queryOnce(adminDashboardDishesWithRecipesQuery(venueId)),
    db.queryOnce(warehouseOperationsQuery(venueId)),
    db.queryOnce(adminDeliveriesQuery(venueId, 1000)),
    db.queryOnce(adminWriteOffsQuery(venueId, 1000)),
    db.queryOnce(adminTransfersQuery(venueId, 1000)),
  ]);

  const ingredientInfo = new Map<string, IngredientInfo>();
  const recipeByDish = new Map<string, Array<{ ingredientId: string; quantity: number }>>();
  for (const dish of dishesResult.data.products ?? []) {
    const recipe: Array<{ ingredientId: string; quantity: number }> = [];
    for (const recipeItem of dish.recipeItems ?? []) {
      const ingredient = instantOne(recipeItem.ingredient);
      if (!ingredient) continue;
      ingredientInfo.set(ingredient.id, {
        name: ingredient.name,
        unit: ingredient.unit,
        cost: (ingredient.costTiyin ?? 0) / 100,
      });
      recipe.push({ ingredientId: ingredient.id, quantity: (recipeItem.quantityMilli ?? 0) / 1000 });
    }
    recipeByDish.set(dish.id, recipe);
  }

  const portions: Portion[] = [];
  const orderIdsByDay = new Map<string, Set<string>>();
  const soldByDish = new Map<string, number>();
  const cashierByShift = new Map<string, string>();

  for (const order of ordersResult.data.orders ?? []) {
    const shift = instantOne(order.shift);
    const cashier = instantOne(shift?.openedBy);
    if (shift) cashierByShift.set(shift.id, cashier?.displayName ?? `Смена ${shift.id.slice(0, 8)}`);
    const day = dateKey(order.openedAt);
    const dayOrders = orderIdsByDay.get(day) ?? new Set<string>();
    dayOrders.add(order.id);
    orderIdsByDay.set(day, dayOrders);

    for (const item of order.items ?? []) {
      const product = instantOne(item.product);
      const quantity = Number(item.quantity) || 1;
      const price = (Number(item.productPriceTiyin) || 0) / 100;
      const unitCost = (Number(product?.costTiyin) || 0) / 100;
      const revenue = price * quantity;
      const cost = unitCost * quantity;
      const timestamp = new Date(order.openedAt);
      portions.push({
        orderId: order.id,
        date: day,
        hour: timestamp.getHours(),
        dayOfWeek: dayOfWeekIndex(timestamp),
        productName: item.productName || product?.name || '—',
        price,
        quantity,
        revenue,
        cost,
        margin: revenue - cost,
        marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
        shiftId: shift?.id ?? 'Без смены',
      });
      if (product) soldByDish.set(product.id, (soldByDish.get(product.id) ?? 0) + quantity);
    }
  }

  const dailyTotals = new Map<string, { revenue: number; cost: number }>();
  const drinkTotals = new Map<string, { revenue: number; cost: number; count: number }>();
  const shiftTotals = new Map<string, { revenue: number; cost: number; count: number }>();
  for (const portion of portions) {
    const daily = dailyTotals.get(portion.date) ?? { revenue: 0, cost: 0 };
    daily.revenue += portion.revenue;
    daily.cost += portion.cost;
    dailyTotals.set(portion.date, daily);

    const drink = drinkTotals.get(portion.productName) ?? { revenue: 0, cost: 0, count: 0 };
    drink.revenue += portion.revenue;
    drink.cost += portion.cost;
    drink.count += portion.quantity;
    drinkTotals.set(portion.productName, drink);

    const shift = shiftTotals.get(portion.shiftId) ?? { revenue: 0, cost: 0, count: 0 };
    shift.revenue += portion.revenue;
    shift.cost += portion.cost;
    shift.count += portion.quantity;
    shiftTotals.set(portion.shiftId, shift);
  }

  const dailyStats: DailyStats[] = [];
  for (let cursor = new Date(start); cursor < new Date(end); cursor.setDate(cursor.getDate() + 1)) {
    const day = dateKey(cursor);
    const totals = dailyTotals.get(day) ?? { revenue: 0, cost: 0 };
    const orderCount = orderIdsByDay.get(day)?.size ?? 0;
    dailyStats.push({
      date: day,
      dayOfWeek: DAY_LABELS[cursor.getDay()],
      revenue: totals.revenue,
      cost: totals.cost,
      margin: totals.revenue - totals.cost,
      orderCount,
      avgCheck: orderCount > 0 ? totals.revenue / orderCount : 0,
    });
  }

  const hourlyBuckets: HourlyBucket[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    for (let hour = 7; hour <= 23; hour++) {
      const bucket = portions.filter((portion) => portion.dayOfWeek === dayIndex && portion.hour === hour);
      const orders = new Set(bucket.map((portion) => portion.orderId));
      const revenue = bucket.reduce((sum, portion) => sum + portion.revenue, 0);
      hourlyBuckets.push({
        dayIndex,
        hour,
        orderCount: orders.size,
        revenue,
        avgCheck: orders.size > 0 ? revenue / orders.size : 0,
      });
    }
  }

  const drinkStats = Array.from(drinkTotals, ([name, totals]) => ({
    name,
    revenue: totals.revenue,
    cost: totals.cost,
    margin: totals.revenue - totals.cost,
    marginPct: totals.revenue > 0 ? ((totals.revenue - totals.cost) / totals.revenue) * 100 : 0,
    portions: totals.count,
  })).sort((a, b) => b.revenue - a.revenue);

  const shiftStats = Array.from(shiftTotals, ([shiftId, totals]) => ({
    shiftId,
    cashierName: cashierByShift.get(shiftId) ?? shiftId,
    revenue: totals.revenue,
    margin: totals.revenue - totals.cost,
    marginPct: totals.revenue > 0 ? ((totals.revenue - totals.cost) / totals.revenue) * 100 : 0,
    portions: totals.count,
  })).sort((a, b) => b.revenue - a.revenue);

  const flows = new Map<string, IngredientFlow>();
  const flowFor = (productId: string): IngredientFlow => {
    const current = flows.get(productId) ?? { consumption: 0, incoming: 0, transfer: 0, writeoff: 0 };
    flows.set(productId, current);
    return current;
  };

  for (const [dishId, sold] of soldByDish) {
    for (const recipeItem of recipeByDish.get(dishId) ?? []) {
      flowFor(recipeItem.ingredientId).consumption += recipeItem.quantity * sold;
    }
  }
  for (const document of deliveriesResult.data.deliveryDocuments ?? []) {
    if (!inPeriod(document.deliveryDate, start, end) || document.status === 'Отменено' || document.status === 'cancelled') continue;
    for (const line of document.lines ?? []) {
      const product = instantOne(line.product);
      if (product) flowFor(product.id).incoming += (line.quantityMilli ?? 0) / 1000;
    }
  }
  for (const document of writeOffsResult.data.writeOffDocuments ?? []) {
    if (!inPeriod(document.writeOffDate, start, end) || document.status === 'Отменено' || document.status === 'cancelled') continue;
    for (const line of document.lines ?? []) {
      const product = instantOne(line.product);
      if (product) flowFor(product.id).writeoff += (line.quantityMilli ?? 0) / 1000;
    }
  }
  for (const document of transfersResult.data.transferDocuments ?? []) {
    if (!inPeriod(document.transferDate, start, end) || document.status === 'Отменено' || document.status === 'cancelled') continue;
    for (const line of document.lines ?? []) {
      const product = instantOne(line.product);
      if (product) flowFor(product.id).transfer += 0;
    }
  }

  const consumptionRows = Array.from(flows, ([productId, flow]) => {
    const info = ingredientInfo.get(productId);
    const effectiveSupply = flow.incoming + flow.transfer;
    return {
      productId,
      productName: info?.name ?? productId.slice(0, 8),
      unit: info?.unit ?? '',
      consumption: flow.consumption,
      incomingDelivery: flow.incoming,
      transferNet: flow.transfer,
      writeoffQty: flow.writeoff,
      coverageRatio: flow.consumption > 0 ? effectiveSupply / flow.consumption : 0,
    };
  }).filter((row) => row.consumption > 0).sort((a, b) => b.consumption - a.consumption);

  const postedSessions = (operationsResult.data.inventorySessions ?? [])
    .filter((session) => ['posted', 'Проведено'].includes(session.status))
    .sort((a, b) => new Date(a.conductedAt).getTime() - new Date(b.conductedAt).getTime());
  const beforeSession = [...postedSessions].reverse().find((session) => new Date(session.conductedAt) <= new Date(start)) ?? null;
  const afterSession = postedSessions.find((session) => new Date(session.conductedAt) >= new Date(end)) ?? null;
  const overconsumption: OverconsumptionData = {
    hasBoundaries: Boolean(beforeSession && afterSession && beforeSession.id !== afterSession.id),
    startInventoryDate: beforeSession ? dateKey(beforeSession.conductedAt) : null,
    endInventoryDate: afterSession ? dateKey(afterSession.conductedAt) : null,
    rows: [],
    totalLossSom: null,
  };

  if (overconsumption.hasBoundaries && beforeSession && afterSession) {
    const inventoryMap = (session: typeof beforeSession) => {
      const result = new Map<string, { actual: number; price: number }>();
      for (const line of session.lines ?? []) {
        const product = instantOne(line.product);
        if (!product) continue;
        result.set(product.id, {
          actual: (line.actualMilli ?? 0) / 1000,
          price: (line.unitPriceTiyin ?? product.costTiyin ?? 0) / 100,
        });
      }
      return result;
    };
    const before = inventoryMap(beforeSession);
    const after = inventoryMap(afterSession);
    const productIds = new Set([...flows.keys(), ...before.keys(), ...after.keys()]);
    for (const productId of productIds) {
      const flow = flows.get(productId) ?? { consumption: 0, incoming: 0, transfer: 0, writeoff: 0 };
      const opening = before.get(productId);
      const closing = after.get(productId);
      const startingStock = opening?.actual ?? null;
      const endingStock = closing?.actual ?? null;
      const actual = startingStock !== null && endingStock !== null
        ? startingStock + flow.incoming + flow.transfer - endingStock - flow.writeoff
        : null;
      const delta = actual === null ? null : actual - flow.consumption;
      const costPrice = opening?.price ?? closing?.price ?? ingredientInfo.get(productId)?.cost ?? null;
      const lossSom = delta !== null && delta > 0 && costPrice !== null ? delta * costPrice : null;
      const info = ingredientInfo.get(productId);
      overconsumption.rows.push({
        productId,
        productName: info?.name ?? productId.slice(0, 8),
        unit: info?.unit ?? '',
        theoretical: flow.consumption,
        actual,
        delta,
        lossSom,
        startingStock,
        endingStock,
        deliveries: flow.incoming,
        costPrice,
      });
    }
    overconsumption.rows.sort((a, b) => (b.lossSom ?? -1) - (a.lossSom ?? -1));
    const losses = overconsumption.rows.flatMap((row) => row.lossSom === null ? [] : [row.lossSom]);
    overconsumption.totalLossSom = losses.length > 0 ? losses.reduce((sum, loss) => sum + loss, 0) : null;
  }

  const stockByProduct = new Map<string, { quantity: number; isBar: boolean }>();
  for (const stockItem of operationsResult.data.stockItems ?? []) {
    const product = instantOne(stockItem.product);
    const warehouse = instantOne(stockItem.warehouse);
    if (!product) continue;
    ingredientInfo.set(product.id, {
      name: product.name,
      unit: product.unit,
      cost: (product.costTiyin ?? 0) / 100,
    });
    const current = stockByProduct.get(product.id) ?? { quantity: 0, isBar: false };
    current.quantity += (stockItem.quantityMilli ?? 0) / 1000;
    current.isBar ||= warehouse?.name.toLocaleLowerCase('ru').includes('бар') ?? false;
    stockByProduct.set(product.id, current);
  }
  const periodDays = Math.max(1, (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
  const stockStatus = Array.from(stockByProduct, ([productId, stock]) => {
    const info = ingredientInfo.get(productId);
    const weeklyConsumption = ((flows.get(productId)?.consumption ?? 0) / periodDays) * 7;
    return {
      productName: info?.name ?? productId.slice(0, 8),
      currentStock: stock.quantity,
      unit: info?.unit ?? '',
      weeklyConsumption,
      daysLeft: weeklyConsumption > 0 ? (stock.quantity / weeklyConsumption) * 7 : 99,
      isBar: stock.isBar,
    };
  });

  return {
    portions,
    dailyStats,
    hourlyBuckets,
    drinkStats,
    shiftStats,
    discrepancies: [],
    consumptionRows,
    overconsumption,
    stockStatus,
    periodLabel: periodLabel(start, end),
  };
}

export function useAnalytics(start: string, end: string) {
  const venueId = useVenueId();
  return useQuery({
    queryKey: ['instant-analytics', venueId, start, end],
    queryFn: () => fetchAnalytics(venueId, start, end),
    staleTime: 2 * 60 * 1000,
    placeholderData: (previous: AnalyticsData | undefined) => previous,
  });
}
