-- 008-configuracion-seguridad-reportes, T060 (bloque P2; FR-011, FR-013, CA-20,
-- CA-21): bitácora de acciones sensibles. Migración aditiva (no modifica 001–021).
--
-- Solo se inserta y se consulta: la aplicación no expone ninguna operación para
-- editar ni borrar entradas, y no se purga automáticamente. `user_id` es nulo
-- cuando el inicio de sesión fallido no corresponde a una cuenta existente.
-- `detail` lo arma una función pura (server/utils/audit-detail.js) y NUNCA guarda
-- contraseñas, hashes, tokens, datos de tarjeta ni el importe del precio de compra.

CREATE TABLE IF NOT EXISTS audit_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id INT UNSIGNED NULL,
  detail VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_log_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices de los filtros de la consulta (fecha, usuario y acción).
CREATE INDEX idx_audit_created ON audit_log (created_at);
CREATE INDEX idx_audit_user ON audit_log (user_id, created_at);
CREATE INDEX idx_audit_action ON audit_log (action, created_at);
