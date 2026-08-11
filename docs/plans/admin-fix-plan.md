# Admin Code Review — Fix Plan

Based on code review of `apps/admin/` (2026-07-30). Context: migrating from Supabase → InstantDB.
InstantDB schema covers: orders, shifts, payments, products, categories, modifiers, recipe items, zones, tables, kitchen tickets, fiscal receipts, order events, inventory movements.
**Warehouse domain** (deliveries, write-offs, transfers, inventory sessions, stock items, warehouses) stays Supabase until further notice.

---

## Phase 0 — Quick Wins (today, ~1h)

Backend-agnostic. No risk.

### 0.1 Fix lint errors — 14 unused imports in 7 files

```
src/components/ExpenseTreemap.tsx        — remove useMemo, CHART_GRID, CHART_FONT_SIZE_SM
src/components/MonthlyRevenueChart.tsx   — remove CHART_DARK, CHART_GRID, CHART_FONT
src/components/TopItems.tsx              — remove unused `ingredients` destructured var
src/components/WeeklyComparison.tsx      — remove CHART_GRID, CHART_FONT, CHART_FONT_SIZE_SM
src/components/analytics-profit/EbitChart.tsx   — remove CHART_FONT
src/components/analytics-profit/SplhBars.tsx    — remove CHART_DARK
src/components/analytics-profit/SplhHeatmap.tsx — remove unused `splhColor`
src/components/analytics/PeriodPicker.tsx       — remove `ru`, `cn`
```

### 0.2 `Layout.tsx:89-91` — replace useEffect with event handler

```tsx
// BEFORE (triggers lint warning, cascading render)
useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

// AFTER — close on NavLink click instead
// Add onClick={() => setSidebarOpen(false)} to each NavLink in mobile sidebar
```

### 0.3 `App.tsx:62` — derive CACHE_BUSTER from build

```tsx
// BEFORE
const CACHE_BUSTER = 'v1';

// AFTER
const CACHE_BUSTER = import.meta.env.VITE_COMMIT_SHA?.slice(0, 7) || 'v1';
```

Add `VITE_COMMIT_SHA` to Vercel/Railway build env (or use `package.json` version).

### 0.4 Remove Poster API token from AGENTS.md

`apps/admin/AGENTS.md:177` contains a live Poster API token. Remove or rotate.

---

## Phase 1 — Warehouse Race Condition (this week, ~2h)

Fixes the two blocking correctness bugs in Supabase warehouse code.

### 1.1 Atomic stock increment — replace `applyStockDelta` read-modify-write

**Problem:** Two concurrent mutations read the same `quantity`, compute `next`, last write wins.

**Fix:** Create a Supabase RPC:

```sql
CREATE OR REPLACE FUNCTION increment_stock(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_delta NUMERIC,
  p_unit TEXT DEFAULT 'кг'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO stock_items (warehouse_id, product_id, quantity, unit, updated_at)
  VALUES (p_warehouse_id, p_product_id, p_delta, p_unit, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET
    quantity = stock_items.quantity + EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;
```

Replace all `applyStockDelta` calls with `supabase.rpc('increment_stock', { ... })`.
The `Math.max(0, cur + delta)` clamp moves into the RPC or stays client-side as a post-check.

### 1.2 Atomic finalize — combine stock apply + status update

**Problem:** `finalizeWarehouseDelivery` does two separate writes. Crash between them = double-apply on retry.

**Fix:** Create a single RPC per document type:

```sql
CREATE OR REPLACE FUNCTION finalize_delivery_safe(p_delivery_id UUID, p_venue_id UUID)
RETURNS VOID AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM warehouse_deliveries
    WHERE id = p_delivery_id AND venue_id = p_venue_id FOR UPDATE;

  IF v_status = 'received' THEN RETURN; END IF;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Delivery not found'; END IF;

  -- Apply stock from lines
  INSERT INTO stock_items (warehouse_id, product_id, quantity, unit, updated_at)
  SELECT d.warehouse_id, di.product_id, di.quantity, di.unit, now()
  FROM warehouse_delivery_items di
  JOIN warehouse_deliveries d ON d.id = di.delivery_id
  WHERE di.delivery_id = p_delivery_id
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET
    quantity = stock_items.quantity + EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    updated_at = now();

  UPDATE warehouse_deliveries SET status = 'received'
    WHERE id = p_delivery_id AND venue_id = p_venue_id;
END;
$$ LANGUAGE plpgsql;
```

