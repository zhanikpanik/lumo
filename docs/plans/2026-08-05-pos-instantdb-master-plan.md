# POS InstantDB Migration — Master Plan

**Дата:** 2026-08-05 (обновлён после code review)
**Исходная точка:** кодовая база на ~60%. Reads работают (useInstantMenu, useInstantOrders, useInstantShift), writes частично (useInstantOrderEditor), критических багов — 5 штук.
**Существующие InstantDB-хуки:** `useInstantMenu`, `useInstantOrders`, `useInstantShift`, `useInstantOrderEditor` — используются в `PosScreen` для сборки bridge.

---

## Архитектурное решение (из research spike)

### Bridge-паттерн вместо размазанного `INSTANT_AUTH_ENABLED`

**Проблема:** флаг `INSTANT_AUTH_ENABLED` проверяется в 12+ файлах. Это «toggle debt» — два пути расходятся, тесты не покрывают комбинации, удаление старого кода становится невозможным.

**Решение:** один `InstantPosBridge` объект, собираемый в `PosScreen`, пробрасываемый вниз через props:

```tsx
// PosScreen.tsx — ЕДИНСТВЕННОЕ место проверки флага
const bridge: InstantPosBridge | null = INSTANT_AUTH_ENABLED
  ? { categories, products, currentOrderItems, addItem, removeItem, deleteCurrentOrder, updateMeta }
  : null;

// Компоненты не знают про флаг:
<ProductGrid bridge={bridge} />
<OrderPanel bridge={bridge} />
```

**Почему:** флаг в одном месте → легко удалить, компоненты тестируются одинаково, `React.memo` не ломается.

### Counter cache для дашборда (уже сделано)

Дашборд админки переведён на `venueDailyStats` с атомарным `$inc` в `payOrder`. 15 тяжёлых запросов → лёгкие stats-запросы.

---

## Фазы

### 🔴 Фаза 1 — Critical Bugs (блокирует любой meaningful тест)

| # | Файл | Баг | Фикс |
|---|---|---|---|
| 1.1 | `PaymentScreen.tsx:92,122` | `payTotal * 100` и `payCashAmount * 100` — 100x переплата. `payTotal` и `payCashAmount` уже в тийынах (из `getTotal()`, который возвращает tiyin). `handleExact` передаёт tiyin в `cashInput`. | Убрать `* 100`: `totalAmountTiyin: instantOrder.totalAmountTiyin ?? payTotal`, `tenderedCashTiyin: payMethod === 'cash' ? payCashAmount : undefined` |
| 1.2 | `TablePickerScreen.tsx:17,27,32` | На Instant-пути `useOrderStore` (Supabase) пуст — заказы созданы в InstantDB. `getOrderForTable` возвращает undefined для всех столов → цвета всегда «свободен». | Для `getOrderForTable` на Instant-пути читать `useInstantOrders`. Screen-level — не часть bridge (отдельный экран, не ребёнок PosScreen). |
| 1.3 | `TablePickerScreen.tsx:32-46` | `createOrderCommand().execute()` без try/catch → краш при сетевой ошибке (offline, timeout). | Обернуть в try/catch, показать Alert с сообщением. |
| 1.4 | `shiftStore.ts:377-410` | `fetchInstantOpenShift` запрашивает только таблицу `shifts`, все счётчики захардкожены в 0 → Z-отчёт показывает нули после рестарта. | Добавить join payments в запрос (subquery или второй запрос) — считать `totalRevenue`, `cashTotal`, `cardTotal`, `otherTotal`. |
| 1.5 | `InstantOpenShiftScreen.tsx:29,168` | Кнопка `disabled={submitting \|\| !canOpenShift}` — нет `isLoading`. Пока `useInstantShift` грузится, `existingShift = undefined`, можно тапнуть и создать дубликат смены. | `disabled={submitting \|\| isLoading \|\| !canOpenShift}` |

**Acceptance:** каждый баг воспроизводится → фикс → не воспроизводится. Верификация через `SMOKE_TEST_CHECKLIST.md` (существующий в корне репо).

---

### 🟡 Фаза 2 — Bridge-паттерн (разблокирует Фазу 3)

**Цель:** убрать `INSTANT_AUTH_ENABLED` из всех компонентов-детей PosScreen, оставить только в `PosScreen` и screen-роутере.

