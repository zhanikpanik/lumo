# Журнал `cash_transactions` (POS ↔ админка)

## Источник правды

Админка использует `public.cash_transactions` как журнал прихода/расхода/инкассации по заведению и по смене:

- **`/cash-shifts`** — разворот смены: суммы «Приход», «Расход», «Инкассация» считаются по строкам с `shift_id` текущей смены; для сумм, влияющих на наличные в ящике, учитываются только строки с **`payment_method = 'cash'`** (как в POS RPC).
- **`/transactions`** — список по `venue_id`; колонка «Смена» — по `shift_id` (сопоставление с `shifts` на клиенте через `useShifts` / `matchShiftIdForTimestamp` при ручном добавлении).

## Типы (`type`)

Совпадают с POS:

| `type`       | Значение                          |
|-------------|-----------------------------------|
| `income`    | внесение в кассу (float in)     |
| `expense`   | вынос из кассы (не инкассация)  |
| `collection`| инкассация                       |

Старые или иные значения в данных не распознаются фильтрами UI — их нужно согласовать на стороне POS или миграцией данных.

## Ожидаемые наличные по смене

В `useShiftsData`: если POS заполнил `expected_cash_at_close`, показывается он; иначе расчёт:

`starting_cash + cash_total +` (сумма по журналу для смены: `income` − `expense` − `collection`, только `payment_method = 'cash'`).

Поля `shifts` (`counted_cash`, `cash_difference_at_close`, и т.д.) остаются для сводки закрытия; колонка «Инкассация» в списке смен предпочитает **сумму `collection` из журнала**, при отсутствии строк — `cash_collections_total`.

## Запись из POS

Ожидаются SECURITY DEFINER RPC (anon/authenticated): `pos_record_cash_transaction` (`in` → `income`, `out` → `expense`), `pos_record_cash_collection` → `collection`; для перечисленных операций — `payment_method = 'cash'`.

Проверка после внесения в POS:

```sql
select * from cash_transactions
where shift_id = '<uuid смены>' and type = 'income'
order by transaction_at desc;
```

## Расхождение схемы в проде

Если таблица уже была создана с другой схемой, миграция с `CREATE TABLE IF NOT EXISTS` могла её не изменить. Нужна ручная сверка колонок и типов с актуальной схемой POS (в т.ч. `shift_id` uuid, `category_id`, ограничения на `type` / `payment_method`).

В репозитории есть устаревший черновик `supabase_cash_transactions.sql` (например, `shift_id` как integer) — **не считать его источником правды** для прод-схемы; ориентир — миграции POS и живая БД.
