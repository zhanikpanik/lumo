-- Modifier groups for coffee shop
INSERT INTO modifier_groups (id, venue_id, name, is_required, max_select) VALUES
('00000000-0000-0000-0000-000000006001', '00000000-0000-0000-0000-000000000010', 'Молоко', false, 1),
('00000000-0000-0000-0000-000000006002', '00000000-0000-0000-0000-000000000010', 'Сироп', false, 0),
('00000000-0000-0000-0000-000000006003', '00000000-0000-0000-0000-000000000010', 'Доп. опции', false, 0);

-- Молоко modifiers
INSERT INTO modifiers (modifier_group_id, name, price, sort_order) VALUES
('00000000-0000-0000-0000-000000006001', 'Обычное', 0, 1),
('00000000-0000-0000-0000-000000006001', 'Овсяное', 30, 2),
('00000000-0000-0000-0000-000000006001', 'Кокосовое', 40, 3),
('00000000-0000-0000-0000-000000006001', 'Безлактозное', 30, 4);

-- Сироп modifiers
INSERT INTO modifiers (modifier_group_id, name, price, sort_order) VALUES
('00000000-0000-0000-0000-000000006002', 'Ваниль', 20, 1),
('00000000-0000-0000-0000-000000006002', 'Карамель', 20, 2),
('00000000-0000-0000-0000-000000006002', 'Лаванда', 25, 3),
('00000000-0000-0000-0000-000000006002', 'Кокос', 20, 4);

-- Доп. опции modifiers
INSERT INTO modifiers (modifier_group_id, name, price, sort_order) VALUES
('00000000-0000-0000-0000-000000006003', 'Доп. шот', 40, 1),
('00000000-0000-0000-0000-000000006003', 'Взбитые сливки', 30, 2),
('00000000-0000-0000-0000-000000006003', 'Без сахара', 0, 3);

-- Link modifier groups to coffee products
-- Капучино, Латте, Американо get Молоко + Сироп + Доп. опции
INSERT INTO product_modifier_groups (product_id, modifier_group_id)
SELECT p.id, '00000000-0000-0000-0000-000000006001'
FROM products p JOIN categories c ON p.category_id = c.id
WHERE c.name = 'Кофе' AND p.type = 'dish';

INSERT INTO product_modifier_groups (product_id, modifier_group_id)
SELECT p.id, '00000000-0000-0000-0000-000000006002'
FROM products p JOIN categories c ON p.category_id = c.id
WHERE c.name = 'Кофе' AND p.type = 'dish';

INSERT INTO product_modifier_groups (product_id, modifier_group_id)
SELECT p.id, '00000000-0000-0000-0000-000000006003'
FROM products p JOIN categories c ON p.category_id = c.id
WHERE c.name = 'Кофе' AND p.type = 'dish';

-- Mark coffee products as having modifiers
UPDATE products SET has_modifiers = true
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Кофе')
AND type = 'dish';
