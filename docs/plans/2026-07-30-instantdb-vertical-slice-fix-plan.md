# План исправления InstantDB vertical slice

**Дата:** 2026-07-30  
**Цель:** безопасно провести один рабочий поток `активация → PIN → смена → заказ → кухня → оплата → admin` через InstantDB без dual-write и без попытки одновременно мигрировать всю историческую функциональность.  
**Статус:** Validated

## Зафиксированные решения

1. Делаем vertical slice, а не полный cutover всех admin/POS экранов.
2. Планшет — доверенный venue-bound principal. Instant permissions обязаны защищать tenant/device, отзыв устройства и необратимые состояния. Выбранного сотрудника, owner-only editing и role UX контролируют typed commands и приложение, чтобы сохранить offline PIN.
3. Supabase остаётся только reference implementation до прохождения slice. Для мигрированных сущностей dual-write запрещён: один пользовательский action пишет либо в InstantDB, либо в старый Supabase flow, но не в оба.
4. Persisted domain state принадлежит InstantDB. Zustand хранит только текущего локально выбранного сотрудника и UI state. SQLite/outbox/realtime удаляются из мигрированного пути.
5. Финансовые, складские и audit записи append-only. Исправления делаются компенсирующими операциями, не update/delete.
6. Сначала доказываем один coherent flow на development, затем staging на двух независимых клиентах. Production не переключается частично.

## System map

- **Waiter/cashier:** должен работать быстро и offline, не создавать дубли оплаты.
- **Manager/owner:** должен видеть только свои venue, управлять устройствами и диагностировать незавершённые операции.
- **Trusted tablet:** один Instant auth user, одно устройство, один venue; локально переключает сотрудников по PIN.
- **Instant permissions:** security boundary для venue, active device/admin grant и immutable states; не пытается считать локальный PIN криптографическим server identity.
- **Activation worker:** единственный holder Instant admin token; создаёт/отзывает device identity и permission-safe auth links.
- **Ledgers:** payments, cash, inventory, fiscal, order events и audit накапливаются и не переписываются.
- **Leverage points:** простые principal links, deterministic IDs, одна shared command surface и coherent seed устраняют большую часть текущих рисков одновременно.

## Рассмотренные подходы

1. **Точечно поправить текущие permissions и продолжить mixed runtime.** Быстро, но сохраняет ложные implementation-status, Supabase/Instant расхождение и невозможность доказать atomic payment. Отклонён.
2. **Проводить каждую операцию через online worker.** Даёт жёсткую employee-bound авторизацию, но ломает approved offline PIN/payment flow и делает worker availability критичной для кассы. Отклонён.
3. **Trusted tablet + строгий tenant/state boundary + typed offline commands.** Сохраняет offline, ограничивает security boundary честной моделью угроз и позволяет завершить один flow end-to-end. Выбран.

## Целевой поток

```mermaid
flowchart LR
    A[Owner activates tablet] --> B[Device Instant session]
    B --> C[Employee PIN selected locally]
    C --> D[Open shift]
    D --> E[Create owned order]
    E --> F[Add immutable line snapshots]
    F --> G[Kitchen ticket and print attempt]
    G --> H[Atomic payOrder transaction]
    H --> I[Payment and ledgers]
    I --> J[Reactive admin view]
```

## Phase 1 — вернуть зелёный workspace baseline

### Изменения

- В `apps/pos/src/data/{instant,employeePin,printSimulator}.ts` заменить `@rkeeper/data` на `@lumo/data`.
- Добавить `packages/data/tsconfig.json` и scripts `typecheck`/`test`.
- В root scripts добавить единые `typecheck`, `build`, `test` и отдельную проверку worker syntax.
- Выровнять Expo 52 зависимости через Expo-compatible versions:
  - `react-native` → ожидаемая Expo 52 patch-версия;
  - `jest-expo` → `~52.0.6`;
  - `@react-native-community/netinfo` и `react-native-svg` → версии из `expo install --check`.
- Исправить POS TypeScript blockers, не относящиеся к продуктовой миграции, пока `tsc --noEmit` не станет зелёным. Не подавлять ошибки через `skipLibCheck` или `any`.
- Root `admin:build` должен вызывать package `build`, то есть `tsc -b && vite build`, а не только `vite build`.

### Exit gate

