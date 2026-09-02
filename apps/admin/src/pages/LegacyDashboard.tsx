import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ActionBar } from '@/components/dashboard/ActionBar';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { ChronologyFeed } from '@/components/dashboard/ChronologyFeed';
import { OperationalDocumentsSection } from '@/components/dashboard/OperationalDocumentsSection';
import { getMockData } from '@/hooks/useDashboardMockData';
import { CHART_MUTED, TOOLTIP_STYLE } from '@/lib/chartTheme';

const PREVIEW_TIMESTAMP = Date.now();

type MetricFormat = 'som' | 'count' | 'percent';


function fmtSom(value: number | undefined | null): string {
  if (value == null) return '0';
  return Math.round(value).toLocaleString('ru-RU');
}

function Sparkline({ data, format, dayLabels }: {
  data: number[];
  format: MetricFormat;
  dayLabels: string[];
}) {
  const formatValue = (value: number) => {
    if (format === 'percent') return `${value}%`;
    if (format === 'count') return String(value);
    return `${fmtSom(Math.round(value))} с`;
  };
  const option = {
    tooltip: {
      trigger: 'axis',
      ...TOOLTIP_STYLE,
      formatter: (params: unknown) => {
        const items = params as { axisValue: string; value: number }[];
        if (!items?.length) return '';
        const item = items[0];
        return `<div style="font-weight:600;margin-bottom:2px">${item.axisValue}</div><span>${formatValue(item.value)}</span>`;
      },
    },
    grid: { top: 2, right: 0, bottom: 2, left: 0 },
    xAxis: { type: 'category', data: dayLabels, show: false },
    yAxis: {
      type: 'value',
      show: false,
      min: (value: { min: number }) => value.min - value.min * 0.1,
    },
    series: [{
      type: 'line',
      data,
      smooth: false,
      symbol: 'none',
      lineStyle: { color: CHART_MUTED, width: 1.5 },
      areaStyle: { color: 'rgba(100, 116, 139, 0.12)' },
    }],
  };

  return <ReactECharts option={option} style={{ width: '100%', maxWidth: 160, height: 32 }} notMerge />;
}



export function LegacyDashboard() {
  const data = getMockData('today');

  const alerts = data.alerts;
  const totalAlerts = alerts.length;
  const lastWeekDay = new Date(PREVIEW_TIMESTAMP - 7 * 86400000)
    .toLocaleDateString('ru-RU', { weekday: 'short' })
    .replace('.', '');
  const sparklineDayLabels = useMemo(() => {
    const labels: string[] = [];
    for (let day = 6; day >= 0; day -= 1) {
      const date = new Date(PREVIEW_TIMESTAMP - day * 86400000);
      labels.push(date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', ''));
    }
    return labels;
  }, []);
  const sparklineDailyData = [
    data.dailyRevenues,
    data.dailyChecks,
    data.dailyAvgChecks,
    data.dailyExpenses,
    data.dailyFoodCostPercents,
  ];


  return (
    <div className="min-h-full bg-background">
      <ActionBar criticalCount={data.criticalCount} totalAlertCount={totalAlerts} />

      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
        <h2 className="text-2xl font-bold text-foreground">Дашборд</h2>

        {data.yesterdayShift && (
          <div className="text-sm text-muted-foreground">
            Вчера:{' '}
            {data.yesterdayShift.closed ? (
              <>
                <span className="font-medium text-foreground">смена закрыта</span>
                {data.yesterdayShift.revenue != null && (
                  <> · <span className="text-foreground">{fmtSom(data.yesterdayShift.revenue)} сом</span></>
                )}
                {data.yesterdayShift.checks != null && (
                  <> · <span className="text-foreground">{data.yesterdayShift.checks} чеков</span></>
                )}
                {data.yesterdayShift.cashDifference != null && data.yesterdayShift.cashDifference !== 0 && (
                  <span className={data.yesterdayShift.cashDifference > 0 ? ' text-success' : ' text-destructive'}>
                    {' '}· расхождение {fmtSom(data.yesterdayShift.cashDifference)} сом
                  </span>
                )}
              </>
            ) : (
              <span className="font-medium text-amber-600">смена не закрыта</span>
            )}
          </div>
        )}

        <div>
          <div>
            <p className="mb-3 text-sm font-medium text-foreground">
              Сегодня, {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
              {data.metrics.map((metric, index) => (
                <div key={metric.label} className="px-2">
                  <div className="flex min-w-0 flex-col">
                    <p className="mb-1 truncate text-sm text-muted-foreground">{metric.label}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="truncate text-2xl font-bold text-foreground">
                        {metric.format === 'percent' ? `${metric.todayValue}%` : fmtSom(metric.todayValue)}
                      </span>
                      {metric.format === 'som' && <span className="shrink-0 text-sm text-foreground">с</span>}
                    </div>
                    <div className="mt-0.5 h-5">
                      {metric.todayTrend != null && (() => {
                        const value = metric.todayTrend.value;
                        const color = value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-muted-foreground';
                        const comparison = metric.format === 'count'
                          ? `${value > 0 ? '+' : ''}${value} к ${lastWeekDay}`
                          : `${value > 0 ? '+' : ''}${value}% к ${lastWeekDay}`;
                        return <p className={`text-sm leading-5 ${color}`}>{comparison}</p>;
                      })()}
                    </div>
                    <div className="mt-2">
                      <Sparkline
                        data={sparklineDailyData[index] ?? []}
                        format={metric.format}
                        dayLabels={sparklineDayLabels}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>


        <OperationalDocumentsSection />

        <section aria-labelledby="legacy-alerts-title">
          <div className="mb-1 flex items-baseline gap-2">
            <h3 id="legacy-alerts-title" className="text-sm font-medium text-foreground">
              Требуют действий
            </h3>
            <span className="text-sm tabular-nums text-muted-foreground">{totalAlerts}</span>
          </div>
          {alerts.length > 0 ? (
            <div className="grid lg:grid-cols-2 lg:gap-x-8">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  type={alert.type}
                  message={alert.message}
                  detail={alert.detail}
                  actionLabel={alert.actionLabel}
                  actionHref={alert.actionHref}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Задач, требующих действий, нет</p>
          )}
        </section>

        <ChronologyFeed events={data.chronology.slice(0, 5)} title="Последние события" />

      </div>
    </div>
  );
}
