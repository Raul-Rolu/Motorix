-- T032 (Sprint 3, US5/US6/US8): tabla de refacciones del inventario.
-- FR-008: nombre, código único, stock inicial y stock mínimo.
-- El `stock` NO es editable directamente: solo cambia con movimientos
-- atómicos (FR-013, research D4). Baja lógica con `is_active` (FR-010).

CREATE TABLE IF NOT EXISTS parts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  min_stock INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_part_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
