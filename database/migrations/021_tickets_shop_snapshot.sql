-- 008-configuracion-seguridad-reportes, T007 (bloque P1; FR-003): instantánea de
-- los datos del taller en cada ticket. Migración aditiva (no modifica 001–020).
--
-- Se llenan SOLO al emitir el ticket. Los tickets existentes quedan en NULL SIN
-- relleno (no se inventa un dato que nunca se capturó): al consultarse usan los
-- datos vigentes y no muestran «Próximo servicio». `shop_name IS NOT NULL` es el
-- marcador de «ticket con instantánea» (el nombre del taller es obligatorio).

ALTER TABLE tickets
  ADD COLUMN shop_name VARCHAR(100) NULL,
  ADD COLUMN shop_address VARCHAR(150) NULL,
  ADD COLUMN shop_phone VARCHAR(30) NULL;
