import { useState, useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import warehouseIcon from '@/assets/icons/warehouse.svg?raw';
import clockIcon from '@/assets/icons/clock.svg?raw';
import receiptIcon from '@/assets/icons/sheet-of-paper.svg?raw';
import walletIcon from '@/assets/icons/wallet.svg?raw';
import truckIcon from '@/assets/icons/truck.svg?raw';
import ReactECharts from 'echarts-for-react';
import { CHART_MUTED, TOOLTIP_STYLE } from '@/lib/chartTheme';
import { useDashboardNewData, type DashboardPeriod } from '@/hooks/useDashboardNewData';
import { getMockData } from '@/hooks/useDashboardMockData';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { DataTable } from '@/components/ui/DataTable';
import { ActionBar } from '@/components/dashboard/ActionBar';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { MigrationCard } from '@/components/dashboard/MigrationCard';
import { ChronologyFeed } from '@/components/dashboard/ChronologyFeed';
import type { Alert, TopDish } from '@/types/dashboard';

const PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
];

function fmtSom(n: number | undefined | null): string {
  if (n == null) return '0';
  return Math.round(n).toLocaleString('ru-RU');
}

function formatPeriodRange(period: DashboardPeriod, offset: number = 0): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  switch (period) {
    case 'today': return fmt(today);
    case 'week': {
      const refDate = new Date(today.getTime() + offset * 7 * 86400000);
      const weekAgo = new Date(refDate.getTime() - 6 * 86400000);
      return `${fmt(weekAgo)} – ${fmt(refDate)}`;
    }
    case 'month': {
      const refMonth = today.getMonth() + offset;
      const refYear = today.getFullYear() + Math.floor(refMonth / 12);
      const normalizedMonth = ((refMonth % 12) + 12) % 12;
      const monthStart = new Date(refYear, normalizedMonth, 1);
      const monthEnd = offset === 0 ? today : new Date(refYear, normalizedMonth + 1, 0);
      return `${fmt(monthStart)} – ${fmt(monthEnd)}`;
    }
  }
}

function formatTodayDate(): string {
  const now = new Date();
  return now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function getDayOfWeek(date: Date): string {
  return date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '');
}

function alertIconSrc(id: string): string | undefined {
  if (id.startsWith('stock')) return warehouseIcon;
  if (id === 'yesterday-shift-open') return clockIcon;
  if (id.startsWith('yesterday-shift')) return clockIcon;
  if (id.startsWith('suspicious-check') || id.startsWith('yesterday-stuck') || id === 'stuck-orders' || id === 'many-refunds') return receiptIcon;
  if (id.startsWith('shift-discrepancy')) return walletIcon;
  if (id.startsWith('anomaly-delivery')) return truckIcon;
  return undefined;
}

function Sparkline({ data, format, dayLabels }: { data: number[]; format: MetricFormat; dayLabels: string[] }) {
  if (!data || data.length === 0 || data.every(v => v === 0)) return null;

  const fmtVal = (v: number) => {
    if (format === 'percent') return `${v}%`;
    if (format === 'count') return String(v);
    return `${fmtSom(Math.round(v))} с`;
  };

  const option = {
    tooltip: {
      trigger: 'axis',
      ...TOOLTIP_STYLE,
      formatter: (params: unknown) => {
        const items = params as { axisValue: string; value: number }[];
        if (!items?.length) return '';
        const item = items[0];
        return `<div style="font-weight:600;margin-bottom:2px">${item.axisValue}</div><span>${fmtVal(item.value)}</span>`;
      },
    },
    grid: { top: 2, right: 0, bottom: 2, left: 0 },
    xAxis: { type: 'category', data: dayLabels, show: false },
    yAxis: { type: 'value', show: false, min: (val: { min: number }) => val.min - (val.min * 0.1) },
    series: [{
      type: 'line', data, smooth: false, symbol: 'none',
      lineStyle: { color: CHART_MUTED, width: 1.5 },
      areaStyle: { color: 'rgba(100, 116, 139, 0.12)' },
    }],
  };

  return <ReactECharts option={option} style={{ width: 160, height: 32 }} notMerge />;
}

type MetricFormat = 'som' | 'count' | 'percent';
const MOCK = false;

