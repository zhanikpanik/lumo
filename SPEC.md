# r_keeper Clone — Design Spec

## Test Environment
- **Target**: Landscape tablet (POS kiosk)
- **Test method**: Browser via `npx expo start --web`
- **Known viewport**: ~1555×1292 (browser-reported, with Windows scaling)
- **Design reference**: `refs/` folder

## Screens

### 1. Orders Screen (`OrdersScreen.tsx`)
- **Status**: ✅ In progress
- **Reference**: `refs/orders.png`, `refs/zone 1-4.png`
- **Layout**: Header (44px) + 4×5 grid + Bottom tab bar
- **Grid rules**:
  - Cell [0,0] = "Новый заказ" + "Быстрый чек" (split in half)
  - Cells 1–19 = order cards
  - If >19 orders → last cell = pagination (^/v split in half)
  - All cells equal size, flex-based (no fixed px)
- **Card colors**: Green=active, Red=alert, Gray=inactive
- **Bottom bar**: ≡ | Заказы (purple active) | Столы | 🔒

### 2. POS Screen (`PosScreen.tsx`)
- **Status**: 🔲 Needs work
- **Reference**: `refs/order_creation.png`, `refs/{CF291D0A...}.png`, `refs/{ABCE095C...}.png`
- **Layout**: 3-column (35% order / 25% actions / 40% products)
- **Modes**:
  - Default: Category menu + Product grid
  - Modifier: Modifier grid (when item selected)
  - Search: Keyboard + filtered results

## Done
- [x] Auto-save: every mutation syncs to orders[] immediately
- [x] Footer: Пречек | Оплата | Скидки | Ввести код | Готово (columns match content above)
- [x] Footer: item selected → Отмена + Готово
- [x] OrderPanel: touch scroll + floating comment button (replaced up/down buttons)
- [x] Dynamic grid rows/cols based on screen size
- [x] Quantity numpad matching reference design
- [x] Order cards: Gorbunova-style clean typography, scaled text
- [x] Table view: Poster-style floor plan with shapes (small/regular/wide/tall/bar)
- [x] Payment screen: Cash/Card/Без оплаты with reason picker
- [x] Font: Inter (Regular/Medium/Bold) loaded via expo-font, centralized in theme/fonts.ts
- [x] Color scheme: #333 default, #003E21 paid, #400A0A alert

## TODO
- [ ] POS header: order settings menu (⋮) — change table, waiter, type, add comment, merge/split order
- [ ] Пречек flow — what happens on tap
- [ ] Floor plan editor — drag & drop tables
- [ ] E-Kassa integration (fiscal receipts)

### Done (POS improvements)
- [x] Комментарий к блюду — dish-level comment with presets (replaced "Перенести" in actions)
- [x] Order comment — floating button in order panel, shows comment text when added
- [x] Comment icon removed from header (moved to order panel)

### Client & Guest System (planned)
- [ ] **Database**: `clients` table (name, phone, card_number, discount_percent, tier, total_visits, total_spent)
- [ ] **Database**: `client_visits` table (client_id, order_id, visit_date, amount_spent)
- [ ] **Header chip**: [👤 Клиент ▾] — tap opens ClientSearchModal
- [ ] **ClientSearchModal**: search by phone/name/card, recent clients, add new client
- [ ] **Client attached**: chip shows name + discount (e.g. "Петров А. -10%")
- [ ] **Auto-discount**: client tier discount auto-applies to order total
- [ ] **Guest tabs**: in order panel — switch between guests, assign dishes to guests
- [ ] **Bill splitting**: split by guest / equal split / custom split (PaymentScreen)
- [ ] **Visit tracking**: record visit + amount on order close/payment
- [ ] Discount stacking rules: client discount vs manual discount (decide: stack or override)

### Later
- [ ] Скидка — discount on specific item
- [ ] Bell button: notifications (kitchen ready, alerts)
- [ ] Скидки и наценки flow
- [ ] Ввести код flow
