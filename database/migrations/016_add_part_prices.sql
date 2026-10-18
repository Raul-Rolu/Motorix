-- 005-precio-venta-refacciones, T001 (Fase 1): precio de venta en
-- refacciones y precio congelado por línea de uso (FR-001, FR-004).
-- `sale_price` NULL = pendiente de precio (FR-003/FR-005); 0 = obsequio
-- válido (research D1). `unit_price` es el precio congelado al momento de
-- agregar la refacción a la orden (FR-006, research D2) y su NULL marca la
-- orden con total incompleto (FR-008). No se editan las migraciones 001–015.

ALTER TABLE parts
  ADD COLUMN sale_price DECIMAL(10,2) NULL DEFAULT NULL,
  ADD CONSTRAINT ck_part_sale_price CHECK (sale_price >= 0);

ALTER TABLE order_parts
  ADD COLUMN unit_price DECIMAL(10,2) NULL DEFAULT NULL,
  ADD CONSTRAINT ck_op_unit_price CHECK (unit_price >= 0);
