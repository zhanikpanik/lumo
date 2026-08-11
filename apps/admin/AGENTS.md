# r_keeper-admin — Restaurant Admin Panel

Admin web dashboard for **Alto Coffee Bishkek** (Kyrgyzstani som). Serves as the backend management interface paired with an Expo POS mobile app. Both share the same Supabase project.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript + Vite 8 |
| Styling | Tailwind CSS v4 + Radix UI primitives (shadcn/ui style) |
| Backend/DB | Supabase (PostgreSQL + RLS + RPCs) |
| Data fetching | TanStack React Query v5 |
| Routing | React Router v7 |
| Forms | React Hook Form + Zod |
| Tables | TanStack React Table v8 |
| Auth | Supabase Auth (email/password, optional via `VITE_REQUIRE_AUTH`) |
| Icons | Lucide React |
| Date handling | date-fns |
| Toasts | sonner |
| Excel | xlsx (SheetJS) |

## Project Structure

```
src/
├── auth/               # AuthProvider, AuthGate, useAuth, auth-context
├── components/          # Layout, FloorPlan components, DecimalSuffixInput
├── hooks/               # One hook per data domain (22 hooks)
│   ├── useAnalytics.ts        # Revenue analytics: portions, dailyStats, overconsumption
│   ├── useAnalyticsProfit.ts  # Profit analytics: Prime Cost, SPLH, Daily EBIT
│   ├── useMenuData.ts         # Categories, dishes, ingredients, warehouses
│   ├── useWarehouse.ts        # Deliveries, write-offs, transfers, inventory
│   ├── useShiftsData.ts       # Cash shifts
│   ├── useChecksData.ts       # Order checks
│   ├── useStaffData.ts
│   ├── useCashTransactions.ts # Transactions journal
│   ├── useFloorPlan.ts
│   ├── useTransactionCategories.ts
│   ├── useVenueSettings.ts
│   ├── useDishData.ts
│   └── useWiggle.ts           # Animation helper
├── lib/
│   ├── supabase.ts            # Client, venue/org/zone IDs, REQUIRE_AUTH
│   ├── utils.ts               # cn() — clsx + tailwind-merge
│   ├── formatSom.ts           # Currency formatting (сом)
│   ├── decimalMask.ts         # Input mask helpers
│   ├── ingredientStock.ts     # Stock calculation utilities
│   ├── inventoryPeriodMovements.ts  # RPC integration for inventory periods
│   ├── cashTransactionParse.ts
│   ├── checkItemsTableGrid.ts
│   ├── matchShiftForTimestamp.ts
│   └── units.ts               # Unit conversion
├── pages/               # 24 page components, warehouse pages are lazy-loaded
├── types/               # inventoryMovements.ts
assets/                  # Icons (svg)
supabase/
├── migrations/          # 78 timestamped SQL migrations (20260330–20260613)
├── smoke_checks/        # Health check SQL
└── config.toml          # Local Supabase config (pg v17, auth, storage, etc.)
docs/                    # 5 docs (inventory plan, health check, auth-rls, etc.)
refs/                    # Design reference screenshots (14 images)
types/                   # floor-plan.ts standalone types
```

## Architecture Patterns

### Data Flow
- **React Query** handles all server state with query keys like `['domain', VENUE_ID]`
- Custom hooks encapsulate `useQuery`/`useMutation` per domain
- On mutation success, invalidate related queries: `queryClient.invalidateQueries({ queryKey: Q_KEY })`
- Supabase RPCs for complex multi-table operations (inventory movements, stock)
- **`useStatusMutation<T>()` factory** eliminates boilerplate for status-change mutations. 14 nearly-identical `useMutation` calls in `useWarehouse.ts` (deliveries/write-offs/transfers × post/cancel/restore) replaced with typed one-liners. If adding a new status action, use the factory — don't copy-paste the 20-line mutation template.

### Route Structure
- `/login` — public; all other routes behind `AuthGate`
- `AuthGate` wraps routes in `<Layout>` (sidebar + `<Outlet />`)
- Warehouse pages are **lazy-loaded** via `React.lazy()`
- Sidebar has 8 nav sections: Overview (3 sub: Dashboard, Analytics, Profit), Finances (3 sub), Menu (2 sub), Staff, Floor Plan, Warehouse, Import, Settings
- `/analytics` — original revenue analytics (portions, heatmap, overconsumption)
- `/analytics-profit` — profit analytics (Prime Cost, SPLH, Daily EBIT charts)
- `/warehouse/operations` — **AllOperations** (merged view: deliveries + write-offs + transfers)
- `/warehouse/deliveries/new|:id/edit` — NewDelivery form
- `/warehouse/write-offs/new|:id/edit` — NewWriteOff form  
- `/warehouse/transfers/new|:id/edit` — NewTransfer form
- Dynamic warehouse routes: `/warehouse/:warehouseId`

