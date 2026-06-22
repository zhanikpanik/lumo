-- Fix: assign workshop_id to all dishes missing it
-- Run in Supabase SQL Editor against the r_keeper database

-- Bar categories → workshop 00000000-0000-0000-0000-000000005002 (Бар)
UPDATE products
SET workshop_id = '00000000-0000-0000-0000-000000005002'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND type = 'dish'
  AND workshop_id IS NULL
  AND category_id IN (
    '21ed765b-2020-ad1c-81e5-2e93da1eded2',  -- Чаи
    '4527e2dd-7fec-fa1d-6437-79eae983dd8d',  -- Соки
    '5849bcb2-d2a4-c9d6-7840-968d5280c62a',  -- Коктейли
    '6968ce19-3561-212b-fa85-fce5e19cea6b',  -- Кофе
    '71ab20de-16e9-0c52-eb56-c4956820513a',  -- Текила
    '85d2d7dd-dd3e-acb6-0486-6943df708177',  -- Водка
    '89c80051-7717-384c-a047-ae889b11c7d6',  -- Виски
    '96900a55-b855-436f-243b-2146a68e9ee0',  -- Вино, красное
    '9b263379-661e-1c41-c17d-4517f10750e7',  -- Молочные коктейли
    '9d61d706-e978-bde7-6b74-0122711481dc',  -- Бренди
    'a7ebb616-3862-295c-7500-b7212fe9e9fe',  -- Вино, домашнее
    'ad84a03d-926d-2c37-fc8c-a3c5fc7016c3',  -- Пиво
    'e21df300-2712-0803-3714-c39a0eda661e',  -- Джин
    'e22356c7-e007-de1f-c498-eb9e3d407c12',  -- Прохладительные
    'f217ad0c-76e6-2f57-4ffd-674005ee7eac',  -- Вино, белое
    'f3c6e619-20ce-2ed7-3545-7fc934353a3d',  -- Ром
    'f85b08e6-4cf7-bf05-8f7e-76322d16b777'   -- Глинтвейн
  );

-- Kitchen categories → workshop 00000000-0000-0000-0000-000000005001 (Кухня)
UPDATE products
SET workshop_id = '00000000-0000-0000-0000-000000005001'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND type = 'dish'
  AND workshop_id IS NULL
  AND category_id IN (
    '0af742ae-27a3-1fc1-cf9f-dafb492eaf06',  -- Завтраки
    '0bbfef50-d8bb-5a90-0e2a-49d5c08df8a7',  -- Супы
    '24578517-e50f-5bc5-1b10-081415962bc7',  -- Фондю
    '2bf864e5-7956-3c2b-ec97-48082b524f0e',  -- Паста
    '6fadc6b1-2c82-ad44-964a-98f0fca806c1',  -- Закуски
    '75f6359b-6d70-0536-90eb-33863df408f9',  -- Банкетное меню
    '949a75ee-4352-8f78-0b6f-6d0c824a739e',  -- Хлеб
    'c90e5bff-a921-2e03-3cbf-41e1a8558b9b',  -- Бургеры
    'e15a0460-ab2d-f961-b07a-82537fbb943b',  -- Основные блюда
    'e36f3276-d4d8-8585-e385-93fb63faf345',  -- Стейки
    'eacecb3d-d2be-ef18-e17d-dd068b3d01dc',  -- Гарниры
    'f1b2b0fa-739d-33bc-0f98-740809ccdc2f'   -- Салаты
  );

-- "Top screen" category (service items) — manual assignment
-- Вода для гостей, Мини бар, Добавки бар → Бар
UPDATE products
SET workshop_id = '00000000-0000-0000-0000-000000005002'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND type = 'dish'
  AND workshop_id IS NULL
  AND id IN (
    '12dd0c72-4671-5cd8-b7da-98389426555c',  -- Вода для гостей
    '1afe238c-a186-0e67-9e9d-d39b8c4abe8a',  -- Мини бар в дома
    'ba6fbcf2-1f2b-909a-e5f9-b9c5fe635c92'   -- Добавки бар
  );

-- Бой посуды, Добавки, Персонал → Кухня
UPDATE products
SET workshop_id = '00000000-0000-0000-0000-000000005001'
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND type = 'dish'
  AND workshop_id IS NULL
  AND id IN (
    '1b4182a4-6b08-de8c-21f6-c0a2236991f0',  -- Бой посуды
    '2a282418-43ba-4155-2773-748bfe3b0561',  -- Добавки
    '82c55340-bd07-2a9a-a6cc-6ce377f958f2'   -- Персонал
  );

-- Verify: should return 0 rows
SELECT id, name, category_id FROM products
WHERE venue_id = '00000000-0000-0000-0000-000000000010'
  AND type = 'dish'
  AND workshop_id IS NULL;

-- ── Re-process open dead letters now that workshop_id is fixed ──
DO $$
DECLARE
  dl RECORD;
  res jsonb;
BEGIN
  FOR dl IN
    SELECT idempotency_key, order_id, payload
    FROM pos_consumption_dead_letters
    WHERE status = 'open'
      AND venue_id = '00000000-0000-0000-0000-000000000010'
  LOOP
    -- Call the RPC with the original payload
    res := pos_finalize_order_stock(
      p_venue_id    := (dl.payload->>'venueId')::uuid,
      p_order_id    := dl.order_id,
      p_occurred_at := (dl.payload->>'occurredAt')::timestamptz,
      p_lines       := (dl.payload->'lines')::jsonb,
      p_shift_id    := NULLIF(dl.payload->>'shiftId', '')::uuid,
      p_strict_insufficient := true
    );

    IF (res->>'ok')::boolean THEN
      UPDATE pos_consumption_dead_letters
      SET status = 'resolved', resolved_at = now()
      WHERE idempotency_key = dl.idempotency_key;
      RAISE NOTICE 'Re-processed: % → ok', dl.idempotency_key;
    ELSE
      RAISE WARNING 'Still failing: % → %', dl.idempotency_key, res->>'error';
    END IF;
  END LOOP;
END $$;

-- Final check: should be 0 open dead letters
SELECT idempotency_key, status, last_error FROM pos_consumption_dead_letters
WHERE status = 'open';
