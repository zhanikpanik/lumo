# Admin → InstantDB Migration Plan

## Architecture Context

Admin pages fall into 3 patterns:
- **Pure hook consumers** (13 pages): Analytics*, CashShifts, DashboardNew, Login, NewDelivery, NewTransfer, NewWriteOff, SettingsPage, Transactions, WarehouseWorkspace, WarehousesAdmin — all data flows through dedicated hooks, easiest to migrate
- **Hybrid** (11 pages): AddIngredients, AllOperations, Categories, Checks, DishEdit, EditIngredient, Ingredients, Inventory, Menu, Staff — read via hooks but write via direct supabase + manual `queryClient.invalidateQueries()`
- **No data** (3 pages): CommandBarDemo, DesignPage, FloorPlan (delegates to component)

Current blog: `useOperationalDashboard` in admin reads InstantDB but is unused. All other hooks use Supabase. `VITE_VENUE_ID` not set in admin `.env`.

---

## Phase 0 — Foundation (today, 1h)

### 0.1 Add VENUE_ID to `apps/admin/.env.local`

```
VITE_VENUE_ID=a9c5ebae-e754-53ac-88a9-30e0014814b1
VITE_ORG_ID=573851aa-1ef1-5f69-ad42-245dda4af42b
```

### 0.2 Create `hooks/useVenueId.ts`

```ts
export function useVenueId(): string {
  return import.meta.env.VITE_VENUE_ID;
}
```

New hooks use `useVenueId()` instead of importing `VENUE_ID` from `lib/supabase.ts`.

### 0.3 Add admin query factories to `@lumo/data/src/operationalQueries.ts`

Each returns `InstaQLParams<AppSchema>` — typed InstantDB query objects.

| Query factory | Source entity | Links | Used by |
|---|---|---|---|
| `adminCategoriesQuery(vId)` | `categories` | — | Menu |
| `adminProductsQuery(vId)` | `products` | `category` | Menu, DishEdit |
| `adminEmployeesQuery(vId)` | `employees` | — | Staff |
| `adminZonesQuery(vId)` | `zones` | `tables` | FloorPlan |
| `adminAllOrdersQuery(vId)` | `orders` | `items`, `payments`, `ownerEmployee`, `orderEvents` | Checks |
| `adminAllShiftsQuery(vId)` | `shifts` | `openedBy` | CashShifts |
| `adminCashMovementsQuery(vId)` | `cashMovements` | — | Transactions |

---

## Phase 1 — Read-Only Pages (3h)

Easiest — swap Supabase `useQuery` for InstantDB `useQuery`. No write operations.

### 1.1 Menu: Categories (30min)
- **Now**: `Categories.tsx` reads via `useCategories` (Supabase), writes via direct supabase calls
- **Do**: New `useInstantCategories()` hook → `adminCategoriesQuery`
- **Write ops**: deferred to Phase 3 (DishEdit page covers CRUD)

### 1.2 Menu: Ingredients list (30min)
- **Now**: `Ingredients.tsx` reads via `useIngredients` (Supabase)
- **Do**: New `useInstantIngredients()` → `adminProductsQuery` filtered `kind='ingredient'`

### 1.3 Menu: Dishes list (30min)
- **Now**: `Menu.tsx` reads via `useDishes` (Supabase)
- **Do**: New `useInstantDishes()` → `adminProductsQuery` filtered `kind='dish'`

### 1.4 Staff (30min)
- **Now**: `Staff.tsx` reads via `useStaff` (Supabase)
- **Do**: New `useInstantStaff()` → `adminEmployeesQuery`

### 1.5 Floor Plan (30min)
- **Now**: `FloorPlanGrid.tsx` reads via `useFloorPlan` (Supabase)
- **Do**: New `useInstantFloorPlan()` → `adminZonesQuery`

### 1.6 Import (skip)
- `Import.tsx` — XLSX preview only, button disabled ("скоро"). No data access.

---

## Phase 2 — Operational Read-Only (4h)

