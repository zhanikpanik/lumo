# Smoke Test Checklist (Single Device / Single Venue)

Run this checklist before demo/pilot handoff.

## Module index

The checklist is split into focused modules so you only prove what changed
for a given client / phase. Pick the modules that apply, prove them top-down.

| Module | When to run | File |
|---|---|---|
| **Takeaway core** | Точка на вынос (`venue_type='takeaway'`) — покрывает все базовые фичи (логин, смены, продукты, модификаторы, оплата, возвраты, инкассация, outbox, dead-letter, перезапуск). | [docs/smoke-test-takeaway.md](docs/smoke-test-takeaway.md) |
| **Restaurant delta** | Ресторан с залом (`venue_type='restaurant'`). Покрывает **только** разницу: столы, floor plan, привязка заказа к столу, счётчик гостей, сортировка по столам. Прогоняется **поверх** takeaway. | [docs/smoke-test-restaurant-delta.md](docs/smoke-test-restaurant-delta.md) |
| **Marketplace (Glovo, Yandex)** | venue с маркетплейсами. | sections P + Yandex 1A/1B + Marketplace UX in this file |
| **Printer integration** | После внедрения Electron + ESC/POS. | TBD: `docs/smoke-test-printer.md` |

### Coverage matrix (sections in this file → which module covers them)

| Section in this file | Covered by takeaway module | Covered by restaurant-delta module |
|---|---|---|
| A) Shift Gate | yes | — |
| B) Role Guards | yes | yes (recap on tables) |
| C) Order + Table Behavior | not applicable | **yes (primary scope)** |
| D) Shift Sync UX | yes | — |
| E) Restart Safety | yes | — |
| F) Regression Spot Check | yes | — |
| G) Inventory consumption | yes (via DB checks) | — |
| H) Payment Idempotency | yes | — |
| I) Outbox Triggers + Badge | yes | — |
| J) Modifier stock hardening | yes (UI + DB) | — |
| K) Unit CHECK constraints | DB-only, run once per env | — |
| L) Shift cash ledger | yes | — |
| M) Refund + cancel refund | yes | — |
| N) Dead-letter outbox | yes | — |
| O) Cash transactions | yes | — |
| P) Glovo inbound | — | — (marketplace-only) |
| Yandex 1A / 1B | — | — (marketplace-only) |
| Marketplace UX | — | — (marketplace-only) |

> Если клиент = только точка на вынос, нужен **только** takeaway-модуль.
> Если клиент = ресторан без маркетплейсов, нужен takeaway + restaurant-delta.
> Если клиент = ресторан с Glovo/Yandex, добавляется соответствующая секция.

## Setup

- Use two staff users:
  - `cashier` role
  - `waiter` role
- Ensure app starts from `Lock` screen.

---

## A) Shift Gate (Hard Block)

- Login with valid PIN when no shift is open -> app goes to `OpenShift`.
- Without opening shift, try navigating to POS routes (`Orders`, `Pos`, `Payment`, `PaidCheck`, `TablePicker`) -> app redirects to `OpenShift`.
- Open shift -> app can access `Orders`.

Expected: app is not usable for service without an open shift.

---

## B) Role Guards

### Waiter

- `Close shift` is disabled in Functions menu.
- In `Payment`, `Без оплаты` is disabled and hint appears.
- In `PaidCheck`, refund button is hidden.

### Cashier

- `Close shift` is available.
- In `Payment`, `Без оплаты` is available.
- In `PaidCheck`, refund button is available.

---

## C) Order + Table Behavior

- Create order on table -> table is occupied.
- Pay order (`paid`) -> table becomes free.
- Close without payment (`cancelled`, cashier only) -> table becomes free.
- Opening a new shift does not show previous shift's closed orders.

---

## D) Shift Sync UX

- During payment / shift updates, `Синхронизация...` badge appears briefly.
- On forced sync failure, top banner shows:
  - error text
  - `Повторить` button
  - `Закрыть` button
- `Повторить` clears the error when backend is available again.

---

## E) Restart Safety

- With open shift, restart app -> shift restores from persisted state.
- With no shift, restart app -> returns to `OpenShift` flow.

---

## F) Regression Spot Check

