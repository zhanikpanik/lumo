-- Idempotency для платежей: защищаем POS от двойной записи при повторных
-- нажатиях, сетевых ретраях и offline-рекавери. Ключ генерится на клиенте;
-- уникальность гарантируется в пределах venue.

-- 1. Добавляем колонку nullable, чтобы не сломать существующие insert'ы.
alter table public.payments
  add column if not exists idempotency_key text;

-- 2. Backfill для исторических строк: используем id как стабильный ключ.
--    Гарантировано уникален (PK), поэтому unique index ниже не упадёт.
update public.payments
   set idempotency_key = id::text
 where idempotency_key is null;

-- 3. После backfill — делаем колонку обязательной.
alter table public.payments
  alter column idempotency_key set not null;

-- 4. Уникальность ключа в пределах venue. POS использует ключ вида
--    "{order_id}:{method}:{attempt_id}" — повторный insert с тем же
--    ключом упадёт с SQLSTATE 23505 и обрабатывается клиентом как
--    «оплата уже прошла, продолжаем флоу».
create unique index if not exists payments_idempotency_key_venue_uidx
  on public.payments (venue_id, idempotency_key);
