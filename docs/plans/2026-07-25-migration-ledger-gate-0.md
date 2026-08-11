# Migration Ledger — Gate 0

**Date:** 2026-07-25
**Status:** Complete — 0 unresolved rows, all artifacts classified
**Scope:** `~/r_keeper` (POS) + `~/r_keeper-admin` (Admin + Supabase)
**Principle:** Every deployed database interaction, SQL side effect, trigger, outbox, and realtime subscription has at least one ledger row. Every SQL migration artifact has a recorded disposition.

---

## 1. Supabase Artifact Register

Each migration file, seed, manual script, and deployed routine maps to a disposition. Historical `CREATE OR REPLACE` chains collapse to the final deployed definition.

| # | Artifact | Kind | Deployed? | Disposition | Linked Ledger Rows | Reason |
|---|---|---|---|---|---|---|
| A1 | `20260330000000_initial_schema.sql` | migration | yes | CURRENT | L1–L35 (all base tables) | Foundation schema — tables exist in deployment |
| A2 | `20260330000001_seed_data.sql` | seed | historical | SEED | — | Replaced by later seed |
| A3 | `20260330000002_order_delete_policy.sql` | policy | yes | SUPERSEDED | L17 | Wide-open — replaced by later policies |
| A4 | `20260331000000_admin_policies.sql` | policy | yes | SUPERSEDED | L6–L9 (catalog CRUD) | Wide-open — venue-scoping added later |
| A5 | `20260331000001_workshops.sql` | migration | yes | CURRENT | L6 (catalog/products.workshop_id), L38 (inventory settlement) | Structural: workshop FK on products |
| A6 | `20260331000002_output_weight.sql` | migration + seed data | yes | ONE_OFF | — | Column exists ($\varnothing$ consumers), update data is mock fill |
| A7 | `20260407000000_add_tables_20.sql` | policy + data | historical | ONE_OFF | — | Expanded grid reverted later |
| A8 | `20260407000001_revert_tables_20.sql` | data revert | historical | ONE_OFF | — | Hardcoded venue/zones UUID deletion |
| A9 | `20260407000002_staff_policies.sql` | policy | yes | SUPERSEDED | L3 (staff CRUD) | Wide-open; later venue-scoped |
| A10 | `20260407000003_staff_fields.sql` | migration | yes | CURRENT | L3 | email, last_session_at on users |
| A11 | `20260407000004_modifier_recipe_policies.sql` | policy | yes | SUPERSEDED | L6 (modifier CRUD) | Wide-open |
| A12 | `20260407000005_coffee_modifiers.sql` | data | historical | ONE_OFF | — | Mock data seeding |
| A13 | `20260407000006_modifier_ingredient_link.sql` | migration | yes | CURRENT | L6 | ingredient_id/quantity/unit on modifiers |
| A14 | `20260426000000_zones_crud_policies.sql` | policy | yes | SUPERSEDED | L8 (zones CRUD) | Wide-open |
| A15 | `20260426000001_clean_orders_and_zones.sql` | data | historical | ONE_OFF | — | Cleanup of mock data |
| A16 | `20260428000000_table_col_row_span.sql` | migration | yes | CURRENT | L7 | col_span/row_span on tables |
| A17 | `20260428000001_cash_transactions.sql` | migration | yes | CURRENT | L25 (cash_transactions table) | Foundation for admin cash journal |
| A18 | `20260428000002_realtime_orders.sql` | config | yes | CURRENT | L14, L15 | Enables realtime on orders; consumed by POS channels |
| A19 | `20260430000000_venue_track_guests.sql` | migration | yes | CURRENT | L1 (venue settings) | track_guests on venues |
| A20 | `20260430000000_admin_warehouse.sql` | migration | yes | CURRENT | L33–L37 (warehouse admin) | warehouse_deliveries, write_offs, inventory_sessions |
| A21 | `20260430120001_tables_layout_columns.sql` | migration | yes | SUPERSEDED | L7 | Absorbed into later table layout |
| A22 | `20260430120002_venues_optional.sql` | migration | historical | SUPERSEDED | — | Admin-specific venue bootstrap superseded by seed |
| A23 | `20260501120000_warehouse_stock_rpcs.sql` | function | yes | SUPERSEDED | L37 | apply_delivery/writeoff/inventory_stock — redefined later |
| A24 | `20260501120001_rls_venue_scoped.sql` | function + policy | yes | CURRENT | L34–L37 (admin warehouse access) | user_has_venue_access SECURITY DEFINER |
| A25 | `20260501120002_delete_product_rpc.sql` | function | yes | CURRENT | L27 (admin product delete) | delete_product RPC |
| A26 | `20260501120003_zones_updated_at.sql` | trigger | yes | CURRENT | L8 (zones updated_at) | trg_zones_updated_at |
| A27 | `20260501120004_warehouse_doc_fields.sql` | migration | yes | CURRENT | L33 | comment fields on warehouse docs |
| A28 | `20260504120000_workshop_stock_transfers.sql` | migration | yes | SUPERSEDED | L35 | workshop_stock dropped later; transfers persist |
| A29 | `20260504140000_simplify_transfers.sql` | migration | yes | CURRENT | L35 (warehouse transfers) | Drops workshop_stock; rewrites apply_* functions |
| A30 | `20260505000000_inventory_consumption.sql` | migration + function | yes | CURRENT | L31, L32 (inventory movements, consumption batch) | inventory_movements, order_sale_consumption_batches, workshop_warehouses |
| A31 | `20260505120000_waiter_role_counted_cash.sql` | migration | yes | CURRENT | L2 (user roles) | waiter role, counted_cash on shifts |
| A32 | `20260505130000_cash_transaction_categories.sql` | migration | yes | CURRENT | L28 (admin cash categories) | cash_transaction_categories |
| A33 | `20260507120000_admin_inventory_warehouse_rpc.sql` | function | yes | CURRENT | L36 (admin inventory analytics) | admin_inventory_period_movements |
| A34 | `20260508121000_pos_warehouse_stock.sql` | migration + function | yes | SUPERSEDED | L31 (stock settlement) | pos_finalize_order_stock v1 — redefined 4 more times |
| A35 | `20260508121100_stock_items_rpcs_note.sql` | function | yes | SUPERSEDED | L37 | apply_delivery/writeoff/inventory_stock — redefined |
| A36 | `20260508122000_security_perf_cleanup.sql` | migration | yes | CURRENT | L34–L37 | Index cleanup, policy optimization |
| A37 | `20260509000000_pos_stock_security_hardening.sql` | migration + function | yes | SUPERSEDED | L31 | pos_finalize_order_stock v2 — service_role only; later expanded |
| A38 | `20260509010000_pos_stock_temp_client_rpc_grant.sql` | grant | yes | SUPERSEDED | L31 | Temporary anon grant — absorbed into later migration |
| A39 | `20260509120000_pos_finalize_allow_anon_client.sql` | function | yes | SUPERSEDED | L31 | pos_finalize_order_stock v3 — re-allows anon |
| A40 | `20260509150000_pos_refund_workflow.sql` | migration + function | yes | CURRENT | L29, L30 (refunds) | pos_order_refunds, pos_refund_order |
| A41 | `20260511153000_pos_modifier_hardening.sql` | function | yes | SUPERSEDED | L31 | pos_finalize_order_stock v4 — modifier ingredient awareness |
| A42 | `20260511154000_unit_check_constraints.sql` | migration | yes | CURRENT | L31, L6 | Unit CHECK constraints on recipe_items, modifiers, stock_items, inventory_movements |
| A43 | `20260511155000_shift_cash_ledger.sql` | migration + function + trigger | yes | CURRENT | L20–L24 (shift cash) | cash_movements, sync_cash_movements_from_payments trigger, pos_shift_cash_summary, pos_record_cash_collection, pos_close_shift |
| A44 | `20260512000000_payments_idempotency.sql` | migration | yes | CURRENT | L19 (payment idempotency) | idempotency_key on payments |
| A45 | `20260512100000_pos_refund_cancel.sql` | function | yes | CURRENT | L30 (refund cancel) | pos_cancel_refund, pos_order_items_signature |
| A46 | `20260512110000_consumption_dead_letters.sql` | migration + function | yes | CURRENT | L31–L32 (dead letters) | pos_consumption_dead_letters, record/retry/ack RPCs |
| A47 | `20260513000000_pos_cash_transactions.sql` | function | yes | CURRENT | L22 (cash transactions RPC) | pos_record_cash_transaction |
| A48 | `20260513010000_glovo_inbound_phase1.sql` | migration | yes | CURRENT | L39 (marketplace — first cutover DROP) | marketplace_store_bindings, marketplace_inbound_events, order_source on orders |
| A49 | `20260513120000_pos_consumption_ack_resolves.sql` | function | yes | CURRENT | L32 (dead letter ack) | pos_consumption_ack_dead_letter — resolves+records history |
| A50 | `20260514000000_glovo_marketplace_rls_tighten.sql` | policy | yes | CURRENT | L39 | FORCE RLS + revoke anon on marketplace tables |
| A51 | `20260515000000_marketplace_phase1_hardening.sql` | migration + function | yes | CURRENT | L39 | venue_order_counters, marketplace_modifier_bindings, marketplace_next_order_number |
| A52 | `20260516000000_yandex_eda_phase1a.sql` | migration | yes | CURRENT | L39 | marketplace_api_clients, marketplace_access_tokens, marketplace_yandex_issue_token, marketplace_yandex_validate_token |
| A53 | `20260516000100_yandex_eda_rpc_disambig.sql` | function | yes | CURRENT | L39 | Disambiguated function signatures (out_ prefix) |
| A54 | `20260517000000_yandex_eda_phase1b.sql` | function | yes | CURRENT | L39 | pos_finalize_marketplace_active_stock, pos_cancel_unpaid_marketplace_order |
| A55 | `20260518000000_venue_type.sql` | migration | yes | CURRENT | L1 | venue_type CHECK on venues |
| A56 | `20260519000000_pos_active_refunds_rpc.sql` | function | yes | CURRENT | L18 (active refunds) | pos_active_refunds_for_shift |
| A57 | `20260520100000_cash_transactions_journal.sql` | migration + function | yes | CURRENT | L25, L26 (admin cash journal) | cash_transactions table, pos_record_cash_collection, pos_record_cash_transaction rewrite |
| A58 | `20260521140000_cash_transactions_null_shift_cleanup.sql` | migration | yes | CURRENT | L25 | shift_id NOT NULL on cash_transactions |
| A59 | `20260521150000_stock_unit_conversion.sql` | function | yes | SUPERSEDED | L31 | pos_finalize_order_stock v5 — unit-aware; hotfixed |
| A60 | `20260521150001_stock_unit_conversion_hotfix.sql` | function | yes | CURRENT | L31 | pos_finalize_order_stock v6 — FINAL deployed definition |
| A61 | `20260620000000_demo_shift_dates.sql` | seed function | no (demo) | SEED | — | demo_shift_dates() — demo data generator |
| A62 | `20260622000000_scale_to_1m.sql` | seed function | no (demo) | SEED | — | demo_gen_orders() — benchmark generator |
| A63 | `20260622000001_heal_demo_data.sql` | data fix | historical | ONE_OFF | — | Heal demo dataset |
| A64 | `20260622000002_fix_heal_payments.sql` | data fix | historical | ONE_OFF | — | Fix payment data in demo |
| A65 | `20260625000000_fix_demo_gen_orders_shadow.sql` | function fix | no (demo) | SEED | — | Fix demo_gen_orders to use order_events |
| A66 | `20260625000001_fix_cleanup_transfers.sql` | data fix | historical | ONE_OFF | — | Cleanup transfer data |
| A67 | `20260625000002_fix_workshop_ids_and_inventory_movements.sql` | data fix | historical | ONE_OFF | — | Fix workshop IDs in inventory movements |
| A30b | `20260508121100_stock_items_rpcs_note.sql` | function | yes | CURRENT | L37 | apply_stock_delta v2, apply_delivery/writeoff/inventory/transfer_stock SECURITY DEFINER rewrites |
| A30c | `20260508122000_security_perf_cleanup.sql` | migration | yes | CURRENT | L34–L37 | Index cleanup, policy optimization |
| A30d | `20260509000000_pos_stock_security_hardening.sql` | migration + function | yes | SUPERSEDED | L31 | pos_finalize_order_stock v2 — service_role only; later expanded |
| A30e | `20260509010000_pos_stock_temp_client_rpc_grant.sql` | grant | yes | SUPERSEDED | L31 | Temporary anon grant — absorbed into later migration |
| A30f | `20260509120000_pos_finalize_allow_anon_client.sql` | function | yes | SUPERSEDED | L31 | pos_finalize_order_stock v3 — re-allows anon |
| A30g | `20260509121000_workshops_default_warehouse_and_seed.sql` | function + trigger | yes | CURRENT | L5, L77 | seed_default_ops_structure() + after_venue_insert_seed_default_ops trigger — auto-creates warehouses/workshops on new venue |
| A30h | `20260509150000_pos_refund_workflow.sql` | migration + function | yes | CURRENT | L29, L30 (refunds) | pos_order_refunds, pos_refund_order |
| A30i | `20260510121000_admin_stability_hardening.sql` | function | yes | CURRENT | L31 (legacy consumption) | finalize_order_consumption hardened — SECURITY DEFINER, idempotency via order_sale_consumption_batches |
| A30j | `20260511153000_pos_modifier_hardening.sql` | function | yes | SUPERSEDED | L31 | pos_finalize_order_stock v4 — modifier ingredient awareness |
| A30k | `20260511154000_unit_check_constraints.sql` | migration | yes | CURRENT | L31, L6 | Unit CHECK constraints on recipe_items, modifiers, stock_items, inventory_movements |
| A30l | `20260511155000_shift_cash_ledger.sql` | migration + function + trigger | yes | CURRENT | L20–L24 (shift cash) | cash_movements, sync_cash_movements_from_payments trigger, pos_shift_cash_summary, pos_record_cash_collection, pos_close_shift |
| A30m | `20260512000000_payments_idempotency.sql` | migration | yes | CURRENT | L19 (payment idempotency) | idempotency_key on payments |
| A30n | `20260512100000_pos_refund_cancel.sql` | function | yes | CURRENT | L30 (refund cancel), L29 (pos_refund_order v2 with snapshot) | pos_cancel_refund, pos_order_items_signature, pos_refund_order v2 |
| A30o | `20260512110000_consumption_dead_letters.sql` | migration + function | yes | CURRENT | L31–L32 (dead letters) | pos_consumption_dead_letters, record/retry/ack RPCs |
| A30p | `20260513000000_pos_cash_transactions.sql` | function | yes | CURRENT | L22 (cash transactions RPC) | pos_record_cash_transaction v1 |
| A30q | `20260513010000_glovo_inbound_phase1.sql` | migration | yes | CURRENT | L39 (marketplace — first cutover DROP) | marketplace_store_bindings, marketplace_inbound_events, order_source on orders |
| A30r | `20260513120000_pos_consumption_ack_resolves.sql` | function | yes | CURRENT | L32 (dead letter ack) | pos_consumption_ack_dead_letter v2 — resolves+records history |
| A30s | `20260514000000_glovo_marketplace_rls_tighten.sql` | policy | yes | CURRENT | L39 | FORCE RLS + revoke anon on marketplace tables |
| A30t | `20260515000000_marketplace_phase1_hardening.sql` | migration + function | yes | CURRENT | L39 | venue_order_counters, marketplace_modifier_bindings, marketplace_next_order_number |
| A30u | `20260601120000_fix_stock_unit_conversion.sql` | function | yes | CURRENT | L37 | apply_stock_delta v4, apply_inventory_stock DROP+CREATE |
| A30v | `20260610000000_order_events.sql` | migration | yes | CURRENT | L19–L20 (order events) | order_event_action type, RLS policies on order_events |
| A68 | `fix_workshop_id_null.sql` | manual repair | historical | ONE_OFF | — | Hardcoded venue UUID — one-off operational repair |
| A69 | `retry_dead_letters.sql` | manual repair | historical | ONE_OFF | — | Hardcoded venue UUID — manual replay |
| A70 | `seed.sql` (root) | seed | historical | SEED | — | Replaced by newer seed |
| A71 | `seeds/dev_pos_warehouse_seed.sql` | seed | dev | SEED | — | Dev fixture: warehouse/workshop mappings |
| A72 | `demo_profit_data.sql` | demo | no | SEED | — | Demo analytics data generator |
| A73 | `apply_admin_migrations.sql` | bootstrap | historical | ONE_OFF | — | First-run admin schema bootstrap |
| A74 | `smoke_checks/admin_health_check.sql` | smoke | dev | SEED | — | Health check — validates deployed functions exist |
| A75 | `supabase/config.toml` | config | yes | CURRENT | L14, L15 | Realtime enabled, seed config |
| A76 | `src/db/database.ts` (SQLite) | local DB | yes | CURRENT | L10–L13 (POS SQLite outbox + cache) | Local persistence: catalog cache, order/consumption outboxes, local_orders |
| A77 | deployed-only `public.rls_auto_enable()` | deployed drift | yes | DROP — CONFIRMED 2026-07-28 | L78 | Present in remote schema but absent from all repository migrations; no active `CREATE EVENT TRIGGER` appears in the deployed public-schema dump |