- Menu loads (no `modifier_groups.sort_order` error).
- Modifier panel opens for products with modifiers.
- PaidCheck shows payment method/reason details.
- No TypeScript/runtime red screen errors on core flow.

---

## G) Inventory consumption (sale finalize)

Prereq: migrations through `20260508121000_pos_warehouse_stock.sql`; seed `recipe_items`; kitchen/bar workshops with `**default_warehouse_id**` (`6002` / `6003` in dev seed from migration). See `[docs/pos-warehouse-stock.md](docs/pos-warehouse-stock.md)`.

- Pay order (cash or card) → `pos_finalize_order_stock` runs (via app); `inventory_movements` has `reason = sale`, negative `quantity_delta`, metadata includes `"rpc":"pos_finalize_order_stock"`.
- `**pos_order_stock_settlements**` has one row per paid order (`order_id` PK).
- Kitchen dish → ingredient deltas use **kitchen** warehouse only; bar dish → **bar** warehouse only (compare `inventory_movements.warehouse_id` to `00000000-0000-0000-0000-000000006002` vs `6003`).
- Replay `pos_finalize_order_stock` with same `order_id` → `duplicate: true`; `stock_items` quantities unchanged.
- With low stock and `p_strict_insufficient=true`, expect `insufficient_stock` and **no** settlement row / no stock change.
- Airplane mode / outbox: second sync does not double-deduct (same replay check).
- Close without payment (`cancelled`) → no settlement row for that order.

---

## H) Payment Idempotency

Prereq: migration `20260512000000_payments_idempotency.sql` applied; `payments` has `idempotency_key` column with unique index `payments_idempotency_key_venue_uidx`.

- **Double tap**: add items, go to Payment, rapidly tap "Оплатить" twice → only **one** row in `payments` for this order; `shifts.cash_total` incremented once.
  ```sql
  select id, amount, idempotency_key from payments where order_id = '<order_id>';
  ```
- **Network retry**: tap "Оплатить" → kill network (DevTools offline) → re-enable network → tap "Оплатить" again → still one `payments` row; app navigates to Orders normally.
- **Refund + re-pay**: refund a paid check via PaidCheck → open same order again → new payment succeeds (different `paymentAttemptId`, new idempotency key).
- **Button lock**: while payment is processing, "Оплатить" and "Отмена" buttons show disabled state and label changes to "Обработка..." / "Закрываем...".

---

## I) Outbox Triggers and UI Badge

- **Offline enqueue**: airplane mode → pay order → yellow banner appears: "Необсчитанных операций склада: 1. Нажмите для повтора".
- **Tap retry**: tap the banner → `flush()` fires; if network restored, banner disappears.
- **Stale escalation**: with event in outbox older than 5 minutes, banner turns red: "Очередь застряла: N. Нажмите для повтора".
- **Foreground trigger**: switch to another tab/app and back → `flush()` fires (check console for `[outbox.flush.retry]` if event is pending).
- **Interval trigger**: stay on app for >60 seconds with pending event → `flush()` fires automatically.
- **Post-payment flush**: after successful payment, any previously queued outbox events are flushed immediately (no need to wait for interval/foreground).

---

## J) Modifier stock hardening (server source of truth)

Prereq: migration `20260511153000_pos_modifier_hardening.sql` applied.

- For paid order with modifiers, `pos_finalize_order_stock` deducts modifier ingredients based on `order_item_modifiers` (not only client payload).
- If the same modifier is duplicated for one `order_item_id`, stock deduction is not duplicated (`DISTINCT` by modifier).
- If `order_item_modifiers` contains modifier not linked to product/venue, RPC returns `invalid_order_item_modifiers` and no stock updates.
- `inventory_movements` for modifier lines keep `source = modifier` and line key format `...:m:<modifier_id>`.

---

## K) Unit CHECK constraints

Prereq: migration `20260511154000_unit_check_constraints.sql` applied.

- `recipe_items.unit`, `modifiers.unit`, `stock_items.unit`, `inventory_movements.unit` accept only: `г`, `кг`, `мл`, `л`, `шт`.
- Aliases (`g`, `ml`, `pcs`, empty) are normalized by migration to canonical values.
- Insert/update with invalid unit (e.g. `box`) fails with CHECK violation.
- Existing POS sale finalize path still works with canonical units after migration.

---

