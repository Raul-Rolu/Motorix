-- T003: servicios realizados por orden (Sprint 2, US5).
-- Descripción e importe; importe no negativo.

CREATE TABLE IF NOT EXISTS order_services (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_services_order FOREIGN KEY (order_id) REFERENCES service_orders (id),
  CONSTRAINT ck_order_services_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_order_services_order ON order_services (order_id);
