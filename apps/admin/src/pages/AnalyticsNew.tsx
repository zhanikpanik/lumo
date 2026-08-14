import { useState, useMemo } from 'react';
import { format, startOfMonth } from 'date-fns';
import { PeriodPicker } from '@/components/analytics/PeriodPicker';
import { KpiRow } from '@/components/analytics-new/KpiRow';
import { RevenueChart } from '@/components/analytics-new/RevenueChart';
import { HeatmapChart } from '@/components/analytics-new/HeatmapChart';
import { ConsumptionBars } from '@/components/analytics-new/ConsumptionBars';
import { Overconsumption } from '@/components/analytics-new/Overconsumption';
import { DrinksList } from '@/components/analytics-new/DrinksList';
import { ShiftsList } from '@/components/analytics-new/ShiftsList';
import { useAnalytics } from '@/hooks/useAnalytics';

function iso(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function AnalyticsPage() {
  const now = new Date();
  const defaultStart = iso(startOfMonth(now));
  const defaultEnd = iso(now);

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const queryEnd = useMemo(() => {
    const d = new Date(end);
    d.setDate(d.getDate() + 1);
    return iso(d);
  }, [end]);

  const { data, isPending, error } = useAnalytics(start, queryEnd);

  return (
    <div className="page-shell page-shell--wide">{/* Header */}
    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-6">
      <div>
        <h2 className="text-2xl font-bold mb-1 text-foreground">Аналитика</h2>
        <p className="text-sm text-muted-foreground">Alto Coffee Bishkek</p>
      </div>
      <PeriodPicker start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} />
    </div>
    
    {/* KPI Row */}
    <KpiRow data={data ?? null} isPending={isPending} error={error} />
    
    {/* Revenue Chart + Heatmap */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <RevenueChart data={data ?? null} isPending={isPending} error={error} />
      <HeatmapChart data={data ?? null} isPending={isPending} error={error} />
    </div>
    
    {/* Overconsumption */}
    <div className="mb-6">
      <Overconsumption data={data ?? null} isPending={isPending} error={error} />
    </div>
    
    {/* Drinks + Shifts */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <DrinksList data={data ?? null} isPending={isPending} error={error} />
      <ShiftsList data={data ?? null} isPending={isPending} error={error} />
    </div></div>
  );
}