## L) Shift cash ledger / expected / collection

Prereq: migration `20260511155000_shift_cash_ledger.sql` applied.

- On cash payment insert, `cash_movements` gets `sale` row (via trigger), and on cash refund it gets `refund` row.
- Functions menu has `Инкассация`; adding collection creates `cash_movements` row with `movement_type = collection`.
- `ShiftInfo` and `CloseShift` show server-calculated expected cash (`pos_shift_cash_summary`), not only local `starting + cashTotal`.
- Closing shift calls server RPC `pos_close_shift`; `shifts.expected_cash_at_close`, `shifts.cash_difference_at_close`, `shifts.counted_cash` are persisted.
- Manual SQL sanity:
  ```sql
  select movement_type, amount, payment_id, shift_id
  from cash_movements
  where shift_id = '<shift_id>'
  order by occurred_at desc;
  ```

---

## M) Refund + cancel refund

Prereq: migrations through `20260512100000_pos_refund_cancel.sql` applied; `POS_REFUND_RPC_ENABLED = true`; logged in user is `cashier`/`manager`/`owner` (not `waiter`).

### Full refund (no UI change vs prior)

- Open a paid order from PaidCheck → tap "Возврат" → confirm.
- Order moves back to PaidCheck list with badge "Возврат" (orange) and chip on the row.
- DB: `payments.refunded_at IS NOT NULL`, `pos_order_refunds` row exists with snapshot fields filled (`order_total_amount`, `items_count`, `items_signature`).
- DB: shift totals decreased; for cash refund `cash_movements` got a `refund` row.
- `inventory_movements` gained `reason='refund'`, `ref_type='order_refund'` rows; `stock_items` quantities restored.

### Cancel refund (re-undo)

- Select the refunded order in PaidCheck → "Отменить возврат" button is visible. Tap → confirm.
- Order goes back to `paid`; badge becomes "Оплачен"; refund chip disappears from the list row; `pos_order_refunds.cancelled_at IS NOT NULL`.
- `payments.refunded_at = NULL`; for cash refund cancel, the `refund` row in `cash_movements` is removed by trigger.
- Shift totals restored; `cash_movements` does NOT get any `refund` row left over.
- `inventory_movements` gained `reason='refund_cancel'` rows (one per refund row) that cancel out refund deltas; `stock_items` quantities back to post-sale state.
- `pos_order_stock_settlements` for this order is restored so a re-finalize is a no-op (`duplicate: true`).

### Cancel refund guardrails

- After refund, edit the order in admin (change a position) and try Cancel: RPC returns `order_items_changed_after_refund`; UI shows the Russian message and the order stays in `active`.
- As `waiter` user (or no `actor_user_id`) attempting cancel returns `actor_forbidden_role` (admin-side test); UI surfaces "Недостаточно прав".
- After shift close, cancel returns `shift_not_open`.

### Legacy fallback removed

- In `PaidCheckScreen` there is no direct `delete from payments` / `update orders status='active'` path when refund RPC returns errors. Errors map to user-friendly messages instead.

---

## N) Dead-letter outbox

Prereq: migration `20260512110000_consumption_dead_letters.sql` applied.

### Setup a failing event

- Pick a paid order, manually corrupt its recipe in admin so `pos_finalize_order_stock` returns a non-transient error (e.g. `insufficient_stock` with strict on), or set network offline to keep the event stuck.
- Trigger sale finalize so the event lands in the local outbox.

### Escalation

- Within ~30s the local retry counter reaches `MAX_RETRIES (6)` or after 5 minutes wall-clock the event is dropped from the local queue and **inserted into `pos_consumption_dead_letters`** with `status='open'`.
  ```sql
  select idempotency_key, retries, last_error, status, last_seen_at
  from pos_consumption_dead_letters
  order by last_seen_at desc;
  ```
- Red banner appears in the app: `Требуется внимание: N зависших операций склада. Открыть.`.

### Modal interactions

- Tap the banner → `DeadLetterModal` opens; list contains the failing event with order tail, retries count, last error and idempotency key.
- Press "Повторить":
  - If the underlying cause is fixed (recipe restored / network online) → row disappears from list, `pos_consumption_dead_letters.status = 'resolved'`, `pos_finalize_order_stock` actually deducted stock and inserted `pos_order_stock_settlements` (`select ... from pos_order_stock_settlements where order_id = '<id>'`).
  - If still broken → row stays but `retries` increments and `last_error` updates.
