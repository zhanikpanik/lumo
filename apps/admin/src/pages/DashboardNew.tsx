import { ActionBar } from '@/components/dashboard/ActionBar';
import { ChronologyFeed } from '@/components/dashboard/ChronologyFeed';
import { SituationCard } from '@/components/dashboard/SituationCard';
import { useDashboardOperationalData } from '@/hooks/useDashboardOperationalData';
import { formatTiyin } from '@/lib/formatSom';
import { cn } from '@/lib/utils';

interface KpiTileProps {
  label: string;
  value: string;
  comparison?: string;
  comparisonTone?: 'positive' | 'negative' | 'muted';
}

function KpiTile({
  label,
  value,
  comparison,
  comparisonTone = 'muted',
}: KpiTileProps) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {comparison && (
        <p className={cn(
          'mt-1 text-xs',
          comparisonTone === 'positive' && 'text-success',
          comparisonTone === 'negative' && 'text-destructive',
          comparisonTone === 'muted' && 'text-muted-foreground',
        )}>
          {comparison}
        </p>
      )}
    </div>
  );
}

interface StateItemProps {
  label: string;
  value: string;
  tone?: 'good' | 'warning' | 'muted';
}

function StateItem({ label, value, tone = 'muted' }: StateItemProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 py-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <span className={cn(
          'size-2 shrink-0 rounded-full',
          tone === 'good' && 'bg-success',
          tone === 'warning' && 'bg-warning',
          tone === 'muted' && 'bg-muted-foreground',
        )} />
        <p className="truncate text-right text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}


export function Dashboard() {
  const { data, isLoading, error } = useDashboardOperationalData();

  if (error) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <p className="font-medium text-destructive">Не удалось загрузить Дашборд</p>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  const situations = data?.situations ?? [];
  const visibleSituations = situations.slice(0, 3);
  const blockedCount = situations.filter((situation) => situation.class === 'blocked').length;
  const today = data?.today;
  const shift = data?.shift;
  const inventory = data?.inventoryFreshness;
  const revenueTrend = today?.revenueTrendPercent;
  const checkTrend = today?.checkTrendDelta;
  const dashboardDate = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const inventoryState = inventory?.status === 'current'
    ? `${inventory.currentWarehouseCount} из ${inventory.warehouseCount} складов актуальны`
    : inventory?.status === 'stale'
      ? `Просрочено · ${inventory.ageDays ?? '—'} дн.`
      : inventory?.status === 'unavailable'
        ? 'Данные недоступны'
        : 'Нет полного переучёта';

  return (
    <div className="min-h-full bg-background">
      <ActionBar criticalCount={blockedCount} totalAlertCount={situations.length} />

      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Дашборд</h1>
            <p className="mt-1 capitalize text-sm text-muted-foreground">{dashboardDate}</p>
          </div>
          {data && (
            <p className="text-xs text-muted-foreground">
              Обновлено {new Date(data.computedAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </header>

        {isLoading && !data ? (
          <div className="space-y-6" aria-label="Загрузка данных">
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        ) : data && today ? (
          <>
            <section id="alerts" aria-labelledby="attention-title" className="scroll-mt-20">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 id="attention-title" className="text-sm font-semibold text-foreground">
                  Требуют действий{' '}
                  {situations.length > 0 && (
                    <span className="ml-2 font-medium text-muted-foreground">{situations.length}</span>
                  )}
                </h2>
              </div>

              {visibleSituations.length > 0 ? (
                <>
                  <div className="space-y-4">
                    {visibleSituations.map((situation) => (
                      <SituationCard
                        key={situation.id}
                        situation={situation}
                      />
                    ))}
                  </div>
                  {situations.length > visibleSituations.length && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Ещё {situations.length - visibleSituations.length} ниже по приоритету
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 py-2">
                  <span className="size-2.5 rounded-full bg-success" />
                  <p className="text-sm font-medium text-foreground">Задач, требующих действий, нет</p>
                </div>
              )}
            </section>

            <section aria-labelledby="today-title">
              <h2 id="today-title" className="mb-2 text-sm font-semibold text-foreground">
                Сегодня
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
                <KpiTile
                  label="Выручка"
                  value={formatTiyin(today.revenueTiyin)}
                  comparison={revenueTrend == null
                    ? 'Нет базы для сравнения'
                    : `${revenueTrend > 0 ? '+' : ''}${revenueTrend}% к этому времени неделю назад`}
                  comparisonTone={revenueTrend == null
                    ? 'muted'
                    : revenueTrend >= 0 ? 'positive' : 'negative'}
                />
                <KpiTile
                  label="Чеки"
                  value={today.paidOrderCount.toLocaleString('ru-RU')}
                  comparison={checkTrend == null
                    ? 'Нет базы для сравнения'
                    : `${checkTrend > 0 ? '+' : ''}${checkTrend} к этому времени неделю назад`}
                  comparisonTone={checkTrend == null
                    ? 'muted'
                    : checkTrend >= 0 ? 'positive' : 'negative'}
                />
                <KpiTile label="Средний чек" value={formatTiyin(today.averageCheckTiyin)} />
                <KpiTile label="Расходы" value={formatTiyin(today.expenseTiyin)} />
                <KpiTile
                  label="Фудкост"
                  value={today.foodCostPercent == null ? '—' : `${today.foodCostPercent}%`}
                  comparison={today.foodCostPercent == null
                    ? 'Нет снимка себестоимости'
                    : formatTiyin(today.foodCostTiyin)}
                />
              </div>
            </section>


            <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
              <section aria-labelledby="state-title">
                <h2 id="state-title" className="mb-2 text-sm font-semibold text-foreground">
                  Состояние
                </h2>
                <div className="space-y-3">
                  <StateItem
                    label="Смена"
                    value={shift?.isOpen
                      ? `Открыта ${shift.hoursOpen.toFixed(1)} ч`
                      : 'Не открыта'}
                    tone={shift?.isOpen ? 'good' : 'warning'}
                  />
                  <StateItem
                    label="Активные заказы"
                    value={data.activeOrders.stuckOlderThan60Min > 0
                      ? `${data.activeOrders.count} · зависли ${data.activeOrders.stuckOlderThan60Min}`
                      : `${data.activeOrders.count} · без зависших`}
                    tone={data.activeOrders.stuckOlderThan60Min > 0 ? 'warning' : 'good'}
                  />
                  <StateItem
                    label="Склад"
                    value={inventoryState}
                    tone={inventory?.status === 'current' ? 'good' : 'warning'}
                  />
                  <StateItem
                    label="Вчера"
                    value={!data.yesterdayShift
                      ? 'Смена не найдена'
                      : data.yesterdayShift.closed ? 'Смена закрыта' : 'Смена не закрыта'}
                    tone={data.yesterdayShift?.closed ? 'good' : 'warning'}
                  />
                </div>
              </section>

              <ChronologyFeed events={data.chronology.slice(0, 5)} title="Последние значимые события" />
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
