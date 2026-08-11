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

function fmtSomSigned(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return sign + fmtSom(n);
}

interface Props {
  rows: DailyProfitRow[];
  isPending: boolean;
  error: Error | null;
}

export function EbitChart({ rows, isPending, error }: Props) {
  // ── Skeleton ──
  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
        <div className="h-4 bg-muted rounded w-64 mb-4 animate-pulse" />
        <div className="h-60 bg-muted rounded animate-pulse w-full" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Итог дня</h3>
        <div className="h-60 flex items-center justify-center">
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
        <h3 className="text-sm font-semibold text-foreground mb-4">Итог дня</h3>
        <div className="h-60 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Нет данных за выбранный период</span>
        </div>
      </div>
    );
  }

  // Use up to 14 days
  const chartRows = activeRows.slice(-14);

  const labels = chartRows.map((r) => {
    const d = new Date(r.date);
    return `${d.getDate()}\n${r.dayOfWeek}`;
  });
  const values = chartRows.map((r) => r.ebit ?? 0);

  // Color each bar: green for positive, red for negative
  const barColors = values.map((v) => (v >= 0 ? CHART_GREEN : CHART_RED));
  const barHoverColors = values.map((v) => (v >= 0 ? CHART_GREEN_HOVER : CHART_RED_HOVER));

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
        const ebit = r.ebit ?? 0;
        const isGood = ebit >= 0;
        const color = isGood ? CHART_GREEN_SOLID : CHART_RED_SOLID;
        const status = isGood ? 'День окупился' : 'День в минусе';
        const cogs = r.actualCogs ?? r.theoreticalCogs;
        return `
          <div style="font-weight:600;margin-bottom:4px">${r.date}, ${r.dayOfWeek}</div>
          <div style="color:${color};font-weight:600;font-size:16px">${fmtSomSigned(ebit)} сом</div>
          <div style="margin-top:4px;color:${CHART_MUTED}">${status}</div>
          <div style="margin-top:6px;font-size:11px;color:${CHART_MUTED}">
            Выручка ${fmtSom(r.revenue)} − Продукты ${fmtSom(cogs)} − Труд ${fmtSom(r.laborCost)} − Пост. ${fmtSom(5000)}
          </div>
        `;
      },
    },
    grid: { ...GRID_DEFAULTS, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_GRID } },
      axisLabel: {
        ...axisLabelStyle(CHART_FONT_SIZE),
        lineHeight: 15,
      },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        ...axisLabelStyle(CHART_FONT_SIZE),
        formatter: (v: number) => `${fmtSomSigned(v)}`,
      },
      splitLine: splitLineStyle(),
    },
    series: [
      {
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: {
            color: barColors[i],
            borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
          },
          emphasis: {
            itemStyle: { color: barHoverColors[i] },
          },
        })),
        barWidth: '55%',
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {
            color: CHART_DARK,
            type: 'solid',
            width: 1,
          },
          label: {
            show: false,
          },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  };

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Итог дня
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Выручка − продукты − труд − постоянные расходы. Зелёный — в плюсе, красный — в минусе.
      </p>
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
    </div>
  );
}
