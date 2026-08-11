# Admin InstantDB Migration — Current State

## What Works (proven)

### Seed Scripts
- `packages/data/src/seed-from-poster.ts` — pulls data from Poster API → InstantDB
- `packages/data/src/seed-client.ts` — creates venue with template menu
- Sun Bar venue seeded with: 4 categories, 97 products, 2 employees, 1 zone, 43 inventory movements

### Query Factories (`packages/data/src/operationalQueries.ts`)
- `adminCategoriesQuery`, `adminProductsQuery`, `adminEmployeesQuery`
- `adminZonesQuery`, `adminAllOrdersQuery`, `adminAllShiftsQuery`
- `adminCashMovementsQuery`, `adminDishesWithRecipesQuery` (new)

### Read Hooks (все используются в мигрированных страницах)
| Hook | Source | Страницы |
|------|--------|----------|
| `useInstantCategories` | `useInstantCategories.ts` | Menu, DishEdit |
| `useInstantDishesDetailed` | `useInstantDishesDetailed.ts` | Menu |
| `useInstantChecks` | `useInstantChecks.ts` (переписан) | Checks |
| `useInstantIngredientsDetailed` | `useInstantIngredientsDetailed.ts` | Ingredients |
| `useInstantIngredientUsageMap` | Same file | Ingredients |
| `useInstantStaff` | `useInstantStaff.ts` | Staff |
| `useInstantDish` / `useInstantDishRecipe` / `useInstantDishModifiers` | `useInstantDishEditor.ts` | DishEdit |
| `useInstantIngredients_list` | Same file | DishEdit |
| `useInstantCashShifts` | `useInstantCashShifts.ts` | Cash Shifts, Transactions |
| `useInstantShiftTransactions` | Same file | Cash Shifts |
| `useInstantCashMovements` | `useInstantCashMovements.ts` | Transactions |
| `useInstantFloorPlan` | `useInstantFloorPlan.ts` | (read-хук готов, страница не мигрирована) |

### Write Hooks (новые, созданы в ходе миграции)
| Hook | Source |
|------|--------|
| `useInstantDeleteProduct` / `useInstantRestoreProduct` | `useInstantDeleteProduct.ts` |
| `useInstantCancelOrder` | `useInstantCancelOrder.ts` |
| `useInstantCreateEmployee` / `useInstantUpdateEmployee` / `useInstantDeleteEmployee` | `useInstantStaffMutations.ts` |
| `useInstantCreateDish` / `useInstantUpdateDish` | `useInstantDishMutations.ts` |
| `useInstantAddRecipeItem` / `useInstantRemoveRecipeItem` / `useInstantUpdateRecipeItem` | Same file |
| `useInstantCreateModifierGroup` / `useInstantUnlinkModifierGroup` / `useInstantUpdateModifierGroup` | `useInstantModifierMutations.ts` |
| `useInstantCreateModifier` / `useInstantUpdateModifier` / `useInstantDeleteModifier` | Same file |
| `useInstantAddCashMovement` / `useInstantDeleteCashMovement` / `useInstantUpdateCashMovement` | `useInstantCashMovementMutations.ts` |
| `useInstantUpdateShift` | `useInstantShiftUpdate.ts` |

### Schema changes
- `employees`: добавлены `email` (optional), `pin` (optional) — запушено `instant-cli push`
- `adminDishesWithRecipesQuery`: новый query factory в `operationalQueries.ts`
### Test Page
- `apps/admin/src/pages/InstantDbTest.tsx` at `/instant-test`
- Full CRUD demo: create, rename, delete categories
- Shows all InstantDB data live
### Env Vars
- `VITE_VENUE_ID=a9c5ebae-e754-53ac-88a9-30e0014814b1` in `apps/admin/.env.local`
- `VITE_INSTANT_APP_ID=97b79f35-9cb0-4e28-b504-c645cd7e5e39`

---

## Migrated Pages

