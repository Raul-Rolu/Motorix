-- T054: tabla de vehículos (Sprint 1, US5/US6).
-- RN-1: un vehículo NUNCA existe sin propietario (client_id NOT NULL con FK).
-- Placas únicas; año con rango razonable (MySQL 8+ respeta los CHECK).

CREATE TABLE IF NOT EXISTS vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  plates VARCHAR(20) NOT NULL UNIQUE,
  brand VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  color VARCHAR(30) NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicles_client FOREIGN KEY (client_id) REFERENCES clients (id),
  CONSTRAINT ck_vehicles_year CHECK (year >= 1900 AND year <= 2127)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_vehicles_client ON vehicles (client_id);
