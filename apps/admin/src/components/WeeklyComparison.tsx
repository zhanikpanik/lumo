import ReactECharts from 'echarts-for-react';
import type { WeekSlice } from '@/hooks/useWeeklyStats';
import {
  CHART_GREEN_SOLID, CHART_RED_SOLID, CHART_MUTED, CHART_GRID,
  CHART_FONT, CHART_FONT_SIZE, CHART_FONT_SIZE_SM,
  TOOLTIP_STYLE, WEEK_COLORS, WEEK_WIDTHS, WEEK_OPACITIES,
  axisLabelStyle, axisLineStyle, splitLineStyle,
} from '@/lib/chartTheme';

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function formatSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

function pctDelta(current: number, previous: number): string {
  if (previous === 0) return '—';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${Math.round(pct)}%`;
}

interface Props {
  weeks: WeekSlice[];
  isPending: boolean;
}

export function WeeklyComparison({ weeks, isPending }: Props) {
  if (isPending) {
    return (
      <div className="bg-card rounded-xl p-4">
        <div className="h-4 bg-muted rounded w-36 mb-3 animate-pulse" />
        <div className="h-[180px] bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (weeks.length === 0) {
    return (
      <div className="bg-card rounded-xl p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Неделя к неделе</h3>
        <div className="h-[180px] flex flex-col items-center justify-center text-muted-foreground gap-2">
          <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
          </svg>
          <span className="text-sm">Нет данных за выбранный период</span>
        </div>
      </div>
    );
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      ...TOOLTIP_STYLE,
      formatter: (params: { seriesName: string; value: number; axisIndex: number }[]) => {
        if (!params?.length) return '';
        const dayIdx = params[0]?.axisIndex ?? 0;
        const dayLabel = DAY_LABELS[dayIdx] || '';
        let html = `<div style="font-weight:600;margin-bottom:4px">${dayLabel}</div>`;
        // Newest first
        for (let w = weeks.length - 1; w >= 0; w--) {
          const d = weeks[w].days[dayIdx];
          if (!d) continue;
          const isCurrent = w === weeks.length - 1;
          html += `<div style="display:flex;justify-content:space-between;gap:16px;${isCurrent ? 'font-weight:600' : ''}">
            <span>${weeks[w].label}</span>
            <span style="color:${WEEK_COLORS[w]}">${formatSom(d.revenue)} сом</span>
          </div>`;
        }
        return html;
      },
    },
    grid: { top: 8, right: 8, bottom: 24, left: 48 },
    xAxis: {
      type: 'category',
      data: DAY_LABELS,
      ...axisLineStyle(),
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(CHART_FONT_SIZE), fontWeight: 600 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        ...axisLabelStyle(CHART_FONT_SIZE),
        formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)),
      },
      splitLine: splitLineStyle(),
    },
    series: weeks.map((week, wi) => {
      const isCurrent = wi === weeks.length - 1;
      const data = week.days.map((d) => d.revenue);
      return {
        name: week.label,
        type: 'line',
        data,
        smooth: true,
        symbol: isCurrent ? 'circle' : 'none',
        symbolSize: isCurrent ? 5 : 0,
        lineStyle: {
          color: WEEK_COLORS[wi],
          width: WEEK_WIDTHS[wi],
          opacity: WEEK_OPACITIES[wi],
        },
        itemStyle: {
          color: WEEK_COLORS[wi],
          borderColor: '#fff',
          borderWidth: 2,
        },
        areaStyle: isCurrent
          ? {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(22, 163, 74, 0.25)' },
                  { offset: 1, color: 'rgba(22, 163, 74, 0.03)' },
                ],
              },
            }
          : undefined,
        emphasis: { symbolSize: 7, focus: 'series' },
        z: isCurrent ? 10 : 1,
      };
    }),
  };

  const weekSummaries = weeks.map((w, i) => {
    const isCurrent = i === weeks.length - 1;
    const prevRevenue = i > 0 ? weeks[i - 1].totalRevenue : 0;
    return {
      label: w.label,
      revenue: w.totalRevenue,
      expenses: w.totalExpenses,
      net: w.totalRevenue - w.totalExpenses,
      delta: i > 0 ? pctDelta(w.totalRevenue, prevRevenue) : null,
      isCurrent,
    };
  });

  return (
    <div className="bg-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">
          Неделя к неделе
        </h3>
      </div>

      <ReactECharts option={option} style={{ height: 180 }} notMerge />

      {/* Weekly summary row */}
      <div className="flex gap-3 mt-2 text-sm">
        {weekSummaries.map((ws, i) => (
          <div
            key={i}
            className={`flex-1 min-w-0 ${ws.isCurrent ? 'font-semibold' : ''}`}
            style={{ color: ws.isCurrent ? CHART_GREEN_SOLID : CHART_MUTED }}
          >
            <div className="truncate text-xs">{ws.label.slice(0, 6)}</div>
            <div className="tabular-nums">{formatSom(ws.revenue).replace(/\s/g, '\u00A0')}</div>
            {ws.delta && (
              <div
                className={`text-xs ${ws.delta.startsWith('+') ? '' : ws.delta === '—' ? '' : ''}`}
                style={{ color: ws.delta.startsWith('+') ? CHART_GREEN_SOLID : ws.delta === '—' ? CHART_MUTED : CHART_RED_SOLID }}
              >
                {ws.delta}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
