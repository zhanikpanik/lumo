# r_keeper — Expo POS for Alto Coffee Bishkek

Mobile point-of-sale app for waiters. Runs on tablets (iPad). Shares Supabase with `r_keeper-admin`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Expo 52 + React Native 0.76 |
| State | Zustand 5 |
| Navigation | React Navigation 7 (Stack) |
| Backend | Supabase (shared with admin) |
| Font | Onest (400/500/700) via @expo-google-fonts |
| Testing | Jest + jest-expo |
| Icons | Custom SVGs in `src/assets/icons/` |

## Project Structure

```
src/
├── screens/              # 9 screens (Stack navigator in App.tsx)
│   ├── PosScreen.tsx          # Main POS: FloorPlan + OrderPanel
│   ├── OrdersScreen.tsx       # Order list (table view)
│   ├── PaymentScreen.tsx      # Payment flow
│   ├── PaidCheckScreen.tsx    # Paid check view
│   ├── TablePickerScreen.tsx  # Table selection
│   ├── LockScreen.tsx         # Lock/unlock
│   ├── OpenShiftScreen.tsx    # Shift open
│   ├── CashScreen.tsx         # Cash operations
│   ├── CloseShiftScreen.tsx   # Shift close
│   └── OrderCardShowcase.tsx  # Dev showcase
├── components/           # 25+ components
│   ├── FloorPlan.tsx          # Table map (Canvas)
│   ├── OrderPanel.tsx         # Active order editing
│   ├── ProductGrid.tsx        # Menu product grid
│   ├── CategoryMenu.tsx       # Category tabs
│   ├── ModifierGrid.tsx       # Dish modifiers
│   ├── Numpad.tsx             # Quantity numpad
│   ├── OrderCard.tsx          # Order card (OrdersScreen)
│   ├── BottomTabBar.tsx       # Tab navigation
│   ├── PosHeader.tsx          # Top bar
│   └── ... modals (BaseModal, CashModal, CommentModal, etc.)
├── store/                # 8 Zustand stores
│   ├── orderStore.ts          # Orders CRUD + Supabase sync (899 lines)
│   ├── menuStore.ts           # Categories + products
│   ├── shiftStore.ts          # Current shift + user
│   ├── venueStore.ts          # Venue/zones config
│   ├── ordersUiStore.ts       # UI state (selected order, view mode)
│   ├── notificationStore.ts   # Order notifications
│   ├── syncOutboxStore.ts     # Offline queue
│   └── deadLetterStore.ts     # Failed sync items
├── api/                  # Supabase operations
│   ├── inventory.ts           # Stock finalization
│   └── payments.ts            # Payment processing
├── hooks/
│   └── useOrderRealtime.ts    # Supabase realtime subscription
├── utils/
│   ├── supabase.ts            # Supabase client (EXPO_PUBLIC_*)
│   ├── permissions.ts         # Permission checks
│   ├── logger.ts              # Structured logger
│   └── squircle.ts            # Squircle shape helper
├── theme/
│   ├── colors.ts              # Dark theme token system (~100 tokens)
│   └── fonts.ts               # Font config
├── types/
│   └── index.ts               # Order, Product, Modifier, etc.
└── config.ts                  # VENUE_ID + feature flags
```

## Navigation Flow

```
LockScreen → OpenShiftScreen → PosScreen (главный экран)
                                  ├── TablePickerScreen
                                  ├── PaymentScreen → PaidCheckScreen
                                  ├── CashScreen → CloseShiftScreen
                                  └── OrdersScreen (таб)
```

## Key Architecture Patterns

### Offline-first with syncOutbox
- Orders created locally, synced to Supabase fire-and-forget
- Failed syncs go to `syncOutboxStore` → retry queue
- Permanent failures → `deadLetterStore` → DeadLetterModal

### Order Events
- `orderStore.syncOrderItems` writes `item_added`/`item_removed` to `order_events`
- `PaymentScreen` writes `cancelled` on close without payment
- Admin reads `order_events` for dashboard detectors

### Stock Consumption
- On payment: POS calls `finalize_order_consumption` RPC
- RPC writes `inventory_movements` (списание по техкарте)
- Admin reads `inventory_movements` for stock analysis

## Design Conventions

### Dark Theme Only
- Background: `#1A1A1A`, Surface: `#2C2C2C`
- Text: `#FFFFFF` (primary), `#999999` (secondary)
- Accent: `#00C853` (green)
- Destructive: `#D32F2F`
- All colors from `theme.colors` — no raw hex

### Layout Constants
- GAP: 10px (standardized across screens and components)
- Border radius: 10px
- Footer height: 56px
- Product grid: 3×5 (right panel), 2×5 (middle panel)

### Font
- Onest (400 Regular, 500 Medium, 700 Bold)
- Always use `theme.fonts` for font family references

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=        # Must match VITE_SUPABASE_URL in admin
EXPO_PUBLIC_SUPABASE_ANON_KEY=   # Must match VITE_SUPABASE_ANON_KEY in admin
EXPO_PUBLIC_VENUE_ID=            # Must match VITE_VENUE_ID in admin
```

## Common Commands

```bash
npx expo start           # Dev server
npx expo start --ios     # iOS simulator
npx expo start --android # Android
npm test                 # Jest
```

## Shared with Admin (r_keeper-admin)

| Table/RPC | POS writes | Admin reads |
|-----------|-----------|-------------|
| `orders` | Create/update orders | Dashboard metrics |
| `order_events` | item_added/removed/cancelled | Detectors |
| `inventory_movements` | Consumption via RPC | Stock analysis |
| `shifts` | Open/close | Cash analytics |
| `stock_items` | Read availability | Warehouse management |

### Sync Checklist
- Both repos must use **same Supabase project** (same URL + anon key)
- Both must use **same VENUE_ID**
- POS `FLOOR_PLAN_ZONE_ID` must match admin `VITE_FLOOR_PLAN_ZONE_ID`

## Pitfalls

- Never use raw hex colors — always `theme.colors.*`
- `orderStore.ts` is the core file (899 lines) — changes there affect everything
- Offline sync is fire-and-forget — test with network disabled
- `.env` is gitignored, `.env.example` is committed — keep in sync
