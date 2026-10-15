-- T067: datos de ejemplo del taller (FR-012, CA-10).
-- Clientes y vehículos de demostración para que la interfaz muestre información
-- al arrancar, sin capturarlos a mano. Idempotente: puede re-ejecutarse sin
-- duplicar registros. Los vehículos usan placas únicas como clave natural.

INSERT INTO clients (id, full_name, phone, email, notes, active) VALUES
  (1, 'María López Hernández', '5512345678', 'maria.lopez@ejemplo.com', 'Cliente frecuente del taller', 1),
  (2, 'Juan Carlos Ramírez', '5523456789', 'jc.ramirez@ejemplo.com', NULL, 1),
  (3, 'Ana Sofía Mendoza', '5534567890', NULL, 'Prefiere ser contactada por teléfono', 1)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO vehicles (client_id, plates, brand, model, year, color, notes) VALUES
  (1, 'ABC-123-A', 'Nissan', 'Versa', 2019, 'Plata', 'Mantenimiento cada 5,000 km'),
  (1, 'DEF-456-B', 'Mazda', 'CX-5', 2021, 'Blanco', NULL),
  (2, 'GHI-789-C', 'Chevrolet', 'Aveo', 2017, 'Rojo', 'Frenos revisados en el sprint 1'),
  (3, 'JKL-012-D', 'Toyota', 'Corolla', 2020, 'Negro', NULL)
ON DUPLICATE KEY UPDATE brand = VALUES(brand);
