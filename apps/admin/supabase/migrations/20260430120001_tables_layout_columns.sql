-- Align with admin floor plan sync (col_span, row_span, size for circle/square)
ALTER TABLE tables ADD COLUMN IF NOT EXISTS col_span INTEGER NOT NULL DEFAULT 2;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS row_span INTEGER NOT NULL DEFAULT 2;
