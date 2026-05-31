# Yandex Eda Integration — Phase 1A (Menu) + Phase 1B (Orders)

Pull-model integration with Yandex Eda. Yandex hits our endpoints to:
- Phase 1A: refresh restaurants, menu composition, availability and promos.
- Phase 1B: create orders (POST), poll their state (GET), push lifecycle
  transitions (PUT) and cancel them (DELETE).

- Edge function: [`supabase/functions/yandex-eda`](../supabase/functions/yandex-eda/index.ts)
- Phase 1A migration: [`supabase/migrations/20260516000000_yandex_eda_phase1a.sql`](../supabase/migrations/20260516000000_yandex_eda_phase1a.sql)
- Phase 1B migration: [`supabase/migrations/20260517000000_yandex_eda_phase1b.sql`](../supabase/migrations/20260517000000_yandex_eda_phase1b.sql)

## Public URL

Local: `http://127.0.0.1:54321/functions/v1/yandex-eda`

Remote: `https://<project-ref>.supabase.co/functions/v1/yandex-eda`

Yandex appends their resource path after that prefix, e.g.
`/security/oauth/token`, `/restaurants`, `/menu/{restaurantId}/composition`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST   | `/security/oauth/token` | OAuth2 `client_credentials`. Accepts `application/x-www-form-urlencoded` and JSON. |
| GET    | `/restaurants` | `{ places: [{ id, title, address }] }` scoped to the caller's organization. |
| GET    | `/restaurants/availability` | `{ places: [{ id, enabled }] }`. |
| GET    | `/menu/{restaurantId}/composition` | `application/vnd.eats.menu.composition.v2+json` — categories + items + modifierGroups. |
| GET    | `/menu/{restaurantId}/availability` | `application/vnd.eats.menu.availability.v2+json` — empty arrays in v1A. |
| GET    | `/menu/{restaurantId}/promos` | `{ promos: [] }` in v1A. |
| POST   | `/order` | Order intake. `Content-Type: application/vnd.eats.order.v2+json`. Requires scope `write`. |
| GET    | `/order/{eatsId}` | Returns saved payload + latest status. `Content-Type: application/vnd.eats.order.v2+json`. |
| GET    | `/order/{eatsId}/status` | `{ status, comment, updatedAt }`. `Content-Type: application/vnd.eats.order.status.v2+json`. |
| PUT    | `/order/{eatsId}/status` | Lifecycle update (`COOKING`, `READY`, `TAKEN_BY_COURIER`, `DELIVERED`, `CANCELLED`). Requires scope `write`. |
| DELETE | `/order/{eatsId}` | Cancellation. Refunds CARD orders, restocks CASH-active orders. Requires scope `write`. |

### Error shapes

| Status | Body |
|--------|------|
| 400    | `{ error: "...", error_description?: "..." }` (OAuth + validation) |
| 401    | `{ reason: "..." }` (matches Yandex spec) |
| 404    | `{ reason: "..." }` |
| 405    | `{ reason: "Method not allowed" }` |
| 500    | `[{ code: 100, description: "Internal error" }]` |

## Auth model

All non-OAuth routes require `Authorization: Bearer <access_token>`.

- `marketplace_api_clients` stores one row per Yandex partner. `client_id` is public, `client_secret_hash = sha256(salt || ":" || secret)`. Compare with `timingSafeEqual` to avoid timing attacks.
- `marketplace_access_tokens` stores `sha256(token)` (never the plaintext) plus `expires_at` (1h TTL by default).
- Token validation goes through `marketplace_yandex_validate_token(p_token_hash)` (SECURITY DEFINER, service_role only).
- Each call is scoped to the client's `organization_id`. The function only returns venues that belong to that organization and have an enabled `marketplace_store_bindings` row with `provider='yandex_eda'`.

### Token lifecycle

- Issued tokens live in `marketplace_access_tokens` and are deleted in three ways:
  - Implicit cleanup on issue (`marketplace_yandex_issue_token` drops tokens older than `now() - interval '1 day'`).
  - Manual call to `marketplace_cleanup_access_tokens()`.
  - `pg_cron` job `marketplace_cleanup_access_tokens` runs every 15 minutes if the extension is available on the project (no-op otherwise — opportunistic cleanup is enough).

## Onboarding a partner

1. Register the venue's `external_store_id` in `marketplace_store_bindings`:
   ```sql
   insert into marketplace_store_bindings (venue_id, provider, external_store_id, enabled)
   values ('<venue uuid>', 'yandex_eda', '<external id from Yandex>', true);
   ```
2. Create an API client:
   ```sql
   -- Pick a salt + secret out-of-band. Hash with: sha256(salt || ':' || secret)
   insert into marketplace_api_clients
     (provider, client_id, client_secret_hash, client_secret_salt, organization_id, scopes)
   values
     ('yandex_eda', '<client_id>', '<hex hash>', '<salt>', '<org uuid>', array['read']);
   ```
3. Share `client_id` + `client_secret` with Yandex via their partner portal.
4. Map Yandex menu item IDs to ours by setting `products.external_source='yandex_eda'` and `products.external_id='<Yandex item id>'` for every dish that should be orderable.
5. Map Yandex modifier IDs via `marketplace_modifier_bindings (provider='yandex_eda', external_modifier_id, modifier_id, enabled=true)`.
6. Issue a Phase 1B-capable client by adding `'write'` to its `scopes`: `update marketplace_api_clients set scopes = array['read','write'] where id = '<uuid>';`.

## Local testing