```bash
pnpm install --frozen-lockfile
pnpm --filter @lumo/data typecheck
pnpm --filter @lumo/pos exec tsc --noEmit
pnpm --filter @lumo/admin build
pnpm test:pos --runInBand
pnpm --filter @lumo/pos exec expo install --check
node --check apps/activation-worker/src/server.mjs
```

Ни один следующий phase не начинается при красном baseline.

## Phase 2 — исправить principal model, schema и permissions

### 2.1 Permission-safe principals

Текущие проверки по двум независимым `ref()` удалить. Добавить прямые worker-managed authorization links:

- `venues.activeDeviceUsers ↔ $users.activeDeviceVenues`;
- `venues.ownerUsers ↔ $users.ownedVenues`;
- `venues.managerUsers ↔ $users.managedVenues`.

`memberships`, `devices` и `deviceAuthorizations` остаются domain/audit entities, но permission predicates используют прямой correlated link:

- device access: `auth.id in data.ref('venue.activeDeviceUsers.id')`;
- owner access: `auth.id in data.ref('venue.ownerUsers.id')`;
- manager access: owner или manager link.

Worker обязан атомарно добавлять active link при activation и удалять его при revoke/suspend. Нельзя оставлять условие вида «auth user существует среди devices, а active существует среди любых devices venue».

### 2.2 Schema additions

- Добавить `orderEvents` как append-only entity.
- Добавить ко всем operation entities `operationId`, `createdAt`, `actorEmployee`, `device`, `venue` там, где это применимо.
- Добавить order-line consumption snapshot: immutable JSON с ingredient/modifier quantities, снятый при добавлении позиции.
- Добавить line kitchen state (`sentAt` или эквивалент), после которого исходная line не меняется; добавления создают новую line.
- Сделать `paymentOrder` one-to-one для первой оплаты; refund пока не входит в slice.
- Убрать mutable running totals из source-of-truth shift либо перестать писать их с клиента. В slice totals выводятся из payment/cash ledgers.
- Сохранить integer tiyin и milli-units.

### 2.3 State permissions

- `orders`: active fields можно менять только пока `data.status == 'active'`; разрешён только `active → paid|cancelled`; paid/cancelled immutable.
- `orderItems`/modifiers: create/update/delete только у active order и только до kitchen send.
- `kitchenTickets`: immutable order/venue/sequence/kind/snapshot; update разрешает только status lifecycle, attempt count и timestamps.
- `payments`: device create; device/admin update/delete запрещены в этом slice.
- `cashMovements`, `inventoryMovements`, `orderEvents`, `auditEvents`: create в своём venue, update/delete false.
- `fiscalReceipts`: immutable snapshot; status изменяет только future worker, admin имеет read-only view.
- `shifts`: `open → closed`, delete false; cross-venue links запрещены.
- Catalog CRUD: только owner/manager direct grant, без независимых role/user membership checks.

### Threat-model note

Employee ownership — operational invariant trusted app, не hostile-client security boundary. Permissions всё равно блокируют cross-venue, revoked device и изменение closed financial states. Это ограничение явно фиксируется в architecture docs и diagnostics.

### Exit gate

На development app вручную доказаны: guest deny, venue A/B isolation, owner/manager grants, suspended admin deny, two-device revoke, paid-order mutation deny, sent-line mutation deny, kitchen snapshot mutation deny, ledger update/delete deny.

## Phase 3 — сделать activation/revocation корректными

### Изменения

- Добавить `venueId` в `DeviceActivationRequest`.
- Worker проверяет active owner/manager membership именно для переданного venue, а не выбирает первую membership.
- Activation по `installationId` сделать idempotent:
  - повтор для того же venue возвращает/обновляет ту же device identity;
  - попытка привязать installation к другому venue отклоняется;
  - новая activation отзывает старые sessions этого device перед выдачей новой.
- В одной admin transaction создавать/обновлять device, authorization, audit event и `activeDeviceUsers` link.
- Revoke в одной transaction меняет статусы, удаляет active principal link и пишет audit event; затем инвалидирует auth session.
- Ограничивать request body во время чтения, а не после полного `Buffer.concat`.
- В POS выполнять dev-token sign-in максимум один раз и только при `EXPO_PUBLIC_INSTANT_ENV=development`. Production build не принимает `EXPO_PUBLIC_DEV_DEVICE_TOKEN`.
- Добавить first-run activation UI; после activation хранить device/venue identity, Instant session оставлять платформенному SDK.

