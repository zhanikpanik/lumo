# POS and inventory consumption

This document describes how the POS interacts with warehouse/inventory so admin reports (поступление, расход от продаж, списания, план) stay aligned.

## When consumption is counted

- **Sales consumption (рас от продаж)** is recorded only when an order becomes **`paid`** and there is at least one qualifying **`payments`** row with method **`cash`**, **`card`**, **`qr`**, or **`other`**.
- **Excluded:** **`cancelled`** orders and **«без оплаты»** flows (payment method **`none`**) do **not** create sale consumption.
- The movement timestamp **`occurred_at`** is the same moment the POS uses for **`orders.closed_at`** when completing (closing) the order after payment, so period reports can align with checkout time.

## Live stock vs reports

- The **server** is the source of truth: idempotent RPC **`pos_finalize_order_stock`** writes **`inventory_movements`** and updates **`stock_items`** via **`apply_stock_delta`** ([`docs/pos-warehouse-stock.md`](pos-warehouse-stock.md)).
- Legacy **`finalize_order_consumption`** may still exist for older deployments; the POS app calls **`pos_finalize_order_stock`** through [`src/api/inventory.ts`](../src/api/inventory.ts).
- The POS **does not** decrement stock locally. It sends **one finalize event per paid order** with line details (dish id, qty, modifier ids). Recipe explosion runs in the database.
- **Idempotency:** server enforces one row per **`order_id`** in **`pos_order_stock_settlements`**. Client outbox may still use key **`{order_id}:sale_consumption`** for deduplication.

## Workshop, warehouse, and periods

- Each dish **`products.workshop_id`** maps to a stock bucket via **`workshops.default_warehouse_id`** (with **`workshop_warehouses`** kept compatible where older data/UI still reference it).
- Movements store **`venue_id`**, **`warehouse_id`**, **`occurred_at`**, and reference **`orders.id`** for audit.
- **Inventory periods** in admin (e.g. from last posted inventory session to a count’s **`conducted_at`**) use the same **`occurred_at`** on movements; the POS only sends **`occurred_at`** and line payloads, not inventory session ids.

## Offline behavior

- If finalize fails (network error), the event is stored in an **outbox** (AsyncStorage + Zustand). The order remains **paid** in the app; stock is **not** treated as posted until the server returns success.
- On app start and when connectivity returns, the outbox flushes with backoff. Duplicate sends are safe due to server idempotency.

## Smoke verification

See [SMOKE_TEST_CHECKLIST.md](../SMOKE_TEST_CHECKLIST.md) (inventory / consumption section).
