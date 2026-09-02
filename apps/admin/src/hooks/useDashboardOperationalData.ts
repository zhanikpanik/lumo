/**
 * Operational dashboard hook — live InstantDB data for the "now + today" view.
 *
 * Design:
 *   - Pure selector functions (no React, no InstantDB) compute UI state from raw query results.
 *   - One hook orchestrates multiple bounded InstantDB queries.
 *   - Minute tick re-evaluates time-based alerts without new DB reads.
 *   - Money math in integer tiyin; formatting deferred to UI.
 */

import { useMemo, useState, useEffect } from 'react';
import { getInstantClient } from '@/data/instant';
import { useVenueId } from './useVenueId';
import {
  venueToday,
  venueYesterday,
  venueSameElapsedLastWeek,
  adminDashboardActiveOrdersQuery,
  adminDashboardActiveShiftQuery,
  adminDashboardCashMovementsQuery,
  adminDashboardInventoryStateQuery,
  adminDashboardLastWeekSameDayOrdersQuery,
  adminDashboardOrderEventsQuery,
  adminDashboardThresholdIngredientsQuery,
  adminDashboardTodayPaidOrdersQuery,
  adminDashboardYesterdayShiftQuery,
  adminDashboardYesterdayStuckOrdersQuery,
} from '@lumo/data';
import { instantOne } from '@/lib/instantLink';
import type {
  DashboardOperationalData,
  TodayKPI,
  ShiftStatus,
  ActiveOrdersStatus,
  StockAlert,
  OverviewSituation,
  InventoryFreshness,
  ChronologyEvent,
  YesterdayShift,
} from '@/types/dashboard';

// ═══ Constants ══════════════════════════════════════════════════

const CHRONOLOGY_LIMIT = 20;
const STUCK_THRESHOLD_MINUTES = 60;
const INVENTORY_STALE_DAYS = 7;
const INVENTORY_BLOCKED_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// ═══ Selectors (pure, no React, no InstantDB) ══════════════════

function tiyinToDisplaySom(t: number): number {
  return Math.round(t / 100);
}

type InstantLink<T> = T | T[] | null | undefined;
type InstantDate = string | number;

interface SelectorPayment {
  foodCostTiyin?: number;
}

interface SelectorOrder {
  id: string;
  status: string;
  totalAmountTiyin?: number;
  openedAt: InstantDate;
  payments?: SelectorPayment[];
}

interface SelectorCashMovement {
  id: string;
  movementType: string;
  amountTiyin: number;
  occurredAt: InstantDate;
}

interface SelectorEmployee {
  displayName?: string;
}

interface SelectorShift {
  openedAt?: InstantDate;
  closedAt?: InstantDate;
  cashDifferenceAtClose?: number;
  openedBy?: InstantLink<SelectorEmployee>;
}

interface SelectorOrderEvent {
  id: string;
  occurredAt: InstantDate;
  action: string;
  actorEmployee?: InstantLink<SelectorEmployee>;
}


interface SelectorWarehouse {
  id: string;
  name: string;
}

interface SelectorProductLink {
  id: string;
}

interface SelectorStockItem {
  quantityMilli: number;
  product?: InstantLink<SelectorProductLink>;
}

interface SelectorInventorySession {
  status: string;
  conductedAt: InstantDate;
  warehouse?: InstantLink<SelectorWarehouse>;
}

interface SelectorIngredient {
  id: string;
  name: string;
  unit?: string;
  lowStockThresholdMilli?: number;
}

interface SelectorInput {
  todayOrders: SelectorOrder[];
  activeOrders: SelectorOrder[];
  todayCashMovements: SelectorCashMovement[];
  todayOrderEvents: SelectorOrderEvent[];
  activeShift: SelectorShift | null;
  yesterdayShift: SelectorShift | null;
  yesterdayStuckOrders: SelectorOrder[];
  lastWeekSameDayOrders: SelectorOrder[];
  warehouses: SelectorWarehouse[];
  stockItems: SelectorStockItem[];
  inventorySessions: SelectorInventorySession[];
  inventoryUnavailable: boolean;
  ingredients: SelectorIngredient[];
  now: Date;
  venueTimeZone: string;
}