### Function Collapse Chain

| Final Function | Source Migrations (oldest → newest) |
|---|---|
| `pos_finalize_order_stock` v6 | 20260508121000 → 20260509000000 → 20260509120000 → 20260511153000 → 20260521150000 → **20260521150001** |
| `finalize_order_consumption` v2 | 20260505000000 → **20260510121000** |
| `pos_refund_order` v2 | 20260509150000 → **20260512100000** |
| `pos_cancel_refund` v1 | **20260512100000** |
| `pos_consumption_record_dead_letter` v1 | **20260512110000** |
| `pos_consumption_retry_dead_letter` v1 | **20260512110000** |
| `pos_consumption_ack_dead_letter` v2 | 20260512110000 → **20260513120000** |
| `sync_cash_movements_from_payments` v2 | 20260511155000 → **20260512100000** |
| `pos_shift_cash_summary` v2 | 20260511155000 → **20260515000000** |
| `pos_record_cash_collection` v2 | 20260511155000 → **20260520100000** |
| `pos_record_cash_transaction` v2 | 20260513000000 → **20260520100000** |
| `pos_close_shift` v1 | **20260511155000** |
| `apply_stock_delta` v4 | 20260505000000 → 20260508121100 → 20260521150000 → **20260601120000** |
| `apply_delivery_stock` v4 | 20260501120000 → 20260504120000 → 20260504140000 → **20260508121100** |
| `apply_writeoff_stock` v4 | 20260501120000 → 20260504120000 → 20260504140000 → **20260508121100** |
| `apply_inventory_stock` v5 | 20260501120000 → 20260504120000 → 20260504140000 → 20260508121100 → **20260601120000** |
| `apply_transfer_stock` v3 | 20260504120000 → 20260504140000 → **20260508121100** |
| `admin_inventory_period_movements` v3 | 20260506120000 → 20260507120000 → **20260612140000** |
| `marketplace_yandex_issue_token` v2 | 20260516000000 → **20260516000100** |
| `marketplace_yandex_validate_token` v2 | 20260516000000 → **20260516000100** |
| `marketplace_next_order_number` v1 | **20260515000000** |
| `demo_clean_venue` v5 | … → … → … → … → **20260625000001** |
| `demo_gen_orders` v9 | … → … → … → … → … → … → … → … → **20260625000000** |
| `demo_shift_dates` v1 | **20260620000000** |
| `demo_heal_data` v2 | 20260622000001 → **20260622000002** |
| `demo_scale_to_1m` v1 | **20260622000000** |
| `demo_backfill_inventory_movements` v1 | **20260625000002** |
| `seed_default_ops_structure` v1 | **20260509121000** |
| `user_has_venue_access` v1 | **20260501120001** |
| `delete_product` v1 | **20260501120002** |
| `pos_order_items_signature` v1 | **20260512100000** |
| `pos_active_refunds_for_shift` v1 | **20260519000000** |
| `pos_finalize_marketplace_active_stock` v1 | **20260517000000** |
| `pos_cancel_unpaid_marketplace_order` v1 | **20260517000000** |
| `marketplace_cleanup_access_tokens` v1 | **20260516000000** |
| `to_base_unit` v1 | **20260521150000** |
| `from_base_unit` v1 | **20260521150000** |
| `base_unit_for` v1 | **20260521150000** |

