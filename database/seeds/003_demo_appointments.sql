-- T006: citas de ejemplo (FR-012 Sprint 2 / FR-017 del spec; CA-10 heredado).
-- Idempotente: claves únicas sobre (vehicle_id, date, time) + ON DUPLICATE KEY UPDATE.
-- Usa CURDATE() para que las citas programadas siempre sean futuras o de hoy.

INSERT INTO appointments (client_id, vehicle_id, appointment_date, appointment_time, reason, status, cancellation_reason, created_by) VALUES
  (1, 1, CURDATE(), '10:00:00', 'Revisión de frenos delanteros', 'PROGRAMADA', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (2, 3, CURDATE(), '12:00:00', 'Mantenimiento de 60,000 km', 'PROGRAMADA', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (1, 2, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00:00', 'Revisión de aire acondicionado', 'PROGRAMADA', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (3, 4, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '11:00:00', 'Cambio de aceite y filtros', 'COMPLETADA', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (2, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '16:00:00', 'Alineación (el cliente reprogramó)', 'CANCELADA', 'El cliente reprogramó la visita para la próxima semana.', (SELECT id FROM users WHERE username = 'recepcion'))
ON DUPLICATE KEY UPDATE reason = VALUES(reason);
