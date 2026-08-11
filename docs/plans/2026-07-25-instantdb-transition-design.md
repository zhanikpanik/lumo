# InstantDB Transition Design

**Date:** 2026-07-25
**Goal:** Replace the Supabase runtime with one InstantDB data model shared by POS and admin before the first customer launch.
**Status:** Validated

## Decision Summary

- Use InstantDB as the only application database for the first release.
- Use a clean vertical cutover; do not dual-write to Supabase and InstantDB.
- Do not migrate existing Supabase mock data. Recreate development data with an InstantDB seed.
- Move POS and admin into one pnpm monorepo with one shared data-contract package.
- Keep Zustand only for ephemeral UI state. InstantDB owns persisted domain data and offline synchronization.
- Treat inventory and cash as append-only ledgers. Negative calculated stock warns but does not block a sale.
- Allow offline cash payments and card payments already confirmed on a separate terminal.
- Separate payment state from fiscalization state. Fiscalization follows through an adapter when an OFD provider is selected.
- A trusted device is bound to one venue; employees switch on that device using a PIN.
- An active order has one employee owner. Only the owner edits it; explicit transfer and audited manager takeover are supported.
- Kitchen printing is represented by immutable kitchen tickets and a provider-neutral `PrintAdapter`.
- Delivery integrations are outside the first cutover.

## Context

There are no production customers or production records. Existing Supabase records are mock data. This removes data-migration and customer-rollout constraints, but it does not remove the risk of losing hidden behavior while replacing the current integration.

Current database behavior is distributed across:

- `src/store/orderStore.ts`
- `src/store/orderOutboxStore.ts`
- `src/store/syncOutboxStore.ts`
- `src/store/shiftStore.ts`
- `src/store/menuStore.ts`
- `src/store/venueStore.ts`
- `src/store/notificationStore.ts`
- `src/hooks/useOrderRealtime.ts`
- `src/api/payments.ts`
- `src/api/inventory.ts`
- `src/api/consumption.ts`
- `src/api/shift.ts`
- POS SQLite migrations and caches in `src/db/database.ts`
- Supabase migrations, triggers, policies and RPCs in `Lumo-admin`

The transition therefore starts with a complete behavior and callsite inventory, not with schema implementation.

## System Map

### Players

- Waiter: immediate interaction, offline operation, no lost orders.
- Cashier: one payment per order and understandable recovery.
- Manager: visibility across the venue, transfer/takeover, audit trail.
- Owner/admin: reliable sales, shifts, menu configuration and stock warnings.
- Trusted tablet: venue-scoped authorization and durable local cache.
- Future OFD provider: immutable receipt payload, idempotent submission and retries.
- Kitchen printer: an external side effect that can fail or have an uncertain result.

### Stocks

- Active and closed orders.
- Payments and cash entries.
- Inventory movements.
- Kitchen tickets and print attempts.
- Fiscalization jobs.
- Audit events.
- Authorized/revoked devices.
- Offline changes awaiting synchronization inside the InstantDB client.

### Flows

```text
device activation -> employee PIN -> open shift
active owned order -> kitchen tickets -> payment -> paid order
payment -> pending fiscal receipt -> succeeded/failed receipt
sale/refund/delivery/write-off -> inventory movements -> calculated balance
owner transfer/manager takeover -> new owner + audit event
```

### Leverage Points

1. Stable logical IDs make retries idempotent.
2. Single-writer order ownership removes most edit conflicts.
3. Immutable snapshots preserve what was printed or paid.
4. Append-only ledgers avoid unsafe client-side balance mutation.
5. One shared schema and permission package prevents POS/admin drift.
6. A mandatory migration ledger prevents silent behavior loss.

## Approaches Considered

### Clean vertical cutover — chosen

Build the core flow end to end on InstantDB while the existing Supabase implementation remains a reference. Switch both applications once the release gates pass, then remove all Supabase runtime code.

### Full-parity big bang — rejected

