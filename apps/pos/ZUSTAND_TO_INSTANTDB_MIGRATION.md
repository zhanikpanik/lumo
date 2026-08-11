# Zustand → InstantDB Migration — Full Log

**Last updated:** 2026-08-06 (Session 4 — Supabase fully removed)

---

## Architecture

```
BEFORE (3 layers):               AFTER (2 layers):
┌─────────────┐                  ┌─────────────┐
│ Components   │                  │ Components   │
├─────────────┤                  ├─────────────┤
│ orderStore   │ 899 lines        │ posUiStore   │ 205 lines (UI only)
│ (Zustand)    │ mixed data+UI    │ (Zustand)    │ selection, draft, actions
├─────────────┤                  ├─────────────┤
│ shiftStore   │ 170 lines        │ userStore    │ 38 lines (auth only)
│ (Zustand)    │ bridge to Supa   │ (Zustand)    │ currentUser + persist
├─────────────┤                  ├─────────────┤
│ Supabase     │ outbox, realtime │ InstantDB    │ useQuery + transact
│ + outbox     │                  │ (hooks)      │ reactive, optimistic
└─────────────┘                  └─────────────┘
```

---

## Session 1 — orderStore → InstantDB (commit `519fde9`)

### Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/store/posUiStore.ts` | 205 | UI state: selectedItemId, draftItem, activeCategoryId, modifier actions |

### Modified (29 files)

**Screens (5):** PosScreen, InstantOrdersScreen, PaymentScreen, PaidCheckScreen, TablePickerScreen — migrated from orderStore to InstantDB hooks.

**Components (22):** ModifierGrid, OrderPanel, ProductGrid, CategoryMenu, ItemActionsMenu, ModifierActionsMenu, DishCommentPanel, DeleteOptions, CommentModal, GuestCounterPanel, ModifierQuantityNumpad, OrderActionsMenu, SalesReportModal, DeleteOrderPanel, QuantityNumpad, TakeoverLock, WaiterPickerPanel, WaiterPickerModal, SearchMode, FloorPlan, OrderCard, PosHeader — migrated to posUiStore or props-driven.

### Deleted (12 files)

| File | Reason |
|------|--------|
| `src/store/orderStore.ts` | Replaced by posUiStore + InstantDB hooks |
| `src/hooks/useInstantBridge.ts` | Bridge no longer needed |
| `src/hooks/useInstantShiftSync.ts` | Sync hook no longer needed |
| `src/store/syncOutboxStore.ts` | InstantDB handles offline |
| `src/store/deadLetterStore.ts` | Supabase dead letters — gone |
| `src/store/orderOutboxStore.ts` | Supabase order outbox — gone |
| `src/hooks/useOrderRealtime.ts` | InstantDB has live queries |
| `src/screens/OrdersScreen.tsx` | InstantOrdersScreen is the only path |
| `src/store/menuStore.ts` | Replaced by useInstantMenu |
| `src/__tests__/instant-sync.test.ts` | Tested orderStore sync — gone |
| `src/components/DeadLetterModal.tsx` | Used deadLetterStore — gone |
| `src/types/instantBridge.ts` | Bridge type — gone |

---

## Session 2 — INSTANT_AUTH_ENABLED cleanup + venueStore + refund migration

### Step 1: App.tsx cleanup

- Replaced `OrdersScreen` import with `InstantOrdersScreen`
- Removed 12 dead imports (useOrderStore, useVenueStore, useMenuStore, useOrderRealtime, useSyncOutboxStore, useOrderOutboxStore, useDeadLetterStore, DeadLetterModal, useInstantShiftSync, getDatabase, subscribeConnectivity, subscribeForeground, isAppActive)
- Removed entire Supabase bootstrap path (sync banners, outbox, realtime, bootstrap branching)
- Added missing `navigationRef` declaration
- Simplified `getInitialRoute` — removed `INSTANT_AUTH_ENABLED` branching

### Step 2: INSTANT_AUTH_ENABLED — removed from all screens

| File | Change |
|------|--------|
| `src/screens/LockScreen.tsx` | Replaced 311-line SupabaseLockScreen with 15-line re-export of InstantLockScreen |
| `src/screens/OpenShiftScreen.tsx` | Replaced 140-line SupabaseOpenShiftScreen with 11-line re-export of InstantOpenShiftScreen |
| `src/screens/CashScreen.tsx` | Removed Supabase if/else branch, kept only InstantDB path |
| `src/screens/CloseShiftScreen.tsx` | Removed Supabase if/else branch, kept only InstantDB path |
| `src/store/shiftStore.ts` | Removed 3 `if (INSTANT_AUTH_ENABLED) return` guards, removed dead Supabase methods (openShift, closeShift, addCashCollection, addCashTransaction), removed helper functions (toShift, mapSupabaseShift, applySummaryToShift, createLocalShift) |
| `src/data/instant.ts` | Removed `INSTANT_AUTH_ENABLED` export, simplified `DEVELOPMENT_DEVICE_AUTH` |
| `src/data/instant.web.ts` | Same as instant.ts |

