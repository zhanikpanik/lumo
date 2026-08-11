/** Тренд: положительный — зелёный ↑, отрицательный — красный ↓, ноль — серый → */
export interface Trend {
  value: number;
  /** vs тот же день прошлой недели */
  prevPeriod: number;
}

/** Одна KPI-карточка — двухэтажная (сегодня + период) */
export interface Metric {
  label: string;
  /** Сегодня (крупно, жирно) */
  todayValue: number;
  /** За выбранный период (мельче, muted) */
  periodValue: number;
  format: 'som' | 'count' | 'percent';
  /** Тренд сегодня vs вчера */
  todayTrend: Trend | null;
  /** Пояснение к значению (tooltip) */
  tooltip?: string;
}

/** Тип алерта */
export type AlertType = 'critical' | 'warning' | 'info';

/** Срочность алерта — для группировки на дашборде */
export type AlertUrgency = 'urgent' | 'important' | 'background';

/** Один алерт на дашборде — проблема + целевое действие */
export interface Alert {
  id: string;
  type: AlertType;
  message: string;
  /** Текст на кнопке действия (если null — алерт только информационный) */
  actionLabel: string | null;
  /** Куда ведёт кнопка */
  actionHref: string | null;
  /** Домен: 'warehouse' | 'checks' | 'cash' | 'staff' */
  domain: string;
  /** Срочность: urgent / important / background */
  urgency: AlertUrgency;
}

/** Группа алертов по severity — для фазы «много проблем» */
export interface AlertGroup {
  severity: AlertType;
  label: string;
  alerts: Alert[];
  /** Раскрыта по умолчанию? */
  defaultExpanded: boolean;
}

/** Карточка миграции — одно действие на весь домен */
export type MigrationActionType = 'inventory' | 'mark_checked' | 'close_period';

export interface MigrationCard {
  id: string;
  domain: string;
  problemCount: number;
  problems: string[];
  contextMessage: string;
  actionLabel: string;
  actionHref: string;
  actionType: MigrationActionType;
  baselineDate: string;
}

export const ALERT_GROUP_THRESHOLD = 8;

/** Классификация события в ленте хронологии */
export type ChronologyEventType =
  | 'shift_open'
  | 'order_new'
  | 'order_paid'
  | 'expense'
  | 'delivery'
  | 'write_off'
  | 'transfer'
  | 'inventory';

/** Одно событие в ленте хронологии */
export interface ChronologyEvent {
  id: string;
  time: string;
  actor: string;
  action: string;
  detail: string | null;
  actionLabel?: string | null;
  actionHref?: string | null;
  type: ChronologyEventType;
}

/** Операционный результат за период */
export interface OperationalResult {
  revenue: number;
  expenses: number;
  writeOffs: number;
  net: number;
}

/** Угроза склада: ингредиент на исходе + какие блюда под угрозой */
export interface WarehouseThreat {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  affectedDishes: string[];
  affectedDishCount: number;
  /** Internal: formatted string like "2.3 кг" */
  remaining?: string;
  /** Internal: estimated days left */
  daysLeft?: number | null;
  /** Internal: severity level */
  level?: 'critical' | 'warning';
  /** Internal: warehouse name */
  warehouseName?: string | null;
  /** Internal: is stock negative */
  negative?: boolean;
  /** Internal: last delivery info */
  lastDelivery?: string | null;
}

/** Сводка за вчера */
export interface YesterdaySummary {
  revenue: number | null;
  checks: number | null;
  shiftClosed: string | null;
  cashDifference: number | null;
  status: 'normal' | 'unavailable' | 'dayoff';
}

/** Топ-блюдо */
export interface TopDish {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  margin: number;
}

/** Сводка вчерашней смены */
export interface YesterdayShift {
  closed: boolean;
  revenue: number | null;
  checks: number | null;
  cashDifference: number | null;
  closedAt: string | null;
}

/** Группировка алертов по срочности */
export interface AlertUrgencyGroups {
  urgent: Alert[];
  important: Alert[];
  background: Alert[];
}

