import { Sparkline } from '@/components/dashboard/Sparkline';
import { SomIcon } from '@/components/dashboard/SomIcon';
import type { AnalyticsData } from '@/hooks/useAnalytics';

function fmtSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

interface Props {
  data: AnalyticsData | null;
  isPending: boolean;
  error: Error | null;
}

type ItemFormat = 'som' | 'count' | 'percent';

interface KpiItem {
  label: string;
  value: number;
  format: ItemFormat;
  sparkline: number[] | null;
}

export function KpiRow({ data, isPending, error }: Props) {
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

  const revenueSparkline = data.dailyStats.map((d) => d.revenue);
  const ordersSparkline = data.dailyStats.map((d) => d.orderCount);
  const marginSparkline = data.dailyStats.map((d) => d.margin);
  const checkSparkline = data.dailyStats.map((d) => d.avgCheck);

  const items: KpiItem[] = [
    { label: 'Выручка', value: totalRevenue, format: 'som', sparkline: revenueSparkline },
    { label: 'Маржа', value: marginPct, format: 'percent', sparkline: null },
    { label: 'Средний чек', value: avgCheck, format: 'som', sparkline: checkSparkline },
    { label: 'Заказов', value: totalOrders, format: 'count', sparkline: ordersSparkline },
    { label: 'Прибыль', value: totalMargin, format: 'som', sparkline: marginSparkline },
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
                item.label === 'Прибыль' && totalMargin < 0 ? 'text-destructive' : 'text-foreground'
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
          {hasSparkline(item.sparkline) && (
            <Sparkline data={item.sparkline} className="text-primary/30 mt-1" />
          )}
        </div>
      ))}
    </div>
  );
}
