import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subDays,
} from 'date-fns';
import { PeriodPicker } from '@/components/analytics/PeriodPicker';
import { KpiRow } from '@/components/analytics-new/KpiRow';
import { RevenueChart } from '@/components/analytics-new/RevenueChart';
import { HeatmapChart } from '@/components/analytics-new/HeatmapChart';
import { ConsumptionBars } from '@/components/analytics-new/ConsumptionBars';
import { Overconsumption } from '@/components/analytics-new/Overconsumption';
import { DrinksList } from '@/components/analytics-new/DrinksList';
import { ShiftsList } from '@/components/analytics-new/ShiftsList';
import { SegmentTabs } from '@/components/ui/SegmentTabs';
import { useAnalytics } from '@/hooks/useAnalytics';
import { formatSom } from '@/lib/formatSom';

type AnalyticsTab = 'sales' | 'inventory' | 'shifts';

const TAB_OPTIONS: { value: AnalyticsTab; label: string }[] = [
  { value: 'sales', label: 'Продажи' },
  { value: 'inventory', label: 'Склад' },
  { value: 'shifts', label: 'Смены' },
];

interface SummaryItem {
  label: string;
  value: string;
  detail: string;
}

function DomainSummary({ items }: { items: SummaryItem[] }) {
  return (
    <div className="mb-6 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="mt-1 truncate text-xl font-bold tabular-nums text-foreground">{item.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const now = new Date();
  const defaultStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const defaultEnd = format(now, 'yyyy-MM-dd');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: AnalyticsTab = requestedTab === 'inventory' || requestedTab === 'shifts'
    ? requestedTab
    : 'sales';
  const requestedStart = searchParams.get('start');
  const requestedEnd = searchParams.get('end');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const hasValidRange = requestedStart != null
    && requestedEnd != null
    && datePattern.test(requestedStart)
    && datePattern.test(requestedEnd)
    && !Number.isNaN(parseISO(requestedStart).getTime())
    && !Number.isNaN(parseISO(requestedEnd).getTime())
    && requestedStart <= requestedEnd;
  const start = hasValidRange ? requestedStart : defaultStart;
  const end = hasValidRange ? requestedEnd : defaultEnd;

  const ranges = useMemo(() => {
    const periodDays = Math.max(1, differenceInCalendarDays(parseISO(end), parseISO(start)) + 1);
    return {
      queryEnd: format(addDays(parseISO(end), 1), 'yyyy-MM-dd'),
      previousStart: format(subDays(parseISO(start), periodDays), 'yyyy-MM-dd'),
    };
  }, [end, start]);

  const currentQuery = useAnalytics(start, ranges.queryEnd);
  const previousQuery = useAnalytics(ranges.previousStart, start);
  const data = currentQuery.data ?? null;
  const error = currentQuery.error;

  const inventoryRows = data?.consumptionRows ?? [];
  const uncoveredCount = inventoryRows.filter((row) => row.coverageRatio < 1).length;
  const shiftRevenue = data?.shiftStats.reduce((sum, shift) => sum + shift.revenue, 0) ?? 0;
  const shiftPortions = data?.shiftStats.reduce((sum, shift) => sum + shift.portions, 0) ?? 0;
  const shiftCount = data?.shiftStats.length ?? 0;

  const changeTab = (nextTab: AnalyticsTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    next.set('start', start);
    next.set('end', end);
    setSearchParams(next);
  };

  const changePeriod = (nextStart: string, nextEnd: string) => {
    const [normalizedStart, normalizedEnd] = nextStart <= nextEnd
      ? [nextStart, nextEnd]
      : [nextEnd, nextStart];
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    next.set('start', normalizedStart);
    next.set('end', normalizedEnd);
    setSearchParams(next, { replace: true });
  };

  return (
    <main className="page-shell page-shell--wide">
      <header className="mb-6 border-b pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Аналитика</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Где изменился результат и что на него повлияло
            </p>
          </div>
          <PeriodPicker start={start} end={end} onChange={changePeriod} />
        </div>
        <SegmentTabs
          options={TAB_OPTIONS}
          value={tab}
          onChange={changeTab}
          className="mt-5"
        />
      </header>

      {tab === 'sales' && (
        <section aria-label="Аналитика продаж">
          <KpiRow
            data={data}
            comparisonData={previousQuery.data ?? null}
            isPending={currentQuery.isPending}
            error={error}
          />
          <div className="mb-6">
            <RevenueChart data={data} isPending={currentQuery.isPending} error={error} />
          </div>
          <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <HeatmapChart data={data} isPending={currentQuery.isPending} error={error} />
            <DrinksList data={data} isPending={currentQuery.isPending} error={error} />
          </div>
        </section>
      )}

      {tab === 'inventory' && (
        <section aria-label="Аналитика склада">
          <DomainSummary items={[
            {
              label: 'Ингредиенты',
              value: currentQuery.isPending ? '—' : inventoryRows.length.toLocaleString('ru-RU'),
              detail: 'с движениями за период',
            },
            {
              label: 'Не покрыто поставками',
              value: currentQuery.isPending ? '—' : uncoveredCount.toLocaleString('ru-RU'),
              detail: 'расход выше поступлений',
            },
            {
              label: 'Факт против нормы',
              value: currentQuery.isPending
                ? '—'
                : data?.overconsumption.hasBoundaries
                  ? `${data.overconsumption.rows.length} позиций`
                  : 'Нет границ',
              detail: data?.overconsumption.hasBoundaries
                ? 'между двумя переучётами'
                : 'нужны два проведённых переучёта',
            },
          ]} />
          <div className="mb-6">
            <ConsumptionBars data={data} isPending={currentQuery.isPending} error={error} />
          </div>
          <div className="mb-8">
            <Overconsumption data={data} isPending={currentQuery.isPending} error={error} />
          </div>
        </section>
      )}

      {tab === 'shifts' && (
        <section aria-label="Аналитика смен">
          <DomainSummary items={[
            {
              label: 'Смены',
              value: currentQuery.isPending ? '—' : shiftCount.toLocaleString('ru-RU'),
              detail: 'с продажами за период',
            },
            {
              label: 'Выручка',
              value: currentQuery.isPending ? '—' : formatSom(shiftRevenue),
              detail: 'в привязанных сменах',
            },
            {
              label: 'Порции',
              value: currentQuery.isPending ? '—' : shiftPortions.toLocaleString('ru-RU'),
              detail: shiftCount > 0
                ? `${Math.round(shiftPortions / shiftCount)} в среднем на смену`
                : 'нет данных для сравнения',
            },
          ]} />
          <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <HeatmapChart data={data} isPending={currentQuery.isPending} error={error} />
            <ShiftsList data={data} isPending={currentQuery.isPending} error={error} />
          </div>
        </section>
      )}
    </main>
  );
}