Porting every current migration, RPC and screen before validating the new model would preserve unproven architecture and delay useful feedback.

### Dual-write strangler — rejected

With no production customers or data, dual-write adds reconciliation and conflicting realtime behavior without reducing meaningful risk.

## Target Monorepo

```text
lumo/
├── apps/
│   ├── pos/                       # Expo React Native application
│   └── admin/                     # Vite React admin application
├── packages/
│   └── data/
│       ├── instant.schema.ts      # canonical InstantDB schema
│       ├── instant.perms.ts       # deny-by-default permissions
│       ├── entities.ts            # exported entity/query types
│       ├── ids.ts                 # stable ID builders
│       ├── commands.ts            # typed business transaction builders
│       ├── queries.ts             # shared query factories where useful
│       └── snapshots.ts           # receipt and kitchen snapshot builders
└── pnpm-workspace.yaml
```

`@lumo/data` contains no UI, React Native code or secrets. POS and admin initialize their platform-specific InstantDB clients with its schema.

### POS state ownership

InstantDB owns:

- catalog and venue configuration;
- shifts;
- orders and order lines;
- kitchen tickets;
- payments;
- cash and inventory movements;
- fiscalization jobs;
- audit events;
- offline persistence and synchronization.

Zustand retains only ephemeral state such as selected screen/tab, open modal, numpad input, current locally selected employee and transient UI filters.

### Future integration processes

Fiscalization may later use a small worker with `@instantdb/admin`. It consumes pending fiscal receipts, calls the selected OFD, and writes the result. It is an external integration adapter, not a second application database.

## Authentication and Tenancy

- An Instant Auth user represents an activated device or an admin user.
- `deviceAuthorization` links a device to one venue and has `active` or `revoked` status.
- An owner activates a tablet once through an online auth flow.
- Employees belonging to the device venue are cached for offline PIN selection.
- Every business operation records `venueId`, `deviceId` and `actorEmployeeId`.
- A revoked device loses server access after reconnect. Continued local operation while fully offline is an accepted limitation of the trusted-terminal model.
- Admin users access venues through explicit organization/venue memberships.
- Admin and owner authentication uses email magic codes; the activation worker verifies the code server-side, validates the owner's membership, then mints a separate custom-token session for the device.
- The activation worker is the only deployment allowed to hold an Instant admin token for device session issuance, revocation and later fiscalization work.
- Permissions deny all operations by default and opt in per entity and transition.

## Domain Model

### Tenancy and identity

- `$users`
- `organizations`
- `venues`
- `memberships`
- `devices`
- `deviceAuthorizations`
- `employees`

### Venue configuration

- `categories`
- `products`
- `modifierGroups`
- `modifiers`
- `recipeItems`
- `zones`
- `tables`
- `printers` when concrete hardware is selected

### Operations

- `shifts`
- `orders`
- `orderLines`
- `orderLineModifiers`
- `kitchenTickets`
- `payments`
- `fiscalReceipts`
- `inventoryMovements`
- `cashEntries`
- `orderEvents`

### Monetary representation

All monetary values are integer tiyin:

- `priceTiyin`
- `amountTiyin`
- `changeTiyin`
- `startingCashTiyin`

Floating-point money and som/tiyin conversion inside persistence are prohibited.

## State Machines

```text
device: active -> revoked
shift: open -> closed
order: active -> paid | cancelled
fiscalReceipt: pending -> processing -> succeeded | failed
kitchenTicket: queued -> printing -> printed | failed | uncertain
```

Permissions enforce allowed transitions using existing `data` and proposed `newData`.

### Order ownership

- `ownerEmployeeId` is set on order creation.
- Only the owner edits an active order.
- The owner may transfer it to another employee.
- A manager may force takeover with a required reason.
- Transfer and takeover update ownership and append an audit event atomically.
- Other employees may view the order but not mutate it.
- A paid or cancelled order is immutable from client commands.

### Kitchen behavior

