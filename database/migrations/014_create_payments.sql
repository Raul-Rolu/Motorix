-- T003 (Sprint 4, US1): pagos de una orden de servicio (FR-001, FR-002, FR-006).
-- RN-13: todo pago pertenece a una orden; ON DELETE RESTRICT evita pagos
-- huérfanos. Inmutable: los pagos no se editan ni se eliminan; solo cambian
-- su estado (PENDING → COMPLETED / EXPIRED, research D1). Nunca se guardan
-- datos de tarjeta ni credenciales (RN-14); external_reference es solo el
-- identificador de la preferencia creada ante el proveedor (research D8).

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  method ENUM('CASH','CARD','TRANSFER','MERCADO_PAGO') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('PENDING','COMPLETED','EXPIRED') NOT NULL DEFAULT 'COMPLETED',
  external_reference VARCHAR(64) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES service_orders (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_payments_order ON payments (order_id, created_at);
CREATE INDEX idx_payments_status ON payments (status, created_at);
