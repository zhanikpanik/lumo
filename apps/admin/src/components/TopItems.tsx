import ReactECharts from 'echarts-for-react';
import type { TopItem } from '@/hooks/useTopItems';
import {
  CHART_GREEN_SOLID, CHART_DARK, CHART_MUTED,
  CHART_FONT, CHART_FONT_SIZE,
  TOOLTIP_STYLE,
} from '@/lib/chartTheme';

function formatSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

function getBarOption(
  items: TopItem[],
  label: string,
  color: string,
  valueFormatter: (v: number) => string,
  secondaryLabel: string,
  secondaryFormatter: (v: number) => string,
) {
  const data = [...items].sort((a, b) => b.value - a.value);
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...TOOLTIP_STYLE,
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0]; if (!p) return '';
        const item = data.find((d) => d.name === p.name);
        return `
          <div style="font-weight:600;margin-bottom:4px">${p.name}</div>
          <div>${label}: <b>${valueFormatter(p.value)}</b></div>
          <div style="color:${CHART_MUTED}">${secondaryLabel}: ${secondaryFormatter(item?.secondary ?? 0)}</div>
        `;
      },
    },
    grid: { top: 4, right: 80, bottom: 4, left: 4 },
    xAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.name).reverse(),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_DARK,
        fontSize: CHART_FONT_SIZE,
        fontFamily: CHART_FONT,
        fontWeight: 500,
        margin: 6,
        width: 100,
        overflow: 'truncate',
      },
    },
    series: [
      {
        type: 'bar',
        data: data.reverse().map((d, i) => ({
          value: d.value,
          itemStyle: {
            color,
            opacity: 0.55 + (i / data.length) * 0.45,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 22,
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          fontFamily: CHART_FONT,
          color: CHART_MUTED,
          fontWeight: 500,
          formatter: (p: { value: number }) => valueFormatter(p.value),
          distance: 6,
        },
      },
    ],
  };
}

interface Props {
  dishes: TopItem[];
  ingredients: TopItem[];
  isPending: boolean;
}

export function TopItems({ dishes, ingredients, isPending }: Props) {
  if (isPending) {
    return (
      <div className="bg-card rounded-xl p-4">
        <div className="h-4 bg-muted rounded w-44 mb-3 animate-pulse" />
        <div className="h-[200px] bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (dishes.length === 0) {
    return (
      <div className="bg-card rounded-xl p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Выручка по блюдам</h3>
        <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground gap-2">
          <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          <span className="text-sm">Нет продаж за выбранный период</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-4">
      <h3 className="text-base font-semibold text-foreground mb-3">Выручка по блюдам</h3>
      <ReactECharts
        option={getBarOption(
          dishes,
          'Выручка',
          CHART_GREEN_SOLID,
          (v) => `${formatSom(v)} сом`,
          'Заказов',
          (v) => String(v),
        )}
        style={{ height: Math.max(180, dishes.length * 28 + 8) }}
        notMerge
      />
    </div>
  );
}
