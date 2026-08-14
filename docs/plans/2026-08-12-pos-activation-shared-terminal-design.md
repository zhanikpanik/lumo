# POS activation, shared-terminal и cash handover design

**Дата:** 2026-08-12  
**Статус:** validated; delivery phase 1 реализована и проверена в development 2026-08-13
**Цель:** сделать Web/PWA и iPad полноценными POS-клиентами одного venue с одноразовой owner activation, server-authoritative employee identity, предсказуемым shared-terminal UX и непрерывной работой native POS offline.

## 1. Решения верхнего уровня

- Web POS доступен по отдельному Railway-generated URL как обычная вкладка и устанавливаемая PWA.
- Web POS работает только online. iPad поддерживает offline работу.
- Web и iPad одного venue используют одну canonical открытую смену InstantDB.
- Устройство активирует `owner` или `manager`; детальные activation permissions добавляются позже.
- Официант в обычной работе никогда не запрашивает owner magic code. После activation он входит только четырёхзначным PIN.
- PIN — быстрый выбор сотрудника и attribution, не самостоятельная security boundary.
- Worker не доверяет client-provided `actorEmployeeId`: actor, role и права выводятся из employee session или подписанного offline authorization.
- Открытая смена общая для venue; заказ принадлежит `ownerEmployee`; устройство — только технический источник команды.

## 2. Activation flow

### 2.1 Первый запуск

1. POS запрашивает email owner/manager.
2. Кнопка `Получить код` вызывает Instant `sendMagicCode` через activation boundary.
3. Повторная отправка доступна через 60 секунд; worker дополнительно ограничивает запросы по IP, email и installation ID.
4. POS отправляет magic code worker-у.
5. Worker проверяет code и active membership с ролью `owner` или `manager`.
6. Если доступен один venue, worker активирует его автоматически.
7. Если venues несколько, worker возвращает короткоживущий одноразовый activation challenge и разрешённый список venues.
8. POS показывает выбор; worker принимает выбранный venue только внутри challenge allowlist.
9. Worker создаёт отдельные device, authorization и audit event, затем выдаёт Instant token и долгоживущий device credential.

Название устройства не спрашивается: label формируется как `Web POS`, `iPad POS` или `Android POS`. Пользовательский аудит показывает сотрудников, а не device label.

### 2.2 Device credential и session renewal

- Device credential — случайное 256-bit значение; worker хранит только hash.
- Web хранит credential в IndexedDB. Native хранит его в platform secure storage.
- Credential связан с device, installation, venue и active authorization.
- При истечении/ошибке Instant session POS обращается к refresh endpoint, worker ротирует credential и выдаёт новый Instant token.
- Refresh не требует owner magic code.
- Повторная owner activation нужна только после explicit revoke, очистки site/app data, смены browser profile или переноса устройства.
- Несколько вкладок одного Web origin используют одну device identity. Rotation координируется через Web Locks и `BroadcastChannel`.
- Revocation запрещает refresh и command access на всех вкладках.

## 3. Employee identity и PIN

- PIN состоит ровно из 4 цифр и уникален внутри venue; одинаковый PIN в разных venues допустим.
- Plaintext PIN не хранится. Worker сохраняет salt, verifier, credentialsVersion и expiry.
- Owner/manager задаёт или изменяет PIN в admin; доступна кнопка генерации свободного PIN.
- Установленный PIN нельзя прочитать. Reset создаёт новый verifier, повышает credentialsVersion, инвалидирует employee sessions и создаёт audit event.
- Online Web/iPad отправляет PIN worker-у по HTTPS. PIN не попадает в logs, InstantDB или audit metadata.
- Worker проверяет PIN и выдаёт device-bound employee session.
- Команды несут employee session; worker сам выводит actorEmployee, role, venue и permissions.
- Для offline iPad синхронизируются подписанные employee authorizations/verifiers. TTL — 7 дней после последней успешной credential sync.
- Истечение TTL не прерывает уже открытую рабочую сессию. После lock/restart нужен reconnect и новая credential sync.
- Terminal-wide PIN lockout отсутствует. Ошибочные попытки остаются auditable и не останавливают заведение.

### Employee session lifecycle

- В режиме без auto-lock active employee сохраняется между reload/restart в пределах текущей shift.
- Закрытие смены очищает employee session; новая смена требует PIN.
- Manual `Сменить сотрудника`, PIN reset, employee deactivation, permission change или device revoke инвалидирует session.
- В шапке всегда заметно отображается active employee; нажатие открывает PIN switcher.
- Device activation и employee session — разные credentials.

## 4. Заказы, ownership и роли

- Создатель заказа становится `ownerEmployee`.
- Обычный waiter редактирует только свой active order.
- Чужой заказ виден read-only: стол, состав, сумма и владелец отображаются, mutations недоступны.
- PIN-overlay чужого заказа переключает active employee, но не меняет owner:
  - PIN владельца открывает редактирование;
  - PIN manager/owner даёт административное редактирование без смены owner;
  - PIN третьего waiter оставляет заказ read-only.