| Page | Route | Status |
|------|-------|--------|
| Categories | `/menu/categories` | **Fully working** ✅ — CRUD tested via browser |
| Menu (Dishes) | `/menu` | **Fully working** ✅ — reads + delete migrated to InstantDB |
| Checks | `/checks` | **Fully working** ✅ — analysis + cancel migrated to InstantDB |
| Ingredients | `/menu/ingredients` | **Fully working** ✅ — stock from inventoryMovements, usage map from recipeItems. Workshop filter disabled (entity not in InstantDB yet). Warehouse breakdown disabled. |
| Staff | `/staff` | **Fully working** ✅ — CRUD migrated. Schema: added `email` + `pin` to `employees` entity. |
| DishEdit | `/menu/dish/:id` | **Fully working** ✅ — read + all CRUD (product, recipe, modifiers) migrated. 6 new hooks. Workshop + modifier ingredient linking deferred. |
| Cash Shifts | `/cash-shifts` | **Fully working** ✅ — shifts + cashMovements aggregation, transaction CRUD. Category picker + payment_method removed (not in InstantDB). |
| Transactions | `/transactions` | **Fully working** ✅ — read all cashMovements, add/edit/delete. Shift links preserved. Category picker removed. |

**Итого: 8 страниц мигрировано.** Осталось: FloorPlan (write-мутации), DashboardNew (нужна серверная агрегация).

InstantDB hooks work correctly inside `<Layout>` / `<AuthGate>`. The earlier "empty data" report was a false alarm — the wrong URL was being tested (`/menu` shows the Menu/Dishes page). Correct URL: `/menu/categories`.

## Pages Still on Supabase

- `FloorPlan.tsx` — `useFloorPlan` (needs zone/table write mutations). Read-хук `useInstantFloorPlan` уже готов.
- `DashboardNew.tsx` — 33 Supabase-запроса с серверной агрегацией (SUM, COUNT, GROUP BY по датам). InstantDB не поддерживает. Решение: снапшоты.

## Dashboard: стоп-точка (2026-07-31)

DashboardNew — единственная страница, которую **нельзя мигрировать на InstantDB напрямую**. Проблема: 33 запроса с `SUM`, `COUNT`, `GROUP BY` и date-range фильтрацией (`gte( opened_at, ...) `). InstantDB возвращает только сырые строки — серверной агрегации нет.

### Рассмотренные варианты:

| # | Подход | Вердикт |
|---|--------|---------|
| 1 | Клиентская агрегация (все строки → filter → reduce) | ❌ Не масштабируется: 10,000+ строк на каждый рендер |
| 2 | Снапшоты: cron-скрипт считает KPI → пишет 1 строку в InstantDB | ✅ Правильная архитектура, но требует Supabase как compute-слой |
| 3 | Оставить дашборд на Supabase как есть | ⚠️ Практично сейчас. 1 страница из 26. |

### Решение: оставить DashboardNew на Supabase.
Это не провал миграции — дашборду объективно нужен SQL для агрегации. 8 страниц (CRUD, списки, редактирование) полностью на InstantDB и работают реактивно без polling. Это правильное разделение: операционка → reactive DB, аналитика → SQL.

## Next Steps (обновлено)

1. ~~Menu (dishes list)~~ ✅
2. ~~Checks~~ ✅
3. ~~Ingredients~~ ✅
4. ~~Staff~~ ✅
5. ~~DishEdit~~ ✅
6. ~~Cash Shifts~~ ✅
7. ~~Transactions~~ ✅
8. **FloorPlan** — последняя немигрированная страница. Write-мутации для zones/tables.
9. **Dashboard** — оставить на Supabase (см. выше).
10. **Удалить Supabase-зависимости** — убрать `lib/supabase.ts` отовсюду кроме Dashboard и Auth.
11. **Restore permissions** — proper auth rules before production.
## Quick Start

```bash
# Start dev server
pnpm --filter @lumo/admin dev

# Open test page
open http://localhost:5173/instant-test

# Seed a new client from Poster
pnpm --filter @lumo/data seed:poster -- <slug> "<name>" <poster_account> "<poster_token>"

# Seed template client
pnpm --filter @lumo/data seed:client -- <slug> "<name>"
```
