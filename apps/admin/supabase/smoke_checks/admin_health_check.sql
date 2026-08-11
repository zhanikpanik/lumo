-- Admin/POS smoke check for venue consistency.
-- Run in Supabase SQL Editor after deploy.

-- 1) Required functions and tables exist.
select
  to_regclass('public.stock_items') as stock_items,
  to_regclass('public.inventory_movements') as inventory_movements,
  to_regclass('public.order_sale_consumption_batches') as order_sale_consumption_batches;

select n.nspname as schema, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in (
    'admin_inventory_period_movements',
    'apply_stock_delta',
    'apply_delivery_stock',
    'apply_writeoff_stock',
    'apply_inventory_stock',
    'apply_transfer_stock',
    'finalize_order_consumption'
  )
order by p.proname, args;

-- 2) finalize_order_consumption is not executable by anon.
select has_function_privilege(
  'anon',
  'public.finalize_order_consumption(uuid, uuid, timestamp with time zone, text, jsonb, uuid)',
  'EXECUTE'
) as anon_can_execute;

-- 3) Finalized warehouse docs have warehouse ids.
select
  (select count(*) from warehouse_deliveries d where d.status='received' and d.warehouse_id is null) as received_deliveries_without_warehouse,
  (select count(*) from warehouse_write_offs w where w.status='posted' and w.warehouse_id is null) as posted_writeoffs_without_warehouse,
  (select count(*) from warehouse_inventory_sessions s where s.status='posted' and s.warehouse_id is null) as posted_inventory_without_warehouse,
  (select count(*) from warehouse_transfers t where t.status='posted' and (t.from_warehouse_id is null or t.to_warehouse_id is null)) as posted_transfers_missing_warehouse;

-- 4) Recipe integrity (no duplicate ingredient rows per dish).
select count(*) as duplicate_recipe_pairs
from (
  select product_id, ingredient_id
  from recipe_items
  where ingredient_id is not null
  group by product_id, ingredient_id
  having count(*) > 1
) x;

-- 5) inventory_movements sanity.
select
  (select count(*) from inventory_movements where reason in ('sale','waste') and quantity_delta > 0) as positive_sale_or_waste,
  (select count(*) from inventory_movements where product_id is null or warehouse_id is null or venue_id is null) as null_keys,
  (select count(*) from inventory_movements where line_idempotency_key is null) as null_line_keys;