- Cashier может оплатить чужой заказ, но не редактирует его позиции и не становится owner.
- Manager/owner может редактировать и оплачивать чужие заказы.
- Worker применяет ownership/role checks ко всем add/remove/update line, metadata, table, cancel и payment commands. UI не является security boundary.
- Ownership сравнивается по employee ID, никогда не по display name.

### Передача заказа

- Передача — отдельный `transfer-order` command, а не metadata update.
- Waiter может передать только свой order; manager/owner — любой.
- Получатель выбирается из active employees; его PIN/присутствие не требуется.
- Worker атомарно меняет ownerEmployee, consumes order version claim и создаёт `orderEvent` с from/to/actor.
- Передача выполняется online. После неё прежний owner видит заказ read-only.

## 5. Shared-terminal UX

- По умолчанию auto-lock отсутствует: терминал остаётся под active employee до ручного переключения или закрытия shift.
- Это подходит барной стойке, где один сотрудник последовательно оформляет несколько заказов.
- Имя active employee постоянно видно; переключение: нажать имя → 4-digit PIN.
- Device mode settings и автоматические timers пока не добавляются.
- Kitchen/bar actions в будущем записывают собственный actorEmployee в events и не меняют owner заказа.

## 6. Платежи

### Наличные

- Сотрудник с `canHoldCash` может принять наличные по любому активному заказу venue.
- Если active waiter не имеет права, POS запрашивает разовый PIN сотрудника с `canHoldCash`.
- Разовая authorization привязана только к конкретной payment operation и не переключает active employee.
- payment.actorEmployee — подтвердивший сотрудник; order.ownerEmployee не меняется.

### Карта

- Сейчас используется отдельный банковский терминал; Lumo не авторизует банковскую транзакцию.
- Перед commit POS спрашивает: `Оплата на банковском терминале успешно завершена?`
- Owner заказа может завершить свой order картой.
- Сотрудник с `canHoldCash` может завершить любой order.
- Если active employee не имеет права, используется разовое PIN-подтверждение.
- Будущая интеграция с acquiring реализуется отдельным payment adapter.

### Offline iPad

- Cash и подтверждённая внешним терминалом card payment локально закрывают order, освобождают стол и попадают в durable outbox с stable operationId.
- До server commit UI показывает `Ожидает синхронизации`, но не блокирует следующие заказы.
- Refund, cancel-refund и final close shift требуют online.

## 7. Cash holder и передача кассы

Одна физическая касса на venue. Business shift не закрывается при смене ответственного.

### Право

- `employees.canHoldCash` — персональное право.
- Defaults: owner/manager/cashier — true; waiter/barista — false.
- Owner/manager меняет toggle в admin; изменение создаёт audit event.
- Право не выдаёт refund или другие admin capabilities.
- Сотрудник с `canHoldCash` может принимать наличные; только current cash holder или manager/owner может закрыть смену.
- Сотрудник, открывший shift и указавший starting cash, становится первым holder.

### Обычная передача

1. Current holder выбирает `Передать кассу`.
2. Вводит фактическую сумму вслепую; expected cash до ввода скрыт.
3. POS показывает expected, counted и difference.
4. При ошибке можно пересчитать; при подтверждённом расхождении комментарий обязателен.
5. Принимающий видит сумму, difference и comment, затем подтверждает своим PIN.
6. Worker атомарно создаёт immutable handover record и меняет current holder.
7. Принимающий может отказаться и вернуть flow к пересчёту.

Расхождение не создаёт искусственный cash movement. Manager/owner получает notification, но approval не требуется.

### Одностороннее принятие

Любой active employee с `canHoldCash` может принять кассу без предыдущего holder:

- подтверждает себя PIN;
- выполняет blind count;
- указывает обязательную reason;
- принимает ответственность;
- record помечается `unattended takeover`;
- manager/owner получает notification.

### Offline iPad handover

- Обычная и unattended передача разрешены offline как provisional handover.
- Новый holder локально вступает в ответственность сразу.
- Последующие cash operations связываются с provisional handover ID.
- При reconnect worker проверяет shift state/version, canonical holder, права/credentialsVersion получателя и operation history.
- Совместимое состояние → handover committed.
- Конфликт → provisional observation и cash events сохраняются; создаётся reconciliation conflict для manager.
- Web online видит только canonical holder до server commit.
- Конфликт не удаляет payments и не блокирует обслуживание.

## 8. Offline matrix

| Capability | Web/PWA | Native iPad |
|---|---:|---:|
| Activation/session refresh | Online | Online activation; cached session/auth thereafter |
| PIN login | Online worker | Online worker или offline signed verifier ≤7 days |
| View canonical shift/orders | Online | Cached snapshot offline |
| Create/edit owned orders | Online | Offline + durable outbox |
| Cash/card recording | Online | Offline + pending sync |
| Order transfer | Online | Online |
| Cash handover | Online | Offline provisional allowed |
| Refund/cancel-refund | Online | Online |
| Final close shift | Online | Online |