/** Элемент отрицательного стока для быстрой коррекции */
export interface NegativeStockItem {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  warehouse: string;
  /** Alternative field name used in hook */
  productName?: string;
  /** Warehouse ID used for stock correction */
  warehouseId: string;
  /** Alternative field name used in hook */
  warehouseName?: string | null;
}

/** Данные дашборда */
export interface DashboardData {
  metrics: Metric[];
  alerts: Alert[];
  alertGroups: AlertGroup[] | null;
  alertUrgencyGroups: AlertUrgencyGroups;
  totalAlertCount: number;
  criticalCount: number;
  chronology: ChronologyEvent[];
  warehouseThreats: WarehouseThreat[];
  shiftStatus: {
    isOpen: boolean;
    openedAt: string | null;
    hoursOpen: number | null;
    cashier: string | null;
  };
  yesterdayShift: YesterdayShift | null;
  yesterday: YesterdaySummary;
  topDishes: TopDish[];
  isTodayEmpty: boolean;
  weekRevenue: number;
  weekChecks: number;
  antiTop: TopDish[];
  migrationCards: MigrationCard[];
  periodLabel: string;
  negativeStockItems: NegativeStockItem[];
  foodCost: number;
  dailyRevenues: number[];
  dailyChecks: number[];
  dailyAvgChecks: number[];
  dailyExpenses: number[];
}
// ═══ Operational Dashboard (first InstantDB release) ═══════════════════════

/** KPI значения только за сегодня. Вся арифметика в tiyin (целые). */
export interface TodayKPI {
  /** Выручка за сегодня (оплаченные заказы), tiyin. */
  revenueTiyin: number;
  /** Количество оплаченных чеков. */
  paidOrderCount: number;
  /** Средний чек, tiyin. */
  averageCheckTiyin: number;
  /** Расходы из кассы за сегодня, tiyin. */
  expenseTiyin: number;
  /** Себестоимость проданного за сегодня, tiyin. */
  foodCostTiyin: number;
  /** Процент фудкоста: (foodCost / revenue) * 100. null если выручки нет. */
  foodCostPercent: number | null;
  /** Тренд выручки к такому же дню прошлой недели, %. null если не с чем сравнивать. */
  revenueTrendPercent: number | null;
  /** Дельта чеков к такому же дню прошлой недели. */
  checkTrendDelta: number | null;
}

/** Состояние активной смены. */
export interface ShiftStatus {
  isOpen: boolean;
  openedAt: string | null;
  hoursOpen: number;
  cashier: string | null;
}

/** Данные по активным заказам. */
export interface ActiveOrdersStatus {
  count: number;
  stuckOlderThan60Min: number;
}

/** Сигнал о проблемном остатке. */
export interface StockAlert {
  productId: string;
  name: string;
  /** Остаток в милли-единицах (g → mg, ml → μl). */
  balanceMilli: number;
  unit: string;
  level: 'negative' | 'zero' | 'low';
}

/**
 * Операционный дашборд — только «сейчас» и «сегодня».
 * Никаких недельных/месячных/исторических полей.
 */
export interface DashboardOperationalData {
  /** KPI за сегодня. null при загрузке или ошибке. */
  today: TodayKPI | null;
  /** Активная смена. */
  shift: ShiftStatus;
  /** Активные и зависшие заказы. */
  activeOrders: ActiveOrdersStatus;
  /** Вчерашняя смена. null если вчера не было смены. */
  yesterdayShift: YesterdayShift | null;
  /** Операционные алерты. */
  alerts: Alert[];
  /** Алерты, сгруппированные по срочности. */
  alertUrgencyGroups: AlertUrgencyGroups;
  /** Лента событий за сегодня. */
  chronology: ChronologyEvent[];
  /** Проблемные остатки: отрицательные, нулевые, ниже порога. */
  stockAlerts: StockAlert[];
  /** Сегодня не было ни одного заказа. */
  isTodayEmpty: boolean;
  /** Когда данные были вычислены (UTC ISO). */
  computedAt: string;
}