Same pattern for write-offs and transfers. The JS fallback path still exists for when the RPC is missing, but the primary path becomes a single atomic call.

### 1.3 Refactor `finalizeWarehouse*` functions

After the RPCs exist, simplify `finalizeWarehouseDelivery` / `finalizeWarehouseWriteOff` / `finalizeWarehouseTransfer`:

```ts
async function finalizeWarehouseDelivery(deliveryId: string): Promise<void> {
  const { error } = await supabase.rpc('finalize_delivery_safe', {
    p_delivery_id: deliveryId,
    p_venue_id: VENUE_ID,
  });
  if (shouldUseWarehouseStockRpcFallback(error)) {
    // Fallback: non-atomic but only used when RPC doesn't exist
    await applyDeliveryStockFallback(deliveryId);
    await supabase.from('warehouse_deliveries')
      .update({ status: 'received' })
      .eq('id', deliveryId).eq('venue_id', VENUE_ID);
  } else if (error) {
    throw error;
  }
}
```

---

## Phase 2 — Structural Refactors (next week, ~4h)

Backend-agnostic improvements that make the codebase healthier regardless of migration timeline.

### 2.1 Split `useWarehouse.ts` (1812 lines → 5 files)

```
src/hooks/warehouse/
├── useDeliveries.ts      (~300 lines) — CRUD + status mutations
├── useWriteOffs.ts       (~250 lines) — CRUD + status mutations
├── useTransfers.ts       (~300 lines) — CRUD + status mutations
├── useInventory.ts       (~200 lines) — sessions + lines
└── warehouseStock.ts     (~200 lines) — applyStockDelta, finalize*, reverse*, fallback logic
```

Keep `useStatusMutation` factory in a shared `warehouse/useStatusMutation.ts`.
Re-export everything from `useWarehouse.ts` as a barrel for zero-disruption imports:

```ts
// useWarehouse.ts — barrel (temporary, remove after updating all imports)
export * from './warehouse/useDeliveries';
export * from './warehouse/useWriteOffs';
// ...
```

### 2.2 Break up `fetchDashboardNewData` (965 lines → 5 functions)

Extract into `src/lib/dashboard/`:

```
src/lib/dashboard/
├── fetchMetrics.ts        — today/yesterday/week/period revenue, checks, avg check, expenses
├── fetchAlerts.ts         — all 8+ alert rules
├── fetchChronology.ts     — timeline events
├── fetchTopDishes.ts      — food cost calculation (shared, not duplicated)
├── fetchStockThreats.ts   — low/negative stock
└── types.ts               — re-export from types/dashboard.ts
```

`fetchDashboardNewData` becomes:

```ts
async function fetchDashboardNewData(period, offset) {
  const [metrics, alerts, chronology, topDishes, stockThreats] = await Promise.all([
    fetchMetrics(period, offset),
    fetchAlerts(period, offset),
    fetchChronology(),
    fetchTopDishes(period, offset),
    fetchStockThreats(),
  ]);
  return { ...metrics, ...alerts, chronology, ...topDishes, ...stockThreats };
}
```

This also parallelizes the 30+ sequential queries into ~5 concurrent batches.

### 2.3 Deduplicate food cost calculation

Extract `calculateFoodCostForDishes(dishIds, dishMap)` from the duplicated block in `fetchDashboardNewData`. Used by both period and month top-dish calculations.

### 2.4 Extract `chunkedInQuery` to shared utility

Currently defined inside `fetchDashboardNewData` (closure, re-created every call) AND separately in `useChecksData.ts`. Extract to `src/lib/chunkedQuery.ts`:

```ts
export async function chunkedInQuery<T>(
  table: string,
  columns: string,
  ids: string[],
  idColumn: string,
  extraFilter?: (q: any) => any,
  chunkSize = 200,
): Promise<T[]> { ... }
```

