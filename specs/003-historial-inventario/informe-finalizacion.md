# Informe de finalización: Sprint 3 — Historial, mantenimiento e inventario

**Fecha**: 2026-10-11
**Feature**: `specs/003-historial-inventario`
**Estado**: Sprint 3 completo (68/68 tareas)

## Resumen

Se implementaron las 8 historias de usuario del Sprint 3 sobre la base del Sprint 2
(Express + mysql2 sin ORM, Flutter con provider, permisos validados en servidor):

| Historia | Contenido | Estado |
|----------|-----------|--------|
| US1 | Historial de servicios del vehículo (`GET /api/vehicles/:id/history`, derivado de órdenes `TERMINADO`/`ENTREGADO`, RN-10) | Completa |
| US2 | Kilometraje por servicio con constancia de corrección (RN-3/RN-4) | Completa |
| US3 | Registro de mantenimientos con umbrales fecha/km (RN-11/RN-12), cumplimiento manual (Q1) y cancelación solo ADMIN con motivo (Q4) | Completa |
| US4 | Lista de próximos en orden de urgencia: vencidos primero, después por umbral más cercano (Q5, FR-007) | Completa |
| US5 | Refacciones con código único, stock inicial vía movimiento `IN`, edición de metadatos y ajustes con signo (RN-8 uniforme, Q3) | Completa |
| US6 | Búsqueda por nombre/código, auditoría de movimientos solo ADMIN (FR-009/FR-010) | Completa |
| US7 | Refacciones en orden: `OUT` atómico con `order_id`, devolución `IN` que conserva el `OUT` original (RN-6/RN-7/RN-8, research D4/D5) | Completa |
| US8 | Alerta de stock bajo `stock <= min_stock` (FR-015) | Completa |

## Artefactos entregados

- **Base de datos**: migraciones `010_create_parts.sql`, `011_create_inventory_movements.sql`,
  `012_create_maintenance_plans.sql` (CHECK de al menos un umbral) y `013_create_order_parts.sql`;
  seeds idempotentes `005_demo_parts.sql` y `006_demo_maintenances.sql`.
- **Backend** (13 endpoints nuevos): historial de vehículo; 4 de mantenimientos
  (`GET/POST /api/maintenances`, `PATCH /:id/complete`, `PATCH /:id/cancel`); 5 de inventario
  (`GET/POST /api/parts`, `PUT /api/parts/:id`, `POST/GET /api/parts/:id/movements`); y el bloque
  de refacciones de la orden (`POST/DELETE /api/orders/:id/parts` + `refacciones` en el detalle).
  Módulos nuevos: `maintenance-state.js` (vencimiento puro), `maintenance-service.js`,
  `part-service.js`, `models/maintenance.js`, `models/part.js`, `models/inventory.js`
  (transacción + `SELECT ... FOR UPDATE`), validadores y controladores/rutas asociados.
- **Catálogo de errores**: 11 códigos nuevos (p. ej. `PART_SIN_STOCK` con
  `details.stockDisponible`, `MAINTENANCE_NOT_MODIFIABLE`); `AppError` ahora admite `details`.
- **Flutter**: modelos (`vehicle_history`, `maintenance`, `part`, `order_part`), providers
  (`History`, `Maintenances`, `Parts`), pantallas (historial, alta/detalle de mantenimientos,
  lista de mantenimientos, inventario, formulario de refacciones) y secciones del menú
  "Mantenimientos" e "Inventario"; sección de "Refacciones usadas" en el detalle de la orden.

## Verificación ejecutada

- `flutter analyze`: sin issues.
- `flutter test`: 3/3 en verde.
- `npm.cmd test` completo (T064) contra `motorix_test`: **39 suites, 191/191 pruebas en verde**
  (unit + integración + contrato) con `--runInBand`, ya que todas las suites comparten la base
  de pruebas y sus limpiezas no son compatibles en paralelo.
- `node --check`: todos los JS nuevos/modificados del backend validados (T066).
- Revisión de seguridad (T065): sin secretos en el repositorio; `password_hash` solo en fixtures
  de prueba y modelo interno (los contratos verifican que nunca se filtre); errores 500 genéricos
  sin trazas de base de datos; todos los endpoints nuevos con `auth` + `requireRole` (RN-15) y
  reglas adicionales de negocio en el servicio (dueño de la orden, ADMIN para inventario).
