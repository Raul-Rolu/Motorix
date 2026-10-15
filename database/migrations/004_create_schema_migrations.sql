-- T006 (complemento): registro de migraciones aplicadas.
-- El runner apply-migrations.mjs también la crea de forma idempotente antes de
-- aplicar los scripts; este archivo garantiza que el esquema sea completo.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
