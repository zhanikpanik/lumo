-- Date-shift helper for demo: makes the latest order fall on today (or any target date).
-- Shifts ALL venue timestamps forward/backward to keep relative spacing intact.
-- Run: SELECT demo_shift_dates(p_venue_id, '2026-06-20'::date);
CREATE OR REPLACE FUNCTION demo_shift_dates(
  p_venue_id uuid,
  p_target_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_order timestamptz;
  v_shift interval;
  v_msg text := '';
BEGIN
  -- Find latest order timestamp for this venue
  SELECT max(opened_at) INTO v_max_order FROM orders WHERE venue_id = p_venue_id;
  IF v_max_order IS NULL THEN
    RETURN 'no orders found for venue';
  END IF;

  -- Calculate shift: target_date 23:59:59 minus max_order
  v_shift := (p_target_date::timestamptz + time '23:59:59') - v_max_order;
  
  IF v_shift = interval '0' THEN
    RETURN 'dates already aligned to ' || p_target_date::text;
  END IF;

  -- Shift all timestamp columns in all relevant tables
  UPDATE orders SET opened_at = opened_at + v_shift, closed_at = closed_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'orders, ';
  
  UPDATE shifts SET opened_at = opened_at + v_shift, closed_at = closed_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'shifts, ';
  
  UPDATE payments SET created_at = created_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'payments, ';
  
  UPDATE cash_movements SET occurred_at = occurred_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'cash_movements, ';
  
  UPDATE order_events SET occurred_at = occurred_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'order_events, ';
  
  UPDATE warehouse_deliveries SET delivery_date = delivery_date + v_shift, created_at = created_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'deliveries, ';
  
  UPDATE warehouse_write_offs SET write_off_date = write_off_date + v_shift, created_at = created_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'writeoffs, ';
  
  UPDATE warehouse_inventory_sessions SET conducted_at = conducted_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'inventory, ';
  
  UPDATE cash_transactions SET transaction_at = transaction_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'cash_transactions, ';
  
  UPDATE supply_documents SET created_at = created_at + v_shift WHERE venue_id = p_venue_id;
  v_msg := v_msg || 'supply_docs';
  
  RETURN 'shifted by ' || v_shift::text || ' → ' || p_target_date::text || ' (updated: ' || v_msg || ')';
END;
$$;