### Triggers

| Trigger Name | Table | Event | Function | Migration |
|---|---|---|---|---|
| `trg_zones_updated_at` | zones | BEFORE UPDATE | zones_set_updated_at() | 20260501120003 |
| `trg_sync_cash_movements_from_payments` | payments | AFTER INSERT OR UPDATE OF refunded_at | sync_cash_movements_from_payments() | 20260511155000 |
| `after_venue_insert_seed_default_ops` | venues | AFTER INSERT | trg_seed_default_ops_after_venue_insert() | 20260509121000 |

### Enums & Types

| Type | Values | Migration |
|---|---|---|
| `user_role` | owner, manager, cashier, waiter | 20260330000000 + 20260505120000 |
| `product_type` | dish, ingredient, modifier | 20260330000000 |
| `order_status` | active, paid, alert, cancelled | 20260330000000 |
| `payment_method` | cash, card, qr, other, none | 20260330000000 |
| `fiscal_status` | pending, sent, failed, skipped | 20260330000000 |
| `inventory_movement_reason` | sale, waste, supply, adjustment, refund, refund_cancel | 20260505000000 + 20260509150000 + 20260512100000 |
| `cash_movement_type` | sale, refund, collection, float_in, float_out | 20260511155000 |
| `order_event_action` | item_added, item_removed, precheck_printed, paid, cancelled, refunded | 20260610000000 |

### Idempotency & Uniqueness Constraints

| Constraint | Table | Keys | Migration |
|---|---|---|---|
| `uq_stock_items_warehouse_product` | stock_items | (warehouse_id, product_id) | 20260505000000 |
| `payments_idempotency_key_venue_uidx` | payments | (venue_id, idempotency_key) | 20260512000000 |
| `cash_movements_payment_type_uidx` | cash_movements | (payment_id, movement_type) WHERE payment_id IS NOT NULL | 20260511155000 |
| `orders_venue_source_external_uidx` | orders | (venue_id, order_source, external_order_id) WHERE external_order_id IS NOT NULL | 20260513010000 |
| `marketplace_inbound_events_provider_external_uidx` | marketplace_inbound_events | (provider, external_event_id) WHERE external_event_id IS NOT NULL | 20260513010000 |
| `uq_recipe_items_product_ingredient` | recipe_items | (product_id, ingredient_id) WHERE ingredient_id IS NOT NULL | 20260510121000 |
| `idx_warehouses_venue_name_unique` | warehouses | (venue_id, lower(name)) | 20260613000000 |
| PK-as-idempotency | pos_order_stock_settlements | order_id PRIMARY KEY | 20260508121000 |
| PK-as-idempotency | pos_order_refunds | order_id PRIMARY KEY | 20260509150000 |
| UNIQUE | order_sale_consumption_batches | idempotency_key | 20260505000000 |
| UNIQUE | inventory_movements | line_idempotency_key | 20260505000000 |
| PK-as-idempotency | pos_consumption_dead_letters | idempotency_key PRIMARY KEY | 20260512110000 |
| PK-as-idempotency | venue_order_counters | venue_id PRIMARY KEY | 20260515000000 |
| PK-as-idempotency | workshop_warehouses | workshop_id PRIMARY KEY | 20260505000000 |
| UNIQUE | marketplace_store_bindings | (provider, external_store_id), (venue_id, provider) | 20260513010000 |
| UNIQUE | marketplace_modifier_bindings | (venue_id, provider, external_modifier_id) | 20260515000000 |
| UNIQUE | marketplace_api_clients | (provider, client_id) | 20260516000000 |
| PK-as-idempotency | marketplace_access_tokens | token_hash PRIMARY KEY | 20260516000000 |
| UNIQUE | user_venues | (user_id, venue_id) | 20260330000000 |

---

## 2. Behavior Migration Ledger

Deployment evidence: `npx supabase migration list --linked` reports every one of the 95 timestamped local migrations present remotely with no local/remote mismatch. A fresh `npx supabase db dump --linked --schema public` was captured on 2026-07-25 and reconciled against this ledger: 49 tables, 41 functions, 3 row triggers and 118 policies. Product confirmed every `REPLACE` and `DROP` decision on 2026-07-28; `Status: Open` tracks implementation state, not product confirmation state.

### Domain: Auth & Tenancy

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L1 | Auth | Admin logs in with email/password | `admin/src/auth/AuthProvider.tsx` | `supabase.auth.signInWithPassword()` | R | None | None | Session JWT | REPLACE | Replace with Instant Auth (device activation + admin membership) | `activateDevice`, `signInAdmin` | Admin sees dashboard after login; device activation survives app restart | Open |
| L2 | Auth | Waiter selects employee by PIN | `pos/src/store/shiftStore.ts:openShift()` | Reads `users` table (via venueStore) + local PIN comparison | R | Cached employee list in SQLite `catalog` | None | PIN match, venue membership | REPLACE | Replace with Instant `employees` entity + offline PIN cache | `selectEmployee(pin)` | Waiter enters PIN, sees their name, opens shift | Open |
| L3 | Auth | Admin manages employees (CRUD) | `admin/src/pages/Staff.tsx`, `admin/src/hooks/useStaffData.ts` | `users` INSERT/UPDATE/DELETE, `user_venues` INSERT/DELETE | W | None | None | venue_id scoping, unique pin | REPLACE | Replace with Instant `employees` entity + typed CRUD commands | `createEmployee`, `updateEmployee`, `deleteEmployee`, `assignEmployeeToVenue` | Admin creates employee; POS sees employee in PIN list | Open |

### Domain: Venue Configuration

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L4 | Venue | POS loads venue settings | `pos/src/store/venueStore.ts:fetchVenue()` | `venues` SELECT (track_guests, venue_type) | R | Cached in SQLite `catalog` | None | venue_id = VENUE_ID | MIGRATE | Straightforward venue config read | `queryVenue()` | POS shows guest-tracking toggle, venue type | Open |
| L5 | Venue | Admin updates venue settings | `admin/src/hooks/useVenueSettings.ts` | `venues` UPDATE (name, address, phone, daily_labor_cost) | W | None | None | venue_id scoping | MIGRATE | Typed command from admin | `updateVenue(patch)` | Admin changes venue name; POS reflects it | Open |

### Domain: Floor Plan

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L6 | FloorPlan | POS loads floor plan (zones + tables) | `pos/src/store/venueStore.ts:fetchVenue()` | `zones` SELECT, `tables` SELECT | R | Cached in SQLite `catalog` | None | venue_id scoping | MIGRATE | Direct query read | `queryZones()`, `queryTables(zoneId)` | POS shows floor plan with table positions and capacities | Open |
| L7 | FloorPlan | Admin manages floor plan (zones + tables CRUD) | `admin/src/hooks/useFloorPlan.ts` | `zones` INSERT/UPDATE/DELETE, `tables` INSERT/DELETE | W | None | `trg_zones_updated_at` sets updated_at | venue_id scoping, col_span/row_span on tables | MIGRATE | Admin CRUD with typed commands | `createZone`, `updateZone`, `deleteZone`, `createTable`, `deleteTable`, `updateTableLayout` | Admin adds table; POS floor plan updates | Open |