- Press "Решено вручную" → row disappears from list, `status='acknowledged'`, `resolved_by` set to current user.

### Visibility across devices

- Same dead-letter shows up on another POS device after refresh (`pos_consumption_dead_letters` is server-side, not per-device).
- Resolving / acking on one device removes the banner from the other on next refresh.

### Local queue cleanup

- After escalation, the local outbox no longer contains the escalated event (no yellow banner reappears for the same order between flushes).

---

## O) Cash transactions (float_in / float_out)

Prereq: migration `20260513000000_pos_cash_transactions.sql` applied; logged in as `cashier`/`manager`/`owner` (`waiter` is blocked).

### Внесение (float_in)

- Открыть FunctionsModal → пункт «Внесение в кассу» доступен (не задизейблен).
- Ввести сумму (например, 500) и подтвердить.
- `cash_movements` пополняется строкой `movement_type='float_in'`, `payment_id IS NULL`, `order_id IS NULL`.
  ```sql
  select movement_type, amount, note, payment_id, order_id
  from cash_movements
  where shift_id = '<shift_id>'
  order by occurred_at desc
  limit 5;
  ```
- `expected_cash` в `ShiftInfo` и `CloseShift` вырос на эту сумму. `ShiftInfo` показывает обновлённую строку «Внесения».
- `Shift.cashFloatIn` в стейте увеличился (виден в ShiftInfo).

### Изъятие (float_out) — успех

- Снять сумму меньше, чем `expected_cash`. `cash_movements` получает `float_out`, `expected_cash` уменьшается. `ShiftInfo` отражает «Изъятия».

### Изъятие — блокировка

- Ввести сумму больше доступной налички → Alert «Недостаточно наличных. Доступно: X ₽…». В `cash_movements` строки не появилось.
- Прямой вызов RPC возвращает `{ ok:false, error:'insufficient_cash', detail:{ available, requested } }`.

### Smena / роли / закрытая смена

- Под `waiter`-аккаунтом пункты «Внесение в кассу» / «Изъятие из кассы» в FunctionsModal задизейблены.
- Прямой вызов RPC с `p_actor_user_id` waiter-а возвращает `actor_forbidden_role`.
- После закрытия смены попытка ещё одной транзакции через RPC возвращает `shift_not_open`.
- `invalid_amount` для нуля / отрицательного значения; `invalid_kind` для произвольной строки.

### Close Shift

- CloseShift показывает строки «Внесения» и «Изъятия» с актуальными суммами.
- `shifts.expected_cash_at_close` совпадает с расчётом (starting_cash + cash_sales + float_in − refunds − collections − float_out).
- После закрытия смены строки `float_in` / `float_out` остаются в `cash_movements` (никакой очистки).

---

## P) Glovo inbound phase1 (webhook -> POS)

Prereq:

- migration `20260513010000_glovo_inbound_phase1.sql` applied;
- edge function `glovo-inbound` deployed;
- secret `GLOVO_WEBHOOK_TOKEN` set;
- table `marketplace_store_bindings` contains `(provider='glovo', external_store_id, venue_id, enabled=true)`.

### Auth and ingress

- POST without correct `Authorization` header returns `401 unauthorized`.
- POST with valid token accepts payload and writes raw event into `marketplace_inbound_events`.

### Dispatched event

- Send sample `order_dispatched` payload with `order_id`, `store_id`, `products[]`.
- Verify:
  - one row appears in `marketplace_inbound_events` with `event_type='order_dispatched'`,
  - matching row appears/updates in `orders` with:
    - `order_source='glovo'`,
    - `external_order_id=<payload.order_id>`,
    - `status='active'`,
    - `integration_metadata.provider='glovo'`.
- Verify order appears in POS order list with `Glovo` badge.
- Verify `order_items` created only for mapped products (`products.external_id` + `external_source='glovo'`), unmapped ids are captured in `orders.integration_metadata.unmapped_products`.

### Cancelled event

- Send sample `order_cancelled` payload for existing Glovo order.
- Verify:
  - `orders.status='cancelled'`,
  - `orders.closed_at` is set,
  - cancellation details persisted in `orders.integration_metadata.cancellation`.
