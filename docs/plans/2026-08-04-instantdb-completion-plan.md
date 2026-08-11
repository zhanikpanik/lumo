# InstantDB Vertical Slice — План доделок

**Дата:** 2026-08-04
**Исходный статус:** кодовая база готова на ~60%. Reads работают, writes для POS-редактирования не подключены. Payment — структурно готов, с багами.

---

## Фаза 1 — Пререквизиты (конфиг + идемпотентность)

### 1.1 Добавить EXPO_PUBLIC_VENUE_ID

**Файл:** `apps/pos/.env.local`
**Строка:** добавить после L5
**Что:** `EXPO_PUBLIC_VENUE_ID=<реальный venue UUID из InstantDB>`
**Без этого:** активация никогда не сработает — `config.ts` фолбэчится на `00000000-...`

### 1.2 Починить дедупликацию orderEvent в payOrder

**Файл:** `packages/data/src/commands/payments.ts`
**Строка:** orderEventId формирование (~L120)
**Что:** заменить `deterministicId('order-event', input.operationId, 'paid')` на `deterministicId('order-event', input.orderId, 'paid')`
**Причина:** `operationId` содержит `Date.now()` — при retry создаётся дубликат события.

### 1.3 inventoryMovement.operationId

**Файл:** `packages/data/src/commands/payments.ts`
**Строка:** inventoryMovement creation (~L130)
**Что:** `operationId` должно быть `input.operationId` (общий для всей транзакции), а не `movementId`
**Причина:** audit trace: нельзя связать payment operation с созданными movements.

---

## Фаза 2 — Активация + экран входа

### 2.1 Activation worker: атомарное создание device

**Файл:** `apps/activation-worker/src/server.mjs`
**Строки:** хендлер POST /v1/device-activations (~L60-140)
**Что:**
- Обернуть создание device + authorization + activeDeviceUsers link + audit event в один `db.transact`
- InstallationId проверку делать внутри транзакции (убрать TOCTOU race)
**Exit gate:** повторный POST с тем же installationId не создаёт дубликат device.

### 2.2 ActivationScreen: фидбек и обработка ошибок

**Файл:** `apps/pos/src/screens/ActivationScreen.tsx`
**Что:**
- После успешной активации показать «Устройство активировано» на 1 сек перед `navigation.replace('Lock')`
- Добавить кнопку «Отправить код повторно»
- Заменить substring-матчинг ошибок на проверку structured error из worker
- Если `EXPO_PUBLIC_VENUE_ID` не задан — показать ошибку конфигурации, а не пытаться активировать

### 2.3 InstantLockScreen: не блокировать PIN при загрузке смены

**Файл:** `apps/pos/src/screens/InstantLockScreen.tsx`
**Что:**
- Убрать `|| isShiftLoading` из условия disabled для Enter
- PIN проверять сразу; результат навигации ждать когда `isShiftLoading` станет false
- Добавить `error` state для `db.useQuery` и `useInstantShift` — показывать «Ошибка загрузки» вместо бесконечного лоадера
- Вместо прямого `shiftStore.setState({currentShift})` вызывать `shiftStore.fetchInstantOpenShift()` (чтобы cashierName и cash summary заполнились)

---

## Фаза 3 — Основной цикл POS (главный объём работы)

### Архитектурное решение

**Проблема:** 6 компонентов (ProductGrid, CategoryMenu, ModifierGrid, OrderPanel, WaiterPickerPanel, GuestCounterPanel, DeleteOptions) жёстко завязаны на Supabase Zustand-сторы.

**Подход:** не переписывать каждый компонент с нуля. Добавить пропсы для InstantDB-данных. Когда `INSTANT_AUTH_ENABLED` — PosScreen передаёт данные из InstantDB через пропсы; компоненты используют их вместо Zustand.

**Контракт:** добавляем один общий тип:

```ts
// apps/pos/src/types/instantBridge.ts
export interface InstantPosBridge {
  // Data (from InstantDB live queries)
  categories: InstantCategory[];
  products: Record<string, InstantProduct>;  // productId → product
  currentOrderItems: OrderItem[];            // reactive from InstantDB

  // Actions (from useInstantOrderEditor)
  addItem: (item: OrderItem) => Promise<void>;
  removeItem: (itemId: string, priceTiyin: number, quantity: number) => Promise<void>;
  deleteCurrentOrder: () => Promise<void>;
  updateMeta: (patch: { tableId?: string; guestCount?: number; employeeId?: string; comment?: string }) => Promise<void>;
}
```

