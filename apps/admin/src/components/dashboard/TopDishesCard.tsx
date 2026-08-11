import type { TopDish } from '@/types/dashboard';

interface Props {
  dishes: TopDish[];
  /** Custom title — defaults to "Что продаётся сегодня" */
  title?: string;
  /** Anti-top dishes — rendered below a divider inside the same card */
  antiTop?: TopDish[];
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

/** Thin column header row — "выносим за скобки" */
function ColHeader({ hasCost }: { hasCost: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1 text-sm text-muted-foreground border-b border-border/20">
      <span className="flex-1 min-w-0 max-w-[240px]">Блюдо</span>
      <span className="shrink-0 text-right w-[56px]">Кол-во</span>
      <span className="shrink-0 text-right w-[85px]">Выручка</span>
      {hasCost && (
        <span className="shrink-0 text-right w-[120px]">Маржа</span>
      )}
    </div>
  );
}

export function TopDishesCard({ dishes, title = 'Что продаётся', antiTop }: Props) {
  // Show top 5 only — dashboard is a glance, Analytics has the full view
  const top = dishes.slice(0, 5);
  const showAntiTop = antiTop && antiTop.length > 0;

  if (top.length === 0 && !showAntiTop) {
    return (
      <div>
        <h2 className="text-base font-medium text-foreground mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground">Нет данных за период</p>
      </div>
    );
  }

  const hasCostData = top.some(d => d.cost > 0);
  // Only show anti-top sub-header when there are main dishes above it
  const hasMainDishes = top.length > 0;

  return (
    <div>
      <h2 className="text-base font-medium text-foreground mb-2">{title}</h2>

      {hasMainDishes && (
        <div className="space-y-0 max-w-2xl">
          <ColHeader hasCost={hasCostData} />

          {top.map((dish, i) => {
            const marginPercent = dish.revenue > 0 ? Math.round((dish.margin / dish.revenue) * 100) : 0;
            return (
              <div
                key={dish.name}
                className="flex items-center gap-3 py-1.5 text-sm"
              >
                {/* Name */}
                <span className="text-foreground flex-1 min-w-0 max-w-[240px] truncate">
                  {dish.name}
                </span>

                {/* Qty */}
                <span className="text-muted-foreground shrink-0 text-sm text-right tabular-nums w-[56px]">
                  ×{dish.qty}
                </span>

                {/* Revenue */}
                <span className="text-foreground font-medium shrink-0 text-right tabular-nums w-[85px]">
                  {fmt(dish.revenue)} с
                </span>

                {/* Margin */}
                {hasCostData && dish.cost > 0 && (
                  <span className="shrink-0 text-right tabular-nums w-[120px]">
                    <span className={`font-medium ${dish.margin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      +{fmt(Math.round(dish.margin))} с
                    </span>
                    <span className="text-sm text-muted-foreground ml-1">
                      {marginPercent}%
                    </span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dishes.length > 5 && (
        <p className="text-sm text-muted-foreground mt-2">
          + ещё {dishes.length - 5} позиций
        </p>
      )}

      {/* Anti-top — inside same block, below divider */}
      {showAntiTop && (
        <>
          {hasMainDishes && <div className="border-t border-border/30 my-3" />}
          {hasMainDishes && <h3 className="text-sm font-medium text-foreground mb-1">Низкая маржа</h3>}
          <p className="text-sm text-muted-foreground mb-2">Маржа меньше 5% — проверьте цены или техкарту</p>

          <div className="space-y-0 max-w-2xl">
            <ColHeader hasCost={true} />

            {antiTop!.map((dish, i) => (
              <div
                key={dish.name}
                className="flex items-center gap-3 py-1.5 text-sm"
              >
                <span className="text-foreground flex-1 min-w-0 max-w-[240px] truncate">{dish.name}</span>
                <span className="text-muted-foreground shrink-0 text-sm text-right tabular-nums w-[56px]">×{dish.qty}</span>
                <span className="text-foreground font-medium shrink-0 text-right tabular-nums w-[85px]">
                  {fmt(dish.revenue)} с
                </span>
                <span className="shrink-0 text-right tabular-nums w-[120px]">
                  <span className="font-medium text-amber-600">
                    {fmt(Math.round(dish.margin))} с
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
