import { cn } from '@/lib/utils';
import type { DailyStats } from '@/hooks/useMonthlyStats';

function fmtSom(n: number): string {
  return n.toLocaleString('ru-RU');
}

interface Props {
  data: DailyStats[];
  isPending: boolean;
}

export function SummaryBar({ data, isPending }: Props) {
  if (isPending) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl p-4 animate-pulse">
            <div className="h-3 bg-muted rounded w-16 mb-2" />
            <div className="h-7 bg-muted rounded w-24 mb-1" />
            <div className="h-3 bg-muted rounded w-12" />
          </div>
        ))}
      </div>
    );
  }

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = data.reduce((s, d) => s + d.orderCount, 0);
  const totalExpenses = data.reduce((s, d) => s + d.expenses, 0);
  const totalNet = totalRevenue - totalExpenses;
  const avgCheck = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const items = [
    { label: 'Выручка', value: fmtSom(totalRevenue), suffix: 'сом', trend: null },
    { label: 'Чеков', value: String(totalOrders), suffix: '', trend: null },
    { label: 'Средний чек', value: fmtSom(avgCheck), suffix: 'сом', trend: null },
    { label: 'Расходы', value: fmtSom(totalExpenses), suffix: 'сом', trend: null },
    { label: 'Прибыль', value: fmtSom(totalNet), suffix: 'сом', trend: null },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {items.map((item) => (
        <div key={item.label} className="bg-card rounded-xl p-4 hover:shadow-md transition-shadow">
          <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
          <p className={cn(
            'text-xl font-bold tabular-nums',
            item.label === 'Прибыль' && totalNet < 0 && 'text-destructive',
          )}>
            {item.value}
          </p>
          {item.suffix && (
            <p className="text-xs text-muted-foreground">{item.suffix}</p>
          )}
        </div>
      ))}
    </div>
  );
}
