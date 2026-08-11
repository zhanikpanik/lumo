-- Add waiter to user_role enum (Postgres 15+)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'waiter';

-- Physical cash count when closing shift (optional until close)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS counted_cash numeric(10,2);
