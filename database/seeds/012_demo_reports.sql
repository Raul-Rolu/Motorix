-- 008-configuracion-seguridad-reportes, T142 (bloque P3; FR-029, CA-12): datos de
-- ejemplo para que los cinco reportes (ingresos, servicios, productividad,
-- refacciones y rotación) tengan información al arrancar.
--
-- Requiere las migraciones 001–023 y los seeds 001, 002, 004, 005, 008 y 010
-- (orden obligatorio: migraciones → seeds → servidor). Se aplica con
-- `apply-seeds.mjs` o con `mysql ... < 012_demo_reports.sql`.
--
-- Contenido: siete órdenes con IDs ALTOS 9101–9107 (no 9002–9007, que pueden estar
-- ocupados por órdenes reales en la base principal):
--   * Mes ANTERIOR (cerradas):  9101 ENTREGADO (mecanico), 9102 ENTREGADO
--     (mecanico2), 9103 TERMINADO (sin asignar).
--   * Mes ACTUAL (cerradas):    9104 ENTREGADO (mecanico), 9105 TERMINADO
--     (mecanico2), 9106 ENTREGADO (sin asignar). 9107 está CANCELADA y NO cuenta en
--     ningún reporte.
--   * Líneas de servicio con tipo del catálogo y sin tipo, mano de obra, pagos
--     COMPLETED en ambos meses con los cuatro métodos (más un pago EXPIRED que no
--     suma), usos de refacciones con precio de venta y de compra, uno SIN precio
--     de venta (Batería, orden 9103) y uno SIN precio de compra (refacción nueva
--     `DEM-SIN-COSTO`, orden 9103), y los movimientos de inventario del uso.
--
-- Las fechas son RELATIVAS al día en que se siembra: el mes anterior cae siempre
-- dentro del mes anterior y el actual dentro del mes actual (sin fechas futuras;
-- al inicio de un mes las del mes actual se acumulan en su primer día).
--
-- Idempotente y NUNCA pisa lo que el usuario ya hizo:
--   * Cada orden se trata como una unidad: si su ID ya existe (la sembrada antes o
--     una orden real), se omite TODO lo suyo (servicios, mano de obra, usos,
--     pagos y movimientos) y no se modifica nada. Por eso lo que el usuario edite
--     o borre de una orden sembrada no regresa al volver a sembrar.
--   * La existencia (stock) de las refacciones de los seeds previos NO cambia: cada
--     uso lleva una entrada (IN) de reposición de la misma cantidad, de modo que la
--     existencia sigue siendo el acumulado de los movimientos (SC-004).
--   * `mecanico2` es un mecánico INACTIVO, sin contraseña utilizable (no puede
--     iniciar sesión); solo existe para que Productividad muestre dos mecánicos. Si
--     ya hay un usuario con ese nombre o correo, no se toca.
--   * Las refacciones se buscan por código; si falta alguna, solo se omite esa línea.
--
-- NOTA (omisión sin error): el seed NO falla si una refacción no existe: omite en
-- silencio los usos cuyo código no se encuentra, junto con su salida y su entrada
-- de inventario. Cada uso omitido resta 1 uso y 2 movimientos de los totales de
-- referencia (10 usos y 20 movimientos con las ocho refacciones). En la base
-- `motorix` del autor no existe `BAT-12V-60` (Batería, orden 9103): se omitió ese
-- uso y quedaron 9 usos y 18 movimientos. Efecto: Refacciones (Mes anterior) trae 4
-- líneas en vez de 5 y ninguna «sin precio»; Rotación no lista la batería; la
-- orden 9103 queda con total completo. Los totales de ventas, costo y margen no
-- cambian (esa línea nunca entraba en ellos) y Ingresos, Servicios y
-- Productividad tampoco. Para recuperarlo hay que dar de alta la refacción
-- (código `BAT-12V-60`, sin precio de venta) y sembrar con una orden 9103 nueva.

-- Inicio de los meses (hora local del servidor, la misma de los reportes).
SET @inicio_anterior = TIMESTAMP(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH));
SET @inicio_actual = TIMESTAMP(DATE_FORMAT(CURDATE(), '%Y-%m-01'));

