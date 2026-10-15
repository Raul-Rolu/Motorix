-- T028 (Sprint 3, US3/US4): mantenimientos de ejemplo (FR-017, CA-2, CA-7).
-- Sobre los vehículos de los seeds 002/004. Incluye uno vencido por fecha
-- (2025-06-15), otro vencido por kilometraje (58000 km con 60200 km reales
-- en el vehículo 2), dos futuros y uno cancelado (que no debe aparecer en
-- la lista de próximos, aclaración Q4). Idempotente: IDs fijos +
-- ON DUPLICATE KEY UPDATE. El cumplimiento es manual (aclaración Q1).

INSERT INTO maintenance_plans
  (id, vehicle_id, description, target_date, target_mileage, status, cancellation_reason, created_by) VALUES
  (1, 3, 'Cambio de aceite y filtros', '2025-06-15', NULL, 'PENDING', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (2, 2, 'Cambio de balatas delanteras', NULL, 58000, 'PENDING', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (3, 1, 'Revisión de suspensión', '2027-03-01', 52000, 'PENDING', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (4, 4, 'Cambio de correa de distribución', '2027-06-30', 45000, 'PENDING', NULL, (SELECT id FROM users WHERE username = 'recepcion')),
  (5, 2, 'Balanceo y alineación', '2026-12-20', NULL, 'CANCELLED', 'El cliente vendió el vehículo.', (SELECT id FROM users WHERE username = 'recepcion'))
ON DUPLICATE KEY UPDATE description = VALUES(description);
