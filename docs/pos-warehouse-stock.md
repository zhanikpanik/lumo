# POS warehouse-centric stock (`pos_finalize_order_stock`)

## Source of truth

- Quantities live in **`stock_items`** (`warehouse_id`, `product_id`, `quantity`, `unit`).
- Each **`products.workshop_id`** (for `type = dish`) resolves a warehouse via **`workshops.default_warehouse_id`**.
- **`apply_stock_delta`** (see `20260505000000_inventory_consumption.sql`) performs the atomic upsert into `stock_items`.
- Service-only access hardening and strict checks are in `20260509000000_pos_stock_security_hardening.sql`.

## RPC

`pos_finalize_order_stock(p_venue_id, p_order_id, p_occurred_at, p_lines jsonb, p_shift_id, p_strict_insufficient default true)`

- **Idempotency:** `pos_order_stock_settlements.order_id` (one successful settlement per order). Retries return `{ ok: true, duplicate: true }`.
- **Legacy:** rows from `order_sale_consumption_batches` are copied into `pos_order_stock_settlements` once in migration `20260508121000_pos_warehouse_stock.sql` to avoid a second deduction when switching RPCs.
- **Strict mode:** `p_strict_insufficient = true` rejects with `insufficient_stock` and `detail` `{ warehouse_id, product_id, unit, available, delta }` before any `stock_items` change.
- **Access control:** `service_role` and **`anon`** (publishable key / POS without Supabase Auth session) pass the gate; signed-in users require a `user_venues` row for `p_venue_id`. Others receive `forbidden`. (See migration `20260509120000_pos_finalize_allow_anon_client.sql`.)
- **Line integrity:** each line is validated against `order_items`, `products.venue_id`, and `workshops.venue_id`.

### Business errors (`ok: false`, `error` string)

| `error` | Meaning |
|---------|---------|
| `order_not_found` | `orders.id` / `venue_id` mismatch |
| `order_not_paid` | Order not `paid` |
| `no_qualifying_payment` | No `payments` row with cash/card/qr/other |
| `missing_workshop_id` | Dish without `products.workshop_id` |
| `missing_default_warehouse_id` | `workshops.default_warehouse_id` null |
| `insufficient_stock` | Strict mode; check `detail` |
| `forbidden` | Caller has no allowed venue access path |
| `invalid_line_payload` | Line payload has invalid or missing ids |
| `order_item_mismatch` | `order_item_id` is not linked to `p_order_id` |
| `line_product_mismatch` | Provided `product_id` differs from order item |
| `product_not_in_venue` | Product does not belong to `p_venue_id` |

## Client example

See [`src/api/inventory.ts`](../src/api/inventory.ts) — `finalizeOrderConsumption()` wraps the RPC and maps `detail` on failure.

```typescript
const res = await finalizeOrderConsumption({
  venueId: VENUE_ID,
  orderId,
  occurredAt: closedAt,
  idempotencyKey: saleConsumptionIdempotencyKey(orderId),
  lines: items.map((i) => ({
    order_item_id: i.id,
    product_id: i.product.id,
    quantity: i.quantity,
    modifier_ids: i.modifiers.map((m) => m.id),
  })),
  shiftId,
  strictInsufficientStock: true,
});

if (!res.ok) {
  if (res.error === 'insufficient_stock') {
    console.warn('Stock', res.detail);
  }
  // enqueue outbox, show non-blocking banner, etc.
}
```

## Verification SQL (manual)

Prereq: migration applied; kitchen dish `dk` has `workshop_id = kitchen`, bar dish `db` has `workshop_id = bar`; distinct `default_warehouse_id`; `recipe_items` for each; `stock_items` seeded with enough qty.

If you need fixed demo kitchen/bar UUID fixtures, run `supabase/seeds/dev_pos_warehouse_seed.sql` manually in dev only.

1. **Kitchen vs bar warehouse**

```sql
-- Before / after a paid POS order for kitchen dish: only warehouse 6002 changes for that ingredient
SELECT warehouse_id, product_id, quantity FROM stock_items
WHERE warehouse_id IN (
  '00000000-0000-0000-0000-000000006002',
  '00000000-0000-0000-0000-000000006003'
)
ORDER BY warehouse_id, product_id;
```

2. **Idempotency**

```sql
SELECT * FROM pos_order_stock_settlements WHERE order_id = '<order_uuid>';
-- Call pos_finalize_order_stock twice with same payload: second returns duplicate=true; stock unchanged.
```

3. **RPC grants (service-only)**

```sql
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('pos_finalize_order_stock', 'finalize_order_consumption', 'apply_stock_delta')
ORDER BY routine_name, grantee;
-- Expect EXECUTE only for service_role.
```

4. **RLS policies (no allow-all client paths)**

```sql
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'pos_order_stock_settlements';
-- Expect service_role-only policy and no client allow-all policies.
```

## Admin compatibility

Deliveries, write-offs, and transfers should keep using **`apply_stock_delta`** or direct `stock_items` / movement inserts as today; POS path does not replace those flows.
