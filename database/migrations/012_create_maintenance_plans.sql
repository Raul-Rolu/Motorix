-- T019 (Sprint 3, US3/US4): tabla de mantenimientos.
-- RN-11: umbrales por fecha y/o kilometraje (al menos uno; CHECK de tabla).
-- Aclaración Q1: cumplimiento y cancelación son acciones manuales;
-- "vencido" es una propiedad derivada (research D2), no un estado.
-- Aclaración Q2: un vehículo admite varios mantenimientos pendientes.

CREATE TABLE IF NOT EXISTS maintenance_plans (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  target_date DATE NULL,
  target_mileage INT UNSIGNED NULL,
  status ENUM('PENDING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  completed_at DATETIME NULL,
  completed_by INT UNSIGNED NULL,
  cancelled_at DATETIME NULL,
  cancellation_reason VARCHAR(255) NULL,
  cancelled_by INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_maint_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  CONSTRAINT fk_maint_completer FOREIGN KEY (completed_by) REFERENCES users (id),
  CONSTRAINT fk_maint_canceller FOREIGN KEY (cancelled_by) REFERENCES users (id),
  CONSTRAINT fk_maint_creator FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT ck_maint_threshold CHECK (target_date IS NOT NULL OR target_mileage IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_maint_vehicle ON maintenance_plans (vehicle_id, status);
CREATE INDEX idx_maint_status_date ON maintenance_plans (status, target_date);
