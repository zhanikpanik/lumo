import type { ProfitData } from '@/hooks/useAnalyticsProfit';
import { formatSom } from '@/lib/formatSom';
import { cn } from '@/lib/utils';

interface ResultCompositionProps {
  data: ProfitData | null;
  isPending: boolean;
  error: Error | null;
}

interface CompositionItem {
  label: string;
  value: number;
  tone: 'neutral' | 'cost' | 'expense' | 'result';
}

const TONE_CLASS: Record<CompositionItem['tone'], string> = {
  neutral: 'bg-primary',
  cost: 'bg-warning',
  expense: 'bg-destructive/70',
  result: 'bg-success',
};

export function ResultComposition({ data, isPending, error }: ResultCompositionProps) {
  if (isPending) {
    return <div className="mb-6 h-44 animate-pulse rounded-xl bg-muted" />;
  }

  if (error || !data) {
    return (
      <div className="mb-6 rounded-xl border bg-card p-5 text-sm text-destructive">
        Не удалось собрать раскладку результата.
      </div>
    );
  }

  const cogs = data.actualCogs ?? data.theoreticalCogs;
  const items: CompositionItem[] = [
    { label: 'Выручка', value: data.revenue, tone: 'neutral' },
    {
      label: data.resultUsesActualCogs ? 'Фактическая себестоимость' : 'Расчётная себестоимость',
      value: cogs,
      tone: 'cost',
    },
    { label: 'Операционные расходы', value: data.operatingExpenses, tone: 'expense' },
    { label: 'Результат до ФОТ', value: data.resultBeforePayroll, tone: 'result' },
  ];
  const scale = Math.max(data.revenue, cogs + data.operatingExpenses, 1);
  return (
    <section className="mb-6 rounded-xl border bg-card p-5" aria-labelledby="composition-title">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="composition-title" className="text-sm font-semibold text-foreground">
          Состав результата
        </h2>
        <p className="text-xs text-muted-foreground">ФОТ не учтён</p>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const width = Math.min(100, Math.abs(item.value) / scale * 100);
          return (
            <div key={item.label} className="grid gap-2 sm:grid-cols-[12rem_1fr_8rem] sm:items-center">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', TONE_CLASS[item.tone], item.value < 0 && 'bg-destructive')}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className={cn(
                'text-right text-sm font-semibold tabular-nums text-foreground',
                item.tone === 'result' && item.value < 0 && 'text-destructive',
                item.tone === 'result' && item.value >= 0 && 'text-success',
              )}>
                {formatSom(item.value, { sign: item.tone === 'result' })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
