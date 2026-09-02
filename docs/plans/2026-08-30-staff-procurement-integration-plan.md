# План интеграции приложения закупок с Lumo

Дата: 2026-08-30

## Цель

Перенести приложение сотрудников в `apps/staff` и подключить его к общей InstantDB-среде Lumo без отдельной PostgreSQL-базы, копии складской схемы и второй реализации проведения поставок.

Staff app, POS и admin должны читать одни документы. Все складские записи выполняет activation worker. Заказанные и фактически принятые значения сохраняются раздельно.

## Обязательные инварианты

1. Tenant определяется сервером из authenticated identity, а не из cookie, header или request body.
2. Клиент не получает Instant Admin Token и не пишет напрямую в складские сущности.
3. Все mutations проходят через activation worker.
4. Один `operationId` обозначает одну логическую попытку и повторяется при HTTP retry.
5. Проведение поставки, движения и остатки фиксируются одной InstantDB-транзакцией.
6. `expectedVersion` и `commandClaims` защищают от конкурентного изменения.
7. `orderedQuantityMilli` и `orderedPriceTiyin` не перезаписываются фактическими значениями.
8. Частичные поставки моделируются отдельными receipt-документами, а не повторной записью в одну строку поставки.
9. Capability проверяется на worker для каждой команды; скрытая кнопка не является авторизацией.
10. Admin и staff app используют один shared command contract.

## Gate 0 — устранение критических рисков текущего приложения

### P0.1 Tenant boundary

- Перестать читать `restaurant_id` как источник авторизации.
- Получать restaurant/venue только из server-side session.
- Проверять активного пользователя, его ресторан и роль по БД.
- Перевести прямые cookie/header-scoped endpoints на общий `requireAuth`.
- Не допускать fail-open при ошибке проверки tenant.

Acceptance:

- подмена `restaurant_id` cookie не меняет tenant запроса;
- пользователь с session ресторана A не может читать или менять ресторан B;
- отключённый пользователь получает 401/403 независимо от срока JWT.

### P0.2 Public setup mutations

- Убрать mapping endpoints из публичных и CSRF-exempt prefixes.
- Требовать admin/manager session.
- Проверять принадлежность category, supplier, product и section одному tenant.
- Не выполнять частичную запись при невалидном mapping.

Acceptance:

- анонимный POST получает 401;
- staff получает 403;
- cross-tenant IDs отклоняются без изменений;
- admin/manager может применить валидный mapping своего ресторана.

### P0.3 Poster OAuth

- Добавить одноразовый OAuth `state` в HttpOnly cookie.
- Валидировать `state` до обмена authorization code.
- Разрешать только безопасный Poster account slug.
- Не строить redirect origin из `Host`/`X-Forwarded-Host`.
- Не логировать authorization code, token или signature.

Acceptance:

- callback без state или с чужим state отклоняется;
- account со slash, dot, port или control characters отклоняется;
- client secret отправляется только на `https://<slug>.joinposter.com`;
- redirect остаётся на configured application origin.

## Gate 1 — backend foundation Lumo

1. Добавить link `$user ↔ employee` в `@lumo/data`.
2. Добавить `purchasingRole`: `requester | receiver | manager | none`.
3. Обновить admin staff form для назначения procurement capability.
4. Добавить отдельный procurement permission helper, не расширяя общий `venueMembers`.
5. Разрешить staff читать только venue, warehouses, procurement products, deliveries/lines, suppliers и receipts.
6. Оставить прямые create/update/delete складских сущностей запрещёнными.
7. Реализовать `authorizeStaff` в activation worker.
8. Worker определяет employee по bearer token; `employeeId` из payload не принимается.
9. Добавить `POST /v1/staff/warehouse-commands`.
10. Ограничить команды по purchasing role и venue.
11. Передавать `actorEmployeeId` и source в command context/audit.

Acceptance:

- user без employee link получает 403;
- inactive employee получает 403;
- requester не может принять поставку;
- receiver может принять поставку своего venue;
- staff identity не получает доступ к кассе, заказам POS и финансовой аналитике.

