-- T042 (Sprint 3, US5/US6/US8): refacciones de ejemplo (FR-017, CA-7).
-- Incluye una con stock por debajo del mínimo (FRN-PAS-220: 2 <= 5),
-- otra justo en el mínimo (BUJ-IR-001: 8 <= 8, también alerta) y las
-- demás por encima. El stock de cada refacción coincide con el acumulado
-- de sus movimientos IN (SC-004). Idempotente: IDs fijos +
-- ON DUPLICATE KEY UPDATE.

INSERT INTO parts (id, name, code, stock, min_stock, is_active) VALUES
  (1, 'Filtro de aceite', 'FLT-OIL-010', 12, 4, 1),
  (2, 'Pastillas de freno delanteras', 'FRN-PAS-220', 2, 5, 1),
  (3, 'Aceite sintético 5W30 (litro)', 'LUB-0530-1L', 38, 10, 1),
  (4, 'Bujía de iridio', 'BUJ-IR-001', 8, 8, 1),
  (5, 'Correa de distribución', 'COR-DIS-004', 1, 2, 1),
  (6, 'Filtro de aire (versión obsoleta)', 'FLT-AIR-000', 3, 1, 0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO inventory_movements (id, part_id, movement_type, quantity, reason, created_by) VALUES
  (1, 1, 'IN', 12, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (2, 2, 'IN', 2, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (3, 3, 'IN', 40, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (4, 4, 'IN', 8, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (5, 5, 'IN', 1, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (6, 6, 'IN', 3, 'Stock inicial', (SELECT id FROM users WHERE username = 'admin')),
  (7, 3, 'ADJUSTMENT', -2, 'Conteo cíclico: faltante de 2 litros', (SELECT id FROM users WHERE username = 'admin'))
ON DUPLICATE KEY UPDATE reason = VALUES(reason);
