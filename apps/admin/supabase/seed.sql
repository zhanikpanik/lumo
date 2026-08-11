-- ============================================================
-- Full seed: Alto Coffee Bishkek — May 2026 data
-- Run directly: docker exec -i supabase_db_r_keeper psql -U postgres -d postgres < supabase/seed.sql
-- ============================================================

-- 1. CLEAN ALL DATA (only tables that actually exist)
TRUNCATE TABLE
  order_item_modifiers,
  order_items,
  marketplace_modifier_bindings,
  marketplace_inbound_events,
  marketplace_store_bindings,
  product_modifier_groups,
  modifiers,
  modifier_groups,
  recipe_items,
  inventory_movements,
  pos_order_stock_settlements,
  pos_order_refunds,
  pos_consumption_dead_letters,
  payments,
  cash_movements,
  orders,
  shifts,
  suppliers,
  supply_items,
  supply_documents,
  venue_order_counters,
  stock_items,
  warehouse_delivery_items,
  warehouse_write_off_items,
  warehouse_inventory_lines,
  warehouse_transfer_items,
  warehouse_deliveries,
  warehouse_write_offs,
  warehouse_inventory_sessions,
  warehouse_transfers,
  warehouse_products,
  products,
  workshop_warehouses,
  tables,
  warehouses,
  workshops,
  categories,
  user_venues,
  users,
  zones
CASCADE;

-- 2. SEED: Alto Coffee Bishkek — full May 2026
DO $$
DECLARE
  v_venue_id UUID;
  v_org_id UUID;
  v_user_id UUID := gen_random_uuid();

  -- Categories
  v_cat_coffee UUID := gen_random_uuid();
  v_cat_alt UUID := gen_random_uuid();
  v_cat_food UUID := gen_random_uuid();
  v_cat_dessert UUID := gen_random_uuid();

  -- Workshops
  v_ws_bar UUID := gen_random_uuid();
  v_ws_kitchen UUID := gen_random_uuid();

  -- Warehouses
  v_wh_main UUID := gen_random_uuid();

  -- Ingredients
  v_ing_coffee UUID := gen_random_uuid();
  v_ing_milk UUID := gen_random_uuid();
  v_ing_syrup UUID := gen_random_uuid();
  v_ing_chocolate UUID := gen_random_uuid();
  v_ing_flour UUID := gen_random_uuid();
  v_ing_sugar UUID := gen_random_uuid();
  v_ing_butter UUID := gen_random_uuid();
  v_ing_eggs UUID := gen_random_uuid();
  v_ing_cream UUID := gen_random_uuid();
  v_ing_tea UUID := gen_random_uuid();

  -- Dishes (15 coffee shop items)
  v_dish_ids UUID[] := ARRAY[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ];

  -- Day loop
  v_day DATE;
  v_dow INTEGER;
  v_shift_id UUID;
  v_hour INTEGER;
  v_min INTEGER;
  v_num_orders INTEGER;
  v_oi INTEGER;
  v_order_id UUID;
  v_order_number INT := 1000;
  v_table INT;
  v_items_count INT;
  v_ii INTEGER;
  v_dish_idx INTEGER;
  v_item_price NUMERIC;
  v_qty INT;
  v_order_total NUMERIC;
  v_order_opened TIMESTAMPTZ;
  v_order_closed TIMESTAMPTZ;
  v_is_quick BOOLEAN;

  -- Cash movement vars
  v_cm_id UUID;

  -- Delivery/Write-off vars
  v_del_id UUID;
  v_wo_id UUID;

  -- Helper arrays
  v_dish_names TEXT[] := ARRAY[
    'Американо', 'Эспрессо', 'Латте', 'Капучино', 'Раф',
    'Флэт Уайт', 'Мокачино', 'Какао', 'Карамельный латте', 'Чай латте',
    'Круассан', 'Чизкейк', 'Маффин', 'Сэндвич с курицей', 'Брауни'
  ];
  v_dish_prices NUMERIC[] := ARRAY[
    190, 130, 220, 210, 260,
    240, 250, 200, 280, 230,
    180, 350, 220, 290, 250
  ];
  -- Popularity weights (sum ≈ 1.0)
  v_dish_weights NUMERIC[] := ARRAY[
    0.12, 0.10, 0.14, 0.16, 0.07,
    0.05, 0.04, 0.03, 0.04, 0.02,
    0.06, 0.04, 0.03, 0.05, 0.05
  ];
  v_dish_cats UUID[];

  -- Hourly order probability (7h-23h = 17 slots)
  v_hourly_weights NUMERIC[] := ARRAY[
    0.03, 0.08, 0.10, 0.07, 0.04, 0.07, 0.10, 0.05,
    0.03, 0.03, 0.06, 0.08, 0.06, 0.04, 0.03, 0.02, 0.01
  ];

  -- Day-of-week base orders (Mon=0..Sun=6)
  v_dow_base INTEGER[] := ARRAY[30, 28, 32, 30, 38, 45, 35];

  -- Ingredient data
  v_ing_names TEXT[] := ARRAY[
    'Кофе в зёрнах', 'Молоко 3.2%', 'Сироп карамельный',
    'Шоколад тёмный', 'Мука пшеничная', 'Сахар',
    'Масло сливочное', 'Яйца', 'Сливки 33%', 'Чай листовой'
  ];
  v_ing_units TEXT[] := ARRAY[
    'кг', 'л', 'л', 'кг', 'кг', 'кг', 'кг', 'шт', 'л', 'кг'
  ];
  v_ing_stock NUMERIC[] := ARRAY[
    2.5, 8.0, 1.2, 1.5, 12.0, 15.0, 2.0, 90, 3.0, 1.0
  ];
  v_ing_cost NUMERIC[] := ARRAY[
    800, 60, 350, 500, 120, 80, 700, 12, 250, 400
  ];

  -- Float-out notes for cash movements
  v_expense_notes TEXT[] := ARRAY[
    'Салфетки', 'Такси', 'Моющее средство', 'Одноразовые стаканы',
    'Хлеб для сэндвичей', 'Вода питьевая', 'Пакеты', 'Канцтовары',
    'Курьер', 'Лампочки', 'Чистящее средство', 'Батарейки',
    'Салфетки бумажные', 'Мелкий ремонт'
  ];

  -- Supplier names
  v_suppliers TEXT[] := ARRAY['Белая река', 'Ак-Куу', 'Шортанбай', 'Сладкий дом'];

  -- Write-off reasons
  v_wo_reasons TEXT[] := ARRAY['Истёк срок годности', 'Порча при хранении', 'Брак приготовления', 'Просрочка'];

  -- Misc
  r DOUBLE PRECISION;
  cum DOUBLE PRECISION;
  hi INTEGER;
  di INTEGER;
  ti INTEGER;
  r2 DOUBLE PRECISION;
  cum2 DOUBLE PRECISION;
