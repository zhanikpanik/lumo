import { Sparkline } from '@/components/dashboard/Sparkline';
import type { DailyProfitRow } from '@/hooks/useAnalyticsProfit';

// ── Helpers ──

function fmtSom(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

function fmtSomSigned(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return sign + fmtSom(n);
}

// ── Thresholds ──

type Health = 'good' | 'warn' | 'bad';

function primeCostHealth(pct: number | null): Health {
  if (pct === null) return 'bad';
  if (pct <= 60) return 'good';
  if (pct <= 65) return 'warn';
  return 'bad';
}

function splhHealth(val: number | null): Health {
  if (val === null) return 'bad';
  if (val >= 4000) return 'good';
  if (val >= 2500) return 'warn';
  return 'bad';
}

function resultHealth(value: number | null): Health {
  if (value === null) return 'bad';
  return value >= 0 ? 'good' : 'bad';
}

const HEALTH_DOT: Record<Health, string> = {
  good: 'bg-green-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
};

const HEALTH_TEXT: Record<Health, string> = {
  good: 'text-green-600',
  warn: 'text-amber-600',
  bad: 'text-red-600',
};

// ── Props ──

interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  sparkline: number[];
  health: Health;
}

function KpiCard({ label, value, sub, sparkline, health }: KpiCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border/60 px-5 py-4">
      {/* Header row: label + health dot */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[health]}`} />
      </div>

      {/* Big number */}
      <div className={`text-3xl font-bold tracking-tight mb-1 ${HEALTH_TEXT[health]}`}>
        {value}
      </div>

      {/* Sparkline */}
      <div className="mb-1.5">
        <Sparkline data={sparkline} />
      </div>

      {/* Reference / subtitle */}
      <p className="text-[11px] text-muted-foreground leading-tight">{sub}</p>
    </div>
  );
}

// ── Main component ──

interface Props {
  rows: DailyProfitRow[];
  isPending: boolean;
  error: Error | null;
}

export function KpiTrio({ rows, isPending, error }: Props) {
  // ── Skeleton ──
  if (isPending) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg border border-border/60 px-5 py-4">
            <div className="h-3 bg-muted rounded w-24 mb-3 animate-pulse" />
            <div className="h-8 bg-muted rounded w-20 mb-3 animate-pulse" />
            <div className="h-5 bg-muted rounded w-28 mb-2 animate-pulse" />
            <div className="h-3 bg-muted rounded w-32 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {['Продукты + труд', 'Выручка на час', 'Итог дня'].map((label) => (
          <div key={label} className="bg-card rounded-lg border border-border/60 px-5 py-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
            <p className="text-lg text-destructive mt-2">Ошибка</p>
          </div>
        ))}
      </div>
    );
  }

  // ── Empty ──
  const activeRows = rows.filter((r) => r.revenue > 0);
  if (activeRows.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {['Продукты + труд', 'Выручка на час', 'Итог дня'].map((label) => (
          <div key={label} className="bg-card rounded-lg border border-border/60 px-5 py-4">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
            <p className="text-2xl font-bold text-foreground/30 mt-1">—</p>
            <p className="text-[11px] text-muted-foreground mt-2">Нет данных</p>
          </div>
        ))}
      </div>
    );
  }

  // ── Compute values from the latest day ──
  const today = activeRows[activeRows.length - 1];
  const sparklineRows = activeRows.slice(-7);

  // Prime cost
  const pcHealth = primeCostHealth(today.primeCostPct);
  const pcSparkline = sparklineRows
    .map((r) => r.primeCostPct)
    .filter((v): v is number => v !== null);

  // SPLH
  const splhH = splhHealth(today.splh);
  const splhSparkline = sparklineRows
    .map((r) => r.splh)
    .filter((v): v is number => v !== null);

  const resultH = resultHealth(today.resultBeforePayroll);
  const resultSparkline = sparklineRows
    .map((row) => row.resultBeforePayroll)
    .filter((value): value is number => value !== null);

  const pcSub = pcHealth === 'good'
    ? 'В норме (58–64%)'
    : pcHealth === 'warn'
      ? 'Выше нормы, проверь'
      : 'Слишком много — пора разбираться';

  const splhSub = splhH === 'good'
    ? 'Норма 4 000–8 000 сом'
    : splhH === 'warn'
      ? 'Ниже нормы — проверь расписание'
      : 'Слишком много людей или мало продаж';

  const resultSub = resultH === 'good'
    ? 'День окупился'
    : 'День в минусе';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <KpiCard
        label="Продукты + труд"
        value={today.primeCostPct !== null ? `${today.primeCostPct}%` : '—'}
        sub={pcSub}
        sparkline={pcSparkline}
        health={pcHealth}
      />
      <KpiCard
        label="Выручка на час"
        value={today.splh !== null ? `${fmtSom(today.splh)} сом` : '—'}
        sub={splhSub}
        sparkline={splhSparkline}
        health={splhH}
      />
      <KpiCard
        label="Итог дня"
        value={today.resultBeforePayroll !== null ? `${fmtSomSigned(today.resultBeforePayroll)} сом` : '—'}
        sub={resultSub}
        sparkline={resultSparkline}
        health={resultH}
      />
    </div>
  );
}