-- Fecha de cierre de cada orden (también la de sus salidas de inventario).
SET @f9101 = @inicio_anterior + INTERVAL 4 DAY + INTERVAL 10 HOUR;
SET @f9102 = @inicio_anterior + INTERVAL 11 DAY + INTERVAL 15 HOUR;
SET @f9103 = @inicio_anterior + INTERVAL 19 DAY + INTERVAL 12 HOUR;
SET @f9104 = GREATEST(@inicio_actual, DATE_SUB(NOW(), INTERVAL 9 DAY));
SET @f9105 = GREATEST(@inicio_actual, DATE_SUB(NOW(), INTERVAL 5 DAY));
SET @f9106 = GREATEST(@inicio_actual, DATE_SUB(NOW(), INTERVAL 2 DAY));
SET @f9107 = GREATEST(@inicio_actual, DATE_SUB(NOW(), INTERVAL 3 DAY));

-- ¿Se siembra cada orden? Solo si su ID NO existe todavía.
SET @n9101 = (SELECT COUNT(*) = 0 FROM service_orders WHERE id = 9101);
SET @n9102 = (SELECT COUNT(*) = 0 FROM service_orders WHERE id = 9102);
SET @n9103 = (SELECT COUNT(*) = 0 FROM service_orders WHERE id = 9103);
SET @n9104 = (SELECT COUNT(*) = 0 FROM service_orders WHERE id = 9104);
SET @n9105 = (SELECT COUNT(*) = 0 FROM service_orders WHERE id = 9105);
SET @n9106 = (SELECT COUNT(*) = 0 FROM service_orders WHERE id = 9106);
SET @n9107 = (SELECT COUNT(*) = 0 FROM service_orders WHERE id = 9107);

-- 1) Segundo mecánico de ejemplo: INACTIVO y sin contraseña utilizable ('!' no es un
-- hash válido, así que ninguna contraseña lo satisface). Solo si no existe ya.
INSERT INTO users (username, email, password_hash, full_name, role, active)
SELECT 'mecanico2', 'mecanico2@motorix.local', '!', 'Mecánico de Apoyo (ejemplo)', 'MECHANIC', 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'mecanico2' OR email = 'mecanico2@motorix.local');

-- 2) Refacción sin precio de compra (con precio de venta, para no crear pendientes
-- de precio de venta). Pertenece a la orden 9103: existencia 3 = entrada de 5 − salida de 2.
INSERT INTO parts (name, code, stock, min_stock, is_active, sale_price, category, brand, purchase_price)
SELECT 'Refacción de ejemplo sin precio de compra', 'DEM-SIN-COSTO', 3, 2, 1, 95.00, 'OTRO', 'Genérico', NULL
FROM DUAL
WHERE @n9103 AND NOT EXISTS (SELECT 1 FROM parts WHERE code = 'DEM-SIN-COSTO');

-- ===========================================================================
-- 3) Órdenes
-- ===========================================================================
INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, created_at, status_changed_at)
SELECT 9101, 1, (SELECT id FROM vehicles WHERE plates = 'ABC-123-A'), (SELECT id FROM users WHERE username = 'mecanico'),
  'ENTREGADO', NULL, 46000, 0, 'Afinación y cambio de aceite', NULL, NULL,
  (SELECT id FROM users WHERE username = 'recepcion'), @f9101 - INTERVAL 2 DAY, @f9101
FROM DUAL WHERE @n9101
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, created_at, status_changed_at)
SELECT 9102, 2, (SELECT id FROM vehicles WHERE plates = 'GHI-789-C'), (SELECT id FROM users WHERE username = 'mecanico2'),
  'ENTREGADO', NULL, 89000, 0, 'Revisión de frenos y falla eléctrica', NULL, NULL,
  (SELECT id FROM users WHERE username = 'recepcion'), @f9102 - INTERVAL 2 DAY, @f9102
