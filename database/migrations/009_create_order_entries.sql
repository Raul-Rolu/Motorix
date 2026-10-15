-- T005: entradas fechadas de la orden (Sprint 2, US5/US7; Clarificación 5).
-- Diagnósticos, observaciones y recomendaciones como historial inmutable
-- (sin borrado) con autor y fecha.

CREATE TABLE IF NOT EXISTS order_entries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  entry_type ENUM('DIAGNOSTIC','OBSERVATION','RECOMMENDATION') NOT NULL,
  content TEXT NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_entries_order FOREIGN KEY (order_id) REFERENCES service_orders (id),
  CONSTRAINT fk_order_entries_author FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_order_entries_order ON order_entries (order_id, created_at);
