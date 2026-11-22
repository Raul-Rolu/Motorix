-- 007-notificaciones-internas, T069 (Sprint 6): datos de ejemplo de avisos (FR-016, CA-12).
-- Completa los casos que los seeds anteriores no cubren: una orden terminada sin
-- entregar (hecho de «vehículo listo» en Clientes por avisar) y un mantenimiento
-- próximo. El resto de los avisos ya sale de datos existentes: mantenimientos
-- vencidos (planes 1 y 2), citas de hoy y de mañana (seed 003), stock bajo
-- (refacciones 2, 4 y 5) y orden detenida (orden 3, ver seed 004).
-- Idempotente: IDs fijos y ON DUPLICATE KEY UPDATE solo sobre descripciones, de
-- modo que una segunda corrida no reinicia fechas ni datos de trabajo.
-- Sin filas en notification_reads ni client_notices: la demostración empieza con
-- todo no leído y toda la lista por avisar.
-- El aviso de «agotado» se cubre en las pruebas, no aquí (agregar una refacción
-- cambiaría las cifras de quickstart-005.mjs).

-- Orden 6: terminada hace 1 día, del cliente 3 y su vehículo 4 (cuyo último
-- kilometraje de ingreso es 30150: RN-4).
INSERT INTO service_orders
  (id, client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, mileage_correction, reason, notes, cancellation_reason, created_by, status_changed_at) VALUES
  (6, 3, 4, (SELECT id FROM users WHERE username = 'mecanico'), 'TERMINADO', 'EN_REPARACION', 30600, 0, 'Revisión de frenos', 'Trabajo terminado; pendiente avisar al cliente', NULL, (SELECT id FROM users WHERE username = 'recepcion'), DATE_SUB(NOW(), INTERVAL 1 DAY))
ON DUPLICATE KEY UPDATE reason = VALUES(reason);

-- Mantenimiento 6: próximo (vence dentro de 10 días) en el vehículo 1.
INSERT INTO maintenance_plans
  (id, vehicle_id, description, target_date, target_mileage, status, cancellation_reason, created_by) VALUES
  (6, 1, 'Cambio de filtros de aire y cabina', DATE_ADD(CURDATE(), INTERVAL 10 DAY), NULL, 'PENDING', NULL, (SELECT id FROM users WHERE username = 'recepcion'))
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Ajuste guardado para bases donde el seed 004 ya corrió antes de la migración
-- 018: la orden 3 quedó con una fecha de cambio de estado reciente (relleno de la
-- migración). Solo actúa mientras la orden siga en su estado de demostración y su
-- fecha sea reciente; tras aplicarse una vez la condición deja de cumplirse, y si
-- alguien la movió de estado no la toca.
UPDATE service_orders
SET status_changed_at = DATE_SUB(NOW(), INTERVAL 5 DAY), updated_at = updated_at
WHERE id = 3
  AND status = 'ESPERANDO_REFACCION'
  AND notes = 'Falta el compresor en el almacén'
  AND status_changed_at > DATE_SUB(NOW(), INTERVAL 3 DAY);
