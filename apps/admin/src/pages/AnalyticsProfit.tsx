import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subDays,
} from 'date-fns';
import { PeriodPicker } from '@/components/analytics/PeriodPicker';
import { ResultComposition } from '@/components/analytics-profit/ResultComposition';
import { ResultChart } from '@/components/analytics-profit/ResultChart';
import { useAnalyticsProfit } from '@/hooks/useAnalyticsProfit';
import { formatSom } from '@/lib/formatSom';
import { cn } from '@/lib/utils';

interface FinancialKpiProps {
  label: string;
  value: string;
  detail: string;
  comparison: number | null;
  result?: boolean;
}

function FinancialKpi({
  label,
  value,
  detail,
  comparison,
  result = false,
}: FinancialKpiProps) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-1 truncate text-2xl font-bold tabular-nums text-foreground',
        result && value.startsWith('−') && 'text-destructive',
        result && !value.startsWith('−') && 'text-success',
      )}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {comparison != null && (
        <p className={comparison >= 0 ? 'mt-1 text-xs text-success' : 'mt-1 text-xs text-destructive'}>
          {comparison > 0 ? '+' : ''}{comparison}% к предыдущему периоду
        </p>
      )}
    </div>
  );
}

function relativeDelta(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export function AnalyticsProfitPage() {
  const now = new Date();
  const defaultStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const defaultEnd = format(now, 'yyyy-MM-dd');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStart = searchParams.get('start');
  const requestedEnd = searchParams.get('end');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const hasValidRange = requestedStart != null
    && requestedEnd != null
    && datePattern.test(requestedStart)
    && datePattern.test(requestedEnd)
    && !Number.isNaN(parseISO(requestedStart).getTime())
    && !Number.isNaN(parseISO(requestedEnd).getTime())
    && requestedStart <= requestedEnd;
  const start = hasValidRange ? requestedStart : defaultStart;
  const end = hasValidRange ? requestedEnd : defaultEnd;

  const ranges = useMemo(() => {
    const periodDays = Math.max(1, differenceInCalendarDays(parseISO(end), parseISO(start)) + 1);
    return {
      queryEnd: format(addDays(parseISO(end), 1), 'yyyy-MM-dd'),
      previousStart: format(subDays(parseISO(start), periodDays), 'yyyy-MM-dd'),
    };
  }, [end, start]);

  const currentQuery = useAnalyticsProfit(start, ranges.queryEnd);
  const previousQuery = useAnalyticsProfit(ranges.previousStart, start);
  const data = currentQuery.data ?? null;
  const previous = previousQuery.data ?? null;
  const cogs = data ? data.actualCogs ?? data.theoreticalCogs : 0;
  const previousCogs = previous ? previous.actualCogs ?? previous.theoreticalCogs : 0;
  const canCompare = Boolean(
    data
    && previous
    && previous.revenue >= 1_000
    && data.resultUsesActualCogs === previous.resultUsesActualCogs,
  );

  const drivers = data && previous && canCompare
    ? [
        {
          label: 'Выручка',
          contribution: data.revenue - previous.revenue,
          detail: `${formatSom(previous.revenue)} → ${formatSom(data.revenue)}`,
        },
        {
          label: data.resultUsesActualCogs ? 'Фактическая себестоимость' : 'Расчётная себестоимость',
          contribution: -(cogs - previousCogs),
          detail: `${formatSom(previousCogs)} → ${formatSom(cogs)}`,
        },
        {
          label: 'Операционные расходы',
          contribution: -(data.operatingExpenses - previous.operatingExpenses),
          detail: `${formatSom(previous.operatingExpenses)} → ${formatSom(data.operatingExpenses)}`,
        },
      ].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    : [];

  const changePeriod = (nextStart: string, nextEnd: string) => {
    const [normalizedStart, normalizedEnd] = nextStart <= nextEnd
      ? [nextStart, nextEnd]
      : [nextEnd, nextStart];
    const next = new URLSearchParams(searchParams);
    next.set('start', normalizedStart);
    next.set('end', normalizedEnd);
    setSearchParams(next, { replace: true });
  };

  return (
    <main className="page-shell page-shell--wide">
      <header className="mb-6 flex flex-col gap-4 border-b pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Прибыль</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Что осталось после себестоимости и операционных расходов
          </p>
        </div>
        <PeriodPicker start={start} end={end} onChange={changePeriod} />
      </header>

      {currentQuery.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          Не удалось рассчитать финансовый результат: {currentQuery.error.message}
        </div>
      ) : (
        <>
          <section aria-label="Финансовый итог" className="mb-6 grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4">
            <FinancialKpi
              label="Выручка"
              value={currentQuery.isPending || !data ? '—' : formatSom(data.revenue)}
              detail="оплаченные продажи"
              comparison={canCompare && data && previous
                ? relativeDelta(data.revenue, previous.revenue)
                : null}
            />
            <FinancialKpi
              label={data?.resultUsesActualCogs ? 'Фактическая себестоимость' : 'Расчётная себестоимость'}
              value={currentQuery.isPending || !data ? '—' : formatSom(cogs)}
              detail={data?.resultUsesActualCogs ? 'между переучётами' : 'по рецептурам продаж'}
              comparison={canCompare && data && previous ? relativeDelta(cogs, previousCogs) : null}
            />
            <FinancialKpi
              label="Операционные расходы"
              value={currentQuery.isPending || !data ? '—' : formatSom(data.operatingExpenses)}
              detail="кассовые движения типа «Расход»"
              comparison={canCompare && data && previous
                ? relativeDelta(data.operatingExpenses, previous.operatingExpenses)
                : null}
            />
            <FinancialKpi
              label="Результат до ФОТ"
              value={currentQuery.isPending || !data
                ? '—'
                : formatSom(data.resultBeforePayroll, { sign: true })}
              detail="зарплаты сотрудников не учтены"
              comparison={canCompare && data && previous
                ? relativeDelta(data.resultBeforePayroll, previous.resultBeforePayroll)
                : null}
              result
            />
          </section>

          {data && data.actualCogsStatus !== 'complete' && (
            <section className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Фактическая себестоимость не подтверждена</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Результат рассчитан по рецептурам. Нужны переучёты у обеих границ периода
                  {data.actualCogsMissingWarehouses.length > 0
                    ? `: ${data.actualCogsMissingWarehouses.join(', ')}`
                    : '.'}
                </p>
              </div>
              <Link
                to="/warehouse/inventory?create=true"
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Провести переучёт
              </Link>
            </section>
          )}

          <ResultComposition data={data} isPending={currentQuery.isPending} error={currentQuery.error} />

          <section className="mb-6 rounded-xl border bg-card p-5" aria-labelledby="drivers-title">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="drivers-title" className="text-sm font-semibold text-foreground">
                Что изменило результат
              </h2>
              <span className="text-xs text-muted-foreground">к предыдущему равному периоду</span>
            </div>
            {drivers.length > 0 ? (
              <div className="divide-y">
                {drivers.map((driver) => (
                  <div key={driver.label} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="text-sm font-medium text-foreground">{driver.label}</p>
                      <p className="text-xs text-muted-foreground">{driver.detail}</p>
                    </div>
                    <p className={driver.contribution >= 0
                      ? 'text-sm font-semibold tabular-nums text-success'
                      : 'text-sm font-semibold tabular-nums text-destructive'}>
                      {formatSom(driver.contribution, { sign: true })} к результату
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Нет сопоставимой базы: в предыдущем периоде слишком мало продаж или отличается основа себестоимости.
              </p>
            )}
          </section>

          <ResultChart
            rows={data?.rows ?? []}
            isPending={currentQuery.isPending}
            error={currentQuery.error}
          />
        </>
      )}
    </main>
  );
}
