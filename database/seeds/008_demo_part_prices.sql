-- 005-precio-venta-refacciones, T002 (Fase 1): precios de venta de
-- ejemplo (FR-015, CA-20). Complementa los seeds 001–007 sin editarlos.
-- Idempotente: IDs fijos + ON DUPLICATE KEY UPDATE; el stock se fija en
-- VALORES ABSOLUTOS que satisfacen stock = IN + OUT + ajustes (≥ 0), sin
-- depender del stock previo, de modo que el seed puede re-ejecutarse
-- (hallazgo INC-03 del análisis pre-implementación).
--
-- Contenido:
--   * Precio de venta para las 6 refacciones existentes (IDs 1–6).
--   * Refacción nueva activa SIN precio (ID 7): demo del filtro de
--     pendientes de precio (FR-003); sin uso en ninguna orden.
--   * Usos congelados en la orden 2 (EN_REPARACION, pagos parciales del
--     seed 007): filtro de aceite (1 × $120.00) y 4 litros de aceite
--     5W30 (4 × $180.00), con sus movimientos OUT. Stock absoluto:
--     parte 1 = 12 − 1 = 11; parte 3 = 38 − 4 = 34 (SC-004 intacto).

-- 1) Precios de venta de las refacciones existentes y alta de la nueva.
INSERT INTO parts (id, name, code, stock, min_stock, is_active, sale_price) VALUES
  (1, 'Filtro de aceite', 'FLT-OIL-010', 11, 4, 1, 120.00),
  (2, 'Pastillas de freno delanteras', 'FRN-PAS-220', 2, 5, 1, 450.00),
  (3, 'Aceite sintético 5W30 (litro)', 'LUB-0530-1L', 34, 10, 1, 180.00),
  (4, 'Bujía de iridio', 'BUJ-IR-001', 8, 8, 1, 90.00),
  (5, 'Correa de distribución', 'COR-DIS-004', 1, 2, 1, 350.00),
  (6, 'Filtro de aire (versión obsoleta)', 'FLT-AIR-000', 3, 1, 0, 150.00),
  (7, 'Batería 12V 60Ah', 'BAT-12V-60', 5, 2, 1, NULL)
ON DUPLICATE KEY UPDATE sale_price = VALUES(sale_price), stock = VALUES(stock);

-- 2) Usos de refacciones con precio congelado en la orden 2.
INSERT INTO order_parts (id, order_id, part_id, quantity, unit_price, created_by) VALUES
  (1, 2, 1, 1, 120.00, (SELECT id FROM users WHERE username = 'mecanico')),
  (2, 2, 3, 4, 180.00, (SELECT id FROM users WHERE username = 'mecanico'))
ON DUPLICATE KEY UPDATE unit_price = VALUES(unit_price), quantity = VALUES(quantity);

-- 3) Movimientos de inventario correspondientes (OUT por uso; IN de la
--    refacción nueva). El stock ya se fijó en valores absolutos arriba.
INSERT INTO inventory_movements (id, part_id, movement_type, quantity, order_id, reason, created_by) VALUES
  (8, 1, 'OUT', 1, 2, 'Uso en orden de servicio (mantenimiento 60,000 km)', (SELECT id FROM users WHERE username = 'mecanico')),
  (9, 3, 'OUT', 4, 2, 'Uso en orden de servicio (mantenimiento 60,000 km)', (SELECT id FROM users WHERE username = 'mecanico')),
  (10, 7, 'IN', 5, NULL, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin'))
ON DUPLICATE KEY UPDATE reason = VALUES(reason);