- A kitchen ticket is an immutable snapshot, not a pointer to mutable order lines.
- Once a line has been sent, its kitchen-relevant fields become immutable.
- An added quantity becomes a new order line/ticket delta.
- Cancellation of a sent line creates a cancellation event/ticket.
- A print retry uses the same ticket and records a new attempt; it does not create another kitchen command.
- `uncertain` means the client cannot know whether the physical printer completed the job. Reprint requires an explicit user action.

### Payment transaction

One typed InstantDB transaction performs:

1. create one payment with a stable ID;
2. transition the active order to paid;
3. create a cash entry when applicable;
4. create deterministic inventory movements;
5. create a pending fiscal receipt with an immutable receipt snapshot;
6. append an order event.

The transaction is rejected unless the actor, venue, ownership/role, order state and required fields satisfy permissions and schema constraints.

### Inventory and cash

Inventory and cash are append-only ledgers. Current values are derived from entries. Negative stock creates a warning and does not reject a sale. Financial, inventory and audit entities are never physically deleted.

## Stable IDs and Idempotency

Representative logical IDs:

```text
payment              = orderId
inventory movement   = orderId:orderLineId:ingredientId:sale
refund movement      = orderId:originalMovementId:refund
fiscal receipt       = paymentId
kitchen ticket       = orderId:kitchenSequence
cash entry           = paymentId:cash
operation event      = operationId:eventType
```

Every command includes:

- `operationId`
- `venueId`
- `deviceId`
- `actorEmployeeId`
- client timestamp
- schema/command version where payload compatibility requires it

## Error and Recovery Model

### Connectivity

POS displays the real Instant connection state using `db.useConnectionStatus()`. Offline domain writes remain enabled. Connection state is not presented as proof that every local write has reached the server.

### Rejected optimistic transaction

The UI rolls back with InstantDB and shows a domain-specific reason such as ownership changed, order already paid, device revoked or permission denied. Raw provider errors are logged but not shown directly to staff.

### Printing

- Failure before sending: mark attempt failed; retry is safe.
- Confirmed printer response: mark printed.
- Crash/timeout after sending: mark uncertain; require explicit reprint.

### Fiscalization

Payment and fiscalization are distinct. A paid order can have a pending or failed fiscal receipt. The future worker retries with the same fiscal receipt ID and exposes unresolved jobs to management.

### Stale cache

Production financial and audit entities are not deleted out of band. Corrections use states and compensating entries. This avoids relying on React Native cache recovery after dashboard-side deletion.

## Database Interaction Migration Ledger

Before implementing the InstantDB schema, create a complete behavior ledger with one row for every current database interaction and its user-visible side effects. Do not treat the SQL migration directory as a behavior ledger or as the authoritative current schema: it is historical provenance and can contain one-off repairs, mock-data changes and superseded routine definitions.

Required columns:

| Column | Meaning |
|---|---|
| Domain action | User-visible behavior being supported |
| Current caller | File and symbol |
| Current interaction | Supabase table/RPC/channel or SQLite table |
| Reads/writes | Exact data read or changed |
| Offline behavior | Cache/outbox/retry behavior |
| Side effects | Events, totals, stock, notifications, printing |
| Decision | `MIGRATE`, `REPLACE` or `DROP` |
| Target command/query | New shared API |
| Acceptance scenario | User-observable proof |
| Status | Open/in progress/verified |

Create a separate Supabase artifact register for migrations, schema snapshots, seeds and manual SQL scripts. Each artifact or deployed routine records its kind, whether it is deployed, its disposition, linked ledger rows and reason. A historical migration file does not require its own behavior row; its final deployed effect does.

Rules:

- Capture a fresh deployed Supabase dump of schema, routines, triggers, policies, grants and migration history before using repository SQL as evidence. Repository migrations and `schema.sql` are comparison inputs, not sources of truth.
- No ledger row, deployed side effect or artifact disposition may disappear without a recorded decision.
- Cutover is blocked while any retained behavior lacks a decision or verified target.
- Every Supabase import, `.from`, `.rpc`, `.channel`, deployed SQL function, trigger, policy, grant and local outbox must map to at least one ledger row.
- Collapse `CREATE OR REPLACE` history to the final deployed definition; retain earlier versions only as provenance in the artifact register.
- Database writes from UI components are prohibited. All writes use typed commands from `@lumo/data`.
- Old and new implementations are compared through user-visible scenarios on clean seeds, not through matching internal table layouts.

