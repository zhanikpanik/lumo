-- ============================================================
-- Demo data for analytics-profit page
-- Run: docker exec -i supabase_db_r_keeper-admin psql -U postgres -d postgres < supabase/demo_profit_data.sql
-- ============================================================

-- Config
DO $$
DECLARE
  v_venue_id uuid := '00000000-0000-0000-0000-000000000010';
  v_cashier_id uuid;
  v_wh_id uuid;
  v_day date;
  v_dow int;
  v_hour int;
  v_is_weekend boolean;
  v_num_orders int;
  v_shift_id uuid;
  v_order_id uuid;
  v_opened_at timestamptz;
  v_total numeric;
  v_dish_count int;
  v_dish_ids uuid[];
  v_dish_prices numeric[];
  v_dish_names text[];
  v_i int;
  v_oi int;
  v_dish_idx int;
  v_qty int;
  v_price numeric;
  v_num_items int;
  v_table_number text;
  v_shift_start timestamptz;
  v_shift_end timestamptz;
  v_shift_rev numeric;
  v_shift_orders int;
BEGIN
  -- Get cashier
  SELECT id INTO v_cashier_id FROM users
    WHERE organization_id = (SELECT organization_id FROM venues WHERE id = v_venue_id)
    AND role = 'cashier' LIMIT 1;
  
  IF v_cashier_id IS NULL THEN
    RAISE EXCEPTION 'No cashier found';
  END IF;

  -- Get warehouse
  SELECT id INTO v_wh_id FROM warehouses WHERE venue_id = v_venue_id LIMIT 1;

  -- Load dishes into arrays
  v_dish_ids := ARRAY(SELECT id FROM products WHERE venue_id = v_venue_id AND type = 'dish' AND is_active = true);
  v_dish_prices := ARRAY(SELECT price FROM products WHERE venue_id = v_venue_id AND type = 'dish' AND is_active = true);
  v_dish_names := ARRAY(SELECT name FROM products WHERE venue_id = v_venue_id AND type = 'dish' AND is_active = true);
  v_dish_count := array_length(v_dish_ids, 1);

  -- ═══ 1. Clean existing data ═══
  RAISE NOTICE 'Cleaning existing data...';
  DELETE FROM order_events WHERE order_id IN (
    SELECT id FROM orders WHERE venue_id = v_venue_id
  );
  DELETE FROM order_items WHERE order_id IN (
    SELECT id FROM orders WHERE venue_id = v_venue_id
  );
  DELETE FROM payments WHERE order_id IN (
    SELECT id FROM orders WHERE venue_id = v_venue_id
  );
  DELETE FROM orders WHERE venue_id = v_venue_id;
  DELETE FROM shifts WHERE venue_id = v_venue_id;
  
  -- ═══ 2. GENERATE shifts & orders for last 30 days ═══
  v_day := CURRENT_DATE - 30;
  
  WHILE v_day < CURRENT_DATE LOOP
    v_dow := EXTRACT(DOW FROM v_day); -- 0=Sun
    v_is_weekend := v_dow IN (0, 6); -- Sat=6, Sun=0

    -- Shift times
    IF v_is_weekend THEN
      v_shift_start := v_day + TIME '08:00';
      v_shift_end := v_day + TIME '23:00';
    ELSE
      v_shift_start := v_day + TIME '07:00';
      v_shift_end := v_day + TIME '20:00';
    END IF;

    -- Create shift
    v_shift_id := gen_random_uuid();
    INSERT INTO shifts (id, venue_id, cashier_id, opened_at, closed_at, starting_cash, total_revenue, total_orders)
    VALUES (v_shift_id, v_venue_id, v_cashier_id, v_shift_start, v_shift_end, 3000, 0, 0);

    v_shift_rev := 0;
    v_shift_orders := 0;

    -- ═══ Generate orders per hour ═══
    FOR v_hour IN 7..22 LOOP
      -- Number of orders for this hour
      IF v_is_weekend THEN
        -- Weekend patterns
        CASE v_hour
          WHEN 7 THEN v_num_orders := floor(random() * 4 + 2)::int;   -- 2-5
          WHEN 8 THEN v_num_orders := floor(random() * 7 + 6)::int;   -- 6-12
          WHEN 9 THEN v_num_orders := floor(random() * 7 + 8)::int;   -- 8-14
          WHEN 10 THEN v_num_orders := floor(random() * 7 + 10)::int; -- 10-16
          WHEN 11 THEN v_num_orders := floor(random() * 7 + 8)::int;  -- 8-14
          WHEN 12 THEN v_num_orders := floor(random() * 7 + 10)::int; -- 10-16
          WHEN 13 THEN v_num_orders := floor(random() * 5 + 8)::int;  -- 8-12
          WHEN 14 THEN v_num_orders := floor(random() * 4 + 4)::int;  -- 4-7
          WHEN 15 THEN v_num_orders := floor(random() * 3 + 3)::int;  -- 3-5
          WHEN 16 THEN v_num_orders := floor(random() * 3 + 3)::int;  -- 3-5
          WHEN 17 THEN v_num_orders := floor(random() * 4 + 4)::int;  -- 4-7
          WHEN 18 THEN v_num_orders := floor(random() * 5 + 6)::int;  -- 6-10
          WHEN 19 THEN v_num_orders := floor(random() * 5 + 5)::int;  -- 5-9
          WHEN 20 THEN v_num_orders := floor(random() * 4 + 3)::int;  -- 3-6
          WHEN 21 THEN v_num_orders := floor(random() * 3 + 2)::int;  -- 2-4
          WHEN 22 THEN v_num_orders := floor(random() * 3 + 1)::int;  -- 1-3
          ELSE v_num_orders := 0;
        END CASE;
      ELSE
        -- Weekday patterns (weaker lunch, stronger morning)
        CASE v_hour
          WHEN 7 THEN v_num_orders := floor(random() * 4 + 3)::int;   -- 3-6
          WHEN 8 THEN v_num_orders := floor(random() * 7 + 8)::int;   -- 8-14
          WHEN 9 THEN v_num_orders := floor(random() * 7 + 10)::int;  -- 10-16
          WHEN 10 THEN v_num_orders := floor(random() * 5 + 6)::int;  -- 6-10
          WHEN 11 THEN v_num_orders := floor(random() * 4 + 4)::int;  -- 4-7
          WHEN 12 THEN v_num_orders := floor(random() * 5 + 5)::int;  -- 5-9
          WHEN 13 THEN v_num_orders := floor(random() * 4 + 4)::int;  -- 4-7
          WHEN 14 THEN v_num_orders := floor(random() * 3 + 2)::int;  -- 2-4
          WHEN 15 THEN v_num_orders := floor(random() * 3 + 1)::int;  -- 1-3
          WHEN 16 THEN v_num_orders := floor(random() * 3 + 2)::int;  -- 2-4
          WHEN 17 THEN v_num_orders := floor(random() * 4 + 3)::int;  -- 3-6
          WHEN 18 THEN v_num_orders := floor(random() * 5 + 4)::int;  -- 4-8
          WHEN 19 THEN v_num_orders := floor(random() * 4 + 3)::int;  -- 3-6
          WHEN 20 THEN v_num_orders := floor(random() * 3 + 2)::int;  -- 2-4
          WHEN 21 THEN v_num_orders := floor(random() * 3 + 1)::int;  -- 1-3
          WHEN 22 THEN v_num_orders := floor(random() * 2 + 1)::int;  -- 1-2
          ELSE v_num_orders := 0;
        END CASE;
      END IF;

      -- Generate each order in this hour
      FOR v_oi IN 1..v_num_orders LOOP
        v_opened_at := v_day + MAKE_INTERVAL(hours => v_hour, mins => floor(random() * 60)::int);
        
        -- 1-3 items per order
        v_num_items := CASE WHEN random() < 0.5 THEN 1 WHEN random() < 0.8 THEN 2 ELSE 3 END;
        
        -- Pick random items and sum total
        v_total := 0;
        FOR v_i IN 1..v_num_items LOOP
          v_dish_idx := floor(random() * v_dish_count)::int + 1;
          v_qty := CASE WHEN random() < 0.7 THEN 1 ELSE 2 END;
          v_price := v_dish_prices[v_dish_idx];
          v_total := v_total + (v_price * v_qty);
        END LOOP;

        -- Create order
        v_order_id := gen_random_uuid();
        v_table_number := (floor(random() * 15 + 1))::text;
        
        INSERT INTO orders (id, venue_id, shift_id, number, status, opened_at, closed_at, total_amount, order_source, table_number)
        VALUES (v_order_id, v_venue_id, v_shift_id, 
                'D' || to_char(v_opened_at, 'YYMMDD') || lpad((v_shift_orders + 1)::text, 3, '0'),
                'paid', v_opened_at, v_opened_at + interval '15 minutes', v_total, 'pos', v_table_number);

        -- Create order_items (simplified — 1 row per order with total)
        v_dish_idx := floor(random() * v_dish_count)::int + 1;
        INSERT INTO order_items (order_id, product_id, product_name, quantity, product_price)
        VALUES (v_order_id, v_dish_ids[v_dish_idx], v_dish_names[v_dish_idx], v_num_items, v_total / v_num_items);

        v_shift_rev := v_shift_rev + v_total;
        v_shift_orders := v_shift_orders + 1;
      END LOOP;
    END LOOP;

    -- Update shift totals
    UPDATE shifts SET total_revenue = v_shift_rev, total_orders = v_shift_orders
    WHERE id = v_shift_id;

    v_day := v_day + 1;
  END LOOP;

  -- ═══ 3. Make 3 days unprofitable (low revenue Tuesdays) ═══
  -- Reduce orders for Tuesdays 2 and 3 weeks ago by 50%
  UPDATE orders SET total_amount = total_amount * 0.4
  WHERE venue_id = v_venue_id
    AND status = 'paid'
    AND EXTRACT(DOW FROM opened_at) = 2  -- Tuesday
    AND opened_at::date BETWEEN CURRENT_DATE - 21 AND CURRENT_DATE - 7;

  -- Update corresponding shift totals
  UPDATE shifts SET total_revenue = (
    SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE shift_id = shifts.id AND status = 'paid'
  ), total_orders = (
    SELECT COUNT(*) FROM orders WHERE shift_id = shifts.id AND status = 'paid'
  )
  WHERE venue_id = v_venue_id;

  RAISE NOTICE 'Done! Generated data for 30 days.';
END $$;
