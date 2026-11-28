# Base de datos de Motorix

Scripts SQL versionados para crear y recrear la base de datos. En desarrollo y
pruebas se usa **MySQL local**; para el despliegue puede usarse una base alojada
en la nube, MySQL o compatible como TiDB, con TLS (mini-sprint 009, en curso). Los
archivos físicos de MySQL no se versionan (Principio III de la constitución).

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
- `019_create_settings.sql` — **008-configuracion-seguridad-reportes (FR-001)**:
  tabla clave-valor `settings` (datos del taller, márgenes de mantenimiento próximo,
  días de orden detenida y minutos de inactividad). No lleva datos: los inserta el
  seed 010 y, sin valores, el servidor usa los valores de respaldo.
- `020_create_service_types.sql` — **008 (FR-006, FR-007, RN-12)**: catálogo
  `service_types` (nombre único, intervalo en días y/o km con al menos uno, activo)
  y la columna opcional `order_services.service_type_id` (las líneas existentes
  quedan en `NULL`). Un tipo nunca se borra, solo se desactiva.
- `021_tickets_shop_snapshot.sql` — **008 (FR-003)**: columnas `shop_name`,
  `shop_address` y `shop_phone` de `tickets` (instantánea del taller al emitir).
  Los tickets existentes quedan en `NULL` **sin relleno**.
- `022_create_audit_log.sql` — **008 (FR-011, FR-013, CA-20)**: bitácora de acciones
  sensibles `audit_log` (usuario opcional, acción, entidad, detalle y fecha) con
  índices por fecha, usuario y acción. Solo se inserta y se consulta: la aplicación
  no edita ni borra entradas. No lleva datos.
- `023_create_terms.sql` — **008 (FR-019)**: versiones de los términos y condiciones
  con el aviso de privacidad (`terms_versions`, `version` única) y las
  aceptaciones (`terms_acceptances`, única por usuario y versión). No lleva
  datos: la versión 1 la inserta el seed 011. **Sin ninguna versión publicada no
  hay compuerta de aceptación.**

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

- `010_demo_settings_service_types.sql` — **008-configuracion-seguridad-reportes
  (FR-029, CA-12)**: los 7 ajustes de `settings` (con
  `ON DUPLICATE KEY UPDATE setting_key = setting_key`: **nunca pisa un valor que el
  administrador ya cambió**), 4 tipos de servicio («Cambio de aceite» 180 días y
  5,000 km, «Afinación», «Revisión de frenos» y «Rotación de neumáticos») y la
  orden `9001` ENTREGADO con una línea de servicio con tipo, mano de obra, un pago
  en efectivo por $950.00 y el ticket `TCK-AAAA-9001` **con instantánea del
  taller**, para mostrar «Próximo servicio». Idempotente: todas sus sentencias son
  «insertar si falta» y no reinician datos de trabajo.
- `011_demo_terms.sql` — **008 (FR-029, CA-12, CA-16)**: la versión 1 de los
  términos y del aviso de privacidad (**plantilla** en español, con la advertencia
  de que el taller debe revisarla) y cuatro entradas de bitácora de ejemplo con
  fechas relativas (su detalle termina en «(ejemplo)»). **No inserta aceptaciones**:
  al sembrarlo, cada cuenta ve la pantalla de aceptación en su siguiente inicio de
  sesión. Idempotente y respetuoso con lo que ya hiciste: la versión 1 se inserta
  **solo si no hay ninguna versión publicada** (si ya publicaste una, no se siembra
  otra ni se toca la tuya) y las entradas de ejemplo no se repiten ni usan ids
  fijos (en una base con bitácora real los ids 1–4 pueden estar ocupados).
  Se puede aplicar solo, sin volver a correr los demás seeds:
  `mysql -u <usuario> -p --default-character-set=utf8mb4 -D <base> -e "source database/seeds/011_demo_terms.sql"`.

- `012_demo_reports.sql` — **008 (FR-029, CA-12)**: datos para los cinco reportes.
  Siete órdenes con ids altos **9101–9107** (tres cerradas el mes anterior, tres el
  actual y una cancelada), con servicios con y sin tipo, mano de obra, 9 pagos, 10
  usos de refacciones y 20 movimientos de inventario, más el mecánico inactivo
  `mecanico2` (sin contraseña utilizable) y la refacción `DEM-SIN-COSTO`. Fechas
  relativas al día de la siembra. Cada orden se omite completa si su id ya existe y
  la existencia de las refacciones no cambia. Requiere los seeds 001, 002, 004, 005,
  008 y 010. **Omite sin error los usos cuyo código de refacción no existe**: en la
  base `motorix` del autor no existe `BAT-12V-60`, así que se omitió ese uso de la
  orden 9103 y quedaron 9 usos y 18 movimientos en vez de 10 y 20 (cambian solo las
  líneas de Refacciones y Rotación; ver `t144-escenario-sin-bateria.txt` en
  `docs/evidencias/sprint-7-configuracion/`). Para comprobar lo sembrado:
  `SELECT COUNT(*) FROM order_parts WHERE id BETWEEN 9101 AND 9110;` (esperado 10) y
  `SELECT COUNT(*) FROM inventory_movements WHERE id BETWEEN 9101 AND 9120;`
  (esperado 20).
  Se puede aplicar solo, sin volver a correr los demás seeds, con redirección de
  entrada (en cmd de Windows):
  `mysql -u <usuario> -p --default-character-set=utf8mb4 -D <base> < database\seeds
_demo_reports.sql`.
  Como el `AUTO_INCREMENT` de las tablas con ids 9101+ avanza, los registros nuevos de
  `inventory_movements`, `order_parts`, `payments`, `order_services` y `order_labor`
  continúan desde ahí (`service_orders` desde 9108). No agrega migración: el bloque
  P3 no necesitó la 024.

