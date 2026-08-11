-- Modifier groups
create policy "Allow all reads" on modifier_groups for select using (true);
create policy "Allow all inserts" on modifier_groups for insert with check (true);
create policy "Allow all updates" on modifier_groups for update using (true);
create policy "Allow all deletes" on modifier_groups for delete using (true);

-- Product modifier groups (junction)
create policy "Allow all reads" on product_modifier_groups for select using (true);
create policy "Allow all inserts" on product_modifier_groups for insert with check (true);
create policy "Allow all deletes" on product_modifier_groups for delete using (true);

-- Modifiers
create policy "Allow all reads" on modifiers for select using (true);
create policy "Allow all inserts" on modifiers for insert with check (true);
create policy "Allow all updates" on modifiers for update using (true);
create policy "Allow all deletes" on modifiers for delete using (true);

-- Recipe items (already has read + delete, add update)
create policy "Allow all updates" on recipe_items for update using (true);
