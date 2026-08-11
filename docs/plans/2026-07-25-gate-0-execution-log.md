# Gate 0 Execution Log — 2026-07-25

## Что сделано

Выполнен Mandatory Gate 0 из `docs/plans/2026-07-25-instantdb-next-session-handoff.md`: полный migration ledger для перехода с Supabase на InstantDB.

## Шаг 1: Корректировка плана

Перед выполнением Gate 0 план был скорректирован в двух документах:

- `docs/plans/2026-07-25-instantdb-transition-design.md` (§Database Interaction Migration Ledger)
- `docs/plans/2026-07-25-instantdb-next-session-handoff.md` (§Mandatory Gate 0)

**Что исправлено:**

1. Supabase migrations, `schema.sql` и seeds теперь явно считаются историческими comparison inputs, не источником истины
2. Gate 0 начинается со свежего deployed Supabase dump — миграции на диске могут содержать one-off repair, mock-data changes и superseded definitions
3. Добавлен отдельный Supabase artifact register с диспозициями: `CURRENT`, `SUPERSEDED`, `SEED`, `ONE_OFF`, `DROP`
4. `CREATE OR REPLACE` цепочки сворачиваются до последнего deployed definition
5. Hardcoded repairs (`fix_workshop_id_null.sql`, `retry_dead_letters.sql`) не портируются механически
6. Gate 0 теперь требует ноль unresolved ledger rows И ноль unclassified artifacts
7. Policies/grants переносятся как access invariants через deny-by-default Instant permissions

**Обнаруженные проблемы при корректировке:**

- `supabase/schema.sql` неполный: нет `inventory_movements`, `pos_order_stock_settlements`, `order_sale_consumption_batches`, `workshop_warehouses`, `venue_order_counters`, SQL функций и триггеров
- `fix_workshop_id_null.sql` и `retry_dead_letters.sql` — не timestamped, с захардкоженными venue UUID, рассчитаны на SQL Editor
- `20260331000002_output_weight.sql` — добавляет колонку, но обновляет именованные блюда хардкодом; потребителей `output_weight` не найдено
- `20260407000001_revert_tables_20.sql` — удаляет таблицы по фиксированным UUID и возвращает grid конкретной zone

## Шаг 2: Параллельное исследование (5 scouts)

Запущено 5 read-only scout subagents:

| Scout | Область | Результат |
|---|---|---|
| `PosSupabaseCallsites` | `~/r_keeper/src/` — все `.from()`, `.rpc()`, `.channel()` | 58 взаимодействий в 13 файлах |
| `PosSqliteSchema` | `~/r_keeper/src/db/` — SQLite схема и outbox паттерны | 5 таблиц, 10 CRUD операций |
| `AdminSupabaseCallsites` | `~/r_keeper-admin/src/` — все Supabase вызовы | ~130 взаимодействий в 19 файлах + 3 скриптах |
| `SupabaseSqlArtifacts` | `~/r_keeper-admin/supabase/` — миграции, сиды, конфиг | 95 timestamped миграций, полный каталог функций/триггеров/политик/idempotency |
| `AdminSqlDeepDive` | `~/r_keeper-admin/supabase/` — глубокий разбор функций и триггеров | Репозиторный каталог функций, триггеров и RLS политик |

Прямое исследование мной:

- `src/db/database.ts` — SQLite schema v3: 5 таблиц (schema_version, order_outbox, catalog, local_orders, consumption_outbox)
- `src/store/syncOutboxStore.ts` — consumption outbox с escalation thresholds (6 retries, 5-min staleness)
- `~/r_keeper-admin/supabase/` — обнаружены admin-специфичные миграции (202605–202606), отсутствующие в POS repo
- `supabase/functions/` — пусто, Edge Functions нет ни в одном репозитории
- Linked Supabase проверен напрямую: `npx supabase migration list --linked` подтвердил 95/95 timestamped migrations без local/remote mismatch
- Снят свежий remote dump: `npx supabase db dump --linked --schema public`; фактически deployed: 49 таблиц, 41 функция, 3 row triggers, 118 policies
- Обнаружен deployed drift: `public.rls_auto_enable()` есть в remote schema, отсутствует в migrations; активный event trigger в public dump отсутствует. Добавлены A77/L78; решение DROP подтверждено 2026-07-28

## Шаг 3: Построение артефакт-регистра

98 записей, каждая с полями: Artifact, Kind, Deployed?, Disposition, Linked Ledger Rows, Reason.

**Ключевые находки:**