### Provisional shift reconciliation

- iPad может открыть provisional shift offline.
- Если Web/другое устройство уже создало canonical shift, reconnect присоединяет provisional history к canonical shift.
- Pending orders/payments получают canonical shiftId.
- Canonical starting cash остаётся authoritative.
- Offline starting cash сохраняется как reconciliation observation.
- Расхождение не блокирует sync.

## 9. Data model additions

### Device renewal

- deviceCredentials: credentialHash unique/indexed, device, venue, installationId, rotatedAt, expiresAt?, revokedAt.
- activationChallenges: challengeHash unique, admin user, allowedVenueIds/canonical links, installationId, expiresAt, consumedAt.

### Employee authorization

- employeeSessions: sessionHash unique, device, employee, venue, shift, credentialsVersion, createdAt, expiresAt/revokedAt.
- offlineEmployeeAuthorizations: signed or worker-verifiable payload scoped to device, employee, venue, credentialsVersion and expiry.
- one-time payment authorizations: operation-bound, employee-bound, device-bound and single-use.

### Cash responsibility

- shifts gains currentCashHolder and handoverVersion/version claim coverage.
- cashHandovers: operationId/business key, fromEmployee?, toEmployee, expectedCashTiyin, countedCashTiyin, differenceTiyin, comment?, reason?, unattended, provisionalDeviceId?, occurredAt, committedAt.
- reconciliationConflicts: kind, resource, provisional record, canonical state snapshot, status, resolution metadata.

All successful authoritative effects of a command remain in one Instant `db.transact()` with commandOperation and claims.

## 10. Failure and security contracts

- Client-supplied venue/device/actor/role/current holder is never trusted.
- PIN, device credential and employee session values never enter logs or operational metadata.
- Device refresh failure caused by transient network/Instant outage does not clear activation.
- Only explicit revoked/invalid credential clears activation and requires owner flow.
- Unknown refresh outcome is retryable with rotation replay protection.
- Web IndexedDB is not a secret vault: strict CSP, no third-party scripts and rapid revoke remain required.
- Direct critical Instant writes stay denied.

## 11. Delivery phases

1. Worker activation challenge, POS magic-code request/resend and safe venue selection.
2. Rotating device credential, IndexedDB/native adapters and automatic session renewal.
3. Four-digit unique PIN migration, admin generate/reset UX and worker online PIN sessions.
4. Replace actorEmployeeId trust with employee-session derivation; add ownership/role matrix.
5. Fix PIN-overlay to switch employee identity; implement read-only foreign orders and dedicated transfer command.
6. Add canHoldCash toggle, one-time payment authorization and external-terminal confirmation UX.
7. Add cash holder, blind count, two-party/unattended handover and reconciliation records.
8. Complete native offline IndexedDB/SQLite-equivalent snapshots, provisional shift/handover reconciliation and conflict UI.
9. Package Web PWA, deploy separate Railway POS service, run local development activation E2E, then staging/production canary.

### 11.1 Статус реализации

- Phase 1 завершена: worker отправляет Instant magic code, валидирует owner/manager membership, автоматически активирует единственный venue и выдаёт одноразовый 10-minute challenge для выбора из нескольких venues.
- Challenge хранит immutable snapshot разрешённых venue/membership/organization, потребляется атомарно вместе с device/authorization/audit effects и защищён unique claim.
- POS реализует state machine `email -> code -> venue -> Lock`, 60-second resend countdown и platform-derived device label.
- Development schema и deny-by-default permissions развёрнуты 2026-08-13.
- Доказано: worker policy tests, полный repository quality gate, Web UI в iPad landscape viewport, real development `sendMagicCode`, single-venue activation `201` и reactivation того же installation/device `200`.
- Multi-venue ветка доказана policy tests; полный email-to-picker E2E требует development fixture с двумя active memberships и остаётся acceptance proof, а не незавершённой реализацией Phase 1.
- Rotating device credential и automatic session renewal относятся к Phase 2 и ещё не реализованы.

## 12. Required behavioral proof

- Local Web uses real development worker/Instant magic code, including resend timer and multi-venue selection.
- Owner activation is not requested after technical Instant session renewal.
- Multiple tabs survive credential rotation without invalidating one another.
- Web and iPad join the same canonical open shift.
- Worker rejects forged actorEmployeeId/role and foreign-order mutations.
- PIN owner/manager unlocks appropriate foreign-order behavior; third waiter stays read-only.
- Order transfer changes owner once and preserves actor/from/to event.
- Four-digit PIN is venue-unique; generate/reset invalidates prior sessions.
- Cash/card one-time authorization records the confirmer without switching active employee.
- Blind cash handover, discrepancy comment, refusal/recount and unattended takeover behave as specified.
- Offline iPad payment/handover survives restart and syncs once.
- Provisional/canonical shift or handover conflict preserves money/events and creates reconciliation work.
- Closing shift clears employee sessions; reload within the same shift preserves the active employee.
