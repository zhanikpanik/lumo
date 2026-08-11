# Zustand ↔ InstantDB Split-Brain: Complete Bug List

## Root Cause

`orderStore.ts` (899 lines) has **ZERO references to INSTANT_AUTH_ENABLED**.
Every store method unconditionally writes to the Supabase outbox.
The InstantDB bridge bypasses orderStore for writes, but many UI components
still call orderStore methods directly → Supabase ghost writes.

---

## ✅ Fixed (14 bugs)

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | selectedItem lookup used stale Zustand items | PosScreen:46 | Sync effect in useInstantBridge |
| 2 | handleBack deleted non-empty orders | PosScreen:79 | Sync effect |
| 3 | total omitted modifier prices | PosScreen:52 | Changed to getTotal() |
| 4 | onRemoveItem was dead code | OrderPanel | Wired through ModifierGrid → DeleteOptions |
| 5 | ProductGrid quantity badges broken | ProductGrid:79 | Sync effect |
| 6 | OrderPanel header total wrong | OrderPanel:32 | Sync effect |
| 7 | ModifierGrid no InstantDB modifier groups | PosScreen:265 | Pass instantModifierGroups from bridge |
| 8 | openInstantOrder stale snapshot | InstantOrdersScreen:160 | Removed items snapshot |
| 9 | InstantLockScreen debug console.log | InstantLockScreen:42 | Removed |
| 10 | InstantLockScreen unused import | InstantLockScreen:36 | Removed |
| 11 | orderStore.fetchOrders() Supabase in InstantDB | orderStore.ts:295 | INSTANT_AUTH_ENABLED guard |
| 12 | orderStore.closeOrder() Supabase outbox | orderStore.ts:435 | INSTANT_AUTH_ENABLED guard |
| 13 | orderStore.commitDraft() Supabase sync | orderStore.ts:730 | INSTANT_AUTH_ENABLED guard |
| 14 | orderStore.sendToKitchen() Supabase outbox | orderStore.ts:532 | INSTANT_AUTH_ENABLED guard |
| 15 | tableId always empty | useInstantOrders.ts | Added `table: {}` to query |
| 16 | Shift data not reactive | App.tsx + useInstantShiftSync.ts | New sync hook |
| 17 | refreshShiftCashSummary Supabase RPC | shiftStore.ts:296 | INSTANT_AUTH_ENABLED guard |

---

## 🟡 P1 — Remaining (not critical for basic flow)

### Race condition: totalAmountTiyin lost update
- **File:** packages/data/src/commands/orders.ts:125-144
- **Problem:** Two concurrent addOrderLine calls both read stale total, last writer wins.
- **Fix:** Derive total from linked items at read time, or use atomic increment.

### Two devices can open two shifts simultaneously
- **File:** packages/data/src/commands/shifts.ts:29-48
- **Problem:** No unique constraint on (venue, status='open'). Both devices pass guard.

### TablePicker transfer writes only to Zustand
- **File:** TablePickerScreen.tsx:72-92
- **Problem:** Transfer mode calls useOrderStore.setState — not persisted to InstantDB.

### TakeoverLock bypasses bridge
- **File:** PosScreen:160
- **Problem:** Calls updateOrderMeta (Supabase) instead of instantBridge.updateMeta.

### PaidCheck refunds are Supabase-only
- **File:** PaidCheckScreen.tsx:226-233, 271-276
- **Problem:** refundOrder and cancelRefund are Supabase RPCs — non-functional in InstantDB mode.

---

## 🟢 P2 — Low priority

### openShift() / closeShift() no INSTANT guard
- **File:** shiftStore.ts:153-202, 204-245
- **Problem:** Supabase calls without guard. Currently latent (bypassed by InstantOpenShiftScreen/CloseShiftScreen).

### CloseShiftInput missing actorEmployeeId
- **File:** packages/data/src/commands/shifts.ts:14-21
- **Problem:** No audit trail for who closed the shift.

---

## Architecture

### Sync Hooks (InstantDB → Zustand)

1. **useInstantBridge** — syncs order items
2. **useInstantShiftSync** — syncs shift totals (revenue, cash, card, etc.)

Both use `useRef` to prevent unnecessary re-renders and only update when data actually changes.

### orderStore Guards

Four methods have `if (INSTANT_AUTH_ENABLED) return/early-exit` guards:
- `fetchOrders()` — returns immediately
- `closeOrder()` — clears local state, skips Supabase outbox
- `commitDraft()` — updates local state, skips syncToOrders
- `sendToKitchen()` — updates local state, skips Supabase outbox