FROM DUAL WHERE @n9102
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, created_at, status_changed_at)
SELECT 9103, 3, (SELECT id FROM vehicles WHERE plates = 'JKL-012-D'), NULL,
  'TERMINADO', NULL, 31800, 0, 'Cambio de aceite y batería', NULL, NULL,
  (SELECT id FROM users WHERE username = 'recepcion'), @f9103 - INTERVAL 2 DAY, @f9103
FROM DUAL WHERE @n9103
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, created_at, status_changed_at)
SELECT 9104, 1, (SELECT id FROM vehicles WHERE plates = 'DEF-456-B'), (SELECT id FROM users WHERE username = 'mecanico'),
  'ENTREGADO', NULL, 61000, 0, 'Rotación de llantas y cambio de aceite', NULL, NULL,
  (SELECT id FROM users WHERE username = 'recepcion'), @f9104 - INTERVAL 1 DAY, @f9104
FROM DUAL WHERE @n9104
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, created_at, status_changed_at)
SELECT 9105, 2, (SELECT id FROM vehicles WHERE plates = 'GHI-789-C'), (SELECT id FROM users WHERE username = 'mecanico2'),
  'TERMINADO', NULL, 90000, 0, 'Afinación mayor', NULL, NULL,
  (SELECT id FROM users WHERE username = 'recepcion'), @f9105 - INTERVAL 1 DAY, @f9105
FROM DUAL WHERE @n9105
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, created_at, status_changed_at)
SELECT 9106, 3, (SELECT id FROM vehicles WHERE plates = 'JKL-012-D'), NULL,
  'ENTREGADO', NULL, 32500, 0, 'Cambio de aceite', NULL, NULL,
  (SELECT id FROM users WHERE username = 'recepcion'), @f9106 - INTERVAL 1 DAY, @f9106
FROM DUAL WHERE @n9106
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, created_at, status_changed_at)
SELECT 9107, 1, (SELECT id FROM vehicles WHERE plates = 'ABC-123-A'), NULL,
  'CANCELADA', NULL, 46500, 0, 'Ruido en la suspensión', NULL, 'El cliente decidió esperar a la siguiente visita.',
  (SELECT id FROM users WHERE username = 'recepcion'), @f9107 - INTERVAL 1 DAY, @f9107
FROM DUAL WHERE @n9107
ON DUPLICATE KEY UPDATE id = id;

-- ===========================================================================
-- 4) Líneas de servicio (el tipo se toma del catálogo por NOMBRE, no por id; NULL
-- si el catálogo no lo tiene o la línea no lleva tipo).
-- ===========================================================================
INSERT INTO order_services (id, order_id, description, amount, service_type_id, created_at)
SELECT 9101, 9101, 'Cambio de aceite sintético y filtro', 650.00, (SELECT id FROM service_types WHERE name = 'Cambio de aceite'), @f9101 - INTERVAL 1 DAY FROM DUAL WHERE @n9101
UNION ALL
SELECT 9102, 9101, 'Afinación mayor', 1200.50, (SELECT id FROM service_types WHERE name = 'Afinación'), @f9101 - INTERVAL 1 DAY FROM DUAL WHERE @n9101
UNION ALL
SELECT 9103, 9102, 'Revisión y ajuste de frenos', 480.00, (SELECT id FROM service_types WHERE name = 'Revisión de frenos'), @f9102 - INTERVAL 1 DAY FROM DUAL WHERE @n9102
UNION ALL
SELECT 9104, 9102, 'Diagnóstico eléctrico', 300.00, NULL, @f9102 - INTERVAL 1 DAY FROM DUAL WHERE @n9102
UNION ALL
SELECT 9105, 9103, 'Cambio de aceite y filtro', 550.00, (SELECT id FROM service_types WHERE name = 'Cambio de aceite'), @f9103 - INTERVAL 1 DAY FROM DUAL WHERE @n9103
UNION ALL
SELECT 9106, 9104, 'Rotación de neumáticos', 300.00, (SELECT id FROM service_types WHERE name = 'Rotación de neumáticos'), @f9104 FROM DUAL WHERE @n9104
UNION ALL
SELECT 9107, 9104, 'Cambio de aceite sintético', 700.00, (SELECT id FROM service_types WHERE name = 'Cambio de aceite'), @f9104 FROM DUAL WHERE @n9104
UNION ALL
SELECT 9108, 9105, 'Afinación', 950.00, (SELECT id FROM service_types WHERE name = 'Afinación'), @f9105 FROM DUAL WHERE @n9105
UNION ALL
SELECT 9109, 9105, 'Limpieza de sistema de inyección', 220.00, NULL, @f9105 FROM DUAL WHERE @n9105
UNION ALL
SELECT 9110, 9106, 'Cambio de aceite y filtro', 600.00, (SELECT id FROM service_types WHERE name = 'Cambio de aceite'), @f9106 FROM DUAL WHERE @n9106
UNION ALL
SELECT 9111, 9107, 'Diagnóstico de ruido en suspensión', 180.00, NULL, @f9107 FROM DUAL WHERE @n9107
ON DUPLICATE KEY UPDATE id = id;

