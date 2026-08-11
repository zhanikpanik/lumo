-- Order event log: immutable audit trail of every action on an order.
-- POS (Expo) writes item_added/item_removed/precheck_printed.
-- POS RPCs write paid/refunded/cancelled.
-- Backfill creates item_added for historical order_items.

-- 1) Enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'order_event_action'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE order_event_action AS ENUM (
      'item_added',
      'item_removed',
      'precheck_printed',
      'paid',
      'cancelled',
      'refunded'
    );
  END IF;
END
$$;

-- 2) Table
CREATE TABLE IF NOT EXISTS order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  action      order_event_action not null,
  product_id  uuid references products(id),
  product_name text,
  quantity    numeric,
  unit_price  numeric,
  occurred_at timestamptz not null default now(),
  venue_id    uuid not null references venues(id)
);

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_order_events_order
  ON order_events(order_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_order_events_venue
  ON order_events(venue_id, occurred_at);

-- 4) RLS (dev mode: open access)
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_events' AND policyname = 'Allow all reads'
  ) THEN
    CREATE POLICY "Allow all reads" ON order_events FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_events' AND policyname = 'Allow all inserts'
  ) THEN
    CREATE POLICY "Allow all inserts" ON order_events FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_events' AND policyname = 'Allow all updates'
  ) THEN
    CREATE POLICY "Allow all updates" ON order_events FOR UPDATE USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_events' AND policyname = 'Allow all deletes'
  ) THEN
    CREATE POLICY "Allow all deletes" ON order_events FOR DELETE USING (true);
  END IF;
END
$$;

-- 5) Backfill: item_added events for existing order_items
INSERT INTO order_events (order_id, action, product_id, product_name, quantity, unit_price, occurred_at, venue_id)
SELECT
  oi.order_id,
  'item_added',
  oi.product_id,
  oi.product_name,
  oi.quantity::numeric,
  oi.product_price,
  COALESCE(o.opened_at, now()),
  o.venue_id
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
ON CONFLICT DO NOTHING;

-- 6) Backfill: paid events for orders that were paid
INSERT INTO order_events (order_id, action, product_id, product_name, quantity, unit_price, occurred_at, venue_id)
SELECT
  o.id,
  'paid',
  NULL,
  NULL,
  NULL,
  NULL,
  COALESCE(o.closed_at, o.opened_at, now()),
  o.venue_id
FROM orders o
WHERE o.status = 'paid'
ON CONFLICT DO NOTHING;

-- 7) Backfill: cancelled events for cancelled orders
INSERT INTO order_events (order_id, action, product_id, product_name, quantity, unit_price, occurred_at, venue_id)
SELECT
  o.id,
  'cancelled',
  NULL,
  NULL,
  NULL,
  NULL,
  COALESCE(o.closed_at, o.opened_at, now()),
  o.venue_id
FROM orders o
WHERE o.status = 'cancelled'
ON CONFLICT DO NOTHING;