- Verify event row has `processed_at` and `linked_order_id`.

### Idempotency and dedupe

- Re-send same dispatched payload with same order id.
- Verify no duplicate order rows are created (`orders_venue_source_external_uidx` protects this).
- Re-send same event with same derived external event id.
- Verify webhook returns duplicate result and no duplicated inbound processing rows.

### Unknown binding and operational visibility

- Send payload with unknown `store_id`.
- Verify function returns accepted warning (`unknown_store_binding`), event is logged with `processing_error='unknown_store_binding'`, and order is not created.

### Authorization hardening

- Send dispatched payload with `Authorization: Bearer <token>` (no plain) — must return `200`.
- Send dispatched payload with token of identical length but different bytes — must return `401`.
- Send dispatched payload without `Authorization` header — must return `401`.

### Retry after processing_error

- Force first delivery to fail (e.g. send dispatched for a `store_id` without a binding, so event lands with `processing_error='unknown_store_binding'` and `linked_order_id=null`).
- Add the missing binding (or fix whatever caused the prior failure).
- Re-send the **same** payload (same derived `external_event_id`).
- Verify the response contains `retried: true`, the order is now created, and the existing event row updates: `processing_error=null`, `linked_order_id` populated, `venue_id` set.
- Re-send the same payload one more time — must return `{"duplicate": true}` and NOT re-process.

### Marketplace tables are not exposed to anon

- From `psql` as `anon`: `select 1 from marketplace_store_bindings limit 1;` and same for `marketplace_inbound_events`.
- Both queries must fail with `permission denied for table ...`.
- Edge function still works because it runs under `service_role` (RLS bypass).

### Auto-paid lifecycle (Glovo settles payment externally)

- Open a shift, register an ingredient + recipe + stock_item for a product mapped via `external_source='glovo'`.
- Send `order_dispatched`. Verify:
  - `orders.status='paid'`, `closed_at` is set, `integration_metadata.auto_paid=true`.
  - A `payments` row exists with `method='other'`, `idempotency_key='glovo:<external_order_id>'`, `amount = order total`.
  - `stock_items` decremented per recipe; an `inventory_movements` row with `reason='sale'`, negative `quantity_delta`.
  - `cash_movements` has **no** new entry (Glovo `method='other'` must not inflate cash totals).
  - Response body includes `auto_paid: true`, `payment_inserted: true`, `stock_settlement.ok: true`.
- Resend the same `order_dispatched` payload — response `{"duplicate": true}`, no double payment, no extra stock movement.
- Send `order_cancelled` while the shift is **open**. Verify:
  - Response includes `refund_attempted: true`, `refund_error: null`.
  - `orders.status='cancelled'`, `closed_at` updated, `integration_metadata.last_event='order_cancelled'`.
  - Payment row has `refunded_at` set and `refund_reason='glovo:<reason>'`.
  - `stock_items` restored; new `inventory_movements` row with `reason='refund'` and positive `quantity_delta`.

### Auto-paid cancellation when shift is already closed

- Dispatch an order, then close the shift, then send `order_cancelled`.
- Response must include `refund_error: "shift_not_open"`, `refund_attempted: true`.
- Order stays `status='paid'` (refund did not happen), `integration_metadata.cancellation_pending=true`, `cancellation_error='shift_not_open'`.
- `marketplace_inbound_events.processing_error='refund:shift_not_open'` for the cancel event.
- Operator follow-up: refund manually via POS in the next shift, or via DB if needed.
- `pos_shift_cash_summary(p_venue_id, p_shift_id)` must report `external_pending_count >= 1` for the affected shift, so close-shift UI can warn before sealing the day.

### Glovo attribute → modifier binding

- For each Glovo product attribute that should consume real inventory, add a row to `marketplace_modifier_bindings (venue_id, provider='glovo', external_modifier_id, modifier_id)` and make sure the same `modifier_id` is attached to the product via `product_modifier_groups` (otherwise the binding is ignored on purpose).
- Dispatch an order with a mapped attribute → `order_item_modifiers.modifier_id` must be filled in (not NULL) and `pos_finalize_order_stock` must succeed without `invalid_order_item_modifiers`.
- Dispatch an order with an *unknown* attribute id → row is still inserted (`modifier_id=NULL`), but the external id lands in `orders.integration_metadata.unmapped_attributes` and `requires_review=true`.
- Dispatch an order with a mapped attribute that is **not linked to the product's modifier groups** → edge function downgrades it to `modifier_id=NULL` and adds the id to `unmapped_attributes` (we do not let it crash finalize stock).