```bash
supabase functions serve yandex-eda --no-verify-jwt

# 1) Get a token
curl -X POST 'http://127.0.0.1:54321/functions/v1/yandex-eda/security/oauth/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=<client_id>&client_secret=<secret>&grant_type=client_credentials&scope=read'

# 2) List restaurants
curl 'http://127.0.0.1:54321/functions/v1/yandex-eda/restaurants' \
  -H 'Authorization: Bearer <access_token>'

# 3) Composition
curl 'http://127.0.0.1:54321/functions/v1/yandex-eda/menu/<external_store_id>/composition' \
  -H 'Authorization: Bearer <access_token>' \
  -H 'Accept: application/vnd.eats.menu.composition.v2+json'
```

For end-to-end contract validation use the Yandex Eda Postman collections referenced from their docs.

## Data mapping

| Yandex field | Source |
|--------------|--------|
| `places[].id` | `marketplace_store_bindings.external_store_id` |
| `places[].title` | `venues.name` |
| `places[].address` | `venues.address` (empty string if NULL) |
| `categories[].id` | `categories.id` (UUID) |
| `categories[].name` | `categories.name` |
| `categories[].sortOrder` | `categories.sort_order`, defaults to 100 |
| `items[].id` | `products.id` |
| `items[].categoryId` | `products.category_id` |
| `items[].name` | `products.name` |
| `items[].price` | `products.price` (numeric) |
| `items[].modifierGroups[].id` | `modifier_groups.id` |
| `items[].modifierGroups[].minSelectedModifiers` | `1` if `modifier_groups.is_required`, else `0` |
| `items[].modifierGroups[].maxSelectedModifiers` | `modifier_groups.max_select` (falls back to count) |
| `items[].modifierGroups[].modifiers[]` | `modifiers` rows with `is_active=true` |

Only `products` rows with `type='dish'`, `is_active=true`, and `price > 0` enter the composition.

## Phase 1B — Order lifecycle

### Status machine (Yandex-side)

```
ACCEPTED_BY_RESTAURANT → COOKING → READY → TAKEN_BY_COURIER → DELIVERED
        │                  │       │             │
        └──────────────────┴───────┴─────────────┴──→ CANCELLED
```

- We initialise every new order at `ACCEPTED_BY_RESTAURANT`.
- `PUT /order/{id}/status` validates the transition; invalid combinations return `400 [{code:100,description:"Invalid status transition"}]`.
- Sending the current status to `PUT` is a 200 no-op (idempotent).
- `CANCELLED` is terminal and runs the same refund/restock flow as `DELETE /order/{id}`.

### Payment semantics

| `paymentType` | Internal status at POST | Payment row | Stock RPC | Refund on cancel |
|---------------|-------------------------|-------------|-----------|------------------|
| `CARD`        | `paid`                  | `method='other'`, idempotency `yandex_eda:<eatsId>` | `pos_finalize_order_stock` (non-strict) | `pos_refund_order` |
| `CASH`        | `active`                | none — cashier collects from courier later via the standard POS flow | `pos_finalize_marketplace_active_stock` | `pos_cancel_unpaid_marketplace_order` |

### Order payload shape

We accept the v2 vendor JSON with the following fields (best-effort; unknown fields are stored verbatim in `integration_metadata.original_payload`):

```jsonc
{
  "eatsId": "string",
  "restaurantId": "string",
  "paymentType": "CARD" | "CASH",
  "discriminator": "marketplace" | "yandex" | "pickup",
  "createdAt": "<iso>",
  "comment": "string",
  "customer": { ... },
  "deliveryInfo": { ... },
  "paymentInfo": { ... },
  "items": [
    {
      "id": "<products.external_id>",
      "name": "Латте",
      "quantity": 1,
      "price": 250,
      "modifications": [
        { "id": "<marketplace_modifier_bindings.external_modifier_id>", "name": "Кокосовое молоко", "quantity": 1, "price": 30 }
      ]
    }
  ]
}
```

Both `modifications[]` and `modifiers[]` are accepted as the array name. Required fields: `eatsId`, `restaurantId`, `paymentType`, at least one item.

### requires_review handling

If we encounter any of these conditions, the order is still accepted but `integration_metadata.requires_review=true` is set:

- One or more `items[].id` not found in `products.external_id` for the venue (`unmapped_products` populated).
- One or more modifier external ids missing from `marketplace_modifier_bindings`, or mapped to a modifier not linked to the product (`unmapped_attributes` populated).
- Stock RPC returns `ok=false` (`stock_settlement_error` populated).

Ops can filter such orders with:

```sql
select id, external_order_id, integration_metadata
from orders
where order_source = 'yandex_eda'
  and (integration_metadata->>'requires_review')::boolean is true;
```

## Marketplace notifications in POS

When a new marketplace order (Glovo or Yandex Eda) lands in `orders`, the POS:

- Plays a short WebAudio chirp (sine wave, throttled to ≤ 1 sound per 2 seconds).
- Pulses the matching card in OrdersScreen (scale + opacity loop) until the cashier opens it.
- Shows a counter chip "Новых заказов: N" in the top-right of the LockScreen so a locked terminal still surfaces unseen orders.

State lives in `useNotificationStore` (`src/store/notificationStore.ts`):

| Action | Trigger |
|--------|---------|
| `addUnseen(orderId)` | `useOrderRealtime` on INSERT for `order_source in ('glovo','yandex_eda')` and `opened_at < 60s ago` |
| `markSeen(orderId)` | `OrdersScreen.handleSelectOrder` |
| `clearAll()` | `useShiftStore.closeShift` (after the shift closes cleanly) |

Older marketplace orders are loaded silently — the 60 s freshness window prevents the historical backfill from spamming the cashier.

## TODO for Phase 2+

- Real availability via `stock_items` + `recipe_items` (dry-run of `pos_finalize_order_stock`).
- Real promos when discount engine lands.
- Outbound Vendor Management Push (status callbacks).
