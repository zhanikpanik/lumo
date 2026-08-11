import type { DailyProfitRow } from '@/hooks/useAnalyticsProfit';

function fmtSom(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

interface Props {
  rows: DailyProfitRow[];
  isPending: boolean;
  error: Error | null;
}

export function PrimeCostBar({ rows, isPending, error }: Props) {
  // ── Skeleton ──
  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 px-5 py-4 mb-6">
        <div className="h-4 bg-muted rounded w-64 mb-4 animate-pulse" />
        <div className="h-8 bg-muted rounded w-full mb-3 animate-pulse" />
        <div className="flex gap-8">
          <div className="h-3 bg-muted rounded w-24 animate-pulse" />
          <div className="h-3 bg-muted rounded w-24 animate-pulse" />
          <div className="h-3 bg-muted rounded w-24 animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="bg-card rounded-lg border border-border/60 px-5 py-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Из чего состоит «продукты + труд»</h3>
        <p className="text-sm text-destructive">Не удалось загрузить данные</p>
      </div>
    );
  }

  // ── Empty ──
  const activeRows = rows.filter((r) => r.revenue > 0);
  if (activeRows.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border/60 px-5 py-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Из чего состоит «продукты + труд»</h3>
        <p className="text-sm text-muted-foreground">Нет данных за выбранный период</p>
      </div>
    );
  }

  // ── Use the latest day with revenue ──
  const today = activeRows[activeRows.length - 1];
  const cogs = today.actualCogs ?? today.theoreticalCogs;
  const labor = today.laborCost;
  const remainder = today.revenue - cogs - labor;

  const cogsPct = today.revenue > 0 ? Math.round((cogs / today.revenue) * 100) : 0;
  const laborPct = today.revenue > 0 ? Math.round((labor / today.revenue) * 100) : 0;
  const remainderPct = 100 - cogsPct - laborPct;

  return (
    <div className="bg-card rounded-lg border border-border/60 px-5 py-4 mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">
        Из чего состоит «продукты + труд»
      </h3>

      {/* Stacked bar */}
      <div className="flex h-8 rounded-md overflow-hidden mb-3">
        {/* COGS segment */}
        {cogsPct > 0 && (
          <div
            className="bg-amber-100 border-r border-white flex items-center justify-center text-[11px] font-medium text-amber-800"
            style={{ width: `${cogsPct}%`, minWidth: cogsPct > 5 ? 'auto' : 0 }}
          >
            {cogsPct > 8 ? `${cogsPct}%` : ''}
          </div>
        )}
        {/* Labor segment */}
        {laborPct > 0 && (
          <div
            className="bg-blue-100 border-r border-white flex items-center justify-center text-[11px] font-medium text-blue-800"
            style={{ width: `${laborPct}%`, minWidth: laborPct > 5 ? 'auto' : 0 }}
          >
            {laborPct > 8 ? `${laborPct}%` : ''}
          </div>
        )}
        {/* Remainder */}
        {remainderPct > 0 && (
          <div
            className="bg-emerald-100 flex items-center justify-center text-[11px] font-medium text-emerald-800"
            style={{ width: `${remainderPct}%`, flex: 1 }}
          >
            {remainderPct > 8 ? `${remainderPct}%` : ''}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-200 inline-block" />
          Продукты {cogsPct}% · {fmtSom(cogs)} сом
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" />
          Труд {laborPct}% · {fmtSom(labor)} сом
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-200 inline-block" />
          Остаток {remainderPct}% · {fmtSom(remainder)} сом
        </div>
      </div>
    </div>
  );
}