- **Instalación desde cero**: se recreó `motorix` vacía y se aplicaron migraciones 001–013 con
  `apply-migrations.mjs` y seeds 001–006 con `apply-seeds.mjs`; los conteos de las 10 tablas
  quedaron como espera el quickstart.
- **Recorrido V1–V12 (T067)** contra el backend en ejecución con las cuentas seed
  (`admin`/`recepcion`/`mecanico`): **12/12 escenarios PASS** desde base limpia:
  historial (incluido 404 `VEHICLE_NOT_FOUND`), rechazo de kilometraje menor, registro con
  uno/dos umbrales y 422 `MAINTENANCE_INVALID_THRESHOLD` sin ninguno, lista con vencidos
  primero, alta/duplicado/permisos de inventario, `OUT` atómico, `PART_SIN_STOCK` con
  `details.stockDisponible`, devolución con historial `IN,OUT,OUT,IN` y stock restaurado,
  orden cerrada/ajena rechazadas, ajuste negativo imposible 422 sin modificar stock,
  `lowStock` al llegar al mínimo y ciclo completo de completar/cancelar mantenimientos.
- **Límite**: el escenario de interfaz (`flutter run` en dispositivo/emulador) no se ejecutó por
  no haber dispositivo disponible; la capa cliente está cubierta por `flutter analyze` y
  `flutter test`.

## Correcciones aplicadas durante la verificación (T064)

La primera ejecución completa de la suite (191 pruebas) destapó 14 fallos, resueltos así:

- **Backend (5)**: `part-service.crear` leía la respuesta con el pool fuera de la transacción
  (stock 0 pre-commit); `targetDate` llegaba como objeto `Date` de mysql2 y rompía
  `maintenance-state` (`daysLeft`/`isOverdue`); registrar sin umbrales respondía 400 genérico
  en vez de 422 `MAINTENANCE_INVALID_THRESHOLD`; `aObjetoDeListado` de citas reventaba con
  `TypeError` cuando la cita no existía (deba devolver 404 `CITA_NO_ENCONTRADA`).
- **Infraestructura de pruebas (2)**: `tests/helpers/db-test.js` aplicaba cada `.sql` como una
  sola sentencia (faltaba `multipleStatements`) y sin registro idempotente (los `CREATE INDEX`
  no son repetibles); el script `test` ahora usa `--runInBand`.
- **Tests con aserciones erróneas (7)**: typo `NOT_MODIFICABLE`, `ok: true` que la API no envía,
  placas en minúsculas (el backend las normaliza a mayúsculas), `fechaFutura` generada en UTC
  (desfase de un día con el día local) y un test de pausa que reanudaba antes de probar el
  salto de estado.

## Hallazgos adicionales

- **Contrato vs implementación**: `contracts/api-rest.md` describía un envoltorio
  `{ ok: true, ... }` con claves nominales que ni la implementación ni las pruebas usan.
  Se alineó el documento a la forma real verificada (payload directo, colecciones bajo `datos`,
  errores `{ error: { codigo, mensaje } }`, `DELETE` de refacciones en orden → 204,
  `DATOS_INVALIDOS` 400 en lugar de `VALIDATION_ERROR` 422).
- **Seeds**: requieren una instalación limpia para que los IDs fijos de `vehicles` (1–4)
  coincidan con los que referencian `appointments`/`service_orders`/`maintenance_plans`;
  sobre una base con auto_increment desfasado fallan por clave foránea (la base `motorix` de
  desarrollo se recreó para el recorrido).

## Decisiones de implementación notables

- "Vencido" y "próximo" se calculan en cada consulta (nunca se almacenan) con el kilometraje
  actual derivado de `MAX(mileage_entry)` por vehículo.
- `proximidad` usa la menor de las medidas disponibles (días o km) como orden heurístico,
  documentado en research D9; la lista no usa ventana de tiempo fija (Q5).
- El movimiento `OUT` de una orden siempre lleva `reason` y `order_id`; la devolución es `IN`
  nuevo con su propio motivo, preservando la traza completa (SC-004).
- El rol RECEPTIONIST no gestiona refacciones de órdenes (solo ADMIN y el mecánico dueño),
  y solo ADMIN ve refacciones inactivas o audita movimientos.
