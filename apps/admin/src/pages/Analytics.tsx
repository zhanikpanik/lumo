import { useState, useMemo } from 'react';
import { format, startOfMonth } from 'date-fns';
import { PeriodPicker } from '@/components/analytics/PeriodPicker';
import { SummaryBar } from '@/components/analytics/SummaryBar';
import { MonthlyRevenueChart } from '@/components/MonthlyRevenueChart';
import { HourlyHeatmap } from '@/components/HourlyHeatmap';
import { WeeklyComparison } from '@/components/WeeklyComparison';
import { ExpenseTreemap } from '@/components/ExpenseTreemap';
import { TopItems } from '@/components/TopItems';
import { useMonthlyStats } from '@/hooks/useMonthlyStats';
import { useHeatmapData } from '@/hooks/useHeatmapData';
import { useWeeklyStats } from '@/hooks/useWeeklyStats';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { useTopItems } from '@/hooks/useTopItems';

function iso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function AnalyticsPage() {
  const now = new Date();
  const defaultStart = iso(startOfMonth(now));
  const defaultEnd = iso(now);

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  // Ensure end is exclusive (add one day for queries)
  const queryEnd = useMemo(() => {
    const d = new Date(end);
    d.setDate(d.getDate() + 1);
    return iso(d);
  }, [end]);

  const { data: monthlyData, isPending: monthlyPending } = useMonthlyStats(start, queryEnd);
  const { data: heatmapData, isPending: heatmapPending } = useHeatmapData(start, queryEnd);
  const { data: weeklyData, isPending: weeklyPending } = useWeeklyStats(start, queryEnd);
  const { data: expenseCategories, isPending: expensePending } = useExpenseCategories(start, queryEnd);
  const { data: topItems, isPending: topPending } = useTopItems(start, queryEnd);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">Аналитика</h2>
          <p className="text-sm text-muted-foreground">Alto Coffee Bishkek</p>
        </div>
        <PeriodPicker start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
      </div>

      {/* Summary KPI */}
      <SummaryBar data={monthlyData ?? []} isPending={monthlyPending} />

      {/* Full width: Revenue chart */}
      <div className="mb-6">
        <MonthlyRevenueChart data={monthlyData ?? []} isPending={monthlyPending} />
      </div>

      {/* 2-col: Heatmap + Weekly comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <HourlyHeatmap data={heatmapData ?? []} isPending={heatmapPending} />
        <WeeklyComparison weeks={weeklyData ?? []} isPending={weeklyPending} />
      </div>

      {/* 2-col: Top items + Expense treemap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <TopItems
          dishes={topItems?.dishes ?? []}
          ingredients={topItems?.ingredients ?? []}
          isPending={topPending}
        />
        <ExpenseTreemap categories={expenseCategories ?? []} isPending={expensePending} />
      </div>
    </div>
  );
}
