-- T033 (Sprint 3, US5/US7): movimientos de inventario.
-- FR-009/FR-014: IN y OUT con cantidad > 0; ADJUSTMENT con signo y ≠ 0.
-- El stock resultante SIEMPRE es el acumulado de movimientos (SC-004).
-- Las salidas por uso en una orden conservan `order_id` (RN-6, research D5):
-- la devolución posterior genera un IN nuevo, nunca borra el OUT original.

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  part_id INT UNSIGNED NOT NULL,
  movement_type ENUM('IN','OUT','ADJUSTMENT') NOT NULL,
  quantity INT NOT NULL,
  order_id INT UNSIGNED NULL,
  reason VARCHAR(255) NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_part FOREIGN KEY (part_id) REFERENCES parts (id),
  CONSTRAINT fk_mov_order FOREIGN KEY (order_id) REFERENCES service_orders (id),
  CONSTRAINT fk_mov_creator FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT ck_mov_quantity CHECK (quantity <> 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_mov_part ON inventory_movements (part_id, created_at);