### Key IDs from Environment
```ts
VENUE_ID            // default venue UUID (VITE_VENUE_ID)
ORG_ID              // organization UUID (VITE_ORG_ID)
FLOOR_PLAN_ZONE_ID  // primary zone synced with POS (VITE_FLOOR_PLAN_ZONE_ID)
LEGACY_ADMIN_ZONE_ID // zone to migrate orders from (VITE_LEGACY_ADMIN_ZONE_ID)
REQUIRE_AUTH        // boolean toggle for login gate (VITE_REQUIRE_AUTH)
```

## Common Commands

```bash
npm run dev           # Start dev server (Vite, default http://localhost:5173)
npm run build         # Type-check + production build to dist/
npm run preview       # Preview production build
npm run lint          # ESLint
```

### Supabase (local dev)
```bash
supabase start        # Start local Supabase stack
supabase stop         # Stop local Supabase stack
supabase db push      # Push migrations to local DB
supabase db reset     # Reset local DB (reruns migrations + seed)
```

## Database (Supabase)

### Shared with POS
Admin and Expo POS app use the **same Supabase project**. Environment variables must match:
- `VITE_SUPABASE_URL` = `EXPO_PUBLIC_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` = `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Migrations (23 files)
Key migrations by domain:
- **Warehouse**: `*admin_warehouse*`, `*warehouse_stock_rpcs*`, `*warehouse_doc_fields*`, `*warehouse_alignment*`, `*stock_items_*`
- **Floor plan**: `*tables_layout_columns*`, `*zones_updated_at*`
- **Shifts/Cash**: `*shifts_closing_cash_count*`, `*cash_transaction_categories*`, `*shift_open_close_notes*`
- **Inventory**: `*admin_inventory_period_movements*`, `*admin_inventory_warehouse_rpc*`
- **Transfers**: `*workshop_stock_transfers*`, `*simplify_transfers*`, `*warehouse_transfers_nullable_workshops*`
- **RLS/Security**: `*rls_venue_scoped*`, `*security_perf_cleanup*`, `*warehouse_admin_rls*`, `*stock_items_rls*`
- **Stability**: `*admin_stability_hardening*`

### RLS Model
- All tables scoped by `venue_id`
- Production: policies should check `auth.uid()` via `user_venues` mapping
- Dev: `VITE_REQUIRE_AUTH=false` allows open access

## Current State & Ongoing Work

**Inventory counting grid** currently shows zeros for movement columns. The `inventoryPeriodMovements.ts` lib calls RPC `admin_inventory_period_movements` but the consumption data source (sales → ingredient usage) still needs implementation. See `docs/inventory-mvp-plan.md` for the original task list.

**Active focus:** Dashboard detection rules, Poster migration completion, AllOperations workspace.

## Dashboard Architecture

The dashboard (`DashboardNew.tsx` + `useDashboardNewData.ts`) is the operational nerve center — not just reporting, but directing the manager. Built around a **single vertical flow**: sticky ActionBar → migration cards → period selector → KPI metrics → yesterday bar → alerts → top dishes + warehouse threats → chronology.

### Detection Rules (8 detectors)

| # | Detector | Logic |
|---|----------|-------|
| 1 | Negative stock | `stock_items.quantity < 0` |
| 2 | No inventory in 30+ days | Last `warehouse_inventory_sessions.conducted_at` |
| 3 | Anomalous delivery | `>3×` average delivery amount (min 4 deliveries) |
| 4 | Dead dish | 0 `order_items` in 14 days |
| 5 | Dead ingredient | In stock but 0 `inventory_movements` in 14 days |
| 6 | Cash gap | `>5%` revenue AND `>200 сом` |
| 7 | Waiter with refunds | `>2×` average AND `>3` refunds |
| 8 | Suspicious check | Paid `<20%` of item sum (via `order_events`) |

### Key Components
- `ActionBar` — sticky top bar with health indicator + quick actions (+Расход, +Списание, +Поставка, +Инвент.)
- `MigrationCard` — Poster→Supabase transition cards per domain (Склад/Чеки/Касса)
- `AlertCard` — severity-colored alerts (critical/warning/info), dismissable
- `StockCorrection` — inline stock adjustment for ≤5 negative items
- `YesterdayBar` — yesterday comparison (revenue, checks, avg check)
- `ChronologyFeed` — operational timeline with human-readable event labels
- `WarehouseThreats` — low-stock ingredients with affected dishes
- `TopDishesCard` — top 5 dishes by revenue

### Period Selector
Three-state toggle: Сегодня / Неделя / Месяц. Uses `useDashboardNewData(period)` — different query strategies per period.

## Poster Migration

Transition from Poster POS to Supabase-native system. Managed via **migration cards** on the dashboard.

- **Baseline date** stored in `localStorage` (`rkeeper_baseline_date`). After baseline, migration cards are dismissed.
- **Domains**: Warehouse (deliveries/write-offs/transfers/inventory), Checks (order history), Cash (shifts/transactions)
- **Import scripts** in `imports/` directory — Poster API token: `305185:07928627ec76d09e589e1381710e55da`
- **Supplier data** from Poster, auto-complete from history
- **Side-app flow**: order → WhatsApp → receiving

## Design Conventions

### Color Tokens (no raw hex/rgba)
- Background: `bg-background` (NOT `bg-gray-50` — that's Tailwind default, not brand)
- Foreground: `text-foreground` for active text, `text-muted-foreground` for secondary
- Success: CSS token `--success` (NOT `text-green-600`)
- Warning: CSS token `--warning` (NOT `text-amber-600`)
- Primary actions: `bg-primary text-primary-foreground` (NOT `bg-foreground`)

### Table Canon
- `thead`: `text-sm font-medium text-foreground` (black, not muted)
- `th/td`: `py-1.5 px-3`
- Hover/expanded rows: `bg-black/[0.03]`
- Status dots: `w-1.5 h-1.5`
- Action columns: `opacity-40 group-hover:opacity-100`
- Edit/Delete buttons: `EditButton(w-[56px]) + DeleteButton(w-[56px] pr-3)`
- Table wrapper: `table-fixed w-full max-w-4xl`

### Systematic Bug-Fixing
Pattern: found a bug on page X → `grep -rn` across ALL pages for same pattern → fix everywhere → `tsc`. Never patch one file in isolation.

## POS Integration (Dual-Repo)

Admin and Expo POS share the same Supabase project. Two separate repos:
- **Admin**: `r_keeper-admin/` (this repo) — React + Vite
- **POS**: `r_keeper/` (sibling directory) — Expo (React Native)

### Sync Points
- `VITE_SUPABASE_URL` = `EXPO_PUBLIC_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` = `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `order_events` table — POS writes events, admin reads them for dashboard detection
- `inventory_movements` — POS writes on sale (via `pos_finalize_order_stock` RPC), admin aggregates for reports
- Floor plan zones — shared `FLOOR_PLAN_ZONE_ID`