### 2.5 Add React Error Boundary

Wrap `<AuthGate>` routes in an error boundary to prevent full-app crash on hook errors:

```tsx
// src/components/ErrorBoundary.tsx
export class ErrorBoundary extends React.Component<
  { fallback?: ReactNode; children: ReactNode },
  { hasError: boolean; error: Error | null }
> { ... }
```

```tsx
// App.tsx
<ErrorBoundary fallback={<div>Что-то пошло не так. Обновите страницу.</div>}>
  <Routes>...</Routes>
</ErrorBoundary>
```

---

## Phase 3 — Select Star Cleanup (~1h)

Replace all 15 `select('*')` calls with explicit column lists.

Priority order (most impactful):

| File | Table | Fix |
|------|-------|-----|
| `useCashTransactions.ts:75,99` | `cash_movements` | Select only used columns |
| `useMenuData.ts:9` | `categories` | `id, name, sort_order` |
| `useShiftsData.ts:175` | `shifts` | Select shift columns explicitly |
| `useTransactionCategories.ts:24` | `cash_transaction_categories` | `id, name, sort_order, type` |
| `useWarehouse.ts` (10 occurrences) | Various warehouse tables | Already has interfaces — select matching columns |

Each `select('*')` → explicit list. Verify with `tsc` after each change.

---

## Phase 4 — InstantDB Migration Prep (deferred)

This phase is **planning only** — no code changes until the migration is actively happening.

### 4.1 What's already in InstantDB

| Entity | Status |
|--------|--------|
| orders, orderItems, orderEvents | ✅ Schema ready |
| shifts, payments, cashMovements | ✅ Schema ready |
| products, categories, modifiers, recipeItems | ✅ Schema ready |
| zones, tables | ✅ Schema ready |
| kitchenTickets, fiscalReceipts | ✅ Schema ready |
| inventoryMovements | ✅ Schema ready |

### 4.2 What's NOT in InstantDB (Supabase-only)

| Domain | Tables | Migration complexity |
|--------|--------|---------------------|
| Warehouses | `warehouses`, `warehouse_products` | Low — simple entities |
| Deliveries | `warehouse_deliveries`, `warehouse_delivery_items` | Medium — status FSM + stock |
| Write-offs | `warehouse_write_offs`, `warehouse_write_off_items` | Medium — same pattern |
| Transfers | `warehouse_transfers`, `warehouse_transfer_items` | Medium — two warehouses |
| Inventory | `warehouse_inventory_sessions`, `warehouse_inventory_lines` | Medium — lines relation |
| Stock | `stock_items` | High — atomic operations needed |
| Staff | `users` (Supabase auth) | Low — InstantDB has `$users` |
| Transaction categories | `cash_transaction_categories` | Low — simple lookup |

### 4.3 Migration order (recommended)

1. **Staff/Users** — replace Supabase Auth with InstantDB auth
2. **Transaction categories** — simple lookup table
3. **Warehouses** — simple entity
4. **Stock items** — needs InstantDB transaction support or a server-side function
5. **Deliveries/Write-offs/Transfers** — status FSM + stock side-effects
6. **Inventory sessions** — most complex, has line items + stock correction

### 4.4 Key decision: atomic stock operations

InstantDB doesn't have stored procedures or `UPDATE ... SET quantity = quantity + x`.
Options:
- **A.** Use InstantDB transactions (`db.tx.stockItems.update(...)`) — client-side atomicity
- **B.** Keep stock on Supabase as a "stock service" accessed via Edge Function
- **C.** Use InstantDB's server-side functions (if available)

This decision blocks warehouse migration.

---

## Priority Matrix

| Phase | Effort | Impact | Risk | When |
|-------|--------|--------|------|------|
| 0 — Quick wins | 1h | Medium | None | Today |
| 1 — Race condition | 2h | **Critical** | Low (new RPCs) | This week |
| 2 — Structural | 4h | High | Low (refactor only) | Next week |
| 3 — Select star | 1h | Medium | None | Anytime |
| 4 — InstantDB prep | Planning | — | — | When migration starts |
