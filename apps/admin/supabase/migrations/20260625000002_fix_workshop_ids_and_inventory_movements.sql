-- Fix: products.workshop_id NULL → inventory movements RPC returns zeros.
-- 1. Assign workshop_id to all seed products based on seed layout.
-- 2. Assign workshop_id to deliveries/write-offs based on their warehouse.
-- 3. Backfill inventory_movements from existing paid orders (consumption only).

-- ═══ 1. FIX products.workshop_id ═══
-- Bar workshop: 00000000-0000-0000-0000-000000005002
-- Kitchen workshop: 00000000-0000-0000-0000-000000005001

UPDATE products SET workshop_id = '00000000-0000-0000-0000-000000005002'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND id IN (
    'f39ae9d1-ef2f-d394-250f-d9986ccc6edf', '2b6e1f85-8aa6-5afe-cb1c-4e527f628310',
    '2fcf5395-5ca1-e598-0212-14824e699fa9', '8225ff86-b781-e815-fc3a-e2868ddfc273',
    '6a508ca2-8e28-7f78-8955-ec97aafaa854', '68b61717-a53c-a509-96af-9934d44726e7',
    'd31a454b-6637-a54e-f0b1-8d369fc0880d', '9c3808d6-ca57-31f4-491d-7eee57b11c8f',
    '5988b0e3-93ee-1d06-ef25-1d08357b33b9', '0ffdac93-7b4b-9dd4-233c-0e617bbdf409',
    '5a0d203f-ebe2-ec5f-adce-bb30eeaa00bb', 'b0992430-3315-646f-9a9d-810e7f71be57',
    '08a7eb63-68dd-f73b-631e-f074d842cb3d', '68cdf7eb-9b96-d6c8-bfa2-d29d81b18c98',
    '37dd563c-a561-77a0-45d2-02f97a711491', '58ac7b46-6c42-eb17-145d-fcfb6e0b8567',
    '42f2137c-84bc-1d7d-2d0b-47e6a8220400', 'e69128ce-8118-83a0-6f52-a12f8f5917e2',
    '5b2fdd46-ab0c-a3e5-742c-701084f20256', '46d8c607-9949-664f-e344-313483cfe131',
    '6f5b46eb-7ab9-8146-d100-a36a87107373'
  );

UPDATE products SET workshop_id = '00000000-0000-0000-0000-000000005001'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND id IN (
    'fa739155-2616-44a5-c4d4-b3184a3039e7', '5a3606b2-b8cd-221a-10ae-2fbbe659127c',
    '813f50f6-5dfd-c1d5-f194-fc045235cf57', '5c781236-85ac-f9f7-3742-faed1a1a192c',
    'f9ae6a62-8636-4098-159b-59b824e186d1', 'ea750050-0719-0779-bf51-36176d1bd1f9',
    '3cbd9392-f318-fe5f-7fe5-60afd6e58a2f', 'eba97c37-5818-959b-a028-c937947c425c',
    'ab59867b-dfe5-b837-3b9a-e2bd73d64259', '154d8196-0ed0-f21f-c2b4-75b0314ec4b6',
    '24959e75-63a7-ea35-baed-3d8190084988', 'dc5ca2d9-7f4e-a3fa-937f-acd07034a87c',
    '3caf15aa-92de-fd1b-8f15-47538b9093fb', '3ab05108-99cb-25a3-708e-f3e6acf4e767',
    '6cb47bd1-e114-c5e9-c688-2adb93a571ae', '4e60e4cc-39ca-4bdf-111d-1efccb849f61',
    '5333e10e-8616-aadd-7cea-2fa47a7a0c56'
  );

-- ═══ 2. FIX deliveries.workshop_id (based on warehouse) ═══
-- Бар warehouse → Бар workshop
UPDATE warehouse_deliveries SET workshop_id = '00000000-0000-0000-0000-000000005002'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND warehouse_id = 'd2449b1e-e2be-813b-223c-169a2fdcbbf8'
  AND workshop_id IS NULL;

UPDATE warehouse_deliveries SET workshop_id = '00000000-0000-0000-0000-000000005001'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND warehouse_id = 'e0e56d3d-36a4-2977-87e3-2ea1c3c54f2b'
  AND workshop_id IS NULL;

-- ═══ 3. FIX write-offs.workshop_id ═══
UPDATE warehouse_write_offs SET workshop_id = '00000000-0000-0000-0000-000000005002'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND warehouse_id = 'd2449b1e-e2be-813b-223c-169a2fdcbbf8'
  AND workshop_id IS NULL;

UPDATE warehouse_write_offs SET workshop_id = '00000000-0000-0000-0000-000000005001'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND warehouse_id = 'e0e56d3d-36a4-2977-87e3-2ea1c3c54f2b'
  AND workshop_id IS NULL;

-- ═══ 4. Backfill inventory_movements from paid orders ═══
-- Aggregate by (order, ingredient) before insert — one order may have
-- multiple dishes using the same ingredient (e.g. cappuccino + latte → milk ×2).
CREATE OR REPLACE FUNCTION demo_backfill_inventory_movements(p_venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM inventory_movements WHERE venue_id = p_venue_id;

  INSERT INTO inventory_movements (
    venue_id, warehouse_id, product_id, quantity_delta, unit,
    reason, ref_type, ref_id, line_idempotency_key, occurred_at
  )
  SELECT
    p_venue_id,
    w.default_warehouse_id,
    agg.ingredient_id,
    -(agg.total_qty),
    agg.unit,
    'sale',
    'order',
    agg.order_id,
    'demo:' || agg.order_id::text || ':' || agg.ingredient_id::text,
    COALESCE(agg.closed_at, NOW())
  FROM (
    SELECT
      oi.order_id,
      o.closed_at,
      ri.ingredient_id,
      SUM(ri.quantity * oi.quantity) AS total_qty,
      MIN(ing.unit) AS unit
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN recipe_items ri ON ri.product_id = oi.product_id
    JOIN products ing ON ing.id = ri.ingredient_id
    WHERE o.venue_id = p_venue_id AND o.status = 'paid'
      AND ing.workshop_id IS NOT NULL
    GROUP BY oi.order_id, o.closed_at, ri.ingredient_id
  ) agg
  JOIN products ing2 ON ing2.id = agg.ingredient_id
  JOIN workshops w ON w.id = ing2.workshop_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count::text || ' inventory movements created';
END;
$$;

-- Run the backfill for the demo venue
SELECT demo_backfill_inventory_movements('00000000-0000-0000-0000-000000000010');
