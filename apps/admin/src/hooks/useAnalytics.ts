import { useQuery } from '@tanstack/react-query';
import { supabase, VENUE_ID } from '@/lib/supabase';

// ── Portion — the data particle ──

export interface Portion {
  orderId: string;
  date: string;
  hour: number;
  dayOfWeek: number; // 0=Mon..6=Sun
  productName: string;
  price: number;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  shiftId: string;
}

// ── Aggregated views ──

export interface DailyStats {
  date: string;
  dayOfWeek: string;
  revenue: number;
  cost: number;
  margin: number;
  orderCount: number;
  avgCheck: number;
}

export interface HourlyBucket {
  dayIndex: number;
  hour: number;
  orderCount: number;
  revenue: number;
  avgCheck: number;
}

export interface DrinkStats {
  name: string;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  portions: number;
}

export interface ShiftStats {
  shiftId: string;
  cashierName: string;
  revenue: number;
  margin: number;
  marginPct: number;
  portions: number;
}

export interface IngredientDiscrepancy {
  ingredientName: string;
  unit: string;
  normativeConsumption: number;
  actualConsumption: number;
  discrepancy: number;
  discrepancySom: number;
  // per-shift breakdown
  byShift: {
    shiftId: string;
    cashierName: string;
    discrepancy: number;
    discrepancySom: number;
  }[];
}

export interface StockStatus {
  productName: string;
  currentStock: number;
  unit: string;
  weeklyConsumption: number;
  daysLeft: number;
  isBar: boolean; // true = opened bottle (bar), false = warehouse
}

/** Одна строка расхода: ингредиент + сколько ушло + сколько пришло + покрытие */
export interface ConsumptionRow {
  productId: string;
  productName: string;
  unit: string;
  /** Теоретический расход: recipe_items × проданные порции */
  consumption: number;
  /** Поступления за период (delivery items) */
  incomingDelivery: number;
  /** Чистые перемещения (in − out) */
  transferNet: number;
  /** Списания */
  writeoffQty: number;
  /** Покрытие: доля расхода перекрытая поставками (0..1+) */
  coverageRatio: number;
}

/** Одна строка перерасхода: теория vs факт с привязкой к инвентаризациям */
export interface OverconsumptionRow {
  productId: string;
  productName: string;
  unit: string;
  /** Теоретический расход: recipe_items × проданные порции */
  theoretical: number;
  /** Фактический расход: нач.остаток + поставки − кон.остаток (null если нет граничных инвентаризаций) */
  actual: number | null;
  /** Разница: actual − theoretical (null если нет actual) */
  delta: number | null;
  /** Потери в сомах: delta × cost_price (null если нет actual или нет цены) */
  lossSom: number | null;
  /** Начальный остаток (из инвентаризации на начало периода) */
  startingStock: number | null;
  /** Конечный остаток (из инвентаризации на конец периода) */
  endingStock: number | null;
  /** Поставки за период */
  deliveries: number;
  /** Цена за единицу */
  costPrice: number | null;
}

export interface OverconsumptionData {
  /** true когда есть инвентаризации на ОБЕИХ границах периода */
  hasBoundaries: boolean;
  /** Дата начальной инвентаризации */
  startInventoryDate: string | null;
  /** Дата конечной инвентаризации */
  endInventoryDate: string | null;
  /** Строки перерасхода, отсортированы по убыванию потерь */
  rows: OverconsumptionRow[];
  /** Суммарные потери в сомах (null если нет границ) */
  totalLossSom: number | null;
}

export interface AnalyticsData {
  portions: Portion[];
  dailyStats: DailyStats[];
  hourlyBuckets: HourlyBucket[];
  drinkStats: DrinkStats[];
  shiftStats: ShiftStats[];
  discrepancies: IngredientDiscrepancy[];
  consumptionRows: ConsumptionRow[];
  overconsumption: OverconsumptionData;
  stockStatus: StockStatus[];
  periodLabel: string;
}

// ── Helpers ──

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function dayOfWeekIndex(ts: string): number {
  const d = new Date(ts).getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1; // 0=Mon
}

// ── Cost calculation ──

interface CostIndex {
  [dishId: string]: number; // cost per 1 portion
}