### Key POS Files
- `r_keeper/src/store/orderStore.ts` — `syncOrderItems` writes `item_added`/`item_removed` to `order_events`
- `r_keeper/src/screens/PaymentScreen.tsx` — writes `cancelled` events on close without payment

## AllOperations Workspace

The warehouse workspace was redesigned: individual list pages (Deliveries, WriteOffs, Transfers) were **merged into a single `AllOperations` page** at `/warehouse/operations`. 

**Rule:** merge only edges of ONE entity (deliveries + write-offs + transfers → AllOperations). Do NOT merge DIFFERENT entities (Transactions ≠ CashShifts — shift is a container, transaction is a record). Each entity gets its own workspace.

## order_events Table

New audit log for order lifecycle. Migration: `20260610000000_order_events.sql`.

- **Actions**: `item_added`, `item_removed`, `precheck_printed`, `paid`, `cancelled`, `refunded`
- **Written by**: POS (`orderStore.syncOrderItems`, `PaymentScreen`), RPCs (`pos_finalize_order_stock`, `pos_refund_order`)
- **Read by**: Admin dashboard (detector #8: suspicious checks, detector #4: dead dishes)

## Reference Docs

| Doc | Content |
|-----|---------|
| `docs/inventory-mvp-plan.md` | Active task checklist for inventory feature |
| `docs/ops-health-check.md` | Post-deploy verification procedures |
| `docs/inventory-admin-alignment.md` | Admin ↔ POS schema alignment guide |
| `docs/cash-transactions-journal.md` | Cash transaction schema and logic |
| `docs/auth-rls.md` | Auth and RLS production checklist |
