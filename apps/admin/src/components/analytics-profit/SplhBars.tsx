import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { DailyProfitRow } from '@/hooks/useAnalyticsProfit';
import {
  CHART_GREEN, CHART_GREEN_SOLID, CHART_GREEN_HOVER,
  CHART_RED, CHART_RED_SOLID, CHART_RED_HOVER,
  CHART_MUTED, CHART_DARK, CHART_GRID,
  CHART_FONT, CHART_FONT_SIZE,
  TOOLTIP_STYLE, GRID_DEFAULTS,
  axisLabelStyle, splitLineStyle,
} from '@/lib/chartTheme';

function fmtSom(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

interface Props {
  rows: DailyProfitRow[];
  isPending: boolean;
  error: Error | null;
}

const SPLH_NORM = 4000; // threshold line

export function SplhBars({ rows, isPending, error }: Props) {
  // ── Skeleton ──
  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
        <div className="h-4 bg-muted rounded w-56 mb-4 animate-pulse" />
        <div className="h-52 bg-muted rounded animate-pulse w-full" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Выручка на час работы по дням</h3>
        <div className="h-52 flex items-center justify-center">
          <span className="text-sm text-destructive">Не удалось загрузить данные</span>
        </div>
      </div>
    );
  }

  // ── Empty ──
  const activeRows = rows.filter((r) => r.revenue > 0);
  if (activeRows.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Выручка на час работы по дням</h3>
        <div className="h-52 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Нет данных за выбранный период</span>
        </div>
      </div>
    );
  }

  // Use last 7 days with revenue
  const chartRows = activeRows.slice(-7);

  const days = chartRows.map((r) => r.dayOfWeek);
  const values = chartRows.map((r) => r.splh ?? 0);

  // Color each bar based on threshold
  const barColors = values.map((v) =>
    v >= SPLH_NORM ? CHART_GREEN : CHART_RED
  );
  const barHoverColors = values.map((v) =>
    v >= SPLH_NORM ? CHART_GREEN_HOVER : CHART_RED_HOVER
  );

  const option: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...TOOLTIP_STYLE,
      formatter: (params: unknown) => {
        const items = params as { value: number; axisIndex: number }[];
        if (!items?.length) return '';
        const idx = items[0]?.axisIndex ?? 0;
        const r = chartRows[idx];
        if (!r) return '';
        const isGood = (r.splh ?? 0) >= SPLH_NORM;
        const status = isGood ? '✓ В норме' : '✗ Ниже нормы';
        const color = isGood ? CHART_GREEN_SOLID : CHART_RED_SOLID;
        return `
          <div style="font-weight:600;margin-bottom:4px">${r.date}, ${r.dayOfWeek}</div>
          <div style="color:${color};font-weight:600;font-size:16px">${fmtSom(r.splh ?? 0)} сом/час</div>
          <div style="margin-top:4px;color:${CHART_MUTED}">${status} (норма ${fmtSom(SPLH_NORM)})</div>
          <div style="color:${CHART_MUTED}">Выручка: ${fmtSom(r.revenue)} сом · Часов: ${r.laborHours.toFixed(1)}</div>
        `;
      },
    },
    grid: { ...GRID_DEFAULTS, bottom: 40 },
    xAxis: {
      type: 'category',
      data: days,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_GRID } },
      axisLabel: axisLabelStyle(CHART_FONT_SIZE),
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
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: barColors[i],
            borderRadius: [3, 3, 0, 0],
          },
          emphasis: {
            itemStyle: { color: barHoverColors[i] },
          },
        })),
        barWidth: '50%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: CHART_MUTED,
            type: 'dashed',
            width: 1.5,
          },
          label: {
            show: true,
            position: 'end',
            formatter: `Норма ${fmtSom(SPLH_NORM)}`,
            color: CHART_MUTED,
            fontSize: 11,
            fontFamily: CHART_FONT,
          },
          data: [{ yAxis: SPLH_NORM }],
        },
      },
    ],
  };

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Выручка на час работы по дням
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Норма: {fmtSom(SPLH_NORM)} сом/час. Зелёный — выше нормы, красный — ниже.
      </p>
      <ReactECharts option={option} style={{ height: 240 }} notMerge />
    </div>
  );
}