function selectTodayKPI(input: SelectorInput): TodayKPI | null {
  const paid = input.todayOrders.filter((order) => order.status === 'paid');
  const revenueTiyin = paid.reduce((sum, order) => sum + (Number(order.totalAmountTiyin) || 0), 0);
  const paidOrderCount = paid.length;
  const averageCheckTiyin = paidOrderCount > 0 ? Math.round(revenueTiyin / paidOrderCount) : 0;

  const expenses = input.todayCashMovements
    .filter((movement) => movement.movementType === 'float_out' || movement.movementType === 'expense')
    .reduce((sum, movement) => sum + (Number(movement.amountTiyin) || 0), 0);

  // Food cost from payment snapshots
  const foodCostTiyin = paid.reduce(
    (sum, order) => sum + (order.payments ?? [])
      .reduce((paymentSum, payment) => paymentSum + (Number(payment.foodCostTiyin) || 0), 0),
    0,
  );

  const foodCostPercent = revenueTiyin > 0 ? Math.round((foodCostTiyin / revenueTiyin) * 100) : null;

  // Trend vs same day last week
  const lastWeekRevenue = input.lastWeekSameDayOrders.reduce(
    (sum, order) => sum + (Number(order.totalAmountTiyin) || 0), 0,
  );
  const lastWeekChecks = (input.lastWeekSameDayOrders ?? []).length;
  const revenueTrendPercent = lastWeekRevenue > 0
    ? Math.round(((revenueTiyin - lastWeekRevenue) / lastWeekRevenue) * 100)
    : revenueTiyin > 0 ? 100 : null;
  const checkTrendDelta = lastWeekChecks > 0 ? paidOrderCount - lastWeekChecks : paidOrderCount > 0 ? paidOrderCount : null;

  return {
    revenueTiyin,
    paidOrderCount,
    averageCheckTiyin,
    expenseTiyin: expenses,
    foodCostTiyin,
    foodCostPercent,
    revenueTrendPercent,
    checkTrendDelta,
  };
}

function selectShiftStatus(input: SelectorInput): ShiftStatus {
  const s = input.activeShift;
  if (!s) {
    return { isOpen: false, openedAt: null, hoursOpen: 0, cashier: null };
  }
  const hoursOpen = s.openedAt
    ? (input.now.getTime() - new Date(s.openedAt).getTime()) / (1000 * 60 * 60)
    : 0;
  return {
    isOpen: true,
    openedAt: s.openedAt == null ? null : new Date(s.openedAt).toISOString(),
    hoursOpen,
    cashier: instantOne(s.openedBy)?.displayName ?? null,
  };
}

function selectActiveOrders(input: SelectorInput): ActiveOrdersStatus {
  const sixtyMinAgo = input.now.getTime() - STUCK_THRESHOLD_MINUTES * 60 * 1000;
  const stuck = input.activeOrders.filter((order) => new Date(order.openedAt).getTime() < sixtyMinAgo);
  return {
    count: input.activeOrders.length,
    stuckOlderThan60Min: stuck.length,
  };
}


function selectYesterdayShift(input: SelectorInput): YesterdayShift | null {
  const s = input.yesterdayShift;
  if (!s) return null;
  const isClosed = s.closedAt != null;
  const diff = Number(s.cashDifferenceAtClose) || 0;
  return {
    closed: isClosed,
    revenue: null, // Would need yesterday's orders query
    checks: null,
    cashDifference: isClosed ? diff : null,
    closedAt: s.closedAt == null ? null : new Date(s.closedAt).toISOString(),
  };
}

