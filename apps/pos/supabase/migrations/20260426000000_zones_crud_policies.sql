-- Add missing insert/delete policies for zones table
-- Required for admin floor plan sync to upsert/cleanup zones
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'zones' and policyname = 'Allow all inserts') then
    create policy "Allow all inserts" on zones for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'zones' and policyname = 'Allow all deletes') then
    create policy "Allow all deletes" on zones for delete using (true);
  end if;
end $$;