-- ===========================================================================
-- 5) Mano de obra (la orden cancelada no lleva).
-- ===========================================================================
INSERT INTO order_labor (id, order_id, description, amount, created_at)
SELECT 9101, 9101, 'Mano de obra general', 350.00, @f9101 - INTERVAL 1 DAY FROM DUAL WHERE @n9101
UNION ALL
SELECT 9102, 9102, 'Mano de obra general', 250.00, @f9102 - INTERVAL 1 DAY FROM DUAL WHERE @n9102
UNION ALL
SELECT 9103, 9103, 'Mano de obra general', 200.00, @f9103 - INTERVAL 1 DAY FROM DUAL WHERE @n9103
UNION ALL
SELECT 9104, 9104, 'Mano de obra general', 280.00, @f9104 FROM DUAL WHERE @n9104
UNION ALL
SELECT 9105, 9105, 'Mano de obra general', 400.00, @f9105 FROM DUAL WHERE @n9105
UNION ALL
SELECT 9106, 9106, 'Mano de obra general', 150.00, @f9106 FROM DUAL WHERE @n9106
ON DUPLICATE KEY UPDATE id = id;

-- ===========================================================================
-- 6) Usos de refacciones con el precio de venta CONGELADO (NULL = sin precio, como
-- la Batería de la orden 9103). Las refacciones se buscan por código.
-- ===========================================================================
INSERT INTO order_parts (id, order_id, part_id, quantity, unit_price, created_by, created_at)
SELECT 9101, 9101, p.id, 1, 120.00, (SELECT id FROM users WHERE username = 'mecanico'), @f9101 - INTERVAL 1 HOUR FROM parts p WHERE p.code = 'FLT-OIL-010' AND @n9101
UNION ALL
SELECT 9102, 9101, p.id, 4, 180.00, (SELECT id FROM users WHERE username = 'mecanico'), @f9101 - INTERVAL 1 HOUR FROM parts p WHERE p.code = 'LUB-0530-1L' AND @n9101
UNION ALL
SELECT 9103, 9102, p.id, 1, 450.00, (SELECT id FROM users WHERE username = 'mecanico2'), @f9102 - INTERVAL 1 HOUR FROM parts p WHERE p.code = 'FRN-PAS-220' AND @n9102
UNION ALL
SELECT 9104, 9103, p.id, 2, 95.00, (SELECT id FROM users WHERE username = 'mecanico'), @f9103 - INTERVAL 1 HOUR FROM parts p WHERE p.code = 'DEM-SIN-COSTO' AND @n9103
UNION ALL
SELECT 9105, 9103, p.id, 1, NULL, (SELECT id FROM users WHERE username = 'mecanico'), @f9103 - INTERVAL 1 HOUR FROM parts p WHERE p.code = 'BAT-12V-60' AND @n9103
UNION ALL
SELECT 9106, 9104, p.id, 5, 180.00, (SELECT id FROM users WHERE username = 'mecanico'), @f9104 FROM parts p WHERE p.code = 'LUB-0530-1L' AND @n9104
UNION ALL
SELECT 9107, 9104, p.id, 4, 90.00, (SELECT id FROM users WHERE username = 'mecanico'), @f9104 FROM parts p WHERE p.code = 'BUJ-IR-001' AND @n9104
UNION ALL
SELECT 9108, 9105, p.id, 1, 350.00, (SELECT id FROM users WHERE username = 'mecanico2'), @f9105 FROM parts p WHERE p.code = 'COR-DIS-004' AND @n9105
UNION ALL
SELECT 9109, 9105, p.id, 1, 150.00, (SELECT id FROM users WHERE username = 'mecanico2'), @f9105 FROM parts p WHERE p.code = 'FLT-AIR-000' AND @n9105
UNION ALL
SELECT 9110, 9106, p.id, 2, 120.00, (SELECT id FROM users WHERE username = 'mecanico'), @f9106 FROM parts p WHERE p.code = 'FLT-OIL-010' AND @n9106
ON DUPLICATE KEY UPDATE id = id;