function selectSituations(
  input: SelectorInput,
  freshness: InventoryFreshness,
  stockAlerts: StockAlert[],
): OverviewSituation[] {
  const situations: OverviewSituation[] = [];
  const paid = input.todayOrders.filter((order) => order.status === 'paid');
  const todayRevenue = paid.reduce(
    (sum, order) => sum + (Number(order.totalAmountTiyin) || 0),
    0,
  );
  const todayExpense = input.todayCashMovements
    .filter((movement) => movement.movementType === 'float_out' || movement.movementType === 'expense')
    .reduce((sum, movement) => sum + (Number(movement.amountTiyin) || 0), 0);

  if (!input.activeShift) {
    situations.push({
      id: 'no-active-shift',
      class: 'blocked',
      domain: 'cash',
      title: 'Касса не открыта',
      impact: 'Заказы нельзя корректно провести через активную смену.',
      evidence: 'Активная кассовая смена не найдена.',
      priorityReason: 'Работа заблокирована',
      confidence: 'verified',
      actionLabel: 'Проверить смену',
      actionHref: '/cash-shifts',
    });
  }

  if (input.yesterdayShift && !input.yesterdayShift.closedAt) {
    situations.push({
      id: 'yesterday-shift-open',
      class: 'blocked',
      domain: 'cash',
      title: 'Вчерашняя смена не закрыта',
      impact: 'Кассовый итог и расхождение за вчера остаются неподтверждёнными.',
      evidence: 'У смены отсутствует время закрытия.',
      priorityReason: 'Нарушена целостность прошлого дня',
      confidence: 'verified',
      actionLabel: 'Закрыть смену',
      actionHref: '/cash-shifts',
    });
  }

  const active = selectActiveOrders(input);
  if (active.stuckOlderThan60Min > 0) {
    situations.push({
      id: 'stuck-orders',
      class: 'probable_loss',
      domain: 'orders',
      title: `Зависшие заказы — ${active.stuckOlderThan60Min}`,
      impact: 'Заказы могут быть забыты, задвоены или остаться неоплаченными.',
      evidence: `${active.stuckOlderThan60Min} заказов открыты больше одного часа.`,
      priorityReason: 'Потеря вероятна',
      confidence: 'verified',
      actionLabel: 'Проверить заказы',
      actionHref: '/checks',
    });
  }

  const yesterdayStuckCount = input.yesterdayStuckOrders.length;
  if (yesterdayStuckCount > 0) {
    situations.push({
      id: 'yesterday-stuck-orders',
      class: 'blocked',
      domain: 'orders',
      title: `Незакрытые заказы со вчера — ${yesterdayStuckCount}`,
      impact: 'Итоги вчерашнего дня и текущие активные заказы искажены.',
      evidence: `${yesterdayStuckCount} заказов пережили границу суток.`,
      priorityReason: 'Нарушена целостность прошлого дня',
      confidence: 'verified',
      actionLabel: 'Проверить заказы',
      actionHref: '/checks',
    });
  }

  if (todayRevenue > 0 && todayExpense > todayRevenue) {
    situations.push({
      id: 'expense-over-revenue',
      class: 'probable_loss',
      domain: 'cash',
      title: 'Расходы превысили выручку',
      impact: 'Текущий денежный результат дня отрицательный до учёта других затрат.',
      evidence: 'Кассовые расходы за сегодня больше оплаченной выручки.',
      priorityReason: 'Финансовая потеря уже возникла',
      confidence: 'verified',
      actionLabel: 'Проверить расходы',
      actionHref: '/transactions',
    });
  }

  const lastWeekRevenue = input.lastWeekSameDayOrders.reduce(
    (sum, order) => sum + (Number(order.totalAmountTiyin) || 0),
    0,
  );
  if (lastWeekRevenue > 500_000 && todayRevenue < lastWeekRevenue * 0.5) {
    situations.push({
      id: 'revenue-crash',
      class: 'probable_loss',
      domain: 'sales',
      title: `Выручка ниже на ${Math.round((1 - todayRevenue / lastWeekRevenue) * 100)}%`,
      impact: 'Текущий темп продаж заметно отстаёт от сопоставимого дня.',
      evidence: 'Сравнение выполнено с тем же временем того же дня прошлой недели.',
      priorityReason: 'Потеря вероятна',
      confidence: 'estimated',
      actionLabel: 'Открыть аналитику',
      actionHref: '/analytics?tab=sales',
    });
  }

  if (freshness.status === 'unavailable') {
    situations.push({
      id: 'inventory-unavailable',
      class: 'degrading',
      domain: 'data_quality',
      title: 'Данные склада недоступны',
      impact: 'Остатки и фудкост нельзя проверить.',
      evidence: 'Не удалось загрузить текущий снимок склада.',
      priorityReason: 'Контроль данных потерян',
      confidence: 'stale',
      actionLabel: 'Открыть склад',
      actionHref: '/warehouse/operations',
    });
  } else if (freshness.status === 'missing' || freshness.status === 'stale') {
    const affected = freshness.affectedWarehouseNames.slice(0, 3).join(', ');
    const age = freshness.ageDays == null ? null : `${freshness.ageDays} дн.`;
    const blocksInventoryControl = freshness.status === 'missing'
      || (freshness.ageDays ?? 0) >= INVENTORY_BLOCKED_DAYS;
    situations.push({
      id: 'inventory-stale',
      class: blocksInventoryControl ? 'blocked' : 'degrading',
      domain: 'data_quality',
      title: freshness.status === 'missing'
        ? 'Нет актуальной инвентаризации'
        : 'Инвентаризация просрочена',
      impact: 'Остатки и фудкост нельзя считать достоверными.',
      evidence: [
        age ? `Самая старая граница: ${age}` : null,
        affected ? `Требуют проверки: ${affected}` : null,
      ].filter(Boolean).join(' · ') || 'Проведённая инвентаризация не найдена.',
      priorityReason: blocksInventoryControl ? 'Контроль склада заблокирован' : 'Процесс деградирует',
      confidence: 'verified',
      actionLabel: 'Провести переучёт',
      actionHref: '/warehouse/inventory?create=true',
    });
  } else {
    const negative = stockAlerts.filter((alert) => alert.level === 'negative');
    const zero = stockAlerts.filter((alert) => alert.level === 'zero');
    const low = stockAlerts.filter((alert) => alert.level === 'low');
    const evidence = (alerts: StockAlert[]) => alerts
      .slice(0, 3)
      .map((alert) => {
        const quantity = (alert.balanceMilli / 1000).toLocaleString('ru-RU', {
          maximumFractionDigits: 1,
        });
        return `${alert.name}: ${quantity} ${alert.unit}`;
      })
      .join(' · ');

    if (negative.length > 0) {
      situations.push({
        id: 'inventory-negative',
        class: 'blocked',
        domain: 'inventory',
        title: `Отрицательные остатки — ${negative.length}`,
        impact: 'Складские показатели и списания искажены.',
        evidence: evidence(negative),
        priorityReason: 'Работа со складом заблокирована',
        confidence: 'verified',
        actionLabel: 'Провести переучёт',
        actionHref: '/warehouse/inventory?create=true',
      });
    }

    if (zero.length > 0) {
      situations.push({
        id: 'inventory-zero',
        class: 'probable_loss',
        domain: 'inventory',
        title: `Закончились ингредиенты — ${zero.length}`,
        impact: 'Продажи связанных позиций могут остановиться.',
        evidence: evidence(zero),
        priorityReason: 'Потеря продаж вероятна',
        confidence: 'verified',
        actionLabel: 'Открыть склад',
        actionHref: '/warehouse/operations',
      });
    }

    if (low.length > 0) {
      situations.push({
        id: 'inventory-low',
        class: 'probable_loss',
        domain: 'inventory',
        title: `Ниже минимального остатка — ${low.length}`,
        impact: 'Запас может закончиться до следующей поставки.',
        evidence: evidence(low),
        priorityReason: 'Требуется пополнение',
        confidence: 'verified',
        actionLabel: 'Открыть склад',
        actionHref: '/warehouse/operations',
      });
    }
  }

  const classOrder = { blocked: 0, probable_loss: 1, degrading: 2 } as const;
  const ruleOrder: Record<string, number> = {
    'yesterday-stuck-orders': 0,
    'yesterday-shift-open': 1,
    'no-active-shift': 2,
    'inventory-negative': 3,
    'inventory-zero': 10,
    'expense-over-revenue': 11,
    'stuck-orders': 12,
    'revenue-crash': 13,
    'inventory-low': 14,
    'inventory-stale': 20,
    'inventory-unavailable': 21,
  };

  return situations.sort((a, b) =>
    classOrder[a.class] - classOrder[b.class]
    || (ruleOrder[a.id] ?? 99) - (ruleOrder[b.id] ?? 99)
    || a.id.localeCompare(b.id),
  );
}