### Exit gate

Первый slice поддерживает один venue на owner; явный multi-venue picker отложен. Повторная activation не создаёт duplicate device; revoked online tablet теряет read/write, второй tablet продолжает работу.

## Phase 4 — создать shared command/query surface и coherent seed

### 4.1 Package structure

```text
packages/data/src/
├── commands/
│   ├── shifts.ts
│   ├── orders.ts
│   ├── kitchen.ts
│   └── payments.ts
├── queries/
│   ├── catalog.ts
│   ├── operations.ts
│   └── admin.ts
├── errors.ts
├── ids.ts
├── instant.schema.ts
└── instant.perms.ts
```

Команды принимают Instant transaction builder/client dependency явно; UI не собирает `db.tx.*` самостоятельно.

### 4.2 Required commands

- `openShift`
- `closeShift`
- `createOrder`
- `addOrderLine`
- `removeUnsentOrderLine`
- `transferOrder`
- `managerTakeoverOrder`
- `createKitchenTicket`
- `recordPrintOutcome`
- `payOrder`
- `cancelOrder`

Каждый input содержит `operationId`, `venueId`, `deviceId`, `actorEmployeeId` и client timestamp. Команда валидирует локальный query snapshot и возвращает domain-specific reconciliation metadata.

### 4.3 Deterministic IDs and payment atomicity

- `paymentId = orderId` для первой оплаты.
- `cashMovementId = deterministic(paymentId, 'cash')`.
- `fiscalReceiptId = paymentId`.
- `inventoryMovementId = deterministic(orderId, orderLineId, ingredientId, 'sale')`.
- `orderEventId = deterministic(operationId, eventType)`.
- Реализовать UUID-compatible deterministic builder; не использовать новый random ID на каждый tap/retry.

`payOrder` строит одну transaction:

1. создаёт payment;
2. переводит active order в paid;
3. создаёт cash movement для cash;
4. создаёт inventory movements из immutable line consumption snapshots;
5. создаёт pending fiscal receipt с immutable receipt snapshot;
6. создаёт paid order event.

Concurrent second client получает permission/uniqueness rejection, затем выполняет reconciliation query: если payment с `paymentId == orderId` уже существует и payload совпадает, UI показывает success, а не повторяет оплату.

### 4.4 Queries

- Все admin query factories требуют `venueId`.
- Open shift запрашивается по venue, без `shifts[0]` из общей выборки.
- `inventoryBalancesQuery` больше не содержит произвольный `limit: 500`. Для slice используется cursor pagination по всему ledger и детерминированная агрегация. До production отдельно фиксируется performance threshold и необходимость rollup projection.
- Paid orders имеют pagination и date range.

### 4.5 Seed

Clean seed содержит:

- organization/venue;
- owner и manager grants;
- два active device users;
- waiter и cashier с различными PIN/roles;
- coherent menu, recipe units и floor plan;
- opening inventory movement.

Seed не содержит активный заказ с payment. Flow начинает без открытой смены и без orders. Отдельные fixtures для paid/history создаются через те же commands после проверки clean flow, а не ручным несогласованным набором rows.

### Exit gate

Clean app push+seed воспроизводимы одной root-командой. Ни один app component не импортирует `db.tx` для domain writes. Повтор одного command input создаёт один логический результат.

## Phase 5 — перевести POS foundation и order flow

### Изменения

- Удалить `INSTANT_AUTH_ENABLED` из production path и старый Supabase lock branch.
- `InstantLockScreen` получает `employee.role` и передаёт реальную роль в ephemeral employee session; не хардкодит `waiter`.
- Venue, employees, menu, modifiers, zones/tables, active shift и active orders читать Instant live queries.
- `openShift`, create/open order, guest/table/comment и order lines проводить только через `@lumo/data` commands.
- Ownership UI:
  - owner может редактировать;
  - другой сотрудник видит read-only;
  - transfer и manager takeover меняют owner и атомарно создают audit event;
  - текущий employee остаётся local ephemeral state.
- Удалить из мигрированного пути:
  - Supabase realtime channels;
  - `local_orders` SQLite cache;
  - `orderOutboxStore`;
  - catalog SQLite cache;
  - ручной connectivity flush.
