import type { AnalyticsData } from '@/hooks/useAnalytics';
import { somRounded } from '@/lib/formatSom';

function fmtSom(n: number): string {
  const r = somRounded(n);
  return `${r.toLocaleString('ru-RU')} сом`;
}

function fmtNum(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) < 0.1) return n.toFixed(2);
  if (Math.abs(n) < 10) return n.toFixed(1);
  return Math.round(n).toLocaleString('ru-RU');
}

function deltaClass(d: number | null): string {
  if (d === null) return 'text-muted-foreground';
  if (d > 0) return 'text-destructive font-medium';
  if (d < -0.01) return 'text-success font-medium';
  return 'text-muted-foreground';
}

function deltaSign(d: number | null): string {
  if (d === null) return '—';
  if (d > 0) return `+${fmtNum(d)}`;
  return fmtNum(d);
}

interface Props {
  data: AnalyticsData | null;
  isPending: boolean;
  error: Error | null;
}

export function Overconsumption({ data, isPending, error }: Props) {
  // ── Skeleton ──
  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <div className="h-4 bg-muted rounded w-40 mb-3 animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Перерасход</h3>
        <div className="py-8 text-center text-sm text-destructive">
          Ошибка загрузки данных
        </div>
      </div>
    );
  }

  const oc = data?.overconsumption;

  // ── No boundaries: show message ──
  if (!oc?.hasBoundaries) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Перерасход</h3>
        <div className="py-6 text-center text-sm text-muted-foreground space-y-1">
          <p>Для расчёта перерасхода нужны инвентаризации на границах периода.</p>
          <p className="text-xs">Проведите переучёт на начало и конец периода — данные заполнятся автоматически.</p>
        </div>
      </div>
    );
  }

  const { rows, startInventoryDate, endInventoryDate, totalLossSom } = oc;

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Перерасход</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {startInventoryDate} – {endInventoryDate}
          </p>
        </div>
        {totalLossSom !== null && (
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Потери за период</p>
            <p className="text-base font-bold text-destructive tabular-nums">
              {fmtSom(totalLossSom)}
            </p>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 mb-1 text-[11px] text-muted-foreground">
        <span className="flex-1">Ингредиент</span>
        <span className="w-[72px] text-right">Теория</span>
        <span className="w-[72px] text-right">Факт</span>
        <span className="w-[64px] text-right">Разница</span>
        <span className="w-[80px] text-right">Потери</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/50">
        {rows.slice(0, 15).map((row) => (
          <div
            key={row.productId}
            className="flex items-center gap-3 py-2 px-1 -mx-1 group hover:bg-black/[0.03] rounded cursor-default transition-colors"
          >
            {/* Name */}
            <span className="flex-1 text-sm text-foreground truncate min-w-0">
              {row.productName}
            </span>

            {/* Theory */}
            <span className="w-[72px] text-right text-sm tabular-nums text-foreground shrink-0">
              {fmtNum(row.theoretical)}
            </span>

            {/* Actual */}
            <span className="w-[72px] text-right text-sm tabular-nums text-muted-foreground shrink-0">
              {row.actual !== null ? fmtNum(row.actual) : '—'}
            </span>

            {/* Delta */}
            <span className={`w-[64px] text-right text-sm tabular-nums shrink-0 ${deltaClass(row.delta)}`}>
              {deltaSign(row.delta)}
            </span>

            {/* Loss */}
            <span className={`w-[80px] text-right text-sm tabular-nums shrink-0 ${row.lossSom && row.lossSom > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              {row.lossSom !== null && row.lossSom > 0 ? fmtSom(row.lossSom) : '—'}
            </span>
          </div>
        ))}
      </div>

      {rows.length > 15 && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Показаны топ-15 по потерям из {rows.length} позиций
        </p>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
        <span>Теория — расход по рецептам (продажи × рецепт)</span>
        <span>Факт — нач. остаток + поставки − кон. остаток</span>
      </div>
    </div>
  );
}