### Domain: Catalog (Menu)

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L8 | Catalog | POS loads menu (categories, products, modifiers) | `pos/src/store/menuStore.ts:fetchMenu()` | `categories` SELECT, `products` SELECT, `modifier_groups` SELECT (nested: product_modifier_groups, modifiers) | R | Cached in SQLite `catalog` table with fingerprint change detection; falls back to cache when Supabase unreachable | None | is_active filter, sort_order, type='dish' | MIGRATE | Offline-first catalog read with fingerprint — preserves POS offline capability | `queryCategories()`, `queryProducts(categoryId)`, `queryModifierGroups(productId)` | POS shows category tabs and product grid; works offline with cached catalog | Open |
| L9 | Catalog | POS detects catalog changes | `pos/src/store/menuStore.ts:hasCatalogChanged()` | `products` count (head:true), `categories` count (head:true) | R | SQLite fingerprint comparison | Triggers full menu reload | Count-based fingerprint | REPLACE | Replace count-based fingerprint with InstantDB live query or version number | `queryCatalogVersion()` | Admin updates a product; POS detects change and refreshes grid | Open |
| L10 | Catalog | Admin manages categories | `admin/src/pages/Categories.tsx`, `admin/src/hooks/useMenuData.ts` | `categories` SELECT/INSERT/UPDATE/DELETE | W | None | None | venue_id, sort_order uniqueness | MIGRATE | Typed admin CRUD | `createCategory`, `updateCategory`, `deleteCategory` | Admin creates category; POS shows new category tab | Open |
| L11 | Catalog | Admin manages dishes (products) | `admin/src/pages/DishEdit.tsx`, `admin/src/pages/Menu.tsx`, `admin/src/pages/AddIngredients.tsx` | `products` INSERT/UPDATE/DELETE, `recipe_items` INSERT/DELETE, `product_modifier_groups` INSERT/DELETE, `modifier_groups` INSERT/UPDATE, `modifiers` INSERT/UPDATE/DELETE | W | None | None | has_modifiers flag sync, type='dish' | MIGRATE | Admin CRUD with typed atomic commands | `createProduct`, `updateProduct`, `deleteProduct`, `addModifierGroup`, `removeModifierGroup`, `addModifier`, `updateModifier`, `deleteModifier` | Admin creates dish with modifiers; POS shows dish in product grid with modifier selection | Open |
| L12 | Catalog | Admin manages ingredients | `admin/src/pages/EditIngredient.tsx`, `admin/src/pages/AddIngredients.tsx` | `products` INSERT/UPDATE/DELETE (type='ingredient'), `warehouse_products` UPSERT | W | None | None | type='ingredient', warehouse visibility | MIGRATE | Typed admin commands | `createIngredient`, `updateIngredient`, `deleteIngredient`, `linkIngredientToWarehouse` | Admin adds ingredient; appears in inventory/recipe pickers | Open |
| L13 | Catalog | Admin manages modifier recipes (ingredient link) | `admin/src/pages/DishEdit.tsx` | `recipe_items` INSERT/DELETE, `modifiers` INSERT/UPDATE/DELETE (ingredient_id, quantity, unit) | W | None | None | unit CHECK constraint, ingredient_id FK | MIGRATE | Captured in updateProduct/addModifier commands | (included in L11) | Admin links modifier to ingredient; stock consumption tracks modifier ingredients | Open |

### Domain: Shift Management

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L14 | Shift | Waiter opens shift | `pos/src/store/shiftStore.ts:openShift()` | `shifts` SELECT (check no open shift), `shifts` INSERT, `shifts` UPSERT (via orderOutboxStore) | R+W | Outbox ensures shift exists on server before orders; local shift state in Zustand | None | One open shift per venue, venue_id, cashier_id | MIGRATE | `openShift` typed command | `openShift(employeeId, startingCash)` | Waiter selects employee, enters starting cash, shift opens | Open |
| L15 | Shift | POS detects existing open shift (re-attach) | `pos/src/store/shiftStore.ts:fetchOpenShift()` | `shifts` SELECT (closed_at IS NULL) | R | Zustand shift state, SQLite catalog | None | Single open shift invariant | MIGRATE | Query for active shift | `queryActiveShift()` | POS reopens after crash; shows same shift with existing orders | Open |
| L16 | Shift | POS syncs running shift totals after each payment | `pos/src/store/shiftStore.ts:recordPayment()` | `shifts` UPDATE (total_orders, total_revenue, cash_total, card_total, other_total) | W | Retry via retryShiftSync(); shifts to outbox if persistent | None | Running totals reflect actual payments | REPLACE | Replace running-total sync with InstantDB derived/computed attrs or per-payment query | `queryShiftTotals(shiftId)` | Shift screen shows correct running totals after payment; no lost syncs | Open |
| L17 | Shift | Admin views shift list | `admin/src/hooks/useShiftsData.ts`, `admin/src/hooks/useDashboardNewData.ts` | `shifts` SELECT (by venue, with cash_movements join) | R | None | None | venue scoping | MIGRATE | Admin query | `queryShifts(venueId, dateRange)` | Admin dashboard shows shift list with totals | Open |
| L18 | Shift | Admin updates shift cash fields | `admin/src/hooks/useShiftsData.ts` | `shifts` UPDATE (starting_cash, closing_cash_count, notes) | W | None | None | Single open shift | MIGRATE | Admin targeted update | `updateShiftCashFields(shiftId, patch)` | Admin corrects shift starting cash; reflected in shift summary | Open |

### Domain: Order Lifecycle

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L19 | Order | POS loads active orders for current shift | `pos/src/store/orderStore.ts:loadOrdersFromSupabase()` | `orders` SELECT (by venue, shift, status), `order_items` SELECT (by order_ids), `order_item_modifiers` SELECT (nested) | R | SQLite `local_orders` cache; loaded on startup before Supabase fetch | None | venue_id, shift_id, status IN (active,alert,paid,cancelled) | MIGRATE | Local-first order list with query | `queryActiveOrders(shiftId)` | POS shows all active orders on floor plan and order list | Open |
| L20 | Order | Waiter creates order | `pos/src/store/orderOutboxStore.ts:execCreate()` | `shifts` UPSERT (ensure shift exists), `orders` INSERT | W | Outbox queue with exponential backoff; local order persisted in SQLite `local_orders` | None | venue_id, shift_id, unique number, waiter_id, order_source, external_order_id | MIGRATE | `createOrder` typed command | `createOrder(input)` | Waiter taps table; order appears with number on both devices | Open |
| L21 | Order | Waiter updates order (status, guest_count, table, comment) | `pos/src/store/orderOutboxStore.ts:execUpdate()` | `orders` UPDATE | W | Outbox; local SQLite | Sets closed_at on paid/cancelled | waiter_id ownership (unenforced at DB level today) | MIGRATE | `updateOrder` typed command with ownership check | `updateOrder(orderId, patch)` | Waiter changes guest count; other device sees update | Open |
| L22 | Order | Waiter adds/removes items (order items sync) | `pos/src/store/orderOutboxStore.ts:execSyncItems()` | `order_items` SELECT (current server state), `order_items` DELETE (removed), `order_items` UPSERT (this device's items), `order_item_modifiers` DELETE+INSERT (this device's items), `orders` UPDATE (total_amount recalculated) | R+W | Outbox; diff-based merge: only this device's items are replaced; other devices' items preserved | `order_events` INSERT (item_added/item_removed) | Diff-merge pattern: read server state → delete removed → upsert mine → recalculate total | REPLACE | Replace diff-merge pattern with InstantDB's native conflict resolution + single-writer ownership | `addOrderLine`, `removeOrderLine`, `updateOrderLine` | Waiter adds dish + modifier; owner-only mutation; other device sees new item | Open |
| L23 | Order | Waiter deletes order | `pos/src/store/orderOutboxStore.ts:execDelete()` | `order_items` SELECT (get item_ids), `order_item_modifiers` DELETE (cascade), `order_items` DELETE, `orders` DELETE | W | Outbox; removed from local SQLite | No cascading events for explicit delete (today — depends on caller) | Order must be active; cascade cleanup | MIGRATE | `deleteOrder(orderId)` typed command with state gate | `deleteOrder(orderId)` | Waiter deletes empty order; disappears from both devices | Open |
| L24 | Order | POS receives realtime order changes | `pos/src/hooks/useOrderRealtime.ts` | `supabase.channel('orders-realtime')` on orders (*), `supabase.channel('order-items-realtime')` on order_items (*) | SUBSCRIBE | Debounced reload (300ms for items) | Triggers orderStore reload/merge | venue_id filter on orders channel | REPLACE | Replace with InstantDB live queries | (InstantDB handles this natively) | Other waiter creates order; POS sees it within seconds without manual refresh | Open |
| L25 | Order | Admin views order history (checks) | `admin/src/hooks/useChecksData.ts`, `admin/src/pages/Checks.tsx` | `orders` SELECT (up to 3000, chunked), `order_items` SELECT (chunked), `payments` SELECT (chunked), `order_events` SELECT (chunked) | R | None | None | venue scoping, chunkedInQuery pattern | MIGRATE | Admin query with pagination | `queryOrders(dateRange)`, `queryOrderDetail(orderId)` | Admin sees all orders for date range with items, payments, events | Open |
| L26 | Order | Admin deletes order | `admin/src/pages/Checks.tsx` | `orders` DELETE (by id + venue) | W | None | None | venue scoping | MIGRATE | `deleteOrder` admin variant | `adminDeleteOrder(orderId)` | Admin deletes erroneous check; order disappears from history | Open |

