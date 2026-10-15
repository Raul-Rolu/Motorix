# Informe de finalización: Sprint 4 — Pagos, tickets y panel de control

**Fecha**: 2026-10-12
**Feature**: `specs/004-pagos-tickets-dashboard`
**Estado**: Sprint 4 completo (57/57 tareas)

## Resumen

Se implementaron las 4 historias de usuario del Sprint 4 sobre la base de los sprints
anteriores (Express + mysql2 sin ORM, Flutter con provider, permisos validados en servidor):

| Historia | Contenido | Estado |
|----------|-----------|--------|
| US1 | Pagos manuales sobre la orden con métodos efectivo/tarjeta/transferencia, saldo al vuelo, liquidación automática e historial inmutable (RN-13, FR-001 a FR-006) | Completa |
| US2 | Cobro digital con Mercado Pago como enlace compartible (sandbox o simulador), verificación bajo demanda y caducidad perezosa a las 24 h (FR-008 a FR-010, FR-017) | Completa |
| US3 | Ticket por orden con folio único `TCK-AAAA-NNNN`, contenido derivado al vuelo, vista imprimible con documento HTML temporal y copia al portapapeles (FR-011 a FR-013, FR-018) | Completa |
| US4 | Panel de control exclusivo de ADMIN con agregados al vuelo y alertas por color (FR-014 a FR-016) | Completa |

## Artefactos entregados

- **Base de datos**: migraciones `014_create_payments.sql` (pagos inmutables con
  `ON DELETE RESTRICT` hacia la orden y sin columnas de tarjeta) y `015_create_tickets.sql`
  (un ticket por orden con `UNIQUE (order_id)` y `UNIQUE (folio)`); seed idempotente
  `007_demo_payments_tickets.sql` (los 4 métodos, los 3 estados, ticket `TCK-2026-0001`
  y un cobro digital antiguo para demostrar la caducidad, FR-021/SC-009).
  Migraciones y seeds aplicados en la base local.
- **Backend (7 endpoints nuevos)**:
  - `GET/POST /api/orders/:id/payments`, `GET /api/payments/:id` (US1);
    `POST /api/orders/:id/payments/digital`, `POST /api/payments/:id/verify` (US2);
    `GET /api/tickets/:orderId` (US3); `GET /api/dashboard` (US4).
  - Módulos nuevos: `services/payment-gateway.js` (preferencia/consulta con `fetch`
    nativo, `MP_MODE=sandbox|simulated`, sin SDK), `services/payment-service.js`,
    `services/ticket-folio.js` (funciones puras del folio), `services/ticket-service.js`,
    `services/dashboard-service.js`, `models/payment.js`, `models/ticket.js`,
    `models/dashboard.js`, `validators/payment-validator.js`, controladores y rutas
    asociados (montados en `app.js`).
  - Expiración perezosa sin cron (research D3): al listar, al verificar, al consultar el
    panel (`expireStaleDigitalGlobal`) y en el ticket.
  - Catálogo de errores: 6 códigos nuevos (`PAYMENT_NOT_FOUND`,
    `PAYMENT_NOT_MODIFIABLE`, `PAYMENT_EXCEEDS_BALANCE` con `details.saldoPendiente`,
    `PAYMENT_DUPLICATE_PENDING`, `ORDER_CANCELLED`, `MP_PROVIDER_ERROR`).
- **Flutter**: modelos (`payment.dart` con `Pago`/`PagosDeOrden`/`CobroDigital`,
  `ticket.dart`, `dashboard.dart`), providers (`PaymentsProvider`, `TicketsProvider`,
  `DashboardProvider`), pantallas (`payment_form_screen.dart` con la sección de
  "Cobro con Mercado Pago" y enlace seleccionable, `ticket_screen.dart`,
  `dashboard_screen.dart`), sección de cobros y botón "Ver ticket" en el detalle de
  orden, acceso rápido "Panel de control" solo para ADMIN en el inicio y
  `services/ticket_print.dart` (HTML autocontenido + apertura del diálogo de impresión
  del sistema y texto plano para portapapeles, sin librerías nuevas, research D5).
- **Documentación**: contrato `contracts/api-rest.md`, `data-model.md`, `research.md`,
  `quickstart.md`, `README.md` raíz en español con la funcionalidad del Sprint 4.

## Verificación ejecutada

- **Backend** (T053): suite completa contra `motorix_test` con `--runInBand`:
  **49 suites, 223/223 pruebas en verde** (unit + integración + contrato; 10 suites y
  32 pruebas nuevas del Sprint 4, sin romper ningún sprint anterior — SC-008).
