# Finish inventory (MVP) — revised sequencing

Копия плана для репозитория (удобно искать в проекте). Оригинал Cursor может лежать в `~/.cursor/plans/`.

## Todos (чеклист)

1. **consumption-logic** — Define & implement ingredient consumption for inventory period (`orders` × `order_items` × `recipe_items`, + when/how stock is updated).
2. **warehouse-movements-columns** — Aggregate Поступл./Списано (± transfers) from posted deliveries/write-offs/transfers for chosen workshop + period to feed counting rows.
3. **counting-table-wire-columns** — Keep full counting grid; wire incoming/consumption/writeoff + consistent «план» math once data exists; persist optional breakdown if needed.
4. **partial-picker-setup** — Partial-mode ingredient multi-select using `useIngredients`; filter `fetchIngredients` via `.in('id', …)`.
5. **invalidate-ingredients-post** — Invalidate `['ingredients']` in `usePostInventorySession` `onSuccess`.
6. **delete-session-no-reload** — Replace draft delete `window.location.reload()` with query invalidation + local state reset (optional).

---

## User decisions captured

1. **Поставки и списания уже есть** — страницы `/warehouse/deliveries` и `/warehouse/write-offs` и таблицы `warehouse_deliveries` / `warehouse_write_offs` (и строки) могут дать **Поступл.** и **Списано** после агрегации по складу (`workshop_id`) и **выбранному периоду** (например от даты прошлой проведённой инвентаризации до `conducted_at`, или фиксированное окно — зафиксировать в реализации).
2. **Сначала расход (consumption), потом «добивка» инвентаризации** — **фаза A обязательна перед** фазой B. Колонки **не выкидываем**: цель — **заполнить** Поступл./Расход/Списано осмысленными данными.

## Current gaps (unchanged facts)

- В `src/pages/Inventory.tsx` движения в строках сейчас **нули**; в БД в `warehouse_inventory_lines` нет отдельных полей под поступление/расход/списание — при необходимости либо считать на лету при открытии пересчёта, либо позже добавить колонки под снимок (отдельное решение при реализации).
- **`inventory_type: 'partial'`** сохраняется, но UI всё ещё грузит все ингредиенты склада.

---

## Phase A — Consumption («Расход») — делаем первым

**Цель:** чтобы «Расход» в листе инвентаризации отражал списание ингредиентов за период (обычно по продажам), а не заглушку.

**Данные в проекте (опора):**

- Продажи: `order_items` (см. `src/hooks/useChecksData.ts`).
- Техкарты: `recipe_items` (см. `src/hooks/useMenuData.ts`) — уточнить схему колонок в БД при реализации.

**Что нужно явно решить до кода:**

- **Только отчёт для экрана инвентаризации** (сумма расхода за период по закрытым/оплаченным заказам) **или** ещё и **списание со `stock_quantity`** в момент продажи/закрытия чека (двойной учёт с поставками/списаниями нужно согласовать).
- **Период:** совпадает с окном для поставок/списаний (например `[last_inventory_posted_at, conducted_at)`).
- **Какая мастер-сущность заказа** (`orders.status`, оплата) — взять ту же логику, что уже используется для выручки/чеков.

**Итог фазы A:** функция или RPC (предпочтительно на сервере) + вызов из `loadCountingRows` / общего загрузчика с параметрами `venue_id`, `workshop_id`, `from`, `to`.

---

## Phase B — Движения склада (Поступл./Списано, при необходимости перемещения)

**Поступление:** суммы по строкам **принятых** поставок, `workshop_id` = склад сессии, `product_id` = ингредиент, дата/время в периоде.

**Списание (документы):** суммы по **проведённым** списаниям, строки с `product_id`, тот же склад и период.

**Перемещения:** при posted `warehouse_transfers` — нетто в/из `workshop_id` (отдельная колонка или правило слияния с Поступл./Списано — зафиксировать в UX).

После фаз A+B пересчитать **учётный «план»** под выбранную модель. Если «остаток на начало периода» не хранится — временный MVP: текущий `stock_quantity` на открытии + движения как справочные колонки; явно подписать в UI.

---

## Phase C — Остальное из «finish inventory»

1. **Partial inventory** — мультивыбор ингредиентов на шаге настройки, `.in('id', …)`; валидация пустого списка.
2. **Инвалидация кэша** — `usePostInventorySession` → `invalidateQueries({ queryKey: ['ingredients'] })`.
3. **Удаление черновика** — без full reload, через `invalidateQueries` для списка инвентаризаций.

---

## Files (ожидаемо)

- `src/pages/Inventory.tsx`
- `src/hooks/useWarehouse.ts`
- `supabase/migrations/*.sql` — RPC расхода (фаза A) и при желании агрегаты движений (фаза B).

---

## Примечание про старую версию плана

Ранее предлагалось убрать колонки из-за вечных нулей. Сейчас план **сохраняет таблицу с движениями** и переносит приоритет на **расход и поставки/списания**, а не на упрощение до 5 колонок.
