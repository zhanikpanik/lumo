import ReactECharts from 'echarts-for-react';
import type { AnalyticsData, HourlyBucket } from '@/hooks/useAnalytics';
import {
  CHART_DARK, CHART_MUTED, CHART_FONT, CHART_FONT_SIZE_SM,
  TOOLTIP_STYLE, HEATMAP_COLORS,
} from '@/lib/chartTheme';

const DAY_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const DAY_LABELS_FULL = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOUR_LABELS = Array.from({ length: 17 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);

function fmtSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

interface Props {
  data: AnalyticsData | null;
  isPending: boolean;
  error: Error | null;
}

/** Найти ячейку в сырых данных по dayIndex + hour */
function findBucket(buckets: HourlyBucket[], dayIdx: number, hour: number): HourlyBucket | undefined {
  return buckets.find((d) => d.dayIndex === dayIdx && d.hour === hour);
}

export function HeatmapChart({ data, isPending, error }: Props) {
  if (isPending) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <div className="h-4 bg-muted rounded w-44 mb-3 animate-pulse" />
        <div className="h-[200px] bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (error || !data || data.hourlyBuckets.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border/60 p-4">
        <h3 className="text-base font-semibold text-foreground mb-3">Загруженность по часам</h3>
        <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground gap-2">
          <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-sm">{error ? 'Ошибка загрузки' : 'Нет данных за выбранный период'}</span>
        </div>
      </div>
    );
  }

  const { hourlyBuckets } = data;

  // Build heatmap cells: [dayIndex, hourIndex, revenue]
  const cells = hourlyBuckets
    .filter((d) => d.hour >= 7 && d.hour <= 23 && d.dayIndex >= 0 && d.dayIndex <= 6)
    .map((d) => [d.dayIndex, d.hour - 7, d.revenue] as [number, number, number]);

  const maxRevenue = Math.max(...cells.map((d) => d[2]), 1);

  // Daily totals
  const dailyTotals = Array.from({ length: 7 }, (_, dayIdx) =>
    hourlyBuckets
      .filter((d) => d.dayIndex === dayIdx)
      .reduce((sum, d) => sum + d.revenue, 0),
  );

  const option = {
    tooltip: {
      ...TOOLTIP_STYLE,
      formatter: (params: { data: number[] }) => {
        const [dayIdx, hourIdx] = params.data;
        const hour = hourIdx + 7;
        const cell = findBucket(hourlyBuckets, dayIdx, hour);
        if (!cell) return '';
        const timeLabel = `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`;
        return `
          <div style="font-weight:600;margin-bottom:4px">${DAY_LABELS_FULL[dayIdx]} ${timeLabel}</div>
          <div>Заказов: <b>${cell.orderCount}</b></div>
          <div>Выручка: <b>${fmtSom(cell.revenue)} сом</b></div>
          <div style="color:${CHART_MUTED}">Средний чек: ${fmtSom(cell.avgCheck)} сом</div>
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
      max: maxRevenue,
      inRange: {
        color: HEATMAP_COLORS,
      },
    },
    series: [
      {
        type: 'heatmap',
        data: cells,
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
    <div className="bg-card rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">
          Загруженность по часам
        </h3>
      </div>

      <ReactECharts option={option} style={{ height: 200 }} notMerge />

      {/* Daily totals row */}
      <div className="flex gap-0 mt-2 ml-[44px] mr-[4px]">
        {dailyTotals.map((total, i) => (
          <div
            key={i}
            className="flex-1 text-center py-1 border-t border-border/40"
          >
            <div className="text-sm font-semibold text-foreground tabular-nums">
              {fmtSom(total)}
            </div>
            <div className="text-[11px] text-muted-foreground">сом</div>
          </div>
        ))}
      </div>
    </div>
  );
}
