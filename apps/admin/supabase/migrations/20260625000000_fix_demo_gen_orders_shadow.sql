-- Fix: v_i shadowed in nested FOR loops → half of orders generated without items/events.
-- Inner loop variables renamed to v_j to avoid corrupting outer loop counter.
DROP FUNCTION IF EXISTS demo_gen_orders(uuid, date, int);

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
  v_j int;   -- renamed from v_i in inner loops
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
      FOR v_j IN 1..v_ni LOOP
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
    FOR v_j IN 1..(1 + (random()*3)::int) LOOP
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
      FOR v_j IN 1..v_ni LOOP
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
    FOR v_j IN 1..(1 + (random()*3)::int) LOOP
      v_note := (ARRAY['payment_insert','Расход на продукты','Курьер','Хозтовары'])[1 + (random()*4)::int];
      v_min_offset := 1 + (random()*6)::int;
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at) VALUES (p_venue_id, v_shift_id, 'float_out', 200 + (random()*1301)::numeric, v_note, v_shift_start + (v_min_offset::text || ' hours')::interval);
    END LOOP;
  END LOOP;
  
  RETURN v_order_num::text || ' orders, ' || (p_days * 2)::text || ' shifts';
END;
$$;
