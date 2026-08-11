import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { AnalyticsData } from '@/hooks/useAnalytics';
import {
  CHART_GREEN, CHART_RED,
  CHART_GREEN_SOLID, CHART_RED_SOLID,
  CHART_GREEN_HOVER, CHART_RED_HOVER,
  CHART_MUTED, CHART_WEEKEND,
  CHART_FONT_SIZE,
  TOOLTIP_STYLE, GRID_DEFAULTS,
  axisLabelStyle, axisLineStyle, splitLineStyle,
} from '@/lib/chartTheme';

function fmtSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

interface Props {
  data: AnalyticsData | null;
  isPending: boolean;
  error: Error | null;
}

export function RevenueChart({ data, isPending, error }: Props) {
  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <div className="h-72 flex items-center justify-center">
          <div className="h-56 bg-muted rounded animate-pulse w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <span className="text-sm text-destructive">Не удалось загрузить график</span>
        </div>
      </div>
    );
  }

  if (!data || data.dailyStats.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <div className="h-72 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          <span className="text-sm">Нет данных за выбранный период</span>
        </div>
      </div>
    );
  }

  const { dailyStats, periodLabel } = data;

  // Build weekend markAreas
  const weekendAreas = dailyStats.reduce<[{ xAxis: string }, { xAxis: string }][]>((acc, d) => {
    if (d.dayOfWeek === 'сб' || d.dayOfWeek === 'вс') {
      acc.push([{ xAxis: d.date }, { xAxis: d.date }]);
    }
    return acc;
  }, []);

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...TOOLTIP_STYLE,
      formatter: (params: unknown) => {
        const items = params as { seriesName: string; value: number; axisIndex: number }[];
        if (!items?.length) return '';
        const idx = items[0]?.axisIndex ?? 0;
        const d = dailyStats[idx];
        if (!d) return '';
        const rev = items.find((i) => i.seriesName === 'Выручка')?.value ?? 0;
        const cost = items.find((i) => i.seriesName === 'Себестоимость')?.value ?? 0;
        const margin = rev - cost;
        const dateObj = new Date(d.date);
        const dayOfMonth = dateObj.getDate();
        const monthName = dateObj.toLocaleString('ru-RU', { month: 'long' });
        const dayName = dateObj.toLocaleString('ru-RU', { weekday: 'long' });
        return `
          <div style="font-weight:600;margin-bottom:4px">${dayOfMonth} ${monthName}, ${dayName}</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <span>Выручка <span style="color:${CHART_GREEN_SOLID};font-weight:600">${fmtSom(rev)} сом</span></span>
            <span>Себест-ть <span style="color:${CHART_RED_SOLID};font-weight:600">${fmtSom(cost)} сом</span></span>
          </div>
          <div style="margin-top:2px;color:${margin >= 0 ? CHART_GREEN_SOLID : CHART_RED_SOLID};font-weight:600">
            Маржа ${fmtSom(margin)} сом
          </div>
          <div style="margin-top:4px;color:${CHART_MUTED}">
            Заказов: ${d.orderCount} · Чек: ${fmtSom(d.avgCheck)} сом
          </div>
        `;
      },
    },
    grid: GRID_DEFAULTS,
    xAxis: {
      type: 'category',
      data: dailyStats.map((d) => {
        const dayNum = new Date(d.date).getDate();
        return `${dayNum}\n${d.dayOfWeek}`;
      }),
      ...axisLineStyle(),
      axisTick: { show: false },
      axisLabel: {
        ...axisLabelStyle(CHART_FONT_SIZE),
        lineHeight: 15,
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        ...axisLabelStyle(CHART_FONT_SIZE),
        formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)),
      },
      splitLine: splitLineStyle(),
      min: 0,
    },
    series: [
      {
        name: 'Выручка',
        type: 'bar',
        data: dailyStats.map((d) => d.revenue),
        itemStyle: {
          color: CHART_GREEN,
          borderRadius: [3, 3, 0, 0],
        },
        barWidth: '46%',
        emphasis: {
          itemStyle: { color: CHART_GREEN_HOVER },
        },
        markArea: {
          silent: true,
          data: weekendAreas,
          itemStyle: { color: CHART_WEEKEND },
          label: { show: false },
        },
      },
      {
        name: 'Себестоимость',
        type: 'bar',
        data: dailyStats.map((d) => d.cost),
        itemStyle: {
          color: CHART_RED,
          borderRadius: [3, 3, 0, 0],
        },
        barWidth: '46%',
        barGap: '-100%',
        emphasis: {
          itemStyle: { color: CHART_RED_HOVER },
        },
      },
    ],
  };

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">
          {periodLabel}
        </h3>
        <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: CHART_GREEN }} />
            Выручка
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: CHART_RED }} />
            Себест-ть
          </span>
        </div>
      </div>
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
    </div>
  );
}
