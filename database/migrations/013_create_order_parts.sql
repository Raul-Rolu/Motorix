-- T045 (Sprint 3, US7): refacciones usadas en una orden de servicio.
-- RN-6: cada línea se registra junto con su salida (OUT) atómica de
-- inventario; la devolución posterior genera un IN nuevo y esta línea se
-- elimina, conservando siempre el OUT original (research D5).

CREATE TABLE IF NOT EXISTS order_parts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  part_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_op_order FOREIGN KEY (order_id) REFERENCES service_orders (id),
  CONSTRAINT fk_op_part FOREIGN KEY (part_id) REFERENCES parts (id),
  CONSTRAINT fk_op_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_op_order ON order_parts (order_id, part_id);
