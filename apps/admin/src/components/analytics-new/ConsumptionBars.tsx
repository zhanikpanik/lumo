import type { AnalyticsData } from '@/hooks/useAnalytics';

function fmtNum(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) < 0.1) return n.toFixed(2);
  if (Math.abs(n) < 10) return n.toFixed(1);
  return Math.round(n).toLocaleString('ru-RU');
}

function coverageColor(ratio: number): string {
  if (ratio >= 1) return 'hsl(var(--success))';
  if (ratio >= 0.7) return 'hsl(var(--warning))';
  return 'hsl(var(--destructive))';
}

interface Props {
  data: AnalyticsData | null;
  isPending: boolean;
  error: Error | null;
}

function EmptyState({ isPending, error }: Pick<Props, 'isPending' | 'error'>) {
  const title = 'Расход: поставки vs потребление';

  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <div className="h-4 bg-muted rounded w-48 mb-3 animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-7 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">{title}</h3>
        <div className="py-8 text-center text-sm text-destructive">
          Ошибка загрузки данных расхода
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4">
      <h3 className="text-base font-semibold text-foreground mb-3">{title}</h3>
      <div className="py-8 text-center text-sm text-muted-foreground">
        Нет данных о расходе за выбранный период
      </div>
    </div>
  );
}

/** Сколько текста влезает в сегмент бара при 1% ширины (в символах, примерно) */
function barLabel(maxConsumption: number, value: number, barPx: number): string {
  const pct = (value / maxConsumption) * 100;
  const px = (pct / 100) * barPx;
  // ~7px per char at text-[10px]
  const charsFit = Math.floor(px / 8);
  if (charsFit < 4) return '';
  const label = `${fmtNum(value)}`;
  if (label.length <= charsFit) return label;
  return '';
}

export function ConsumptionBars({ data, isPending, error }: Props) {
  if (isPending || error || !data?.consumptionRows?.length) {
    return <EmptyState isPending={isPending} error={error} />;
  }

  const rows = data.consumptionRows;
  const maxConsumption = rows[0]?.consumption || 1;
  const barPx = 280; // approximate bar width in px — used for label visibility

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">
          Расход: поставки vs потребление
        </h3>
        <span className="text-[11px] text-muted-foreground">покрытие поставками</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 mb-1 text-[11px] text-muted-foreground">
        <span className="w-[170px] shrink-0">Ингредиент</span>
        <span className="flex-1" />
        <span className="w-[44px] text-right">%</span>
      </div>

      <div className="divide-y divide-border/50">
        {rows.slice(0, 15).map((row) => {
          const effectiveSupply = row.incomingDelivery + row.transferNet;
          const coverPct = Math.round(row.coverageRatio * 100);
          const uncovered = Math.max(0, row.consumption - effectiveSupply);
          const color = coverageColor(row.coverageRatio);

          // Bar proportions: total = consumption, green = covered, red = uncovered
          // Clamp coverage ratio to 1.0 for bar display (excess shown as label)
          const barCoverageRatio = Math.min(1, row.coverageRatio);

          const supplyLabel = barLabel(maxConsumption, effectiveSupply, barPx);
          const gapLabel = uncovered > 0 ? barLabel(maxConsumption, uncovered, barPx) : '';

          return (
            <div
              key={row.productId}
              className="flex items-center gap-3 py-2 px-1 -mx-1 group hover:bg-black/[0.03] rounded cursor-default transition-colors"
            >
              {/* Ingredient name */}
              <span className="w-[170px] shrink-0 text-sm text-foreground truncate">
                {row.productName}
              </span>

              {/* Stacked bar */}
              <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden relative min-w-[100px]">
                {/* Green: covered by deliveries */}
                {barCoverageRatio > 0 && (
                  <div
                    className="absolute inset-y-0 left-0 flex items-center justify-center transition-all"
                    style={{
                      width: `${barCoverageRatio * 100}%`,
                      backgroundColor: color,
                      opacity: 0.75,
                    }}
                  >
                    {supplyLabel && (
                      <span className="text-[10px] font-medium tabular-nums text-white truncate px-1">
                        {supplyLabel} пост.
                      </span>
                    )}
                  </div>
                )}

                {/* Red: uncovered gap */}
                {barCoverageRatio < 1 && (
                  <div
                    className="absolute inset-y-0 right-0 flex items-center justify-center transition-all bg-destructive/25"
                    style={{
                      left: `${barCoverageRatio * 100}%`,
                    }}
                  >
                    {gapLabel && (
                      <span className="text-[10px] font-medium tabular-nums text-destructive truncate px-1">
                        −{gapLabel}
                      </span>
                    )}
                  </div>
                )}

                {/* Excess indicator — when coverage > 100% */}
                {row.coverageRatio > 1 && (
                  <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-medium tabular-nums text-success">
                    +{fmtNum(effectiveSupply - row.consumption)}
                  </span>
                )}
              </div>

              {/* Coverage % */}
              <span
                className="w-[44px] text-right text-xs font-medium tabular-nums shrink-0"
                style={{ color }}
              >
                {coverPct}%
              </span>
            </div>
          );
        })}
      </div>

      {rows.length > 15 && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Показаны топ-15 по расходу из {rows.length} ингредиентов
        </p>
      )}
    </div>
  );
}