### Race-safe order numbering

- Reset `venue_order_counters.last_number=0` for a test venue.
- Send two dispatch payloads back-to-back (different `external_order_id`).
- Verify both `orders.number` values are sequential (`1` and `2`), no duplicates, and `venue_order_counters.last_number` advanced by 2.
- Optional load test: fire 20 dispatches with `xargs -P 10` and confirm 20 distinct numbers.

### Operator-facing logs

- Tail edge function logs while sending a payload that throws (e.g. unknown payload shape, broken JSON in a field that we cast).
- A `[glovo-inbound] processing_failed` line must appear with `event_id`, `external_event_id`, `external_order_id`, `external_store_id`, `event_type`, `error` keys.
- The HTTP response must include `event_id` so the support flow can correlate Supabase logs with the failed delivery.

### SQL snippets

```sql
select provider, event_type, external_order_id, received_at, processed_at, processing_error, linked_order_id
from marketplace_inbound_events
order by received_at desc
limit 20;
```

```sql
select id, number, status, order_source, external_order_id, integration_metadata
from orders
where order_source = 'glovo'
order by opened_at desc
limit 20;
```

---

## Yandex Eda Phase 1A (menu-only)

### OAuth token issuance

- `POST /functions/v1/yandex-eda/security/oauth/token` with `application/x-www-form-urlencoded` body `client_id=<id>&client_secret=<secret>&grant_type=client_credentials&scope=read` returns `200` and `{ access_token, token_type: "Bearer", expires_in: 3600, scope: "read" }`.
- Same call with the wrong secret returns `400 { error: "invalid_client" }`.
- A `grant_type` other than `client_credentials` returns `400 { error: "unsupported_grant_type" }`.
- Disabled clients (`marketplace_api_clients.enabled=false`) return `400 invalid_client` even with the correct secret.

### Bearer auth on protected routes

- Calling any of `/restaurants`, `/menu/{id}/composition`, etc. without `Authorization` returns `401 { reason: "Authorization header is missing" }`.
- Calling with a token that does not exist in `marketplace_access_tokens` returns `401 { reason: "Access token has been expired. ..." }`.
- Manually set `expires_at = now() - interval '1 minute'` on a known `token_hash`; the next request with that token returns the same 401.
- Stripped/garbled `Authorization` headers (no `Bearer` prefix, empty value, only whitespace) return 401 — the bearer parser tolerates missing prefix but the token must still match an active row.

### Restaurants scoping

- Create two organizations A and B, each with one venue and a `marketplace_store_bindings (provider='yandex_eda')` row.
- Token issued for A's client must list **only** A's venue in `GET /restaurants` and `GET /restaurants/availability`.
- Disable A's binding (`enabled=false`). `GET /restaurants` no longer returns it; `GET /restaurants/availability` still returns it but with `enabled: false`.

### Menu composition contract

- `GET /menu/{external_store_id}/composition` with a valid bearer returns `200` and `Content-Type: application/vnd.eats.menu.composition.v2+json`.
- Response shape: `{ categories: [...], items: [...] }`.
- Only `products` with `type='dish'`, `is_active=true`, `price > 0` appear in `items`.
- `is_active=false` on a category hides the category, and any items in it fall back to having `categoryId` reference but the category disappears from the `categories` array.
- Items with at least one `product_modifier_groups` linkage include a `modifierGroups[]` array with `id`, `name`, `minSelectedModifiers`, `maxSelectedModifiers`, and `modifiers[]` (only `is_active=true` modifiers).
- Unknown `restaurantId` returns `404 { reason: "Restaurant not found" }`.
- Token from a different organization cannot read another organization's menu — returns `404 Restaurant not found` (no leakage of existence).

### Availability + promos baselines

- `GET /menu/{id}/availability` returns `200` with `Content-Type: application/vnd.eats.menu.availability.v2+json` and body `{ items: [], modifiers: [] }`.
- `GET /menu/{id}/promos` returns `200 { promos: [] }`.

