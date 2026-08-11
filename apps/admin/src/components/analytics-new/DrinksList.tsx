import type { AnalyticsData } from '@/hooks/useAnalytics';
import { CHART_GREEN_SOLID, CHART_RED_SOLID } from '@/lib/chartTheme';

function fmtSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

interface Props {
  data: AnalyticsData | null;
  isPending: boolean;
  error: Error | null;
}

export function DrinksList({ data, isPending, error }: Props) {
  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <div className="h-4 bg-muted rounded w-32 mb-3 animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Напитки</h3>
        <div className="py-8 text-center text-sm text-muted-foreground">
          {error ? 'Ошибка загрузки' : 'Нет данных'}
        </div>
      </div>
    );
  }

  const { drinkStats } = data;
  if (drinkStats.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Напитки</h3>
        <div className="py-8 text-center text-sm text-muted-foreground">
          Нет продаж за выбранный период
        </div>
      </div>
    );
  }

  const maxRevenue = drinkStats[0]?.revenue || 1;

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">Напитки</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>выручка</span>
          <span>маржа%</span>
        </div>
      </div>

      <div className="space-y-1">
        {drinkStats.slice(0, 12).map((d) => (
          <div
            key={d.name}
            className="flex items-center gap-3 h-9 group hover:bg-black/[0.02] rounded px-1 -mx-1 cursor-pointer transition-colors"
          >
            {/* Bar */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="flex-1 h-7 bg-muted rounded-r-sm overflow-hidden relative">
                <div
                  className="h-full rounded-r-sm transition-all"
                  style={{
                    width: `${(d.revenue / maxRevenue) * 100}%`,
                    backgroundColor: d.marginPct >= 50
                      ? CHART_GREEN_SOLID
                      : d.marginPct >= 30
                        ? '#eab308'
                        : CHART_RED_SOLID,
                    opacity: 0.55 + (d.revenue / maxRevenue) * 0.45,
                  }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums text-foreground w-16 text-right shrink-0">
                {fmtSom(d.revenue)} сом
              </span>
            </div>
            {/* Margin pct */}
            <span
              className="text-xs font-medium tabular-nums w-10 text-right shrink-0"
              style={{
                color: d.marginPct >= 50
                  ? CHART_GREEN_SOLID
                  : d.marginPct >= 30
                    ? '#eab308'
                    : CHART_RED_SOLID,
              }}
            >
              {Math.round(d.marginPct)}%
            </span>
            {/* Name */}
            <span className="text-sm text-foreground truncate min-w-0 flex-1 max-w-[200px]">
              {d.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