## Transition Phases

### Phase 0 — behavior inventory

- Enumerate all POS and admin Supabase/SQLite interactions.
- Build the migration ledger and command map.
- Mark every interaction `MIGRATE`, `REPLACE` or `DROP` with a reason.
- Define observable characterization scenarios for the existing vertical slice.

Exit: no unresolved interaction or unexplained side effect.

### Phase 1 — monorepo foundation

- Create the pnpm workspace.
- Move current POS and admin to `apps/` without changing behavior.
- Preserve independent start/build commands.
- Add `packages/data` without domain implementation.

Exit: both existing applications run in their previous Supabase mode.

### Phase 2 — Instant foundation

- Create isolated development, staging and production Instant apps.
- Add schema, deny-by-default permissions and environment configuration.
- Add integer-money, stable-ID and snapshot utilities.
- Add reproducible seed tooling for a complete test venue.

Exit: a clean Instant app can be initialized and seeded from repository code.

### Phase 3 — tenancy and onboarding

- Add admin membership auth.
- Add device activation and revocation.
- Add venue employees and offline PIN selection.
- Add operation actor/device metadata.

Exit: venue isolation and device revocation pass permission scenarios.

**Implementation status (2026-07-28):** Development now has tenant memberships, trusted-device records, private device-only employee PIN credentials and immutable activation/revocation audit events. `apps/activation-worker` verifies Instant magic codes, mints device custom-token sessions and revokes them server-side. The development seed supplies an owner, one active tablet and one employee; guest, owner, device and revoked-device permission scenarios have been exercised. The worker is deliberately not deployed until the target hosting project and permitted admin origin are selected.

### Phase 4 — venue configuration

- Port admin CRUD for employees, menu, modifiers, recipes, zones and tables.
- Port POS live queries and offline cache consumption.

Exit: admin changes appear on an online POS, and previously synchronized configuration opens offline.

**Implementation status (2026-07-28):** Configuration entities (`categories`, `products`, `modifierGroups`, `modifiers`, `recipeItems`, `zones`, `tables`) are in the InstantDB schema with venue-scoped read/write permissions. Admin owners create and update configuration; active device sessions read it live. Guests and revoked devices see no configuration data. The development seed includes two categories (Кофе, Чай), three products (Эспрессо, Латте, Молоко), one modifier group, one modifier, one recipe item, one zone and one table. Admin build and POS tests pass. Individual admin CRUD screens and POS menu/venue stores are not yet ported to InstantDB queries — the contract layer is complete; the screen-by-screen Supabase-to-Instant migration is mechanical follow-up.

### Phase 5 — shifts, orders and ownership

- Port shift opening.
- Port order creation and order-line commands.
- Add owner-only editing, voluntary transfer and audited manager takeover.
- Replace persisted order Zustand/SQLite ownership with InstantDB queries.


**Implementation status (2026-07-28):** Shift and order entities are in the InstantDB schema with venue-scoped and device-scoped permissions. `shifts` track opening/closing, starting cash, and running totals. `orders` link to venue, shift, table, and owner employee; `orderItems` link to orders and products with price snapshots; `orderItemModifiers` capture modifier selections. An open shift and active order are seeded with a single line item. Two-device visibility and guest isolation are verified locally. Shift open/close transitions are exercised through admin token. Ownership enforcement (only owner edits) is implemented at the application command layer, not in InstantDB permissions, because the device→employee session mapping is deferred to typed commands in `@lumo/data`. Admin build and POS tests pass.
Exit: two devices observe the same order and only the current owner can edit it.

### Phase 6 — kitchen tickets

