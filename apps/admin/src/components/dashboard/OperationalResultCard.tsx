import { cn } from '@/lib/utils';
import type { OperationalResult } from '@/types/dashboard';

interface Props {
  data: OperationalResult;
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

export function OperationalResultCard({ data }: Props) {
  return (
    <div className="bg-card rounded-xl p-4 hover:shadow-md transition-shadow">
      <h2 className="text-base font-semibold text-foreground mb-1">Операционный итог</h2>
      <p className="text-sm text-muted-foreground mb-4">
        выручка − кассовые расходы − списания, без учёта аренды и налогов
      </p>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-3xl font-bold text-foreground">{fmt(data.net)}</span>
        <span className="text-sm text-muted-foreground">сом</span>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Выручка</span>
          <span className="text-success font-medium">+{fmt(data.revenue)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Кассовые расходы</span>
          <span className="text-destructive font-medium">−{fmt(data.expenses)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Списания</span>
          <span className="text-destructive font-medium">−{fmt(data.writeOffs)}</span>
        </div>
        <div className="flex justify-between pt-1.5 border-t border-border/40">
          <span className="text-muted-foreground">Итого</span>
          <span className={cn('font-semibold', data.net >= 0 ? 'text-foreground' : 'text-destructive')}>
            {fmt(data.net)} сом
          </span>
        </div>
      </div>
    </div>
  );
}