- Показывать Instant connection status отдельно от operation errors. Offline не блокирует create/edit.

### Exit gate

Два независимых POS client stores видят одну смену и один заказ. Non-owner UI read-only, transfer немедленно меняет editor. Force quit/reopen восстанавливает Instant cached state без Zustand/SQLite domain копии.

## Phase 6 — перевести kitchen и payment flow

### Kitchen

- `createKitchenTicket` снимает immutable snapshot только новых/отменённых lines.
- Print simulator проходит `queued → printing → printed|failed|uncertain`.
- Retry увеличивает attempt count того же ticket; не создаёт новый kitchen command.
- `uncertain` требует явного reprint action.

### Payment

- Pay button блокирует повторный tap локально, но корректность не зависит от UI debounce.
- Cash и externally-confirmed card используют один `payOrder` contract.
- После optimistic rejection UI выполняет reconciliation query и показывает domain message: already paid, ownership changed, device revoked или permission denied.
- После paid order все edit controls исчезают, а paid check читается из payment/receipt snapshots.
- Shift totals и expected cash выводятся из ledgers.
- Refund/cancel-refund не мигрируются в этом slice и не доступны в Instant production route до отдельного compensating-command design.

### Exit gate

Offline payment, reconnect, double tap, concurrent pay с двух устройств и force quit после tap дают один payment, один cash movement, один набор inventory movements, один fiscal receipt и immutable paid order.

## Phase 7 — подключить operational admin

### Изменения

- Заменить Supabase `AuthProvider` в Instant operational route на Instant magic-code auth.
- Получать доступные venue из active owner/manager grants; активный venue хранить в UI context.
- Подключить parameterized shared queries вместо дублирования query shapes в `useOperationalDashboard`.
- Vertical admin показывает:
  - active/paid orders;
  - open shift и ledger-derived totals;
  - inventory balances и negative warnings;
  - pending fiscal receipts;
  - failed/uncertain kitchen tickets;
  - device status и audit events;
  - lookup по operation/order/payment/device/employee ID.
- Добавить activation/revoke UI, вызывающий worker с Instant bearer token и выбранным venue.
- Legacy Supabase routes, которые читают/пишут те же migrated domains, убрать из production navigation. Они могут оставаться только как reference code до финальной cleanup, но не инициализируют runtime и не доступны пользователю.

### Exit gate

Операции POS появляются в admin reactive view без refresh. Multi-venue owner видит данные только выбранного venue. Revoked device и print/payment проблемы диагностируются по IDs.

## Phase 8 — smoke first, затем permanent verification и cleanup

### 8.1 Behavioral smoke

На clean development seed:

1. активировать два tablets в одном venue;
2. выбрать разных сотрудников по PIN;
3. открыть смену;
4. создать заказ и позицию offline;
5. reconnect и увидеть заказ на втором устройстве/admin;
6. подтвердить read-only non-owner;
7. transfer ownership;
8. создать и напечатать kitchen ticket;
9. добавить вторую line и отдельный delta ticket;
10. оплатить заказ;
11. увидеть payment, cash, inventory, fiscal и audit records в admin.

После happy path прогнать destructive scenarios: revoke, network loss on edit/pay, force quit, double tap, concurrent pay, permission rollback, failed/uncertain print, long reconnect.

### 8.2 Permanent tests

Только после успешного smoke зафиксировать observable contracts:

- real Instant permission integration suite с guest/admin/device/revoked/two-venue identities;
- command tests на stable IDs и transaction composition;
- seed consistency assertions;
- POS behavioral tests на real role, read-only ownership, payment reconciliation и visible errors;
- two-client integration test без общего cache;
- printer simulator boundary tests.

Тесты должны ломаться при правдоподобных дефектах: отвязанный revoke, mutable paid order, duplicate payment, truncated inventory ledger или cross-venue query.

### Evidence — 2026-07-30

Подтверждено на опубликованных permissions development Instant app:

