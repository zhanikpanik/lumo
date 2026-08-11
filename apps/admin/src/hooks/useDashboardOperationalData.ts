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
  venueSameDayLastWeek,
  adminDashboardActiveOrdersQuery,
  adminDashboardActiveShiftQuery,
  adminDashboardCashMovementsQuery,
  adminDashboardInventoryPageQuery,
  adminDashboardLastWeekSameDayOrdersQuery,
  adminDashboardOrderEventsQuery,
  adminDashboardThresholdIngredientsQuery,
  adminDashboardTodayPaidOrdersQuery,
  adminDashboardYesterdayShiftQuery,
  adminDashboardYesterdayStuckOrdersQuery,
} from '@lumo/data';
import type {
  DashboardOperationalData,
  TodayKPI,
  ShiftStatus,
  ActiveOrdersStatus,
  StockAlert,
  Alert,
  AlertUrgencyGroups,
  ChronologyEvent,
  YesterdayShift,
} from '@/types/dashboard';

// ═══ Constants ══════════════════════════════════════════════════

const CHRONOLOGY_LIMIT = 20;
const INVENTORY_PAGE_SIZE = 500;
const STUCK_THRESHOLD_MINUTES = 60;

// ═══ Selectors (pure, no React, no InstantDB) ══════════════════

function tiyinToDisplaySom(t: number): number {
  return Math.round(t / 100);
}

interface SelectorInput {
  todayOrders: any[];
  activeOrders: any[];
  todayCashMovements: any[];
  todayOrderEvents: any[];
  activeShift: any | null;
  yesterdayShift: any | null;
  yesterdayStuckOrders: any[];
  lastWeekSameDayOrders: any[];
  inventoryMovements: any[];
  ingredients: any[];
  now: Date;
  venueTimeZone: string;
}

