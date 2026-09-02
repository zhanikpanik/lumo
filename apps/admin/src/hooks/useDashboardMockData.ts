import type { DashboardPeriod } from './useDashboardNewData';
import type { Metric, WarehouseThreat, ChronologyEvent, MigrationCard, Alert, AlertUrgencyGroups, YesterdaySummary, TopDish, YesterdayShift } from '@/types/dashboard';

// Realistic Alto Coffee Bishkek mock data


export interface MockDashboardData {
  metrics: Metric[];
  yesterday: YesterdaySummary | null;
  yesterdayShift: YesterdayShift | null;
  alerts: Alert[];
  alertUrgencyGroups: AlertUrgencyGroups;
  migrationCards: MigrationCard[];
  warehouseThreats: WarehouseThreat[];
  chronology: ChronologyEvent[];
  topDishes: TopDish[];
  antiTop: TopDish[];
  isTodayEmpty: boolean;
  weekRevenue: number;
  weekChecks: number;
  totalAlertCount: number;
  criticalCount: number;
  periodLabel: string;
  shiftStatus: { isOpen: boolean; openedAt: string | null; hoursOpen: number | null; cashier: string | null };
  dailyRevenues: number[];
  dailyChecks: number[];
  dailyAvgChecks: number[];
  dailyExpenses: number[];
  dailyFoodCostPercents: number[];
}