- 41 финальная deployed SQL функция
- 3 триггера: `trg_zones_updated_at`, `trg_sync_cash_movements_from_payments`, `after_venue_insert_seed_default_ops`
- 8 enum'ов: user_role, product_type, order_status, payment_method, fiscal_status, inventory_movement_reason, cash_movement_type, order_event_action
- 18 idempotency/unique constraints
- 118 deployed RLS policies
- 10+ demo/seed функций (demo_clean_venue, demo_gen_orders, demo_scale_to_1m, demo_heal_data, demo_shift_dates, demo_backfill_inventory_movements) — все SEED
- 3 manual SQL скрипта — ONE_OFF
- `pos_finalize_order_stock` переопределялась 6 раз (v1→v6), цепочка задокументирована

## Шаг 4: Построение behavior ledger

78 строк по 11 доменам:

| Домен | Строки | Ключевые решения |
|---|---|---|
| Auth & Tenancy | L1–L3 | REPLACE: device activation + PIN |
| Venue Configuration | L4–L5 | MIGRATE |
| Floor Plan | L6–L7 | MIGRATE |
| Catalog (Menu) | L8–L13 | MIGRATE: offline-first с fingerprint |
| Shift Management | L14–L18 | MIGRATE: open/close/re-attach |
| Order Lifecycle | L19–L26 | MIGRATE: create/update/delete/sync; REPLACE: diff-merge → single-writer |
| Order Events | L27–L29 | MIGRATE: item_added/removed, precheck, paid/cancelled |
| Payment Processing | L30–L32 | REPLACE: split flow → атомарный `payOrder` |
| Inventory & Stock | L33–L38 | REPLACE: RPC-based → встроен в payOrder; dead letters → admin recovery UI |
| Refunds | L39–L40 | REPLACE: RPC-based → typed transactions |
| Cash Management | L41–L48 | MIGRATE: shift cash summary, collections, transactions, close; REPLACE: trigger → explicit |
| Warehouse Admin | L49–L59 | MIGRATE: deliveries, writeoffs, transfers, inventory, stock via typed commands |
| Admin Dashboard | L60–L62 | MIGRATE: dashboard queries, analytics, top items |
| Marketplace | L63–L69 | DROP: весь marketplace pipeline для первого cutover |
| Notifications | L70 | REPLACE: channel → live query |
| POS SQLite | L71–L74 | REPLACE: outbox → InstantDB offline sync |
| SQL Side Effects | L75–L78 | MIGRATE: zones trigger; REPLACE: RLS → deny-by-default perms; DROP requiring confirmation: orphaned deployed `rls_auto_enable()` |

## Шаг 5: Command/query map

Из ledger выведен полный typed API для `@rkeeper/data`:

- **Commands:** 52 штуки — activateDevice, openShift, createOrder, addOrderLine, payOrder, refundOrder, recordCashCollection, createDelivery, processDelivery, createInventorySession, postInventory, и т.д.
- **Queries:** 35 штук — queryVenue, queryActiveOrders, queryShiftCashSummary, queryStockItems, queryDashboardMetrics, queryWarehouses, queryTopItems, и т.д.
- **Live Queries:** orders, order_items, notifications — через InstantDB, без явных channel subscriptions

## Шаг 6: Coverage proof

| Источник | Охват |
|---|---|
| POS stores (9 файлов) | 28 .from() |
| POS API (4 файла) | 11 .rpc(), 2 .from() |
| POS hooks (1 файл) | 2 .channel(), 2 .removeChannel() |
| POS screens (1 файл) | 2 .from().insert() |
| POS SQLite (1 файл) | 5 таблиц, 10 CRUD |
| Admin hooks (20 файлов) | ~95 .from(), 6 .rpc() |
| Admin pages (7 файлов) | ~30 .from() |
| Admin lib (2 файла) | 2 .from(), 1 .rpc() |
| Admin auth (1 файл) | 4 supabase.auth.* |
| Admin scripts (3 файла) | 3 .rpc() |
| Supabase SQL (95 timestamped migrations, 95/95 matched remotely) | 49 deployed tables, 41 functions, 3 row triggers, 118 policies, 8 enum'ов, 18 constraints |
| Supabase seeds (3 файла) | 3 seed артефакта |
| Supabase smoke (1 файл) | 1 smoke check |
| Manual SQL (3 файла) | 3 manual скрипта |

**Итого: 0 unresolved rows, 0 unclassified artifacts.**

## Product Confirmations Closed — 2026-07-28

Подтверждены все 23 `REPLACE` и 8 `DROP` решений:

1. Marketplace pipeline не входит в первый cutover.
2. Device-bound venue authorization + employee PIN заменяют текущую auth/RLS модель.
3. `payOrder` атомарно объединяет payment, order transition, cash, inventory и event; refunds — compensating commands.
4. InstantDB offline sync заменяет POS SQLite catalog/order/consumption caches и outboxes.
5. Deny-by-default Instant permissions заменяют Supabase RLS, `user_has_venue_access`; deployed-only `rls_auto_enable()` не переносится.

## Что НЕ делалось

- Не создавалась InstantDB schema
- Не перемещались репозитории
- Не менялся runtime-код
- Не удалялся Supabase код
