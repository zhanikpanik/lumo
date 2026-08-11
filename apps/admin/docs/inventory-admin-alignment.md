# Admin ↔ POS Supabase alignment

Use the **same Supabase project** for `r_keeper-admin` (Vite) and the Expo POS app.

## Environment variables

| Admin (`.env`) | POS (`.env` / app config) |
|----------------|---------------------------|
| `VITE_SUPABASE_URL` | `EXPO_PUBLIC_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

Same URL and anon key ensures orders, ledger rows, and warehouse documents are consistent.

Venue/zone IDs (`VITE_VENUE_ID`, `VITE_FLOOR_PLAN_ZONE_ID`, …) should match whatever the POS and seed data use.

## Inventory period movements (admin UI)

Admin resolves **warehouse IDs** for the inventory session’s **workshop** via **`workshop_warehouses`**, then calls RPC **`admin_inventory_period_movements(p_venue_id, p_warehouse_id, p_from, p_to)`** once per warehouse and **merges** per-`product_id` sums in the client (additive). If a workshop maps to several storerooms, period totals are the union of those warehouses.

It returns per-ingredient:

- **`consumption`** — from **`inventory_movements`**: `venue_id`, `warehouse_id`, window on **`occurred_at`**, **`reason`** in **`sale`**, **`waste`** (POS enum `inventory_movement_reason`); units summed as **`ABS(quantity_delta)`** (sale rows are negative deltas)
- **`incoming_delivery`** — received deliveries whose header **`workshop_id`** is linked to that warehouse in **`workshop_warehouses`**
- **`writeoff_qty`** — posted write-offs scoped the same way
- **`transfer_net`** — net transfer in minus out for workshops linked to that warehouse

The counting screen uses **[`p_from`, `p_to`)**: `p_from` is the previous **posted** inventory’s `conducted_at` for that workshop (or epoch if none); `p_to` is the **current session** `conducted_at`.

## POS schema notes

If your `inventory_movements` DDL differs from the POS migration (`quantity_delta`, `reason`, `occurred_at`), adjust **`20260507120000_admin_inventory_warehouse_rpc.sql`** accordingly.

An older migration may still create **`inventory_ledger`**; the current RPC does **not** read it for consumption.

For behavioural rules (live vs report-only stock, timing), see **`inventory-pos.md`** in the POS repo.
