# Base de datos de Motorix (MVP local)

Scripts SQL versionados para crear y recrear la base de datos **local** de MySQL
durante los cuatro sprints del MVP. Los archivos físicos de MySQL no se versionan
(Principio III de la constitución).

## Estructura

- `migrations/` — scripts numerados e inmutables que crean o ajustan el esquema.
  Cada cambio de esquema se agrega como un **nuevo** script numerado; nunca se
  editan scripts de sprints ya aplicados.
- `seeds/` — datos iniciales idempotentes: cuentas del MVP (`admin`, `recepcion`,
  `mecanico`) con contraseñas hasheadas, más clientes y vehículos de ejemplo para
  que la interfaz muestre información al arrancar.
- `scripts/` — runners en Node.js (ES Modules) que aplican migraciones y seeds de
  forma idempotente.
- `data/` — (opcional) directorio de datos del servidor MySQL; está en
  `.gitignore` y nunca se versiona.

## Requisitos

- MySQL local instalado (instalación nativa, no Docker).
- Un usuario **dedicado** al proyecto, por ejemplo `motorix_app`, con permisos de
  lectura/escritura sobre las bases `motorix` (desarrollo) y `motorix_test`
  (pruebas). La aplicación NUNCA se conecta como `root`.
- Node.js LTS en el equipo (los runners reutilizan las dependencias de `server/`).

## Recrear la base desde cero

1. Crear las bases y el usuario dedicado en MySQL local:

   ```sql
   CREATE DATABASE IF NOT EXISTS motorix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE IF NOT EXISTS motorix_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER IF NOT EXISTS 'motorix_app'@'localhost' IDENTIFIED BY '<contraseña>';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, REFERENCES, INDEX, DROP
     ON motorix.* TO 'motorix_app'@'localhost';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, REFERENCES, INDEX, DROP
     ON motorix_test.* TO 'motorix_app'@'localhost';
   ```

2. Configurar el backend: copiar `server/.env.example` a `server/.env` y completar
   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `JWT_SECRET`.

3. Instalar dependencias del backend (si aún no están): `cd server && npm install`.

4. Aplicar el esquema y los datos iniciales:

   ```text
   node database/scripts/apply-migrations.mjs
   node database/scripts/apply-seeds.mjs
   ```

   Ambos scripts son idempotentes: pueden re-ejecutarse sin errores ni duplicados.

## Pruebas

Las pruebas de integración y contrato usan la base `motorix_test` recreada con las
mismas migraciones; nunca tocan la base principal `motorix`.

## Convenciones

- Motor InnoDB, codificación `utf8mb4` y llaves foráneas activas en todas las tablas.
- Nombres de tablas y campos en inglés (identificadores); comentarios y documentación
  en español.
- Las contraseñas de los seeds van hasheadas con bcrypt; nunca en texto plano.