### Token cleanup

- Call `select marketplace_cleanup_access_tokens();` while at least one expired token row exists → returns the deleted count; expired rows disappear from `marketplace_access_tokens`.
- After issuing a new token, verify that any rows older than `now() - interval '1 day'` were dropped by the opportunistic cleanup in `marketplace_yandex_issue_token`.
- On environments where `pg_cron` is enabled, confirm a job named `marketplace_cleanup_access_tokens` exists in `cron.job` with schedule `*/15 * * * `*.

### Method/route discipline

- `GET /security/oauth/token` returns `405 { reason: "Method not allowed" }` with `Allow: GET, POST`.
- `POST /restaurants` (or any other non-OAuth route) returns `405`.
- Unknown paths return `404 { reason: "Route not found" }`.

### SQL snippets

```sql
select id, provider, client_id, enabled, created_at, organization_id
from marketplace_api_clients
order by created_at desc;
```

```sql
select token_hash, client_uuid, scopes, issued_at, expires_at
from marketplace_access_tokens
order by issued_at desc
limit 10;
```

---

## Yandex Eda Phase 1B (order intake)

Run all of these with a bearer token issued for a client whose `scopes` array contains both `read` and `write`. Tokens with only `read` should be rejected on every mutating route below with `401 { reason: "insufficient_scope" }`.

### POST /order — CARD payment

- Send `POST /functions/v1/yandex-eda/order` with body `{ eatsId, restaurantId, paymentType: "CARD", items: [...] }`.
- Response is `200`, `Content-Type: application/vnd.eats.order.v2+json`, body echoes the payload with `status: "ACCEPTED_BY_RESTAURANT"`.
- DB:
  - `orders.status = 'paid'`, `closed_at IS NOT NULL`, `order_source = 'yandex_eda'`, `external_order_id = eatsId`.
  - `payments` row with `method='other'`, `amount = sum of items.price*qty + modifiers.price*qty`, `idempotency_key='yandex_eda:<eatsId>'`.
  - `inventory_movements` rows with `reason='sale'`, `metadata.rpc='pos_finalize_order_stock'`.
  - `integration_metadata.yandex_status='ACCEPTED_BY_RESTAURANT'`, `payment_type='CARD'`.

### POST /order — CASH payment

- Same request with `paymentType: "CASH"`.
- Response is `200` and includes `status: "ACCEPTED_BY_RESTAURANT"`.
- DB:
  - `orders.status='active'`, `closed_at IS NULL`.
  - No `payments` row exists for this order.
  - `inventory_movements` rows with `reason='sale'`, `metadata.rpc='pos_finalize_marketplace_active_stock'`.
  - `cash_movements` does **not** gain a `sale_cash` row at this moment (the cashier will close the order later through the normal POS flow).

### POST /order — idempotency

- Re-send the exact same body as the first POST. Response is still `200`; no duplicate `orders` row is created.
- `marketplace_inbound_events` shows two rows only if the first attempt had `processing_error IS NOT NULL`; otherwise the second POST short-circuits via the unique `external_event_id`.

### POST /order — unknown restaurant

- Body with `restaurantId` that has no `marketplace_store_bindings` row, or whose binding belongs to a different `organization_id`, returns `404 [{code:404,description:"Restaurant not found"}]`.

### POST /order — unmapped product / modifier

- Include an `items[]` entry whose `id` is not present in `products.external_id` for that venue.
- Order is still accepted; `integration_metadata.unmapped_products` contains the external id and `integration_metadata.requires_review=true`.
- Same logic for `modifications[].id` not present in `marketplace_modifier_bindings` (or not linked to the product) — `unmapped_attributes` is populated.

### GET /order/{eatsId}

- `200`, `Content-Type: application/vnd.eats.order.v2+json`.
- Body includes the original payload fields **and** the latest `status` from `integration_metadata.yandex_status`.

### GET /order/{eatsId}/status

- `200`, `Content-Type: application/vnd.eats.order.status.v2+json`.
- Body: `{ status: "ACCEPTED_BY_RESTAURANT", comment: null, updatedAt: <iso> }` right after POST.

### PUT /order/{eatsId}/status — valid transitions

