import ReactECharts from 'echarts-for-react';
import type { HourlySplhCell } from '@/hooks/useAnalyticsProfit';
import {
  CHART_DARK, CHART_MUTED, CHART_FONT, CHART_FONT_SIZE_SM,
  TOOLTIP_STYLE,
} from '@/lib/chartTheme';

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const DAY_LABELS_FULL = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOUR_LABELS = Array.from({ length: 17 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);

function fmtSom(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

// SPLH color scale: red (bad) → yellow (ok) → green (good)
// Bad: <2500, Warn: 2500-4000, Good: >4000
const SPLH_COLORS = ['#FEE2E2', '#FEF9C3', '#DCFCE7', '#BBF7D0', '#86EFAC', '#4ADE80', '#16A34A'];

function splhColor(splh: number | null): string {
  if (splh === null) return '#F1F5F9'; // no data — light gray
  if (splh < 1500) return SPLH_COLORS[0];
  if (splh < 2500) return SPLH_COLORS[1];
  if (splh < 4000) return SPLH_COLORS[2];
  if (splh < 6000) return SPLH_COLORS[3];
  if (splh < 8000) return SPLH_COLORS[4];
  if (splh < 12000) return SPLH_COLORS[5];
  return SPLH_COLORS[6];
}

interface Props {
  cells: HourlySplhCell[];
  isPending: boolean;
  error: Error | null;
}

export function SplhHeatmap({ cells, isPending, error }: Props) {
  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
        <div className="h-4 bg-muted rounded w-64 mb-3 animate-pulse" />
        <div className="h-[240px] bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Выручка на час работы</h3>
        <div className="h-[240px] flex items-center justify-center">
          <span className="text-sm text-destructive">Не удалось загрузить данные</span>
        </div>
      </div>
    );
  }

  if (!cells || cells.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Выручка на час работы</h3>
        <div className="h-[240px] flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Нет данных за выбранный период</span>
        </div>
      </div>
    );
  }

  // Build heatmap data: [dayIndex, hourIndex, splh]
  const heatData = cells
    .filter((c) => c.hour >= 7 && c.hour <= 23 && c.dayIndex >= 0 && c.dayIndex <= 6)
    .map((c) => [c.dayIndex, c.hour - 7, c.splh ?? 0] as [number, number, number]);

  // Find max SPLH for color scale (cap at 12000)
  const maxSplh = Math.min(Math.max(...heatData.map((d) => d[2]), 4000), 12000);

  // Daily average SPLH for summary row
  const dailyAvgSplh = Array.from({ length: 7 }, (_, dayIdx) => {
    const dayCells = cells.filter((c) => c.dayIndex === dayIdx);
    const totalRev = dayCells.reduce((s, c) => s + c.revenue, 0);
    const totalHours = dayCells.reduce((s, c) => s + c.laborHours, 0);
    return totalHours > 0 ? Math.round(totalRev / totalHours) : 0;
  });

  const option = {
    tooltip: {
      ...TOOLTIP_STYLE,
      formatter: (params: { data: number[] }) => {
        const [dayIdx, hourIdx, splh] = params.data;
        const hour = hourIdx + 7;
        const cell = cells.find((c) => c.dayIndex === dayIdx && c.hour === hour);
        const timeLabel = `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`;
        const splhDisplay = cell?.splh !== null ? fmtSom(cell?.splh ?? 0) : '—';
        const color = splh >= 4000 ? '#16A34A' : splh >= 2500 ? '#D97706' : '#DC2626';
        const status = splh >= 4000 ? '✓ Эффективно' : splh >= 2500 ? '⚠ Ниже нормы' : '✗ Простой';
        return `
          <div style="font-weight:600;margin-bottom:4px">${DAY_LABELS_FULL[dayIdx]} ${timeLabel}</div>
          <div style="color:${color};font-weight:600;font-size:16px">${splhDisplay} сом/час</div>
          <div style="margin-top:4px;color:${CHART_MUTED}">${status}</div>
          ${cell ? `<div style="color:${CHART_MUTED};font-size:11px">Выручка: ${fmtSom(cell.revenue)} сом · Часов: ${cell.laborHours.toFixed(1)}</div>` : ''}
        `;
      },
    },
    grid: {
      top: 4,
      right: 4,
      bottom: 4,
      left: 44,
    },
    xAxis: {
      type: 'category',
      data: DAY_LABELS,
      position: 'top',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_MUTED,
        fontSize: CHART_FONT_SIZE_SM,
        fontFamily: CHART_FONT,
        fontWeight: 600,
        margin: 6,
      },
    },
    yAxis: {
      type: 'category',
      data: HOUR_LABELS,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_MUTED,
        fontSize: 10,
        fontFamily: CHART_FONT,
        margin: 4,
      },
    },
    visualMap: {
      show: false,
      min: 0,
      max: maxSplh,
      inRange: {
        color: SPLH_COLORS,
      },
    },
    series: [
      {
        type: 'heatmap',
        data: heatData,
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: 'rgba(0, 0, 0, 0.15)',
            borderColor: CHART_DARK,
            borderWidth: 1.5,
          },
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
          borderRadius: 3,
        },
      },
    ],
  };

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 mb-6">
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Выручка на час работы
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Тепловая карта: день недели × час. Зелёный — эффективно, жёлтый — ниже нормы, красный — простой.
      </p>

      <ReactECharts option={option} style={{ height: 260 }} notMerge />

      {/* Daily average SPLH row */}
      <div className="flex gap-0 mt-2 ml-[44px] mr-[4px]">
        {dailyAvgSplh.map((avg, i) => (
          <div
            key={i}
            className="flex-1 text-center py-1 border-t border-border/40"
          >
            <div
              className={`text-sm font-semibold tabular-nums ${
                avg >= 4000 ? 'text-green-600' : avg >= 2500 ? 'text-amber-600' : 'text-red-600'
              }`}
            >
              {fmtSom(avg)}
            </div>
            <div className="text-[11px] text-muted-foreground">сом/час</div>
          </div>
        ))}
      </div>
    </div>
  );
}
