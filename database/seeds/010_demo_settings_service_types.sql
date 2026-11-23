-- 008-configuracion-seguridad-reportes, T048 (bloque P1; FR-029, CA-12): datos de
-- ejemplo de configuración, catálogo de servicios y una orden entregada con su
-- ticket (con instantánea del taller) para mostrar el «Próximo servicio».
--
-- Requiere las migraciones 019 a 021 (orden obligatorio: migraciones → seeds →
-- servidor). Idempotente y NUNCA pisa lo que el usuario haya cambiado: todas las
-- sentencias usan ON DUPLICATE KEY UPDATE con una asignación que no modifica la
-- fila (equivale a «insertar si falta»); no se reinicia ningún dato de trabajo.
--
-- IDs: las tablas NUEVAS (settings, service_types) usan IDs normales desde 1; las
-- tablas que ya existían (service_orders, order_services, order_labor, payments y
-- tickets) usan IDs altos desde 9001 para no chocar con datos del usuario (el
-- AUTO_INCREMENT de esas tablas pasa a 9002 en la base donde se siembra).

-- 1) Configuración inicial: los mismos valores de respaldo del sistema. Si el
-- administrador ya cambió una clave, se conserva su valor.
INSERT INTO settings (setting_key, setting_value) VALUES
  ('shop.name', 'Motorix'),
  ('shop.address', 'Av. Taller 123, Col. Centro'),
  ('shop.phone', '555-000-0000'),
  ('maintenance.margin_days', '30'),
  ('maintenance.margin_km', '1000'),
  ('orders.stalled_days', '3'),
  ('session.inactivity_minutes', '30')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- 2) Catálogo de tipos de servicio con su intervalo (RN-12). Si ya existe un tipo
-- con el mismo id o el mismo nombre (clave única), no se toca.
INSERT INTO service_types (id, name, interval_days, interval_km, active) VALUES
  (1, 'Cambio de aceite', 180, 5000, 1),
  (2, 'Afinación', 365, 10000, 1),
  (3, 'Revisión de frenos', 180, NULL, 1),
  (4, 'Rotación de neumáticos', NULL, 10000, 1)
ON DUPLICATE KEY UPDATE id = id;

-- 3) Orden entregada (vehículo JKL-012-D de la cliente 3) con una línea de
-- servicio con tipo «Cambio de aceite», mano de obra, pago en efectivo por el
-- total y su ticket CON instantánea del taller: el ticket muestra «Próximo
-- servicio» (180 días y 5,000 km). Total: 650.00 + 300.00 = 950.00.
INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, created_at, status_changed_at) VALUES
  (9001, 3, (SELECT id FROM vehicles WHERE plates = 'JKL-012-D'), (SELECT id FROM users WHERE username = 'mecanico'), 'ENTREGADO', NULL, 31200, 0, 'Cambio de aceite y revisión general', NULL, NULL, (SELECT id FROM users WHERE username = 'recepcion'), DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY))
ON DUPLICATE KEY UPDATE id = id;

-- La línea de servicio toma el tipo por nombre (no por id) por si el catálogo del
-- usuario ya tenía ese tipo con otro id.
INSERT INTO order_services (id, order_id, description, amount, service_type_id) VALUES
  (9001, 9001, 'Cambio de aceite sintético y filtro', 650.00, (SELECT id FROM service_types WHERE name = 'Cambio de aceite'))
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO order_labor (id, order_id, description, amount) VALUES
  (9001, 9001, 'Mano de obra general', 300.00)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO payments
  (id, order_id, method, amount, status, external_reference, created_by, created_at) VALUES
  (9001, 9001, 'CASH', 950.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), DATE_SUB(NOW(), INTERVAL 1 DAY))
ON DUPLICATE KEY UPDATE id = id;

-- Ticket con instantánea (shop_*): como los tickets emitidos desde este sprint.
INSERT INTO tickets
  (id, order_id, folio, issued_by, issued_at, shop_name, shop_address, shop_phone) VALUES
  (9001, 9001, CONCAT('TCK-', YEAR(CURDATE()), '-9001'), (SELECT id FROM users WHERE username = 'recepcion'), DATE_SUB(NOW(), INTERVAL 1 DAY), 'Motorix', 'Av. Taller 123, Col. Centro', '555-000-0000')
ON DUPLICATE KEY UPDATE id = id;
