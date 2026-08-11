-- Add ingredient link and quantity to modifiers
ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS ingredient_id uuid REFERENCES products(id);
ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS quantity numeric(10,3);
ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS unit text DEFAULT 'мл';