export function Dashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>('week');
  const [periodOffset, setPeriodOffset] = useState(0);

  const realQuery = useDashboardNewData(period, periodOffset);
  const mockData = MOCK ? getMockData(period) : null;

  const data = mockData ?? realQuery.data;
  const isPending = MOCK ? false : realQuery.isPending;
  const isError = MOCK ? false : realQuery.isError;
  const error = MOCK ? null : realQuery.error;

  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const [dismissedMigrationIds, setDismissedMigrationIds] = useState<Set<string>>(new Set());

  const urgencyGroups = useMemo(() => {
    if (!data?.alertUrgencyGroups) return null;
    const { urgent, important, background } = data.alertUrgencyGroups;
    const filter = (arr: Alert[]) => arr.filter((a) => !dismissedAlertIds.has(a.id));
    return { urgent: filter(urgent), important: filter(important), background: filter(background) };
  }, [data, dismissedAlertIds]);

  const totalAlerts = urgencyGroups
    ? urgencyGroups.urgent.length + urgencyGroups.important.length + urgencyGroups.background.length : 0;

  if (isError) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive font-medium">Ошибка загрузки дашборда</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'Попробуйте обновить страницу'}
          </p>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics ?? [];
  const yesterdayShift = data?.yesterdayShift;
  const chronology = data?.chronology ?? [];
  const criticalCount = data?.criticalCount ?? 0;
  const hasAlerts = totalAlerts > 0;
  const todayDate = formatTodayDate();
  const lastWeekDay = getDayOfWeek(new Date(Date.now() - 7 * 86400000));

  const sparklineDayLabels = useMemo(() => {
    const labels: string[] = [];
    for (let d = 6; d >= 0; d--) {
      const date = new Date(Date.now() - d * 86400000);
      labels.push(date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', ''));
    }
    return labels;
  }, []);

  const sparklineDailyData = useMemo(() => {
    if (!data) return null;
    return [data.dailyRevenues, data.dailyChecks, data.dailyAvgChecks, data.dailyExpenses, null] as const;
  }, [data]);

  const dishColumns = useMemo<ColumnDef<TopDish, any>[]>(() => [
    { accessorKey: 'name', header: 'Блюдо', cell: ({ getValue }) => <span className="text-foreground">{getValue<string>()}</span> },
    { accessorKey: 'revenue', header: 'Выручка', cell: ({ getValue }) => <>{fmtSom(getValue<number>())} с</> },
    { accessorKey: 'margin', header: 'Прибыль', cell: ({ row }) => { const m = row.original.margin; return <span className={m < 0 ? 'text-destructive' : 'text-success'}>{fmtSom(m)} с</span>; } },
    { id: 'marginPercent', header: 'Прибыль %',
      cell: ({ row }) => { const { revenue, margin } = row.original; const pct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0; const isLoss = margin < 0; return <span className={isLoss ? 'text-destructive' : ''}>{isLoss ? '—' : `${pct}%`}</span>; },
      sortingFn: (a, b) => { const pctA = a.original.revenue > 0 ? (a.original.margin / a.original.revenue) : 0; const pctB = b.original.revenue > 0 ? (b.original.margin / b.original.revenue) : 0; return pctA - pctB; },
    },
    { accessorKey: 'qty', header: 'Шт.', cell: ({ getValue }) => <>{getValue<number>()}</> },
  ], []);

  return (
    <div className="min-h-full bg-background">
      <ActionBar criticalCount={criticalCount} totalAlertCount={totalAlerts} />

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8">

        {/* ═══ PAGE TITLE ═══ */}
        <h2 className="text-2xl font-bold text-foreground">Дашборд</h2>

        {/* ═══ YESTERDAY SHIFT ═══ */}
        {yesterdayShift && (
          <div className="text-sm text-muted-foreground">
            Вчера:{' '}
            {yesterdayShift.closed ? (
              <>
                <span className="text-foreground font-medium">смена закрыта</span>
                {yesterdayShift.revenue != null && (<> · <span className="text-foreground">{fmtSom(yesterdayShift.revenue)} сом</span></>)}
                {yesterdayShift.checks != null && (<> · <span className="text-foreground">{yesterdayShift.checks} чеков</span></>)}
                {yesterdayShift.cashDifference != null && yesterdayShift.cashDifference !== 0 && (
                  <span className={yesterdayShift.cashDifference > 0 ? ' text-success' : ' text-destructive'}>
                    {' '}· расхождение {fmtSom(yesterdayShift.cashDifference)} сом
                  </span>
                )}
              </>
            ) : (
              <span className="text-amber-600 font-medium">смена не закрыта</span>
            )}
          </div>
        )}

        {/* ═══ KPI BLOCK ═══ */}
        <div>
          {/* Today row */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Сегодня, {todayDate}</p>
            {metrics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4">
                {metrics.map((metric) => (
                  <div key={metric.label} className="px-2">
                    <div className="flex flex-col min-w-0">
                      <p className="text-sm text-muted-foreground mb-1 truncate">{metric.label}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-foreground truncate">
                          {metric.format === 'percent' ? `${metric.todayValue}%` : fmtSom(metric.todayValue)}
                        </span>
                        {metric.format === 'som' && <span className="text-sm text-foreground shrink-0">сом</span>}
                      </div>
                      {metric.todayTrend != null && (() => {
                        const v = metric.todayTrend.value;
                        const isCount = metric.format === 'count';
                        const color = v > 0 ? 'text-success' : v < 0 ? 'text-destructive' : 'text-muted-foreground';
                        const label = isCount ? `${v > 0 ? '+' : ''}${v} к ${lastWeekDay}` : `${v > 0 ? '+' : ''}${v}% к ${lastWeekDay}`;
                        return <p className={`text-sm mt-0.5 ${color}`}>{label}</p>;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Spacer */}
          <div className="my-5" />

          {/* Period row */}
          <div>
            <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
              <SegmentTabs options={PERIOD_OPTIONS} value={period} onChange={(v) => { setPeriod(v); setPeriodOffset(0); }} />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPeriodOffset((o) => o - 1)} className="flex size-11 items-center justify-center rounded hover:bg-muted transition-colors md:size-6" aria-label="Предыдущий период">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3L5 7l4 4"/></svg>
                </button>
                <span className="text-sm text-foreground font-medium tabular-nums select-none">{formatPeriodRange(period, periodOffset)}</span>
                <button type="button" onClick={() => setPeriodOffset((o) => Math.min(0, o + 1))} disabled={periodOffset >= 0}
                  className="flex size-11 items-center justify-center rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-default md:size-6" aria-label="Следующий период">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 3l4 4-4 4"/></svg>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4">
              {metrics.map((metric, i) => (
                <div key={metric.label} className="px-2">
                  <div className="flex flex-col min-w-0">
                    <p className="text-sm text-muted-foreground mb-1 truncate">{metric.label}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground truncate">
                        {metric.format === 'percent' ? `${metric.periodValue}%` : fmtSom(metric.periodValue)}
                      </span>
                      {metric.format === 'som' && <span className="text-sm text-muted-foreground shrink-0">сом</span>}
                    </div>
                    {sparklineDailyData && sparklineDailyData[i] && (
                      <div className="mt-1">
                        <Sparkline data={sparklineDailyData[i]!} format={metric.format} dayLabels={sparklineDayLabels} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ ALERTS — chip flow ═══ */}
        {hasAlerts && urgencyGroups && (
          <div>
            {[...urgencyGroups.urgent, ...urgencyGroups.important, ...urgencyGroups.background]
              .filter(a => !dismissedAlertIds.has(a.id))
              .map((alert) => (
                <AlertCard key={alert.id} type={alert.type} message={alert.message}
                  actionLabel={alert.actionLabel} actionHref={alert.actionHref}
                  onDismiss={() => setDismissedAlertIds((prev) => new Set(prev).add(alert.id))} variant="chip" />
              ))}
          </div>
        )}

        {/* ═══ LOADING ═══ */}
        {isPending && (
          <div className="opacity-60">
            <p className="text-sm text-muted-foreground mb-4">Загрузка данных...</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-2">
                  <div className="h-4 bg-muted rounded w-20 mb-2" />
                  <div className="h-7 bg-muted rounded w-24 mb-1" />
                  <div className="h-3 bg-muted rounded w-12" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CHRONOLOGY ═══ */}
        <ChronologyFeed events={chronology} title="События" />

        {/* ═══ PRODUCTS TABLE ═══ */}
        {data?.topDishes && data.topDishes.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">
              Товары за месяц · {data.topDishes.length} позиций
            </h3>
            <DataTable
              data={data.topDishes}
              columns={dishColumns}
              dense
              className="max-w-4xl"
              getRowClassName={(row) => row.original.margin < 0 ? 'bg-destructive/5' : ''}
            />
          </div>
        )}

      </div>
    </div>
  );
}