-- ===========================================================================
-- 7) Movimientos de inventario: la salida (OUT) de cada uso en la fecha de cierre de
-- su orden y una entrada (IN) de reposición de la misma cantidad dos horas antes,
-- de modo que la existencia de las refacciones NO cambia (SC-004). La refacción
-- nueva entra con 5 unidades (existencia 3 tras su salida de 2).
-- ===========================================================================
INSERT INTO inventory_movements (id, part_id, movement_type, quantity, order_id, reason, created_by, created_at)
SELECT 9101, p.id, 'OUT', 1, 9101, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico'), @f9101 FROM parts p WHERE p.code = 'FLT-OIL-010' AND @n9101
UNION ALL
SELECT 9102, p.id, 'OUT', 4, 9101, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico'), @f9101 FROM parts p WHERE p.code = 'LUB-0530-1L' AND @n9101
UNION ALL
SELECT 9103, p.id, 'OUT', 1, 9102, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico2'), @f9102 FROM parts p WHERE p.code = 'FRN-PAS-220' AND @n9102
UNION ALL
SELECT 9104, p.id, 'OUT', 2, 9103, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico'), @f9103 FROM parts p WHERE p.code = 'DEM-SIN-COSTO' AND @n9103
UNION ALL
SELECT 9105, p.id, 'OUT', 1, 9103, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico'), @f9103 FROM parts p WHERE p.code = 'BAT-12V-60' AND @n9103
UNION ALL
SELECT 9106, p.id, 'OUT', 5, 9104, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico'), @f9104 FROM parts p WHERE p.code = 'LUB-0530-1L' AND @n9104
UNION ALL
SELECT 9107, p.id, 'OUT', 4, 9104, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico'), @f9104 FROM parts p WHERE p.code = 'BUJ-IR-001' AND @n9104
UNION ALL
SELECT 9108, p.id, 'OUT', 1, 9105, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico2'), @f9105 FROM parts p WHERE p.code = 'COR-DIS-004' AND @n9105
UNION ALL
SELECT 9109, p.id, 'OUT', 1, 9105, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico2'), @f9105 FROM parts p WHERE p.code = 'FLT-AIR-000' AND @n9105
UNION ALL
SELECT 9110, p.id, 'OUT', 2, 9106, 'Uso en orden de servicio (ejemplo)', (SELECT id FROM users WHERE username = 'mecanico'), @f9106 FROM parts p WHERE p.code = 'FLT-OIL-010' AND @n9106
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO inventory_movements (id, part_id, movement_type, quantity, order_id, reason, created_by, created_at)
SELECT 9111, p.id, 'IN', 1, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), @f9101 - INTERVAL 2 HOUR FROM parts p WHERE p.code = 'FLT-OIL-010' AND @n9101
UNION ALL
SELECT 9112, p.id, 'IN', 4, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), @f9101 - INTERVAL 2 HOUR FROM parts p WHERE p.code = 'LUB-0530-1L' AND @n9101
UNION ALL
SELECT 9113, p.id, 'IN', 1, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), @f9102 - INTERVAL 2 HOUR FROM parts p WHERE p.code = 'FRN-PAS-220' AND @n9102
UNION ALL
SELECT 9114, p.id, 'IN', 5, NULL, 'Stock inicial (ejemplo)', (SELECT id FROM users WHERE username = 'admin'), @f9103 - INTERVAL 2 HOUR FROM parts p WHERE p.code = 'DEM-SIN-COSTO' AND @n9103
UNION ALL
SELECT 9115, p.id, 'IN', 1, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), @f9103 - INTERVAL 2 HOUR FROM parts p WHERE p.code = 'BAT-12V-60' AND @n9103
UNION ALL
SELECT 9116, p.id, 'IN', 5, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), GREATEST(@inicio_actual, @f9104 - INTERVAL 2 HOUR) FROM parts p WHERE p.code = 'LUB-0530-1L' AND @n9104
UNION ALL
SELECT 9117, p.id, 'IN', 4, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), GREATEST(@inicio_actual, @f9104 - INTERVAL 2 HOUR) FROM parts p WHERE p.code = 'BUJ-IR-001' AND @n9104
UNION ALL
SELECT 9118, p.id, 'IN', 1, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), GREATEST(@inicio_actual, @f9105 - INTERVAL 2 HOUR) FROM parts p WHERE p.code = 'COR-DIS-004' AND @n9105
UNION ALL
SELECT 9119, p.id, 'IN', 1, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), GREATEST(@inicio_actual, @f9105 - INTERVAL 2 HOUR) FROM parts p WHERE p.code = 'FLT-AIR-000' AND @n9105
UNION ALL
SELECT 9120, p.id, 'IN', 2, NULL, 'Reposición de ejemplo', (SELECT id FROM users WHERE username = 'admin'), GREATEST(@inicio_actual, @f9106 - INTERVAL 2 HOUR) FROM parts p WHERE p.code = 'FLT-OIL-010' AND @n9106
ON DUPLICATE KEY UPDATE id = id;

