/** Rows returned by Supabase RPC `admin_inventory_period_movements`. */
export interface AdminInventoryPeriodMovementRow {
  product_id: string;
  consumption: number;
  incoming_delivery: number;
  writeoff_qty: number;
  transfer_net: number;
}