- Add immutable ticket and cancellation/delta models.
- Add a native `PrintAdapter` interface.
- Implement a simulator adapter and failure/uncertain/reprint UI.

Exit: initial send, later additions, cancellation and reprint preserve immutable snapshots.


**Implementation status (2026-07-28):** `kitchenTickets` entity with immutable `snapshotJson`, status lifecycle (`queued → printing → printed | failed | uncertain`), `attemptCount` and `sequence` is in the InstantDB schema. A `PrintAdapter` interface is defined in `packages/data/src/kitchen.ts`; simulator adapters are available in both `apps/pos/src/data/printSimulator.ts` and `apps/admin/src/data/printSimulator.ts`. Seed includes a printed initial ticket. The ticket lifecycle — create, print, snapshot immutability, reprint with incremented attempt and no duplicate ticket — is verified locally. Admin build and POS tests pass.
### Phase 7 — payment and ledgers

- Add the atomic payment command.
- Add offline cash and externally confirmed card flows.
- Add cash entries, inventory movements, pending fiscal receipts and audit events.
- Add shift totals derived from ledger entries.

Exit: retries, double taps and reconnect produce one payment and one logical set of movements.


**Implementation status (2026-07-28):** `payments` (with unique `idempotencyKey`), `cashMovements` (append-only ledger), `inventoryMovements` (append-only stock ledger with deterministic `lineIdempotencyKey`), and `fiscalReceipts` (immutable receipt snapshots with `attemptCount`) are in the InstantDB schema. Permissions enforce: devices create payments and ledger entries but cannot read cash/inventory/fiscal data — those are admin-only views. Device read of payments is allowed for refund/status display. Append-only immutability is enforced via `update: 'false'` / `delete: 'false'` on cashMovements and inventoryMovements. Payment idempotency (duplicate `idempotencyKey` rejected) is verified locally. Seed includes a cash payment, cash movement, inventory consumption (18000mg of milk), and pending fiscal receipt. Admin build and POS tests pass.
### Phase 8 — operational admin

- Add active/paid order views.
- Add shift revenue.
- Add inventory balance and negative-stock warnings.
- Add device/audit views.
- Add pending fiscal and print-error queues.


**Implementation status (2026-07-28):** Typed InstantQL query shapes for active orders, paid orders, open shifts, inventory balances, pending fiscal receipts, stuck kitchen tickets, and device audit are defined in `packages/data/src/operationalQueries.ts`. An admin `useOperationalDashboard` hook in `apps/admin/src/hooks/useOperationalDashboard.ts` subscribes to active orders, open shift, pending fiscal receipts, and problem kitchen tickets in a single reactive hook — replacing the scatter of Supabase `.from()`/`.rpc()` calls. All queries are verified against the seeded development data. Full admin page migration (Checks, Analytics, Shifts, Warehouse, Settings) is deferred to per-screen follow-up. Admin build and POS tests pass.
Exit: the complete vertical flow is visible and diagnosable from admin.

### Phase 9 — cutover and removal

- Run all release gates on staging with physical tablets.
- Point both applications at the production Instant app.
- Remove Supabase dependencies, environment variables, realtime hooks, RPC clients, SQLite outboxes and obsolete mock seeds.
- Remove feature flags and compatibility paths.

Exit: neither runtime imports nor calls Supabase; both applications complete the production smoke flow.

### Phase 10 — fiscalization adapter

- Select an OFD and obtain its technical contract and test environment.
- Map the provider-neutral receipt snapshot to the provider payload.
- Implement idempotent submit/status/retry/reconciliation behavior.
- Keep provider credentials outside POS/admin clients.

Exit: a fiscal receipt succeeds, retries without duplication and exposes permanent failures to management.

## Release Gates

### Gate 0 — complete inventory

- Every current Supabase and SQLite interaction appears in the migration ledger.
- Every row has a decision, target and observable scenario.
- Unresolved rows: zero.

### Gate 1 — reproducible platform

