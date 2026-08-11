-- Policies for back-office CRUD
create policy "Allow all inserts" on categories for insert with check (true);
create policy "Allow all updates" on categories for update using (true);
create policy "Allow all deletes" on categories for delete using (true);

create policy "Allow all inserts" on products for insert with check (true);
create policy "Allow all updates" on products for update using (true);
create policy "Allow all deletes" on products for delete using (true);

create policy "Allow all reads" on recipe_items for select using (true);
create policy "Allow all inserts" on recipe_items for insert with check (true);
create policy "Allow all deletes" on recipe_items for delete using (true);
