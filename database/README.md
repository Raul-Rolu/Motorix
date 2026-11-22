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

### Migraciones

- `001_create_users.sql` — usuarios, roles y sesiones.
- `002_create_clients.sql` — clientes.
- `003_create_vehicles.sql` — vehículos.
- `004_create_schema_migrations.sql` — registro de migraciones aplicadas.
- `005_create_appointments.sql` — citas.
- `006_create_service_orders.sql` — órdenes de servicio.
- `007_create_order_services.sql` — partidas de servicios de la orden.
- `008_create_order_labor.sql` — partidas de mano de obra.
- `009_create_order_entries.sql` — entradas/notas de diagnóstico de la orden.
- `010_create_parts.sql` — refacciones e inventario.
- `011_create_inventory_movements.sql` — movimientos de inventario.
- `012_create_maintenance_plans.sql` — planes de mantenimiento.
- `013_create_order_parts.sql` — refacciones usadas en la orden.
- `014_create_payments.sql` — pagos y cobros digitales.
- `015_create_tickets.sql` — tickets de servicio.
- `016_add_part_prices.sql` — **005-precio-venta-refacciones (FR-015)**: agrega
  `parts.sale_price` (precio de venta) y `order_parts.unit_price` (precio
  congelado por línea). No toca las migraciones 001–015.

### Seeds

- `001_initial_accounts.sql` — cuentas `admin`, `recepcion` y `mecanico`.
- `002_demo_clients_vehicles.sql` — clientes y vehículos de ejemplo.
- `003_demo_appointments.sql` — citas de ejemplo.
- `004_demo_service_orders.sql` — órdenes, servicios y mano de obra.
- `005_demo_parts.sql` — refacciones y movimientos de inventario.
- `006_demo_maintenances.sql` — mantenimientos de ejemplo.
- `007_demo_payments_tickets.sql` — pagos y tickets de ejemplo.
- `008_demo_part_prices.sql` — **005-precio-venta-refacciones (FR-015, CA-20)**:
  precios de venta de las 6 refacciones existentes, una refacción activa sin
  precio (filtro de pendientes) y los usos con precio congelado de la orden 2.
  Idempotente, con stock en valores absolutos.

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
