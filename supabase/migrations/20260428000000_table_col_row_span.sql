-- Add col_span and row_span to tables for variable-size table rendering
alter table tables add column if not exists col_span int default 2;
alter table tables add column if not exists row_span int default 2;
