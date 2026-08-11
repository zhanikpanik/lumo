# InstantDB Migration — Next Session Handoff

**Date:** 2026-07-25
**Status:** Ready to execute
**Primary design:** `docs/plans/2026-07-25-instantdb-transition-design.md`

## Goal of the Next Session

Start the InstantDB transition safely by completing the database-interaction migration ledger across both existing repositories, then prepare a behavior-preserving pnpm monorepo move.

Do not create or push the InstantDB schema before the migration ledger gate is complete.

## Repositories in Scope

- POS: current repository, `~/Lumo`
- Admin and Supabase migrations: sibling repository, `~/Lumo-admin`

Both applications currently share Supabase. The admin repository also owns the SQL migrations, RPCs, policies, triggers, seeds and smoke checks that define server behavior.

## Decisions Already Made

- Target runtime is InstantDB-only.
- No production customers or production data exist.
- Existing Supabase records are mock data and will not be migrated.
- Use a clean vertical cutover; do not dual-write.
- POS and admin will become applications in one pnpm monorepo.
- A shared `packages/data` package will own schema, permissions, types, commands, IDs and snapshots.
- InstantDB owns persisted domain state and offline sync.
- Zustand remains only for ephemeral UI state.
- Supabase remains a reference implementation during development, not part of the target runtime.
- The first release is the primary vertical flow, not full historical feature parity.

Refer to the primary design for the complete decisions on device auth, ownership, kitchen tickets, offline payment, inventory ledgers and fiscalization.

### Product Confirmations — 2026-07-28

- The trusted-device and employee-PIN model is approved.
- InstantDB offline synchronization replaces the POS SQLite catalog/order/consumption caches and outboxes.
- `payOrder` is an atomic typed command covering payment, order state, cash entry, inventory movements and order event; refund paths use compensating commands.
- Supabase RLS, `user_has_venue_access` and the deployed-only, unattached `rls_auto_enable()` are replaced/not ported by deny-by-default Instant permissions.
- Glovo/Yandex Eda marketplace behavior is excluded from the first cutover.
- Every Gate 0 `REPLACE` and `DROP` decision is confirmed; the ledger tracks implementation, not pending product approval.

## Mandatory Gate 0 — Migration Ledger

The first implementation artifact must be a complete migration ledger covering every current interaction with Supabase or local SQLite persistence in both repositories.

### Why this gate exists

Current behavior is distributed across stores, API modules, realtime hooks, SQLite outboxes, SQL functions and triggers. Replacing calls directly would risk losing behavior that is not visible from one file, such as order events, total recalculation, stock settlement, retry semantics or shift totals.

The ledger makes every behavior explicit before designing the new InstantDB schema.

### Required discovery scope

Start by capturing a fresh deployed Supabase dump of schema, routines, triggers, policies, grants and migration history. The migration directory, `schema.sql` and seed files are historical comparison inputs, not authoritative statements of what is deployed.

Inventory all of the following:

- Supabase client imports.
- `.from(...)` reads and writes.
- `.rpc(...)` calls.
- `.channel(...)` realtime subscriptions.
- POS SQLite tables, caches and outboxes.
- Deployed SQL tables relevant to the first vertical slice.
- Deployed PostgreSQL functions and RPCs.
- Deployed triggers and derived writes.
- Deployed RLS policies, grants and venue scoping.
- Unique constraints and idempotency keys.
- Admin reads, writes and aggregates over shared tables.
- Seed and smoke-check dependencies.

Also create a separate Supabase artifact register covering migrations, schema snapshots, seeds and manual SQL scripts. For each artifact or deployed routine, record its kind, deployed status, disposition, linked ledger rows and reason. Historical migration files do not each require a behavioral ledger row; their final deployed effects do.

Known POS starting points:

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
- `src/db/database.ts`

Admin discovery must include application callsites and all relevant files under `~/Lumo-admin/supabase/`.

### Ledger row format

Each row must contain:

| Column | Required content |
|---|---|
| ID | Stable ledger row identifier |
| Domain | Auth, venue, catalog, shift, order, kitchen, payment, cash, inventory, notification or admin |
| User action | Observable behavior supported by the interaction |
| Current caller | Repository, file and symbol |
| Current backend interaction | Table, RPC, channel, trigger or SQLite table |
| Reads/writes | Exact data read or changed |
| Offline behavior | Cache, optimistic state, outbox, retry and recovery behavior |
| Side effects | Events, totals, stock, notifications, audit or derived records |
| Invariants | Uniqueness, permissions, state transition or idempotency being protected |
| Decision | `MIGRATE`, `REPLACE` or `DROP` |
| Decision reason | Why that treatment is correct |
| Target API | Proposed typed command/query in `@lumo/data` |
| Acceptance scenario | User-visible proof that the behavior survives |
| Status | Open, mapped, implemented or verified |

### Decision meanings

- `MIGRATE`: preserve the observable behavior in the InstantDB model.
- `REPLACE`: preserve the product requirement using a deliberately different model.
- `DROP`: remove the behavior as outside the validated product, with an explicit reason.

No callsite or SQL side effect may disappear without one of these decisions.

### Artifact disposition

Use the artifact register to prevent historical SQL from silently becoming migration scope:

