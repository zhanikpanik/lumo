import { useCallback, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ExpenseCategory } from '@/hooks/useExpenseCategories';
import {
  CHART_RED_SOLID, CHART_DARK, CHART_MUTED, CHART_GRID,
  CHART_FONT, CHART_FONT_SIZE, CHART_FONT_SIZE_SM,
  TOOLTIP_STYLE, axisLabelStyle, splitLineStyle,
} from '@/lib/chartTheme';

function formatSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

interface Props {
  categories: ExpenseCategory[];
  isPending: boolean;
}

export function ExpenseTreemap({ categories, isPending }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleClick = useCallback((params: { name: string }) => {
    const cat = categories.find((c) => c.name === params.name);
    if (cat?.children?.length) {
      setExpanded(expanded === params.name ? null : params.name);
    }
  }, [categories, expanded]);

  if (isPending) {
    return (
      <div className="bg-card rounded-xl p-4">
        <div className="h-4 bg-muted rounded w-44 mb-3 animate-pulse" />
        <div className="h-[220px] bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="bg-card rounded-xl p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Расходы по категориям</h3>
        <div className="h-[220px] flex flex-col items-center justify-center text-muted-foreground gap-2">
          <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-sm">Нет расходов за выбранный период</span>
        </div>
      </div>
    );
  }

  const total = categories.reduce((s, c) => s + c.amount, 0);

  // Build bars: top-level, plus expanded sub-categories
  const bars: { name: string; value: number; color: string; depth: number; parent: string | null }[] = [];
  for (const cat of categories) {
    bars.push({ name: cat.name, value: cat.amount, color: cat.color, depth: 0, parent: null });
    if (expanded === cat.name && cat.children) {
      for (const sub of cat.children) {
        bars.push({ name: sub.name, value: sub.amount, color: sub.color, depth: 1, parent: cat.name });
      }
    }
  }

  const yData = bars.map((b) => b.name);
  const xData = bars.map((b) => b.value);

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      ...TOOLTIP_STYLE,
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        if (!p) return '';
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : '0';
        return `
          <div style="font-weight:600;margin-bottom:4px">${p.name}</div>
          <div>${formatSom(p.value)} сом · ${pct}%</div>
        `;
      },
    },
    grid: { top: 8, right: 16, bottom: 8, left: 120 },
    xAxis: {
      type: 'value',
      min: 0,
      axisLabel: {
        ...axisLabelStyle(CHART_FONT_SIZE),
        formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)),
      },
      splitLine: splitLineStyle(),
    },
    yAxis: {
      type: 'category',
      data: yData,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_DARK,
        fontSize: CHART_FONT_SIZE,
        fontFamily: CHART_FONT,
        fontWeight: 500,
        margin: 10,
        formatter: (name: string) => {
          const bar = bars.find((b) => b.name === name);
          if (bar?.depth === 1) return `  ↳ ${name}`;
          return name;
        },
      },
    },
    series: [
      {
        type: 'bar',
        data: xData.map((v, i) => {
          const opacity = 0.45 + (i / Math.max(xData.length - 1, 1)) * 0.55;
          const barColor = bars[i].depth === 1
            ? bars[i].color
            : CHART_RED_SOLID;
          return {
            value: v,
            itemStyle: {
              color: barColor,
              opacity: opacity,
              borderRadius: bars[i].depth === 0 ? [0, 6, 6, 0] : [0, 4, 4, 0],
            },
          };
        }),
        barMaxWidth: 18,
        emphasis: {
          itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.1)' },
        },
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          fontFamily: CHART_FONT,
          color: CHART_MUTED,
          formatter: (params: { value: number }) => formatSom(params.value),
        },
      },
    ],
  };

  return (
    <div className="bg-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">Расходы по категориям</h3>
        <span className="text-sm text-muted-foreground">
          всего {formatSom(total)} сом
        </span>
      </div>

      <ReactECharts
        option={option}
        style={{ height: Math.max(220, bars.length * 30 + 20) }}
        onEvents={{ click: handleClick }}
        notMerge
      />

      {categories.some((c) => c.children?.length) && (
        <p className="text-xs text-muted-foreground mt-2">
          Нажмите на категорию, чтобы развернуть
        </p>
      )}
    </div>
  );
}