- Workspace install and app commands are reproducible.
- Schemas and permissions deploy from source.
- A clean test venue seeds without dashboard edits.

### Gate 2 — security and isolation

- Venue A cannot read or change venue B.
- A non-owner cannot edit an order.
- Transfer and manager takeover append audit events.
- Paid orders and ledger entries reject direct client mutation.
- A revoked online device loses access.

### Gate 3 — two-device vertical slice

Using two physical tablets and admin:

1. activate devices;
2. select employees by PIN;
3. open a shift;
4. create an order;
5. observe it on the other tablet;
6. verify read-only behavior for a non-owner;
7. transfer ownership;
8. create and simulate-print a kitchen ticket;
9. add another item and produce a separate ticket;
10. pay the order;
11. observe revenue and inventory movements in admin.

### Gate 4 — destructive scenarios

- Airplane mode before order creation.
- Network loss while editing and while paying.
- Force quit immediately after an offline payment.
- Double-tap payment.
- Concurrent payment attempts from two authorized devices.
- Permission rejection after optimistic update.
- Printer failed and uncertain results.
- Reconnect after extended offline use.

Expected outcomes are user-observable: no lost order, one logical payment, correct movements, immutable paid order, understandable error and eventual visibility on a clean second client.

### Gate 5 — cutover readiness

- Diagnostics displays connection state, device identity, latest operation errors, print issues and fiscal jobs.
- Migration ledger has no unresolved rows.
- Staging smoke flow passes in POS and admin.
- Production schema, permissions, seed/onboarding and backup procedure are verified.
- Runtime contains no Supabase imports, credentials, calls or outboxes.

## Diagnostics

POS diagnostics must show:

- Instant connection status;
- application/environment identifier;
- device ID and venue ID;
- current employee and role;
- last issued operation ID;
- recent rejected command errors;
- failed/uncertain print attempts;
- local view of pending/failed fiscal receipts.

Admin diagnostics must support lookup by operation, order, payment, device and employee IDs. Audit events are written atomically with their business commands so a broken flow can be traced from one identifier.

## Verification Strategy

Test observable contracts, not InstantDB or Zustand implementation details.

- Pure tests: stable ID generation, integer-money calculations, receipt snapshots, kitchen snapshots and allowed state transitions.
- Permission integration: use a real isolated Instant app and attempt allowed/denied operations as real user/device identities.
- POS behavior: render and drive real screens; assert visible ownership, offline and error states.
- Multi-device smoke: use two independent client stores so cached state cannot hide synchronization defects.
- External boundary mocks: only the printer simulator and future OFD sandbox are mocked.
- Every test must fail for a plausible business bug such as duplicate payment, mutable sent line, cross-venue read or unauthorized takeover.

## Cutover and Rollback

Before the first customer, rollback means returning to the untouched Supabase reference build while InstantDB work is incomplete. There is no production-data rollback requirement because cutover occurs before customer data exists.

After the first customer is onboarded, InstantDB is the only runtime source of truth. Reintroducing Supabase is not a supported rollback path. Operational recovery instead uses Instant backups/exports, immutable ledger entries, compensating records and reproducible schema/permissions.

## Non-Goals for the First Cutover

- Delivery platform integrations.
- Direct card acquiring from POS.
- Final OFD implementation before provider documentation is obtained.
- Strict prevention of negative inventory.
- Full historical analytics parity.
- Porting dead or unvalidated Supabase RPCs merely because they exist.
- Physical printer model selection.

## Open Questions

- Select the first kitchen printer and implement its concrete adapter before the first venue that requires hardware printing.
- Select an OFD provider and confirm offline fiscal receipt deadlines, payload fields, authentication, retry rules and sandbox access.
- Confirm the production Instant plan and backup/export procedure before customer onboarding.

## Immediate Next Actions

1. Build the complete migration ledger from both repositories.
2. Convert it into a typed command/query map for the first vertical slice.
3. Create the monorepo without behavior changes.
4. Only then define and push the first InstantDB schema and permissions.