## Gate 2 — единый data contract

### Сущности

- suppliers;
- supplierProducts или эквивалентная many-to-many связь;
- procurement/delivery document;
- immutable ordered lines;
- delivery receipts;
- receipt lines с фактическими quantity/price;
- audit source/actor.

### Минимальные поля ordered line

- `productId`;
- `name` snapshot;
- `unit`;
- `orderedQuantityMilli`;
- `orderedPriceTiyin`;
- stable line ID.

### Минимальные поля receipt line

- optional source ordered line ID;
- `productId`;
- `receivedQuantityMilli`;
- `receivedPriceTiyin`;
- `unit`;
- признак незапланированной позиции.

### Shared API

- экспортировать типы из `@lumo/data`;
- экспортировать shared queries закупочных листов и ожидающих поставок;
- экспортировать staff/admin command payload types;
- использовать integer milli/tiyin на всех границах;
- запретить float money/quantity внутри domain commands.

Acceptance:

- заказанные значения остаются неизменными после одной или нескольких приёмок;
- недопоставка остаётся видимой;
- незапланированная позиция имеет ordered quantity 0;
- сумма поставки считается по receipt lines;
- остатки увеличиваются только по фактическим значениям.

## Gate 3 — warehouse commands

1. Расширить `create-delivery` ordered line contract.
2. Добавить команду отправки закупочного листа поставщику.
3. Расширить `receive-delivery` receipt payload.
4. Валидировать products, warehouses, units, quantities и prices на worker.
5. Разрешить добавление незапланированных ингредиентов при полной приёмке.
6. Запретить добавление ингредиентов в dashboard quick receive.
7. Создавать receipt, receipt lines, inventory movements и stock updates атомарно.
8. Сохранять actor employee/admin, source и timestamps.
9. Возвращать сохранённый результат при повторе того же `operationId`.
10. Возвращать `409 resource_conflict` для устаревшего `expectedVersion`.

Acceptance:

- retry не создаёт вторую поставку или движения;
- две конкурентные приёмки дают один success и один 409;
- сбой транзакции не оставляет receipt без stock movement или наоборот;
- отмена/восстановление не создаёт отрицательный stock.

## Gate 4 — перенос staff app

1. Создать `apps/staff` как workspace package.
2. Перенести используемый UI закупок из `restaurant-checklist`; не переносить дубли admin/setup.
3. Подключить `@lumo/data` через `workspace:*`.
4. Подключить `@instantdb/react` для web.
5. Использовать тот же Instant app ID и activation worker URL.
6. Реализовать magic-code auth.
7. Получать employee, venue и capability из authenticated query.
8. Заменить REST reads на shared reactive queries.
9. Заменить PostgreSQL mutations на staff worker commands.
10. Хранить stable `operationId` до окончательного ответа.
11. Обрабатывать 401, 403, 409 и retryable network failures отдельно.
12. Удалить локальные users, restaurants, sections, orders и Poster dual-write.

Не переносить:

- отдельную БД;
- NextAuth credentials;
- setup/onboarding Poster OAuth;
- управление сотрудниками;
- управление меню/складами;
- прямую запись поставок в Poster;
- `orders.order_data` JSONB.

Acceptance:

- staff app и admin показывают одинаковый документ;
- изменение в одной поверхности появляется в другой без refresh;
- приложение не содержит Admin Token;
- network retry использует прежний operationId;
- logout удаляет доступ к procurement queries.

## Gate 5 — admin и dashboard

1. Перевести полную форму приёмки на shared receipt command.
2. Поддержать фактическое количество, цену, отсутствующую и незапланированную позицию.
3. Добавить dashboard quick-receive drawer.
4. Quick receive разрешает только существующие строки и quantity 0..ordered.
5. Добавить переход в полную форму.
6. Показывать ordered/received delta, actor, source и receipt history.
7. Не дублировать stock calculations в React.

Acceptance:

