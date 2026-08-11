-- Add comment field to delivery & write-off documents.
-- Change date columns to timestamptz to capture time.

ALTER TABLE warehouse_deliveries
  ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT '';

ALTER TABLE warehouse_deliveries
  ALTER COLUMN delivery_date TYPE TIMESTAMPTZ USING delivery_date::timestamptz;

ALTER TABLE warehouse_write_offs
  ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT '';

ALTER TABLE warehouse_write_offs
  ALTER COLUMN write_off_date TYPE TIMESTAMPTZ USING write_off_date::timestamptz;
