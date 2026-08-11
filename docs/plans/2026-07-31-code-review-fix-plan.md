# InstantDB vertical slice — fix plan

**Date:** 2026-07-31
**Source:** Code review of InstantDB transition
**Goal:** Restore one working, safe flow: `activation → PIN → open shift → order → items → kitchen → payment → admin`
**Strategy:** Clean cutover for migrated path. No dual-write, no compat bridges, no new abstractions.

## Phases

```
Phase 1: Device identity       ── activation + session restore
Phase 2: Permissions           ── tenant boundary, deny-by-default
Phase 3: Shared commands       ── contracts, results, reconciliation
Phase 4: POS order flow        ── device context, shift, items, snapshots
Phase 5: Kitchen + payment     ── tickets, atomic pay, reconciliation
Phase 6: Admin Instant queries ── venue-scoped, reactive
Phase 7: Two-device smoke      ── end-to-end behavioral proof
Phase 8: Cleanup               ── remove legacy paths
```

---

## Phase 1 — Fix device activation and session restore

### Issues

1. Activation sends magic code against randomly generated email — worker can't verify it.
2. `installationId` regenerates on each attempt, breaking idempotency.
3. Production session never restored after force quit — `tryStoredDeviceAuth()` exists but is never called.
4. `signInWithToken` only called for development token, not stored production token.
5. `App.tsx` renders navigation before auth bootstrap completes.

### Changes

**`apps/pos/src/data/instant.ts`**

```ts
// One persistent installation ID per device
getInstallationId(): Promise<string>

// Unified bootstrap — call once on app start
bootstrapInstantDevice(): Promise<
  | { status: 'authenticated'; deviceId: string; venueId: string }
  | { status: 'activation-required' }
>

// bootstrap must:
// 1. Read stored installationId (generate + persist on first run)
// 2. Read stored activation auth
// 3. If auth exists, call signInWithToken
// 4. If token valid → return authenticated
// 5. If token invalid/revoked → clear activation auth, keep installationId, return activation-required
// 6. If no auth → return activation-required
```

**`apps/pos/src/screens/ActivationScreen.tsx`**

- Add email input alongside magic code.
- Use persistent `installationId`.
- Show specific errors: wrong code, no venue access, bound to different venue.
- On success, reset navigation to Lock.

**`apps/pos/App.tsx`**

- Call bootstrap on mount; don't render main navigator until resolved.
- Three states: loading, activation, application.
- In Instant mode, don't initialize Supabase realtime, SQLite caches, or legacy outboxes.

### Acceptance

1. First launch → Activation screen.
2. Valid email + code → device activated → Lock.
3. Force quit / reopen → Instant session restored, no re-activation.
4. Revoke → tablet shows Activation on next bootstrap.
5. Retry after network failure → same installation ID reused.

---

## Phase 2 — Close tenant boundary in permissions

### Issues

1. Public view for `employees`, `categories`, `products`, `zones`, `tables`.
2. `create` for shifts/orders/payments/ledgers checks only `auth.id != null`.
3. Cross-venue reads/writes are not prevented.
4. Revoked device can still read/write.
5. Sent line and terminal order mutations not denied.

### Changes

**`packages/data/src/instant.perms.ts`**

Remove public `view: 'true'`. Every entity requires venue-scoped predicate.

For `create`: check that auth user is an active device, owner, or manager of the entity's venue.

Entity-specific rules:

| Entity | create | update | delete |
|--------|--------|--------|--------|
| `shifts` | staff + venue match | staff + open state + valid transition | false |
| `orders` | staff + venue match | staff + active state + valid transition | false |
| `orderItems` | device + venue + active order + not sent | device + venue + active order + not sent | device + venue + active order + not sent |
| `kitchenTickets` | staff + venue match | staff + immutable payload guard | false |
| `payments` | device + venue match | false | false |
| `cashMovements` | staff + venue match | false | false |
| `inventoryMovements` | staff + venue match | false | false |
| `fiscalReceipts` | staff + venue match | false | false |
| `orderEvents` | staff + venue match | false | false |
| `auditEvents` | admin + venue match | false | false |
| catalog CRUD | admin | admin | admin |

### Verification

Extend `integration/verify-permissions.ts` with 10+ test cases.

---

## Phase 3 — Fix shared command contracts

### Issues

1. `openShift` returns nothing — caller uses wrong ID.
2. `addOrderLine`, `removeOrderLine`, `cancelOrder` accept `undefined` as current order, silently return errors.
3. All command inputs have `deviceId` optional but schema links require it.
4. Running totals computed from stale client snapshot.
5. No reconciliation after rejection.
6. `payOrder` accepts `'other'` method and close-without-payment path.

### Changes

**`packages/data/src/commands/shifts.ts`**

- Return `{ shiftId: string }`.
- On conflict: reconcile, don't create second shift.

**`packages/data/src/commands/orders.ts`**

- `deviceId` required in `OperationContext`.
- Throw `DomainError` instead of returning it — caller can't ignore.
- Don't compute totals from client snapshot — use persisted lines.
- After kitchen send, don't delete line; mark it sent, create cancellation event.

**`packages/data/src/commands/payments.ts`**

- Methods: `cash | card` only.
- Close without payment → use `cancelOrder`, not `payOrder`.
- Check `shift.id == order.shift`, venue match, device match.
- Reconciliation: duplicate payment with same payload → return existing result.
- One payment per order enforced by `paymentId = orderId`.

### Tests