### Domain: Order Events

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L27 | Events | POS records item_added/item_removed events | `pos/src/store/orderOutboxStore.ts:execSyncItems()` | `order_events` INSERT (action: item_added/item_removed) | W | Outbox (syncItems batch) | Admin dashboard detectors consume these events | One event per diff pair (added + removed) | MIGRATE | Typed event emission as part of `addOrderLine`/`removeOrderLine` | (included in L22) | Admin dashboard shows item-changed chronology for each order | Open |
| L28 | Events | POS records precheck_printed event | `pos/src/store/orderOutboxStore.ts:execPrecheck()` | `order_events` INSERT (action: precheck_printed) | W | Outbox | Admin chronology feed | One event per precheck | MIGRATE | `sendToKitchen` → emits `kitchenTicketQueued` event | `sendToKitchen(orderId)` | Admin sees "precheck printed" in order timeline | Open |
| L29 | Events | POS records paid/cancelled event on payment completion | `pos/src/screens/PaymentScreen.tsx:handlePay()` | `order_events` INSERT (action: paid/cancelled) | W | Fire-and-forget (no outbox!) | Admin dashboard: payment chronology, shift totals | Must match actual payment result | MIGRATE | Included in `payOrder`/`cancelOrder` typed transaction | (included in L34) | Admin sees paid/cancelled timeline event after payment | Open |

### Domain: Payment Processing

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L30 | Payment | Cashier completes payment | `pos/src/api/payments.ts:insertPayment()` | `payments` INSERT (order_id, venue_id, shift_id, method, amount, change_amount, close_reason, idempotency_key) | W | Called inline during payment flow; error surfaces to UI | idempotency_key prevents duplicate payments (23505 conflict) | order_id uniqueness for non-refund payments, idempotency_key uniqueness per venue | REPLACE | Replace with one atomic `payOrder` InstantDB transaction (payment + order status + cash + inventory + events) | `payOrder(input)` | Cashier taps "Pay"; payment records, order becomes paid, stock consumed, cash registered — all atomic | Open |
| L31 | Payment | POS reads payment for order | `pos/src/api/payments.ts:fetchPaymentForOrder()` | `payments` SELECT (method, amount, change_amount, close_reason by order_id) | R | None | None | Single payment per order | MIGRATE | Query part of paid order view | `queryPayment(orderId)` | Waiter sees payment method and amount on paid order | Open |
| L32 | Payment | POS checks active refunds for shift | `pos/src/api/payments.ts:fetchActiveRefunds()` | `pos_active_refunds_for_shift` RPC | R | None | None | Refund in current shift | MIGRATE | Query for active refunds | `queryActiveRefunds(shiftId)` | Cashier sees which orders are refunded when closing shift | Open |

### Domain: Inventory & Stock Consumption

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L33 | Inventory | POS finalizes stock consumption after payment | `pos/src/api/inventory.ts:finalizeOrderConsumption()` | `pos_finalize_order_stock` RPC (venue_id, order_id, occurred_at, lines, shift_id, strict_insufficient) | W | Consumption outbox in SQLite `consumption_outbox` with retry+escalation to dead letters | Creates `inventory_movements` rows (reason='sale'), creates/updates `pos_order_stock_settlements` (idempotency), deducts `stock_items` via `apply_stock_delta` | Order must be paid, one settlement per order, workshop→warehouse resolution, unit conversion (to_base_unit), modifier ingredient support | REPLACE | Replace complex multi-step RPC with one `payOrder` InstantDB transaction that atomically creates inventory_movements from recipe + modifier ingredient lines | (included in L30) | Paying for a cappuccino deducts coffee beans and milk from stock; second payment attempt is idempotent | Open |
| L34 | Inventory | POS retries failed consumption (outbox flush) | `pos/src/store/syncOutboxStore.ts:flush()` | Calls `pos_finalize_order_stock` RPC (same as L33) | W | Exponential backoff retry (max 6 tries, 5-min staleness); escalates to server dead-letter on permanent failure | Same as L33 | Same as L33 | REPLACE | With InstantDB offline sync, consumption is part of the same transaction as payment — no separate outbox needed | (InstantDB handles offline) | POS goes offline during payment; stock correctly consumed when connection restored | Open |
| L35 | Inventory | POS records failed consumption as dead letter | `pos/src/api/consumption.ts:recordConsumptionDeadLetter()` | `pos_consumption_record_dead_letter` RPC | W | Called from syncOutboxStore after max retries; persists to server for admin visibility | Creates row in `pos_consumption_dead_letters` | One dead letter per idempotency_key | REPLACE | Replace with InstantDB conflict tracking + admin recovery UI | `queryDeadLetters(venueId)`, `resolveDeadLetter(key)` | Admin sees failed consumption on dashboard dead-letter alert; can retry or ack | Open |
| L36 | Inventory | POS retries dead letter from admin | `pos/src/api/consumption.ts:retryConsumptionDeadLetter()` | `pos_consumption_retry_dead_letter` RPC | W | Admin-triggered retry | Re-runs consumption, updates dead-letter status | idempotency_key | REPLACE | Admin `retryDeadLetter` command | `retryDeadLetter(key)` | Admin clicks "Retry" on dead letter; stock correctly consumed | Open |
| L37 | Inventory | POS acknowledges dead letter | `pos/src/api/consumption.ts:ackConsumptionDeadLetter()` | `pos_consumption_ack_dead_letter` RPC | W | Admin-triggered ack | Updates dead-letter status to 'resolved', records actorUserId | Must not ack an unresolved item | REPLACE | Admin `ackDeadLetter` command | `ackDeadLetter(key, reason)` | Admin clicks "Dismiss" on dead letter with reason; no longer shown as pending | Open |
| L38 | Inventory | POS lists unresolved dead letters | `pos/src/api/consumption.ts:listConsumptionDeadLetters()` | `pos_consumption_dead_letters` SELECT (by venue, status != 'resolved') | R | None | None | venue scoping | MIGRATE | Query | `queryDeadLetters(venueId)` | Admin/manager sees list of unresolved consumption dead letters | Open |

### Domain: Refunds

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L39 | Refund | Cashier refunds paid order | `pos/src/api/inventory.ts:refundOrder()` | `pos_refund_order` RPC (venue_id, order_id, shift_id, actor_user_id, reason, occurred_at) | W | None (synchronous) | Reverses inventory_movements (reason='refund'), creates `pos_order_refunds` row, updates payment (refunded_at), triggers `sync_cash_movements_from_payments` for refund cash entry | Order must be paid, one refund per order, POS_REFUND_RPC_ENABLED flag | REPLACE | Replace with `refundOrder` typed transaction in InstantDB | `refundOrder(orderId, reason)` | Cashier refunds a paid cappuccino; stock restored, cash refund recorded, order shows refunded status | Open |
| L40 | Refund | Cashier cancels an active refund | `pos/src/api/inventory.ts:cancelRefund()` | `pos_cancel_refund` RPC (venue_id, order_id, actor_user_id, occurred_at) | W | None (synchronous) | Restores inventory_movements (reason='refund_cancel'), clears refunded_at on payment, creates cash_movements reversal | Active refund must exist, order_items signature must match (pos_order_items_signature) | REPLACE | `cancelRefund(orderId, reason)` typed transaction | `cancelRefund(orderId, reason)` | Cashier cancels a mistaken refund; stock re-deducted, payment re-instated | Open |