- **Frontend** (T054): `flutter test` → **17/17 en verde** (5 archivos: login, flujo de
  pago manual, flujo digital, ticket e panel); `flutter analyze` → **sin issues**.
- **Recorrido V1–V12** (T055) contra el backend en ejecución con las cuentas seed:
  **12/12 escenarios PASS**:
  - **V1** pago parcial de 400 en efectivo sobre la orden 4 → `COMPLETED`,
    `cobrado=1750`, `saldo=950`, `PARCIAL`.
  - **V2** resto 950 en tarjeta → `estadoCobro=LIQUIDADA`, `saldo=0`.
  - **V3** monto 0 → 400 `DATOS_INVALIDOS`; monto mayor al saldo → 409
    `PAYMENT_EXCEEDS_BALANCE` con `details.saldoPendiente=0`.
  - **V4** cobro digital 700 (`MP_MODE=simulated`) → `PENDING` con
    `enlace=https://simulado.motorix.local/pago/MP-…`; verificar → `COMPLETED` y
    `cobrado=1500`; un cobro digital posterior → 409 `PAYMENT_DUPLICATE_PENDING` (**V6**).
  - **V5** el cobro digital antiguo de la semilla (2026-10-08) aparece `EXPIRED` al
    consultar la orden y no cuenta para el cobrado (`cobrado=800` sin sus 300).
  - **V7** ticket de la orden 4 con folio `TCK-2026-0001`, taller, cliente, vehículo,
    kilometraje, servicios, mano de obra, totales, pagos y `estadoPago=LIQUIDADA`;
    la orden 6 emite `TCK-2026-0002` secuencial. **V8** reabrir → mismo folio.
  - **V9** panel como ADMIN con cifras reales: órdenes por estado
    (`RECIBIDO=2`, `EN_REPARACION=1`, `ESPERANDO_REFACCION=1`, `ENTREGADO=1`,
    `CANCELADA=1`), citas, mantenimientos (3 vencidos / 3 próximos), `stockBajo=4`,
    `cobros.hoy=2050`, `cobros.total=4200`.
  - **V10** recepción y mecánico → 403 `NO_AUTORIZADO` en el panel; sin token → 401.
  - **V11** el mecánico recibe 403 en los 4 endpoints de pagos y en tickets
    (consulta, digital, verificación y emisión).
  - **V12** ver seguridad (T056).
- **Seguridad** (T056): la tabla `payments` tiene solo
  `id, order_id, method, amount, status, external_reference, created_by, created_at`
  y **0 coincidencias** con patrones de 12–19 dígitos en sus 4 filas de demostración
  (RN-14/SC-006); `MP_ACCESS_TOKEN`/`MP_MODE` solo aparecen en `.env.example` con
  placeholder y se leen de `process.env` en `payment-gateway.js`; el repositorio no
  contiene tokens reales (búsqueda de `APP_USR`/`access_token=` → 0) y `server/.env`
  (no versionado) solo define claves de base de datos y `JWT_SECRET`; los 403/401 de
  roles están verificados en servidor (RN-15, V10/V11).
- **Límite**: el recorrido de la interfaz gráfica (`flutter run -d windows`) no se
  ejecutó por no haber sesión de escritorio disponible; las pantallas están cubiertas
  por `flutter analyze` y los widget tests (emisión y visualización del ticket, generación
  del enlace, verificación, panel con alertas y visibilidad por rol).

## Correcciones aplicadas durante la implementación (TDD)

- `ticket-folio.js`: el regex del folio no tenía grupo de captura y `anioDelFolio`
  devolvía `NaN` (lo capturó la prueba unitaria antes de implementar el servicio).
- `models/dashboard.js`: `target_date` llega como `Date` de mysql2 y `String(fecha).slice(0,10)`
  rompía el cálculo de vencimiento; se replicó `fechaCorta` de `models/maintenance.js`
  (mismo defecto ya corregido en el Sprint 3).
- `tests/helpers/db-test.js`: `limpiarTablas` no borraba `payments` ni `tickets`
  (tablas nuevas); se añadieron sus `DELETE` para suites deterministas.
- Dart: `catch {` sin identificador no compila → `catch (_) {` en `ticket_screen.dart`.
- Tests con aserciones erróneas: placas normalizadas a mayúsculas por el backend
  (`TKT-001-A`), conteo de órdenes `RECIBIDO` recalculado (3, no 2), `ordenesEnCurso`
  del panel (4, no 5) y localizador del indicador por clave (el texto "4" coincidía
  también con "Citas próximas").
- `order_detail_screen.dart`: import de `models/payment.dart` sin uso eliminado
  (`flutter analyze` en limpio).

## Hallazgos adicionales