- `openShift` returns real shift ID used by next `createOrder`.
- Retry with same `operationId` → no duplicate.
- Concurrent payment → one payment, one set of ledgers.
- Corrupt snapshot → order stays active.
- Wrong owner → denied.

---

## Phase 4 — Fix POS order flow

### Issues

1. No device context — every command gets `deviceId: undefined` or `'local'`.
2. `useInstantOrderEditor` diffs Zustand items via useEffect → initial load adds all lines.
3. All commands pass `currentOrder: undefined` → silently fail.
4. `consumptionSnapshot` is always `{ consumption: [] }`.
5. Errors logged but never shown to user.
6. `updateMeta` bypasses commands entirely, uses raw `db.tx`.

### Changes

**New: `useInstantDevice` hook**

```ts
function useInstantDevice() {
  return { deviceId, venueId };
}
```

All commands read from this hook. No `'local'`, no `undefined`, no `'unknown'`.

**`useInstantOrderEditor.ts`**

- Remove useEffect diffing.
- ProductGrid tap → calls `addOrderLine` directly.
- Delete action → calls `removeOrderLine` directly.
- Comment/quantity → calls appropriate command directly.
- UI state: optimistic local update OK, but persisted source is Instant live query.
- Check command results; show user-visible errors.

**Consumption snapshot**

- Build from Instant menu query when adding a line.
- Include recipe ingredients, modifier consumption, quantities, units.
- Only `{ consumption: [] }` for products with no inventory impact.

**`updateMeta`**

- Remove raw `db.tx.orders[id].update()`.
- Route through typed command that validates caller, order state, and venue.

### Acceptance

1. Opening existing order → no duplicate lines.
2. Added item appears on second tablet.
3. Force quit → order restored from InstantDB, not Zustand/SQLite.
4. Item has real consumption snapshot.
5. After kitchen send, line is immutable.

---

## Phase 5 — Fix kitchen and payment

### Issues

1. Kitchen send doesn't mark lines as sent.
2. Payment screen mixes Supabase and Instant paths.
3. Money unit mismatch: UI enters som, command receives tiyin.
4. "Without payment" uses `payOrder` with method `'other'` — not atomic ledger.
5. Close reason not written as order event.
6. `closeOrder()` in Zustand overwrites result even if transaction failed mid-way.

### Changes

**Kitchen**

- `createKitchenTicket` atomically sets `sentAt` on included lines.
- Ticket snapshot immutable after creation.
- Print state machine: `queued → printing → printed|failed|uncertain`.
- Retry increments attempt count on same ticket.

**`PaymentScreen.tsx`**

- Instant path uses only `payOrder` / `cancelOrder` commands.
- "Without payment" → `cancelOrder`.
- Som → tiyin conversion exactly once.
- After success: reconciliation query to confirm.
- On confirmed success: navigate to paid check reading Instant snapshots.
- Double tap: local debounce + deterministic `paymentId = orderId` as correctness guarantee.

### Acceptance

For cash and card:
- One order → one payment → one fiscal receipt → one cash movement (if cash) → one movement per ingredient line → one paid event.
- Paid order immutable.

Edge cases:
- Double tap.
- Two tablets simultaneously.
- Offline tap → reconnect.
- Force quit after tap.
- Insufficient cash.
- Corrupt consumption snapshot.
- Close without payment.

---

## Phase 6 — Fix admin Instant queries

### Issues

1. `useInstantCategories` fetches all categories then filters by missing `venue` relation — every category discarded.
2. Same pattern likely in other hooks.

### Changes

- All query factories accept `venueId`.
- Components use shared query factories, not inline query objects.
- Request relations only when needed.
- Apply to: categories, products, employees, zones, shifts, orders, payments, inventory movements, cash movements.

### Acceptance

1. Categories for selected venue visible.
2. Venue switch changes dataset.
3. Never shows venue B data under venue A.
4. POS changes appear without refresh.
5. Admin build passes from clean checkout.

---

## Phase 7 — Two-device behavioral smoke

On clean development seed:

1. Activate tablet A.
2. Activate tablet B.
3. PIN login on both.
4. Open shift on A → B sees it.
5. Create order on A.
6. Add items + modifiers.
7. B sees order without duplicates.
8. Send to kitchen.
9. Verify immutable snapshot.
10. Disconnect A.
11. Pay order.
12. Force quit.
13. Reconnect + reopen.
14. Verify exactly one payment and ledgers.
15. Verify in admin.
16. Revoke A.
17. A loses access, B continues working.

---

## Phase 8 — Cleanup

Only after green smoke. Remove from Instant production path:

- Supabase client initialization
- `useOrderRealtime`
- SQLite catalog/order/consumption caches
- Order and consumption outboxes
- Dead-letter POS UI for old backend
- Raw `db.tx` domain writes from components
- `INSTANT_AUTH_ENABLED` runtime split
- Hardcoded `'local'`, `'unknown'`, `deviceId: undefined`
- Unused Instant/Supabase bridge hooks

Supabase reference code preserved only outside production imports/navigation; must not initialize runtime or write data.

---

## Final gate

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm admin:build
pnpm --filter @lumo/pos exec expo install --check
node --check apps/activation-worker/src/server.mjs
pnpm instant:verify:permissions:dev
pnpm --filter @lumo/activation-worker verify:revoke
```

Then mandatory smoke: POS launch, activation, full order, payment, admin update, two clients, offline, revoke.

**Done means:** primary flow works end-to-end, cross-venue access blocked, retries non-duplicating, InstantDB sole persisted source for migrated path.
