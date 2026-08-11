# Shadcn Migration Plan — r_keeper Admin

> Полный аудит всех 24 страниц и 16 компонентов. 
> Дата: 19 мая 2026.

## Текущее состояние

**Зависимости уже установлены:**
```
@radix-ui/react-dialog          ✅  (используется 1 раз — AddTableModal)
@radix-ui/react-label           ✅  (используется 1 раз — AddTableModal)
@radix-ui/react-select          ❌  не используется
@radix-ui/react-popover         ❌  не используется
@radix-ui/react-tabs            ❌  не используется
@radix-ui/react-dropdown-menu   ❌  не используется
@radix-ui/react-alert-dialog    ❌  не используется
@radix-ui/react-checkbox        ❌  не используется
@radix-ui/react-slot            ❌  не используется
clsx + tailwind-merge            ✅  (cn() в lib/utils.ts)
tailwindcss v4                   ✅
sonner                           ✅  (но <Toaster /> не рендерится!)
lucide-react                     ✅
```

**Что отсутствует для shadcn:**
- `tailwindcss-animate` (для анимаций)
- `class-variance-authority` (cva, для variants)
- `globals.css` с CSS-переменными shadcn
- `@radix-ui/react-toggle-group` (для ToggleGroup — нужно доустановить)
- `cmdk` (для Command — нужно доустановить)

**126 хардкодных цветов** в коде без единой CSS-переменной.

---

## Что можно заменить на shadcn-компоненты

### 🔴 P0 — Критичные (дубликаты, accessibility, браузерные диалоги)

| # | Сейчас (самодельное) | Заменить на shadcn | Где используется | Масштаб проблемы |
|---|---------------------|-------------------|------------------|------------------|
| 1 | **Segmented button group** — `inline-flex` + `style={{ backgroundColor: '#FAFAFA' }}` | `ToggleGroup` | **24 места в 9 файлах:** DishEdit (6×), Inventory (2×), CashShifts (2×), Checks (2×), Transactions (1×), AddIngredients — `SegmentedRow` (2×), EditIngredient (2×), WarehouseSelector (3× наш новый, уже компонент), WarehousesAdmin (1×) | ~360 строк дубликатов |
| 2 | **IngredientPicker** — input + div dropdown, ручной blur/focus/поиск | `Command` (cmdk) + `Popover` | DishEdit (4×), Delivery (1×), WriteOff (1×), Transfer (1×), AddIngredients, EditIngredient | ~60 строк, нет ARIA, нет клавиатуры |
| 3 | **CategoryDropdown** — ручной button + div список с поиском | `Command` + `Popover` | DishEdit (1×) | ~50 строк |
| 4 | **Нативные `<select>`** | `Select` | Staff (роль), Checks (официант), SettingsPage (тип категории), Inventory (частичная/полная в модалке) | 5 мест |
| 5 | **Modal** — raw div без фокус-ловушки, без ESC, backdrop не анимирован | `Dialog` | Transactions, CashShifts (2 модалки), FloorPlan (AddTableModal уже на Radix Dialog) | 2 кастомные + 1 на Radix |
| 6 | **`window.confirm()`** — браузерный диалог | `AlertDialog` | **11 мест:** DishEdit, Ingredients, Menu, Staff, Checks, Inventory, FloorPlan, Layout (удаление склада), Deliveries, WriteOffs, Transfers | Везде где есть кнопка удаления |
| 7 | **`window.prompt()`** — браузерный диалог | `Dialog` с Input | Layout (создание/переименование склада) | 2 места |
| 8 | **Контекстное меню склада** (sidebar) — ручной div с `useRef` + click-outside | `DropdownMenu` | Layout | ~30 строк |
| 9 | **`alert()` для ошибок** — 20+ вызовов в DishEdit, 4 в Staff | `toast()` (уже есть sonner, просто заменить вызовы) | DishEdit, Staff, Inventory (2×) | Смешанный подход alert/toast |

### 🟡 P1 — Улучшат UX и консистентность

| # | Сейчас | Заменить на shadcn | Где |
|---|--------|-------------------|-----|
| 10 | **Нативные `<input type="date/time">`** | `Calendar` + `Popover` | Delivery, WriteOff, Transfer, Inventory, CashShifts (6 мест) |
| 11 | **Таблицы с `gridTemplateColumns`** — 11 разных CSS-гридов | `Table` (семантический HTML) | Deliveries, WriteOffs, Transfers, Transactions, Inventory, Menu, Ingredients, Staff, CashShifts, Checks, WarehousesAdmin |
| 12 | **Состояние загрузки** — текст "Загрузка…" | `Skeleton` | Все 18+ страниц |
| 13 | **Тултипы** — через `title=""` атрибут (не стилизуется, нет задержки) | `Tooltip` (Radix HoverCard) | Transactions, CheckDetail, Ingredients, SettingsPage |
| 14 | **Ручной чекбокс** `<input type="checkbox">` | `Checkbox` + `Label` | Transactions (1 место) |
| 15 | **Инпуты с `bg-background`** — не соответствуют нашему стандарту `bg-[#F6F5F4]` | `Input` (после настройки темы) | SettingsPage (6 инпутов), Staff, AddIngredients, EditIngredient |
| 16 | **Разделители** — `<hr>` с хардкодным цветом | `Separator` | SettingsPage |

### 🟢 P2 — Nice to have