### Step 3: venueStore cleanup

- Moved `VenueTable`, `VenueZone`, `VenueType` types to `src/types/index.ts`
- Updated imports in FloorPlan, FloorPlanCanvas, TablePickerScreen, useInstantVenue
- Deleted `src/store/venueStore.ts`

### Step 4: Supabase API cleanup + refund migration

**Deleted files:**

| File | Reason |
|------|--------|
| `src/api/inventory.ts` | Supabase RPCs replaced by `@lumo/data` commands |
| `src/api/payments.ts` | Supabase queries replaced by `@lumo/data` queries |
| `src/api/consumption.ts` | Dead code — no consumers |
| `src/utils/supabase-helpers.ts` | Dead code — no consumers |

**Added to `packages/data/src/commands/payments.ts`:**

| Command | Purpose |
|---------|---------|
| `refundOrder(db, input, order)` | Reverses paid order: restores stock, creates refund payment, reopens order |
| `cancelRefund(db, input, order)` | Reverses refund: re-consumes stock, re-closes order |
| `refundedOrdersForShiftQuery(venueId, shiftId)` | InstantDB query shape for finding refunded orders by shift |

**PaidCheckScreen.tsx** — fully migrated:
- `fetchActiveRefunds` → reactive `db.useQuery` with `refundedOrdersForShiftQuery`
- `refundOrder` → `@lumo/data` `refundOrder` command
- `cancelRefund` → `@lumo/data` `cancelRefund` command

### Summary of deletions (Session 2)

| File | Lines removed |
|------|--------------|
| `src/screens/LockScreen.tsx` | ~296 lines (SupabaseLockScreen) |
| `src/screens/OpenShiftScreen.tsx` | ~129 lines (SupabaseOpenShiftScreen) |
| `src/store/shiftStore.ts` | ~200 lines (Supabase methods + helpers) |
| `src/api/inventory.ts` | Entire file (140 lines) |
| `src/api/payments.ts` | Entire file (63 lines) |
| `src/api/consumption.ts` | Entire file (87 lines) |
| `src/utils/supabase-helpers.ts` | Entire file (23 lines) |
| `src/store/venueStore.ts` | Entire file (128 lines) |
| `src/data/instant.ts` + `instant.web.ts` | ~4 lines (INSTANT_AUTH_ENABLED) |
| `App.tsx` | ~200 lines (dead imports, Supabase paths) |

**Total: ~1,270 lines of dead Supabase code removed.**

## Session 3 — shiftStore → useInstantShift + userStore

### Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/store/userStore.ts` | 38 | Minimal Zustand store: `currentUser`, `setCurrentUser`, `logout` + AsyncStorage persist |

### Modified (13 files)

| File | Change |
|------|--------|
| `App.tsx` | `useShiftStore` → `useUserStore` + `useInstantShift` for shift guard |
| `InstantLockScreen.tsx` | `setCurrentUser` → `useUserStore`, removed bridge `setState` |
| `InstantOpenShiftScreen.tsx` | `currentUser` → `useUserStore`, removed 3× bridge `setState` calls |
| `InstantOrdersScreen.tsx` | `currentShift?.id` → `openShift?.id` from `useInstantShift`, `currentUser`/`logout` → `useUserStore` |
| `PaymentScreen.tsx` | `currentUser` → `useUserStore`, `getState().currentShift` → `openShift?.id` |
| `PaidCheckScreen.tsx` | `currentShift` → `openShift`, removed `fetchOpenShift()`/`refreshShiftCashSummary()` no-op calls |
| `CashScreen.tsx` | `currentShift` → destructured totals from `useInstantShift`, removed `refreshShiftCashSummary` |
| `CloseShiftScreen.tsx` | `currentShift` → `useInstantShift`, removed bridge `setState`, payment counts from `payments` array |
| `OrderCard.tsx` | `useShiftStore` → `useUserStore` (currentUser only) |
| `PosHeader.tsx` | `useShiftStore` → `useUserStore` (currentUser only) |
| `CashModal.tsx` | `currentShift` → `useInstantShift` totals, removed `refreshShiftCashSummary` useEffect |
| `CloseShiftModal.tsx` | `currentShift` → `useInstantShift` totals + payment counts from `payments` array |
| `src/types/index.ts` | Removed `Shift` interface (no longer used) |

