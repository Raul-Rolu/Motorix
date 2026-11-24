-- 008-configuracion-seguridad-reportes, T061 (bloque P2; FR-019, CA-16 a CA-19):
-- versiones de los términos y condiciones con el aviso de privacidad y las
-- aceptaciones de los usuarios. Migración aditiva (no modifica 001–022).
--
-- - `version` la asigna el servidor (máximo + 1); la vigente es la de mayor número.
-- - Esta migración NO lleva datos: la versión 1 la inserta el seed 011. Sin ninguna
--   versión publicada no hay compuerta de aceptación (las instalaciones y pruebas
--   existentes siguen como antes).
-- - Una sola aceptación por usuario y versión (idempotente y segura ante
--   concurrencia). Las versiones y aceptaciones no se editan ni se borran desde la
--   aplicación.

CREATE TABLE IF NOT EXISTS terms_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version INT UNSIGNED NOT NULL,
  terms_text TEXT NOT NULL,
  privacy_text TEXT NOT NULL,
  published_by INT UNSIGNED NULL,
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_terms_version UNIQUE (version),
  CONSTRAINT fk_terms_versions_publisher FOREIGN KEY (published_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  terms_version_id INT UNSIGNED NOT NULL,
  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_terms_acceptance UNIQUE (user_id, terms_version_id),
  CONSTRAINT fk_terms_acceptances_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_terms_acceptances_version FOREIGN KEY (terms_version_id) REFERENCES terms_versions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
