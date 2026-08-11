import type { AnalyticsData } from '@/hooks/useAnalytics';

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7..23

type DensitySymbol = '·' | '░' | '▒' | '▓' | '█';

function classify(n: number): DensitySymbol {
  if (n === 0) return '·';
  if (n <= 1) return '░';
  if (n <= 3) return '▒';
  if (n <= 6) return '▓';
  return '█';
}

function symbolStyle(sym: DensitySymbol, n: number): string {
  if (sym === '·') return 'text-muted-foreground/20';
  if (sym === '░') return 'text-foreground/15';
  if (sym === '▒') return 'text-foreground/30';
  if (sym === '▓') return 'text-foreground/55';
  if (n >= 10) return 'text-primary font-semibold';
  return 'text-foreground/75';
}

interface Props {
  data: AnalyticsData | null;
  isPending: boolean;
  error: Error | null;
}

export function HeatmapText({ data, isPending, error }: Props) {
  if (isPending) {
    return (
      <div className="bg-card rounded-xl p-4">
        <div className="h-4 bg-muted rounded w-44 mb-3 animate-pulse" />
        <div className="space-y-0.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-[14px] bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card rounded-xl p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Когда продают</h3>
        <div className="h-[120px] flex items-center justify-center text-muted-foreground text-sm">
          {error ? 'Ошибка загрузки' : 'Нет данных'}
        </div>
      </div>
    );
  }

  const { hourlyBuckets } = data;

  // Build a lookup: `${dayIdx}-${hour}` → orderCount
  const lookup = new Map<string, number>();
  for (const b of hourlyBuckets) {
    lookup.set(`${b.dayIndex}-${b.hour}`, b.orderCount);
  }

  // Daily totals
  const dailyTotals = Array.from({ length: 7 }, (_, dayIdx) =>
    HOURS.reduce((sum, h) => sum + (lookup.get(`${dayIdx}-${h}`) || 0), 0),
  );

  const maxTotal = Math.max(...dailyTotals, 1);

  return (
    <div className="bg-card rounded-xl p-4">
      <h3 className="text-base font-semibold text-foreground mb-3">Когда продают</h3>

      <div className="flex">
        {/* Heatmap grid */}
        <div className="flex-1 font-mono text-[11px] leading-[15px] tracking-[1px]">
          {/* Hour header */}
          <div className="flex mb-1 text-muted-foreground/50 text-[9px]">
            <span className="w-5 shrink-0" />
            {HOURS.map((h) => (
              <span key={h} className="w-[15px] text-center">
                {h % 3 === 0 ? h : ''}
              </span>
            ))}
          </div>

          {/* Rows */}
          {Array.from({ length: 7 }).map((_, dayIdx) => {
            const symbols = HOURS.map((h) => {
              const count = lookup.get(`${dayIdx}-${h}`) || 0;
              return { sym: classify(count), count };
            });
            return (
              <div key={dayIdx} className="flex items-center">
                <span className="w-5 shrink-0 text-muted-foreground text-[10px]">
                  {DAY_LABELS[dayIdx]}
                </span>
                {symbols.map(({ sym, count }, hi) => (
                  <span
                    key={hi}
                    className={`w-[15px] text-center inline-block select-none cursor-default ${symbolStyle(sym, count)}`}
                    title={`${DAY_LABELS[dayIdx]} ${HOURS[hi]}:00 · ${count} заказов`}
                  >
                    {count > 0 ? sym : '·'}
                  </span>
                ))}
              </div>
            );
          })}
        </div>

        {/* Daily totals mini-bars */}
        <div className="ml-3 flex flex-col justify-between py-[18px] w-12">
          {dailyTotals.map((total, i) => (
            <div key={i} className="flex items-center gap-1 h-[15px]">
              <div
                className="h-2 rounded-r-sm bg-primary/40"
                style={{ width: `${Math.max(4, (total / maxTotal) * 100)}%` }}
              />
              <span className="text-[9px] text-muted-foreground tabular-nums w-5 text-right">
                {total}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
