-- Clean slate: remove all orders and seed zones/tables
-- Admin will sync fresh tables via floor plan sync

-- Delete in FK order
delete from order_item_modifiers;
delete from order_items;
delete from payments;
delete from orders;
delete from tables;
delete from zones where venue_id = '00000000-0000-0000-0000-000000000010';
