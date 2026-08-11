-- ═══════════════════════════════════════════════
-- r_keeper POS — Supabase Schema
-- ═══════════════════════════════════════════════

-- Using gen_random_uuid() (built into Postgres 13+)

-- ═══════════════════════════════════════════════
-- 1. ORGANIZATIONS & VENUES
-- ═══════════════════════════════════════════════

create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  created_at    timestamptz default now()
);

create table venues (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name            text not null,
  address         text,
  currency        text default 'сом',
  -- eKassa
  ekassa_token    text,
  ekassa_cashbox_id text,
  -- Migration
  external_id     varchar,
  external_source varchar, -- 'poster', 'iiko', 'manual'
  created_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- 2. USERS & ACCESS
-- ═══════════════════════════════════════════════

create type user_role as enum ('owner', 'manager', 'cashier');

create table users (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name            text not null,
  pin             varchar(6) not null,
  role            user_role not null default 'cashier',
  is_active       boolean default true,
  created_at      timestamptz default now()
);

create table user_venues (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  venue_id  uuid not null references venues(id) on delete cascade,
  unique(user_id, venue_id)
);

-- ═══════════════════════════════════════════════
-- 3. MENU (Categories, Products, Modifiers)
-- ═══════════════════════════════════════════════

create table categories (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id),
  name            text not null,
  color_hex       varchar(7) default '#333333',
  sort_order      int default 0,
  is_active       boolean default true,
  -- Migration
  external_id     varchar,
  external_source varchar,
  created_at      timestamptz default now()
);

create type product_type as enum ('dish', 'ingredient', 'modifier');

create table products (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id),
  category_id     uuid references categories(id),
  name            text not null,
  price           numeric(10,2) not null default 0,
  cost_price      numeric(10,2) default 0,
  type            product_type default 'dish',
  has_modifiers   boolean default false,
  is_active       boolean default true,
  sort_order      int default 0,
  -- Migration
  external_id     varchar,
  external_source varchar,
  created_at      timestamptz default now()
);

-- Modifier groups (e.g. "Начинка", "Соус", "Размер")
create table modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id),
  name        text not null,
  is_required boolean default false,
  max_select  int default 0, -- 0 = unlimited
  created_at  timestamptz default now()
);

-- Which products have which modifier groups
create table product_modifier_groups (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id) on delete cascade,
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  unique(product_id, modifier_group_id)
);

-- Individual modifiers within a group
create table modifiers (
  id                uuid primary key default gen_random_uuid(),
  modifier_group_id uuid not null references modifier_groups(id) on delete cascade,
  name              text not null,
  price             numeric(10,2) default 0,
  sort_order        int default 0,
  is_active         boolean default true,
  created_at        timestamptz default now()
);

-- Tech cards / recipes (dish → ingredients)
create table recipe_items (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade, -- the dish
  ingredient_id uuid not null references products(id),                   -- the ingredient
  quantity      numeric(10,3) not null, -- weight/amount
  unit          text default 'г',       -- г, мл, шт
  created_at    timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- 4. FLOOR PLAN (Zones & Tables)
-- ═══════════════════════════════════════════════

create table zones (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id),
  name        text not null,
  grid_cols   int default 8,
  grid_rows   int default 5,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table tables (
  id          uuid primary key default gen_random_uuid(),
  zone_id     uuid not null references zones(id) on delete cascade,
  venue_id    uuid not null references venues(id),
  number      varchar(10) not null,
  capacity    int default 4,
  col         int default 0,
  row         int default 0,
  size        varchar(10) default 'small', -- small, regular, wide, tall, bar
  created_at  timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- 5. SHIFTS
-- ═══════════════════════════════════════════════

create table shifts (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id),
  cashier_id      uuid not null references users(id),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  starting_cash   numeric(10,2) default 0,
  -- Totals (calculated on close, or running)
  total_orders    int default 0,
  total_revenue   numeric(10,2) default 0,
  cash_total      numeric(10,2) default 0,
  card_total      numeric(10,2) default 0,
  other_total     numeric(10,2) default 0,
  created_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- 6. ORDERS & PAYMENTS
-- ═══════════════════════════════════════════════

create type order_status as enum ('active', 'paid', 'alert', 'cancelled');

create table orders (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id),
  shift_id        uuid references shifts(id),
  table_id        uuid references tables(id),
  waiter_id       uuid references users(id),
  number          varchar(10) not null,
  status          order_status default 'active',
  guest_count     int default 1,
  table_number    varchar(10),
  zone_name       text,
  order_type      text default 'Общий',
  comment         text,
  is_quick_check  boolean default false,
  opened_at       timestamptz default now(),
  closed_at       timestamptz,
  total_amount    numeric(10,2) default 0,
  created_at      timestamptz default now()
);

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid not null references products(id),
  -- Snapshot at time of sale (prices can change later)
  product_name  text not null,
  product_price numeric(10,2) not null,
  quantity      int not null default 1,
  guest_number  int default 1,
  comment       text,
  created_at    timestamptz default now()
);

