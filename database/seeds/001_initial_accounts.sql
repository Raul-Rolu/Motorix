-- T022: cuentas iniciales del MVP (CA-10, FR-012).
-- Contraseñas del estándar local del proyecto, hasheadas con bcrypt (costo 10):
--   admin      -> Admin123
--   recepcion  -> Recepcion123
--   mecanico   -> Mecanico123
-- Solo aplican en entornos locales de demostración; al cambiarse deben cumplir
-- la política mínima (RN-17). Seed idempotente: no duplica registros.

INSERT INTO users (username, email, password_hash, full_name, role, active) VALUES
  ('admin', 'admin@motorix.local', '$2b$10$xC80YsClGOqGattydZDkouCB1XtOMPcrUy7jlMuLYDzgNOSHXsoOW', 'Administrador del Taller', 'ADMIN', 1),
  ('recepcion', 'recepcion@motorix.local', '$2b$10$vG/rOqXKJ.8ghjUBkk6CAuPAlTXSeNZtw3EBas3eu67fZ300uil8e', 'Recepción del Taller', 'RECEPTIONIST', 1),
  ('mecanico', 'mecanico@motorix.local', '$2b$10$lvUbXe4v7yiadkdmZq4TceVph658rBccVo5ofUhFM.XQABRY.Tb46', 'Mecánico del Taller', 'MECHANIC', 1)
ON DUPLICATE KEY UPDATE active = 1;
