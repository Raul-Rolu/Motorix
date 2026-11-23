-- 007-notificaciones-internas, T004 (FR-003, FR-015, FR-020, CA-15):
-- Migración aditiva del Sprint 6 (no modifica las migraciones 001–017).
--   1) service_orders.status_changed_at: fecha del ÚLTIMO CAMBIO DE ESTADO de
--      la orden (la usa el aviso de «orden detenida»). Solo la actualiza
--      orderModel.setStatus; las demás ediciones no la tocan.
--   2) Relleno de las órdenes existentes con su updated_at actual. La
--      asignación explícita updated_at = updated_at es OBLIGATORIA: updated_at
--      se define con ON UPDATE CURRENT_TIMESTAMP y, sin ella, el relleno movería
--      la fecha de última modificación de todas las órdenes a «ahora».
--   3) notification_reads: lectura de avisos por usuario (el único estado que
--      se guarda de un aviso; los avisos se calculan al consultar, RN-10).
--   4) client_notices: constancia de que alguien avisó a un cliente por un
--      hecho concreto (orden, cita o mantenimiento); un hecho se avisa una
--      sola vez.

-- 1) Fecha del último cambio de estado de la orden.
ALTER TABLE service_orders
  ADD COLUMN status_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_orders_status_changed ON service_orders (status, status_changed_at);

-- 2) Relleno de las órdenes existentes (sin alterar updated_at).
UPDATE service_orders SET status_changed_at = updated_at, updated_at = updated_at;

-- 3) Lectura de avisos por usuario.
CREATE TABLE IF NOT EXISTS notification_reads (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  notification_key VARCHAR(80) NOT NULL,
  read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT uq_notification_read UNIQUE (user_id, notification_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Avisos registrados a clientes. fact_id no lleva llave foránea: es una
-- referencia polimórfica (orden, cita o plan de mantenimiento según notice_type).
CREATE TABLE IF NOT EXISTS client_notices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  notice_type ENUM('ORDEN_TERMINADA','CITA_MANANA','MANTENIMIENTO') NOT NULL,
  fact_id INT UNSIGNED NOT NULL,
  note VARCHAR(255) NULL,
  notified_by INT UNSIGNED NOT NULL,
  notified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_client_notices_client FOREIGN KEY (client_id) REFERENCES clients (id),
  CONSTRAINT fk_client_notices_user FOREIGN KEY (notified_by) REFERENCES users (id),
  CONSTRAINT uq_client_notice_fact UNIQUE (notice_type, fact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_client_notices_client ON client_notices (client_id);
