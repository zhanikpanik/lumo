# POS Smoke-Test Handoff — 2026-08-05

## Контекст

Миграция POS с Supabase на InstantDB: 4 фазы выполнены, ~18 файлов изменено.
Код собирается (`expo export --platform web` прошёл), TypeScript — 0 новых ошибок, Jest — 10/12 passed.

**Ключевое:** `INSTANT_AUTH_ENABLED=true` в `.env.local` включает InstantDB-путь.

## Как запустить

```bash
cd apps/pos
# Убедись что .env.local содержит:
# EXPO_PUBLIC_INSTANT_AUTH_ENABLED=true
npx expo start
# Открыть на iPad/симуляторе через Expo Go или dev client
```

## Что тестировать (порядок важен)

### 1. Экран блокировки → Открытие смены
- Введи PIN сотрудника
- **Проверить:** кнопка «Открыть смену» неактивна пока идёт `Проверка смены...`
- **Проверить:** нельзя создать дубликат смены (гонка исправлена)
- Открой смену, введи сумму в кассе

### 2. Создание заказа (TablePicker → PosScreen)
- Выбери стол на плане зала
- **Проверить:** столы с активными заказами подсвечены (раньше всегда были «свободны»)
- **Проверить:** если офлайн — Alert «Ошибка», а не краш (try/catch добавлен)
- Тапни по столу → создаётся заказ → переход на PosScreen

### 3. Основной цикл POS (добавление блюд)
- Тапни по блюду в ProductGrid → появляется в OrderPanel
- **Проверить:** скролл в OrderPanel работает (FlatList заменил ScrollView)
- **Проверить:** кнопки ↑↓ скролла работают
- Тапни по блюду → выбери модификаторы → «Готово»
- Добавь несколько блюд, поменяй категорию
- **Проверить:** нет мерцания/перескока при смене категории (стабильные key)

### 4. Мета-действия
- Нажми «✎» → выбери «Официант» → выбери официанта → **проверить:** сохранился
- Нажми «✎» → выбери «Гости» → измени количество → **проверить:** сохранилось
- Нажми на комментарий → введи текст → сохрани → **проверить:** отображается
- Нажми «✎» → «Удалить» → подтверди → **проверить:** заказ удалён

### 5. Оплата
- Создай новый заказ с блюдами
- Нажми «Оплата»
- Выбери метод (наличные/карта)
- Нажми «Оплатить»
- **Проверить:** редирект на PaidCheckScreen (экран с чеком)
- **Проверить:** сумма оплаты корректная (не ×100! — баг 1.1 исправлен)

### 6. PaidCheckScreen
- **Проверить:** отображается сумма, метод оплаты, сдача
- **Проверить:** кнопка «Назад» возвращает на Orders
- **Проверить:** возврат (refund) работает (если есть права)

### 7. Z-отчёт (CloseShiftScreen)
- Открой CloseShiftScreen
- **Проверить:** суммы не нулевые (раньше был баг 1.4 — payments не подтягивались)
- Закрой смену

### 8. Режим «Без оплаты» (закрытие заказа)
- Создай заказ → Оплата → «Без оплаты» → выбери причину
- **Проверить:** заказ закрыт, статус «cancelled», редирект на Orders

## Что изменилось (для отладки)

| Файл | Что |
|---|---|
| `hooks/useInstantBridge.ts` | **Новый.** Собирает bridge из InstantDB-хуков |
| `screens/PosScreen.tsx` | Bridge через хук, колбэки детям, один `INSTANT_AUTH_ENABLED` |
| `screens/PaymentScreen.tsx` | `*100` убран, DomainError-обработка, оба пути → PaidCheck |
| `screens/TablePickerScreen.tsx` | `useInstantOrders` для цветов, try/catch |
| `screens/PaidCheckScreen.tsx` | InstantDB-платежи вместо Supabase RPC |
| `screens/InstantLockScreen.tsx` | Убран неиспользуемый `isShiftLoading` |
| `screens/InstantOpenShiftScreen.tsx` | `isLoading` в `disabled` |
| `store/shiftStore.ts` | `fetchInstantOpenShift` с payments, dual-write guard |
| `store/useInstantMenu.ts` | Типизация (row types вместо `any`) |
| `store/useInstantOrders.ts` | Типизация (row types вместо `any`) |
| `store/useInstantShift.ts` | Типизация (row types вместо `any`) |
| `components/ProductGrid.tsx` | Стабильные key по `product.id` |
| `components/OrderPanel.tsx` | `ScrollView → FlatList`, `scrollToOffset` |
| `components/PosHeader.tsx` | Часы через `useRef` + `setInterval` |
| `components/FloorPlan.tsx` | `useMemo` Map для O(1) поиска заказов |
| `components/WaiterPickerPanel.tsx` | `onChangeWaiter` колбэк |
| `components/CommentModal.tsx` | `onSaveComment` колбэк |

## Если что-то сломалось

### Ошибка «Нет соединения»
Появилась в PaymentScreen — это новая обработка network errors. Проверь, есть ли реально сеть.

### DomainError «Заказ уже оплачен»
Новая обработка — показывает понятное сообщение вместо stack trace.

### OrderPanel не скроллится
FlatList заменил ScrollView. Если скролл-кнопки не работают — проверь `scrollToOffset` в `handleScrollUp`/`handleScrollDown`.

### PosHeader мерцает
Часы теперь через `setInterval` (60s). Не должны перерендериваться каждую секунду.

## Переключение на Supabase-путь

```bash
# В .env.local:
EXPO_PUBLIC_INSTANT_AUTH_ENABLED=false
```
Все компоненты имеют fallback на Zustand-сторы. Bridge становится `null`.