| # | Сейчас | Заменить на shadcn | Где |
|---|--------|-------------------|-----|
| 17 | **Статус-бейджи** — самодельный `StatusBadge` | `Badge` | Deliveries, WriteOffs, Transfers, Inventory, CashShifts |
| 18 | **Кнопка сохранения** — зелёная, дублируется в EditPage и 5+ местах | `Button` (variant="default") | EditPage, ActionButtons, FloorPlanToolbar |
| 19 | **Tabs в модалках** — не реализованы | `Tabs` | CashShifts (детали смены), потенциально настройки |
| 20 | **Sheet / slide-over** — не используется | `Sheet` | Мобильная версия сайдбара, панель фильтров |
| 21 | **HoverCard для preview** | `HoverCard` | Карточка блюда при наведении в чеках |
| 22 | **Collapsible / Accordion** — модификаторы в DishEdit, история в Inventory | `Accordion` или `Collapsible` | DishEdit (группы модификаторов), Inventory (история) |

---

## Что НЕ надо заменять на shadcn

| Компонент | Почему оставить |
|-----------|----------------|
| **EditPage** | Хороший собственный шелл, shadcn не даёт аналога |
| **Field** | Простой, работает, можно обернуть в shadcn `FormField` позже |
| **DecimalSuffixInput** | Специфичная логика (суффиксы, маски) — shadcn Input не заменит |
| **DeleteButton / DeleteLineButton** | Простые, специфичный дизайн |
| **SearchInput** | Обычный Input с иконкой, shadcn Input + иконка — то же самое |
| **FloorPlan** | Полностью кастомный (drag, resize, зоны) — вне зоны shadcn |
| **WarehouseSelector** | Мы только что сделали, и он станет `ToggleGroup` в Подходе 2 |

---

## 🚨 Ошибки, которые нужно исправить прямо сейчас

### 1. `<Toaster />` не рендерится
`sonner` импортируется и `toast()` вызывается в 10+ файлах, но `<Toaster />` не в DOM.
Тосты молча не показываются. Надо добавить в `App.tsx`:

```tsx
import { Toaster } from 'sonner';
<Toaster position="bottom-right" richColors />
```

### 2. `alert()` вместо `toast()` — 24 вызова
DishEdit (20×), Staff (4×), Inventory (2×). Надо заменить на `toast.error()`.

### 3. Инпуты SettingsPage не соответствуют стандарту
6 инпутов с `bg-background` вместо `bg-[#F6F5F4]`, без `border-[#E6E5E3]`.

---

## План миграции

### Подход 1 — фундамент (1 час)
- [ ] `npm install tailwindcss-animate class-variance-authority @radix-ui/react-toggle-group cmdk`
- [ ] Добавить `<Toaster />` в App.tsx
- [ ] `npx shadcn@latest init` (создаст `components.json`, `globals.css`)
- [ ] Заменить `alert()` на `toast.error()` в DishEdit, Staff, Inventory
- [ ] Починить инпуты SettingsPage

### Подход 2 — P0 компоненты (4-5 часов)
- [ ] `ToggleGroup` для ВСЕХ segmented button групп (24 места → 1 компонент)
- [ ] `Command` + `Popover` для IngredientPicker и CategoryDropdown
- [ ] `Select` для нативных `<select>` (5 мест)
- [ ] `AlertDialog` вместо `window.confirm()` (11 мест)
- [ ] `Dialog` с Input вместо `window.prompt()` (2 места)

### Подход 3 — диалоги и меню (2-3 часа)
- [ ] `Dialog` вместо самодельного `Modal` в Transactions, CashShifts
- [ ] `DropdownMenu` для контекстного меню склада в Layout

### Подход 4 — таблицы и качество жизни (4-6 часов)
- [ ] `Skeleton` для состояний загрузки (все страницы)
- [ ] `Tooltip` вместо `title=""`
- [ ] `Calendar` для выбора дат
- [ ] `Badge` для статусов
- [ ] `Separator` для разделителей
- [ ] `Button` для кнопок сохранения

---

## Сводка: что заменяем

| Компонент shadcn | Заменяет | Мест | Приоритет |
|-----------------|----------|------|-----------|
| **ToggleGroup** | 24 segmented button группы | 9 файлов | 🔴 P0 |
| **Command** | IngredientPicker + CategoryDropdown | 2 компонента | 🔴 P0 |
| **Select** | 5 нативных `<select>` | 4 файла | 🔴 P0 |
| **AlertDialog** | 11 `window.confirm()` | 8 файлов | 🔴 P0 |
| **Dialog** | Modal + `window.prompt()` | 4 места | 🔴 P0 |
| **DropdownMenu** | Контекстное меню склада | 1 файл | 🔴 P0 |
| **Skeleton** | "Загрузка…" текст | 18+ страниц | 🟡 P1 |
| **Tooltip** | `title=""` атрибуты | 4 файла | 🟡 P1 |
| **Calendar** | `<input type="date">` | 6 мест | 🟡 P1 |
| **Table** | CSS grid таблицы | 11 страниц | 🟡 P1 |
| **Input** | Инпуты без стандарта | 3 файла | 🟡 P1 |
| **Checkbox** | 1 `<input type="checkbox">` | 1 файл | 🟡 P1 |
| **Separator** | `<hr>` | 1 файл | 🟡 P1 |
| **Badge** | StatusBadge | 5 страниц | 🟢 P2 |
| **Button** | Кнопки сохранения | 3 файла | 🟢 P2 |
| **Accordion** | Группы модификаторов | 2 страницы | 🟢 P2 |
| **Sheet** | Мобильный сайдбар | новый | 🟢 P2 |
| **HoverCard** | Превью блюда | новый | 🟢 P2 |
| **Tabs** | Вкладки в модалках | новый | 🟢 P2 |

**Итого: 18 компонентов shadcn, ~45 мест замены, ~12 часов работы.**
