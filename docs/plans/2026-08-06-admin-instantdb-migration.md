# Admin → InstantDB: Complete Migration Plan

## Goal

Remove all Supabase query/mutation code from the admin app. Keep Supabase auth (separate concern). After this, `lib/supabase.ts` is used ONLY for auth — no `.from()`, `.rpc()`, or `.select()` calls remain.

## Current State

- **31 files** import from Supabase in `apps/admin/src/`
- **25 InstantDB hooks** already exist and work
- **16 Supabase hooks** need migration (some have InstantDB equivalents, some don't)
- **2 components** with direct Supabase mutations (`DeadItemAlert`, `StockCorrection`)
- **2 lib files** with Supabase helpers (`inventoryPeriodMovements.ts`, `ingredientStock.ts`)
- Auth stays on Supabase (4 files: `auth-context.ts`, `AuthGate.tsx`, `AuthProvider.tsx`, `Login.tsx`)

## Schema Changes Required

Add to `packages/data/src/instant.schema.ts`:

### 1. New entity: `transactionCategories`

```ts
transactionCategories: i.entity({
  name: i.string(),
  type: i.string().indexed(), // 'expense' | 'income'
  sortOrder: i.number().indexed(),
  createdAt: i.date().indexed(),
}),
```

**Link:** `transactionCategoryVenue` — forward on `transactionCategories`, has one, label `venue` → reverse on `venues`, has many, label `transactionCategories`.

### 2. New entity: `workshops`

```ts
workshops: i.entity({
  name: i.string(),
  defaultWarehouseId: i.string().optional(),
  createdAt: i.date().indexed(),
}),
```

**Link:** `workshopVenue` — forward on `workshops`, has one, label `venue` → reverse on `venues`, has many, label `workshops`.

### 3. New entity: `workshopWarehouses`

```ts
workshopWarehouses: i.entity({
  createdAt: i.date().indexed(),
}),
```

**Links:**
- `workshopWarehouseWorkshop` — forward on `workshopWarehouses`, has one, label `workshop`
- `workshopWarehouseWarehouse` — forward on `workshopWarehouses`, has one, label `warehouse`

### 4. Add field to `products`: `hasModifiers`

```ts
hasModifiers: i.boolean().optional(),
```

Already used by `useInstantDishEditor` via `as any` cast — just needs schema declaration.

### 5. Ensure indexes on `orders`

Already have: `status`, `openedAt`, `closedAt`, `source`, `createdAt`. These are sufficient for all analytics queries (`$gte`, `$lt`, `order`).

### 6. Ensure indexes on `cashMovements`

Check that `movementType` and `occurredAt` are indexed. If not, add `.indexed()`.

---

## Wave 1: Quick Wins (1–2 days)

Direct replacements. InstantDB hooks or simple `db.transact()` calls already cover these.

### 1.1 DeadItemAlert + StockCorrection

**Current:** Direct `supabase.from().update()` in components.
**Fix:** Use `getInstantClient().transact()`.

```ts
// DeadItemAlert.tsx — replace supabase call:
const db = getInstantClient();
await db.transact(db.tx.products[productId].update({ status: 'archived' }));

// StockCorrection.tsx — replace supabase call:
const db = getInstantClient();
await db.transact(
  db.tx.stockItems[id].update({ quantityMilli: newQty * 1000 })
);
```

**Files:** `components/dashboard/DeadItemAlert.tsx`, `components/dashboard/StockCorrection.tsx`

### 1.2 useVenueSettings

**Current:** `supabase.from('venues').select()/.update()`
**Fix:** Read via `useInstantVenue` (already exists). Write via `db.transact`.

```ts
// New: useInstantVenueMutations.ts
export function useUpdateVenue() {
  const db = getInstantClient();
  return useCallback(async (venueId: string, patch: Partial<VenueRow>) => {
    await db.transact(db.tx.venues[venueId].update(patch));
  }, []);
}
```

**Delete:** `hooks/useVenueSettings.ts`
**Wire:** `pages/` that use `useVenue`/`useUpdateVenue` → `useInstantVenue` + `useUpdateVenue`

### 1.3 useExpenseCategories

**Current:** `supabase.from('cash_movements').select()` + client-side keyword classification
**Fix:** Use `useInstantCashMovements` (already exists) + `useMemo` for classification.

```ts
export function useExpenseCategories(start: string, end: string) {
  const { movements } = useInstantCashMovements(/* with date filter */);
  return useMemo(() => classifyExpenses(movements), [movements]);
}
```

**Delete:** `hooks/useExpenseCategories.ts`

### 1.4 useTransactionCategories

**Current:** `supabase.from('cash_transaction_categories')` — entity doesn't exist in InstantDB yet.
**Prereq:** Add `transactionCategories` entity to schema (see Schema Changes above).
**Fix:** New hook `useInstantTransactionCategories.ts` using `useQuery` + `db.transact` for CRUD.

**Delete:** `hooks/useTransactionCategories.ts`

---

## Wave 2: Dashboard & Simple Analytics (2–3 days)

These hooks all follow the same pattern: fetch orders/cashMovements in a date range, aggregate client-side.

### 2.1 useDashboardData

**Current:** 5 separate Supabase queries (revenue today/yesterday, expenses today/yesterday, low stock, recent transactions).
**Fix:** Compose from existing InstantDB hooks:

```ts
export function useDashboardData() {
  const { data } = db.useQuery({
    orders: { $: { where: { venueId: VENUE_ID, status: 'paid' } } },
    cashMovements: { $: { where: { venueId: VENUE_ID } } },
    stockItems: { $: { where: { venueId: VENUE_ID, /* low stock filter */ } } },
  });
  // Aggregate in useMemo — same logic, different data source
}
```

**Delete:** `hooks/useDashboardData.ts`

### 2.2 useHeatmapData

**Current:** `supabase.from('orders')` paid orders in date range → group by day/hour.
**Fix:** `useQuery` with `openedAt: { $gte: start, $lt: end }` + `useMemo` aggregation.

**Delete:** `hooks/useHeatmapData.ts`

### 2.3 useMonthlyStats

**Current:** Two Supabase queries (paid orders + cash movements) → group by date.
**Fix:** Same `useQuery` pattern + `useMemo`.

**Delete:** `hooks/useMonthlyStats.ts`

### 2.4 useWeeklyStats

**Current:** Same pattern as monthly.
**Fix:** Same `useQuery` pattern + `useMemo`.

**Delete:** `hooks/useWeeklyStats.ts`

### 2.5 useTopItems

**Current:** Supabase: get paid order IDs → chunked IN on order_items → group by product_name.
**Fix:** `useQuery` with nested relations:

```ts
const { data } = db.useQuery({
  orders: {
    $: { where: { venueId, status: 'paid', openedAt: { $gte: start, $lt: end } } },
    items: {}, // orderItems already linked
  },
});
```

No chunking needed — InstantDB handles this.

**Delete:** `hooks/useTopItems.ts`

### 2.6 useFloorPlan

**Current:** Supabase CRUD for zones + tables.
**Fix:** Read from `useInstantVenue` (already fetches zones/tables). Write via `db.transact`.

```ts
// Save table position:
db.transact(db.tx.tables[tableId].update({ col, row, colSpan, rowSpan }));

// Create table:
db.transact([
  db.tx.tables[newId].update({ number, col, row, capacity, size }),
  db.tx.tables[newId].link({ zone: zoneId }),
]);
```

**Delete:** `hooks/useFloorPlan.ts`

---

## Wave 3: Analytics Deep (3–4 days)

Complex aggregation hooks. These need careful handling because they build cost indexes from recipe data.

### 3.1 useAnalytics (~600 lines)

**Current:** Fetches orders, order_items, products, cash_movements, inventory_movements. Builds a cost index from recipe data. Aggregates revenue/expenses/consumption by day/hour/shift/ingredient.

**Fix:** Two-phase approach:

**Phase A — Data:** Single `useQuery` with all needed relations:
```ts
const { data } = db.useQuery({
  orders: {
    $: { where: { venueId, openedAt: { $gte: start, $lt: end } } },
    items: {},
    payments: {},
  },
  cashMovements: { $: { where: { venueId, occurredAt: { $gte: start, $lt: end } } } },
  inventoryMovements: { $: { where: { venueId, occurredAt: { $gte: start, $lt: end } } } },
  products: { $: { where: { venueId } } },
  recipeItems: {}, // for cost index
});
```

**Phase B — Aggregation:** Pure `useMemo` functions (extract from current `fetchAnalytics`).

**New file:** `hooks/useInstantAnalytics.ts`
**Delete:** `hooks/useAnalytics.ts`

### 3.2 useAnalyticsProfit

**Current:** Same pattern as useAnalytics but focused on profit/SPLH.
**Fix:** Reuse data from `useInstantAnalytics` or share a common query. Extract profit calculations into `useMemo`.

**New file:** `hooks/useInstantAnalyticsProfit.ts`
**Delete:** `hooks/useAnalyticsProfit.ts`

### 3.3 inventoryPeriodMovements

**Current:** `supabase.from('workshops')`, `supabase.from('workshop_warehouses')`, `supabase.rpc('get_inventory_movements')`.
**Prereq:** Add `workshops` + `workshopWarehouses` entities to schema.
**Fix:**

```ts
// Resolve workshop → warehouses via InstantDB
const { data } = db.useQuery({
  workshops: { $: { where: { id: workshopId } } },
  workshopWarehouses: { $: { where: { workshopId } } },
});

// Inventory movements — already in schema, use useQuery
const { data } = db.useQuery({
  inventoryMovements: { $: { where: { warehouseId, occurredAt: { $gte: pFrom, $lt: pTo } } } },
});
```

**Refactor:** `lib/inventoryPeriodMovements.ts` → remove Supabase imports, use InstantDB client.

### 3.4 ingredientStock

**Current:** `supabase.from('workshop_warehouses')`, `supabase.from('stock_items')`.
**Prereq:** `workshops` + `workshopWarehouses` entities.
**Fix:** Use `useInstantStockItems` (already exists) + `workshopWarehouses` query.

**Refactor:** `lib/ingredientStock.ts` → remove Supabase imports.

---

## Wave 4: Menu & Staff (1–2 days)

These have InstantDB equivalents but pages still wire to Supabase hooks.

### 4.1 useMenuData → useInstantCategories + useInstantDishMutations

**Current:** `useMenuData.ts` — 593 lines, fetches categories/dishes/ingredients/workshops via Supabase.
**Fix:** Pages already have InstantDB equivalents. Wire them:

| Page | Supabase hook | InstantDB replacement |
|---|---|---|
| Menu page | `useCategories` | `useInstantCategories` |
| Menu page | `useDishes` | `useInstantDishEditor` |
| Menu page | `useCreateCategory` | `useInstantCategoryMutations` |
| Menu page | `useWorkshops` | New `useInstantWorkshops` (from schema entity) |
| Ingredients page | `useIngredients` | `useInstantWarehouseIngredients` |

**Delete:** `hooks/useMenuData.ts`

### 4.2 useDishData → useInstantDishEditor

**Current:** `useDishData.ts` — fetches dish + recipe + modifiers via Supabase.
**Fix:** `useInstantDishEditor` already exists and does the same thing.

**Delete:** `hooks/useDishData.ts`

### 4.3 useChecksData → useInstantChecks

**Current:** `useChecksData.ts` — 301 lines, chunked queries for orders/items/payments/events.
**Fix:** `useInstantChecks` already exists. Wire it to the UI.

**Delete:** `hooks/useChecksData.ts`

### 4.4 useStaffData → useInstantStaff

**Current:** `useStaffData.ts` — fetches user_venues + users.
**Fix:** `useInstantStaff` already exists.

**Delete:** `hooks/useStaffData.ts`

### 4.5 useShiftsData → useInstantCashShifts

**Current:** `useShiftsData.ts` — fetches shifts + cash_movements.
**Fix:** `useInstantCashShifts` already exists.

**Delete:** `hooks/useShiftsData.ts`

### 4.6 useCashTransactions → useInstantCashMovements + mutations

**Current:** `useCashTransactions.ts` — CRUD on cash_movements.
**Fix:** `useInstantCashMovements` (read) + `useInstantCashMovementMutations` (write) already exist.

**Delete:** `hooks/useCashTransactions.ts`

---

## Wave 5: Init & Bootstrap (1 day)

### 5.1 useInitDefaults

**Current:** Creates default warehouses (Кухня, Бар) and workshops via Supabase.
**Fix:** Use `useInstantWarehouses` + `createWarehouse` command from `@lumo/data`. Run once on mount.

**Refactor:** `hooks/useInitDefaults.ts` → use InstantDB commands.

---

## Wave 6: Cleanup (1 day)

### 6.1 Delete Supabase hooks

Remove all migrated files:
```
apps/admin/src/hooks/useAnalytics.ts
apps/admin/src/hooks/useAnalyticsProfit.ts
apps/admin/src/hooks/useCashTransactions.ts
apps/admin/src/hooks/useChecksData.ts
apps/admin/src/hooks/useDashboardData.ts
apps/admin/src/hooks/useDishData.ts
apps/admin/src/hooks/useExpenseCategories.ts
apps/admin/src/hooks/useFloorPlan.ts
apps/admin/src/hooks/useHeatmapData.ts
apps/admin/src/hooks/useMenuData.ts
apps/admin/src/hooks/useMonthlyStats.ts
apps/admin/src/hooks/useShiftsData.ts
apps/admin/src/hooks/useStaffData.ts
apps/admin/src/hooks/useTopItems.ts
apps/admin/src/hooks/useTransactionCategories.ts
apps/admin/src/hooks/useVenueSettings.ts
apps/admin/src/hooks/useWeeklyStats.ts
```

### 6.2 Clean lib files

```
apps/admin/src/lib/inventoryPeriodMovements.ts  — remove supabase imports
apps/admin/src/lib/ingredientStock.ts           — remove supabase imports
```

### 6.3 Remove dead Supabase query infrastructure

```
apps/admin/src/lib/supabase.ts — keep ONLY auth-related exports
                                 (createClient, signIn, signOut, getSession)
                                 remove VENUE_ID export (use config.ts instead)
```

### 6.4 Remove @tanstack/query dependency

After all hooks use `db.useQuery()` instead of `useQuery` from tanstack:
```bash
pnpm remove @tanstack/react-query @tanstack/react-table
```

Check if `DataTable` component still needs `@tanstack/react-table` — it might be used independently.

### 6.5 Fix type casts

All `as Record<string, unknown>` and `as any` casts in remaining InstantDB hooks should be replaced with proper typed mappers. Create shared types in `packages/data/src/types/` for linked entity shapes.

---

## Auth: Keep on Supabase

These 4 files stay as-is:
- `auth/auth-context.ts`
- `auth/AuthGate.tsx`
- `auth/AuthProvider.tsx`
- `pages/Login.tsx`

InstantDB has its own auth, but migrating auth is a separate project with its own risks (session management, token refresh, OAuth providers). Defer.

**Exception:** `useInitDefaults` currently uses Supabase for upsert — migrate that to InstantDB.

---

## Execution Order

```
Wave 1  ──→  Wave 2  ──→  Wave 3  ──→  Wave 4  ──→  Wave 5  ──→  Wave 6
(2d)         (3d)         (4d)         (2d)         (1d)         (1d)
```

**Total: ~13 working days**

Each wave is independently deployable. After each wave, the app works — Supabase hooks and InstantDB hooks coexist temporarily.

---

## Verification

After each wave:
1. `pnpm build` in `apps/admin/` — no TypeScript errors
2. Manual smoke test: navigate every page, verify data loads
3. `grep -r "supabase" apps/admin/src/hooks/` — count decreases
4. After Wave 6: `grep -r "from.*supabase" apps/admin/src/` — only auth files remain

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| InstantDB query performance for analytics (loading all orders) | Use `limit` + `order` + date range. Test with 3000+ orders. |
| Missing indexes break `$gte`/`$lt` queries | Verify `openedAt`, `occurredAt`, `status` are `.indexed()` in schema |
| Schema push breaks existing data | Test on dev environment first. InstantDB is additive — new fields don't break old data |
| Type casts needed during transition | Accept `as` casts temporarily. Fix in Wave 6 cleanup |
| Auth stays on Supabase = two clients | Document clearly. `lib/supabase.ts` exports auth-only API |
