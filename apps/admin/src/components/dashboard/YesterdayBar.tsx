import { CheckCircle, AlertTriangle, Calendar, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { YesterdaySummary } from '@/types/dashboard';

interface Props {
  data: YesterdaySummary;
}

export function YesterdayBar({ data }: Props) {

  // Выходной — вчера не работали
  if (data.status === 'dayoff') {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#EFF1F3] rounded-xl text-sm">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">Вчера — выходной</span>
      </div>
    );
  }

  // Данные недоступны
  if (data.status === 'unavailable') {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#EFF1F3] rounded-xl text-sm">
        <WifiOff className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">Вчера — данные недоступны</span>
      </div>
    );
  }

  // Нормальное состояние
  const formattedRevenue = (data.revenue ?? 0).toLocaleString('ru-RU');
  const checks = data.checks ?? 0;
  const diff = data.cashDifference;
  const isClean = data.shiftClosed && diff !== null && Math.abs(diff) <= 500;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#EFF1F3] rounded-xl text-sm">
      <span className="text-muted-foreground">Вчера:</span>

      <span className="font-medium text-foreground">
        {formattedRevenue} сом
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-foreground">
        {checks} чеков
      </span>

      <span className="text-muted-foreground">·</span>

      {isClean ? (
        <span className="flex items-center gap-1 text-success">
          <CheckCircle className="w-3.5 h-3.5" />
          смена закрыта
          {diff !== null && diff !== 0 && (
            <span className="text-muted-foreground ml-1">
              (расхождение {diff} сом)
            </span>
          )}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-warning">
          <AlertTriangle className="w-3.5 h-3.5" />
          {!data.shiftClosed
            ? 'смена не закрыта'
            : diff !== null
              ? `расхождение ${diff.toLocaleString('ru-RU')} сом`
              : 'проверьте кассу'}
        </span>
      )}

      <Link
        to="/cash-shifts"
        className="ml-auto text-sm text-primary hover:underline"
      >
        Все смены →
      </Link>
    </div>
  );
}
