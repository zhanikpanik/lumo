-- Temporarily disable RLS for seeding
alter table organizations disable row level security;
alter table venues disable row level security;
alter table users disable row level security;
alter table user_venues disable row level security;
alter table categories disable row level security;
alter table products disable row level security;
alter table zones disable row level security;
alter table tables disable row level security;

-- Organization
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Alto Coffee')
on conflict (id) do nothing;

-- Venue
insert into venues (id, organization_id, name, address, currency) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Alto Coffee Bishkek', 'ул. Московская 123, Бишкек', 'сом')
on conflict (id) do nothing;

-- Users
insert into users (id, organization_id, name, pin, role) values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'Иванов', '1234', 'cashier'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Петров', '5678', 'cashier'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Сидоров', '9012', 'cashier'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Админ', '0000', 'owner')
on conflict (id) do nothing;

-- User venue access
insert into user_venues (user_id, venue_id) values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000010')
on conflict (user_id, venue_id) do nothing;

-- Categories
insert into categories (id, venue_id, name, color_hex, sort_order) values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000010', 'Горячее', '#1B5E20', 1),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000010', 'Детское', '#1565C0', 2),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000010', 'Веганы', '#2E7D32', 3),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000010', 'Бар', '#4527A0', 4),
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000010', 'Пицца', '#BF360C', 5),
  ('00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000000010', 'Шашлык', '#5D4037', 6),
  ('00000000-0000-0000-0000-000000001007', '00000000-0000-0000-0000-000000000010', 'Салаты', '#00695C', 7),
  ('00000000-0000-0000-0000-000000001008', '00000000-0000-0000-0000-000000000010', 'Супы', '#AD1457', 8)
on conflict (id) do nothing;

-- Zones
insert into zones (id, venue_id, name, grid_cols, grid_rows, sort_order) values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', 'Основной зал', 8, 5, 1),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000010', 'Веранда', 6, 4, 2)
on conflict (id) do nothing;

