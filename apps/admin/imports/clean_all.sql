-- ═══ Clean ALL imported data (v3 — full cascade) ═══

BEGIN;

DELETE FROM order_item_modifiers;
DELETE FROM order_items;
DELETE FROM payments;
DELETE FROM orders WHERE venue_id = '00000000-0000-0000-0000-000000000010';
DELETE FROM recipe_items;
DELETE FROM warehouse_products;
DELETE FROM stock_items;
DELETE FROM inventory_movements;
DELETE FROM product_modifier_groups;
DELETE FROM modifiers;
DELETE FROM modifier_groups;
DELETE FROM supply_items;
DELETE FROM supply_documents;
DELETE FROM products WHERE venue_id = '00000000-0000-0000-0000-000000000010';
DELETE FROM categories WHERE venue_id = '00000000-0000-0000-0000-000000000010';

COMMIT;

SELECT 'categories' as tbl, count(*) FROM categories WHERE venue_id = '00000000-0000-0000-0000-000000000010'
UNION ALL SELECT 'products', count(*) FROM products WHERE venue_id = '00000000-0000-0000-0000-000000000010'
UNION ALL SELECT 'orders', count(*) FROM orders WHERE venue_id = '00000000-0000-0000-0000-000000000010'
UNION ALL SELECT 'order_items', count(*) FROM order_items
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'recipe_items', count(*) FROM recipe_items
UNION ALL SELECT 'stock_items', count(*) FROM stock_items
UNION ALL SELECT 'warehouse_products', count(*) FROM warehouse_products;