function selectInventoryFreshness(input: SelectorInput): InventoryFreshness {
  if (input.inventoryUnavailable) {
    return {
      status: 'unavailable',
      lastCountedAt: null,
      ageDays: null,
      warehouseCount: input.warehouses.length,
      currentWarehouseCount: 0,
      affectedWarehouseNames: [],
    };
  }

  const warehouses = new Map(
    input.warehouses.map((warehouse) => [warehouse.id, warehouse.name]),
  );
  if (warehouses.size === 0) {
    return {
      status: 'missing',
      lastCountedAt: null,
      ageDays: null,
      warehouseCount: 0,
      currentWarehouseCount: 0,
      affectedWarehouseNames: [],
    };
  }

  const latestByWarehouse = new Map<string, number>();
  for (const session of input.inventorySessions) {
    if (!['posted', 'Проведено'].includes(session.status)) continue;
    const warehouseId = instantOne(session.warehouse)?.id;
    const timestamp = new Date(session.conductedAt).getTime();
    if (!warehouseId || !Number.isFinite(timestamp)) continue;
    const current = latestByWarehouse.get(warehouseId);
    if (current == null || timestamp > current) latestByWarehouse.set(warehouseId, timestamp);
  }

  const staleCutoff = input.now.getTime() - INVENTORY_STALE_DAYS * DAY_MS;
  const missingNames: string[] = [];
  const staleNames: string[] = [];
  const countedTimes: number[] = [];
  let currentWarehouseCount = 0;

  for (const [warehouseId, warehouseName] of warehouses) {
    const countedAt = latestByWarehouse.get(warehouseId);
    if (countedAt == null) {
      missingNames.push(warehouseName || 'Без названия');
      continue;
    }
    countedTimes.push(countedAt);
    if (countedAt < staleCutoff) staleNames.push(warehouseName || 'Без названия');
    else currentWarehouseCount += 1;
  }

  const oldestCountedAt = countedTimes.length > 0 ? Math.min(...countedTimes) : null;
  const status: InventoryFreshness['status'] = missingNames.length > 0
    ? 'missing'
    : staleNames.length > 0
      ? 'stale'
      : 'current';

  return {
    status,
    lastCountedAt: oldestCountedAt == null ? null : new Date(oldestCountedAt).toISOString(),
    ageDays: oldestCountedAt == null
      ? null
      : Math.max(0, Math.floor((input.now.getTime() - oldestCountedAt) / DAY_MS)),
    warehouseCount: warehouses.size,
    currentWarehouseCount,
    affectedWarehouseNames: [...missingNames, ...staleNames],
  };
}

