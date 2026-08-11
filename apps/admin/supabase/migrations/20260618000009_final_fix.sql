-- Final fix: cleanup RPC (UUID NOT LIKE) + order RPC (minutes 0-59)
CREATE OR REPLACE FUNCTION demo_clean_venue(p_venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM venues WHERE id = p_venue_id;

  DELETE FROM order_events WHERE venue_id = p_venue_id;
  DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id = p_venue_id));
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id = p_venue_id);
  DELETE FROM payments WHERE venue_id = p_venue_id;
  DELETE FROM cash_movements WHERE venue_id = p_venue_id;
  DELETE FROM cash_transactions WHERE venue_id = p_venue_id;
  DELETE FROM orders WHERE venue_id = p_venue_id;
  
  DELETE FROM warehouse_delivery_items WHERE delivery_id IN (SELECT id FROM warehouse_deliveries WHERE venue_id = p_venue_id);
  DELETE FROM warehouse_write_off_items WHERE write_off_id IN (SELECT id FROM warehouse_write_offs WHERE venue_id = p_venue_id);
  DELETE FROM warehouse_inventory_lines WHERE session_id IN (SELECT id FROM warehouse_inventory_sessions WHERE venue_id = p_venue_id);
  
  DELETE FROM warehouse_deliveries WHERE venue_id = p_venue_id;
  DELETE FROM warehouse_write_offs WHERE venue_id = p_venue_id;
  DELETE FROM warehouse_inventory_sessions WHERE venue_id = p_venue_id;
  
  DELETE FROM stock_items WHERE warehouse_id IN (SELECT id FROM warehouses WHERE venue_id = p_venue_id);
  DELETE FROM supply_items WHERE supply_document_id IN (SELECT id FROM supply_documents WHERE venue_id = p_venue_id);
  DELETE FROM supply_documents WHERE venue_id = p_venue_id;
  
  DELETE FROM warehouse_products WHERE warehouse_id IN (SELECT id FROM warehouses WHERE venue_id = p_venue_id);
  DELETE FROM recipe_items WHERE product_id IN (SELECT id FROM products WHERE venue_id = p_venue_id) OR ingredient_id IN (SELECT id FROM products WHERE venue_id = p_venue_id);
  DELETE FROM product_modifier_groups WHERE product_id IN (SELECT id FROM products WHERE venue_id = p_venue_id);
  DELETE FROM inventory_movements WHERE product_id IN (SELECT id FROM products WHERE venue_id = p_venue_id);
  
  DELETE FROM products WHERE venue_id = p_venue_id;
  DELETE FROM categories WHERE venue_id = p_venue_id;
  
  DELETE FROM shifts WHERE venue_id = p_venue_id;
  DELETE FROM warehouses WHERE venue_id = p_venue_id;
  DELETE FROM suppliers WHERE venue_id = p_venue_id;
  
  DELETE FROM tables WHERE venue_id = p_venue_id;
  DELETE FROM zones WHERE venue_id = p_venue_id;
  
  DELETE FROM modifiers WHERE modifier_group_id IN (SELECT id FROM modifier_groups WHERE venue_id = p_venue_id);
  DELETE FROM modifier_groups WHERE venue_id = p_venue_id;
  
  -- Clean demo users (keep base seed with 00000000- prefix)
  DELETE FROM users WHERE organization_id = v_org_id AND id::text NOT LIKE '00000000-%';
  
  RETURN 'ok';
END;
$$;

-- Fix minutes 0-59 (was 0-60) and regenerate
CREATE OR REPLACE FUNCTION demo_gen_orders(
  p_venue_id uuid,
  p_start_date date,
  p_days int DEFAULT 30
)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_day date;
  v_num_orders int;
  v_shift_id uuid;
  v_order_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_product_price numeric;
  v_hour_int int;
  v_min_int int;
  v_order_num int := 0;
  v_total numeric;
  v_ts timestamptz;
  v_ts2 timestamptz;
  v_shift_start timestamptz;
  v_shift_end timestamptz;
  v_shift_rev numeric;
  v_shift_cnt int;
  v_sc numeric;
  v_ec numeric;
  v_diff numeric;
  v_i int;
  v_ni int;
  v_pi int;
  v_oid uuid;
  v_pcnt int;
  v_wcnt int;
  v_tcnt int;
  v_stat text;
  v_tnum text;
  v_meth text;
  v_note text;
  v_min_offset int;
  v_cid uuid;
  v_wid uuid;
  v_tid uuid;