### 2.1 Checks page (2h)
- **Now**: `Checks.tsx` (464 lines) — `useChecks` (Supabase) for reads, direct `supabase.from('orders').delete` for writes
- **Do**: 
  1. `adminAllOrdersQuery` → `useInstantChecks()` hook
  2. Map InstantDB rows → existing `Check` type (keep `checkAnalysis.ts` engine untouched — it works on `Check[]`)
  3. Write ops: delete via `db.tx.orders[id].update({status:'cancelled'})`
- **Risk**: `checkAnalysis.ts` (11KB, 6 rules) — backend-agnostic, just needs `Check[]` input

### 2.2 Cash Shifts (1h)
- **Now**: `CashShifts.tsx` (866 lines) — reads via `useShifts` + `useShiftTransactions` (Supabase)
- **Do**: `adminAllShiftsQuery` → `useInstantShifts()`

### 2.3 Transactions (1h)
- **Now**: `Transactions.tsx` (420 lines) — reads via `useCashTransactions` (Supabase)
- **Do**: `adminCashMovementsQuery` → `useInstantCashMovements()`
- **Missing**: `cash_transaction_categories` not in InstantDB schema — need to add or hardcode

---

## Phase 3 — Write Operations + Dashboard (6h)

### 3.1 DishEdit CRUD (3h)
- **Now**: `DishEdit.tsx` (926 lines) — ~15 direct supabase calls for product/recipe/modifier CRUD
- **Do**: Create `useInstantDishMutations()` with:
  - `createDish` / `updateDish` → `db.tx.products[id].update(...)`
  - `saveRecipe` → `db.tx.recipeItems[id].update(...)`
  - `saveModifiers` → `db.tx.modifierGroups/modifiers`
- **Pattern**: follow existing `useFormMachine` + mutation hooks from warehouse forms

### 3.2 Dashboard migration (3h)
- **Now**: `useDashboardNewData.ts` (1159 lines, 30+ Supabase calls) — the biggest file
- **Do**: Replace `supabase.from(...)` with InstantDB `useQuery` calls. Each detector becomes its own query.
- **Blocked on**: Phases 1-2 (needs all entity queries to exist first)

---

## Phase 4 — Warehouse Schema Extension + Migration (blocked)

Warehouse entities **not in InstantDB schema**. Must add before migrating these pages:

| Missing entity | Used by pages |
|---|---|
| `warehouses` | Menu, AllOperations, Inventory, WarehouseWorkspace, WarehousesAdmin |
| `warehouseProducts` | AddIngredients, EditIngredient, Inventory, WarehouseWorkspace |
| `warehouseDeliveries` + `items` | AllOperations, NewDelivery |
| `warehouseWriteOffs` + `items` | AllOperations, NewWriteOff |
| `warehouseTransfers` + `items` | AllOperations, NewTransfer |
| `warehouseInventorySessions` + `lines` | AllOperations, Inventory |

**Pages blocked**: AllOperations, NewDelivery, NewWriteOff, NewTransfer, Inventory, AddIngredients, EditIngredient, WarehouseWorkspace, WarehousesAdmin

---

## Phase 5 — Analytics (deferred)

- `Analytics.tsx`, `AnalyticsNew.tsx`, `AnalyticsProfit.tsx` — read-only, pure hook consumers
- Heavy aggregation — may need server-side computation
- Not critical for daily operations

---

## Phase 6 — Cleanup

- Delete `lib/supabase.ts` + Supabase-only hooks
- Remove `@supabase/supabase-js` dependency
- Delete old warehouse Supabase RPCs

---

## Summary

| Phase | Pages | Effort | Status |
|-------|-------|--------|--------|
| 0 — Foundation | — | 1h | Ready to start |
| 1 — Read-only | Categories, Ingredients, Dishes, Staff, FloorPlan, Import | 3h | Ready |
| 2 — Operational | Checks, CashShifts, Transactions | 4h | Ready after Phase 1 |
| 3 — Complex | DishEdit, Dashboard, Menu (CRUD) | 6h | Ready after Phase 2 |
| 4 — Warehouse | AllOperations, New*, Inventory, + 5 more | ? | **Blocked** — schema |
| 5 — Analytics | Analytics, AnalyticsNew, AnalyticsProfit | Deferred | |
| 6 — Cleanup | — | 2h | |

**Total unblocked**: 14h. **Blocked**: 9 warehouse pages.