- `ACCEPTED_BY_RESTAURANT → COOKING`, `COOKING → READY`, `READY → TAKEN_BY_COURIER`, `TAKEN_BY_COURIER → DELIVERED`: each call returns `200`.
- After each successful PUT, `integration_metadata.yandex_status` reflects the new status, and `integration_metadata.status_history` gains an entry `{status, at}`.
- `DELIVERED` also sets `orders.closed_at` if it was still null.

### PUT /order/{eatsId}/status — invalid transition

- `PUT` with `status: "COOKING"` while current status is `DELIVERED` returns `400 [{code:100,description:"Invalid status transition"}]`.
- `PUT` with the same status as current is idempotent → `200`, no history entry added.

### PUT — CANCELLED routing

- `PUT /order/{id}/status` with `status: "CANCELLED"` runs the same flow as `DELETE /order/{id}` (refund for paid, restock for active).

### DELETE /order/{eatsId} — CARD-paid

- DELETE on a paid Yandex order calls `pos_refund_order` and returns `200 { status: "CANCELLED" }`.
- DB: `orders.status='cancelled'`, `closed_at` updated; `payments.refunded_at IS NOT NULL`; `inventory_movements` gains `reason='refund'` rows with key suffix `:refund`.
- `cash_movements`: refund is recorded as the inverse of the original sale (zero net on `other_total`, no cash impact since CARD orders never wrote a cash row).

### DELETE /order/{eatsId} — CASH-active

- DELETE on an active CASH order calls `pos_cancel_unpaid_marketplace_order` and returns `200 { status: "CANCELLED" }`.
- DB: `orders.status='cancelled'`; `inventory_movements` gains `reason='refund'` rows with key suffix `:cancel`; `stock_items.quantity` is restored to pre-order values.
- No `payments` row exists at any point.

### DELETE — idempotency

- DELETE on an already-`cancelled` Yandex order returns `200 { status: "CANCELLED" }`; no further side effects (no new inventory movements, no double-refund).

### Scope enforcement

- Reissue a token with `scope=read` only.
- `POST /order`, `PUT /order/{id}/status`, `DELETE /order/{id}` all return `401 { reason: "insufficient_scope" }`.
- `GET /order/{id}` and `GET /order/{id}/status` still return `200` with the same token.

### SQL snippets

```sql
select id, number, status, order_source, external_order_id,
       integration_metadata->>'yandex_status' as yandex_status,
       integration_metadata->>'payment_type' as payment_type,
       integration_metadata->>'requires_review' as requires_review,
       opened_at, closed_at
from orders
where order_source = 'yandex_eda'
order by opened_at desc
limit 20;
```

```sql
select line_idempotency_key, reason, quantity_delta, occurred_at, metadata->>'rpc' as rpc
from inventory_movements
where ref_id = '<order_id>'
order by occurred_at;
```

---

## Marketplace order notifications (POS UX)

These checks apply to **both** Glovo and Yandex Eda orders. Run them with at least one POS device logged in and the Orders screen open.

### Sound + pulse on new order

- Insert a Glovo or Yandex order (via webhook / `POST /order`).
- The corresponding card in OrdersScreen pulses gently (scale and opacity oscillate).
- A short tone plays once.
- Tapping the card stops the pulse and silences the source-specific badge styling.

### Badge label per source

- Glovo orders show a badge with text "Glovo" in the bottom-left of the card.
- Yandex Eda orders show a badge with text "Яндекс".
- POS-native orders show no badge.

### Lock-screen counter

- Without unlocking, push the POS to the lock screen.
- Trigger one new marketplace order; the chip "Новых заказов: 1" appears in the top-right and pulses.
- Trigger another → chip updates to "Новых заказов: 2".
- Unlock and tap each card → counter drops to 0; chip disappears.

### Throttling

- Send three Glovo orders within one second (use a tight loop or three rapid `curl` calls).
- The chirp fires at most once per ~2 seconds; the three cards all pulse simultaneously.

### Shift close clears state

- With at least one unseen order, close the shift normally.
- The lock-screen chip and any remaining pulses disappear immediately.

### Historical backfill suppression

- Restart the POS so the Orders screen pulls from server. Older marketplace orders (opened_at > 60s ago) load normally but do **not** trigger sound or pulse — they are treated as already seen.

