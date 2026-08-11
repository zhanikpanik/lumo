/**
 * Dashboard hook — uses pre-aggregated venueDailyStats (counter cache).
 *
 * Architecture:
 * - KPIs currently read the venueDailyStats projection; financial contributions are the rebuild source.
 * - Expenses: from cashMovements (float_out only, small data — ~5-30 rows/day).
 * - Alerts: from activeShift + activeOrders live queries.
 * - Chronology: from orderEvents (limit 20) + activeShift.
 * - Top dishes: from period orders (only week/month — deferred optimization).
 * - Sparklines: from 7 daily stats rows.
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
  adminDashboardOrderEventsQuery,
  adminDashboardThresholdIngredientsQuery,
  adminDashboardYesterdayShiftQuery,
  adminDashboardYesterdayStuckOrdersQuery,
  adminDashboardPeriodPaidOrdersQuery,
  adminDashboardDishesWithRecipesQuery,
  adminDashboardDailyStatsQuery,
} from '@lumo/data';
import type {
  DashboardData,
  Metric,
  Alert,
  AlertUrgencyGroups,
  ChronologyEvent,
  YesterdayShift,
  YesterdaySummary,
  TopDish,
} from '@/types/dashboard';

export type DashboardPeriod = 'today' | 'week' | 'month';

const CHRONOLOGY_LIMIT = 20;
const STUCK_THRESHOLD_MINUTES = 60;
const REVENUE_CRASH_THRESHOLD_SOM = 5000;

function getPeriodLabel(period: DashboardPeriod): string {
  if (period === 'today') return 'Сегодня';
  if (period === 'week') return 'Неделя';
  return 'Месяц';
}

function useMinuteTick(): Date {
  // Re-render every 60s for "hours open" counter.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function useDashboardNewData(period: DashboardPeriod = 'today', offset: number = 0) {
  const db = getInstantClient();
  const venueId = useVenueId();
  const now = useMinuteTick();

  // ── Venue (for timezone) ──
  const venueResult = db.useQuery({
    venues: { $: { where: { id: venueId } } },
  });
  const timeZone = (venueResult.data?.venues?.[0]?.timeZone as string) || 'Asia/Bishkek';

  const todayBounds = venueToday(timeZone, now);
  const yesterdayBounds = venueYesterday(timeZone, now);
  const lastWeekBounds = venueSameDayLastWeek(timeZone, now);
  const todayDay = isoDay(new Date(todayBounds.start));

  // ── Period bounds ──
  const periodStart = period === 'today'
    ? todayBounds.start
    : period === 'week'
      ? new Date(new Date(todayBounds.start).getTime() + offset * 7 * 86400000 - 7 * 86400000).toISOString()
      : (() => {
          const d = new Date(todayBounds.start);
          const refMonth = d.getMonth() + offset;
          const refYear = d.getFullYear() + Math.floor(refMonth / 12);
          const normMonth = ((refMonth % 12) + 12) % 12;
          return new Date(Date.UTC(refYear, normMonth, 1)).toISOString();
        })();
  const periodEnd = todayBounds.end;

  const periodStartDay = isoDay(new Date(periodStart));
  const periodEndDay = todayDay;

  // ── Pre-aggregated daily stats (replaces raw order queries) ──
  const todayStatsResult = db.useQuery(adminDashboardDailyStatsQuery(venueId, todayDay, todayDay));
  const periodStatsResult = db.useQuery(
    adminDashboardDailyStatsQuery(venueId, periodStartDay, periodEndDay),
  );
  const lastWeekStatsResult = db.useQuery(
    adminDashboardDailyStatsQuery(
      venueId,
      isoDay(new Date(lastWeekBounds.start)),
      isoDay(new Date(lastWeekBounds.start)),
    ),
  );
  // Sparklines: last 7 days
  const weekSparklineStart = isoDay(new Date(new Date(todayBounds.start).getTime() - 6 * 86400000));
  const sparklineStatsResult = db.useQuery(
    adminDashboardDailyStatsQuery(venueId, weekSparklineStart, todayDay),
  );

  // ── Live queries (lightweight — small row counts) ──
  const activeOrdersResult = db.useQuery(adminDashboardActiveOrdersQuery(venueId));
  const activeShiftResult = db.useQuery(adminDashboardActiveShiftQuery(venueId));
  const orderEventsResult = db.useQuery(
    adminDashboardOrderEventsQuery(venueId, todayBounds.start, todayBounds.end, CHRONOLOGY_LIMIT),
  );
  const cashMovementsResult = db.useQuery(
    adminDashboardCashMovementsQuery(venueId, todayBounds.start, todayBounds.end),
  );
  const yesterdayShiftResult = db.useQuery(
    adminDashboardYesterdayShiftQuery(venueId, yesterdayBounds.start, yesterdayBounds.end),
  );
  const yesterdayStuckResult = db.useQuery(
    adminDashboardYesterdayStuckOrdersQuery(venueId, yesterdayBounds.start, yesterdayBounds.end),
  );
  const thresholdIngredientsResult = db.useQuery(adminDashboardThresholdIngredientsQuery(venueId));

  // ── Period raw orders (only used for top dishes in week/month view) ──
  const periodOrdersResult = db.useQuery(
    adminDashboardPeriodPaidOrdersQuery(venueId, periodStart, periodEnd),
  );
  const dishesResult = db.useQuery(adminDashboardDishesWithRecipesQuery(venueId));

  // ── Loading & error ──
  const isLoading =
    venueResult.isLoading ||
    todayStatsResult.isLoading ||
    periodStatsResult.isLoading ||
    lastWeekStatsResult.isLoading ||
    sparklineStatsResult.isLoading ||
    activeOrdersResult.isLoading ||
    activeShiftResult.isLoading ||
    orderEventsResult.isLoading ||
    cashMovementsResult.isLoading ||
    yesterdayShiftResult.isLoading ||
    yesterdayStuckResult.isLoading ||
    thresholdIngredientsResult.isLoading ||
    periodOrdersResult.isLoading || dishesResult.isLoading;

  const criticalError =
    venueResult.error || todayStatsResult.error || activeShiftResult.error;

  const error = criticalError
    ? new Error(criticalError.message ?? 'Dashboard data unavailable')
    : null;

  return useMemo((): {
    data: DashboardData | undefined;
    isPending: boolean;
    isError: boolean;
    error: Error | null;
  } => {
    if (isLoading) return { data: undefined, isPending: true, isError: false, error: null };
    if (error) return { data: undefined, isPending: false, isError: true, error };

    // ── Extract stats rows ──
    const todayStats = todayStatsResult.data?.venueDailyStats?.[0];
    const periodStats = periodStatsResult.data?.venueDailyStats ?? [];
    const lastWeekStats = lastWeekStatsResult.data?.venueDailyStats?.[0];
    const sparklineStats = sparklineStatsResult.data?.venueDailyStats ?? [];

    const activeOrders = activeOrdersResult.data?.orders ?? [];
    const activeShift = activeShiftResult.data?.shifts?.[0] ?? null;
    const orderEvents = orderEventsResult.data?.orderEvents ?? [];
    const todayCash = cashMovementsResult.data?.cashMovements ?? [];
    const yesterdayShift = yesterdayShiftResult.data?.shifts?.[0] ?? null;
    const yesterdayStuck = yesterdayStuckResult.data?.orders ?? [];
    const thresholdIngredients = thresholdIngredientsResult.data?.products ?? [];

    // ── Today KPI (from single stats row) ──
    const todayRevenue = Number(todayStats?.revenueTiyin) || 0;
    const todayChecks = Number(todayStats?.orderCount) || 0;
    const todayAvgCheck = todayChecks > 0 ? Math.round(todayRevenue / todayChecks) : 0;
    const todayFoodCost = Number(todayStats?.foodCostTiyin) || 0;
    const foodCostPercentToday = todayRevenue > 0 ? Math.round((todayFoodCost / todayRevenue) * 100) : 0;

    // Expenses: from float_out cash movements (small data, live query)
    const todayExpense = todayCash
      .filter((m: any) => m.movementType === 'float_out')
      .reduce((s: number, m: any) => s + (Number(m.amountTiyin) || 0), 0);

    // ── Last week comparison (from single stats row) ──
    const lastWeekRevenue = Number(lastWeekStats?.revenueTiyin) || 0;
    const lastWeekChecks = Number(lastWeekStats?.orderCount) || 0;
    const lastWeekAvgCheck = lastWeekChecks > 0 ? Math.round(lastWeekRevenue / lastWeekChecks) : 0;
    const todayRevenueTrend = lastWeekRevenue > 0
      ? Math.round(((todayRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
      : todayRevenue > 0 ? 100 : 0;
    const todayCheckTrend = lastWeekChecks > 0 ? todayChecks - lastWeekChecks : todayChecks;
    const todayAvgCheckTrend = lastWeekAvgCheck > 0
      ? Math.round(((todayAvgCheck - lastWeekAvgCheck) / lastWeekAvgCheck) * 100)
      : todayAvgCheck > 0 ? 100 : 0;

    // ── Period KPI (sum daily stats) ──
    const periodRevenue = periodStats.reduce(
      (s: number, r: any) => s + (Number(r.revenueTiyin) || 0), 0,
    );
    const periodChecks = periodStats.reduce(
      (s: number, r: any) => s + (Number(r.orderCount) || 0), 0,
    );
    const periodAvgCheck = periodChecks > 0 ? Math.round(periodRevenue / periodChecks) : 0;
    const periodFoodCost = periodStats.reduce(
      (s: number, r: any) => s + (Number(r.foodCostTiyin) || 0), 0,
    );
    const foodCostPercent = periodRevenue > 0 ? Math.round((periodFoodCost / periodRevenue) * 100) : 0;

    // Period expense: still from cashMovements query for period (not pre-aggregated yet)
    // For now, only today expenses are available. Period expenses deferred.
    const periodExpense = period === 'today' ? todayExpense : 0;

    // ── Top dishes (period only — raw order aggregation, deferred optimization) ──
    let topDishes: TopDish[] = [];
    let antiTop: TopDish[] = [];
    let totalFoodCost = periodFoodCost;

    if (period !== 'today') {
      const periodOrders = periodOrdersResult.data?.orders ?? [];
      const paidPeriod = periodOrders.filter((o: any) => o.status === 'paid');
      const dishes = dishesResult.data?.products ?? [];

      const dishMap = new Map<string, { name: string; qty: number; revenue: number }>();
      for (const o of paidPeriod) {
        for (const item of (o.items ?? [])) {
          const pid = item.product?.id;
          if (!pid) continue;
          const qty = Number(item.quantity) || 1;
          const price = Number(item.productPriceTiyin) || 0;
          const existing = dishMap.get(pid) || {
            name: (item.productName as string) || item.product?.name || pid,
            qty: 0,
            revenue: 0,
          };
          existing.qty += qty;
          existing.revenue += qty * price;
          dishMap.set(pid, existing);
        }
      }

      // Food cost per dish
      const dishById = new Map(dishes.map((d: any) => [d.id, d]));
      const costByDishId = new Map<string, number>();
      for (const [dishId, info] of dishMap) {
        const dish = dishById.get(dishId);
        if (!dish?.recipeItems?.length) continue;
        const totalSold = info.qty;
        let cost = 0;
        for (const ri of dish.recipeItems) {
          const ing = ri.ingredient;
          if (!ing) continue;
          const ingCostTiyin = Number(ing.costTiyin) || 0;
          const riQty = Number(ri.quantityMilli) || 0;
          const lineCost = Math.round((riQty / 1000) * (ingCostTiyin / 1000) * totalSold);
          cost += lineCost;
        }
        costByDishId.set(dishId, cost);
      }

      topDishes = Array.from(dishMap.entries())
        .map(([id, { name, qty, revenue }]) => ({
          name,
          qty,
          revenue,
          cost: costByDishId.get(id) || 0,
          margin: revenue - (costByDishId.get(id) || 0),
        }))
        .sort((a, b) => b.margin - a.margin);

      totalFoodCost = topDishes.reduce((s, d) => s + d.cost, 0);
      antiTop = topDishes
        .filter((d) => d.margin <= 0 || (d.revenue > 0 && d.margin / d.revenue < 0.05))
        .sort((a, b) => a.margin - b.margin)
        .slice(0, 3);
    }

    // ── Alerts ──
    const alerts: Alert[] = [];
    if (!activeShift) {
      alerts.push({
        id: 'no-active-shift',
        type: 'critical',
        message: 'Нет активной смены — касса не открыта',
        actionLabel: 'Открыть смену →',
        actionHref: '/cash-shifts',
        domain: 'cash',
        urgency: 'urgent',
      });
    }
    if (yesterdayShift && !yesterdayShift.closedAt) {
      alerts.push({
        id: 'yesterday-shift-open',
        type: 'critical',
        message: 'Вчерашняя смена не закрыта',
        actionLabel: 'Закрыть смену →',
        actionHref: '/cash-shifts',
        domain: 'cash',
        urgency: 'urgent',
      });
    }
    const sixtyMinAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const stuck = activeOrders.filter((o: any) => (o.openedAt as string) < sixtyMinAgo);
    if (stuck.length > 0) {
      alerts.push({
        id: 'stuck-orders',
        type: stuck.length > 5 ? 'critical' : 'warning',
        message: `${stuck.length} заказ${stuck.length === 1 ? '' : stuck.length < 5 ? 'а' : 'ов'} висит больше 1 ч`,
        actionLabel: 'Проверить →',
        actionHref: '/checks',
        domain: 'checks',
        urgency: 'important',
      });
    }
    if (yesterdayStuck.length > 0) {
      alerts.push({
        id: 'yesterday-stuck',
        type: 'critical',
        message: `${yesterdayStuck.length} незакрытых заказ${yesterdayStuck.length === 1 ? '' : yesterdayStuck.length < 5 ? 'а' : 'ов'} со вчера`,
        actionLabel: 'Проверить →',
        actionHref: '/checks',
        domain: 'checks',
        urgency: 'urgent',
      });
    }
    if (todayRevenue > 0 && todayExpense > todayRevenue) {
      alerts.push({
        id: 'expense-over-revenue',
        type: 'critical',
        message: 'Расходы превышают выручку',
        actionLabel: 'Проверить расходы →',
        actionHref: '/transactions',
        domain: 'cash',
        urgency: 'urgent',
      });
    }
    if (lastWeekRevenue > REVENUE_CRASH_THRESHOLD_SOM * 100 && todayRevenue < lastWeekRevenue * 0.5) {
      alerts.push({
        id: 'revenue-crash',
        type: 'warning',
        message: `Выручка упала на ${Math.round((1 - todayRevenue / lastWeekRevenue) * 100)}% к прошлой неделе`,
        actionLabel: 'Проверить чеки →',
        actionHref: '/checks',
        domain: 'checks',
        urgency: 'important',
      });
    }

    // Stock alerts — from threshold ingredients (live query, small data)
    let negativeCount = 0;
    let zeroCount = 0;
    for (const ing of thresholdIngredients) {
      // Stock balance for threshold ingredients only (live query is small)
      const bal = 0; // Simplified: actual balance needs inventoryMovements aggregation
      if (bal < 0) negativeCount++;
      else if (bal === 0) zeroCount++;
    }
    // Stock alert disabled for now — needs inventoryMovements which we removed.
    // Will add a separate pre-aggregated stock snapshot later.

    // ── Shift status ──
    const shiftHours = activeShift?.openedAt
      ? (now.getTime() - new Date(activeShift.openedAt as string).getTime()) / (1000 * 60 * 60)
      : 0;

    const shiftStatus = {
      isOpen: !!activeShift,
      openedAt: activeShift?.openedAt
        ? new Date(activeShift.openedAt as string).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null,
      hoursOpen: shiftHours || null,
      cashier: activeShift?.openedBy?.displayName ?? null,
    };

    // ── Yesterday ──
    const yesterdayShiftData: YesterdayShift | null = yesterdayShift
      ? {
          closed: !!yesterdayShift.closedAt,
          revenue: null,
          checks: null,
          cashDifference: null,
          closedAt: yesterdayShift.closedAt as string | null,
        }
      : null;

    const yesterday: YesterdaySummary = {
      revenue: null,
      checks: null,
      shiftClosed: yesterdayShift
        ? yesterdayShift.closedAt
          ? 'closed'
          : 'open'
        : null,
      cashDifference: null,
      status: 'normal',
    };

    // ── Chronology ──
    const chronology: ChronologyEvent[] = [];
    if (activeShift?.openedAt) {
      chronology.push({
        id: 'shift-open',
        time: new Date(activeShift.openedAt as string).toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        actor: 'Смена',
        action: 'Открыта',
        detail: null,
        type: 'shift_open',
      });
    }
    for (const ev of orderEvents) {
      chronology.push({
        id: `ev-${ev.id}`,
        time: new Date(ev.occurredAt as string).toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        actor: (ev as any).actorEmployee?.displayName ?? '—',
        action: ev.action === 'paid' ? 'Оплата' : ev.action,
        detail: null,
        type: ev.action === 'paid' ? 'order_paid' : 'order_new',
      });
    }
    for (const cm of todayCash) {
      chronology.push({
        id: `cm-${cm.id}`,
        time: new Date(cm.occurredAt as string).toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        actor: 'Касса',
        action: cm.movementType === 'float_out' ? 'Расход' : 'Приход',
        detail: `${Math.round(Number(cm.amountTiyin) / 100 || 0)} сом`,
        actionLabel: 'Касса',
        actionHref: '/transactions',
        type: 'expense',
      });
    }
    chronology.sort((a, b) => b.time.localeCompare(a.time));

    // ── Sparklines from daily stats ──
    const sparklineByDay = new Map<string, any>();
    for (const s of sparklineStats) {
      sparklineByDay.set(s.day as string, s);
    }

    const dailyRevenues: number[] = [];
    const dailyChecks: number[] = [];
    const dailyAvgChecks: number[] = [];
    const dailyExpenses: number[] = [];
    const todayDate = new Date(todayBounds.start);
    for (let d = 6; d >= 0; d--) {
      const dayStart = new Date(todayDate.getTime() - d * 86400000);
      const dayKey = isoDay(dayStart);
      const s = sparklineByDay.get(dayKey);
      const rev = Number(s?.revenueTiyin) || 0;
      const cnt = Number(s?.orderCount) || 0;
      dailyRevenues.push(rev);
      dailyChecks.push(cnt);
      dailyAvgChecks.push(cnt > 0 ? Math.round(rev / cnt) : 0);
      dailyExpenses.push(0); // expenses not pre-aggregated yet — placeholder
    }

    const weekRevenue = dailyRevenues.reduce((a, b) => a + b, 0);
    const weekChecks = dailyChecks.reduce((a, b) => a + b, 0);

    // ── Metrics ──
    const isTodayEmpty = period === 'today' && todayChecks === 0;
    const metrics: Metric[] = [
      {
        label: 'Выручка',
        todayValue: todayRevenue,
        periodValue: periodRevenue,
        format: 'som',
        todayTrend: isTodayEmpty
          ? null
          : { value: todayRevenueTrend, prevPeriod: lastWeekRevenue },
      },
      {
        label: 'Чеков',
        todayValue: todayChecks,
        periodValue: periodChecks,
        format: 'count',
        todayTrend: isTodayEmpty
          ? null
          : { value: todayCheckTrend, prevPeriod: lastWeekChecks },
      },
      {
        label: 'Ср. чек',
        todayValue: todayAvgCheck,
        periodValue: periodAvgCheck,
        format: 'som',
        todayTrend: isTodayEmpty
          ? null
          : { value: todayAvgCheckTrend, prevPeriod: lastWeekAvgCheck },
      },
      {
        label: 'Расходы',
        todayValue: todayExpense,
        periodValue: periodExpense,
        format: 'som',
        todayTrend: null,
      },
      {
        label: 'Фудкост',
        todayValue: foodCostPercentToday,
        periodValue: foodCostPercent,
        format: 'percent',
        todayTrend: null,
      },
    ];

    // ── Alert urgency ──
    const alertUrgencyGroups: AlertUrgencyGroups = {
      urgent: alerts.filter((a) => a.urgency === 'urgent'),
      important: alerts.filter((a) => a.urgency === 'important'),
      background: alerts.filter((a) => a.urgency === 'background'),
    };

    const data: DashboardData = {
      metrics,
      alerts,
      alertGroups: null,
      alertUrgencyGroups,
      totalAlertCount: alerts.length,
      criticalCount: alerts.filter((a) => a.type === 'critical').length,
      chronology: chronology.slice(0, 12),
      warehouseThreats: [],
      shiftStatus,
      yesterdayShift: yesterdayShiftData,
      yesterday,
      topDishes,
      isTodayEmpty,
      weekRevenue,
      weekChecks,
      antiTop,
      migrationCards: [],
      periodLabel: getPeriodLabel(period),
      negativeStockItems: [],
      foodCost: totalFoodCost,
      dailyRevenues,
      dailyChecks,
      dailyAvgChecks,
      dailyExpenses,
    };

    return { data, isPending: false, isError: false, error: null };
  }, [
    isLoading,
    error,
    now,
    timeZone,
    todayStatsResult.data,
    periodStatsResult.data,
    lastWeekStatsResult.data,
    sparklineStatsResult.data,
    activeOrdersResult.data,
    activeShiftResult.data,
    orderEventsResult.data,
    cashMovementsResult.data,
    yesterdayShiftResult.data,
    yesterdayStuckResult.data,
    thresholdIngredientsResult.data,
    periodOrdersResult.data,
    dishesResult.data,
  ]);
}