function selectTodayKPI(input: SelectorInput): TodayKPI | null {
  const paid = input.todayOrders.filter((o: any) => o.status === 'paid');
  const revenueTiyin = paid.reduce((s: number, o: any) => s + (Number(o.totalAmountTiyin) || 0), 0);
  const paidOrderCount = paid.length;
  const averageCheckTiyin = paidOrderCount > 0 ? Math.round(revenueTiyin / paidOrderCount) : 0;

  const expenses = input.todayCashMovements
    .filter((m: any) => m.movementType === 'float_out' || m.movementType === 'expense')
    .reduce((s: number, m: any) => s + (Number(m.amountTiyin) || 0), 0);

  // Food cost from payment snapshots
  const foodCostTiyin = paid.reduce(
    (s: number, o: any) => s + (o.payments ?? []).reduce((ps: number, p: any) => ps + (Number(p.foodCostTiyin) || 0), 0),
    0,
  );

  const foodCostPercent = revenueTiyin > 0 ? Math.round((foodCostTiyin / revenueTiyin) * 100) : null;

  // Trend vs same day last week
  const lastWeekRevenue = (input.lastWeekSameDayOrders ?? []).reduce(
    (s: number, o: any) => s + (Number(o.totalAmountTiyin) || 0), 0,
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
    ? (input.now.getTime() - new Date(s.openedAt as string).getTime()) / (1000 * 60 * 60)
    : 0;
  return {
    isOpen: true,
    openedAt: s.openedAt as string | null,
    hoursOpen,
    cashier: s.openedBy?.displayName ?? null,
  };
}

function selectActiveOrders(input: SelectorInput): ActiveOrdersStatus {
  const sixtyMinAgo = new Date(input.now.getTime() - STUCK_THRESHOLD_MINUTES * 60 * 1000).toISOString();
  const stuck = input.activeOrders.filter((o: any) => (o.openedAt as string) < sixtyMinAgo);
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
  const yesterdayPaid = input.todayOrders.filter((o: any) => {
    // This is approximate — we'd need a separate query for yesterday's paid orders
    // For now, yesterday shift status comes from the shift itself
    return false;
  });
  return {
    closed: isClosed,
    revenue: null, // Would need yesterday's orders query
    checks: null,
    cashDifference: isClosed ? diff : null,
    closedAt: s.closedAt as string | null,
  };
}

function selectAlerts(input: SelectorInput): Alert[] {
  const alerts: Alert[] = [];
  const paid = input.todayOrders.filter((o: any) => o.status === 'paid');
  const todayRevenue = paid.reduce((s: number, o: any) => s + (Number(o.totalAmountTiyin) || 0), 0);
  const todayExpense = input.todayCashMovements
    .filter((m: any) => m.movementType === 'float_out' || m.movementType === 'expense')
    .reduce((s: number, m: any) => s + (Number(m.amountTiyin) || 0), 0);

  // No active shift
  if (!input.activeShift) {
    alerts.push({
      id: 'no-active-shift', type: 'critical',
      message: 'Нет активной смены — касса не открыта',
      actionLabel: 'Открыть смену →', actionHref: '/cash-shifts',
      domain: 'cash', urgency: 'urgent',
    });
  }

  // Yesterday shift not closed
  if (input.yesterdayShift && !input.yesterdayShift.closedAt) {
    alerts.push({
      id: 'yesterday-shift-open', type: 'critical',
      message: 'Вчерашняя смена не закрыта',
      actionLabel: 'Закрыть смену →', actionHref: '/cash-shifts',
      domain: 'cash', urgency: 'urgent',
    });
  }

  // Stuck orders > 60 min
  const active = selectActiveOrders(input);
  if (active.stuckOlderThan60Min > 0) {
    alerts.push({
      id: 'stuck-orders', type: active.stuckOlderThan60Min > 5 ? 'critical' : 'warning',
      message: `${active.stuckOlderThan60Min} заказ${active.stuckOlderThan60Min === 1 ? '' : active.stuckOlderThan60Min < 5 ? 'а' : 'ов'} висит больше 1 ч`,
      actionLabel: 'Проверить →', actionHref: '/checks',
      domain: 'checks', urgency: 'important',
    });
  }

  // Yesterday stuck orders
  const yestStuck = input.yesterdayStuckOrders.length;
  if (yestStuck > 0) {
    alerts.push({
      id: 'yesterday-stuck', type: 'critical',
      message: `${yestStuck} незакрытых заказ${yestStuck === 1 ? '' : yestStuck < 5 ? 'а' : 'ов'} со вчера`,
      actionLabel: 'Проверить →', actionHref: '/checks',
      domain: 'checks', urgency: 'urgent',
    });
  }

  // Expenses > revenue
  if (todayRevenue > 0 && todayExpense > todayRevenue) {
    alerts.push({
      id: 'expense-over-revenue', type: 'critical',
      message: `Расходы превышают выручку`,
      actionLabel: 'Проверить расходы →', actionHref: '/transactions',
      domain: 'cash', urgency: 'urgent',
    });
  }

  // Revenue crash vs last week
  const lastWeekRevenue = (input.lastWeekSameDayOrders ?? []).reduce(
    (s: number, o: any) => s + (Number(o.totalAmountTiyin) || 0), 0,
  );
  if (lastWeekRevenue > 500000 && todayRevenue < lastWeekRevenue * 0.5) {
    alerts.push({
      id: 'revenue-crash', type: 'warning',
      message: `Выручка упала на ${Math.round((1 - todayRevenue / lastWeekRevenue) * 100)}% к прошлой неделе`,
      actionLabel: 'Проверить чеки →', actionHref: '/checks',
      domain: 'checks', urgency: 'important',
    });
  }

  // Today empty
  if (input.todayOrders.length === 0 && input.activeShift) {
    alerts.push({
      id: 'today-empty', type: 'warning',
      message: 'Сегодня нет заказов. Проверьте, открыта ли касса.',
      actionLabel: null, actionHref: null,
      domain: 'checks', urgency: 'important',
    });
  }

  return alerts;
}

function selectStockAlerts(input: SelectorInput): StockAlert[] {
  const balanceByProduct = new Map<string, number>();
  for (const m of input.inventoryMovements) {
    const pid = m.product?.id;
    if (!pid) continue;
    balanceByProduct.set(pid, (balanceByProduct.get(pid) ?? 0) + (m.quantityDeltaMilli ?? 0));
  }

  const alerts: StockAlert[] = [];
  for (const ing of input.ingredients) {
    const balance = balanceByProduct.get(ing.id) ?? 0;
    const threshold = ing.lowStockThresholdMilli ?? 0;

    if (balance < 0) {
      alerts.push({
        productId: ing.id,
        name: ing.name,
        balanceMilli: balance,
        unit: ing.unit ?? '',
        level: 'negative',
      });
    } else if (balance === 0) {
      alerts.push({
        productId: ing.id,
        name: ing.name,
        balanceMilli: 0,
        unit: ing.unit ?? '',
        level: 'zero',
      });
    } else if (threshold > 0 && balance < threshold) {
      alerts.push({
        productId: ing.id,
        name: ing.name,
        balanceMilli: balance,
        unit: ing.unit ?? '',
        level: 'low',
      });
    }
  }
  return alerts;
}

function selectChronology(input: SelectorInput): ChronologyEvent[] {
  const events: ChronologyEvent[] = [];

  // Shift open
  if (input.activeShift?.openedAt) {
    events.push({
      id: 'shift-open',
      time: new Date(input.activeShift.openedAt as string).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      actor: 'Смена',
      action: 'Открыта',
      detail: null,
      type: 'shift_open',
    });
  }

  // Order events
  for (const ev of input.todayOrderEvents ?? []) {
    const t = new Date(ev.occurredAt as string);
    events.push({
      id: `ev-${ev.id}`,
      time: t.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      actor: ev.actorEmployee?.displayName ?? '—',
      action: ev.action === 'paid' ? 'Оплата' : ev.action,
      detail: null,
      type: ev.action === 'paid' ? 'order_paid' : 'order_new',
    });
  }

  // Cash movements
  for (const cm of input.todayCashMovements ?? []) {
    const t = new Date(cm.occurredAt as string);
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
  const lastWeekBounds = useMemo(() => venueSameDayLastWeek(timeZone, now), [timeZone, now]);

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
  const inventoryResult = db.useQuery(
    adminDashboardInventoryPageQuery(venueId, INVENTORY_PAGE_SIZE),
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
    inventoryResult.isLoading ||
    ingredientsResult.isLoading;

  const criticalError =
    venueResult.error ||
    todayOrdersResult.error ||
    activeShiftResult.error;

  const error = criticalError
    ? new Error(criticalError.message ?? 'Dashboard data unavailable')
    : null;

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
      inventoryMovements: inventoryResult.data?.inventoryMovements ?? [],
      ingredients: ingredientsResult.data?.products ?? [],
      now,
      venueTimeZone: timeZone,
    };

    const today = selectTodayKPI(selectorInput);
    const shift = selectShiftStatus(selectorInput);
    const activeOrders = selectActiveOrders(selectorInput);
    const yesterdayShift = selectYesterdayShift(selectorInput);
    const alerts = selectAlerts(selectorInput);
    const stockAlerts = selectStockAlerts(selectorInput);
    const chronology = selectChronology(selectorInput);

    const alertUrgencyGroups: AlertUrgencyGroups = {
      urgent: alerts.filter(a => a.urgency === 'urgent'),
      important: alerts.filter(a => a.urgency === 'important'),
      background: alerts.filter(a => a.urgency === 'background'),
    };

    return {
      today,
      shift,
      activeOrders,
      yesterdayShift,
      alerts,
      alertUrgencyGroups,
      chronology,
      stockAlerts,
      isTodayEmpty: todayOrdersResult.data?.orders?.length === 0,
      computedAt: now.toISOString(),
    };
  }, [
    isLoading, error, now, timeZone,
    todayOrdersResult.data, activeOrdersResult.data, cashMovementsResult.data,
    activeShiftResult.data, yesterdayShiftResult.data, yesterdayStuckResult.data,
    lastWeekOrdersResult.data, orderEventsResult.data, inventoryResult.data,
    ingredientsResult.data,
  ]);

  return { data, isLoading, error };
}
