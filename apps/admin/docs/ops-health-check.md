# Ops Health Check

Короткий регламент после обновлений POS/админки.

## 1) SQL smoke-check (2-3 минуты)

Открой Supabase SQL Editor и выполни файл:

- `supabase/smoke_checks/admin_health_check.sql`

Ожидаемый результат:

- все ключевые функции/таблицы существуют;
- `anon_can_execute = false` для `finalize_order_consumption`;
- все счетчики `*_without_warehouse = 0`;
- `duplicate_recipe_pairs = 0`;
- `positive_sale_or_waste = 0`, `null_keys = 0`, `null_line_keys = 0`.

Если что-то не ноль:

- `*_without_warehouse` -> проверить/прогнать backfill migration;
- `duplicate_recipe_pairs` -> дедуп `recipe_items` и проверить импорт;
- `null_keys`/`null_line_keys` -> проверить логику записи в `inventory_movements`.

## 2) UI-check (1-2 минуты)

1. В POS создать чек с 1-2 блюдами (минимум одно с модификатором) и закрыть.
2. В админке проверить:
   - `Ingredients`: изменились остатки по использованным ингредиентам;
   - `Inventory`: колонки движений (`Расход`, и т.д.) отражают изменения в ожидаемом окне.

## 3) Retry-check (идемпотентность)

Повтори close/retry на одном и том же чеке (или имитируй сетевой ретрай).

Ожидаемо:

- нет `23505` по `inventory_movements_line_idempotency_key_key`;
- нет двойного списания остатков.
