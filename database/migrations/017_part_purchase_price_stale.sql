-- 006-complemento-precios-compra, T003 (Fase 2): categoría, marca y precio de
-- compra de las refacciones, límite de precios y estado STALE de los pagos
-- (FR-001, FR-002, FR-003, FR-008; research D1). Migración aditiva: no se
-- editan las migraciones 001–016.
--
-- Solo toca `parts` y `payments`. NO toca `order_services`, `order_labor` ni
-- `order_entries`: sin llaves únicas, sin limpieza ni borrado de duplicados
-- (la idempotencia del seed 004 se resuelve con IDs fijos en el propio seed).

-- 1) parts: categoría (lista fija, NULL = sin clasificar), marca (texto libre
--    de hasta 50 caracteres) y precio de compra (NULL = pendiente de captura;
--    dato exclusivo de ADMIN). Los CHECK fijan los límites del CA-2:
--    precios <= 999,999.99. `ck_part_sale_price_max` refuerza la columna
--    `sale_price` creada en la 016 sin editarla.
ALTER TABLE parts
  ADD COLUMN category ENUM(
    'FRENOS', 'MOTOR', 'SUSPENSION', 'ELECTRICO', 'TRANSMISION',
    'CLIMA', 'NEUMATICOS', 'LUBRICANTES', 'OTRO'
  ) NULL DEFAULT NULL,
  ADD COLUMN brand VARCHAR(50) NULL DEFAULT NULL,
  ADD COLUMN purchase_price DECIMAL(10,2) NULL DEFAULT NULL,
  ADD CONSTRAINT ck_part_purchase_price
    CHECK (purchase_price >= 0 AND purchase_price <= 999999.99),
  ADD CONSTRAINT ck_part_sale_price_max CHECK (sale_price <= 999999.99);

-- 2) payments: estado STALE (cobro de Mercado Pago desfasado: su importe ya no
--    coincide con el saldo pendiente de la orden). Se agrega AL FINAL de la
--    lista para que MySQL solo extienda el metadato sin reescribir filas.
ALTER TABLE payments
  MODIFY status ENUM('PENDING', 'COMPLETED', 'EXPIRED', 'STALE')
    NOT NULL DEFAULT 'COMPLETED';
