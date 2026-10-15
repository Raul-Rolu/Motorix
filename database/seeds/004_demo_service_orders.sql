-- T007: órdenes de ejemplo del Sprint 2 (FR-017 del spec; CA-10 heredado).
-- Cinco órdenes en distintos estados sobre los vehículos de ejemplo, con
-- servicios, mano de obra y entradas. Idempotente: IDs fijos +
-- ON DUPLICATE KEY UPDATE. El kilometraje crece por vehículo para cumplir RN-4.

INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by) VALUES
  (1, 1, 1, NULL, 'RECIBIDO', NULL, 45120, 0, 'Ruido al frenar', 'Cliente reporta vibración al frenar a alta velocidad', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (2, 2, 3, (SELECT id FROM users WHERE username = 'mecanico'), 'EN_REPARACION', NULL, 88300, 0, 'Mantenimiento de 60,000 km', NULL, NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (3, 1, 2, (SELECT id FROM users WHERE username = 'mecanico'), 'ESPERANDO_REFACCION', 'EN_REPARACION', 60200, 0, 'Revisión de aire acondicionado', 'Falta el compresor en el almacén', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (4, 3, 4, (SELECT id FROM users WHERE username = 'mecanico'), 'ENTREGADO', NULL, 30150, 0, 'Cambio de aceite y filtros', NULL, NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (5, 2, 1, NULL, 'CANCELADA', NULL, 45500, 0, 'Diagnóstico de falla eléctrica', NULL, 'El cliente prefirió ir a otro taller.', (SELECT id FROM users WHERE username = 'recepcion'))
ON DUPLICATE KEY UPDATE reason = VALUES(reason);

INSERT INTO order_services (order_id, description, amount) VALUES
  (2, 'Cambio de aceite y filtro de motor', 450.00),
  (2, 'Rotación de llantas', 150.00),
  (4, 'Cambio de aceite sintético y filtros', 600.00),
  (4, 'Limpieza de inyectores', 350.00)
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO order_labor (order_id, description, amount) VALUES
  (2, 'Mano de obra mantenimiento mayor', 500.00),
  (4, 'Mano de obra general', 400.00)
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO order_entries (order_id, entry_type, content, created_by) VALUES
  (2, 'DIAGNOSTIC', 'Nivel de aceite bajo y filtro saturado; sin fugas visibles.', (SELECT id FROM users WHERE username = 'mecanico')),
  (3, 'DIAGNOSTIC', 'El compresor del aire acondicionado no enciende; requiere refacción.', (SELECT id FROM users WHERE username = 'mecanico')),
  (4, 'DIAGNOSTIC', 'Aceite en mal estado y filtros obstruidos.', (SELECT id FROM users WHERE username = 'mecanico')),
  (4, 'OBSERVATION', 'Llantas con desgaste irregular en el eje delantero.', (SELECT id FROM users WHERE username = 'mecanico')),
  (4, 'RECOMMENDATION', 'Revisar alineación y balanceo en la próxima visita.', (SELECT id FROM users WHERE username = 'mecanico'))
ON DUPLICATE KEY UPDATE content = VALUES(content);