### Domain: Cash Management

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L41 | Cash | POS queries shift cash summary | `pos/src/api/shift.ts:fetchShiftCashSummary()` | `pos_shift_cash_summary` RPC | R | None | None | shift_id, venue_id | MIGRATE | Query for cash position | `queryShiftCashSummary(shiftId)` | Cashier sees expected cash, sales, refunds, collections on shift screen | Open |
| L42 | Cash | Cashier records cash collection (инкассация) | `pos/src/api/shift.ts:recordCashCollection()` | `pos_record_cash_collection` RPC → inserts into `cash_movements` + `cash_transactions`, updates `shifts.cash_collections_total` | W | None (synchronous) | `sync_cash_movements_from_payments` trigger | shift must be open, amount > 0 | MIGRATE | `recordCashCollection` typed command | `recordCashCollection(shiftId, amount, note)` | Cashier collects 5000 сом from register; shift cash summary reflects reduced expected cash | Open |
| L43 | Cash | Cashier records cash transaction (внесение/изъятие) | `pos/src/api/shift.ts:recordCashTransaction()` | `pos_record_cash_transaction` RPC → inserts into `cash_movements` + `cash_transactions` | W | None (synchronous) | Appears in admin cash journal | kind IN (float_in, float_out, expense, income) | MIGRATE | `recordCashTransaction` typed command | `recordCashTransaction(shiftId, kind, amount, note)` | Cashier adds 2000 сом to register for change; reflected in cash summary | Open |
| L44 | Cash | Cashier closes shift | `pos/src/api/shift.ts:closeShiftOnServer()` | `pos_close_shift` RPC | W | None (synchronous) | Sets shifts.closed_at, computes expected_cash_at_close + cash_difference_at_close | All orders must be paid/cancelled | MIGRATE | `closeShift` typed command | `closeShift(shiftId, countedCash)` | Cashier closes shift; shift shows expected vs actual cash difference | Open |
| L45 | Cash | Payment triggers cash movement (server-side trigger) | `sync_cash_movements_from_payments` TRIGGER (AFTER INSERT OR UPDATE OF refunded_at ON payments) | Automatic: creates `cash_movements` rows (sale/refund) for each payment INSERT, creates reversed cash entry for refund cancellation | Auto | Triggered by payment insert/refund | `cash_movements` for audit trail | INSERT payment → sale entry; UPDATE refunded_at → refund entry; UPDATE refunded_at to NULL → cancellation | REPLACE | Replace trigger with explicit cash movement creation in `payOrder`/`refundOrder`/`cancelRefund` transactions | (included in L30, L39, L40) | Paying for order creates a cash movement visible in admin cash journal; no hidden trigger | Open |
| L46 | Cash | Admin views cash transactions journal | `admin/src/hooks/useCashTransactions.ts`, `admin/src/hooks/useDashboardNewData.ts` | `cash_movements` SELECT (by venue, date range, shift_id), `cash_transactions` SELECT | R | None | None | venue scoping | MIGRATE | Admin query | `queryCashMovements(venueId, dateRange)`, `queryCashTransactions(venueId, dateRange)` | Admin sees all cash transactions for shift with amounts and types | Open |
| L47 | Cash | Admin creates/deletes cash transaction manually | `admin/src/hooks/useCashTransactions.ts` | `cash_movements` INSERT/DELETE | W | None | None | venue_id+shift_id | MIGRATE | Admin cash CRUD | `createCashTransaction`, `deleteCashTransaction` | Admin manually records expense; appears in cash journal | Open |
| L48 | Cash | Admin manages transaction categories | `admin/src/hooks/useTransactionCategories.ts` | `cash_transaction_categories` SELECT/INSERT/DELETE | W | None | None | type filter (expense/income) | MIGRATE | Admin config CRUD | `createTransactionCategory`, `deleteTransactionCategory` | Admin creates "Закупка продуктов" category; available when recording expense | Open |

### Domain: Warehouse & Stock Management (Admin)

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L49 | Warehouse | Admin manages warehouses (CRUD) | `admin/src/hooks/useWarehouse.ts` | `warehouses` SELECT/INSERT/UPDATE/DELETE (with pre-delete safety: checks stock_items, deliveries, writeoffs, transfers) | W | None | None | No delete if warehouse has stock or active documents | MIGRATE | Admin CRUD | `createWarehouse`, `updateWarehouse`, `deleteWarehouse` | Admin creates "Склад бара"; deletes only if empty | Open |
| L50 | Warehouse | Admin creates delivery (поставка) | `admin/src/hooks/useWarehouse.ts` | `warehouse_deliveries` INSERT, `warehouse_delivery_items` INSERT | W | None | None | warehouse_id, supplier_id, status transitions | MIGRATE | Admin document workflow | `createDelivery`, `addDeliveryItem` | Admin creates delivery with items; draft status | Open |
| L51 | Warehouse | Admin processes delivery (status → received) | `admin/src/hooks/useWarehouse.ts` | `warehouse_deliveries` UPDATE (status), `apply_delivery_stock` RPC → upserts `stock_items` | W | RPC fallback with sessionStorage cache | Stock updated for delivered items | status machine: draft → in_transit → received | MIGRATE | `processDelivery` typed command | `processDelivery(deliveryId)` → delivery + stock update atomic | Admin clicks "Принять"; delivery status → received, stock increases | Open |
| L52 | Warehouse | Admin creates write-off (списание) | `admin/src/hooks/useWarehouse.ts` | `warehouse_write_offs` INSERT, `warehouse_write_off_items` INSERT | W | None | None | warehouse_id, status transitions | MIGRATE | `createWriteOff` | `createWriteOff(warehouseId, items)` | Admin creates write-off; draft status | Open |
| L53 | Warehouse | Admin posts write-off (status → posted) | `admin/src/hooks/useWarehouse.ts` | `warehouse_write_offs` UPDATE (status), `apply_writeoff_stock` RPC → deducts `stock_items` | W | RPC fallback | Stock decreased | status machine | MIGRATE | `postWriteOff` | `postWriteOff(writeOffId)` → write-off + stock deduction atomic | Admin posts write-off; stock decreases, write-off finalized | Open |
| L54 | Warehouse | Admin creates transfer (перемещение) | `admin/src/hooks/useWarehouse.ts` | `warehouse_transfers` INSERT, `warehouse_transfer_items` INSERT | W | None | None | source + destination warehouse, status transitions | MIGRATE | `createTransfer` | `createTransfer(sourceWh, destWh, items)` | Admin creates transfer between warehouses; draft status | Open |
| L55 | Warehouse | Admin posts transfer | `admin/src/hooks/useWarehouse.ts` | `warehouse_transfers` UPDATE (status), `apply_transfer_stock` RPC → moves `stock_items` between warehouses | W | RPC fallback | Stock deducted from source, added to destination | status machine, source != dest | MIGRATE | `postTransfer` | `postTransfer(transferId)` → transfer + stock movement atomic | Admin posts transfer; stock moves between warehouses | Open |
| L56 | Warehouse | Admin conducts inventory session (инвентаризация) | `admin/src/hooks/useWarehouse.ts` | `warehouse_inventory_sessions` INSERT, `warehouse_inventory_lines` INSERT/DELETE | W | None | None | warehouse_id, session scoping | MIGRATE | `createInventorySession`, `saveInventoryLines` | `createInventorySession(warehouseId)`, `saveInventoryLines(sessionId, lines)` | Admin starts inventory, enters actual counts | Open |
| L57 | Warehouse | Admin posts inventory (apply corrections) | `admin/src/hooks/useWarehouse.ts` | `warehouse_inventory_sessions` UPDATE (status), `apply_inventory_stock` RPC → corrects `stock_items` to actual values | W | RPC fallback | Stock corrected to actual counts from counted values | session must have lines | MIGRATE | `postInventory` | `postInventory(sessionId)` → inventory + stock correction atomic | Admin posts inventory; stock corrected to actual counts | Open |
| L58 | Warehouse | Admin manages warehouse-product visibility | `admin/src/hooks/useWarehouse.ts` | `warehouse_products` SELECT/INSERT/DELETE, `stock_items` SELECT (product stock per warehouse) | R+W | None | None | warehouse_id + product_id uniqueness | MIGRATE | `linkProductToWarehouse`, `unlinkProduct` | `linkProductToWarehouse(productId, warehouseId)`, `unlinkProductFromWarehouse(productId, warehouseId)` | Admin adds ingredient to warehouse visibility; appears in that warehouse's inventory | Open |
| L59 | Warehouse | Admin views stock items (ingredients) | `admin/src/hooks/useDashboardNewData.ts`, `admin/src/hooks/useMenuData.ts`, `admin/src/hooks/useAnalytics.ts` | `stock_items` SELECT (by warehouse, with products join, filtering low/negative stock) | R | None | None | venue → warehouse scoping | MIGRATE | Query | `queryStockItems(warehouseId)`, `queryLowStock(venueId)` | Admin dashboard shows stock levels; low stock alerts | Open |

### Domain: Admin Dashboard & Analytics

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L60 | Analytics | Admin views dashboard metrics (orders, revenue, shifts) | `admin/src/hooks/useDashboardNewData.ts` | `orders` SELECT (paid/active/alert by date filters), `shifts` SELECT (active/yesterday/closed), `cash_movements` SELECT (expenses), `stock_items` SELECT (low/negative), `order_items` SELECT (top dishes), `order_events` SELECT (suspicious), `warehouse_delivery_items` SELECT (anomalies) | R | None | None | venue scoping, date range filters, chunkedInQuery pattern | MIGRATE | Dashboard queries | `queryDashboardMetrics(venueId, dateRange)` | Admin sees revenue, order count, low stock alerts, suspicious checks on dashboard | Open |
| L61 | Analytics | Admin views full analytics (revenue, COGS, labor) | `admin/src/hooks/useAnalytics.ts`, `admin/src/hooks/useAnalyticsProfit.ts` | `order_items` SELECT (JOIN orders for paid items), `recipe_items` SELECT (cost index), `orders` SELECT (counts), `shifts` SELECT (cashiers), `users` SELECT (names), `warehouse_inventory_sessions` + `warehouse_inventory_lines` SELECT (overconsumption), `inventory_movements` SELECT (actual COGS from sale reason), `admin_inventory_period_movements` RPC | R | None | None | venue + warehouse + date scoping | MIGRATE | Analytics queries | `queryRevenueAnalytics(venueId, period)`, `queryCostAnalytics(venueId, period)`, `queryInventoryMovements(warehouseId, period)` | Admin sees revenue chart, cost breakdown, profit margin, inventory movement aggregation | Open |
| L62 | Analytics | Admin views top items | `admin/src/hooks/useTopItems.ts` | `orders` SELECT (paid in range → IDs), `order_items` SELECT (aggregate by name), `products` SELECT (low stock) | R | None | None | date range | MIGRATE | `queryTopItems(venueId, period)` | `queryTopItems(venueId, period)` | Admin sees best-selling dishes in period | Open |

