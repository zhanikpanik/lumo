import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SomIcon } from '@/components/dashboard/SomIcon';
import { Sparkline } from '@/components/dashboard/Sparkline';
import type { Trend } from '@/types/dashboard';

interface MetricCardProps {
  label: string;
  /** Today's value (large, bold) */
  todayValue: number;
  /** Period total (smaller, muted, with sparkline) */
  periodValue: number;
  format: 'som' | 'count' | 'percent';
  /** Today vs same day last week trend */
  todayTrend: Trend | null;
  /** Sparkline data for the period (7 days) */
  sparklineData?: number[];
}

function fmtValue(n: number | undefined | null, fmt: 'som' | 'count' | 'percent'): string {
  if (n == null) return '0';
  if (fmt === 'percent') return `${n}%`;
  return n.toLocaleString('ru-RU');
}

export function MetricCard({ label, todayValue, periodValue, format, todayTrend, sparklineData }: MetricCardProps) {
  return (
    <div className="flex flex-col min-w-0">
      {/* Label */}
      <p className="text-sm text-muted-foreground mb-1 truncate">{label}</p>

      {/* Today value — large, bold */}
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-foreground truncate">
          {fmtValue(todayValue, format)}
        </span>
        {format === 'som' && (
          <SomIcon className="w-[1em] h-[1em] shrink-0 text-foreground" />
        )}
      </div>

      {/* Today trend — inline, color-coded */}
      {todayTrend && (() => {
        const dir = todayTrend.value > 0 ? 'up' : todayTrend.value < 0 ? 'down' : 'flat';
        const color = dir === 'up' ? 'text-success' : dir === 'down' ? 'text-destructive' : 'text-muted-foreground';
        const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : ArrowRight;
        const isPercent = format !== 'count';
        const label = isPercent
          ? `${todayTrend.value > 0 ? '+' : ''}${todayTrend.value}% к прошл. нед.`
          : `${todayTrend.value > 0 ? '+' : ''}${todayTrend.value} к прошл. нед.`;
        return (
          <div className={cn('flex items-center gap-0.5 text-sm mt-0.5', color)}>
            <Icon className="w-3 h-3" />
            <span>{label}</span>
          </div>
        );
      })()}

      {/* Separator */}
      <div className="my-2" />

      {/* Period value — smaller, muted */}
      <div className="flex items-baseline gap-1">
        <span className="text-sm text-muted-foreground truncate">
          {fmtValue(periodValue, format)}
        </span>
        {format === 'som' && (
          <SomIcon className="w-[0.8em] h-[0.8em] shrink-0 text-muted-foreground" />
        )}
      </div>

      {/* Sparkline for period */}
      {sparklineData && sparklineData.length > 0 && sparklineData.some(v => v > 0) && (
        <Sparkline data={sparklineData} className="text-primary/30 mt-1" />
      )}
    </div>
  );
}
