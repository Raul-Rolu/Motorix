-- 005-precio-venta-refacciones, T002 (Fase 1) + complemento 006: precios de
-- venta, categoría, marca y precio de compra de ejemplo (FR-015, CA-20).
-- Complementa los seeds 001–007 sin editarlos.
-- Idempotente: IDs fijos + ON DUPLICATE KEY UPDATE SOLO sobre precios,
-- categoría y marca; el stock no se toca en ninguna re-ejecución (los valores
-- de stock del INSERT solo aplican si la fila es nueva) ni se reinician
-- datos de trabajo (corrección 006 sobre el hallazgo INC-03).
--
-- Contenido:
--   * Precio de venta para las 6 refacciones existentes (IDs 1–6).
--   * Las 7 refacciones de ejemplo reciben categoría, marca y precio de
--     compra (los mismos valores que el seed 005; precio de compra menor
--     que el de venta para no activar la advertencia del FR-004 en la demo).
--   * Refacción 7 (batería): conserva sale_price = NULL a propósito (demo
--     del filtro de pendientes de precio, FR-003); sin uso en ninguna orden.
--   * Los usos congelados de la orden 2 y sus movimientos viven en el
--     seed 005 (aquí ya no se fija el stock).

-- 1) Precios de venta, categoría, marca y precio de compra.
INSERT INTO parts
  (id, name, code, stock, min_stock, is_active, sale_price, category, brand, purchase_price) VALUES
  (1, 'Filtro de aceite', 'FLT-OIL-010', 11, 4, 1, 120.00, 'LUBRICANTES', 'Genérico', 78.50),
  (2, 'Pastillas de freno delanteras', 'FRN-PAS-220', 2, 5, 1, 450.00, 'FRENOS', 'Brembo', 310.00),
  (3, 'Aceite sintético 5W30 (litro)', 'LUB-0530-1L', 34, 10, 1, 180.00, 'LUBRICANTES', 'Mobil', 130.00),
  (4, 'Bujía de iridio', 'BUJ-IR-001', 8, 8, 1, 90.00, 'ELECTRICO', 'NGK', 55.00),
  (5, 'Correa de distribución', 'COR-DIS-004', 1, 2, 1, 350.00, 'MOTOR', 'Gates', 240.00),
  (6, 'Filtro de aire (versión obsoleta)', 'FLT-AIR-000', 3, 1, 0, 150.00, 'MOTOR', 'Genérico', 95.00),
  (7, 'Batería 12V 60Ah', 'BAT-12V-60', 5, 2, 1, NULL, 'ELECTRICO', 'Bosch', 620.00)
ON DUPLICATE KEY UPDATE
  sale_price = VALUES(sale_price),
  purchase_price = VALUES(purchase_price),
  category = VALUES(category),
  brand = VALUES(brand);
