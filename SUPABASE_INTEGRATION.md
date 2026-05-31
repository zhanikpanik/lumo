# Supabase Integration Plan

Current state and roadmap for connecting the POS app to Supabase.

> **Context**: Single-device per venue for now. Multi-device concerns (order number collision, payment double-processing, optimistic locking) are deferred until a client needs it.

---

## Current State

### Fully Connected

| Module | Tables Used | Operations | Realtime |
|--------|------------|------------|----------|
| Menu | `categories`, `products` | Read | No |
| Venue | `venues`, `zones`, `tables`, `users`, `user_venues` | Read | No |
| Orders | `orders`, `order_items`, `order_item_modifiers` | Full CRUD | Yes |
| Payments | `payments` | Insert, Delete (revert) | No |
| Shifts | `shifts` | Insert, Update, Read | No |

### How Each Module Works

**menuStore** — fetches categories + products on startup, caches in AsyncStorage with 5min TTL. Read-only.

**venueStore** — fetches zones, tables, waiters, venue settings (`track_guests`). Cached with 30s TTL. Read-only.

**orderStore** — full lifecycle: create, update, delete orders + items + modifiers. Debounced item sync (500ms). Fire-and-forget writes.

**useOrderRealtime** — two Supabase channels:
- `orders` table changes (INSERT/UPDATE/DELETE) filtered by `venue_id`
- `order_items` table changes, debounced refetch (300ms)

**shiftStore** — opens/closes shifts, fetches open shift on app launch. Model: **one shift per venue** (not per user/device).

**PaymentScreen** — inserts payment record on successful payment.

**PaidCheckScreen** — reverts order status and deletes payment on "reopen".

---

## Known Issues

### P0 — Must Fix

- [ ] **`shiftStore` hardcodes VENUE_ID** — should import from `src/config.ts` like other stores
- [ ] **`waiter_id` is always null** — orders are created with `waiter_id: null`, should use `currentUser.id`
- [ ] **Modifier data is hardcoded** — `mocks/menuData.ts` defines modifier groups; should come from Supabase tables
- [ ] **`payments` is write-only** — POS inserts payments but never reads them; no payment history or receipt lookup

### P1 — Should Fix

- [ ] **Shift not persisted locally** — if app restarts, shift state is lost until `fetchOpenShift()` runs; should persist in AsyncStorage
- [ ] **Payment totals not synced back to shift** — `recordPayment()` updates local state but doesn't sync to Supabase until shift close
- [ ] **No error recovery on failed writes** — all writes are fire-and-forget; no retry, no user notification

### P2 — Later (Multi-Device)

- [ ] **No auth** — PIN login is local-only; not critical for single-device but required for multi-device
- [ ] **Order number collision** — two devices could generate the same number; needs server-side sequence
- [ ] **Payment double-processing** — no optimistic lock on order status; needs `where status = 'active'` guard
- [ ] **Offline queue** — writes silently fail offline; need persistent retry queue
- [ ] **Menu/floor plan not live** — changes from admin only visible after TTL expires

---

## Roadmap

### Phase 1: Data Integrity (Now)

#### 1.1 Fix VENUE_ID in shiftStore
- Import from `src/config.ts`
- Same pattern as other stores
- **Effort**: 5 min

#### 1.2 Link waiter to orders
- On `createOrderForTable` / `createQuickCheck`, set `waiter_id: currentUser.id`
- On `syncCreateOrder`, include `waiter_id`
- On `loadOrdersFromSupabase`, resolve waiter name from `users` table
- **Effort**: 30 min

#### 1.3 Modifiers from Supabase
- Create `modifier_groups` and `modifiers` tables (if not already in schema)
- Fetch in `menuStore` alongside categories/products
- Remove `mocks/menuData.ts`
- **Effort**: 1–2 hours

#### 1.4 Payment reads
- Load payment history for paid orders (receipt view, reprint)
- Display payment method on `PaidCheckScreen`
- **Effort**: 1 hour

### Phase 2: Shift Model (Next)

#### 2.1 Shift = per venue
- One open shift per venue at a time
- Any logged-in user can work within the venue's open shift
- `fetchOpenShift()` loads the venue's current shift regardless of who opened it
- Shift totals accumulate across all users during service
- **Effort**: 30 min (mostly clarifying existing logic)

#### 2.2 Shift persistence
- Add zustand persist to `shiftStore` (AsyncStorage)
- Sync running totals to Supabase on each payment (not just on close)
- **Effort**: 1–2 hours

#### 2.3 Basic error handling for writes
- Show toast when a Supabase write fails
- Log failed writes for manual recovery
- Full retry queue deferred to multi-device phase
- **Effort**: 1–2 hours

### Phase 3: Admin-Driven Config (Low Priority)

#### 3.1 Venue settings
- `track_guests` already works end-to-end
- Add more flags as needed: `require_table`, `auto_print_precheck`, `allow_discounts`, etc.
- POS reads from `venues` table, admin panel writes
- **Effort**: incremental, per feature

### Phase 4: Multi-Device (When Needed)

> Deferred until a client requires multiple POS terminals per venue.

#### 4.1 Auth & RLS
- Supabase Auth (or custom JWT via Edge Function)
- RLS policies enforced per venue
- **Effort**: 1 day

#### 4.2 Server-side order numbers
- Supabase RPC or DB sequence for atomic order number generation
- **Effort**: 2 hours

#### 4.3 Optimistic locking
- Payment: `update orders set status = 'paid' where id = ? and status = 'active'`, check affected rows
- Prevent double-processing across devices
- **Effort**: 2 hours

#### 4.4 Offline resilience
- `NetInfo` connectivity detection + banner
- Persistent retry queue for failed writes
- Conflict resolution strategy
- **Effort**: 1 day

#### 4.5 Realtime for menu/venue
- Subscribe to `categories`, `products`, `zones`, `tables` changes
- Auto-refetch on admin edits during service
- **Effort**: 1 hour per subscription

---

## Tables Summary

| Table | POS Reads | POS Writes | Realtime | Notes |
|-------|-----------|------------|----------|-------|
| `venues` | ✅ | ❌ | ❌ | Settings only (admin writes) |
| `zones` | ✅ | ❌ | ❌ | Floor plan layout |
| `tables` | ✅ | ❌ | ❌ | Table positions |
| `users` | ✅ | ❌ | ❌ | Waiters/staff |
| `user_venues` | ✅ | ❌ | ❌ | Staff↔venue mapping |
| `categories` | ✅ | ❌ | ❌ | Menu categories |
| `products` | ✅ | ❌ | ❌ | Menu items |
| `orders` | ✅ | ✅ | ✅ | Full CRUD + realtime |
| `order_items` | ✅ | ✅ | ✅ | Full CRUD + realtime |
| `order_item_modifiers` | ✅ | ✅ | ❌ | Synced with items |
| `payments` | ❌ → ✅ | ✅ | ❌ | Needs read for receipts |
| `shifts` | ✅ | ✅ | ❌ | Per-venue, one open at a time |