- **Semilla 004 no es idempotente en la práctica**: `order_services`/`order_labor` se
  insertan sin `id` fijo y sin clave única sobre `(order_id, description)`, por lo que
  `ON DUPLICATE KEY UPDATE` nunca dispara y **re-ejecutar `apply-seeds.mjs` duplica los
  importes** (la base local quedó con los totales de las órdenes 2 y 4 exactamente
  doblados: 2200 y 2700 en vez de 1100 y 1350). Los escenarios V1–V12 y el panel
  siguen siendo válidos sobre esos datos, y en una instalación limpia la semilla 007
  deja la orden 4 `LIQUIDADA` como indica su comentario. **Recomendación**: corregir la
  semilla 004 (IDs fijos o clave única) en un sprint futuro; quedó fuera del alcance
  de este Sprint 4.
- **Contrato vs inventario**: el spec (FR-003) incluía las refacciones en el total de la
  orden, pero el inventario del Sprint 3 no tiene precio unitario. Se resolvió que el
  total sea **servicios + mano de obra** (`orderService.obtenerTotalOrden`) y que el
  ticket liste las refacciones con nombre, código y cantidad sin importe; contrato,
  data-model y spec (CA-4) quedaron ajustados y documentados.
- **Preferencia antes que el pago**: en `crearCobroDigital` la preferencia se crea
  **antes** de insertar la fila del pago; si el proveedor responde 502 no queda ningún
  pago incompleto (solo el error `MP_PROVIDER_ERROR`).
- **Nombres de archivos de tasks.md**: el provider y la prueba del ticket se entregaron
  como `client/lib/providers/ticket_provider.dart` y `client/test/ticket_test.dart`
  (renombrados durante la Fase 7 para coincidir con tasks.md); la clase se llama
  `TicketsProvider` por coherencia con `PaymentsProvider`/`DashboardProvider`.
- **"Compartir" el ticket**: FR-018 prohíbe servicios externos y archivos descargables,
  por lo que la acción de compartir de T039 se implementó como **copia del texto plano
  del ticket al portapapeles** (sin librerías nuevas) junto al botón de imprimir.

## Decisiones de implementación notables

- El total de la orden y el estado de cobro (`PENDIENTE`/`PARCIAL`/`LIQUIDADA`) se
  calculan al vuelo en cada consulta; nunca se almacenan campos derivados (research D2).
- El folio se asigna con reintento amable ante carreras (3 intentos sobre la secuencia
  del año) y la `UNIQUE` de la tabla rechaza la emisión duplicada: un ticket por orden
  para siempre (research D4).
- El contenido del ticket no se persiste: folio y trazabilidad de emisión viven en
  `tickets`; todo lo demás se deriva de la orden y sus pagos, por lo que el ticket
  siempre muestra el estado de cobro más reciente (CA-4, verificado en V7/V8).
- La caducidad de cobros digitales es una función pura `debeCaducar(createdAt, ahora)`
  con reloj inyectable (T022), sin cron: se aplica al listar, verificar, consultar el
  panel y emitir el ticket (research D3).
- El simulador interno (`MP_MODE=simulated`) confirma siempre al verificar y genera
  enlaces locales, de modo que toda la suite y el recorrido V1–V12 corren sin red ni
  credenciales (SC-008); el fallo del proveedor real se prueba con un stub de
  `globalThis.fetch` en modo sandbox.
- El panel solo suma pagos `COMPLETED` al dinero cobrado (SC-007) y aplica la
  expiración perezosa global antes de contar los pendientes digitales.

## Cobertura de criterios de aceptación

| Criterio | Resultado | Evidencia |
|----------|-----------|-----------|
| SC-001 (pagos válidos e inválidos) | PASS | V1, V2, V3 + `integration/payments*.test.js` |
| SC-002 (inmutables y auditables) | PASS | V1/V12 (esquema sin UPDATE/DELETE de negocio) + contrato |
| SC-003 (ticket imprimible y folio estable) | PASS | V7, V8 + `ticket_test.dart` (HTML y portapapeles) |
| SC-004 (panel real y restringido) | PASS | V9, V10 + `dashboard.test.js` |
| SC-005 (permisos en servidor) | PASS | V10, V11 (403/401 en los 7 endpoints) |
| SC-006 (cero datos de tarjeta) | PASS | V12 (0 coincidencias, sin columnas ni tokens) |
| SC-007 (solo `COMPLETED` cuenta) | PASS | V5 + panel (`cobros` excluye `PENDING`/`EXPIRED`) |
| SC-008 (suites en verde) | PASS | 49/49 suites y 223/223 pruebas; 17/17 Flutter |
| SC-009 (semilla 007 con cifras) | PASS | V9 con la base de demostración poblada |
