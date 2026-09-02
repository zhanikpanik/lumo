import { useQuery } from '@tanstack/react-query';
import type { InstaQLParams } from '@instantdb/react';
import {
  adminDashboardPeriodCashMovementsQuery,
  adminDashboardPeriodPaidOrdersQuery,
  type AppSchema,
} from '@lumo/data';
import { getInstantClient } from '@/data/instant';
import { instantOne } from '@/lib/instantLink';
import { useVenueId } from './useVenueId';

export interface DailyProfitRow {
  date: string;
  dayOfWeek: string;
  revenue: number;
  theoreticalCogs: number;
  actualCogs: number | null;
  operatingExpenses: number;
  laborHours: number;
  laborCost: number;
  primeCostPct: number | null;
  splh: number | null;
  resultBeforePayroll: number | null;
}

export interface HourlySplhCell {
  dayIndex: number;
  hour: number;
  revenue: number;
  laborHours: number;
  splh: number | null;
}

export interface ProfitData {
  rows: DailyProfitRow[];
  splhHeatmap: HourlySplhCell[];
  periodLabel: string;
  hourlyRate: number;
  dailyFixedCost: number;
  revenue: number;
  theoreticalCogs: number;
  actualCogs: number | null;
  actualCogsStatus: 'complete' | 'missing_boundaries' | 'invalid';
  actualCogsMissingWarehouses: string[];
  actualCogsBoundaryStart: string | null;
  actualCogsBoundaryEnd: string | null;
  operatingExpenses: number;
  resultBeforePayroll: number;
  resultUsesActualCogs: boolean;
  laborIncluded: false;
}

const DAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function dateKey(value: Date | string | number): string {
  return new Date(value).toISOString().slice(0, 10);
}


