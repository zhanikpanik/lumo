-- Workshops (Цеха)
create table workshops (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references venues(id),
  name        text not null,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

alter table workshops enable row level security;
create policy "Allow all reads" on workshops for select using (true);
create policy "Allow all inserts" on workshops for insert with check (true);
create policy "Allow all updates" on workshops for update using (true);
create policy "Allow all deletes" on workshops for delete using (true);

-- Add workshop_id to products
alter table products add column workshop_id uuid references workshops(id);

-- Seed default workshops
insert into workshops (id, venue_id, name, sort_order) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000000010', 'Кухня', 1),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000000010', 'Бар', 2);

-- Assign bar items to Бар, rest to Кухня
update products set workshop_id = '00000000-0000-0000-0000-000000005002' where category_id = '00000000-0000-0000-0000-000000001004';
update products set workshop_id = '00000000-0000-0000-0000-000000005001' where workshop_id is null and type = 'dish';
