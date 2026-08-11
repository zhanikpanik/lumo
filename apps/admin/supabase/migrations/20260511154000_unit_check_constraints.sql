-- P0: strict unit validation
-- Canonical unit dictionary: г, кг, мл, л, шт

ALTER TABLE modifiers
  ADD COLUMN IF NOT EXISTS ingredient_id uuid REFERENCES products(id);
ALTER TABLE modifiers
  ADD COLUMN IF NOT EXISTS quantity numeric(10,3);
ALTER TABLE modifiers
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'мл';

-- Normalize recipe_items.unit
UPDATE recipe_items
SET unit = CASE
  WHEN unit IS NULL OR btrim(unit) = '' THEN 'г'
  WHEN lower(btrim(unit)) IN ('г', 'гр', 'gram', 'grams', 'g') THEN 'г'
  WHEN lower(btrim(unit)) IN ('кг', 'kg', 'kilo', 'kilogram', 'kilograms') THEN 'кг'
  WHEN lower(btrim(unit)) IN ('мл', 'ml', 'milliliter', 'milliliters') THEN 'мл'
  WHEN lower(btrim(unit)) IN ('л', 'l', 'liter', 'liters') THEN 'л'
  WHEN lower(btrim(unit)) IN ('шт', 'pc', 'pcs', 'piece', 'pieces') THEN 'шт'
  ELSE 'г'
END;

-- Normalize modifiers.unit
UPDATE modifiers
SET unit = CASE
  WHEN unit IS NULL OR btrim(unit) = '' THEN 'мл'
  WHEN lower(btrim(unit)) IN ('г', 'гр', 'gram', 'grams', 'g') THEN 'г'
  WHEN lower(btrim(unit)) IN ('кг', 'kg', 'kilo', 'kilogram', 'kilograms') THEN 'кг'
  WHEN lower(btrim(unit)) IN ('мл', 'ml', 'milliliter', 'milliliters') THEN 'мл'
  WHEN lower(btrim(unit)) IN ('л', 'l', 'liter', 'liters') THEN 'л'
  WHEN lower(btrim(unit)) IN ('шт', 'pc', 'pcs', 'piece', 'pieces') THEN 'шт'
  ELSE 'мл'
END;

-- Normalize stock_items.unit
UPDATE stock_items
SET unit = CASE
  WHEN unit IS NULL OR btrim(unit) = '' THEN 'шт'
  WHEN lower(btrim(unit)) IN ('г', 'гр', 'gram', 'grams', 'g') THEN 'г'
  WHEN lower(btrim(unit)) IN ('кг', 'kg', 'kilo', 'kilogram', 'kilograms') THEN 'кг'
  WHEN lower(btrim(unit)) IN ('мл', 'ml', 'milliliter', 'milliliters') THEN 'мл'
  WHEN lower(btrim(unit)) IN ('л', 'l', 'liter', 'liters') THEN 'л'
  WHEN lower(btrim(unit)) IN ('шт', 'pc', 'pcs', 'piece', 'pieces') THEN 'шт'
  ELSE 'шт'
END;

-- Normalize inventory_movements.unit
UPDATE inventory_movements
SET unit = CASE
  WHEN unit IS NULL OR btrim(unit) = '' THEN 'г'
  WHEN lower(btrim(unit)) IN ('г', 'гр', 'gram', 'grams', 'g') THEN 'г'
  WHEN lower(btrim(unit)) IN ('кг', 'kg', 'kilo', 'kilogram', 'kilograms') THEN 'кг'
  WHEN lower(btrim(unit)) IN ('мл', 'ml', 'milliliter', 'milliliters') THEN 'мл'
  WHEN lower(btrim(unit)) IN ('л', 'l', 'liter', 'liters') THEN 'л'
  WHEN lower(btrim(unit)) IN ('шт', 'pc', 'pcs', 'piece', 'pieces') THEN 'шт'
  ELSE 'г'
END;

ALTER TABLE recipe_items
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN unit SET DEFAULT 'г';

ALTER TABLE modifiers
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN unit SET DEFAULT 'мл';

ALTER TABLE stock_items
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN unit SET DEFAULT 'шт';

ALTER TABLE inventory_movements
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN unit SET DEFAULT 'г';

ALTER TABLE recipe_items
  DROP CONSTRAINT IF EXISTS recipe_items_unit_allowed_chk;
ALTER TABLE recipe_items
  ADD CONSTRAINT recipe_items_unit_allowed_chk
  CHECK (unit IN ('г', 'кг', 'мл', 'л', 'шт'));

ALTER TABLE modifiers
  DROP CONSTRAINT IF EXISTS modifiers_unit_allowed_chk;
ALTER TABLE modifiers
  ADD CONSTRAINT modifiers_unit_allowed_chk
  CHECK (unit IN ('г', 'кг', 'мл', 'л', 'шт'));

ALTER TABLE stock_items
  DROP CONSTRAINT IF EXISTS stock_items_unit_allowed_chk;
ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_unit_allowed_chk
  CHECK (unit IN ('г', 'кг', 'мл', 'л', 'шт'));

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_unit_allowed_chk;
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_unit_allowed_chk
  CHECK (unit IN ('г', 'кг', 'мл', 'л', 'шт'));