BEGIN
  SELECT organization_id INTO v_oid FROM venues WHERE id = p_venue_id;
  SELECT count(*) INTO v_pcnt FROM products WHERE venue_id = p_venue_id AND type = 'dish' AND is_active = true;
  SELECT count(*) INTO v_wcnt FROM users WHERE organization_id = v_oid;
  SELECT count(*) INTO v_tcnt FROM tables WHERE venue_id = p_venue_id;
  
  IF v_pcnt = 0 OR v_wcnt = 0 OR v_tcnt = 0 THEN
    RETURN 'ERROR: need dishes, users, tables';
  END IF;

  FOR v_day IN SELECT d::date FROM generate_series(p_start_date::timestamp, (p_start_date + p_days - 1)::timestamp, '1 day'::interval) AS d
  LOOP
    v_num_orders := CASE WHEN EXTRACT(DOW FROM v_day) IN (0,6) THEN 60 + (random()*26)::int ELSE 35 + (random()*21)::int END;
    
    -- MORNING SHIFT
    v_shift_id := gen_random_uuid();
    SELECT id INTO v_cid FROM users WHERE organization_id = v_oid AND role = 'cashier' ORDER BY random() LIMIT 1;
    v_min_offset := (random()*15)::int;
    v_shift_start := (v_day::text || ' 08:00:00+00')::timestamptz + (v_min_offset::text || ' minutes')::interval;
    v_min_offset := (random()*30)::int;
    v_shift_end := (v_day::text || ' 16:00:00+00')::timestamptz + (v_min_offset::text || ' minutes')::interval;
    
    INSERT INTO shifts (id, venue_id, cashier_id, opened_at, closed_at, starting_cash, total_orders, total_revenue, cash_total, card_total, expected_cash_at_close, cash_difference_at_close, cash_collections_total)
    VALUES (v_shift_id, p_venue_id, v_cid, v_shift_start, v_shift_end, 3000, 0, 0, 0, 0, 0, 0, 0);
    INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at) VALUES (p_venue_id, v_shift_id, 'float_in', 3000, 'opening_balance', v_shift_start);
    
    v_shift_rev := 0;
    v_shift_cnt := 0;
    
    FOR v_i IN 1..(v_num_orders * 0.55)::int LOOP
      v_order_num := v_order_num + 1;
      v_order_id := gen_random_uuid();
      v_hour_int := 8 + (random()*8)::int;
      v_min_int := (random()*59)::int;
      v_ts := (v_day::text || ' ' || lpad(v_hour_int::text,2,'0') || ':' || lpad(v_min_int::text,2,'0') || ':00+00')::timestamptz;
      v_min_offset := 10 + (random()*36)::int;
      v_ts2 := v_ts + (v_min_offset::text || ' minutes')::interval;
      v_stat := CASE WHEN random() < 0.05 THEN 'cancelled' ELSE 'paid' END;
      SELECT id INTO v_wid FROM users WHERE organization_id = v_oid ORDER BY random() LIMIT 1;
      SELECT id, number INTO v_tid, v_tnum FROM tables WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;
      
      v_ni := CASE WHEN random() < 0.55 THEN 1 WHEN random() < 0.9 THEN 2 ELSE 3 END;
      
      INSERT INTO orders (id, venue_id, shift_id, waiter_id, table_id, number, status, total_amount, opened_at, closed_at, guest_count, table_number)
      VALUES (v_order_id, p_venue_id, v_shift_id, v_wid, v_tid, v_order_num::text, v_stat::order_status, 0, v_ts, v_ts2, 1 + (random()*3)::int, v_tnum);
      
      v_total := 0;
      FOR v_i IN 1..v_ni LOOP
        v_pi := 1 + (random() * v_pcnt)::int;
        IF v_pi > v_pcnt THEN v_pi := v_pcnt; END IF;
        SELECT id, name, price INTO v_product_id, v_product_name, v_product_price
        FROM (SELECT id, name, price, row_number() OVER (ORDER BY id) AS rn FROM products WHERE venue_id = p_venue_id AND type = 'dish' AND is_active = true) sub
        WHERE sub.rn = v_pi;
        v_total := v_total + COALESCE(v_product_price, 0);
        INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity) VALUES (v_order_id, v_product_id, v_product_name, v_product_price, 1);
        INSERT INTO order_events (order_id, action, product_id, product_name, quantity, unit_price, occurred_at, venue_id) VALUES (v_order_id, 'item_added', v_product_id, v_product_name, 1, v_product_price, v_ts, p_venue_id);
      END LOOP;
      
      UPDATE orders SET total_amount = v_total WHERE id = v_order_id;
      
      IF v_stat = 'paid' THEN
        v_meth := CASE WHEN random() < 0.6 THEN 'cash' ELSE 'card' END;
        INSERT INTO payments (order_id, shift_id, venue_id, method, amount, created_at, idempotency_key) VALUES (v_order_id, v_shift_id, p_venue_id, v_meth::payment_method, v_total, v_ts2, gen_random_uuid()::text);
        v_shift_rev := v_shift_rev + v_total;
        v_shift_cnt := v_shift_cnt + 1;
      END IF;
    END LOOP;
    
    v_sc := 3000 + (random()*2001)::numeric;
    v_diff := CASE WHEN random() < 0.2 THEN ((random()*1001)::int - 500)::numeric ELSE 0 END;
    v_ec := v_sc + ceil(v_shift_rev * 0.6) + v_diff;
    UPDATE shifts SET starting_cash = v_sc, total_orders = v_shift_cnt, total_revenue = v_shift_rev, cash_total = floor(v_shift_rev * 0.6), card_total = ceil(v_shift_rev * 0.4), expected_cash_at_close = v_ec, cash_difference_at_close = v_diff WHERE id = v_shift_id;
    FOR v_i IN 1..(1 + (random()*3)::int) LOOP
      v_note := (ARRAY['payment_insert','Расход на продукты','Курьер','Хозтовары'])[1 + (random()*4)::int];
      v_min_offset := 1 + (random()*6)::int;
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at) VALUES (p_venue_id, v_shift_id, 'float_out', 200 + (random()*1301)::numeric, v_note, v_shift_start + (v_min_offset::text || ' hours')::interval);
    END LOOP;
    
    -- EVENING SHIFT
    v_shift_id := gen_random_uuid();
    SELECT id INTO v_cid FROM users WHERE organization_id = v_oid AND role = 'cashier' ORDER BY random() LIMIT 1;
    v_min_offset := (random()*15)::int;
    v_shift_start := (v_day::text || ' 16:00:00+00')::timestamptz + (v_min_offset::text || ' minutes')::interval;
    v_min_offset := (random()*30)::int;
    v_shift_end := (v_day::text || ' 23:00:00+00')::timestamptz + (v_min_offset::text || ' minutes')::interval;
    
    INSERT INTO shifts (id, venue_id, cashier_id, opened_at, closed_at, starting_cash, total_orders, total_revenue, cash_total, card_total, expected_cash_at_close, cash_difference_at_close, cash_collections_total)
    VALUES (v_shift_id, p_venue_id, v_cid, v_shift_start, v_shift_end, 3000, 0, 0, 0, 0, 0, 0, 0);
    INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at) VALUES (p_venue_id, v_shift_id, 'float_in', 3000, 'opening_balance', v_shift_start);
    
    v_shift_rev := 0;
    v_shift_cnt := 0;
    
    FOR v_i IN 1..ceil(v_num_orders * 0.45)::int LOOP
      v_order_num := v_order_num + 1;
      v_order_id := gen_random_uuid();
      v_hour_int := 16 + (random()*7)::int;
      v_min_int := (random()*59)::int;
      v_ts := (v_day::text || ' ' || lpad(v_hour_int::text,2,'0') || ':' || lpad(v_min_int::text,2,'0') || ':00+00')::timestamptz;
      v_min_offset := 10 + (random()*36)::int;
      v_ts2 := v_ts + (v_min_offset::text || ' minutes')::interval;
      v_stat := CASE WHEN random() < 0.05 THEN 'cancelled' ELSE 'paid' END;
      SELECT id INTO v_wid FROM users WHERE organization_id = v_oid ORDER BY random() LIMIT 1;
      SELECT id, number INTO v_tid, v_tnum FROM tables WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;
      
      v_ni := CASE WHEN random() < 0.55 THEN 1 WHEN random() < 0.9 THEN 2 ELSE 3 END;
      
      INSERT INTO orders (id, venue_id, shift_id, waiter_id, table_id, number, status, total_amount, opened_at, closed_at, guest_count, table_number)
      VALUES (v_order_id, p_venue_id, v_shift_id, v_wid, v_tid, v_order_num::text, v_stat::order_status, 0, v_ts, v_ts2, 1 + (random()*3)::int, v_tnum);
      
      v_total := 0;
      FOR v_i IN 1..v_ni LOOP
        v_pi := 1 + (random() * v_pcnt)::int;
        IF v_pi > v_pcnt THEN v_pi := v_pcnt; END IF;
        SELECT id, name, price INTO v_product_id, v_product_name, v_product_price
        FROM (SELECT id, name, price, row_number() OVER (ORDER BY id) AS rn FROM products WHERE venue_id = p_venue_id AND type = 'dish' AND is_active = true) sub
        WHERE sub.rn = v_pi;
        v_total := v_total + COALESCE(v_product_price, 0);
        INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity) VALUES (v_order_id, v_product_id, v_product_name, v_product_price, 1);
        INSERT INTO order_events (order_id, action, product_id, product_name, quantity, unit_price, occurred_at, venue_id) VALUES (v_order_id, 'item_added', v_product_id, v_product_name, 1, v_product_price, v_ts, p_venue_id);
      END LOOP;
      
      UPDATE orders SET total_amount = v_total WHERE id = v_order_id;
      
      IF v_stat = 'paid' THEN
        v_meth := CASE WHEN random() < 0.6 THEN 'cash' ELSE 'card' END;
        INSERT INTO payments (order_id, shift_id, venue_id, method, amount, created_at, idempotency_key) VALUES (v_order_id, v_shift_id, p_venue_id, v_meth::payment_method, v_total, v_ts2, gen_random_uuid()::text);
        v_shift_rev := v_shift_rev + v_total;
        v_shift_cnt := v_shift_cnt + 1;
      END IF;
    END LOOP;
    
    v_sc := 3000 + (random()*2001)::numeric;
    v_diff := CASE WHEN random() < 0.2 THEN ((random()*1001)::int - 500)::numeric ELSE 0 END;
    v_ec := v_sc + ceil(v_shift_rev * 0.6) + v_diff;
    UPDATE shifts SET starting_cash = v_sc, total_orders = v_shift_cnt, total_revenue = v_shift_rev, cash_total = floor(v_shift_rev * 0.6), card_total = ceil(v_shift_rev * 0.4), expected_cash_at_close = v_ec, cash_difference_at_close = v_diff WHERE id = v_shift_id;
    FOR v_i IN 1..(1 + (random()*3)::int) LOOP
      v_note := (ARRAY['payment_insert','Расход на продукты','Курьер','Хозтовары'])[1 + (random()*4)::int];
      v_min_offset := 1 + (random()*6)::int;
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at) VALUES (p_venue_id, v_shift_id, 'float_out', 200 + (random()*1301)::numeric, v_note, v_shift_start + (v_min_offset::text || ' hours')::interval);
    END LOOP;
  END LOOP;
  
  RETURN v_order_num::text || ' orders, ' || (p_days * 2)::text || ' shifts';
END;
$$;
