-- T004 (Sprint 4, US3): tickets de servicio (FR-011, FR-012).
-- Un ticket por orden (UNIQUE en order_id): reutilizar el mismo folio al
-- regenerar evita duplicar comprobantes (research D4). El contenido NO se
-- persiste: se deriva al consultar desde la orden y sus pagos, sin duplicar
-- importes (FR-015, CA-6). Formato del folio: TCK-AAAA-NNNN.

CREATE TABLE IF NOT EXISTS tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  folio VARCHAR(16) NOT NULL,
  issued_by INT UNSIGNED NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tickets_order UNIQUE (order_id),
  CONSTRAINT uq_tickets_folio UNIQUE (folio),
  CONSTRAINT fk_tickets_order FOREIGN KEY (order_id) REFERENCES service_orders (id) ON DELETE RESTRICT,
  CONSTRAINT fk_tickets_issuer FOREIGN KEY (issued_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