BEGIN
  SELECT id INTO v_venue_id FROM public.venues LIMIT 1;
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  -- ============================================================
  -- USERS
  -- ============================================================
  INSERT INTO public.users (id, organization_id, name, pin, role) VALUES
    (v_user_id, v_org_id, 'Айгуль', '1234', 'cashier');

  -- ============================================================
  -- CATEGORIES
  -- ============================================================
  INSERT INTO public.categories (id, venue_id, name, color_hex, sort_order) VALUES
    (v_cat_coffee,  v_venue_id, 'Кофе',         '#6F4E37', 1),
    (v_cat_alt,     v_venue_id, 'Альтернатива', '#8D6E63', 2),
    (v_cat_food,    v_venue_id, 'Еда',          '#F57C00', 3),
    (v_cat_dessert, v_venue_id, 'Десерты',      '#E91E63', 4);

  v_dish_cats := ARRAY[
    v_cat_coffee, v_cat_coffee, v_cat_coffee, v_cat_coffee, v_cat_coffee,
    v_cat_alt, v_cat_alt, v_cat_alt, v_cat_alt,
    v_cat_food, v_cat_dessert, v_cat_dessert, v_cat_food, v_cat_dessert
  ];

  -- ============================================================
  -- WAREHOUSE + WORKSHOPS
  -- ============================================================
  INSERT INTO public.warehouses (id, venue_id, name) VALUES
    (v_wh_main, v_venue_id, 'Основной склад');

  INSERT INTO public.workshops (id, venue_id, name, sort_order, default_warehouse_id) VALUES
    (v_ws_bar,     v_venue_id, 'Бар',    1, v_wh_main),
    (v_ws_kitchen, v_venue_id, 'Кухня',  2, v_wh_main);

  INSERT INTO public.workshop_warehouses (workshop_id, warehouse_id) VALUES
    (v_ws_bar, v_wh_main),
    (v_ws_kitchen, v_wh_main);

  -- ============================================================
  -- INGREDIENTS (10)
  -- ============================================================
  FOR i IN 1..10 LOOP
    INSERT INTO public.products (id, venue_id, type, name, price, cost_price, unit, stock_quantity, is_active, sort_order, workshop_id)
    VALUES (
      CASE i
        WHEN 1 THEN v_ing_coffee WHEN 2 THEN v_ing_milk WHEN 3 THEN v_ing_syrup
        WHEN 4 THEN v_ing_chocolate WHEN 5 THEN v_ing_flour WHEN 6 THEN v_ing_sugar
        WHEN 7 THEN v_ing_butter WHEN 8 THEN v_ing_eggs WHEN 9 THEN v_ing_cream
        WHEN 10 THEN v_ing_tea
      END,
      v_venue_id, 'ingredient', v_ing_names[i], 0, v_ing_cost[i],
      v_ing_units[i], v_ing_stock[i], true, i,
      CASE WHEN i <= 6 THEN v_ws_bar ELSE v_ws_kitchen END
    );
  END LOOP;

  INSERT INTO public.stock_items (warehouse_id, product_id, quantity, unit)
  SELECT v_wh_main, p.id, p.stock_quantity, p.unit
  FROM products p WHERE p.venue_id = v_venue_id AND p.type = 'ingredient';

  INSERT INTO public.warehouse_products (warehouse_id, product_id)
  SELECT v_wh_main, p.id
  FROM products p WHERE p.venue_id = v_venue_id AND p.type = 'ingredient';

  -- ============================================================
  -- DISHES (15)
  -- ============================================================
  FOR i IN 1..15 LOOP
    INSERT INTO public.products (id, venue_id, type, name, price, cost_price, category_id, workshop_id, is_active, sort_order)
    VALUES (
      v_dish_ids[i], v_venue_id, 'dish', v_dish_names[i], v_dish_prices[i],
      (v_dish_prices[i] * 0.3)::NUMERIC(14,2), v_dish_cats[i],
      CASE WHEN i <= 10 THEN v_ws_bar ELSE v_ws_kitchen END,
      true, i
    );
  END LOOP;

  -- ============================================================
  -- ORDERS, SHIFTS, CASH_MOVEMENTS — May 2026 (31 days)
  -- ============================================================
  v_day := '2026-05-01'::DATE;

  FOR d IN 1..31 LOOP
    v_dow := EXTRACT(DOW FROM v_day); -- 0=Sun..6=Sat
    v_dow := CASE WHEN v_dow = 0 THEN 6 ELSE v_dow - 1 END; -- Mon=0..Sun=6

    v_num_orders := v_dow_base[v_dow + 1];
    -- Holidays: May 1 (Labor), May 9 (Victory)
    IF d = 1 OR d = 9 THEN
      v_num_orders := v_num_orders + 15;
    END IF;
    -- Random ±20%
    v_num_orders := v_num_orders + ((random() * 0.4 - 0.2) * v_num_orders)::INT;
    IF v_num_orders < 10 THEN v_num_orders := 10; END IF;

    -- ── CREATE SHIFT ──
    v_shift_id := gen_random_uuid();
    INSERT INTO public.shifts (
      id, venue_id, cashier_id, opened_at, closed_at,
      starting_cash, total_revenue, cash_total, card_total, other_total,
      total_orders, closing_cash_count
    ) VALUES (
      v_shift_id, v_venue_id, v_user_id,
      (v_day + TIME '07:30')::TIMESTAMPTZ,
      (v_day + TIME '23:00')::TIMESTAMPTZ,
      5000, 0, 0, 0, 0, 0, 0
    );

    -- ── GENERATE ORDERS ──
    FOR v_oi IN 1..v_num_orders LOOP
      -- Weighted random hour
      r := random();
      cum := 0;
      v_hour := 23;
      FOR hi IN 1..17 LOOP
        cum := cum + v_hourly_weights[hi];
        IF r <= cum THEN
          v_hour := 6 + hi;
          EXIT;
        END IF;
      END LOOP;

      v_min := (random() * 59)::INT;
      v_order_opened := (v_day + (v_hour || ':' || v_min || ':00')::TIME)::TIMESTAMPTZ;
      v_order_closed := v_order_opened + (5 + random()*20)::INT * INTERVAL '1 minute';

      v_table := 1 + (random() * 14)::INT;
      v_is_quick := random() < 0.15;

      v_items_count := 1 + (random() * 3.5)::INT;
      IF v_items_count > 4 THEN v_items_count := 4; END IF;
      v_order_total := 0;

      v_order_number := v_order_number + 1;
      v_order_id := gen_random_uuid();

      -- Insert order FIRST (FK from order_items)
      INSERT INTO public.orders (
        id, venue_id, shift_id, waiter_id, number, status, table_number,
        opened_at, closed_at, total_amount, is_quick_check,
        order_source, integration_metadata
      ) VALUES (
        v_order_id, v_venue_id, v_shift_id, v_user_id, v_order_number::TEXT,
        'paid', v_table::TEXT,
        v_order_opened, v_order_closed, 0, v_is_quick,
        'pos', '{}'
      );

      -- Order items
      FOR v_ii IN 1..v_items_count LOOP
        r2 := random();
        cum2 := 0;
        v_dish_idx := 15;
        FOR di IN 1..15 LOOP
          cum2 := cum2 + v_dish_weights[di];
          IF r2 <= cum2 THEN
            v_dish_idx := di;
            EXIT;
          END IF;
        END LOOP;

        v_qty := 1;
        IF random() < 0.08 AND v_items_count < 4 THEN
          v_qty := 2;
        END IF;

        v_item_price := v_dish_prices[v_dish_idx];
        v_order_total := v_order_total + (v_item_price * v_qty);

        INSERT INTO public.order_items (
          order_id, product_id, product_name, product_price, quantity
        ) VALUES (
          v_order_id, v_dish_ids[v_dish_idx], v_dish_names[v_dish_idx], v_item_price, v_qty
        );
      END LOOP;

      -- Update order with computed total
      UPDATE orders SET total_amount = v_order_total WHERE id = v_order_id;
    END LOOP;

    -- ── GENERATE CASH MOVEMENTS (2-6 float_out per day) ──
    DECLARE
      v_cm_count INT := 2 + (random() * 4)::INT;
      v_cm_amt NUMERIC;
    BEGIN
      FOR ti IN 1..v_cm_count LOOP
        v_cm_amt := (300 + random() * 1200)::NUMERIC(14,0);
        v_cm_id := gen_random_uuid();
        INSERT INTO public.cash_movements (
          id, venue_id, shift_id, movement_type, amount, note, occurred_at
        ) VALUES (
          v_cm_id, v_venue_id, v_shift_id, 'float_out', v_cm_amt,
          v_expense_notes[1 + (random() * (array_length(v_expense_notes,1)-1))::INT],
          (v_day + TIME '09:00' + (random() * 12)::INT * INTERVAL '1 hour')::TIMESTAMPTZ
        );
      END LOOP;
    END;

    v_day := v_day + INTERVAL '1 day';
  END LOOP;

  -- ============================================================
  -- WAREHOUSE DELIVERIES (10 for May)
  -- ============================================================
  -- Spread deliveries across the month: days 3, 6, 9, 12, 15, 18, 21, 24, 27, 30
  FOR i IN 0..9 LOOP
    DECLARE
      v_del_day INT := 3 + i * 3;
      v_del_date DATE := ('2026-05-' || LPAD(v_del_day::TEXT, 2, '0'))::DATE;
    BEGIN
    v_del_id := gen_random_uuid();
    INSERT INTO public.warehouse_deliveries (
      id, venue_id, supplier, delivery_date, amount, status, source, created_at, warehouse_id
    ) VALUES (
      v_del_id, v_venue_id,
      v_suppliers[1 + (random() * 3)::INT],
      (v_del_date + TIME '10:00')::TIMESTAMPTZ,
      (2000 + random() * 5000)::NUMERIC(14,0),
      CASE WHEN random() < 0.7 THEN 'received' ELSE 'draft' END,
      'manual',
      (v_del_date + TIME '10:00')::TIMESTAMPTZ,
      v_wh_main
    );

    FOR j IN 1..(1 + (random() * 3)::INT) LOOP
      INSERT INTO public.warehouse_delivery_items (
        id, delivery_id, name, quantity, unit, price
      ) VALUES (
        gen_random_uuid(), v_del_id,
        v_ing_names[1 + (random() * 9)::INT],
        (1 + random() * 10)::NUMERIC(14,3),
        v_ing_units[1 + (random() * 9)::INT],
        (200 + random() * 800)::NUMERIC(14,2)
      );
    END LOOP;
    END;
  END LOOP;

  -- ============================================================
  -- WAREHOUSE WRITE-OFFS (6 for May)
  -- ============================================================
  -- Spread write-offs across the month: days 5, 10, 15, 20, 25, 30
  FOR i IN 0..5 LOOP
    DECLARE
      v_wo_day INT := 5 + i * 5;
      v_wo_date DATE := ('2026-05-' || LPAD(v_wo_day::TEXT, 2, '0'))::DATE;
    BEGIN
    v_wo_id := gen_random_uuid();
      INSERT INTO public.warehouse_write_offs (
        id, venue_id, reason_summary, write_off_date, status, created_by_name, created_at, warehouse_id
      ) VALUES (
        v_wo_id, v_venue_id,
        v_wo_reasons[1 + (random() * 3)::INT],
        (v_wo_date + TIME '14:00')::TIMESTAMPTZ,
        'posted',
        'Айгуль',
        (v_wo_date + TIME '14:00')::TIMESTAMPTZ,
        v_wh_main
      );

      FOR j IN 1..(1 + (random() * 2)::INT) LOOP
        INSERT INTO public.warehouse_write_off_items (
          id, write_off_id, name, quantity, unit, reason, product_id
        ) VALUES (
          gen_random_uuid(), v_wo_id,
          v_ing_names[1 + (random() * 9)::INT],
          (0.1 + random() * 2)::NUMERIC(14,3),
          v_ing_units[1 + (random() * 9)::INT],
          v_wo_reasons[1 + (random() * 3)::INT],
          CASE WHEN random() < 0.5 THEN (
            CASE (1 + (random() * 9)::INT)
              WHEN 1 THEN v_ing_coffee WHEN 2 THEN v_ing_milk WHEN 3 THEN v_ing_syrup
              WHEN 4 THEN v_ing_chocolate WHEN 5 THEN v_ing_flour WHEN 6 THEN v_ing_sugar
              WHEN 7 THEN v_ing_butter WHEN 8 THEN v_ing_eggs WHEN 9 THEN v_ing_cream
              WHEN 10 THEN v_ing_tea
            END
          ) ELSE NULL END
        );
      END LOOP;
    END;
  END LOOP;

  -- ============================================================
  -- UPDATE SHIFT TOTALS (post-factum from orders)
  -- ============================================================
  UPDATE shifts s SET
    total_revenue = COALESCE((
      SELECT SUM(o.total_amount) FROM orders o
      WHERE o.venue_id = s.venue_id
        AND o.shift_id = s.id
        AND o.status = 'paid'
    ), 0),
    total_orders = COALESCE((
      SELECT COUNT(*) FROM orders o
      WHERE o.venue_id = s.venue_id
        AND o.shift_id = s.id
        AND o.status = 'paid'
    ), 0),
    cash_total = COALESCE((
      SELECT SUM(o.total_amount) FROM orders o
      WHERE o.venue_id = s.venue_id
        AND o.shift_id = s.id
        AND o.status = 'paid'
    ), 0) * 0.5,
    card_total = COALESCE((
      SELECT SUM(o.total_amount) FROM orders o
      WHERE o.venue_id = s.venue_id
        AND o.shift_id = s.id
        AND o.status = 'paid'
    ), 0) * 0.5
  WHERE s.venue_id = v_venue_id;

END $$;