function selectStockAlerts(input: SelectorInput): StockAlert[] {
  const balanceByProduct = new Map<string, number>();
  for (const stockItem of input.stockItems) {
    const productId = instantOne(stockItem.product)?.id;
    if (!productId) continue;
    balanceByProduct.set(
      productId,
      (balanceByProduct.get(productId) ?? 0) + (Number(stockItem.quantityMilli) || 0),
    );
  }

  const alerts: StockAlert[] = [];
  for (const ingredient of input.ingredients) {
    const balance = balanceByProduct.get(ingredient.id) ?? 0;
    const threshold = Number(ingredient.lowStockThresholdMilli) || 0;
    const base = {
      productId: ingredient.id,
      name: ingredient.name,
      balanceMilli: balance,
      unit: ingredient.unit ?? '',
    };

    if (balance < 0) alerts.push({ ...base, level: 'negative' });
    else if (balance === 0) alerts.push({ ...base, level: 'zero' });
    else if (threshold > 0 && balance < threshold) alerts.push({ ...base, level: 'low' });
  }

  const levelOrder = { negative: 0, zero: 1, low: 2 } as const;
  return alerts.sort((a, b) =>
    levelOrder[a.level] - levelOrder[b.level]
    || a.balanceMilli - b.balanceMilli
    || a.name.localeCompare(b.name, 'ru'),
  );
}