async function buildCostIndex(): Promise<CostIndex> {
  // Fetch all recipe items with ingredient costs
  const { data: recipes } = await supabase
    .from('recipe_items')
    .select('product_id, ingredient_id, quantity, unit');

  if (!recipes?.length) return {};

  const ingredientIds = Array.from(new Set(recipes.map((r) => r.ingredient_id as string)));
  const { data: ingredients } = await supabase
    .from('products')
    .select('id, cost_price')
    .in('id', ingredientIds);

  const costMap = new Map<string, number>();
  for (const ing of ingredients || []) {
    costMap.set(ing.id as string, Number(ing.cost_price) || 0);
  }

  // Sum ingredient costs per dish
  const dishCost: CostIndex = {};
  for (const r of recipes) {
    const dishId = r.product_id as string;
    const ingCost = costMap.get(r.ingredient_id as string) || 0;
    const qty = Number(r.quantity) || 0;
    // cost_price is per base unit (kg for solids, L for liquids)
    const lineCost = qty * ingCost;
    dishCost[dishId] = (dishCost[dishId] || 0) + lineCost;
  }

  return dishCost;
}

// ── Main fetch ──

async function fetchAnalytics(periodStart: string, periodEnd: string): Promise<AnalyticsData> {
  // Parallel: cost index + order_items
  const [costIndex, { data: items, error }] = await Promise.all([
    buildCostIndex(),
    supabase
      .from('order_items')
      .select('product_name, quantity, product_price, order_id, product_id, orders!inner(opened_at, shift_id)')
      .eq('orders.venue_id', VENUE_ID)
      .eq('orders.status', 'paid')
      .gte('orders.opened_at', periodStart)
      .lt('orders.opened_at', periodEnd),
  ]);

  if (error) throw error;

  // Build portions
  const portions: Portion[] = [];
  const shiftIds = new Set<string>();

  for (const item of items || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ordersRaw = (item as any).orders;
    const orders: { opened_at: string; shift_id: string } | null =
      Array.isArray(ordersRaw) ? ordersRaw[0] : ordersRaw;
    if (!orders) continue;

    const ts = orders.opened_at;
    const qty = Number(item.quantity) || 1;
    const price = Number(item.product_price) || 0;
    const revenue = qty * price;
    const dishId = item.product_id as string;
    const unitCost = costIndex[dishId] || 0;
    const cost = qty * unitCost;
    const margin = revenue - cost;

    portions.push({
      date: ts.slice(0, 10),
      hour: new Date(ts).getHours(),
      dayOfWeek: dayOfWeekIndex(ts),
      productName: item.product_name as string || '—',
      price,
      quantity: qty,
      revenue,
      cost,
      margin,
      marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
      orderId: item.order_id as string,
      shiftId: orders.shift_id,
    });

    shiftIds.add(orders.shift_id);
  }

  // ── Fetch shift → cashier mapping ──
  const shiftCashierMap = new Map<string, string>();
  if (shiftIds.size > 0) {
    const shiftArr = Array.from(shiftIds);
    // Batch in groups of 100 for IN clause
    for (let i = 0; i < shiftArr.length; i += 100) {
      const batch = shiftArr.slice(i, i + 100);
      const { data: shifts } = await supabase
        .from('shifts')
        .select('id, cashier_id')
        .in('id', batch);
      for (const s of shifts || []) {
        shiftCashierMap.set(s.id as string, s.cashier_id as string);
      }
    }
  }

  // Fetch user names
  const cashierIds = Array.from(new Set(shiftCashierMap.values()));
  const cashierNameMap = new Map<string, string>();
  if (cashierIds.length > 0) {
    for (let i = 0; i < cashierIds.length; i += 100) {
      const batch = cashierIds.slice(i, i + 100);
      const { data: users } = await supabase
        .from('users')
        .select('id, name')
        .in('id', batch);
      for (const u of users || []) {
        cashierNameMap.set(u.id as string, u.name as string || '—');
      }
    }
  }

  // ── Daily aggregation ──
  const dayMap = new Map<string, { revenue: number; cost: number }>();
  for (const p of portions) {
    const d = dayMap.get(p.date) || { revenue: 0, cost: 0 };
    d.revenue += p.revenue;
    d.cost += p.cost;
    dayMap.set(p.date, d);
  }

  // Generate all days in range
  const dailyStats: DailyStats[] = [];
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const dateKey = iso(d);
    const entry = dayMap.get(dateKey) || { revenue: 0, cost: 0 };
    dailyStats.push({
      date: dateKey,
      dayOfWeek: DAY_LABELS[d.getDay()],
      revenue: entry.revenue,
      cost: entry.cost,
      margin: entry.revenue - entry.cost,
      orderCount: 0, // filled below
      avgCheck: 0,
    });
  }

  // ── Get actual order counts per day ──
  const { data: orderCounts } = await supabase
    .from('orders')
    .select('opened_at')
    .eq('venue_id', VENUE_ID)
    .eq('status', 'paid')
    .gte('opened_at', periodStart)
    .lt('opened_at', periodEnd);

  const ordersPerDay = new Map<string, number>();
  for (const o of orderCounts || []) {
    const dk = (o.opened_at as string).slice(0, 10);
    ordersPerDay.set(dk, (ordersPerDay.get(dk) || 0) + 1);
  }

  for (const ds of dailyStats) {
    ds.orderCount = ordersPerDay.get(ds.date) || 0;
    ds.avgCheck = ds.orderCount > 0 ? Math.round(ds.revenue / ds.orderCount) : 0;
  }

  // ── Hourly aggregation ──
  const hourlyBuckets: HourlyBucket[] = [];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    for (let hour = 7; hour <= 23; hour++) {
      const bucket = portions.filter((p) => p.dayOfWeek === dayIdx && p.hour === hour);
      const revenue = bucket.reduce((s, p) => s + p.revenue, 0);
      const orderCount = new Set(bucket.map((p) => p.orderId)).size;
      hourlyBuckets.push({
        dayIndex: dayIdx,
        hour,
        orderCount,
        revenue,
        avgCheck: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
      });
    }
  }

  // ── Drink aggregation ──
  const drinkMap = new Map<string, { revenue: number; cost: number; count: number }>();
  for (const p of portions) {
    const d = drinkMap.get(p.productName) || { revenue: 0, cost: 0, count: 0 };
    d.revenue += p.revenue;
    d.cost += p.cost;
    d.count += p.quantity;
    drinkMap.set(p.productName, d);
  }

  const drinkStats: DrinkStats[] = Array.from(drinkMap.entries())
    .map(([name, d]) => ({
      name,
      revenue: d.revenue,
      cost: d.cost,
      margin: d.revenue - d.cost,
      marginPct: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
      portions: d.count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Shift aggregation ──
  const shiftMap = new Map<string, { revenue: number; cost: number; count: number }>();
  for (const p of portions) {
    const s = shiftMap.get(p.shiftId) || { revenue: 0, cost: 0, count: 0 };
    s.revenue += p.revenue;
    s.cost += p.cost;
    s.count += p.quantity;
    shiftMap.set(p.shiftId, s);
  }

  const shiftStats: ShiftStats[] = Array.from(shiftMap.entries())
    .map(([shiftId, s]) => ({
      shiftId,
      cashierName: cashierNameMap.get(shiftCashierMap.get(shiftId) || '') || `Смена ${shiftId.slice(0, 8)}`,
      revenue: s.revenue,
      margin: s.revenue - s.cost,
      marginPct: s.revenue > 0 ? ((s.revenue - s.cost) / s.revenue) * 100 : 0,
      portions: s.count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Consumption from RPC (theoretical usage vs deliveries) ──
  const consumptionRows: ConsumptionRow[] = [];

  // Maps shared between consumption and overconsumption sections
  const merged = new Map<string, { consumption: number; incoming: number; transfer: number; writeoff: number }>();
  const productMap = new Map<string, { name: string; unit: string }>();

  // Get warehouse IDs for this venue
  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id')
    .eq('venue_id', VENUE_ID);

  if (warehouses?.length) {
    // Fetch movements per warehouse via RPC
    const movementMaps = await Promise.all(
      warehouses.map((w) => {
        const whId = w.id as string;
        return supabase
          .rpc('admin_inventory_period_movements', {
            p_venue_id: VENUE_ID,
            p_warehouse_id: whId,
            p_from: periodStart,
            p_to: periodEnd,
          })
          .then(({ data }) => ({ whId, data }));
      }),
    );

    // Merge: product_id → summed values
    merged.clear();
    for (const { data } of movementMaps) {
      for (const raw of (data ?? []) as Record<string, unknown>[]) {
        const pid = raw.product_id as string;
        if (!pid) continue;
        const prev = merged.get(pid) || { consumption: 0, incoming: 0, transfer: 0, writeoff: 0 };
        merged.set(pid, {
          consumption: prev.consumption + (Number(raw.consumption) || 0),
          incoming: prev.incoming + (Number(raw.incoming_delivery) || 0),
          transfer: prev.transfer + (Number(raw.transfer_net) || 0),
          writeoff: prev.writeoff + (Number(raw.writeoff_qty) || 0),
        });
      }
    }

    // Get product names for consumed ingredients
    const consumedProductIds = Array.from(merged.keys());
    if (consumedProductIds.length > 0) {
      productMap.clear();
      // Batch in groups of 100
      for (let i = 0; i < consumedProductIds.length; i += 100) {
        const batch = consumedProductIds.slice(i, i + 100);
        const { data: prods } = await supabase
          .from('products')
          .select('id, name')
          .in('id', batch);
        for (const p of prods || []) {
          productMap.set(p.id as string, { name: p.name as string || '—', unit: 'кг' });
        }
      }

      // Build rows — only for ingredients with consumption > 0
      for (const [pid, vals] of merged) {
        if (vals.consumption <= 0) continue;
        const prod = productMap.get(pid);
        const effectiveSupply = vals.incoming + vals.transfer;
        consumptionRows.push({
          productId: pid,
          productName: prod?.name || pid.slice(0, 8),
          unit: prod?.unit || 'кг',
          consumption: vals.consumption,
          incomingDelivery: vals.incoming,
          transferNet: vals.transfer,
          writeoffQty: vals.writeoff,
          coverageRatio: vals.consumption > 0 ? effectiveSupply / vals.consumption : 0,
        });
      }

      // Sort by consumption descending
      consumptionRows.sort((a, b) => b.consumption - a.consumption);
    }
  }

  // ── Overconsumption (inventory-anchored) ──
  const overconsumption: OverconsumptionData = {
    hasBoundaries: false,
    startInventoryDate: null,
    endInventoryDate: null,
    rows: [],
    totalLossSom: null,
  };

  // Find nearest inventory sessions around period boundaries
  const { data: allSessions } = await supabase
    .from('warehouse_inventory_sessions')
    .select('id, conducted_at')
    .eq('venue_id', VENUE_ID)
    .eq('status', 'posted')
    .order('conducted_at', { ascending: true });

  if (allSessions?.length) {
    // Find closest session BEFORE periodStart
    let beforeSession: (typeof allSessions)[0] | null = null;
    for (const s of allSessions) {
      if (s.conducted_at <= periodStart) beforeSession = s;
    }

    // Find closest session AFTER periodEnd
    let afterSession: (typeof allSessions)[0] | null = null;
    for (const s of allSessions) {
      if (s.conducted_at >= periodEnd) {
        afterSession = s;
        break;
      }
    }

    if (beforeSession && afterSession && beforeSession.id !== afterSession.id) {
      overconsumption.hasBoundaries = true;
      overconsumption.startInventoryDate = (beforeSession.conducted_at as string).slice(0, 10);
      overconsumption.endInventoryDate = (afterSession.conducted_at as string).slice(0, 10);

      // Fetch lines for both sessions
      const [{ data: beforeLines }, { data: afterLines }] = await Promise.all([
        supabase.from('warehouse_inventory_lines').select('product_id, actual, unit_price').eq('session_id', beforeSession.id),
        supabase.from('warehouse_inventory_lines').select('product_id, actual, unit_price').eq('session_id', afterSession.id),
      ]);

      // Build maps: product_id → { actual, unit_price }
      const beforeMap = new Map<string, { actual: number; price: number }>();
      for (const l of beforeLines || []) {
        beforeMap.set(l.product_id as string, {
          actual: Number(l.actual) || 0,
          price: Number(l.unit_price) || 0,
        });
      }

      const afterMap = new Map<string, { actual: number; price: number }>();
      for (const l of afterLines || []) {
        afterMap.set(l.product_id as string, {
          actual: Number(l.actual) || 0,
          price: Number(l.unit_price) || 0,
        });
      }

      // Build overconsumption rows from merged consumption data
      // (reuse the merged map from consumption section)
      if (merged.size > 0) {
        const allProductIds = Array.from(
          new Set([...merged.keys(), ...beforeMap.keys(), ...afterMap.keys()])
        );

        for (const pid of allProductIds) {
          const moves = merged.get(pid) || { consumption: 0, incoming: 0, transfer: 0, writeoff: 0 };
          const startInv = beforeMap.get(pid);
          const endInv = afterMap.get(pid);

          const startingStock = startInv?.actual ?? null;
          const endingStock = endInv?.actual ?? null;
          const costPrice = startInv?.price ?? endInv?.price ?? null;

          // Actual = starting + incoming + transfer_net - ending - writeoff
          // Only calculate when both boundaries exist for this product
          const actual: number | null =
            startingStock !== null && endingStock !== null
              ? startingStock + moves.incoming + moves.transfer - endingStock - moves.writeoff
              : null;

          const delta: number | null =
            actual !== null ? actual - moves.consumption : null;

          const lossSom: number | null =
            delta !== null && costPrice !== null && delta > 0
              ? Math.round(delta * costPrice)
              : null;

          if (moves.consumption > 0 || (startingStock !== null && endingStock !== null)) {
            const prod = productMap.get(pid);
            overconsumption.rows.push({
              productId: pid,
              productName: prod?.name || pid.slice(0, 8),
              unit: prod?.unit || 'кг',
              theoretical: moves.consumption,
              actual,
              delta,
              lossSom,
              startingStock,
              endingStock,
              deliveries: moves.incoming,
              costPrice,
            });
          }
        }

        // Sort by loss descending, then by theoretical consumption
        overconsumption.rows.sort((a, b) => {
          if (a.lossSom !== null && b.lossSom !== null) return b.lossSom - a.lossSom;
          if (a.lossSom !== null) return -1;
          if (b.lossSom !== null) return 1;
          return b.theoretical - a.theoretical;
        });

        // Total losses
        let total = 0;
        let hasAnyLoss = false;
        for (const r of overconsumption.rows) {
          if (r.lossSom !== null) {
            total += r.lossSom;
            hasAnyLoss = true;
          }
        }
        if (hasAnyLoss) overconsumption.totalLossSom = total;
      }
    }
  }

  // ── Stock status ──
  const { data: stockItems } = await supabase
    .from('stock_items')
    .select('product_id, quantity, warehouse_id');

  // Get product names for stock
  const stockProductIds = Array.from(new Set((stockItems || []).map((s) => s.product_id as string)));
  const productNameMap = new Map<string, string>();
  if (stockProductIds.length > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name')
      .in('id', stockProductIds);
    for (const p of products || []) {
      productNameMap.set(p.id as string, p.name as string);
    }
  }

  // Calculate weekly consumption from portions per ingredient
  // (Simplified: assume stock_items quantity is in the same unit as recipe_items)
  const stockStatus: StockStatus[] = (stockItems || []).map((s) => ({
    productName: productNameMap.get(s.product_id as string) || '—',
    currentStock: Number(s.quantity) || 0,
    unit: 'кг',
    weeklyConsumption: 0, // placeholder — needs ingredient-level aggregation
    daysLeft: 99,
    isBar: false,
  }));

  // ── Period label ──
  const sDate = new Date(periodStart);
  const eDate = new Date(periodEnd);
  eDate.setDate(eDate.getDate() - 1);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const periodLabel = sDate.getMonth() === eDate.getMonth()
    ? `${sDate.getDate()}–${eDate.getDate()} ${months[eDate.getMonth()]} ${eDate.getFullYear()}`
    : `${sDate.getDate()} ${months[sDate.getMonth()]} – ${eDate.getDate()} ${months[eDate.getMonth()]} ${eDate.getFullYear()}`;

  return {
    portions,
    dailyStats,
    hourlyBuckets,
    drinkStats,
    shiftStats,
    discrepancies: [],
    consumptionRows,
    overconsumption,
    stockStatus,
    periodLabel,
  };
}

// ── Hook ──

export function useAnalytics(start: string, end: string) {
  return useQuery({
    queryKey: ['analytics', VENUE_ID, start, end],
    queryFn: () => fetchAnalytics(start, end),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev: unknown) => prev as AnalyticsData | undefined,
  });
}
