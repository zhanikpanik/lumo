-- Fix: add idempotency_key to payments INSERT
CREATE OR REPLACE FUNCTION demo_heal_data(p_venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_total_paid int;
  v_total_canc int;
  v_new_payments int;
  v_new_deliveries int;
  v_new_writeoffs int;
  v_start_date date;
  v_end_date date;
  v_delivery_id uuid;
  v_wo_id uuid;
  v_supplier_name text;
  v_wh_id uuid;
  v_day date;
  v_time timestamptz;
  v_amount numeric;
  v_ing_id uuid;
  v_ing_name text;
  v_ing_unit text;
  v_qty numeric;
BEGIN
  v_start_date := CURRENT_DATE - 30;
  v_end_date := CURRENT_DATE;
  
  -- ═══ 1. FIX STATUSES: keep only ~5% cancelled, rest → paid ═══
  SELECT count(*) INTO v_total_canc FROM orders WHERE venue_id = p_venue_id AND status = 'cancelled';
  
  WITH to_flip AS (
    SELECT id FROM orders 
    WHERE venue_id = p_venue_id AND status = 'cancelled'
    ORDER BY random()
    LIMIT greatest(0, v_total_canc - (SELECT count(*) FROM orders WHERE venue_id = p_venue_id) * 5 / 100)
  )
  UPDATE orders SET status = 'paid' WHERE id IN (SELECT id FROM to_flip);
  
  SELECT count(*) INTO v_total_paid FROM orders WHERE venue_id = p_venue_id AND status = 'paid';
  
  -- ═══ 2. REDISTRIBUTE DATES evenly across 30 days (single UPDATE, no loop) ═══
  UPDATE orders o
  SET 
    opened_at = sub.new_opened,
    closed_at = sub.new_opened + (10 + floor(random() * 36)::int || ' minutes')::interval
  FROM (
    SELECT 
      id,
      v_start_date::timestamptz 
        + ((row_number() OVER (ORDER BY random()) - 1) * 29.0 / greatest(1, (SELECT count(*) FROM orders WHERE venue_id = p_venue_id) - 1))::int * '1 day'::interval
        + time '08:00' 
        + (floor(random() * 15)::int || ' hours')::interval
        + (floor(random() * 59)::int || ' minutes')::interval as new_opened
    FROM orders WHERE venue_id = p_venue_id
  ) sub
  WHERE o.id = sub.id;
  
  -- ═══ 3. GENERATE PAYMENTS (with idempotency_key!) ═══
  DELETE FROM payments WHERE venue_id = p_venue_id;
  
  INSERT INTO payments (order_id, shift_id, venue_id, method, amount, created_at, idempotency_key)
  SELECT 
    o.id, o.shift_id, o.venue_id,
    CASE WHEN random() < 0.6 THEN 'cash'::payment_method ELSE 'card'::payment_method END,
    o.total_amount, o.closed_at, gen_random_uuid()::text
  FROM orders o
  WHERE o.venue_id = p_venue_id AND o.status = 'paid';
  
  GET DIAGNOSTICS v_new_payments = ROW_COUNT;
  
  -- ═══ 4. GENERATE WAREHOUSE EVENTS ═══
  v_new_deliveries := 0;
  FOR v_day IN SELECT generate_series(v_start_date, v_end_date, '2 day'::interval)::date LOOP
    v_delivery_id := gen_random_uuid();
    SELECT name INTO v_supplier_name FROM suppliers WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;
    SELECT id INTO v_wh_id FROM warehouses WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;
    
    IF v_supplier_name IS NULL OR v_wh_id IS NULL THEN CONTINUE; END IF;
    
    v_time := v_day + time '09:00' + (floor(random() * 5)::int || ' hours')::interval
              + (floor(random() * 59)::int || ' minutes')::interval;
    v_amount := 5000 + floor(random() * 30001)::numeric;
    
    INSERT INTO warehouse_deliveries (id, venue_id, warehouse_id, supplier, delivery_date, amount, status, created_at)
    VALUES (v_delivery_id, p_venue_id, v_wh_id, v_supplier_name, v_day, v_amount, 'received', v_time);
    
    FOR i IN 1..(2 + floor(random() * 3)::int) LOOP
      SELECT id, name, unit INTO v_ing_id, v_ing_name, v_ing_unit
      FROM products WHERE venue_id = p_venue_id AND type = 'ingredient' AND is_active = true
      ORDER BY random() LIMIT 1;
      
      IF v_ing_id IS NULL THEN CONTINUE; END IF;
      
      v_qty := CASE v_ing_unit
        WHEN 'кг' THEN 5 + floor(random() * 16)::numeric
        WHEN 'л' THEN 10 + floor(random() * 31)::numeric
        ELSE 20 + floor(random() * 41)::numeric
      END;
      
      INSERT INTO warehouse_delivery_items (delivery_id, product_id, name, quantity, unit, price)
      VALUES (v_delivery_id, v_ing_id, v_ing_name, v_qty, v_ing_unit, 100 + floor(random() * 901)::int);
    END LOOP;
    
    v_new_deliveries := v_new_deliveries + 1;
  END LOOP;
  
  -- ═══ 5. WRITE-OFFS ═══
  v_new_writeoffs := 0;
  FOR v_day IN SELECT generate_series(v_start_date, v_end_date, '3 day'::interval)::date LOOP
    v_wo_id := gen_random_uuid();
    SELECT id INTO v_wh_id FROM warehouses WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;
    IF v_wh_id IS NULL THEN CONTINUE; END IF;
    
    v_time := v_day + time '21:00' + (floor(random() * 3)::int || ' hours')::interval
              + (floor(random() * 59)::int || ' minutes')::interval;
    
    INSERT INTO warehouse_write_offs (id, venue_id, warehouse_id, reason_summary, write_off_date, status, created_at)
    VALUES (v_wo_id, p_venue_id, v_wh_id,
      (ARRAY['Списание порчи','Истекшие продукты','Еженедельное списание','Бой посуды','Списание брака'])[1 + floor(random() * 5)::int],
      v_day, 'posted', v_time);
    
    FOR i IN 1..(1 + floor(random() * 3)::int) LOOP
      SELECT id, name, unit INTO v_ing_id, v_ing_name, v_ing_unit
      FROM products WHERE venue_id = p_venue_id AND type = 'ingredient' AND is_active = true
      ORDER BY random() LIMIT 1;
      
      IF v_ing_id IS NULL THEN CONTINUE; END IF;
      
      v_qty := CASE v_ing_unit
        WHEN 'кг' THEN round((0.1 + random() * 2.0)::numeric, 2)
        WHEN 'л' THEN round((0.2 + random() * 3.0)::numeric, 2)
        ELSE floor(1 + random() * 5)::numeric
      END;
      
      INSERT INTO warehouse_write_off_items (write_off_id, product_id, name, quantity, unit, reason)
      VALUES (v_wo_id, v_ing_id, v_ing_name, v_qty, v_ing_unit,
        (ARRAY['Истёк срок','Порча','Бой','Просрочка'])[1 + floor(random() * 4)::int]);
    END LOOP;
    
    v_new_writeoffs := v_new_writeoffs + 1;
  END LOOP;
  
  RETURN format('%s paid orders, %s payments, %s deliveries, %s writeoffs — healed', 
    v_total_paid, v_new_payments, v_new_deliveries, v_new_writeoffs);
END;
$func$;
