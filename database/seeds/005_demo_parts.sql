-- T042 (Sprint 3, US5/US6/US8) + complemento 006: refacciones de ejemplo
-- (FR-017, CA-7) con categoría, marca y precio de compra (006, CA-9).
-- Incluye una con stock por debajo del mínimo (FRN-PAS-220: 2 <= 5),
-- otra justo en el mínimo (BUJ-IR-001: 8 <= 8, también alerta) y una
-- batería SIN precio de venta a propósito (demo del filtro de pendientes
-- de precio, FR-003 del spec 005). El stock de cada refacción coincide con
-- el acumulado de sus movimientos IN + OUT − ajustes (SC-004), porque
-- aquí se registran también los usos congelados de la orden 2 del spec 005
-- (el seed 008 solo fija precios, categoría y marca y no toca el stock).
-- Idempotente: IDs fijos + ON DUPLICATE KEY UPDATE sin tocar el stock.

INSERT INTO parts
  (id, name, code, stock, min_stock, is_active, category, brand, purchase_price) VALUES
  (1, 'Filtro de aceite', 'FLT-OIL-010', 11, 4, 1, 'LUBRICANTES', 'Genérico', 78.50),
  (2, 'Pastillas de freno delanteras', 'FRN-PAS-220', 2, 5, 1, 'FRENOS', 'Brembo', 310.00),
  (3, 'Aceite sintético 5W30 (litro)', 'LUB-0530-1L', 34, 10, 1, 'LUBRICANTES', 'Mobil', 130.00),
  (4, 'Bujía de iridio', 'BUJ-IR-001', 8, 8, 1, 'ELECTRICO', 'NGK', 55.00),
  (5, 'Correa de distribución', 'COR-DIS-004', 1, 2, 1, 'MOTOR', 'Gates', 240.00),
  (6, 'Filtro de aire (versión obsoleta)', 'FLT-AIR-000', 3, 1, 0, 'MOTOR', 'Genérico', 95.00),
  (7, 'Batería 12V 60Ah', 'BAT-12V-60', 5, 2, 1, 'ELECTRICO', 'Bosch', 620.00)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  brand = VALUES(brand),
  purchase_price = VALUES(purchase_price);

-- Usos de refacciones con precio congelado en la orden 2 (EN_REPARACION,
-- pagos parciales del seed 007): filtro de aceite (1 × $120.00) y 4 litros
-- de aceite 5W30 (4 × $180.00). Viven aquí para que los movimientos OUT
-- correspondientes queden registrados junto con su descuento de stock
-- (el seed 008 ya no fija valores absolutos de stock).
INSERT INTO order_parts (id, order_id, part_id, quantity, unit_price, created_by) VALUES
  (1, 2, 1, 1, 120.00, (SELECT id FROM users WHERE username = 'mecanico')),
  (2, 2, 3, 4, 180.00, (SELECT id FROM users WHERE username = 'mecanico'))
ON DUPLICATE KEY UPDATE unit_price = VALUES(unit_price), quantity = VALUES(quantity);

-- Movimientos: stock inicial (IN), ajuste de conteo cíclico, usos de la
-- orden 2 (OUT) y alta de la batería (IN 5). Stock absoluto resultante:
-- parte 1 = 12 − 1 = 11; parte 3 = 40 − 2 − 4 = 34; batería = 5 (SC-004).
INSERT INTO inventory_movements
  (id, part_id, movement_type, quantity, order_id, reason, created_by) VALUES
  (1, 1, 'IN', 12, NULL, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (2, 2, 'IN', 2, NULL, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (3, 3, 'IN', 40, NULL, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (4, 4, 'IN', 8, NULL, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (5, 5, 'IN', 1, NULL, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (6, 6, 'IN', 3, NULL, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (7, 3, 'ADJUSTMENT', -2, NULL, 'Conteo cíclico: faltante de 2 litros', (SELECT id FROM users WHERE username = 'admin')),
  (8, 1, 'OUT', 1, 2, 'Uso en orden de servicio (mantenimiento 60,000 km)', (SELECT id FROM users WHERE username = 'mecanico')),
  (9, 3, 'OUT', 4, 2, 'Uso en orden de servicio (mantenimiento 60,000 km)', (SELECT id FROM users WHERE username = 'mecanico')),
  (10, 7, 'IN', 5, NULL, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin'))
ON DUPLICATE KEY UPDATE reason = VALUES(reason);