### Deleted (2 files)

| File | Lines removed | Reason |
|------|--------------|--------|
| `src/store/shiftStore.ts` | 174 | Replaced by `useInstantShift` + `useUserStore` |
| `src/__tests__/shiftStore.test.ts` | ~140 | Tested deleted shiftStore |

### Key decisions

- **`currentUser` stays in Zustand** — it's pure client state (not in InstantDB), needs AsyncStorage persist for offline login
- **Bridge pattern removed** — `InstantLockScreen` and `InstantOpenShiftScreen` no longer write InstantDB results into Zustand. Each consumer reads from InstantDB directly via `useInstantShift`
- **Payment counts computed, not stored** — `cashPayments`, `cardPayments`, `otherPayments` are counted from the `payments` array in `CloseShiftModal` and `CloseShiftScreen`. No denormalized counters.
- **`shiftHistory` dropped** — was only written on shift close, never read by any component
- **`recordPayment` dropped** — was a local Zustand mutation; `useInstantShift` computes totals reactively from InstantDB ledger

**Total: ~350 lines removed, 38 lines added (net -312).**

---

## Verification

- TypeScript: 0 new errors in migrated files (Sessions 3–4)
- Pre-existing errors: `@lumo/data` module resolution (workspace package build), JSX component types (React version mismatch)
- No `useShiftStore`, `shiftStore`, `currentShift`, `recordPayment`, or `supabase` references in active code

## Supabase fully removed ✅

```
Supabase dependency: GONE
├── notificationStore.ts → subscribe() removed (was dead code — no writer existed)
├── utils/supabase.ts    → deleted
├── package.json         → @supabase/supabase-js removed
└── .env.example         → EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY removed
```

## Session 4 — Supabase removal (final)

### Why `subscribe()` was dead code

The Supabase `postgres_changes` subscription listened for `INSERT` on a `notifications` table. But:
- No entity `notifications` exists in the InstantDB schema
- Lumo-admin has no notification-writing code
- No integration layer writes to Supabase `notifications`

The subscription was a vestige of a planned-but-never-implemented feature. The marketplace unseen flow (Glovo/Yandex) is entirely local state.

### Modified (2 files)

| File | Change |
|------|--------|
| `src/store/notificationStore.ts` | Removed `subscribe()` method, Supabase import, `VENUE_ID` import |
| `src/screens/PosScreen.tsx` | Removed `useNotificationStore.getState().subscribe()` useEffect + import |

### Deleted (1 file)

| File | Reason |
|------|--------|
| `src/utils/supabase.ts` | Last Supabase consumer — no longer needed |

### Package changes

| Change | Detail |
|--------|--------|
| `@supabase/supabase-js` removed from `package.json` | Last Supabase dependency |
| `EXPO_PUBLIC_SUPABASE_URL` removed from `.env.example` | No longer used |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` removed from `.env.example` | No longer used |
| `EXPO_PUBLIC_INSTANT_AUTH_ENABLED` removed from `.env.example` | Stale — removed from code in Session 2 |

**Total: ~30 lines removed, Supabase dependency fully eliminated.**


---

## Key Decisions

1. **posUiStore (Zustand) over React Context** — Zustand's selector API prevents unnecessary re-renders. Context would re-render all consumers on any state change.

2. **userStore (Zustand) for currentUser** — `currentUser` is pure client state (not in InstantDB), needs AsyncStorage persist for offline login. Only 38 lines: `currentUser`, `setCurrentUser`, `logout`.

3. **Items as props, not context** — Components that need order items receive them as props from PosScreen. Explicit data flow.

4. **draftItem stays in posUiStore** — The modifier composition buffer is pure UI state. Not in InstantDB until committed via `addItem`.

5. **Refund commands in @lumo/data** — Refunds are atomic InstantDB transactions (reverse stock, create refund payment, reopen order). No server-side logic needed — same pattern as `payOrder`.

6. **Bridge pattern eliminated** — `InstantLockScreen` and `InstantOpenShiftScreen` no longer write InstantDB results into Zustand. Every consumer reads from InstantDB directly via `useInstantShift`. Zustand stores hold only client-side UI/auth state.

7. **Payment counts computed, not stored** — `cashPayments`, `cardPayments`, `otherPayments` are counted from the `payments` array at render time. No denormalized counters in any store.

8. **INSTANT_AUTH_ENABLED removed** — All screens now use the InstantDB path exclusively. No more dual Supabase/Instant branching.
