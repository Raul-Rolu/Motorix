-- 008-configuracion-seguridad-reportes, T005 (bloque P1; FR-001): tabla de
-- configuración clave-valor. Migración aditiva (no modifica 001–018).
--
-- Guarda los datos del taller (shop.*), los márgenes del aviso de «mantenimiento
-- próximo» (maintenance.*), los días de «orden detenida» (orders.stalled_days) y
-- los minutos de inactividad de la sesión (session.inactivity_minutes). Si falta
-- una clave, el servicio usa su valor de respaldo (server/utils/settings-defaults.js);
-- esta tabla no lleva datos: los inserta el seed 010.

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(50) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
