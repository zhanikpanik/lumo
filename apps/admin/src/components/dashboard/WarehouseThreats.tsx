import { CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { WarehouseThreat } from '@/types/dashboard';

interface WarehouseThreatsProps {
  threats: WarehouseThreat[];
  loaded?: boolean | null;
}

const MAX_VISIBLE = 7;

function ColHeader() {
  return (
    <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground border-b border-border/20">
      <span className="flex-1 min-w-0 max-w-[240px]">Ингредиент</span>
      <span className="shrink-0 text-right w-[80px]">Остаток</span>
      <span className="shrink-0 text-right w-[110px]">Поставка</span>
    </div>
  );
}

export function WarehouseThreats({ threats, loaded = true }: WarehouseThreatsProps) {
  if (threats.length === 0) {
    return (
      <div>
        <h2 className="text-base font-medium text-foreground mb-1">Остатки на складе</h2>
        {loaded === false ? (
          <p className="text-sm text-muted-foreground">Нет данных — обновите инвентаризацию</p>
        ) : loaded === null ? (
          <p className="text-sm text-muted-foreground">Склад не настроен — добавьте склад в настройках</p>
        ) : (
          <p className="text-sm text-success flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            Запасов хватает
          </p>
        )}
        <Link to="/warehouse" className="inline-block mt-1 text-sm font-medium text-primary hover:underline">
          Перейти на склад →
        </Link>
      </div>
    );
  }

  // Deduplicate by product name
  const seen = new Set<string>();
  const unique: WarehouseThreat[] = [];
  for (const t of threats) {
    if (!seen.has(t.name)) {
      seen.add(t.name);
      unique.push(t);
    }
  }

  // Sort: critical (negative/zero) first, then warning, then by name
  const sorted = [...unique].sort((a, b) => {
    const levelOrder = { critical: 0, warning: 1 };
    const aLvl = a.level ? levelOrder[a.level] : 2;
    const bLvl = b.level ? levelOrder[b.level] : 2;
    if (aLvl !== bLvl) return aLvl - bLvl;
    return a.name.localeCompare(b.name);
  });

  const visible = sorted.slice(0, MAX_VISIBLE);
  const overflow = sorted.length - MAX_VISIBLE;

  return (
    <div>
      <h2 className="text-base font-medium text-foreground mb-2">Остатки на складе</h2>

      <div className="space-y-0 max-w-2xl">
        <ColHeader />

        {visible.map((threat) => (
          <Link
            key={threat.name}
            to="/warehouse"
            className="flex items-center gap-3 py-1.5 text-sm hover:opacity-70 transition-opacity"
          >
            <span className="text-foreground flex-1 min-w-0 max-w-[240px] truncate">
              {threat.name}
              {threat.warehouseName && (
                <span className="text-muted-foreground ml-1">· {threat.warehouseName}</span>
              )}
            </span>
            <span
              className={cn(
                'shrink-0 text-right tabular-nums w-[80px]',
                threat.level === 'critical' ? 'text-destructive font-medium' : 'text-muted-foreground',
              )}
            >
              {threat.remaining}
            </span>
            <span className="text-muted-foreground shrink-0 text-right w-[110px]">
              {threat.lastDelivery || '—'}
            </span>
          </Link>
        ))}

        {overflow > 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            + ещё {overflow} позиций
          </p>
        )}
      </div>
    </div>
  );
}