-- ===========================================================================
-- 8) Pagos (ninguna fecha en el futuro). Los COMPLETED suman en el reporte de
-- ingresos; el EXPIRED de la orden 9103 no. La orden cancelada no tiene pagos.
-- ===========================================================================
INSERT INTO payments (id, order_id, method, amount, status, external_reference, created_by, created_at)
SELECT 9101, 9101, 'CASH', 2000.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), @f9101 FROM DUAL WHERE @n9101
UNION ALL
SELECT 9102, 9101, 'TRANSFER', 1040.50, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), @f9101 + INTERVAL 1 DAY FROM DUAL WHERE @n9101
UNION ALL
SELECT 9103, 9102, 'CARD', 1480.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), @f9102 FROM DUAL WHERE @n9102
UNION ALL
SELECT 9104, 9103, 'MERCADO_PAGO', 400.00, 'COMPLETED', 'MP-DEMO-9104', (SELECT id FROM users WHERE username = 'recepcion'), @f9103 FROM DUAL WHERE @n9103
UNION ALL
SELECT 9105, 9103, 'MERCADO_PAGO', 300.00, 'EXPIRED', 'MP-DEMO-9105', (SELECT id FROM users WHERE username = 'recepcion'), @f9103 - INTERVAL 1 HOUR FROM DUAL WHERE @n9103
UNION ALL
SELECT 9106, 9104, 'CASH', 1000.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), LEAST(NOW(), @f9104 + INTERVAL 1 HOUR) FROM DUAL WHERE @n9104
UNION ALL
SELECT 9107, 9104, 'CARD', 1540.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), LEAST(NOW(), @f9104 + INTERVAL 3 DAY) FROM DUAL WHERE @n9104
UNION ALL
SELECT 9108, 9105, 'TRANSFER', 1200.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), LEAST(NOW(), @f9105 + INTERVAL 1 HOUR) FROM DUAL WHERE @n9105
UNION ALL
SELECT 9109, 9106, 'CASH', 990.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), LEAST(NOW(), @f9106 + INTERVAL 1 HOUR) FROM DUAL WHERE @n9106
ON DUPLICATE KEY UPDATE id = id;
