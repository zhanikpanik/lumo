alter table venues
  add column if not exists venue_type text not null default 'restaurant';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'venues_venue_type_check'
      and conrelid = 'venues'::regclass
  ) then
    alter table venues
      add constraint venues_venue_type_check
      check (venue_type in ('restaurant', 'takeaway'));
  end if;
end
$$;