export function getMockData(period: DashboardPeriod): MockDashboardData {
  const isToday = period === 'today';
  const isWeek = period === 'week';

  const multiplier = isToday ? 0.04 : isWeek ? 0.28 : 1;
  const revenue = Math.round(275630 * multiplier);
  const foodCost = Math.round(82100 * multiplier);
  const checks = Math.round(154 * multiplier);
  const avgCheck = checks > 0 ? Math.round(revenue / checks) : 0;
  const foodCostPercent = revenue > 0 ? Math.round((foodCost / revenue) * 100) : 0;

  const metrics: Metric[] = [
    { label: 'Выручка', todayValue: revenue, periodValue: revenue, format: 'som', todayTrend: { value: -17, prevPeriod: Math.round(revenue / 0.83) } },
    { label: 'Чеков', todayValue: checks, periodValue: checks, format: 'count', todayTrend: { value: -5, prevPeriod: checks + 5 } },
    { label: 'Ср. чек', todayValue: avgCheck, periodValue: avgCheck, format: 'som', todayTrend: { value: -5, prevPeriod: Math.round(avgCheck / 0.95) } },
    { label: 'Расходы', todayValue: Math.round(revenue * 0.06), periodValue: Math.round(revenue * 0.06), format: 'som', todayTrend: null },
    { label: 'Фудкост', todayValue: foodCostPercent, periodValue: foodCostPercent, format: 'percent', todayTrend: null },
  ];

  const yesterdayShift: YesterdayShift = {
    closed: true,
    revenue: 12850,
    checks: 43,
    cashDifference: -1200,
    closedAt: new Date(Date.now() - 86400000).toISOString(),
  };

  const yesterday: YesterdaySummary | null = isToday
    ? { revenue: 12850, checks: 43, shiftClosed: 'closed', cashDifference: -1200, status: 'normal' }
    : null;

  const alerts: Alert[] = [
    { id: 'shift-discrepancy-1', type: 'critical', message: 'Расхождение наличных — 1 200 сом', detail: 'При закрытии не совпали ожидаемая и фактическая наличность.', actionLabel: 'Открыть смену', actionHref: '/cash-shifts', domain: 'cash', urgency: 'urgent' },
    { id: 'stuck-orders-1', type: 'warning', message: 'Заказы открыты больше часа — 3', detail: 'Самый старый заказ открыт 1 ч 18 мин.', actionLabel: 'Проверить заказы', actionHref: '/checks', domain: 'checks', urgency: 'important' },
    { id: 'stock', type: 'warning', message: 'Остатки требуют внимания — 6', detail: '1 позиция в минусе, 2 закончились, 3 ниже минимума.', actionLabel: 'Открыть склад', actionHref: '/warehouse/operations', domain: 'warehouse', urgency: 'important' },
    { id: 'stale-inventory', type: 'warning', message: 'Инвентаризация просрочена', detail: 'Последний полный пересчёт был 45 дней назад.', actionLabel: 'Провести переучёт', actionHref: '/warehouse/inventory?create=true', domain: 'warehouse', urgency: 'background' },
  ];

  const alertUrgencyGroups: AlertUrgencyGroups = {
    urgent: alerts.filter(a => a.urgency === 'urgent'),
    important: alerts.filter(a => a.urgency === 'important'),
    background: alerts.filter(a => a.urgency === 'background'),
  };

  const migrationCards: MigrationCard[] = [
    { id: 'migrate-warehouse', domain: 'Склад', problemCount: 25, problems: ['25 ингредиентов в минусе'], contextMessage: 'После импорта данных часть остатков ушла в минус. Проведите инвентаризацию.', actionLabel: 'Начать инвентаризацию', actionHref: '/warehouse/inventory', actionType: 'inventory', baselineDate: '2026-06-01' },
    { id: 'migrate-cash', domain: 'Касса', problemCount: 6, problems: ['6 смен с расхождением'], contextMessage: 'Старые смены из предыдущей системы. Закройте период.', actionLabel: 'Закрыть период до 01.06', actionHref: '/cash-shifts', actionType: 'close_period', baselineDate: '2026-06-01' },
    { id: 'migrate-checks', domain: 'Чеки', problemCount: 8, problems: ['60% возвратов (среднее 18%)'], contextMessage: 'Аномальная доля возвратов за период.', actionLabel: 'К чекам', actionHref: '/checks', actionType: 'mark_checked', baselineDate: '2026-06-01' },
  ];

  const warehouseThreats: WarehouseThreat[] = [
    { productId: 'arabica-sergio', name: 'Арабика Sergio', quantity: 2.3, unit: 'кг', remaining: '2.3 кг', daysLeft: 2, level: 'critical', affectedDishes: ['Капучино', 'Латте', 'Американо'], affectedDishCount: 3, warehouseName: 'Бар', negative: false, lastDelivery: '09.06 — 15 кг' },
    { productId: 'milk-32', name: 'Молоко 3.2%', quantity: 8, unit: 'л', remaining: '8 л', daysLeft: 3, level: 'warning', affectedDishes: ['Капучино', 'Латте', 'Какао'], affectedDishCount: 3, warehouseName: 'Бар', negative: false, lastDelivery: '10.06 — 40 л' },
    { productId: 'cream-33', name: 'Сливки 33%', quantity: 1.5, unit: 'л', remaining: '1.5 л', daysLeft: 1, level: 'critical', affectedDishes: ['Раф', 'Флэт уайт'], affectedDishCount: 2, warehouseName: 'Бар', negative: false, lastDelivery: null },
    { productId: 'vanilla-syrup', name: 'Сироп ванильный', quantity: 0.8, unit: 'л', remaining: '0.8 л', daysLeft: 4, level: 'warning', affectedDishes: ['Латте ванильный'], affectedDishCount: 1, warehouseName: 'Бар', negative: false, lastDelivery: '05.06 — 3 л' },
    { productId: 'fresh-mint', name: 'Мята свежая', quantity: 0.2, unit: 'кг', remaining: '0.2 кг', daysLeft: 1, level: 'critical', affectedDishes: ['Мохито', 'Лимонад'], affectedDishCount: 2, warehouseName: 'Бар', negative: false, lastDelivery: null },
  ];


  const chronology: ChronologyEvent[] = [
    { id: 'e1', time: '14:32', actor: 'Айжан', action: 'Расход', detail: 'Проезд курьера: 500 сом', actionLabel: 'Касса', actionHref: '/transactions', type: 'expense' },
    { id: 'e2', time: '13:48', actor: 'Айжан', action: 'Поставка', detail: 'Арабика Sergio +15 кг', actionLabel: 'Склад', actionHref: '/warehouse/operations', type: 'delivery' },
    { id: 'e3', time: '12:55', actor: 'Айжан', action: 'Списание', detail: 'Молоко: 3 л, Сливки: 1 л', actionLabel: 'Склад', actionHref: '/warehouse/operations', type: 'write_off' },
    { id: 'e4', time: '11:45', actor: 'Айжан', action: 'Открыта · 5 ч', detail: null, actionLabel: null, actionHref: null, type: 'shift_open' },
    { id: 'e5', time: '10:20', actor: 'Айбек', action: 'Заказ оплачен', detail: 'Чек №142 · 1 240 сом', actionLabel: 'Чек', actionHref: '/checks', type: 'order_paid' },
  ];

  const topDishes: TopDish[] = [
    { name: 'Капучино', qty: 42, revenue: 16800, cost: 3360, margin: 13440 },
    { name: 'Латте', qty: 38, revenue: 15200, cost: 3040, margin: 12160 },
    { name: 'Американо', qty: 35, revenue: 10500, cost: 1575, margin: 8925 },
    { name: 'Сэндвич с курицей', qty: 28, revenue: 19600, cost: 10780, margin: 8820 },
    { name: 'Чизкейк', qty: 22, revenue: 13200, cost: 3960, margin: 9240 },
  ];

  const antiTop: TopDish[] = [
    { name: 'Греческий салат', qty: 5, revenue: 3000, cost: 3450, margin: -450 },
    { name: 'Суп-пюре грибной', qty: 4, revenue: 2400, cost: 2520, margin: -120 },
    { name: 'Круассан с миндалём', qty: 8, revenue: 5600, cost: 5460, margin: 140 },
  ];

  return {
    metrics,
    yesterday,
    yesterdayShift,
    alerts,
    alertUrgencyGroups,
    migrationCards,
    warehouseThreats,
    chronology,
    topDishes,
    antiTop,
    isTodayEmpty: false,
    weekRevenue: 275630,
    weekChecks: 154,
    totalAlertCount: alerts.length,
    criticalCount: alerts.filter((alert) => alert.type === 'critical').length,
    periodLabel: isToday ? 'сегодня' : isWeek ? 'за неделю' : 'за месяц',
    shiftStatus: { isOpen: true, openedAt: '10:30', hoursOpen: 5, cashier: 'Айжан' },
    dailyRevenues: [10500, 12300, 9800, 14200, 11800, 13500, revenue],
    dailyChecks: [8, 7, 6, 9, 8, 7, checks],
    dailyAvgChecks: [1312, 1757, 1633, 1578, 1475, 1928, avgCheck],
    dailyExpenses: [420, 510, 390, 580, 470, 540, Math.round(revenue * 0.06)],
    dailyFoodCostPercents: [29, 30, 31, 28, 30, 29, foodCostPercent],
  };
}