-- Modifiers applied to an order item
create table order_item_modifiers (
  id              uuid primary key default gen_random_uuid(),
  order_item_id   uuid not null references order_items(id) on delete cascade,
  modifier_id     uuid references modifiers(id),
  -- Snapshot
  modifier_name   text not null,
  modifier_price  numeric(10,2) default 0
);

create type payment_method as enum ('cash', 'card', 'qr', 'other', 'none');
create type fiscal_status as enum ('pending', 'sent', 'failed', 'skipped');

create table payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  shift_id        uuid references shifts(id),
  venue_id        uuid not null references venues(id),
  method          payment_method not null,
  amount          numeric(10,2) not null,
  change_amount   numeric(10,2) default 0,
  -- eKassa fiscalization
  fiscal_status   fiscal_status default 'pending',
  fiscal_number   varchar,
  fiscal_response jsonb,
  -- Close without payment
  close_reason    text, -- 'За счёт заведения', 'Ошибка', etc.
  created_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- 7. WAREHOUSE & STOCK
-- ═══════════════════════════════════════════════

create table warehouses (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id),
  name            text not null,
  -- Migration
  external_id     varchar,
  external_source varchar,
  created_at      timestamptz default now()
);

create table stock_items (
  id            uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references warehouses(id),
  product_id    uuid not null references products(id),
  quantity      numeric(10,3) default 0,
  unit          text default 'шт',
  updated_at    timestamptz default now()
);

create table suppliers (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id),
  name            text not null,
  phone           text,
  -- Migration
  external_id     varchar,
  external_source varchar,
  created_at      timestamptz default now()
);

create table supply_documents (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references venues(id),
  supplier_id   uuid references suppliers(id),
  warehouse_id  uuid not null references warehouses(id),
  total_amount  numeric(10,2) default 0,
  document_date date default current_date,
  created_at    timestamptz default now()
);

create table supply_items (
  id                  uuid primary key default gen_random_uuid(),
  supply_document_id  uuid not null references supply_documents(id) on delete cascade,
  product_id          uuid not null references products(id),
  quantity            numeric(10,3) not null,
  unit_price          numeric(10,2) not null,
  total_price         numeric(10,2) not null,
  created_at          timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- 8. INDEXES
-- ═══════════════════════════════════════════════

-- Fast lookups by venue
create index idx_categories_venue on categories(venue_id);
create index idx_products_venue on products(venue_id);
create index idx_products_category on products(category_id);
create index idx_orders_venue on orders(venue_id);
create index idx_orders_shift on orders(shift_id);
create index idx_orders_status on orders(venue_id, status);
create index idx_order_items_order on order_items(order_id);
create index idx_payments_order on payments(order_id);
create index idx_payments_fiscal on payments(fiscal_status) where fiscal_status = 'pending';
create index idx_shifts_venue on shifts(venue_id);
create index idx_tables_zone on tables(zone_id);
create index idx_stock_items_warehouse on stock_items(warehouse_id);

-- Migration lookups
create index idx_products_external on products(external_id, external_source);
create index idx_categories_external on categories(external_id, external_source);

-- ═══════════════════════════════════════════════
-- 9. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table venues enable row level security;
alter table users enable row level security;
alter table user_venues enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table modifier_groups enable row level security;
alter table product_modifier_groups enable row level security;
alter table modifiers enable row level security;
alter table zones enable row level security;
alter table tables enable row level security;
alter table shifts enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_modifiers enable row level security;
alter table payments enable row level security;
alter table warehouses enable row level security;
alter table stock_items enable row level security;
alter table suppliers enable row level security;
alter table supply_documents enable row level security;
alter table supply_items enable row level security;
alter table recipe_items enable row level security;

-- RLS policies will be added after auth setup
-- Basic pattern: users can only access data from their venue
-- Example:
-- create policy "Users see own venue data" on products
--   for select using (
--     venue_id in (
--       select venue_id from user_venues where user_id = auth.uid()
--     )
--   );