- `CURRENT`: a deployed artifact's final effect maps to one or more ledger rows.
- `SUPERSEDED`: an earlier `CREATE OR REPLACE` definition remains provenance only; link it to the final deployed definition.
- `SEED`: development data or fixture input; recreate only when it supports an accepted scenario.
- `ONE_OFF`: manual repair or data correction; record the recovery behavior if it matters, but do not port hardcoded data changes.
- `DROP`: obsolete or out-of-scope behavior; record why it is not part of the target product.

Policies and grants are evaluated for the access invariant they protect and normally `REPLACE` with deny-by-default InstantDB permissions, not copied mechanically.

### Ledger completion criteria

Gate 0 is complete only when:

- the deployed Supabase dump has been captured and reconciled against repository migrations, `schema.sql`, seeds and Edge Functions;
- every current database interaction in both repositories and every deployed side effect has at least one ledger row;
- every artifact has a recorded disposition and linked ledger rows where its final effect remains relevant;
- every row has a decision and reason;
- every retained behavior has a proposed target command/query;
- every retained behavior has a user-observable acceptance scenario;
- all hidden server side effects have been traced back to their initiating user action;
- unresolved ledger rows and unclassified artifacts both equal zero;
- the first vertical-slice command map can be derived from the ledger.

Do not infer completeness from a small set of obvious POS files, a migration directory or a schema snapshot. Search both applications, deployed database metadata, Edge Functions and repository SQL until all paths are accounted for.

## Expected Command Map from the Ledger

The ledger should result in a proposed typed command surface. Names may change after discovery, but the first slice is expected to include commands similar to:

```text
activateDevice
revokeDevice
selectEmployee
openShift
createOrder
addOrderLine
removeUnsentOrderLine
cancelSentOrderLine
transferOrder
managerTakeoverOrder
createKitchenTicket
recordPrintAttempt
payOrder
closeShift
```

Queries should cover venue configuration, menu, floor plan, employees, current shift, active orders, operational admin views, stock warnings, print problems and pending fiscal receipts.

All future application writes must go through typed commands in `@lumo/data`; UI components must not assemble arbitrary InstantDB transactions.

## Monorepo Transition

The monorepo move starts only after Gate 0 is complete enough to define ownership boundaries. The move itself must not change application behavior or switch databases.

### Target structure

```text
lumo/
├── apps/
│   ├── pos/
│   └── admin/
├── packages/
│   └── data/
└── pnpm-workspace.yaml
```

### Package ownership

`apps/pos` owns:

- Expo and React Native configuration;
- POS screens and components;
- platform-specific InstantDB initialization;
- transient UI Zustand stores;
- native `PrintAdapter` implementations.

`apps/admin` owns:

- Vite/React admin UI;
- admin-specific InstantDB initialization;
- operational and configuration screens.

`packages/data` owns:

- `instant.schema.ts`;
- `instant.perms.ts`;
- entity and query result types;
- stable ID builders;
- integer-money utilities shared by both apps;
- typed business transaction builders;
- shared query factories where duplication would otherwise occur;
- receipt and kitchen snapshot builders;
- domain state-transition helpers.

`packages/data` must not import React Native, POS components, admin components or secret credentials.

### Monorepo move sequence

1. Choose the existing `Lumo` directory as the future workspace root.
2. Introduce root workspace configuration and root scripts.
3. Move the current POS project into `apps/pos` without code refactors.
4. Move the current admin project from `~/Lumo-admin` into `apps/admin` without feature changes.
5. Resolve package-manager differences in favor of pnpm workspace management.
6. Preserve app-specific Expo/Vite configuration and environment loading.
7. Create an initially minimal `packages/data` package.
8. Update imports only where required by the move.
9. Verify existing POS and admin start/build paths while they still use Supabase.
10. Do not add compatibility aliases or leave duplicate package roots after the move is validated.

### Behavior-preserving monorepo gate

Before any InstantDB feature work:

- workspace installation succeeds from the root;
- POS starts through a root workspace command;
- admin starts/builds through a root workspace command;
- Expo resolves workspace packages correctly;
- Vite resolves workspace packages correctly;
- existing environment variables continue loading in their respective apps;
- existing Supabase behavior remains available as the reference implementation;
- no business behavior is intentionally changed in the move;
- old duplicate project roots and obsolete lockfiles are removed only after verification.

## Guardrails for the New Session

- Do not start by translating SQL tables one for one into Instant entities.
- Do not create a dual-write path.
- Do not migrate mock records.
- Do not remove Supabase runtime code during the monorepo move.
- Do not preserve a behavior merely because an RPC exists; use the ledger decision and product contract.
- Do not drop a behavior because its callsite looks unused without verifying admin, SQL and event consumers.
- Do not duplicate schema/types between POS and admin.
- Do not move domain data into a new Zustand cache; InstantDB will own persisted domain state.
- Do not proceed to cutover with unresolved ledger rows.

## First Session Deliverables

The next session should produce:

1. A complete migration-ledger document or structured data file covering POS, admin, SQLite and Supabase SQL behavior.
2. A first vertical-slice command/query map derived from that ledger.
3. A documented list of deliberate `DROP` and `REPLACE` decisions requiring product confirmation, if any new ones are discovered.
4. A behavior-preserving monorepo move plan updated with actual package/config findings.
5. Only if the ledger is complete: begin the monorepo move and verify both existing applications still run.

## Verification Principle

Proof is behavioral. For each retained ledger row, the acceptance scenario must describe what a waiter, cashier, manager or owner observes. Internal helper calls and mock call counts are not acceptance evidence.

The final InstantDB cutover gates and destructive two-device/offline scenarios are defined in the primary design document.
