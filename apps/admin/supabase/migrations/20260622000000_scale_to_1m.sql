-- Scale demo data to ~1M som/month for Alto Coffee Bishkek.
-- Keeps menu/warehouses/staff/suppliers, regenerates everything else at 2.5× volume.
-- Run: SELECT demo_scale_to_1m('00000000-0000-0000-0000-000000000010');
CREATE OR REPLACE FUNCTION demo_scale_to_1m(p_venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
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
  v_delivery_id uuid;
  v_wo_id uuid;
  v_supplier_name text;
  v_wh_id uuid;
  v_ing_id uuid;
  v_ing_name text;
  v_ing_cost numeric;
  v_ing_unit text;
  v_ing_workshop text;
  v_del_amount numeric;
  v_qty numeric;
  v_item_record record;
  v_total_orders int := 0;
  v_total_deliveries int := 0;
  v_total_writeoffs int := 0;
  v_today date := CURRENT_DATE;
  v_start_date date := v_today - 30;
BEGIN
  -- ═══ CLEAR EXISTING TRANSACTION DATA ═══
  DELETE FROM order_events WHERE venue_id = p_venue_id;
  DELETE FROM order_item_modifiers WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id = p_venue_id));
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE venue_id = p_venue_id);
  DELETE FROM payments WHERE venue_id = p_venue_id;
  DELETE FROM cash_movements WHERE venue_id = p_venue_id;
  DELETE FROM cash_transactions WHERE venue_id = p_venue_id;
  DELETE FROM orders WHERE venue_id = p_venue_id;
  DELETE FROM shifts WHERE venue_id = p_venue_id;

  DELETE FROM warehouse_delivery_items WHERE delivery_id IN (SELECT id FROM warehouse_deliveries WHERE venue_id = p_venue_id);
  DELETE FROM warehouse_write_off_items WHERE write_off_id IN (SELECT id FROM warehouse_write_offs WHERE venue_id = p_venue_id);
  DELETE FROM warehouse_inventory_lines WHERE session_id IN (SELECT id FROM warehouse_inventory_sessions WHERE venue_id = p_venue_id);
  DELETE FROM warehouse_deliveries WHERE venue_id = p_venue_id;
  DELETE FROM warehouse_write_offs WHERE venue_id = p_venue_id;
  DELETE FROM warehouse_inventory_sessions WHERE venue_id = p_venue_id;

  -- Clear stock (will regenerate)
  DELETE FROM stock_items WHERE warehouse_id IN (SELECT id FROM warehouses WHERE venue_id = p_venue_id);

  SELECT organization_id INTO v_org_id FROM venues WHERE id = p_venue_id;

  -- Count available entities
  SELECT count(*) INTO v_cashier_count FROM users WHERE organization_id = v_org_id AND role = 'cashier';
  SELECT count(*) INTO v_waiter_count FROM users WHERE organization_id = v_org_id;
  SELECT count(*) INTO v_table_count FROM tables WHERE venue_id = p_venue_id;
  SELECT count(*) INTO v_product_count FROM products WHERE venue_id = p_venue_id AND type = 'dish' AND is_active = true;

  IF v_cashier_count = 0 OR v_waiter_count = 0 OR v_table_count = 0 OR v_product_count = 0 THEN
    RETURN 'ERROR: missing data — need cashiers, waiters, tables, dishes';
  END IF;

  -- ═══ REGENERATE ORDERS AT 2.5× VOLUME ═══
  FOR v_day IN SELECT generate_series(v_start_date, v_start_date + 29, '1 day'::interval)::date
  LOOP
    v_is_weekend := EXTRACT(DOW FROM v_day) IN (0, 6);
    -- ~2.5×: weekday 85-140, weekend 150-220
    v_num_orders := CASE WHEN v_is_weekend
      THEN 150 + floor(random() * 71)::int
      ELSE 85 + floor(random() * 56)::int
    END;

    -- ── MORNING SHIFT (08:00-16:00) ──
    v_shift_id := gen_random_uuid();
    v_shift_start := v_day + time '08:00' + (floor(random() * 15)::text || ' minutes')::interval;
    v_shift_end := v_day + time '16:00' + (floor(random() * 30)::text || ' minutes')::interval;
    v_shift_revenue := 0;
    v_shift_orders := 0;

    SELECT id INTO v_cashier_id FROM users WHERE organization_id = v_org_id AND role = 'cashier' ORDER BY random() LIMIT 1;

    FOR i IN 1..floor(v_num_orders * 0.55)::int LOOP
      v_order_num := v_order_num + 1;
      v_order_id := gen_random_uuid();

      IF random() < 0.7 THEN
        v_hour := 8 + floor(random() * 2)::int;
      ELSE
        v_hour := 8 + floor(random() * 8)::int;
      END IF;
      v_min := floor(random() * 59)::int;
      v_opened_at := v_day + (v_hour::text || ':' || v_min::text || ':00')::time;
      v_closed_at := v_opened_at + (10 + floor(random() * 36)::text || ' minutes')::interval;

      v_status := CASE WHEN random() < 0.05 THEN 'cancelled' ELSE 'paid' END;

      SELECT id INTO v_waiter_id FROM users WHERE organization_id = v_org_id ORDER BY random() LIMIT 1;
      SELECT id, number INTO v_table_id, v_table_number FROM tables WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;

      v_total := 0;
      -- More items per order: 40%-35%-25% for 1-2-3 items
      v_num_items := CASE WHEN random() < 0.40 THEN 1 WHEN random() < 0.85 THEN 2 ELSE 3 END;

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
      v_total_orders := v_total_orders + 1;
    END LOOP;

    v_starting_cash := 3000 + floor(random() * 2001)::numeric;
    v_diff := CASE WHEN random() < 0.15 THEN floor(random() * 1001 - 500)::numeric ELSE 0 END;
    v_expected_cash := v_starting_cash + ceil(v_shift_revenue * 0.6) + v_diff;

    INSERT INTO shifts (id, venue_id, cashier_id, opened_at, closed_at, starting_cash, total_orders, total_revenue, cash_total, card_total, expected_cash_at_close, cash_difference_at_close, cash_collections_total)
    VALUES (v_shift_id, p_venue_id, v_cashier_id, v_shift_start, v_shift_end, v_starting_cash, v_shift_orders, v_shift_revenue, floor(v_shift_revenue * 0.6), ceil(v_shift_revenue * 0.4), v_expected_cash, v_diff, 0);

    INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at)
    VALUES (p_venue_id, v_shift_id, 'float_in', v_starting_cash, 'opening_balance', v_shift_start);

    FOR i IN 1..(2 + floor(random() * 3)::int) LOOP
      v_note := (ARRAY['payment_insert','Расход на продукты','Курьер','Хозтовары','Расходники'])[1 + floor(random() * 5)::int];
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at)
      VALUES (p_venue_id, v_shift_id, 'float_out', 200 + floor(random() * 2001)::numeric, v_note, v_shift_start + (1 + floor(random() * 6)::text || ' hours')::interval);
    END LOOP;

    -- ── EVENING SHIFT (16:00-00:00) ──
    v_shift_id := gen_random_uuid();
    v_shift_start := v_day + time '16:00' + (floor(random() * 15)::text || ' minutes')::interval;
    v_shift_end := v_day + time '23:30' + (floor(random() * 30)::text || ' minutes')::interval;
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
      v_min := floor(random() * 59)::int;
      v_opened_at := v_day + (v_hour::text || ':' || v_min::text || ':00')::time;
      v_closed_at := v_opened_at + (10 + floor(random() * 36)::text || ' minutes')::interval;

      v_status := CASE WHEN random() < 0.05 THEN 'cancelled' ELSE 'paid' END;

      SELECT id INTO v_waiter_id FROM users WHERE organization_id = v_org_id ORDER BY random() LIMIT 1;
      SELECT id, number INTO v_table_id, v_table_number FROM tables WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;

      v_total := 0;
      v_num_items := CASE WHEN random() < 0.40 THEN 1 WHEN random() < 0.85 THEN 2 ELSE 3 END;

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
      v_total_orders := v_total_orders + 1;
    END LOOP;

    v_starting_cash := 3000 + floor(random() * 2001)::numeric;
    v_diff := CASE WHEN random() < 0.15 THEN floor(random() * 1001 - 500)::numeric ELSE 0 END;
    v_expected_cash := v_starting_cash + ceil(v_shift_revenue * 0.6) + v_diff;

    INSERT INTO shifts (id, venue_id, cashier_id, opened_at, closed_at, starting_cash, total_orders, total_revenue, cash_total, card_total, expected_cash_at_close, cash_difference_at_close, cash_collections_total)
    VALUES (v_shift_id, p_venue_id, v_cashier_id, v_shift_start, v_shift_end, v_starting_cash, v_shift_orders, v_shift_revenue, floor(v_shift_revenue * 0.6), ceil(v_shift_revenue * 0.4), v_expected_cash, v_diff, 0);

    INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at)
    VALUES (p_venue_id, v_shift_id, 'float_in', v_starting_cash, 'opening_balance', v_shift_start);

    FOR i IN 1..(2 + floor(random() * 3)::int) LOOP
      v_note := (ARRAY['payment_insert','Расход на продукты','Курьер','Хозтовары','Расходники'])[1 + floor(random() * 5)::int];
      INSERT INTO cash_movements (venue_id, shift_id, movement_type, amount, note, occurred_at)
      VALUES (p_venue_id, v_shift_id, 'float_out', 200 + floor(random() * 2001)::numeric, v_note, v_shift_start + (1 + floor(random() * 6)::text || ' hours')::interval);
    END LOOP;
  END LOOP;

  -- ═══ DELIVERIES: 2-3 per week, scaled amounts ═══
  FOR v_day IN SELECT generate_series(v_start_date, v_start_date + 29, '2 day'::interval)::date
  LOOP
    -- 1-2 deliveries per day, 60% chance
    FOR i IN 1..CASE WHEN random() < 0.4 THEN 2 ELSE 1 END LOOP
      v_delivery_id := gen_random_uuid();

      -- Pick random supplier and warehouse
      SELECT name INTO v_supplier_name FROM suppliers WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;
      SELECT id INTO v_wh_id FROM warehouses WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;

      v_del_amount := 0;
      v_opened_at := v_day + (time '09:00' + (floor(random() * 5)::text || ' hours')::interval + (floor(random() * 59)::text || ' minutes')::interval);

      INSERT INTO warehouse_deliveries (id, venue_id, warehouse_id, supplier, delivery_date, amount, status, created_at)
      VALUES (v_delivery_id, p_venue_id, v_wh_id, v_supplier_name, v_day, 0, 'received', v_opened_at);

      -- 3-7 items per delivery with scaled quantities
      FOR v_item_idx IN 1..(3 + floor(random() * 5)::int) LOOP
        SELECT id, name, cost_price, unit INTO v_ing_id, v_ing_name, v_ing_cost, v_ing_unit
        FROM products WHERE venue_id = p_venue_id AND type = 'ingredient' AND is_active = true
        ORDER BY random() LIMIT 1;

        v_qty := CASE v_ing_unit
          WHEN 'кг' THEN 5 + floor(random() * 21)::numeric
          WHEN 'л' THEN 10 + floor(random() * 41)::numeric
          ELSE 20 + floor(random() * 81)::numeric
        END;

        INSERT INTO warehouse_delivery_items (delivery_id, product_id, name, quantity, unit, price)
        VALUES (v_delivery_id, v_ing_id, v_ing_name, v_qty, v_ing_unit, round(COALESCE(v_ing_cost, 0) / 100));

        v_del_amount := v_del_amount + (v_qty * round(COALESCE(v_ing_cost, 0) / 100));
      END LOOP;

      UPDATE warehouse_deliveries SET amount = v_del_amount WHERE id = v_delivery_id;
      v_total_deliveries := v_total_deliveries + 1;
    END LOOP;
  END LOOP;

  -- ═══ WRITE-OFFS: every 2-3 days ═══
  FOR v_day IN SELECT generate_series(v_start_date, v_start_date + 29, '3 day'::interval)::date
  LOOP
    v_wo_id := gen_random_uuid();
    v_opened_at := v_day + (time '21:00' + (floor(random() * 3)::text || ' hours')::interval + (floor(random() * 59)::text || ' minutes')::interval);

    SELECT id INTO v_wh_id FROM warehouses WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;

    INSERT INTO warehouse_write_offs (id, venue_id, warehouse_id, reason_summary, write_off_date, status, created_at)
    VALUES (v_wo_id, p_venue_id, v_wh_id,
      (ARRAY['Списание порчи', 'Истекшие продукты', 'Еженедельное списание', 'Бой посуды', 'Списание брака'])[1 + floor(random() * 5)::int],
      v_day, 'posted', v_opened_at);

    -- 1-3 items per write-off
    FOR v_item_idx IN 1..(1 + floor(random() * 3)::int) LOOP
      SELECT id, name, unit INTO v_ing_id, v_ing_name, v_ing_unit
      FROM products WHERE venue_id = p_venue_id AND type = 'ingredient' AND is_active = true
      ORDER BY random() LIMIT 1;

      v_qty := CASE v_ing_unit
        WHEN 'кг' THEN round((0.1 + random() * 2.0)::numeric, 2)
        WHEN 'л' THEN round((0.2 + random() * 3.0)::numeric, 2)
        ELSE floor(1 + random() * 5)::numeric
      END;

      INSERT INTO warehouse_write_off_items (write_off_id, product_id, name, quantity, unit, reason)
      VALUES (v_wo_id, v_ing_id, v_ing_name, v_qty, v_ing_unit, (ARRAY['Истёк срок', 'Порча', 'Бой', 'Просрочка', 'Брак'])[1 + floor(random() * 5)::int]);
    END LOOP;
    v_total_writeoffs := v_total_writeoffs + 1;
  END LOOP;

  -- ═══ STOCK: realistic quantities for high-volume cafe ═══
  FOR v_item_record IN SELECT id, name, unit FROM products WHERE venue_id = p_venue_id AND type = 'ingredient' AND is_active = true
  LOOP
    SELECT id INTO v_wh_id FROM warehouses WHERE venue_id = p_venue_id ORDER BY random() LIMIT 1;

    v_qty := CASE v_item_record.unit
      WHEN 'кг' THEN 50 + floor(random() * 101)::numeric
      WHEN 'л' THEN 80 + floor(random() * 121)::numeric
      ELSE 120 + floor(random() * 181)::numeric
    END;

    INSERT INTO stock_items (product_id, warehouse_id, quantity, unit)
    VALUES (v_item_record.id, v_wh_id, v_qty, v_item_record.unit);
  END LOOP;

  RETURN v_total_orders::text || ' orders, ' ||
         v_total_deliveries::text || ' deliveries, ' ||
         v_total_writeoffs::text || ' write-offs, ' ||
         (SELECT count(*)::text FROM shifts WHERE venue_id = p_venue_id) || ' shifts — scaled to ~1M som/month';
END;
$func$;