### Domain: Marketplace (Delivery Integrations) — FIRST CUTOVER DROP

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L63 | Marketplace | Glovo/Yandex EDA creates marketplace order | `pos/src/store/orderOutboxStore.ts:execCreate()` (via order_source + external_order_id fields) | `orders` INSERT with order_source='glovo'/'yandex_eda', external_order_id, integration_metadata | W | Outbox (same as POS) | Appears in realtime channels, order list | order_source field, external_order_id uniqueness | DROP | First cutover excludes delivery integrations per primary design | — | — | Confirmed 2026-07-28 |
| L64 | Marketplace | Delivery service sends order event | Glovo Edge Function → `marketplace_inbound_events` INSERT | W | None | None | provider+external_event_id uniqueness | DROP | First cutover excludes delivery integrations | — | — | Confirmed 2026-07-28 |
| L65 | Marketplace | POS finalizes marketplace active stock | `pos_finalize_marketplace_active_stock` RPC | W | None | Like pos_finalize_order_stock but for marketplace order lines | N/A | DROP | First cutover excludes delivery integrations | — | — | Confirmed 2026-07-28 |
| L66 | Marketplace | POS cancels unpaid marketplace order | `pos_cancel_unpaid_marketplace_order` RPC | W | None | Reverses marketplace order | N/A | DROP | First cutover excludes delivery integrations | — | — | Confirmed 2026-07-28 |
| L67 | Marketplace | Yandex EDA token management | `marketplace_yandex_issue_token`/`marketplace_yandex_validate_token` RPCs, `marketplace_api_clients`/`marketplace_access_tokens` tables | W | None | None | Token expiry, scopes | DROP | First cutover excludes delivery integrations | — | — | Confirmed 2026-07-28 |
| L68 | Marketplace | Marketplace order numbering | `marketplace_next_order_number` RPC, `venue_order_counters` table | W | None | Atomic counter increment | venue-level counter | DROP | First cutover excludes delivery integrations | — | — | Confirmed 2026-07-28 |
| L69 | Marketplace | Marketplace modifier bindings | `marketplace_modifier_bindings` table (venue+provider → product/modifier mapping) | R+W | None | None | venue+provider uniqueness | DROP | First cutover excludes delivery integrations | — | — | Confirmed 2026-07-28 |

### Domain: Real-time Notifications

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L70 | Notification | POS receives app notifications | `pos/src/store/notificationStore.ts:subscribe()` | `supabase.channel('app-notifications')` on `notifications` INSERT (venue_id filter) | SUBSCRIBE | Offline: notifications queued, delivered on reconnect | Triggers toast/alert on POS | venue_id filter | REPLACE | Replace with InstantDB live query on `notifications` entity | (InstantDB handles natively) | Admin creates notification; POS shows toast | Open |

### Domain: POS Local SQLite Persistence

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L71 | SQLite | POS caches catalog (menu + floor plan) locally | `pos/src/store/menuStore.ts:saveToCatalog()/loadFromCatalog()` | `catalog` SQLite table (type + data_json) | R+W | Primary offline fallback; loaded before Supabase fetch; fingerprint-based change detection | None | type-based lookup | REPLACE | Replace with InstantDB offline persistence | (InstantDB handles natively) | POS opens offline; shows cached menu and floor plan | Open |
| L72 | SQLite | POS persists orders locally | `pos/src/store/orderStore.ts` via `src/db/database.ts` | `local_orders` SQLite table (id + data_json + synced_at + updated_at) | R+W | Loaded on startup for instant display; saved on every mutation; marked synced after server ack | None | id uniqueness, synced_at tracks sync status | REPLACE | Replace with InstantDB offline persistence | (InstantDB handles natively) | POS opens offline; shows previously created orders | Open |
| L73 | SQLite | POS queues order mutations (outbox) | `pos/src/store/orderOutboxStore.ts` via `src/db/database.ts` | `order_outbox` SQLite table (id + action_type + action_json + created_at + retries + last_error) | R+W | Retry with exponential backoff (max 6 retries, 5-min staleness); escalated by removing from queue on permanent failure | None | dedup by id, retry threshold | REPLACE | Replace with InstantDB's built-in offline write queue | (InstantDB handles natively) | POS creates order offline; order synced when connection restored | Open |
| L74 | SQLite | POS queues consumption finalization (outbox) | `pos/src/store/syncOutboxStore.ts` via `src/db/database.ts` | `consumption_outbox` SQLite table (id + action_json + created_at + retries + last_error) | R+W | Retry with exponential backoff (max 6 retries, 5-min staleness); escalated to server dead-letter on permanent failure | Escalation to `pos_consumption_dead_letters` | dedup by idempotencyKey | REPLACE | Replace with InstantDB's built-in offline write queue — consumption is atomic with payment | (InstantDB handles natively) | POS finalizes payment offline; stock consumed when connection restored | Open |

### Domain: SQL Side Effects (Triggers, Derived Data)

| ID | Domain | User Action | Current Caller | Current Interaction | R/W | Offline Behavior | Side Effects | Invariants | Decision | Reason | Target API | Acceptance | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L75 | SQL | zones.updated_at auto-set | `trg_zones_updated_at` TRIGGER (BEFORE UPDATE ON zones) | Auto: sets updated_at = NOW() | Auto | N/A | Audit timestamp | Every zone update | MIGRATE | Schema-level updated_at on InstantDB zones entity | (schema field) | Admin updates zone name; updated_at reflects change time | Open |
| L76 | SQL | RLS policies (all wide-open or venue-scoped) | Various migrations (A2–A15, A21–A25, A49–A50) | ~50 policies across ~30 tables | Auto | N/A | Access control | venue_id scoping, service_role for sensitive operations | REPLACE | Replace ALL RLS policies with deny-by-default InstantDB permissions (instant.perms.ts) | (permission rules) | Anon POS client cannot read other venues' data; service_role operations require authenticated admin | Open |
| L77 | SQL | `user_has_venue_access` function | `user_has_venue_access` SECURITY DEFINER (A24) | Returns true for anon, checks user_venues for authed | Auto | N/A | Access control gate for warehouse policies | multi-tenant isolation | REPLACE | Replace with InstantDB permission rules | (permission rules) | Same as L76 — transparent access control | Open |
| L78 | Security | Database creation automatically enables RLS | Deployed-only `public.rls_auto_enable()` | Remote function returning `event_trigger`; no active event trigger appears in deployed public dump | Auto | N/A | Would enable RLS on newly created tables if attached | New tables must never remain unintentionally public | DROP | Orphaned deployed drift: function is absent from migrations and no active event trigger was dumped; replace invariant with explicit deny-by-default Instant permissions | `instant.perms.ts` deny-by-default rules | Adding a new entity exposes no data until explicit permissions are added | Confirmed 2026-07-28 |

---


## 3. Coverage Proof

### Sources Audited

| Source | Files Scanned | Interactions Found |
|---|---|---|
| **POS — Stores** | `orderStore.ts`, `orderOutboxStore.ts`, `syncOutboxStore.ts`, `shiftStore.ts`, `menuStore.ts`, `venueStore.ts`, `notificationStore.ts`, `deadLetterStore.ts`, `ordersUiStore.ts` | 28 .from() calls, 0 .rpc() in stores (all RPCs in api/) |
| **POS — API** | `payments.ts`, `inventory.ts`, `consumption.ts`, `shift.ts` | 11 .rpc() calls, 2 .from() calls |
| **POS — Hooks** | `useOrderRealtime.ts` | 2 .channel() + 2 .removeChannel() |
| **POS — Screens** | `PaymentScreen.tsx` | 2 .from().insert() calls (order_events) |
| **POS — SQLite** | `src/db/database.ts` | 5 tables (schema_version, order_outbox, catalog, local_orders, consumption_outbox), 10 CRUD operations |
| **POS — Utils** | `supabase.ts` (client), `supabase-helpers.ts` (unused safeRpc wrapper) | 0 |
| **Admin — Hooks** | `useDashboardNewData.ts`, `useAnalytics.ts`, `useMenuData.ts`, `useWarehouse.ts`, `useCashTransactions.ts`, `useChecksData.ts`, `useShiftsData.ts`, `useDashboardData.ts`, `useAnalyticsProfit.ts`, `useDishData.ts`, `useTopItems.ts`, `useWeeklyStats.ts`, `useMonthlyStats.ts`, `useHeatmapData.ts`, `useVenueSettings.ts`, `useTransactionCategories.ts`, `useStaffData.ts`, `useInitDefaults.ts`, `useFloorPlan.ts`, `useExpenseCategories.ts` | ~95 .from() calls, 6 .rpc() calls |
| **Admin — Pages** | `Categories.tsx`, `Checks.tsx`, `DishEdit.tsx`, `EditIngredient.tsx`, `Menu.tsx`, `Staff.tsx`, `AddIngredients.tsx` | ~30 .from() calls (CRUD) |
| **Admin — Lib** | `ingredientStock.ts`, `inventoryPeriodMovements.ts`, `supabase.ts` | 2 .from() calls, 1 .rpc() |
| **Admin — Auth** | `AuthProvider.tsx` | `supabase.auth.*` (4 calls) |
| **Admin — Scripts** | `seed-demo.ts`, `inject-events.ts`, `shift-dates-today.ts` | 3 .rpc() calls (demo_clean_venue, demo_gen_orders, demo_shift_dates), table INSERT |
| **Supabase SQL** | 95 timestamped migrations in `~/r_keeper-admin/supabase/migrations/`, all matched remotely | 49 deployed tables, 41 deployed functions, 3 row triggers, 118 deployed policies, 8 enums, 18 idempotency/unique constraints |
| **Supabase Seeds** | `seed.sql`, `seeds/dev_pos_warehouse_seed.sql`, `demo_profit_data.sql` | 3 seed artifacts |
| **Supabase Smoke** | `smoke_checks/admin_health_check.sql` | 1 smoke check |
| **Manual SQL** | `fix_workshop_id_null.sql`, `retry_dead_letters.sql`, `apply_admin_migrations.sql` | 3 manual scripts |