### 3.1 PosScreen: собрать bridge и передать вниз

**Файл:** `apps/pos/src/screens/PosScreen.tsx`
**Строки:** ~48-56 (где `useInstantOrderEditor` вызывается и деструктурируется)
**Что:**
- Деструктурировать `const { addItem, removeItem, deleteCurrentOrder, updateMeta } = useInstantOrderEditor(...)`
- Собрать `InstantPosBridge` из `useInstantMenu` + `useInstantOrders` + редактора
- Передать `bridge` в `ProductGrid`, `CategoryMenu`, `OrderPanel` как пропс
- В `OrderPanel` передать `currentOrderItems` из InstantDB (вместо `useOrderStore().items`)
- Обработчик «Оплата» оставить как есть (уже работает)

### 3.2 CategoryMenu: принимать categories как пропс

**Файл:** `apps/pos/src/components/CategoryMenu.tsx`
**Что:**
- Добавить опциональный пропс `categories?: InstantCategory[]`
- Если пропс передан → рендерить из него
- Иначе → старый путь через `useMenuStore` (Supabase)

### 3.3 ProductGrid: принимать продукты + onAddItem

**Файл:** `apps/pos/src/components/ProductGrid.tsx`
**Что:**
- Добавить опциональные пропсы: `products?: Record<string, InstantProduct>`, `onAddItem?: (item: OrderItem) => void`, `categories?: InstantCategory[]`
- Если пропсы переданы: фильтровать продукты по activeCategory через переданный `products`; на тап вызывать `onAddItem` вместо `useOrderStore.addProduct`
- Иначе: старый путь через `useMenuStore` + `useOrderStore`

### 3.4 ModifierGrid: принимать modifierGroups + onAddItem

**Файл:** `apps/pos/src/components/ModifierGrid.tsx`
**Что:**
- Аналогично 3.3 — добавить пропсы для InstantDB-данных и колбэк для добавления позиции с модификаторами
- InstantProduct содержит `modifierGroups: InstantModifierGroup[]` — использовать их

### 3.5 OrderPanel: показывать items из InstantDB

**Файл:** `apps/pos/src/components/OrderPanel.tsx`
**Что:**
- Добавить опциональный пропс `items?: OrderItem[]` (из InstantDB reactive query)
- Если передан → рендерить из него, игнорируя `useOrderStore().items`
- Колбэки на действия (тап по блюду, удаление) — пробрасывать через bridge

### 3.6 WaiterPickerPanel: использовать employees из InstantDB

**Файл:** `apps/pos/src/components/WaiterPickerPanel.tsx`
**Что:**
- Добавить опциональные пропсы: `employees?: Employee[]`, `onChangeWaiter?: (employeeId: string) => void`
- Если переданы → показывать из них, вызывать `onChangeWaiter`
- `useInstantVenue` уже содержит employees — PosScreen передаст их

### 3.7 GuestCounterPanel: колбэк для guestCount

**Файл:** `apps/pos/src/components/GuestCounterPanel.tsx`
**Что:**
- Добавить опциональный пропс `onChangeGuestCount?: (count: number) => void`
- Вызывать его вместо `useOrderStore.setGuestCount`

### 3.8 DeleteOptions: колбэки для remove/delete

**Файл:** `apps/pos/src/components/DeleteOptions.tsx`
**Что:**
- Добавить опциональные пропсы: `onRemoveItem?: (itemId, price, qty) => void`, `onDeleteOrder?: () => void`
- Вызывать их вместо `useOrderStore.removeProduct` / `useOrderStore.deleteOrder`

### 3.9 ItemActionsMenu: колбэк для modifier select

**Файл:** `apps/pos/src/components/ItemActionsMenu.tsx`
**Что:**
- `activeAction` уже управляется локально. Только убедиться что `ModifierGrid` получает modifierGroups через пропсы (3.4), а `DeleteOptions` получает колбэки (3.8).

### 3.10 PosScreen handleBack: delete через InstantDB

**Файл:** `apps/pos/src/screens/PosScreen.tsx`
**Строки:** обработчик кнопки «Назад»
**Что:** при `INSTANT_AUTH_ENABLED` вызывать `deleteCurrentOrder()` из редактора вместо `orderStore.deleteOrder`