function periodLabel(start: string, end: string): string {
  const first = new Date(start);
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}–${last.getDate()} ${MONTH_LABELS[last.getMonth()]} ${last.getFullYear()}`
    : `${first.getDate()} ${MONTH_LABELS[first.getMonth()]} – ${last.getDate()} ${MONTH_LABELS[last.getMonth()]} ${last.getFullYear()}`;
}

function profitSupportQuery(venueId: string, start: string, end: string) {
  const boundaryStart = new Date(new Date(start).getTime() - 86_400_000);
  const boundaryEnd = new Date(new Date(end).getTime() + 86_400_000);

  return {
    warehouses: {
      $: { where: { 'venue.id': venueId }, limit: 100 },
    },
    inventorySessions: {
      $: {
        where: {
          'venue.id': venueId,
          conductedAt: { $gte: boundaryStart, $lt: boundaryEnd },
        },
        limit: 1000,
      },
      warehouse: {},
      lines: { product: {} },
    },
    deliveryDocuments: {
      $: {
        where: {
          'venue.id': venueId,
          deliveryDate: { $gte: boundaryStart, $lt: boundaryEnd },
        },
        limit: 1000,
      },
      warehouse: {},
      lines: { product: {} },
    },
  } satisfies InstaQLParams<AppSchema>;
}

async function fetchProfitData(venueId: string, start: string, end: string): Promise<ProfitData> {
  const db = getInstantClient();
  const [ordersResult, supportResult, cashResult] = await Promise.all([
    db.queryOnce(adminDashboardPeriodPaidOrdersQuery(venueId, start, end)),
    db.queryOnce(profitSupportQuery(venueId, start, end)),
    db.queryOnce(adminDashboardPeriodCashMovementsQuery(venueId, start, end)),
  ]);

  const revenueByDay = new Map<string, number>();
  const cogsByDay = new Map<string, number>();
  for (const order of ordersResult.data.orders ?? []) {
    const openedAt = new Date(order.openedAt);
    const day = dateKey(openedAt);
    let orderRevenue = 0;
    let orderCost = 0;
    for (const item of order.items ?? []) {
      const product = instantOne(item.product);
      const quantity = Number(item.quantity) || 1;
      orderRevenue += ((item.productPriceTiyin ?? 0) / 100) * quantity;
      orderCost += ((product?.costTiyin ?? 0) / 100) * quantity;
    }
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + orderRevenue);
    cogsByDay.set(day, (cogsByDay.get(day) ?? 0) + orderCost);
  }

  const expensesByDay = new Map<string, number>();
  for (const movement of cashResult.data.cashMovements ?? []) {
    if (movement.movementType !== 'expense') continue;
    const day = dateKey(movement.occurredAt);
    expensesByDay.set(day, (expensesByDay.get(day) ?? 0) + movement.amountTiyin / 100);
  }

  const periodStart = new Date(start);
  const periodEnd = new Date(end);
  const postedSessions = (supportResult.data.inventorySessions ?? [])
    .filter((session) => ['posted', 'Проведено'].includes(session.status));
  const missingWarehouses: string[] = [];
  const openingBoundaries: number[] = [];
  const closingBoundaries: number[] = [];
  let actualCogsTotal = 0;
  let invalidActualCogs = false;

  for (const warehouse of supportResult.data.warehouses ?? []) {
    const warehouseSessions = postedSessions
      .filter((session) => instantOne(session.warehouse)?.id === warehouse.id)
      .sort((a, b) => new Date(a.conductedAt).getTime() - new Date(b.conductedAt).getTime());
    const opening = [...warehouseSessions]
      .reverse()
      .find((session) => new Date(session.conductedAt) <= periodStart);
    const closing = warehouseSessions
      .find((session) => new Date(session.conductedAt) >= periodEnd);
    const openingTime = opening ? new Date(opening.conductedAt).getTime() : null;
    const closingTime = closing ? new Date(closing.conductedAt).getTime() : null;
    const boundariesMatch = openingTime != null
      && closingTime != null
      && opening?.id !== closing?.id
      && periodStart.getTime() - openingTime <= 86_400_000
      && closingTime - periodEnd.getTime() <= 86_400_000;

    if (!opening || !closing || !boundariesMatch || openingTime == null || closingTime == null) {
      missingWarehouses.push(warehouse.name);
      continue;
    }

    const inventoryValue = (session: typeof opening) => (session.lines ?? []).reduce((sum, line) => {
      const product = instantOne(line.product);
      const quantity = (line.actualMilli ?? 0) / 1000;
      const unitPrice = (line.unitPriceTiyin ?? product?.costTiyin ?? 0) / 100;
      return sum + quantity * unitPrice;
    }, 0);
    const deliveryValue = (supportResult.data.deliveryDocuments ?? [])
      .filter((document) => {
        const deliveredAt = new Date(document.deliveryDate).getTime();
        return instantOne(document.warehouse)?.id === warehouse.id
          && !['cancelled', 'Отменено'].includes(document.status)
          && deliveredAt >= openingTime
          && deliveredAt <= closingTime;
      })
      .reduce((documentSum, document) => documentSum + (document.lines ?? [])
        .reduce((lineSum, line) => lineSum
          + ((line.quantityMilli ?? 0) / 1000) * ((line.priceTiyin ?? 0) / 100), 0), 0);
    const warehouseActualCogs = inventoryValue(opening) + deliveryValue - inventoryValue(closing);
    if (!Number.isFinite(warehouseActualCogs) || warehouseActualCogs < 0) {
      invalidActualCogs = true;
      continue;
    }

    actualCogsTotal += warehouseActualCogs;
    openingBoundaries.push(openingTime);
    closingBoundaries.push(closingTime);
  }

  if ((supportResult.data.warehouses ?? []).length === 0) {
    missingWarehouses.push('Склады не настроены');
  }

  const actualCogsStatus: ProfitData['actualCogsStatus'] = missingWarehouses.length > 0
    ? 'missing_boundaries'
    : invalidActualCogs
      ? 'invalid'
      : 'complete';
  const actualCogs = actualCogsStatus === 'complete' ? actualCogsTotal : null;
  const rows: DailyProfitRow[] = [];

  for (let cursor = new Date(start); cursor < periodEnd; cursor.setDate(cursor.getDate() + 1)) {
    const day = dateKey(cursor);
    const revenue = revenueByDay.get(day) ?? 0;
    const theoreticalCogs = cogsByDay.get(day) ?? 0;
    const operatingExpenses = expensesByDay.get(day) ?? 0;
    rows.push({
      date: day,
      dayOfWeek: DAY_LABELS[cursor.getDay()],
      revenue,
      theoreticalCogs,
      actualCogs: null,
      operatingExpenses,
      laborHours: 0,
      laborCost: 0,
      primeCostPct: revenue > 0 ? (theoreticalCogs / revenue) * 100 : null,
      splh: null,
      resultBeforePayroll: revenue > 0 || operatingExpenses > 0
        ? revenue - theoreticalCogs - operatingExpenses
        : null,
    });
  }

  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const theoreticalCogs = rows.reduce((sum, row) => sum + row.theoreticalCogs, 0);
  const operatingExpenses = rows.reduce((sum, row) => sum + row.operatingExpenses, 0);
  const resultUsesActualCogs = actualCogs != null;
  const cogsForResult = actualCogs ?? theoreticalCogs;

  return {
    rows,
    splhHeatmap: [],
    periodLabel: periodLabel(start, end),
    hourlyRate: 0,
    dailyFixedCost: 0,
    revenue,
    theoreticalCogs,
    actualCogs,
    actualCogsStatus,
    actualCogsMissingWarehouses: missingWarehouses,
    actualCogsBoundaryStart: openingBoundaries.length > 0
      ? new Date(Math.min(...openingBoundaries)).toISOString()
      : null,
    actualCogsBoundaryEnd: closingBoundaries.length > 0
      ? new Date(Math.max(...closingBoundaries)).toISOString()
      : null,
    operatingExpenses,
    resultBeforePayroll: revenue - cogsForResult - operatingExpenses,
    resultUsesActualCogs,
    laborIncluded: false,
  };
}

export function useAnalyticsProfit(start: string, end: string) {
  const venueId = useVenueId();
  return useQuery({
    queryKey: ['instant-analytics-profit', venueId, start, end],
    queryFn: () => fetchProfitData(venueId, start, end),
    staleTime: 2 * 60 * 1000,
  });
}
