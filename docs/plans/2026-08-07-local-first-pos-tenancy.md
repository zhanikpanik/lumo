# Local-first POS tenancy with InstantDB

**Date:** 2026-08-07  
**Status:** validated design  
**Decision:** POS keeps a local, durable draft while offline. Every backend order mutation goes through a trusted worker. Direct InstantDB transactions remain local-first only for reads and client-local UI state; they are not used to create or alter persisted orders.

## Why

Instant's React Native client persists query state and optimistic transactions through AsyncStorage. That makes cached reads and local UI responsive through temporary disconnection, but it does not create a secure create-time tenant authorization primitive.

The current identity model stores device-to-venue authorization in Instant relations. The permission language has no supported `auth.ref(...)` facility for reading an authenticated user's venue set. A new record's relation link is also not a reliable create-time authorization input. A direct-client rule would therefore have to be broad enough to allow cross-venue writes.

## Tenant model

`venueId` remains an immutable scalar on operational records. It is derived from the activated device record in the trusted command runtime, never accepted as authority from the POS payload. Links remain for queries and referential navigation.

The command runtime uses a transactional store with serializable row locks. InstantDB's Admin SDK transaction makes its writes atomic but does not offer compare-and-set; a server-side read followed by `db.transact()` would still race another command.

For each command the runtime:

1. verifies the Instant device token and derives its venue;
2. opens a transaction in the command store and locks the affected order, shift, or stock keys in a stable order;
3. validates every referenced table, order, product, and employee belongs to that venue;
4. records the stable `operationId`, canonical payload hash, and result;
5. applies the authoritative InstantDB mutation while the lock is held;
6. returns the saved result for an exact retry and rejects a reused ID with another payload.

Instant permissions remain deny-by-default: device users can read only their assigned venue; persisted operational and accounting mutations are denied to clients.

## User flow

1. A device loads its prior Instant cache and current reactive queries.
2. Offline, the waiter edits an explicit local draft; it survives app restart but is not a persisted order.
3. On reconnect, the POS submits `createOrder` once. The transactional command runtime derives venue and writes the authoritative order.
4. Each command uses a stable `operationId`; retry returns the original result without a second record or ledger effect.
5. Payment, accounting, fiscal, stock, and shift-close use the same serialized command boundary.

## Migration sequence

1. Add optional scalar keys and backfill existing development data from venue links.
2. Provision the transactional command store and implement the command runtime; it derives `venueId`, while all direct operational client writes are removed.
3. Add integration tests for anonymous, unassigned, cross-venue, relink, immutable-key, operation-ID reuse, crash recovery, and concurrent command behavior.
4. Push deny-by-default permissions that allow scoped reads but deny all operational client mutations.
5. Make scalar keys required only after command processing and backfill complete on freshly seeded data.

## Acceptance criteria

- An activated device can edit a local order draft offline; the draft persists across restart and is submitted only after reconnect.
- A device from venue A cannot read venue B or cause the command runtime to write a record in venue B.
- A client cannot persist an order, change `venueId`, or invoke an accounting mutation directly.
- The same `operationId` returns the original command result without duplicate order, line, payment, or ledger effects; another payload using that ID is rejected.
- Concurrent commands on the same order, shift, or stock key serialize into one valid lifecycle history.