-- Tables
insert into tables (id, zone_id, venue_id, number, capacity, col, row, size) values
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '1', 2, 0, 0, 'small'),
  ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '2', 2, 1, 0, 'small'),
  ('00000000-0000-0000-0000-000000003003', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '5', 4, 3, 0, 'regular'),
  ('00000000-0000-0000-0000-000000003004', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '9', 4, 7, 0, 'bar'),
  ('00000000-0000-0000-0000-000000003005', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '3', 6, 0, 2, 'wide'),
  ('00000000-0000-0000-0000-000000003006', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '7', 4, 4, 2, 'regular'),
  ('00000000-0000-0000-0000-000000003007', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '4', 2, 0, 4, 'small'),
  ('00000000-0000-0000-0000-000000003008', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '8', 2, 1, 4, 'small'),
  ('00000000-0000-0000-0000-000000003009', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000010', '10', 4, 4, 4, 'regular'),
  ('00000000-0000-0000-0000-000000003010', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000010', '21', 6, 0, 0, 'wide'),
  ('00000000-0000-0000-0000-000000003011', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000010', '22', 4, 4, 0, 'regular'),
  ('00000000-0000-0000-0000-000000003012', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000010', '23', 2, 0, 2, 'small'),
  ('00000000-0000-0000-0000-000000003013', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000010', '24', 2, 1, 2, 'small'),
  ('00000000-0000-0000-0000-000000003014', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000010', '25', 2, 2, 2, 'small'),
  ('00000000-0000-0000-0000-000000003015', '00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000000010', '26', 4, 4, 2, 'regular')
on conflict (id) do nothing;

-- Products
insert into products (id, venue_id, category_id, name, price, type, sort_order) values
  ('00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001001', 'Выгодная пара с барбекю', 230, 'dish', 1),
  ('00000000-0000-0000-0000-000000004002', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001001', 'Тройной барбекю', 240, 'dish', 2),
  ('00000000-0000-0000-0000-000000004003', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001001', 'Три сыра', 250, 'dish', 3),
  ('00000000-0000-0000-0000-000000004004', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001001', 'Карбонара', 260, 'dish', 4),
  ('00000000-0000-0000-0000-000000004005', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001001', 'Курица гриль', 270, 'dish', 5),
  ('00000000-0000-0000-0000-000000004006', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001001', 'Биг Мак', 330, 'dish', 6),
  ('00000000-0000-0000-0000-000000004010', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001005', 'Маргарита', 350, 'dish', 1),
  ('00000000-0000-0000-0000-000000004011', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001005', 'Пепперони', 400, 'dish', 2),
  ('00000000-0000-0000-0000-000000004012', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001005', '4 сыра', 420, 'dish', 3),
  ('00000000-0000-0000-0000-000000004020', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001004', 'Кока-кола', 90, 'dish', 1),
  ('00000000-0000-0000-0000-000000004021', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001004', 'Эспрессо', 120, 'dish', 2),
  ('00000000-0000-0000-0000-000000004022', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001004', 'Латте', 180, 'dish', 3),
  ('00000000-0000-0000-0000-000000004030', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001007', 'Цезарь', 280, 'dish', 1),
  ('00000000-0000-0000-0000-000000004031', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000001007', 'Греческий', 250, 'dish', 2)
on conflict (id) do nothing;

-- Re-enable RLS (policies will be added later)
alter table organizations enable row level security;
alter table venues enable row level security;
alter table users enable row level security;
alter table user_venues enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table zones enable row level security;
alter table tables enable row level security;

-- For now, allow all reads (public menu/tables data)
drop policy if exists "Allow all reads" on organizations;
create policy "Allow all reads" on organizations for select using (true);
drop policy if exists "Allow all reads" on venues;
create policy "Allow all reads" on venues for select using (true);
drop policy if exists "Allow all reads" on users;
create policy "Allow all reads" on users for select using (true);
drop policy if exists "Allow all reads" on user_venues;
create policy "Allow all reads" on user_venues for select using (true);
drop policy if exists "Allow all reads" on categories;
create policy "Allow all reads" on categories for select using (true);
drop policy if exists "Allow all reads" on products;
create policy "Allow all reads" on products for select using (true);
drop policy if exists "Allow all reads" on zones;
create policy "Allow all reads" on zones for select using (true);
drop policy if exists "Allow all reads" on tables;
create policy "Allow all reads" on tables for select using (true);
drop policy if exists "Allow all reads" on shifts;
create policy "Allow all reads" on shifts for select using (true);
drop policy if exists "Allow all reads" on orders;
create policy "Allow all reads" on orders for select using (true);
drop policy if exists "Allow all reads" on order_items;
create policy "Allow all reads" on order_items for select using (true);
drop policy if exists "Allow all reads" on order_item_modifiers;
create policy "Allow all reads" on order_item_modifiers for select using (true);
drop policy if exists "Allow all reads" on payments;
create policy "Allow all reads" on payments for select using (true);

-- Allow all writes for MVP (tighten later)
drop policy if exists "Allow all inserts" on orders;
create policy "Allow all inserts" on orders for insert with check (true);
drop policy if exists "Allow all updates" on orders;
create policy "Allow all updates" on orders for update using (true);
drop policy if exists "Allow all inserts" on order_items;
create policy "Allow all inserts" on order_items for insert with check (true);
drop policy if exists "Allow all updates" on order_items;
create policy "Allow all updates" on order_items for update using (true);
drop policy if exists "Allow all deletes" on order_items;
create policy "Allow all deletes" on order_items for delete using (true);
drop policy if exists "Allow all inserts" on order_item_modifiers;
create policy "Allow all inserts" on order_item_modifiers for insert with check (true);
drop policy if exists "Allow all inserts" on payments;
create policy "Allow all inserts" on payments for insert with check (true);
drop policy if exists "Allow all inserts" on shifts;
create policy "Allow all inserts" on shifts for insert with check (true);
drop policy if exists "Allow all updates" on shifts;
create policy "Allow all updates" on shifts for update using (true);
