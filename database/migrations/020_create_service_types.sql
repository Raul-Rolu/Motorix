-- 008-configuracion-seguridad-reportes, T006 (bloque P1; FR-006, FR-007, RN-12):
-- catálogo de tipos de servicio con intervalo en días y/o kilómetros y la
-- columna opcional `order_services.service_type_id`. Migración aditiva (no
-- modifica 001–019).
--
-- - El nombre es único sin distinguir mayúsculas (colación utf8mb4_unicode_ci).
-- - Al menos un intervalo y ambos positivos (CHECK): no hay valores universales.
-- - Un tipo usado nunca se borra: no hay ON DELETE CASCADE ni ruta de borrado;
--   solo se desactiva (`active`).
-- - Las líneas de servicio existentes quedan con service_type_id en NULL y no
--   proponen próximo mantenimiento.

CREATE TABLE IF NOT EXISTS service_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  interval_days INT UNSIGNED NULL,
  interval_km INT UNSIGNED NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_service_types_name UNIQUE (name),
  CONSTRAINT ck_service_types_interval CHECK (interval_days IS NOT NULL OR interval_km IS NOT NULL),
  CONSTRAINT ck_service_types_days CHECK (interval_days IS NULL OR interval_days > 0),
  CONSTRAINT ck_service_types_km CHECK (interval_km IS NULL OR interval_km > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_services
  ADD COLUMN service_type_id INT UNSIGNED NULL,
  ADD CONSTRAINT fk_order_services_type FOREIGN KEY (service_type_id) REFERENCES service_types (id);

CREATE INDEX idx_order_services_type ON order_services (service_type_id);
