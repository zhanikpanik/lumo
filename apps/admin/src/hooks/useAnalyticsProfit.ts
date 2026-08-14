import { useQuery } from '@tanstack/react-query';
import type { InstaQLParams } from '@instantdb/react';
import { adminDashboardPeriodPaidOrdersQuery, type AppSchema } from '@lumo/data';
import { getInstantClient } from '@/data/instant';
import { instantOne } from '@/lib/instantLink';
import { useVenueId } from './useVenueId';

export interface DailyProfitRow {
  date: string;
  dayOfWeek: string;
  revenue: number;
  theoreticalCogs: number;
  actualCogs: number | null;
  laborHours: number;
  laborCost: number;
  primeCostPct: number | null;
  splh: number | null;
  ebit: number | null;
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
}

const DAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function dateKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function dayOfWeekIndex(value: Date | string): number {
  const day = new Date(value).getDay();
  return day === 0 ? 6 : day - 1;
}

function periodLabel(start: string, end: string): string {
  const first = new Date(start);
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}–${last.getDate()} ${MONTH_LABELS[last.getMonth()]} ${last.getFullYear()}`
    : `${first.getDate()} ${MONTH_LABELS[first.getMonth()]} – ${last.getDate()} ${MONTH_LABELS[last.getMonth()]} ${last.getFullYear()}`;
}

function profitSupportQuery(venueId: string) {
  return {
    venues: { $: { where: { id: venueId }, limit: 1 } },
    shifts: {
      $: { where: { 'venue.id': venueId }, limit: 1000 },
    },
  } satisfies InstaQLParams<AppSchema>;
}

async function fetchProfitData(venueId: string, start: string, end: string): Promise<ProfitData> {
  const db = getInstantClient();
  const [ordersResult, supportResult] = await Promise.all([
    db.queryOnce(adminDashboardPeriodPaidOrdersQuery(venueId, start, end)),
    db.queryOnce(profitSupportQuery(venueId)),
  ]);

  const revenueByDay = new Map<string, number>();
  const cogsByDay = new Map<string, number>();
  const revenueByHour = new Map<string, number>();
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
    const hourKey = `${dayOfWeekIndex(openedAt)}:${openedAt.getHours()}`;
    revenueByHour.set(hourKey, (revenueByHour.get(hourKey) ?? 0) + orderRevenue);
  }

  const laborByDay = new Map<string, number>();
  const laborByHour = new Map<string, number>();
  const periodStart = new Date(start);
  const periodEnd = new Date(end);
  for (const shift of supportResult.data.shifts ?? []) {
    const shiftStart = new Date(shift.openedAt);
    const shiftEnd = shift.closedAt ? new Date(shift.closedAt) : new Date();
    if (shiftEnd <= periodStart || shiftStart >= periodEnd) continue;
    const boundedStart = shiftStart < periodStart ? periodStart : shiftStart;
    const boundedEnd = shiftEnd > periodEnd ? periodEnd : shiftEnd;

    for (let cursor = new Date(boundedStart); cursor < boundedEnd;) {
      const nextHour = new Date(cursor);
      nextHour.setMinutes(0, 0, 0);
      nextHour.setHours(nextHour.getHours() + 1);
      const segmentEnd = nextHour < boundedEnd ? nextHour : boundedEnd;
      const hours = (segmentEnd.getTime() - cursor.getTime()) / 3_600_000;
      const day = dateKey(cursor);
      laborByDay.set(day, (laborByDay.get(day) ?? 0) + hours);
      const hourKey = `${dayOfWeekIndex(cursor)}:${cursor.getHours()}`;
      laborByHour.set(hourKey, (laborByHour.get(hourKey) ?? 0) + hours);
      cursor = segmentEnd;
    }
  }

  const venue = supportResult.data.venues?.[0];
  const dailyLaborCost = (venue?.dailyLaborCostTiyin ?? 0) / 100;
  const rows: DailyProfitRow[] = [];
  for (let cursor = new Date(start); cursor < new Date(end); cursor.setDate(cursor.getDate() + 1)) {
    const day = dateKey(cursor);
    const revenue = revenueByDay.get(day) ?? 0;
    const theoreticalCogs = cogsByDay.get(day) ?? 0;
    const laborHours = laborByDay.get(day) ?? 0;
    const laborCost = laborHours > 0 ? dailyLaborCost : 0;
    rows.push({
      date: day,
      dayOfWeek: DAY_LABELS[cursor.getDay()],
      revenue,
      theoreticalCogs,
      actualCogs: null,
      laborHours,
      laborCost,
      primeCostPct: revenue > 0 ? ((theoreticalCogs + laborCost) / revenue) * 100 : null,
      splh: laborHours > 0 ? revenue / laborHours : null,
      ebit: revenue > 0 ? revenue - theoreticalCogs - laborCost : null,
    });
  }

  const splhHeatmap: HourlySplhCell[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    for (let hour = 7; hour <= 23; hour++) {
      const key = `${dayIndex}:${hour}`;
      const revenue = revenueByHour.get(key) ?? 0;
      const laborHours = laborByHour.get(key) ?? 0;
      splhHeatmap.push({
        dayIndex,
        hour,
        revenue,
        laborHours,
        splh: laborHours > 0 ? revenue / laborHours : null,
      });
    }
  }

  return {
    rows,
    splhHeatmap,
    periodLabel: periodLabel(start, end),
    hourlyRate: 0,
    dailyFixedCost: dailyLaborCost,
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
