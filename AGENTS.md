# Lumo — Expo POS for Alto Coffee Bishkek

Mobile point-of-sale app for waiters. Runs on tablets (iPad). Shares InstantDB with `Lumo-admin`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Expo 52 + React Native 0.76 |
| State | Zustand 5 (UI/auth only) + InstantDB (data) |
| Navigation | React Navigation 7 (Stack) |
| Backend | InstantDB (reactive queries + optimistic writes) |
| Font | Onest (400/500/700) via @expo-google-fonts |
| Testing | Jest + jest-expo |
| Icons | Custom SVGs in `src/assets/icons/` |

## Project Structure

```
src/
├── screens/              # 9 screens (Stack navigator in App.tsx)
│   ├── PosScreen.tsx          # Main POS: FloorPlan + OrderPanel
│   ├── InstantOrdersScreen.tsx # Order list (table view)
│   ├── PaymentScreen.tsx      # Payment flow
│   ├── PaidCheckScreen.tsx    # Paid check view
│   ├── TablePickerScreen.tsx  # Table selection
│   ├── LockScreen.tsx         # Lock/unlock (re-exports InstantLockScreen)
│   ├── OpenShiftScreen.tsx    # Shift open (re-exports InstantOpenShiftScreen)
│   ├── CashScreen.tsx         # Cash operations
│   ├── CloseShiftScreen.tsx   # Shift close
│   └── OrderCardShowcase.tsx  # Dev showcase
├── components/           # 25+ components
│   ├── FloorPlan.tsx          # Table map (Canvas)
│   ├── FloorPlanCanvas.tsx    # Canvas renderer
│   ├── OrderPanel.tsx         # Active order editing
│   ├── ProductGrid.tsx        # Menu product grid
│   ├── CategoryMenu.tsx       # Category tabs
│   ├── ModifierGrid.tsx       # Dish modifiers
│   ├── Numpad.tsx             # Quantity numpad
│   ├── OrderCard.tsx          # Order card (OrdersScreen)
│   ├── PosHeader.tsx          # Top bar
│   ├── NotificationBell.tsx   # Unread badge
│   ├── NotificationModal.tsx  # Notifications list
│   └── ... modals (CashModal, CloseShiftModal, CommentModal, etc.)
├── store/                # 3 Zustand stores (UI/auth only)
│   ├── posUiStore.ts          # UI state: selection, draft, active category
│   ├── ordersUiStore.ts       # UI state (selected order, view mode)
│   ├── userStore.ts           # currentUser + AsyncStorage persist
│   └── notificationStore.ts   # Local notifications + marketplace unseen
├── data/
│   ├── instant.ts             # InstantDB client (React Native)
│   ├── instant.web.ts         # InstantDB client (web)
│   ├── employeePin.ts         # Offline PIN verification
│   └── employeePin.web.ts     # Web variant
├── utils/
│   ├── permissions.ts         # Permission checks
│   ├── logger.ts              # Structured logger
│   ├── orderMapping.ts        # InstantDB row → Order mapping
│   ├── notificationSound.ts   # Marketplace arrival chirp
│   ├── money.ts               # Tiyin formatting
│   └── squircle.ts            # Squircle shape helper
├── print/
│   ├── printService.ts        # Print adapter interface
│   ├── HttpPrintAdapter.ts    # HTTP bridge adapter
│   └── escpos.ts              # ESC/POS commands
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
                                  └── InstantOrdersScreen (таб)
```

## Key Architecture Patterns

### InstantDB reactive data
- All persistent data lives in InstantDB (`@lumo/data` schema)
- Components use `db.useQuery()` for reactive reads
- Writes via `db.transact()` or `@lumo/data` command functions
- Optimistic updates — UI reflects changes before server confirms

### Zustand for UI/auth only
- `posUiStore` — selected item, draft item, active category, modifier actions
- `userStore` — `currentUser` + AsyncStorage persist (offline login)
- `ordersUiStore` — selected order, view mode
- `notificationStore` — local notifications, marketplace unseen (Glovo/Yandex)

### Order lifecycle
- `@lumo/data` commands: `createOrder`, `addOrderLine`, `removeOrderLine`, `payOrder`, `cancelOrder`, `refundOrder`
- All commands are atomic InstantDB transactions
- Stock consumption via `inventoryMovements` entity

### Shift management
- `useInstantShift` hook reads shifts from InstantDB
- `openShift` / `closeShift` commands in `@lumo/data`
- Cash movements via `cashMovements` entity

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
EXPO_PUBLIC_VENUE_ID=              # Must match admin VENUE_ID
EXPO_PUBLIC_INSTANT_ENV=           # development | production
EXPO_PUBLIC_INSTANT_APP_ID=        # InstantDB app ID
EXPO_PUBLIC_ACTIVATION_WORKER_URL= # Device activation worker
EXPO_PUBLIC_PRINT_BRIDGE_URL=      # Receipt printer bridge
```

## Common Commands

```bash
npx expo start           # Dev server
npx expo start --ios     # iOS simulator
npx expo start --android # Android
npm test                 # Jest
```

## Shared with Admin (Lumo-admin)

Both apps share the same InstantDB project and schema (`@lumo/data`).

| Entity | POS writes | Admin reads |
|--------|-----------|-------------|
| `orders` | Create/update | Dashboard metrics |
| `orderEvents` | item_added/removed/cancelled | Detectors |
| `inventoryMovements` | Consumption on payment | Stock analysis |
| `shifts` | Open/close | Cash analytics |
| `stockItems` | Read availability | Warehouse management |
| `cashMovements` | Cash operations | Cash analytics |

## Pitfalls

- Never use raw hex colors — always `theme.colors.*`
- InstantDB queries are reactive — no manual refresh needed
- `@lumo/data` commands must use `getInstantClient()` for the db reference
- `.env` is gitignored, `.env.example` is committed — keep in sync
- Pre-existing TS errors: `@lumo/data` module resolution (workspace build), React JSX types
