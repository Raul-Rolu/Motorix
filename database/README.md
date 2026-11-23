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
- `017_part_purchase_price_stale.sql` — 006-complemento-precios-compra.
- `018_notifications_status_changed.sql` — **007-notificaciones-internas
  (FR-003, FR-015, FR-020)**: agrega `service_orders.status_changed_at` (fecha del
  último cambio de estado; la usa el aviso de «orden detenida» y solo la
  actualiza `orderModel.setStatus`), la rellena con `updated_at` **sin alterarlo**,
  y crea `notification_reads` (lectura de avisos por usuario) y `client_notices`
  (constancia de avisos a clientes, única por `(notice_type, fact_id)`).

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
- `004_demo_service_orders.sql` (ajuste del Sprint 6) — las órdenes traen
  `status_changed_at` explícito (la orden 3, detenida hace 5 días) y el
  `ON DUPLICATE KEY UPDATE` no lo toca, así que una segunda corrida no lo reinicia.
- `009_demo_notifications.sql` — **007-notificaciones-internas (CA-12)**: orden 6
  `TERMINADO` (hecho de «vehículo listo»), mantenimiento 6 próximo (vence en 10
  días) y un ajuste guardado de la fecha de la orden 3 para bases donde el seed 004
  ya corrió. Idempotente; no inserta filas en `notification_reads` ni
  `client_notices`. Con los seeds 001–009 hay al menos un aviso de cada tipo
  (vencido, próximo, cita del día, stock bajo y orden detenida).

> **Limitación de los datos de ejemplo.** Los seeds usan IDs fijos (por ejemplo,
> orden 6 y mantenimiento 6). Si tu base ya tiene registros propios con esos IDs,
> el `ON DUPLICATE KEY UPDATE` solo cambia su descripción y el hecho de ejemplo no
> aparece como se describe (los contadores de avisos también difieren). Usa una
> base sin datos propios para la demostración. Deuda técnica: IDs de demostración
> en un rango alto o claves naturales.

### Orden obligatorio: migraciones → seeds → servidor

1. `node database/scripts/apply-migrations.mjs`
2. `node database/scripts/apply-seeds.mjs`
3. Arrancar el servidor.

El servidor del Sprint 6 escribe `status_changed_at` en cada cambio de estado de
una orden: si arranca **antes** de aplicar la migración 018, esos cambios fallan
por columna inexistente. Y el seed 004 ajustado se detiene si falta la columna, de
modo que los seeds 005 a 009 no se aplicarían. Haz una copia de seguridad antes
de migrar una base con datos propios.

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