function selectChronology(input: SelectorInput): ChronologyEvent[] {
  const events: ChronologyEvent[] = [];

  // Shift open
  if (input.activeShift?.openedAt) {
    events.push({
      id: 'shift-open',
      time: new Date(input.activeShift.openedAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      actor: 'Смена',
      action: 'Открыта',
      detail: null,
      type: 'shift_open',
    });
  }

  // Order events
  for (const ev of input.todayOrderEvents ?? []) {
    const t = new Date(ev.occurredAt);
    events.push({
      id: `ev-${ev.id}`,
      time: t.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      actor: instantOne(ev.actorEmployee)?.displayName ?? '—',
      action: ev.action === 'paid' ? 'Оплата' : ev.action,
      detail: null,
      type: ev.action === 'paid' ? 'order_paid' : 'order_new',
    });
  }

  // Cash movements
  for (const cm of input.todayCashMovements ?? []) {
    const t = new Date(cm.occurredAt);
    const amount = tiyinToDisplaySom(Number(cm.amountTiyin) || 0);
    events.push({
      id: `cm-${cm.id}`,
      time: t.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      actor: 'Касса',
      action: cm.movementType === 'float_out' ? 'Расход' : 'Приход',
      detail: `${amount} сом`,
      actionLabel: 'Касса',
      actionHref: '/transactions',
      type: 'expense',
    });
  }

  return events.sort((a, b) => b.time.localeCompare(a.time)).slice(0, CHRONOLOGY_LIMIT);
}

// ═══ Hook ═══════════════════════════════════════════════════════

function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useDashboardOperationalData(): {
  data: DashboardOperationalData | null;
  isLoading: boolean;
  error: Error | null;
} {
  const db = getInstantClient();
  const venueId = useVenueId();
  const now = useMinuteTick();

  // Read venue timezone — fallback to Asia/Bishkek
  const venueResult = db.useQuery({
    venues: { $: { where: { id: venueId } } },
  });
  const timeZone = (venueResult.data?.venues?.[0]?.timeZone as string) || 'Asia/Bishkek';

  const todayBounds = useMemo(() => venueToday(timeZone, now), [timeZone, now]);
  const yesterdayBounds = useMemo(() => venueYesterday(timeZone, now), [timeZone, now]);
  const lastWeekBounds = useMemo(() => venueSameElapsedLastWeek(timeZone, now), [timeZone, now]);

  // Bounded queries
  const todayOrdersResult = db.useQuery(
    adminDashboardTodayPaidOrdersQuery(venueId, todayBounds.start, todayBounds.end),
  );
  const activeOrdersResult = db.useQuery(adminDashboardActiveOrdersQuery(venueId));
  const cashMovementsResult = db.useQuery(
    adminDashboardCashMovementsQuery(venueId, todayBounds.start, todayBounds.end),
  );
  const activeShiftResult = db.useQuery(adminDashboardActiveShiftQuery(venueId));
  const yesterdayShiftResult = db.useQuery(
    adminDashboardYesterdayShiftQuery(venueId, yesterdayBounds.start, yesterdayBounds.end),
  );
  const yesterdayStuckResult = db.useQuery(
    adminDashboardYesterdayStuckOrdersQuery(venueId, yesterdayBounds.start, yesterdayBounds.end),
  );
  const lastWeekOrdersResult = db.useQuery(
    adminDashboardLastWeekSameDayOrdersQuery(venueId, lastWeekBounds.start, lastWeekBounds.end),
  );
  const orderEventsResult = db.useQuery(
    adminDashboardOrderEventsQuery(venueId, todayBounds.start, todayBounds.end, CHRONOLOGY_LIMIT),
  );
  const inventoryStateResult = db.useQuery(
    adminDashboardInventoryStateQuery(venueId),
  );
  const ingredientsResult = db.useQuery(
    adminDashboardThresholdIngredientsQuery(venueId),
  );

  const isLoading =
    venueResult.isLoading ||
    todayOrdersResult.isLoading ||
    activeOrdersResult.isLoading ||
    cashMovementsResult.isLoading ||
    activeShiftResult.isLoading ||
    yesterdayShiftResult.isLoading ||
    yesterdayStuckResult.isLoading ||
    lastWeekOrdersResult.isLoading ||
    orderEventsResult.isLoading ||
    inventoryStateResult.isLoading ||
    ingredientsResult.isLoading;

  const criticalErrorMessage =
    venueResult.error?.message ||
    todayOrdersResult.error?.message ||
    activeShiftResult.error?.message ||
    null;
  const error = useMemo(
    () => criticalErrorMessage ? new Error(criticalErrorMessage) : null,
    [criticalErrorMessage],
  );

  const data = useMemo((): DashboardOperationalData | null => {
    if (isLoading || error) return null;

    const selectorInput: SelectorInput = {
      todayOrders: todayOrdersResult.data?.orders ?? [],
      activeOrders: activeOrdersResult.data?.orders ?? [],
      todayCashMovements: cashMovementsResult.data?.cashMovements ?? [],
      todayOrderEvents: orderEventsResult.data?.orderEvents ?? [],
      activeShift: activeShiftResult.data?.shifts?.[0] ?? null,
      yesterdayShift: yesterdayShiftResult.data?.shifts?.[0] ?? null,
      yesterdayStuckOrders: yesterdayStuckResult.data?.orders ?? [],
      lastWeekSameDayOrders: lastWeekOrdersResult.data?.orders ?? [],
      warehouses: inventoryStateResult.data?.warehouses ?? [],
      stockItems: inventoryStateResult.data?.stockItems ?? [],
      inventorySessions: inventoryStateResult.data?.inventorySessions ?? [],
      inventoryUnavailable: Boolean(inventoryStateResult.error),
      ingredients: ingredientsResult.data?.products ?? [],
      now,
      venueTimeZone: timeZone,
    };

    const today = selectTodayKPI(selectorInput);
    const shift = selectShiftStatus(selectorInput);
    const activeOrders = selectActiveOrders(selectorInput);
    const yesterdayShift = selectYesterdayShift(selectorInput);
    const inventoryFreshness = selectInventoryFreshness(selectorInput);
    const stockAlerts = inventoryFreshness.status === 'current'
      ? selectStockAlerts(selectorInput)
      : [];
    const situations = selectSituations(selectorInput, inventoryFreshness, stockAlerts);
    const chronology = selectChronology(selectorInput);

    return {
      today,
      shift,
      activeOrders,
      yesterdayShift,
      situations,
      chronology,
      stockAlerts,
      inventoryFreshness,
      isTodayEmpty: todayOrdersResult.data?.orders?.length === 0,
      computedAt: now.toISOString(),
    };
  }, [
    isLoading, error, now, timeZone,
    todayOrdersResult.data, activeOrdersResult.data, cashMovementsResult.data,
    activeShiftResult.data, yesterdayShiftResult.data, yesterdayStuckResult.data,
    lastWeekOrdersResult.data, orderEventsResult.data, inventoryStateResult.data,
    inventoryStateResult.error, ingredientsResult.data,
  ]);

  return { data, isLoading, error };
}