| # | Что | Файлы |
|---|---|---|
| 2.1 | Тип `InstantPosBridge` уже существует — выверить контракт с реальным кодом, убрать `employees` (нет в типе) | `src/types/instantBridge.ts` |
| 2.2 | Вынести инлайн-сборку bridge из `PosScreen` в `useInstantBridge` хук (сейчас сборка в строках 49-66) | `src/hooks/useInstantBridge.ts` (новый) |
| 2.3 | `PosScreen`: использовать хук, передавать bridge вниз (уже частично сделано — bridge собирается, но children его не используют) | `PosScreen.tsx` |
| 2.4 | `ProductGrid`: принимать `bridge?`, fallback на `useOrderStore`/`useMenuStore` | `ProductGrid.tsx` |
| 2.5 | `CategoryMenu`: то же | `CategoryMenu.tsx` |
| 2.6 | `ModifierGrid`: то же | `ModifierGrid.tsx` |
| 2.7 | `OrderPanel`: то же (уже принимает `items?` пропс — расширить до bridge) | `OrderPanel.tsx` |
| 2.8 | `DeleteOptions`, `WaiterPickerPanel`, `GuestCounterPanel`, `CommentModal`, `PosHeader`: то же | 5 файлов |
| 2.9 | Удалить `INSTANT_AUTH_ENABLED` из всех компонентов кроме `PosScreen` и screen-роутера | ~12 файлов |

**Контракт `InstantPosBridge` (актуальный — синхронизирован с `src/types/instantBridge.ts`):**
```ts
interface InstantPosBridge {
  // Reactive data (from InstantDB live queries)
  categories: InstantCategory[];
  products: Record<string, InstantProduct>;
  currentOrderItems: OrderItem[];

  // Imperative write actions (from useInstantOrderEditor)
  addItem: (item: OrderItem) => Promise<void>;
  removeItem: (itemId: string, priceTiyin: number, quantity: number) => Promise<void>;
  deleteCurrentOrder: () => Promise<void>;
  updateMeta: (patch: { tableId?: string; guestCount?: number; employeeId?: string; comment?: string }) => Promise<void>;
}
```

**TablePickerScreen — исключение:** это отдельный экран (не ребёнок PosScreen), bridge до него не доходит. Фикс в Фазе 1.2: читать `useInstantOrders` напрямую. В фазе 5 можно будет передавать заказы через navigation params.

**Acceptance:** при `INSTANT_AUTH_ENABLED=true` полный цикл «тап по продукту → блюдо в OrderPanel → модификаторы → удаление» работает без Supabase.

---

### 🔵 Фаза 3 — Оплата + края

| # | Что |
|---|---|
| 3.1 | `PaymentScreen`: обработка ошибок (DomainError → Alert, network error → «Нет соединения») |
| 3.2 | `PaymentScreen`: навигация на `PaidCheckScreen` после оплаты |
| 3.3 | `PaidCheckScreen`: убрать Supabase RPC `fetchPaymentForOrder`, брать из InstantDB |
| 3.4 | `InstantLockScreen`: убрать `\|\| isShiftLoading` из disabled, добавить error state |
| 3.5 | `shiftStore`: убрать `recordPayment` → Supabase, закрыть dual-write баг |

---

### ⚪ Фаза 4 — Чистка + Polish

| # | Что |
|---|---|
| 4.1 | Удалить `INSTANT_AUTH_ENABLED` полностью |
| 4.2 | Удалить: `orderStore.ts`, `menuStore.ts`, `syncOutboxStore.ts`, `orderOutboxStore.ts`, `db/database.ts`, `useOrderRealtime.ts` (после верификации всех consumers) |
| 4.3 | Удалить `@supabase/supabase-js` из dependencies |
| 4.4 | Убрать `any` из InstantDB-хуков, заменить на типы из `AppSchema` |
| 4.5 | `ModifierGrid`: разбить на 4 под-компонента по режимам (quantity / comment / delete / modifiers) |
| 4.6 | `ProductGrid`: стабильные key по `product.id` вместо индексов |
| 4.7 | `OrderPanel`: заменить `ScrollView` на `FlatList`, `useCallback` для `renderItem` |
| 4.8 | `PosHeader`: `useMemo` для `currentOrder`, `useRef` + interval для часов |
| 4.9 | `FloorPlan`: `useMemo` для `ordersByTable` (Map), убрать O(n²) |
| 4.10 | `React.memo` + `useMemo` на проблемные компоненты (с замером через Profiler) |

---

## Приоритеты (что делать в следующей сессии)

1. **Фаза 1** — 5 critical bugs (1-2 часа). Без этого любой тест InstantDB-пути даёт ложные результаты.
2. **Фаза 2** — bridge-паттерн (2-3 часа). Разблокирует всё остальное.
3. **Фаза 3.1-3.3** — оплата (1 час). После фаз 1+2 можно протестировать полный цикл.

Фаза 4 — после подтверждения что основной цикл работает.

---

## Что НЕ входит (deferred)

- Warehouse/Inventory миграция (6 страниц админки)
- FloorPlan write-мутации (админка)
- Backfill скрипт для `venueDailyStats`
- Историческая сверка счётчиков
- Удаление Supabase из админки (кроме auth)
- Pre-existing TypeScript errors в админке (CashShifts, Checks, Transactions)
