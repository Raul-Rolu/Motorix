-- T005 (Sprint 4): pagos y tickets de ejemplo (FR-021, SC-009).
-- Sobre las órdenes de los seeds 004. Cubre los cuatro métodos y los tres
-- estados del pago: la orden 4 queda LIQUIDADA en efectivo, la orden 2
-- queda PARCIAL con transferencia + un cobro digital confirmado, y un cobro
-- digital antiguo (2026-10-08) que la expiración perezosa pasa a EXPIRED al
-- consultar (FR-009). Ticket sobre la orden 4. Idempotente: IDs fijos +
-- ON DUPLICATE KEY UPDATE. El ticket usa folio TCK-2026-0001 (research D4).

INSERT INTO payments
  (id, order_id, method, amount, status, external_reference, created_by, created_at) VALUES
  (1, 4, 'CASH', 1350.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), '2026-10-05 12:00:00'),
  (2, 2, 'TRANSFER', 500.00, 'COMPLETED', NULL, (SELECT id FROM users WHERE username = 'recepcion'), '2026-10-09 10:30:00'),
  (3, 2, 'MERCADO_PAGO', 300.00, 'COMPLETED', 'MP-DEMO-0003', (SELECT id FROM users WHERE username = 'recepcion'), '2026-10-09 17:45:00'),
  (4, 2, 'MERCADO_PAGO', 300.00, 'PENDING', 'MP-DEMO-0004', (SELECT id FROM users WHERE username = 'recepcion'), '2026-10-08 09:00:00')
ON DUPLICATE KEY UPDATE amount = VALUES(amount);

INSERT INTO tickets
  (id, order_id, folio, issued_by, issued_at) VALUES
  (1, 4, 'TCK-2026-0001', (SELECT id FROM users WHERE username = 'recepcion'), '2026-10-05 12:10:00')
ON DUPLICATE KEY UPDATE folio = VALUES(folio);