> **IDs de los datos de ejemplo.** Las tablas **nuevas** del Sprint 7 (`settings`,
> `service_types`, `audit_log`, `terms_versions` y `terms_acceptances`) siembran con
> IDs normales desde 1 (la versión 1 de los términos es el id 1): no hay datos del usuario con
> los que chocar. El seed 010 inserta además en tablas que **ya existían**
> (`service_orders`, `order_services`, `order_labor`, `payments` y `tickets`) y ahí
> usa IDs altos (9001) para no chocar con registros propios; a cambio, el
> `AUTO_INCREMENT` de esas tablas pasa a 9002 en la base donde se siembra (los
> registros nuevos continúan desde ahí). Los seeds anteriores (001–009) siguen con
> sus IDs fijos pequeños (por ejemplo, orden 6 y mantenimiento 6): si tu base ya
> tiene registros propios con esos IDs, el `ON DUPLICATE KEY UPDATE` solo cambia su
> descripción y el hecho de ejemplo no aparece como se describe. Usa una base sin
> datos propios para la demostración.
>
> Los seeds 003 a 009 fijan IDs de vehículos del 1 al 4: sobre una base de pruebas
> cuyos contadores ya avanzaron (por ejemplo, tras correr las pruebas de Jest) los
> seeds fallan por llave foránea; recrea la base o reinicia sus contadores.
> `docs/evidencias/sprint-7-configuracion/doble-corrida-seeds-p1.mjs --vaciar` lo
> hace **solo** sobre `motorix_test`.

### Orden obligatorio: migraciones → seeds → servidor

1. `node database/scripts/apply-migrations.mjs`
2. `node database/scripts/apply-seeds.mjs`
3. Arrancar el servidor.

El servidor del Sprint 6 escribe `status_changed_at` en cada cambio de estado de
una orden: si arranca **antes** de aplicar la migración 018, esos cambios fallan
por columna inexistente. Y el seed 004 ajustado se detiene si falta la columna, de
modo que los seeds 005 a 009 no se aplicarían.

El servidor del Sprint 7 (bloque P1) lee la tabla `settings` (la usan los tickets y
los avisos) y escribe las columnas de instantánea de `tickets`: si arranca
**antes** de aplicar las migraciones 019 a 021, emitir un ticket y consultar los
avisos fallan por tabla o columna inexistente, y el seed 010 se detiene en su
primera sentencia (de modo que no se aplicaría). Haz una copia de seguridad antes
de migrar una base con datos propios.

Los tickets emitidos antes de la migración 021 no tienen instantánea del taller:
muestran los datos vigentes de la configuración y no muestran «Próximo servicio».

El servidor del Sprint 7 (bloque P2) escribe en `audit_log` y lee las tablas de
términos en **cada** petición autenticada: si arranca **antes** de aplicar las
migraciones 022 y 023, las acciones sensibles no quedan registradas (el servidor lo
avisa al arrancar y sigue funcionando) y cualquier ruta autenticada falla por
tabla inexistente. Aplica las migraciones y los seeds **antes** de arrancar el
servidor.

### Efecto del seed 011 sobre los scripts de evidencia anteriores

Con la versión 1 de los términos sembrada y sin aceptar, la API responde
`403 TERMS_NOT_ACCEPTED` a todo lo demás, así que los scripts de evidencia de
sprints anteriores fallan hasta que las cuentas de ejemplo la acepten:

- `docs/evidencias/aseguramiento/quickstart-005.mjs` (Sprint 5) aborta con código 2
  y el mensaje «La API NO está conectada a motorix_test» (su marcador se consulta
  con `GET /api/parts`).
- `docs/evidencias/sprint-6-notificaciones/verificar-avisos-api.mjs` (Sprint 6)
  falla en todas sus verificaciones de avisos.

Para repetirlos, **acepta primero** los términos con las tres cuentas de ejemplo:
`POST /api/terms/accept` con `{ "termsVersionId": 1 }` (con el token de cada cuenta).
Los scripts del Sprint 7 (`verificar-p1-api.mjs` y `escenarios-p1-api.mjs`) lo hacen
solos con la bandera `--aceptar-terminos`. La comprobación está en
`docs/evidencias/sprint-7-configuracion/efecto-terminos-scripts-previos.txt`. Los
scripts anteriores **no se editaron**.

## Requisitos

- MySQL local instalado (instalación nativa, no Docker) para desarrollo y pruebas.
- Un usuario **dedicado** al proyecto, por ejemplo `motorix_app`, con permisos de
  lectura/escritura sobre las bases `motorix` (desarrollo) y `motorix_test`
  (pruebas). La aplicación, los scripts y las pruebas NUNCA se conectan como
  `root` ni con la cuenta administradora, tampoco en una base alojada.
- Node.js LTS en el equipo y las dependencias de `server/` instaladas
  (`npm ci` en `server/`) **antes** de usar los scripts, porque las reutilizan. En
  un clon limpio esto será suficiente al completar el tramo 1 del mini-sprint 009.

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

3. Instalar las dependencias del backend (si aún no están): `npm ci` dentro de
   `server/`.

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
