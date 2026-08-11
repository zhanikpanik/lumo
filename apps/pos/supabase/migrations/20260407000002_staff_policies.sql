-- Staff CRUD policies
create policy "Allow all inserts" on users for insert with check (true);
create policy "Allow all updates" on users for update using (true);
create policy "Allow all deletes" on users for delete using (true);

create policy "Allow all inserts" on user_venues for insert with check (true);
create policy "Allow all deletes" on user_venues for delete using (true);
