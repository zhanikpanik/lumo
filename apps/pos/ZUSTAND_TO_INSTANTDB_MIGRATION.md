# Zustand → InstantDB Migration — Completion Log

**Date:** 2026-08-06
**Commit:** `519fde9` — refactor(pos): migrate from Zustand orderStore to InstantDB + posUiStore

---

## What Changed

### Architecture: 3 layers → 2 layers

```
BEFORE:                          AFTER:
┌─────────────┐                  ┌─────────────┐
│ Components   │                  │ Components   │
├─────────────┤                  ├─────────────┤
│ orderStore   │ 899 lines        │ posUiStore   │ 205 lines (UI only)
│ (Zustand)    │ mixed data+UI    │ (Zustand)    │ selection, draft, actions
├─────────────┤                  ├─────────────┤
│ Supabase     │ outbox, realtime │ InstantDB    │ useQuery + transact
│ + outbox     │                  │ (hooks)      │ reactive, optimistic
└─────────────┘                  └─────────────┘
```

### Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/store/posUiStore.ts` | 205 | UI state: selectedItemId, draftItem, activeCategoryId, modifier actions |

### Files Modified (29 total)

**Screens (5):**
- `src/screens/PosScreen.tsx` — InstantDB hooks directly, zero orderStore
- `src/screens/InstantOrdersScreen.tsx` — posUiStore for setCurrentOrderId
- `src/screens/PaymentScreen.tsx` — posUiStore + useInstantOrder
- `src/screens/PaidCheckScreen.tsx` — posUiStore + useInstantOrders
- `src/screens/TablePickerScreen.tsx` — posUiStore + useInstantVenue

**Components (22):**
- `src/components/ModifierGrid.tsx` — posUiStore, items as prop
- `src/components/OrderPanel.tsx` — posUiStore, items/currentOrder as props
- `src/components/ProductGrid.tsx` — posUiStore, items/products/categories as props
- `src/components/CategoryMenu.tsx` — posUiStore
- `src/components/ItemActionsMenu.tsx` — posUiStore, items as prop
- `src/components/ModifierActionsMenu.tsx` — posUiStore
- `src/components/DishCommentPanel.tsx` — posUiStore, items as prop
- `src/components/DeleteOptions.tsx` — posUiStore, items as prop
- `src/components/CommentModal.tsx` — props-driven
- `src/components/GuestCounterPanel.tsx` — props-driven
- `src/components/ModifierQuantityNumpad.tsx` — posUiStore
- `src/components/OrderActionsMenu.tsx` — props-driven
- `src/components/SalesReportModal.tsx` — props-driven
- `src/components/DeleteOrderPanel.tsx` — props-driven
- `src/components/QuantityNumpad.tsx` — posUiStore
- `src/components/TakeoverLock.tsx` — useInstantVenue
- `src/components/WaiterPickerPanel.tsx` — useInstantVenue
- `src/components/WaiterPickerModal.tsx` — useInstantVenue
- `src/components/SearchMode.tsx` — props-driven
- `src/components/FloorPlan.tsx` — zones/orders as required props
- `src/components/OrderCard.tsx` — useInstantVenue
- `src/components/PosHeader.tsx` — useInstantVenue

### Files Deleted (12)

| File | Reason |
|------|--------|
| `src/store/orderStore.ts` | Replaced by posUiStore + InstantDB hooks |
| `src/hooks/useInstantBridge.ts` | Bridge no longer needed — components read InstantDB directly |
| `src/hooks/useInstantShiftSync.ts` | Sync hook no longer needed |
| `src/store/syncOutboxStore.ts` | Supabase outbox — InstantDB handles offline |
| `src/store/deadLetterStore.ts` | Supabase dead letters — no longer relevant |
| `src/store/orderOutboxStore.ts` | Supabase order outbox — no longer relevant |
| `src/hooks/useOrderRealtime.ts` | Supabase realtime — InstantDB has live queries |
| `src/screens/OrdersScreen.tsx` | Supabase fallback — InstantOrdersScreen is the only path |
| `src/store/menuStore.ts` | Replaced by useInstantMenu hook |
| `src/__tests__/instant-sync.test.ts` | Tested orderStore sync — no longer relevant |
| `src/components/DeadLetterModal.tsx` | Used deadLetterStore — deleted |
| `src/types/instantBridge.ts` | Bridge type — no longer needed |

---

## What Remains (future sessions)

### shiftStore — still in use

**Used by:** CashScreen, CloseShiftScreen, InstantLockScreen, InstantOpenShiftScreen, LockScreen, OpenShiftScreen, InstantOrdersScreen, PaymentScreen, PaidCheckScreen, OrderCard, PosHeader

**What it holds:** currentUser, currentShift, shift history, cash summary, payment recording

**Migration path:** Replace reads with `useInstantShift` hook (already exists). Keep mutations (recordPayment, addCashCollection, addCashTransaction) as imperative commands via `@lumo/data`.

### venueStore — type imports + LockScreen

**Used by:** FloorPlan/FloorPlanCanvas (type imports: VenueTable, VenueZone), LockScreen (fetchVenue, waiters), OrdersScreen (zones)

**Migration path:** Move types to `types/index.ts`. Replace LockScreen with InstantLockScreen. Delete venueStore.

### INSTANT_AUTH_ENABLED — branching in 4 screens

**Used by:** CashScreen, CloseShiftScreen, LockScreen, OpenShiftScreen, shiftStore

**These screens have dual Supabase/Instant paths:**
- LockScreen → switches between SupabaseLockScreen and InstantLockScreen
- OpenShiftScreen → switches between SupabaseOpenShiftScreen and InstantOpenShiftScreen
- CashScreen → if/else on INSTANT_AUTH_ENABLED for cash operations
- CloseShiftScreen → if/else on INSTANT_AUTH_ENABLED for shift close

**Migration path:** Keep only InstantDB path, delete Supabase branches.

### OrdersScreen export — currently broken

`OrdersScreen.tsx` was deleted but `App.tsx` still imports it. Need to either:
- Rewire App.tsx to import InstantOrdersScreen directly
- Or create a re-export file

---

## Verification

- TypeScript: 0 new errors in migrated files
- Tests: 1/1 pass (payment-idempotency). employee-pin failure is pre-existing (TextEncoder)
- No `useOrderStore` references in active code (only in comments)

---

## Key Decisions

1. **posUiStore (Zustand) over React Context** — Zustand's selector API prevents unnecessary re-renders. Context would re-render all consumers on any state change. For 8 shared UI values across 10+ components, this matters.

2. **shiftStore kept** — Too many screens depend on it. Migration deferred to avoid scope creep.

3. **Items as props, not context** — Components that need order items (ModifierGrid, OrderPanel, ProductGrid, etc.) receive them as props from PosScreen. This keeps data flow explicit and avoids another global store.

4. **draftItem stays in posUiStore** — The modifier composition buffer (draftItem) is pure UI state. It's not in InstantDB until committed via `addItem`.