**Exit gate фазы 3:** полный цикл «тап по продукту → блюдо в OrderPanel → модификаторы → удаление → смена официанта» работает только через InstantDB (без Supabase).

---

## Фаза 4 — Оплата

### 4.1 Починить tenderedCash

**Файл:** `apps/pos/src/screens/PaymentScreen.tsx`
**Строка:** в `handlePayInstant`, вычисление `tenderedCash`
**Что:** заменить `const tenderedCash = cashAmount * 100` на `const tenderedCash = Math.round(cashAmount)` (сумма уже в тийынах)
**Проверка:** при вводе «500» → tenderedCashTiyin = 50000 (правильно), а не 5000000.

### 4.2 Добавить обработку ошибок

**Файл:** `apps/pos/src/screens/PaymentScreen.tsx`
**Строки:** `handlePayInstant`, весь блок try/catch
**Что:**
- Обернуть вызов `payOrder`/`cancelOrder` в try/catch
- При `DomainError`: показать Alert с понятным сообщением («Заказ уже оплачен», «Нет прав», «Ошибка сети»)
- При network error: показать «Нет соединения. Попробуйте позже.»
- Снять `isProcessing` в finally

### 4.3 Навигация на PaidCheckScreen

**Файл:** `apps/pos/src/screens/PaymentScreen.tsx`
**Строка:** после успешного `handlePayInstant`
**Что:** `navigation.replace('PaidCheck', { orderId })` вместо `navigation.navigate('Orders')`

### 4.4 (Опционально) Убрать TOCTOU race в payOrder

**Файл:** `packages/data/src/commands/payments.ts`
**Что:**
- Если InstantDB позволяет conditional update внутри транзакции — добавить `where: { status: 'active' }` на order update
- Если нет — добавить явный `unique` constraint на `payments.idempotencyKey` + ловить `unique-idempotency` ошибку как штатный «уже оплачен»

**Exit gate фазы 4:** оплата проходит, ошибки показываются пользователю, после оплаты открывается PaidCheckScreen.

---

## Фаза 5 — Края

### 5.1 TablePickerScreen: InstantDB-путь для «Новый заказ»

**Файл:** `apps/pos/src/screens/InstantOrdersScreen.tsx`
**Строки:** обработчик «Новый заказ» (~L120-140)
**Что:**
- При `INSTANT_AUTH_ENABLED` — передавать в TablePickerScreen пропсы `venueId`, `shiftId`, `onTableSelect: (tableId) => createOrder(...)`
- Или: заменить навигацию на TablePickerScreen собственной логикой выбора стола внутри InstantOrdersScreen

### 5.2 InstantOpenShiftScreen: race condition при повторном открытии

**Файл:** `apps/pos/src/screens/InstantOpenShiftScreen.tsx`
**Что:**
- Добавить `submitting` guard на весь handleOpen (уже есть, проверить что надёжно)
- При ошибке «shift already open» — не показывать ошибку, а silently attach к существующей смене

---

## Фаза 6 — Верификация

### 6.1 Пройти smoke-тест по чеклисту

См. раздел «НАДО ТЕСТИРОВАТЬ» в ответе. Ключевые сценарии:
1. Активация → PIN → смена → заказ → блюда → оплата (один поток)
2. Два устройства — реактивность
3. Офлайн → онлайн

### 6.2 Убрать Supabase из мигрированного пути

**Только после успешного smoke-теста:**
- Удалить `INSTANT_AUTH_ENABLED`-ветвление из всех компонентов
- Оставить только InstantDB-путь
- Удалить: `orderStore.ts` (оставить только UI-селекторы если нужны), `menuStore.ts`, `syncOutboxStore.ts`, `orderOutboxStore.ts`, `useOrderRealtime.ts`, `db/database.ts`
- Удалить `@supabase/supabase-js` из dependencies

---

## Порядок выполнения

```
Фаза 1 (пререквизиты) ──┐
                         ├──> Фаза 3 (POS loop) ──> Фаза 4 (payment) ──> Фаза 5 (края) ──> Фаза 6
Фаза 2 (активация) ─────┘
```

Фазы 1 и 2 независимы, можно параллелить. Фаза 3 — самая объёмная (~10 файлов). Фаза 4 зависит от 3 (нужен работающий addItem чтобы было что оплачивать).