- `pnpm instant:verify:permissions:dev` создаёт shift, order, line, kitchen ticket и payment под device principal; затем сервер отклоняет изменение sent line и paid order, rewrite ticket snapshot, update/delete inventory ledger.
- `pnpm instant:verify:revoke:dev` запускает local activation worker против того же app: owner отзывает seeded tablet, device получает `revoked`, все его authorizations закрыты и impersonated device query больше не видит venue.
- `pnpm typecheck && pnpm test && pnpm build` прошёл: data tests `3/3`, POS Jest `12/12`, admin production build.

Phase 5 POS runtime wiring:
- `apps/pos/src/data/instant.ts` — InstantDB client с activation flow и feature flag `INSTANT_AUTH_ENABLED`.
- `apps/pos/src/store/useInstantVenue.ts` — reactive venue/zones/tables/employees через `db.useQuery()`.
- `apps/pos/src/store/useInstantShift.ts` — reactive shift/payments/cashMovements с computed totals из ledger.
- `apps/pos/src/store/useInstantMenu.ts` — reactive categories/products/modifierGroups.
- `apps/pos/src/store/useInstantOrders.ts` — reactive orders с items/modifiers.
- `apps/pos/src/screens/InstantOrdersScreen.tsx` — full OrdersScreen на InstantDB hooks.
- `apps/pos/src/screens/OrdersScreen.tsx` — feature flag switch между Supabase и InstantDB.
- `apps/pos/src/screens/InstantOpenShiftScreen.tsx` — uses shared `openShift` command + `useInstantShift` for existing shift detection.
- `apps/pos/src/screens/OpenShiftScreen.tsx` — feature flag switch между Supabase и InstantDB.
- PosScreen, PaymentScreen, CloseShiftScreen, CashScreen — deferred: writes tightly coupled to Supabase RPCs; reads work via useOrderStore which is data-source-agnostic.
Это не подтверждает ещё полный Phase 8 smoke: guest, venue A/B, suspended admin, повторная activation, two-tablet continuity, offline/reconnect и concurrent-pay сценарии остаются отдельными exit gates.

### 8.3 Cleanup

После доказанного flow:

- удалить Supabase API/store/realtime/outbox code для migrated domains;
- удалить SQLite migrations/tables, больше не используемые POS;
- удалить feature flags и dev token production path;
- удалить stale `@supabase` env из production slice;
- обновить migration ledger statuses на `implemented/verified` только для реально пройденных rows;
- исправить завышенные implementation-status в transition design;
- прогнать full workspace build/typecheck/test и migration-scoped lint;
- отдельно зафиксировать legacy admin lint backlog, не маскируя его отключением правил.

## Acceptance matrix по замечаниям review

| Finding | Исправляется |
|---|---|
| Revoked device сохраняет доступ | Phase 2, Phase 3, Phase 8 |
| Membership role/user не correlated | Phase 2, Phase 8 |
| Paid/order/kitchen states mutable | Phase 2, Phase 4, Phase 8 |
| Runtime остаётся Supabase/SQLite | Phase 5–7, cleanup |
| `@rkeeper/data` imports | Phase 1 |
| Instant PIN всегда создаёт waiter | Phase 5 |
| Queries смешивают venue | Phase 4, Phase 7 |
| Inventory обрезается до 500 rows | Phase 4, Phase 7 |
| Incoherent seed | Phase 4 |
| Activation выбирает первый venue | Phase 3 |
| Нет permission/state integration tests | Phase 8 |
| Expo/typecheck baseline красный | Phase 1 |

## Stop conditions

Нельзя переходить дальше соответствующего gate, если:

- workspace не typechecks;
- permission scenario не доказан реальным Instant identity;
- команда пишет часть payment side effects отдельно;
- migrated action всё ещё dual-writes;
- UI success показывается до reconciliation после permission conflict;
- admin aggregates не scoped выбранным venue;
- destructive scenario создаёт duplicate ledger records.

## Rollback

До первого production cutover rollback — запуск сохранённого Supabase reference build. Instant и Supabase не синхронизируются и не dual-write, поэтому данные development/staging не смешиваются. Production переключается только после Phase 8; после первого клиента возврат Supabase не считается поддерживаемым recovery path.

## Не входит в этот план

- Полная миграция warehouse CRUD и исторической аналитики.
- Glovo/Yandex integrations.
- Refund/cancel-refund до отдельного compensating transaction design.
- Реальный OFD adapter.
- Конкретный hardware printer adapter.
- Hostile employee identity security при полностью offline PIN; security principal остаётся trusted device.
