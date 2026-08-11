-- Mass-generate demo orders/shifts/payments/cash_movements in one transaction.
-- Called from seed script after menu/warehouses/staff are set up.
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
  v_is_weekend boolean;
  v_num_orders int;
  v_shift_id uuid;
  v_order_id uuid;
  v_cashier_id uuid;
  v_waiter_id uuid;
  v_table_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_product_price numeric;
  v_hour int;
  v_min int;
  v_order_num int := 0;
  v_total numeric;
  v_opened_at timestamptz;
  v_closed_at timestamptz;
  v_shift_start timestamptz;
  v_shift_end timestamptz;
  v_shift_revenue numeric;
  v_shift_orders int;
  v_starting_cash numeric;
  v_expected_cash numeric;
  v_diff numeric;
  v_item_idx int;
  v_num_items int;
  v_pidx int;
  v_org_id uuid;
  v_cashier_count int;
  v_waiter_count int;
  v_table_count int;
  v_product_count int;
  v_status text;
  v_table_number text;
  v_method text;
  v_note text;
BEGIN
  SELECT organization_id INTO v_org_id FROM venues WHERE id = p_venue_id;
  
  -- Count available entities
  SELECT count(*) INTO v_cashier_count FROM users WHERE organization_id = v_org_id AND role = 'cashier';
  SELECT count(*) INTO v_waiter_count FROM users WHERE organization_id = v_org_id;
  SELECT count(*) INTO v_table_count FROM tables WHERE venue_id = p_venue_id;
  SELECT count(*) INTO v_product_count FROM products WHERE venue_id = p_venue_id AND type = 'dish' AND is_active = true;
  
  IF v_cashier_count = 0 OR v_waiter_count = 0 OR v_table_count = 0 OR v_product_count = 0 THEN
    RETURN 'ERROR: missing data — need cashiers, waiters, tables, dishes';
  END IF;

  FOR v_day IN SELECT generate_series(p_start_date, p_start_date + (p_days - 1), '1 day'::interval)::date
  LOOP
    v_is_weekend := EXTRACT(DOW FROM v_day) IN (0, 6);
    v_num_orders := CASE WHEN v_is_weekend THEN 60 + floor(random() * 26)::int ELSE 35 + floor(random() * 21)::int END;
    
    -- ── MORNING SHIFT (08:00-16:00) ──
    v_shift_id := gen_random_uuid();
    v_shift_start := v_day + time '08:00' + (floor(random() * 15)::text || ' minutes')::interval;
    v_shift_end := v_day + time '16:00' + (floor(random() * 30)::text || ' minutes')::interval;
    v_shift_revenue := 0;
    v_shift_orders := 0;
    
    -- Pick cashier for this shift
    SELECT id INTO v_cashier_id FROM users WHERE organization_id = v_org_id AND role = 'cashier' ORDER BY random() LIMIT 1;
    
    FOR i IN 1..floor(v_num_orders * 0.55)::int LOOP
      v_order_num := v_order_num + 1;
      v_order_id := gen_random_uuid();
      
      -- Peak hours: first 2h (70%) or rest (30%)
      IF random() < 0.7 THEN
        v_hour := 8 + floor(random() * 2)::int;
      ELSE
        v_hour := 8 + floor(random() * 8)::int;
      END IF;
      v_min := floor(random() * 60)::int;
      v_opened_at := v_day + (v_hour::text || ':' || v_min::text || ':00')::time;
      v_closed_at := v_opened_at + (10 + floor(random() * 36)::text || ' minutes')::interval;
      
      v_status := CASE WHEN random() < 0.05 THEN 'cancelled' ELSE 'paid' END;
      
      SELECT id INTO v_waiter_id FROM users WHERE organization_id = v_org_id ORDER BY random() LIMIT 1;
      SELECT id, number INTO v_table_id, v_table_number FROM tables WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;
      
      v_total := 0;
      v_num_items := CASE WHEN random() < 0.55 THEN 1 WHEN random() < 0.9 THEN 2 ELSE 3 END;
      
      FOR v_item_idx IN 1..v_num_items LOOP
        v_pidx := 1 + floor(random() * v_product_count)::int;
        SELECT id, name, price INTO v_product_id, v_product_name, v_product_price
        FROM products WHERE venue_id = p_venue_id AND type = 'dish' AND is_active = true
        OFFSET v_pidx - 1 LIMIT 1;
        
        v_total := v_total + COALESCE(v_product_price, 0);
        
        INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity)
        VALUES (v_order_id, v_product_id, v_product_name, COALESCE(v_product_price, 0), 1);
        
        INSERT INTO order_events (order_id, action, product_id, product_name, quantity, unit_price, occurred_at, venue_id)
        VALUES (v_order_id, 'item_added', v_product_id, v_product_name, 1, COALESCE(v_product_price, 0), v_opened_at, p_venue_id);
      END LOOP;
      
      INSERT INTO orders (id, venue_id, shift_id, waiter_id, table_id, number, status, total_amount, opened_at, closed_at, guest_count, table_number)
      VALUES (v_order_id, p_venue_id, v_shift_id, v_waiter_id, v_table_id, v_order_num::text, v_status, v_total, v_opened_at, v_closed_at, 1 + floor(random() * 3)::int, v_table_number);
      
      IF v_status = 'paid' THEN
        v_method := CASE WHEN random() < 0.6 THEN 'cash' ELSE 'card' END;
        INSERT INTO payments (order_id, shift_id, venue_id, method, amount, created_at)
        VALUES (v_order_id, v_shift_id, p_venue_id, v_method::payment_method, v_total, v_closed_at);
        v_shift_revenue := v_shift_revenue + v_total;
        v_shift_orders := v_shift_orders + 1;
      END IF;
    END LOOP;
    
    -- Insert morning shift
    v_starting_cash := 3000 + floor(random() * 2001)::numeric;
    v_diff := CASE WHEN random() < 0.2 THEN floor(random() * 1001 - 500)::numeric ELSE 0 END;
    v_expected_cash := v_starting_cash + ceil(v_shift_revenue * 0.6) + v_diff;
    
    INSERT INTO shifts (id, venue_id, cashier_id, opened_at, closed_at, starting_cash, total_orders, total_revenue, cash_total, card_total, expected_cash_at_close, cash_difference_at_close, cash_collections_total)
    VALUES (v_shift_id, p_venue_id, v_cashier_id, v_shift_start, v_shift_end, v_starting_cash, v_shift_orders, v_shift_revenue, floor(v_shift_revenue * 0.6), ceil(v_shift_revenue * 0.4), v_expected_cash, v_diff, 0);
    
    INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at)
    VALUES (p_venue_id, v_shift_id, 'float_in', v_starting_cash, 'opening_balance', v_shift_start);
    
    FOR i IN 1..(1 + floor(random() * 3)::int) LOOP
      v_note := (ARRAY['payment_insert','Расход на продукты','Курьер','Хозтовары'])[1 + floor(random() * 4)::int];
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at)
      VALUES (p_venue_id, v_shift_id, 'float_out', 200 + floor(random() * 1301)::numeric, v_note, v_shift_start + (1 + floor(random() * 6)::text || ' hours')::interval);
    END LOOP;
    
    -- ── EVENING SHIFT (16:00-23:00) ──
    v_shift_id := gen_random_uuid();
    v_shift_start := v_day + time '16:00' + (floor(random() * 15)::text || ' minutes')::interval;
    v_shift_end := v_day + time '23:00' + (floor(random() * 30)::text || ' minutes')::interval;
    v_shift_revenue := 0;
    v_shift_orders := 0;
    
    SELECT id INTO v_cashier_id FROM users WHERE organization_id = v_org_id AND role = 'cashier' ORDER BY random() LIMIT 1;
    
    FOR i IN 1..ceil(v_num_orders * 0.45)::int LOOP
      v_order_num := v_order_num + 1;
      v_order_id := gen_random_uuid();
      
      IF random() < 0.7 THEN
        v_hour := 16 + floor(random() * 2)::int;
      ELSE
        v_hour := 16 + floor(random() * 7)::int;
      END IF;
      v_min := floor(random() * 60)::int;
      v_opened_at := v_day + (v_hour::text || ':' || v_min::text || ':00')::time;
      v_closed_at := v_opened_at + (10 + floor(random() * 36)::text || ' minutes')::interval;
      
      v_status := CASE WHEN random() < 0.05 THEN 'cancelled' ELSE 'paid' END;
      
      SELECT id INTO v_waiter_id FROM users WHERE organization_id = v_org_id ORDER BY random() LIMIT 1;
      SELECT id, number INTO v_table_id, v_table_number FROM tables WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;
      
      v_total := 0;
      v_num_items := CASE WHEN random() < 0.55 THEN 1 WHEN random() < 0.9 THEN 2 ELSE 3 END;
      
      FOR v_item_idx IN 1..v_num_items LOOP
        v_pidx := 1 + floor(random() * v_product_count)::int;
        SELECT id, name, price INTO v_product_id, v_product_name, v_product_price
        FROM products WHERE venue_id = p_venue_id AND type = 'dish' AND is_active = true
        OFFSET v_pidx - 1 LIMIT 1;
        
        v_total := v_total + COALESCE(v_product_price, 0);
        
        INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity)
        VALUES (v_order_id, v_product_id, v_product_name, COALESCE(v_product_price, 0), 1);
        
        INSERT INTO order_events (order_id, action, product_id, product_name, quantity, unit_price, occurred_at, venue_id)
        VALUES (v_order_id, 'item_added', v_product_id, v_product_name, 1, COALESCE(v_product_price, 0), v_opened_at, p_venue_id);
      END LOOP;
      
      INSERT INTO orders (id, venue_id, shift_id, waiter_id, table_id, number, status, total_amount, opened_at, closed_at, guest_count, table_number)
      VALUES (v_order_id, p_venue_id, v_shift_id, v_waiter_id, v_table_id, v_order_num::text, v_status, v_total, v_opened_at, v_closed_at, 1 + floor(random() * 3)::int, v_table_number);
      
      IF v_status = 'paid' THEN
        v_method := CASE WHEN random() < 0.6 THEN 'cash' ELSE 'card' END;
        INSERT INTO payments (order_id, shift_id, venue_id, method, amount, created_at)
        VALUES (v_order_id, v_shift_id, p_venue_id, v_method::payment_method, v_total, v_closed_at);
        v_shift_revenue := v_shift_revenue + v_total;
        v_shift_orders := v_shift_orders + 1;
      END IF;
    END LOOP;
    
    -- Insert evening shift
    v_starting_cash := 3000 + floor(random() * 2001)::numeric;
    v_diff := CASE WHEN random() < 0.2 THEN floor(random() * 1001 - 500)::numeric ELSE 0 END;
    v_expected_cash := v_starting_cash + ceil(v_shift_revenue * 0.6) + v_diff;
    
    INSERT INTO shifts (id, venue_id, cashier_id, opened_at, closed_at, starting_cash, total_orders, total_revenue, cash_total, card_total, expected_cash_at_close, cash_difference_at_close, cash_collections_total)
    VALUES (v_shift_id, p_venue_id, v_cashier_id, v_shift_start, v_shift_end, v_starting_cash, v_shift_orders, v_shift_revenue, floor(v_shift_revenue * 0.6), ceil(v_shift_revenue * 0.4), v_expected_cash, v_diff, 0);
    
    INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at)
    VALUES (p_venue_id, v_shift_id, 'float_in', v_starting_cash, 'opening_balance', v_shift_start);
    
    FOR i IN 1..(1 + floor(random() * 3)::int) LOOP
      v_note := (ARRAY['payment_insert','Расход на продукты','Курьер','Хозтовары'])[1 + floor(random() * 4)::int];
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at)
      VALUES (p_venue_id, v_shift_id, 'float_out', 200 + floor(random() * 1301)::numeric, v_note, v_shift_start + (1 + floor(random() * 6)::text || ' hours')::interval);
    END LOOP;
  END LOOP;
  
  RETURN v_order_num::text || ' orders, ' || (p_days * 2)::text || ' shifts generated';
END;
$$;
