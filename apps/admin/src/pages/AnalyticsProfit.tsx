import { useMemo } from 'react';
import { format, subDays } from 'date-fns';
import { KpiTrio } from '@/components/analytics-profit/KpiTrio';
import { PrimeCostBar } from '@/components/analytics-profit/PrimeCostBar';
import { SplhHeatmap } from '@/components/analytics-profit/SplhHeatmap';
import { EbitChart } from '@/components/analytics-profit/EbitChart';
import { useAnalyticsProfit } from '@/hooks/useAnalyticsProfit';

function iso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function AnalyticsProfitPage() {
  const now = new Date();
  const tomorrow = iso(new Date(now.getTime() + 86400000));
  const days14ago = iso(subDays(now, 14));
  const days28ago = iso(subDays(now, 28));

  // Heatmap: 4 weeks, EBIT: 14 days
  const { data: ebData, isPending: ebPending, error: ebError } = useAnalyticsProfit(days14ago, tomorrow);
  const { data: heatData, isPending: heatPending, error: heatError } = useAnalyticsProfit(days28ago, tomorrow);

  // Cards + PrimeCostBar: use latest day with revenue from the 14-day period
  const todayRows = useMemo(() => {
    if (!ebData?.rows) return [];
    const active = ebData.rows.filter((r) => r.revenue > 0);
    if (active.length === 0) return [];
    return [active[active.length - 1]];
  }, [ebData]);

  return (
    <div className="p-6 lg:p-8 max-w-[1180px]">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1 text-foreground">Аналитика прибыли</h2>
        <p className="text-sm text-muted-foreground">Alto Coffee Bishkek</p>
      </div>

      {/* Сегодня: три карточки + раскладка */}
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Сегодня</h3>
      </div>
      <KpiTrio rows={todayRows} isPending={ebPending} error={ebError} />
      <PrimeCostBar rows={todayRows} isPending={ebPending} error={ebError} />

      {/* Тепловая карта SPLH: последние 4 недели */}
      <div className="mt-8 mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Выручка на час работы · последние 4 недели
        </h3>
      </div>
      <SplhHeatmap cells={heatData?.splhHeatmap ?? []} isPending={heatPending} error={heatError} />

      {/* EBIT: последние 14 дней */}
      <div className="mt-8 mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Итог дня · последние 14 дней
        </h3>
      </div>
      <EbitChart rows={ebData?.rows ?? []} isPending={ebPending} error={ebError} />
    </div>
  );
}
