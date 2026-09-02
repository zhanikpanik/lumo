import { Sparkline } from '@/components/dashboard/Sparkline';
import { SomIcon } from '@/components/dashboard/SomIcon';
import type { AnalyticsData } from '@/hooks/useAnalytics';

function fmtSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

function relativeDelta(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

interface Props {
  data: AnalyticsData | null;
  comparisonData?: AnalyticsData | null;
  isPending: boolean;
  error: Error | null;
}

type ItemFormat = 'som' | 'count' | 'percent';

interface KpiItem {
  label: string;
  value: number;
  format: ItemFormat;
  sparkline: number[] | null;
  comparison: number | null;
  comparisonUnit: '%' | 'п.п.';
}

export function KpiRow({ data, comparisonData, isPending, error }: Props) {
  // ── Skeleton ──
  if (isPending) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-2">
            <div className="h-4 bg-muted rounded w-20 mb-2 animate-pulse" />
            <div className="h-8 bg-muted rounded w-24 mb-1 animate-pulse" />
            <div className="h-3 bg-muted rounded w-32 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5 mb-8">
        {['Выручка', 'Маржа', 'Средний чек', 'Заказов', 'Прибыль'].map((label) => (
          <div key={label} className="px-2">
            <p className="text-sm text-muted-foreground mb-1 truncate">{label}</p>
            <p className="text-lg text-destructive">—</p>
          </div>
        ))}
      </div>
    );
  }

  // ── Empty ──
  if (!data || data.dailyStats.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5 mb-8">
        {['Выручка', 'Маржа', 'Средний чек', 'Заказов', 'Прибыль'].map((label) => (
          <div key={label} className="px-2">
            <p className="text-sm text-muted-foreground mb-1 truncate">{label}</p>
            <p className="text-2xl font-bold text-foreground/30">—</p>
          </div>
        ))}
      </div>
    );
  }

  // ── Compute ──
  const totalRevenue = data.dailyStats.reduce((s, d) => s + d.revenue, 0);
  const totalCost = data.dailyStats.reduce((s, d) => s + d.cost, 0);
  const totalOrders = data.dailyStats.reduce((s, d) => s + d.orderCount, 0);
  const totalMargin = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;
  const avgCheck = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const previousRevenue = comparisonData?.dailyStats.reduce((sum, day) => sum + day.revenue, 0) ?? 0;
  const previousCost = comparisonData?.dailyStats.reduce((sum, day) => sum + day.cost, 0) ?? 0;
  const previousOrders = comparisonData?.dailyStats.reduce((sum, day) => sum + day.orderCount, 0) ?? 0;
  const previousMargin = previousRevenue - previousCost;
  const previousMarginPct = previousRevenue > 0
    ? Math.round((previousMargin / previousRevenue) * 100)
    : null;
  const previousAvgCheck = previousOrders > 0 ? Math.round(previousRevenue / previousOrders) : 0;
  const canCompare = previousOrders >= 5;

  const revenueSparkline = data.dailyStats.map((d) => d.revenue);
  const ordersSparkline = data.dailyStats.map((d) => d.orderCount);
  const marginSparkline = data.dailyStats.map((d) => d.margin);
  const checkSparkline = data.dailyStats.map((d) => d.avgCheck);

  const items: KpiItem[] = [
    {
      label: 'Выручка',
      value: totalRevenue,
      format: 'som',
      sparkline: revenueSparkline,
      comparison: canCompare ? relativeDelta(totalRevenue, previousRevenue) : null,
      comparisonUnit: '%',
    },
    {
      label: 'Маржа',
      value: marginPct,
      format: 'percent',
      sparkline: null,
      comparison: canCompare && previousMarginPct != null ? marginPct - previousMarginPct : null,
      comparisonUnit: 'п.п.',
    },
    {
      label: 'Средний чек',
      value: avgCheck,
      format: 'som',
      sparkline: checkSparkline,
      comparison: canCompare ? relativeDelta(avgCheck, previousAvgCheck) : null,
      comparisonUnit: '%',
    },
    {
      label: 'Заказов',
      value: totalOrders,
      format: 'count',
      sparkline: ordersSparkline,
      comparison: canCompare ? relativeDelta(totalOrders, previousOrders) : null,
      comparisonUnit: '%',
    },
    {
      label: 'Маржа, сом',
      value: totalMargin,
      format: 'som',
      sparkline: marginSparkline,
      comparison: canCompare ? relativeDelta(totalMargin, previousMargin) : null,
      comparisonUnit: '%',
    },
  ];

  const hasSparkline = (sp: number[] | null): sp is number[] =>
    sp != null && sp.length > 0 && sp.some((v) => v > 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5 mb-8">
      {items.map((item) => (
        <div key={item.label} className="px-2 min-w-0">
          <p className="text-sm text-muted-foreground mb-1 truncate">{item.label}</p>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold truncate ${
                item.label === 'Маржа, сом' && totalMargin < 0 ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {item.format === 'percent'
                ? `${item.value}%`
                : fmtSom(item.value)}
            </span>
            {item.format === 'som' && (
              <SomIcon className="w-[1em] h-[1em] shrink-0 text-foreground" />
            )}
          </div>
          {item.comparison != null && (
            <p className={item.comparison >= 0 ? 'mt-1 text-xs text-success' : 'mt-1 text-xs text-destructive'}>
              {item.comparison > 0 ? '+' : ''}{item.comparison}{item.comparisonUnit} к пред. периоду
            </p>
          )}
          {comparisonData && !canCompare && (
            <p className="mt-1 text-xs text-muted-foreground">Нет сопоставимой базы</p>
          )}
          {hasSparkline(item.sparkline) && (
            <Sparkline data={item.sparkline} className="text-primary/30 mt-1" />
          )}
        </div>
      ))}
    </div>
  );
}