### Counts

| Metric | Count |
|---|---|
| Total POS Supabase interactions (FROM + RPC + CHANNEL) | 58 |
| Total Admin Supabase interactions (FROM + RPC) | ~130 |
| Total SQLite tables | 5 |
| Total SQLite CRUD operations | 10 |
| Total deployed SQL tables | 49 |
| Total deployed SQL functions (final, collapsed) | 41 |
| Total deployed SQL triggers | 3 |
| Total deployed RLS policies | 118 |
| Total ledger rows | 78 |
| Total artifact registry entries | 98 |
| Total idempotency/unique constraints | 18 |
| **Unresolved rows** | **0** |
| **Product confirmations outstanding** | **0** |

### Confirmed Product Decisions — 2026-07-28

| Scope | Approved decision | Ledger rows |
|---|---|---|
| Auth and tenancy | Use a venue-bound trusted device and employee PIN; replace Supabase email/password, `users` and `user_venues` authorization with Instant Auth/device authorization and employee PIN selection. | L1–L3 |
| Persisted state and realtime | InstantDB owns persisted domain data, live queries and offline synchronization; remove catalog, order and consumption SQLite caches/outboxes and Supabase realtime channels. | L9, L22, L24, L34–L37, L70–L74 |
| Payments, inventory, refunds and cash | Use typed atomic commands: `payOrder` creates payment, order transition, cash entry, inventory movements and event; refund/cancel-refund are compensating transactions; do not retain RPCs or the payment cash trigger. | L16, L30, L33, L39–L40, L45 |
| Authorization | Replace every Supabase RLS policy and `user_has_venue_access` with deny-by-default Instant permissions. The deployed-only, unattached `rls_auto_enable()` function is not ported. | L76–L78 |
| Delivery marketplace | Exclude Glovo/Yandex Eda ingestion, auth, order numbering, stock settlement and binding tables from the first cutover. | L63–L69 |

All remaining `REPLACE` decisions retain their ledger target API and acceptance scenario as the approved product behavior. These are implementation items, not open product questions.

## 4. Derived First-Slice Command/Query Map

From the ledger, the following typed API surface is implied for `@rkeeper/data`:

### Commands (write)

```typescript
// Tenancy & Auth
activateDevice(deviceId, venueId): DeviceAuthorization
revokeDevice(deviceId): void
selectEmployee(pin: string, deviceId: string): Employee

// Shift
openShift(employeeId: string, startingCashTiyin: number): Shift
closeShift(shiftId: string, countedCashTiyin: number): CloseShiftResult

// Order
createOrder(input: CreateOrderInput): Order
updateOrder(orderId: string, patch: UpdateOrderPatch): void
deleteOrder(orderId: string): void
addOrderLine(orderId: string, productId: string, modifiers: ModifierSelection[]): OrderLine
removeOrderLine(orderId: string, lineId: string): void
transferOrder(orderId: string, toEmployeeId: string): void
managerTakeoverOrder(orderId: string, reason: string): void

// Kitchen
sendToKitchen(orderId: string): KitchenTicket
reprintKitchenTicket(ticketId: string): void

// Payment
payOrder(input: PayOrderInput): PaymentResult  // atomic: payment + status + stock + cash + events
refundOrder(orderId: string, reason: string): RefundResult
cancelRefund(orderId: string, reason: string): void

// Cash
recordCashCollection(shiftId: string, amountTiyin: number, note?: string): void
recordCashTransaction(shiftId: string, kind: CashKind, amountTiyin: number, note?: string): void

// Dead letters (admin recovery)
retryDeadLetter(idempotencyKey: string): void
ackDeadLetter(idempotencyKey: string, reason: string): void

// Admin: Catalog CRUD
createCategory(input: CreateCategoryInput): Category
updateCategory(id: string, patch: UpdateCategoryPatch): void
deleteCategory(id: string): void
createProduct(input: CreateProductInput): Product
updateProduct(id: string, patch: UpdateProductPatch): void
deleteProduct(id: string): void
addModifierGroup(productId: string, input: CreateModifierGroupInput): ModifierGroup
updateModifierGroup(id: string, patch: UpdateModifierGroupPatch): void
removeModifierGroup(productId: string, groupId: string): void
addModifier(groupId: string, input: CreateModifierInput): Modifier
updateModifier(id: string, patch: UpdateModifierPatch): void
deleteModifier(id: string): void

// Admin: Staff
createEmployee(input: CreateEmployeeInput): Employee
updateEmployee(id: string, patch: UpdateEmployeePatch): void
deleteEmployee(id: string): void

// Admin: Floor Plan
createZone(input: CreateZoneInput): Zone
updateZone(id: string, patch: UpdateZonePatch): void
deleteZone(id: string): void
createTable(zoneId: string, input: CreateTableInput): Table
deleteTable(id: string): void
updateTableLayout(id: string, layout: TableLayout): void

// Admin: Warehouse
createWarehouse(input: CreateWarehouseInput): Warehouse
updateWarehouse(id: string, patch: UpdateWarehousePatch): void
deleteWarehouse(id: string): void
createDelivery(warehouseId: string, items: DeliveryItem[]): Delivery
processDelivery(deliveryId: string): void
createWriteOff(warehouseId: string, items: WriteOffItem[]): WriteOff
postWriteOff(writeOffId: string): void
createTransfer(sourceWhId: string, destWhId: string, items: TransferItem[]): Transfer
postTransfer(transferId: string): void
createInventorySession(warehouseId: string): InventorySession
saveInventoryLines(sessionId: string, lines: InventoryLine[]): void
postInventory(sessionId: string): void

// Admin: Cash
createCashTransaction(shiftId: string, input: CreateCashTxInput): CashTransaction
deleteCashTransaction(id: string): void

// Admin: Config
updateVenue(patch: UpdateVenuePatch): void
```

### Queries (read)

```typescript
// Venue & Auth
queryVenue(venueId: string): Venue
queryEmployees(venueId: string): Employee[]

// Catalog (with offline cache)
queryCategories(venueId: string): Category[]
queryProducts(venueId: string, categoryId?: string): Product[]
queryModifierGroups(productId: string): ModifierGroupWithModifiers[]
queryIngredients(venueId: string): Ingredient[]
queryCatalogVersion(venueId: string): string  // fingerprint for change detection

// Floor Plan
queryZones(venueId: string): Zone[]
queryTables(venueId: string, zoneId?: string): Table[]

// Shift
queryActiveShift(venueId: string): Shift | null
queryShiftTotals(shiftId: string): ShiftTotals
queryShiftCashSummary(shiftId: string): CashSummary
queryShifts(venueId: string, dateRange: DateRange): Shift[]

// Order
queryActiveOrders(venueId: string, shiftId: string): Order[]
queryOrderDetail(orderId: string): OrderWithItems
queryOrders(venueId: string, dateRange: DateRange): Order[]  // admin

// Payment
queryPayment(orderId: string): Payment | null
queryActiveRefunds(shiftId: string): Refund[]

// Cash
queryCashMovements(venueId: string, dateRange: DateRange): CashMovement[]
queryCashTransactions(venueId: string, dateRange: DateRange): CashTransaction[]

// Inventory & Stock
queryStockItems(warehouseId: string): StockItem[]
queryLowStock(venueId: string): StockAlert[]
queryInventoryMovements(warehouseId: string, period: DateRange): InventoryMovement[]
queryDeadLetters(venueId: string): DeadLetter[]

// Dashboard & Analytics
queryDashboardMetrics(venueId: string): DashboardMetrics
queryRevenueAnalytics(venueId: string, period: DateRange): RevenueAnalytics
queryCostAnalytics(venueId: string, period: DateRange): CostAnalytics
queryTopItems(venueId: string, period: DateRange): TopItem[]
queryOverconsumption(warehouseId: string, period: DateRange): OverconsumptionReport

// Admin: Warehouse
queryWarehouses(venueId: string): Warehouse[]
queryDeliveries(warehouseId: string, dateRange: DateRange): Delivery[]
queryWriteOffs(warehouseId: string, dateRange: DateRange): WriteOff[]
queryTransfers(warehouseId: string, dateRange: DateRange): Transfer[]
queryInventorySessions(warehouseId: string): InventorySession[]
```

### Live Queries (realtime)

All entity queries that POS subscribes to become InstantDB live queries — no explicit channel management needed:

- `orders` (venue_id + shift_id filter)
- `order_items` (by order)
- `notifications` (venue_id filter)

---

## 5. Verification Principle

Gate 0 is complete. Proof is in coverage: every deployment artifact, client callsite, and server-side effect has been traced to at least one ledger row with a decision and target. The derived command/query map covers all retained first-slice behavior.

**Next step:** Product confirmation on DROP/REPLACE items (marketplace, auth model, payment atomicity). Then proceed to Gate 1 (monorepo foundation) per `2026-07-25-instantdb-next-session-handoff.md`.
