-- Warehouse-only transfers: workshop columns are legacy; stock RPC uses from_warehouse_id / to_warehouse_id.
ALTER TABLE public.warehouse_transfers
ALTER COLUMN from_workshop_id DROP NOT NULL,
ALTER COLUMN to_workshop_id DROP NOT NULL;