- admin и staff вызывают один command contract;
- dashboard не меняет supplier, warehouse или состав заказа;
- stale admin form получает 409 и реактивно обновляется;
- аудит показывает автора и источник.

## Gate 6 — cutover

1. Сделать snapshot текущих PostgreSQL данных.
2. Определить mapping restaurant → venue, section → warehouse, product → Instant product, supplier → supplier.
3. Мигрировать только незакрытые закупочные документы и необходимую историю.
4. Проверить totals и counts до/после.
5. Остановить PostgreSQL writes.
6. Переключить staff deployment на Lumo workspace.
7. Наблюдать 401/403/409, command failures и stock deltas.
8. После подтверждения удалить старые API routes, schema bootstrap и PostgreSQL secrets.

Rollback разрешён только до начала новых production writes в InstantDB. После cutover обратная синхронизация в PostgreSQL не поддерживается.

## Verification matrix

- auth: missing/invalid/valid token;
- tenant: чужой venue ID;
- capability: none/requester/receiver/manager;
- create/update/send/receive/cancel/restore transitions;
- zero, exact, short and excess receipt quantities;
- unplanned product validation;
- duplicate operationId with same and different payload;
- concurrent expectedVersion conflict;
- atomic stock and movement updates;
- reactive update in staff and admin;
- one and multiple receipts;
- audit actor/source;
- production build, typecheck, lint and dependency audit.

## Review плана

### Что исправлено в плане после review

1. Backend foundation поставлен до переноса UI: staff app нельзя безопасно подключить к admin endpoint.
2. Частичная приёмка вынесена в receipts до реализации экранов; пара ordered/received на одной строке недостаточна для текущего поведения приложения.
3. Auth и tenant boundary выделены в Gate 0: миграция не должна переносить существующую уязвимую модель cookie tenant.
4. Общий data contract предшествует admin/staff UI, чтобы не получить две несовместимые формы.
5. Cutover сделан односторонним: dual-write PostgreSQL/InstantDB исключён.
6. Idempotency и concurrency проверяются на command layer, а не компонентными тестами.
7. Dashboard явно ограничен quick receive; сложные изменения остаются в полной форме.

### Оставшиеся решения

- Исторический объём миграции: по умолчанию переносить открытые документы и receipts, закрытую историю оставить в snapshot/export.
- Supplier messaging: фиксировать `sentAt` и actor после подтверждённой server command; открытие WhatsApp само по себе не считать доставкой сообщения.
- Poster: Lumo остаётся источником складской истины; отдельный Poster dual-write из staff app не переносится.

### Вердикт

План выполним без переписывания всего UI, но только как clean cutover. Начинать следует с Gate 0, затем schema/auth/worker. Начало с `apps/staff` до worker foundation создаст небезопасный клиент и повторную переделку.

## Execution status

### 2026-08-30 — Gate 0

- [x] Tenant больше не берётся из `restaurant_id` cookie/header; `requireAuth` сверяет session user с активным user и restaurant в PostgreSQL и работает fail-closed.
- [x] `sync-sections`, `sync-ingredients` и webhook logs переведены на server-side identity.
- [x] Setup mapping endpoints убраны из public/CSRF exemptions, требуют admin/manager и атомарно валидируют tenant принадлежность всех IDs.
- [x] Poster OAuth использует одноразовый HttpOnly state, configured redirect origin и строгий account slug.
- [x] Hostile account и callback без state отклоняются до внешнего fetch.
- [x] Добавлены security tests для account URL, OAuth state и configured redirect origin.

Verification:

- `npm run test:security` — 3/3 passed.
- `npm run build` — passed; остаются ранее существовавшие Edge Runtime warnings.
- Production smoke: forged tenant cookie/header → 401; callback без state → `invalid_oauth_state`; hostile account с valid state → `invalid_account`.
- `npm audit --omit=dev` — остаются 17 известных dependency vulnerabilities (2 critical, 11 high, 4 moderate); обновление зависимостей вынесено в следующий security gate.
