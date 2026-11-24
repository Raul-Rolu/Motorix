---

description: "Lista de tareas para la feature 008-configuracion-seguridad-reportes"
---

# Tareas: Configuración, seguridad y reportes

**Input**: Documentos de diseño de `/specs/008-configuracion-seguridad-reportes/`

**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, contracts/api-rest.md, quickstart.md

**Pruebas**: Sí — la spec (FR-030, CA-13, CA-26) las exige. En cada historia las pruebas van ANTES de la implementación: primero se escriben y se comprueba que fallan; después se implementa lo que las hace pasar. Única excepción: la prueba de rendimiento de reportes (T133), que necesita los reportes implementados.

**Organización**: agrupadas por **bloque de entrega** (P1, P2, P3) y, dentro de cada bloque, por historia de usuario (US1 a US11). **Cada bloque termina con su propio cierre** (datos de ejemplo, documentos, capturas, quickstart y corrida de suites) y con una **LÍNEA DE CORTE**: el sprint puede cerrarse después de cualquiera de ellas sin dejar migraciones, rutas, pantallas ni documentos a medias.

**Decisiones vigentes (no se reabren)**:

- **Orden de bloques**: P1 (US1, US2, US3, US4) → P2 (US5, US6, US7) → P3 (US8, US9, US10, US11). P3 solo se inicia con P1 y P2 completos, verificados y commiteados por el usuario.
- Migraciones: **P1 = 019, 020, 021; P2 = 022, 023; P3 = ninguna** (la 024 de índices es condicional a la medición de T134).
- **No se agregan `helmet` ni bloqueo por intentos** (decisión 2026-11-23). La bitácora registra los inicios de sesión fallidos.
- **El token se renueva con la actividad** (`POST /api/auth/renew`); la vigencia es el ajuste de inactividad; la consulta periódica de avisos no cuenta como actividad ni renueva.
- **Próximo servicio** calculado desde la orden (fecha de emisión del ticket o de hoy + días; kilometraje de entrada + km); sin columnas nuevas en `maintenance_plans`.
- Tickets existentes: columnas de instantánea en `NULL` **sin relleno**; solo los tickets con instantánea muestran «Próximo servicio».
- La lectura de tipos de servicio **activos** es de los tres roles; su administración es solo de ADMIN.
- El costo del reporte de refacciones es el precio de compra **vigente** (no hay columna de costo congelado).
- Seeds idempotentes con IDs desde 1 en las tablas **nuevas** del sprint (`settings`, `service_types`, `terms_versions`, `terms_acceptances`, `audit_log`) y desde 9001 **solo** cuando insertan en tablas que ya existían (órdenes, líneas, pagos, tickets, usos de refacciones, movimientos); `settings` se siembra con `ON DUPLICATE KEY UPDATE setting_key = setting_key` (nunca pisa cambios del administrador).
- Las suites previas **no se editan**; si una se rompe, detenerse y avisar. Los scripts de evidencia de sprints previos **no se editan**.
- **Orden obligatorio: migraciones → seeds → servidor.**
- **Autorización**: antes de recrear `motorix_test` o cualquier base se debe pedir autorización explícita al usuario; si una base desechable necesita permisos, el usuario ejecuta el `GRANT` como root (nunca se piden ni se escriben contraseñas).
- Sin dependencias nuevas. Sin git: el usuario hace todo el git.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin depender de tareas incompletas)
- **[Historia]**: US1 a US11; las fases de preparación, base común, datos de ejemplo y cierre no llevan etiqueta
- **[X]**: tarea ya hecha (ninguna al generar este archivo)

## Convención de rutas

- Backend: `server/` (`models/`, `services/`, `controllers/`, `routes/`, `validators/`, `utils/`, `middlewares/`); pruebas en `server/tests/{unit,integration,contract}/`
- Frontend: `client/lib/` (`models/`, `providers/`, `screens/`, `widgets/`, `services/`) y `client/test/`
- Datos: `database/migrations/`, `database/seeds/`, `database/scripts/`
- Documentos: `docs/` (evidencias en `docs/evidencias/sprint-7-configuracion/`, capturas `s7-NN-*.png`, que toma el usuario)

---

## Fase 1: Preparación (común)

**Propósito**: línea base verde y verificación de supuestos antes de tocar nada.

- [X] T001 Ejecutar `npm test` en `server/` (hoy 74 suites) y `flutter test` y `flutter analyze` en `client/` (hoy 15 archivos de prueba) sobre la rama actual y anotar el resultado como línea base (las suites previas deben estar en verde) [FR-030][CA-13] **[Resultado 2026-11-23: `npm test` 74 suites y 527 pruebas en verde; `flutter test` 105 pruebas en verde; `flutter analyze` con 5 avisos informativos previos (`parts_provider.dart` ×4 y `payment_flow_test.dart` ×1), sin errores.]**
- [X] T002 Confirmar con búsquedas (y registrar los resultados): (a) todos los routers importan `auth` de `server/middlewares/auth.js`; (b) `firmarToken` y `SESION_MINUTOS` solo los usan `auth.js` y `auth-service.js`; (c) `TALLER` solo lo usa `ticket-service.js`; (d) `esProximo`, `MARGEN_PROXIMO_*` y `DIAS_ORDEN_DETENIDA` solo los consumen `notification-service.js`, `client-notice-service.js`, `maintenance-state.js` y la prueba `maintenance-proximo.test.js`; si apareciera otro consumidor, detenerse y avisar [FR-004][FR-005][CA-3] **[Resultado 2026-11-23: (a) todos los routers importan `auth` de `middlewares/auth.js`; (b) `firmarToken` y `SESION_MINUTOS` solo en `auth.js` y `auth-service.js`; (c) `TALLER` solo en `ticket-service.js` (líneas 17 y 91); (d) `esProximo`/`MARGEN_PROXIMO_*`/`DIAS_ORDEN_DETENIDA` solo en `client-notice-service.js`, `maintenance-state.js`, `notification-service.js` y `maintenance-proximo.test.js`. Sin otros consumidores.]**
- [X] T003 Registrar los IDs reales que usarán los seeds: clientes, vehículos y usuarios de `database/seeds/001` y `002`, refacciones de `005` y confirmar que ninguna tabla **existente** que recibirá filas 9001+ (órdenes, líneas, pagos, tickets, usos, movimientos) tiene ya filas con id ≥ 9001; ajustar los IDs de `data-model.md`/`research.md` D16 si algún supuesto no coincide [CA-12] **[Resultado 2026-11-23: los seeds existentes usan IDs pequeños explícitos: clientes 1–3, órdenes 1–5, `order_services` 1–4, `order_labor` 1–2, `order_entries` 1–5, refacciones 1–7, `order_parts` 1–2, pagos 1–4 y tickets desde 1; vehículos y usuarios (`admin`, `recepcion`, `mecanico`) con auto-incremento (se referencian por placas y `username`). Ninguna tabla existente tiene IDs ≥ 9001; los supuestos de `data-model.md` y `research.md` D16 coinciden.]**

---

# BLOQUE P1 — CONFIGURACIÓN Y CATÁLOGO (US1, US2, US3, US4)

## Fase 2: Base común del bloque P1 (bloquea las historias P1)

**⚠️ CRÍTICO**: ninguna historia de P1 empieza hasta terminar esta fase.

- [X] T004 [P] Escribir `server/tests/integration/migrations-019-021.test.js`: existen `settings` (PK `setting_key`, `setting_value NOT NULL`, FK `updated_by`), `service_types` (nombre único sin distinguir mayúsculas, `CHECK` de al menos un intervalo y de valores positivos, `active` por omisión 1), `order_services.service_type_id` (nulo, FK, índice) y `tickets.shop_name/shop_address/shop_phone` (nulos); las filas existentes de `order_services` y `tickets` quedan con esas columnas en `NULL` (sin relleno); debe fallar antes de T005 [FR-001][FR-003][FR-006][FR-007][CA-4]
- [X] T005 Crear `database/migrations/019_create_settings.sql` (aditiva; tabla de `data-model.md` sección 1) (depende de T004) [FR-001]
- [X] T006 Crear `database/migrations/020_create_service_types.sql`: tabla `service_types` con sus `CHECK` y `ALTER TABLE order_services ADD COLUMN service_type_id … NULL` con FK e índice `idx_order_services_type` (depende de T005) [FR-006][FR-007]
- [X] T007 Crear `database/migrations/021_tickets_shop_snapshot.sql`: `ALTER TABLE tickets ADD COLUMN shop_name/shop_address/shop_phone … NULL`, sin `UPDATE` de relleno (depende de T006) [FR-003]
- [X] T008 Aplicar 019–021 sobre `motorix_test` con el helper de pruebas y con `node database/scripts/apply-migrations.mjs` sobre una base desechable; comprobar que quedan registradas, que una segunda corrida no las repite y que las filas existentes conservan sus datos; T004 debe pasar. **Pedir autorización explícita antes de recrear `motorix_test` o cualquier base; el `GRANT` lo ejecuta el usuario como root.** La base principal la aplica el usuario antes de arrancar el servidor (depende de T004–T007) [CA-12] **[Resultado 2026-11-23: aplicadas y verificadas sobre `motorix_test` (helper de pruebas y runner `apply-migrations.mjs` con `DB_NAME=motorix_test`): 019, 020 y 021 quedan registradas y una segunda corrida las omite («Omitida (ya aplicada)»); T004 pasa dos corridas seguidas. No se creó ninguna base desechable adicional (no se tocó `motorix`); la comprobación sobre una base desechable nueva queda a decisión del usuario.]**
- [X] T009 Extender `limpiarTablas()` en `server/tests/helpers/db-test.js` para vaciar `service_types` y `settings` (helper, no una prueba; se agrega solo ahora que existen las tablas) (depende de T008) [CA-13]
- [X] T010 [P] Escribir `server/tests/unit/settings-rules.test.js`: valores de respaldo exactos (`Motorix`, `Av. Taller 123, Col. Centro`, `555-000-0000`, 30, 1000, 3, 30), límites de cada clave (días 1–365, km 100–50,000, orden detenida 1–90, inactividad 5–120, nombre 1–100, dirección ≤150, teléfono ≤30 con caracteres permitidos), rechazo de no enteros, decimales, cadenas y fuera de rango, y que un valor guardado inválido cae al respaldo; debe fallar antes de T011 [FR-002][FR-004][FR-005][CA-2][CA-3]
- [X] T011 Crear `server/utils/settings-defaults.js` (claves, respaldos y límites) y `server/validators/settings-validator.js` (funciones puras, mensajes en español, sin dependencias) y hacer pasar T010 (depende de T010) [FR-002][FR-004][FR-005]
- [X] T012 [P] Agregar a `server/utils/errors.js` `SERVICE_TYPE_NOT_FOUND` (404), `SERVICE_TYPE_DUPLICATE` (409) y `SERVICE_TYPE_INACTIVE` (409) con mensajes en español [FR-006][CA-4]
- [X] T013 [P] Escribir `server/tests/unit/maintenance-proximo-margenes.test.js` (archivo nuevo; no se edita `maintenance-proximo.test.js`): `esProximo` con márgenes explícitos (15 días sí/16 no, 500 km sí/501 no), sin márgenes usa 30 y 1,000, vencido nunca es próximo; debe fallar antes de T014 [FR-004][CA-2][CA-3]
- [X] T014 Agregar a `esProximo` en `server/services/maintenance-state.js` el parámetro opcional `margenes = { dias: MARGEN_PROXIMO_DIAS, km: MARGEN_PROXIMO_KM }` al final de la firma, **sin quitar** las constantes exportadas ni modificar `esVencido`, y hacer pasar T013 y la prueba previa `maintenance-proximo.test.js` sin editarla (depende de T013) [FR-004][CA-2][CA-3]

**Punto de control**: esquema P1 aplicado, límites y márgenes probados; las suites previas siguen en verde.

---

## Fase 3: US1 — Datos del taller editables (Prioridad: P1) 🎯 MVP del sprint

**Objetivo**: el administrador edita nombre, dirección y teléfono; los tickets nuevos guardan una instantánea; los anteriores no cambian.

**Prueba independiente**: cambiar los datos en Configuración y emitir un ticket nuevo, un ticket con instantánea y uno anterior al sprint (E2 del quickstart).

### Pruebas de US1 (escribirlas primero; deben fallar) ⚠️

- [X] T015 [P] [US1] Crear `server/tests/integration/settings.test.js`: `GET /api/settings` devuelve el respaldo cuando no hay filas y con la forma del contrato de P1 (`taller`, `operacion` y `limites`, **sin** el grupo `seguridad`, que un `PUT` rechaza con 400 hasta P2); `PUT` guarda un subconjunto, `updated_by` queda con el usuario, una segunda lectura devuelve lo guardado; nombre vacío, longitudes excedidas, teléfono con letras y un campo inválido rechazan **todo** el guardado con `400 DATOS_INVALIDOS` sin guardar nada [FR-001][FR-002][FR-005][CA-1][CA-3]
- [X] T016 [P] [US1] Crear `server/tests/contract/settings-roles.test.js`: sin token → 401; ADMIN 200; RECEPTIONIST y MECHANIC → `403 NO_AUTORIZADO` en `GET` y `PUT` (validado en el servidor) [FR-010][CA-10]
- [X] T017 [P] [US1] Crear `server/tests/integration/tickets-taller-snapshot.test.js`: el ticket nuevo guarda nombre, dirección y teléfono vigentes; cambiar los ajustes después **no** cambia ese ticket; un ticket insertado por SQL sin instantánea muestra los datos vigentes; sin filas de `settings` el ticket usa el respaldo (los valores de `TALLER` de hoy); el resto del contenido del ticket es idéntico al de antes [FR-002][FR-003][FR-005][CA-1][CA-3]
- [X] T018 [P] [US1] Crear `client/test/settings_screen_test.dart` (cliente HTTP falso): la sección Configuración solo aparece para ADMIN, muestra los datos del taller, guarda con mensaje de éxito, valida nombre obligatorio y muestra el error del servidor sin trazas; estados cargando, vacío y error según 8.4 [FR-002][CA-1]

### Implementación de US1

- [X] T019 [US1] Crear `server/models/setting.js` (lectura de todas las filas y escritura de varias con `ON DUPLICATE KEY UPDATE`) y `server/services/settings-service.js` (`obtenerAjustes()` con respaldo y descarte de valores inválidos, que ya incluye internamente `session.inactivity_minutes` para uso del backend; `actualizar(payload, usuario)` con validación, sin caché; **en P1 la API expone y acepta solo los grupos `taller` y `operacion`**: el grupo `seguridad` lo habilita T081) (depende de T011) [FR-001][FR-002][FR-005][CA-3]
- [X] T020 [US1] Crear `server/controllers/settings-controller.js` y `server/routes/settings-routes.js` con `GET` y `PUT /api/settings` (`auth` + `requireRole('ADMIN')`) y montar el router en `server/app.js` (depende de T019) [FR-002][FR-010][CA-10]
- [X] T021 [US1] Actualizar `server/models/ticket.js` (`create` guarda `shop_*`; `aObjeto` los expone) y `server/services/ticket-service.js`: `emitirSiFalta` lee `obtenerAjustes()` y guarda la instantánea; `taller` del contenido usa la instantánea si existe y los ajustes vigentes si no; se elimina la constante `TALLER` (depende de T019) [FR-003][CA-1][CA-3]
- [X] T022 [US1] Crear en el cliente `client/lib/models/app_settings.dart`, `client/lib/providers/settings_provider.dart` y `client/lib/screens/settings_screen.dart` (tarjeta «Datos del taller»), agregar la sección «Configuración» (solo ADMIN) en `client/lib/widgets/app_shell.dart` y registrar el proveedor en `client/lib/main.dart` (depende de T018, T020) [FR-002][CA-1]
- [X] T023 [US1] Ejecutar T015 a T018 hasta verlas pasar y repetir `npx jest tickets payments` en `server/` y `flutter test` en `client/` para confirmar que las suites previas siguen en verde sin editarse [CA-1][CA-13] **[Resultado 2026-11-23: `npx jest tickets payments` 11 suites y 53 pruebas en verde; corrida completa `npm test` 80 suites y 609 pruebas (74 previas + 6 nuevas, sin editar ninguna previa) y `flutter test` 113 pruebas (105 previas + 8 nuevas) en verde.]**

**Punto de control**: US1 funciona sola y es demostrable.

---

## Fase 4: US2 — Márgenes de mantenimiento y orden detenida (Prioridad: P1)

**Objetivo**: los márgenes de «Próximo» y los días de orden detenida se editan y los usan el centro de notificaciones y la lista de clientes por avisar; la lista de Mantenimientos y el panel no cambian.

**Prueba independiente**: cambiar los márgenes y comprobar los avisos con datos sembrados (E3 del quickstart).

### Pruebas de US2 (escribirlas primero; deben fallar) ⚠️

- [X] T024 [P] [US2] Crear `server/tests/integration/notifications-margenes.test.js`: con márgenes de 15 días y 500 km y 5 días de orden detenida, `GET /api/notifications` y `GET /api/client-notices/pending` clasifican según esos valores; sin filas de `settings` los resultados coinciden con los del Sprint 6 (mismas claves de aviso); cambiar los márgenes **no** modifica `GET /api/maintenances` ni `GET /api/dashboard`; `PUT /api/settings` rechaza valores fuera de límites (0, 366, 99, 50,001, 91) con `400` [FR-004][FR-005][CA-2][CA-3]
- [X] T025 [P] [US2] Crear `client/test/settings_margins_test.dart`: tarjeta «Operación» con márgenes y días de orden detenida, límites mostrados, guardado independiente con mensaje de éxito y error del servidor [FR-004][CA-2]

### Implementación de US2

- [X] T026 [US2] Actualizar `server/services/notification-service.js`: leer `obtenerAjustes()` una vez por consulta y usar los márgenes en `esProximo`, los días en `findOrdenesDetenidas({ dias })` y la redacción del detalle; mantener exportada `DIAS_ORDEN_DETENIDA` como respaldo (depende de T014, T019) [FR-004][CA-2][CA-3]
- [X] T027 [US2] Actualizar `server/services/client-notice-service.js` para clasificar los mantenimientos próximos con los márgenes de `obtenerAjustes()` (misma definición de «próximo» que el centro) (depende de T014, T019) [FR-004][CA-2]
- [X] T028 [US2] Agregar a `client/lib/screens/settings_screen.dart` la tarjeta «Operación» (márgenes de días y km y días de orden detenida) y a `settings_provider.dart` su guardado (depende de T022, T025) [FR-004][CA-2]
- [X] T029 [US2] Ejecutar T024 y T025 hasta verlas pasar y repetir `npx jest notifications client-notices maintenance dashboard` (suites del Sprint 6 y previas, sin editarlas) y verificar que la consulta de avisos sigue en 8 consultas SQL o menos con `notifications-performance.test.js` [CA-2][CA-3][CA-13] **[Resultado 2026-11-23: `notifications-margenes` (13) y las suites de avisos, clientes por avisar, mantenimientos y panel (14 suites, 215 pruebas) en verde sin editar las previas; `notifications-performance` sigue dentro del presupuesto (≤ 10 consultas por petición).]**

**Punto de control**: US2 verificable; resultados del Sprint 6 intactos sin configuración guardada.

---

## Fase 5: US3 — Catálogo de tipos de servicio con intervalo (Prioridad: P1)

**Objetivo**: el administrador mantiene el catálogo; las líneas de servicio pueden llevar un tipo; el próximo mantenimiento se propone desde la orden.

**Prueba independiente**: crear, editar y desactivar tipos, asignarlos a líneas y pedir la propuesta (E4 del quickstart).

### Pruebas de US3 (escribirlas primero; deben fallar) ⚠️

- [X] T030 [P] [US3] Escribir `server/tests/unit/next-service.test.js`: `calcularProximoServicio` con un tipo de días y km, solo días, solo km, varios tipos (el menor intervalo de cada dimensión), sin tipos con intervalo (`null`), bases de fecha en fin de mes y año bisiesto y formato `AAAA-MM-DD`; debe fallar antes de T036 [FR-008][FR-009][CA-5]
- [X] T031 [P] [US3] Crear `server/tests/integration/service-types.test.js`: alta, edición y desactivación; nombre repetido sin distinguir mayúsculas → `409 SERVICE_TYPE_DUPLICATE`; sin intervalos o con valores no positivos o fuera de límite → `400`; **no existe `DELETE`**; `GET` devuelve activos por omisión y `?incluirInactivos=true` solo a ADMIN; asignar `serviceTypeId` en `POST /api/orders/:id/services` (tipo activo OK, inexistente → 404, inactivo → 409, en mano de obra → 400); desactivar un tipo usado conserva las líneas existentes; las líneas sin tipo no incluyen `serviceTypeId` en las respuestas [FR-006][FR-007][CA-4]
- [X] T032 [P] [US3] Crear `server/tests/contract/service-types-roles.test.js`: RECEPTIONIST y MECHANIC → 403 en `POST`, `PUT` y `PATCH`, y 200 en `GET` de activos; con `?incluirInactivos=true` → 403; sin token → 401 [FR-010][CA-10]
- [X] T033 [P] [US3] Crear `server/tests/integration/maintenance-proposal.test.js`: `GET /api/maintenances/proposal?orderId=` devuelve fecha (hoy + días) y kilometraje (entrada de la orden + km) del menor intervalo de cada dimensión; tipo solo con días o solo con km; orden sin tipos → `propuesta: null`; orden inexistente → 404; `orderId` ausente → 400; ADMIN cualquier orden, MECHANIC solo la suya (`403 FORBIDDEN_ORDER` en otra), RECEPTIONIST → 403; **no crea mantenimientos**; la ruta no choca con `/:id` [FR-008][CA-5][CA-10]
- [X] T034 [P] [US3] Crear `client/test/service_types_test.dart`: pantalla «Catálogo de servicios» (solo ADMIN) con lista, alta, edición, desactivación con confirmación, errores de nombre repetido y de intervalo faltante [FR-006][CA-4]
- [X] T035 [P] [US3] Crear `client/test/maintenance_proposal_test.dart`: en el formulario de Mantenimientos «Proponer desde una orden» rellena fecha y kilometraje, se pueden corregir antes de guardar y sin propuesta muestra un mensaje claro [FR-008][CA-5]

### Implementación de US3

- [X] T036 [US3] Crear `server/utils/next-service.js` con la función pura `calcularProximoServicio({ tipos, kilometrajeBase, fechaBase })` y hacer pasar T030 (depende de T030) [FR-008][FR-009][CA-5]
- [X] T037 [US3] Crear `server/models/service-type.js`, `server/services/service-type-service.js`, `server/validators/service-type-validator.js`, `server/controllers/service-type-controller.js` y `server/routes/service-type-routes.js` (`GET` para los tres roles con la regla de inactivos; `POST`, `PUT` y `PATCH /:id/status` solo ADMIN; sin `DELETE`) y montar en `server/app.js` (depende de T012, T031, T032) [FR-006][FR-010][CA-4][CA-10]
- [X] T038 [US3] Actualizar `server/models/order.js` (`createPart` guarda `service_type_id`; `findServices` incluye `serviceTypeId` **solo si no es nulo**; nueva `findServicesWithTypes(orderId)` con intervalos), `server/validators/order-validator.js` y `server/services/order-service.js` (validar el tipo: existe, activo, solo en servicios) sin cambiar el comportamiento de las líneas sin tipo (depende de T037) [FR-007][CA-4]
- [X] T039 [US3] Agregar `proponerDesdeOrden(orderId, usuario)` a `server/services/maintenance-service.js`, su controlador y `GET /proposal` en `server/routes/maintenance-routes.js` **antes** de `/:id` (`requireRole('ADMIN','MECHANIC')`, y para el mecánico solo órdenes asignadas) (depende de T036, T038, T033) [FR-008][CA-5]
- [X] T040 [US3] Cliente: `client/lib/models/service_type.dart`, `client/lib/providers/service_types_provider.dart`, `client/lib/screens/service_types_screen.dart`, sección «Catálogo de servicios» (solo ADMIN) en `app_shell.dart`, registro en `main.dart` y el selector opcional de tipo activo en el diálogo de línea de servicio de `client/lib/screens/order_detail_screen.dart` (depende de T034, T037, T038) [FR-006][FR-007][CA-4] **[Desviación 2026-11-23: la pantalla de la orden NO tenía ningún diálogo para agregar líneas de servicio (`OrdersProvider.agregarPartida` existía sin uso). Se creó el diálogo reutilizable `client/lib/widgets/add_service_dialog.dart` (descripción, importe y tipo activo opcional), el botón «Agregar servicio» en `order_detail_screen.dart` (visible mientras la orden no sea final; el servidor valida estado, mecánico y tipo) y el nombre del tipo en el subtítulo de cada línea. Es el mínimo para poder asignar tipos desde la interfaz.]**
- [X] T041 [US3] Cliente: botón «Proponer desde una orden» en `client/lib/screens/maintenance_form_screen.dart` (lista las órdenes del vehículo con el historial existente y rellena fecha y kilometraje editables) y su método en `maintenances_provider.dart` (depende de T035, T039) [FR-008][CA-5]
- [X] T042 [US3] Ejecutar T030 a T035 hasta verlas pasar y repetir `npx jest orders order-parts maintenances` en `server/` y `flutter test` en `client/` (suites previas sin editar) [CA-4][CA-5][CA-13] **[Resultado 2026-11-23: `next-service`, `service-types`, `service-types-roles` y `maintenance-proposal` (63 pruebas) y las de Flutter `service_types` (19) y `maintenance_proposal` (8) en verde; `npm test` 85 suites y 682 pruebas, `flutter test` 145 pruebas y `flutter analyze` con los mismos 5 avisos informativos previos, todo sin editar pruebas previas.]**

**Punto de control**: US3 verificable; las líneas existentes siguen igual y el catálogo no se puede borrar.

---

## Fase 6: US4 — Próximo servicio en el ticket (Prioridad: P1)

**Objetivo**: el ticket nuevo muestra «Próximo servicio» cuando la orden tiene un tipo con intervalo; los tickets anteriores no cambian.

**Prueba independiente**: emitir el ticket de una orden con servicio tipificado y el de otra sin tipo (E4 del quickstart).

### Pruebas de US4 (escribirlas primero; deben fallar) ⚠️

- [X] T043 [P] [US4] Crear `server/tests/integration/tickets-proximo-servicio.test.js`: orden con «Cambio de aceite» (180 días y 5,000 km) → `proximoServicio` con fecha de emisión + 180 y kilometraje de entrada + 5,000; solo días o solo km; varios tipos → fecha menor y km menor; sin tipos o tipos sin intervalo → el campo **no aparece**; ticket sin instantánea (insertado por SQL) → **sin** `proximoServicio` y cuerpo idéntico al de antes; el resto del contenido (folio, importes, refacciones, pagos) no cambia [FR-009][CA-14]
- [X] T044 [P] [US4] Crear `client/test/ticket_proximo_servicio_test.dart`: `TicketServicio.desdeJson` lee `proximoServicio`, `construirHtmlTicket` agrega la línea «Próximo servicio» con fecha y/o kilometraje y no la agrega sin el campo; la pantalla del ticket la muestra [FR-009][CA-14]

### Implementación de US4

- [X] T045 [US4] Actualizar `server/services/ticket-service.js`: si el ticket tiene instantánea (`shopName` no nulo), calcular `proximoServicio` con `calcularProximoServicio` (fecha base = fecha local de emisión del ticket; km base = `mileageEntry` de la orden; tipos de `findServicesWithTypes`) y agregar el campo solo cuando haya valor (depende de T021, T036, T038, T043) [FR-009][CA-14]
- [X] T046 [US4] Cliente: leer `proximoServicio` en `client/lib/models/ticket.dart` y mostrarlo en `client/lib/screens/ticket_screen.dart` y `client/lib/services/ticket_print.dart` (depende de T044, T045) [FR-009][CA-14]
- [X] T047 [US4] Ejecutar T043 y T044 hasta verlas pasar y repetir `npx jest tickets payments` y `flutter test client/test/ticket_test.dart` (suites previas sin editar) [CA-14][CA-13] **[Resultado 2026-11-23: `tickets-proximo-servicio` (9 pruebas) y Flutter `ticket_proximo_servicio` (16 con `ticket_test`) en verde; `npx jest tickets payments` 12 suites y 62 pruebas en verde sin editar las previas.]**

**Punto de control**: US4 verificable; los tickets anteriores son idénticos.

---

## Fase 7: Datos de ejemplo del bloque P1 (CA-12)

**Propósito**: seeds idempotentes que muestran la información de P1 al arrancar, sin reiniciar datos de trabajo. Dependen de las migraciones 019–021. **Orden obligatorio: migraciones → seeds → servidor.**

- [X] T048 [P] Crear `database/seeds/010_demo_settings_service_types.sql` (IDs verificados en T003; `ON DUPLICATE KEY UPDATE`): las siete claves de `settings` con `setting_key = setting_key` (no pisa lo cambiado), tipos (tabla nueva, ids 1 a 4) 1 «Cambio de aceite» (180 días, 5,000 km), 2 «Afinación» (365 días, 10,000 km), 3 «Revisión de frenos» (180 días) y 4 «Rotación de neumáticos» (10,000 km), y una orden 9001 `ENTREGADO` (tabla existente, id alto) con una línea de servicio con tipo 1, una de mano de obra, un pago `COMPLETED` por el total y un ticket 9001 con instantánea del taller [FR-029][CA-12] **[Hecho 2026-11-23: `database/seeds/010_demo_settings_service_types.sql`; todas las sentencias usan `ON DUPLICATE KEY UPDATE` sin modificar la fila (nunca pisan lo cambiado); `settings` y `service_types` con IDs desde 1; la línea de servicio toma el tipo por nombre.]**
- [X] T049 **VERIFICACIÓN**: sobre una base limpia, correr migraciones 001–021 y `apply-seeds.mjs` **dos veces**; comparar conteos entre corridas (idénticos), comprobar que un ajuste cambiado entre corridas conserva su valor y que el ticket 9001 muestra «Próximo servicio» por la API con las cuentas de ejemplo; guardar la salida como evidencia. **Pedir autorización explícita antes de recrear una base** (depende de T048) [FR-029][CA-12] **[Resultado 2026-11-23: `docs/evidencias/sprint-7-configuracion/doble-corrida-seeds-p1.mjs --vaciar` sobre `motorix_test` (solo esa base; se vació y reinició sus contadores porque los seeds fijan IDs de vehículos 1–4): conteos idénticos entre las corridas 1 y 2, y un ajuste y un tipo editados entre corridas se conservan en la 3 (salida en `seeds-doble-corrida.txt`). Con la API sobre `motorix_test`, `verificar-p1-api.mjs` (salida en `verificar-p1-api-corrida.txt`): el ticket 9001 muestra «Próximo servicio» (36,200 km y emisión + 180 días) y el ticket de la orden 4 no.]**
- [X] T050 **VERIFICACIÓN de cifras absolutas**: con `motorix_test` recreada (migraciones 001–021 y seeds 001–010) ejecutar `docs/evidencias/aseguramiento/quickstart-005.mjs` y revisar sus cifras absolutas frente a la orden 9001, su pago y su ticket (y las citadas en los quickstarts de la 006 y la 007); **no editar el script**: documentar las diferencias y consultarlas antes de decidir. **Pedir autorización antes de recrear una base** (depende de T049) [CA-12][CA-13] **[Resultado 2026-11-23: `quickstart-005.mjs` (sin editar) con migraciones 001–021 y seeds 001–010 sobre `motorix_test`: 65/65 verificaciones OK, salida en `quickstart-005-corrida-sprint-7.txt`. Sin diferencias: el guion solo usa las órdenes 2 y 4, las refacciones, el stock y los movimientos, que la orden 9001 no altera (la 009 del Sprint 6 tampoco los alteraba). Cifras de las quickstarts de las specs 006 y 007: sin cambio por esta tarea.]**

---

## Fase 8: Cierre del bloque P1

- [X] T051 [P] Actualizar `docs/project-context.md`: nueva sección 6.13 «Configuración y catálogo» (ajustes, límites, valores de respaldo, catálogo, línea con tipo, propuesta, instantánea y «Próximo servicio» del ticket en 6.10); **corregir la tabla de «Estándar de usuarios y contraseñas del MVP» con las contraseñas sembradas reales (`Admin123`, `Recepcion123`, `Mecanico123`)** y aclarar que cumplen la política (RN-17) [FR-031][CA-15] **[Hecho 2026-11-23: `docs/project-context.md` secciones 6.13 (nueva), 6.10 y 6.6 ampliadas, nota de actualización en 6.12 y tabla de contraseñas corregida (`Admin123`, `Recepcion123`, `Mecanico123`, que cumplen la política RN-17); limitaciones documentadas (sin helmet ni bloqueo por intentos, tickets anteriores sin instantánea, P2 y P3 pendientes).]**
- [X] T052 [P] Actualizar `docs/design-system.md`: pantalla Configuración (tarjetas «Datos del taller» y «Operación»), «Catálogo de servicios», selector de tipo en la línea y línea «Próximo servicio» del ticket (estados 8.4) [FR-031][CA-15] **[Hecho 2026-11-23: `docs/design-system.md` sección 8.8 (Configuración, Catálogo de servicios, Agregar servicio, Proponer desde una orden y «Próximo servicio» del ticket, con estados 8.4 y confirmación 8.5).]**
- [X] T053 [P] Actualizar `database/README.md` con las migraciones 019–021, el seed 010, la nota de idempotencia, el salto de `AUTO_INCREMENT` solo en las tablas existentes que reciben IDs 9001+ (las tablas nuevas usan IDs desde 1) y el **orden obligatorio: migraciones → seeds → servidor** [FR-031][CA-15] **[Hecho 2026-11-23: `database/README.md` con las migraciones 019–021, el seed 010, la regla de IDs (desde 1 en tablas nuevas; 9001 solo en tablas existentes), el salto de `AUTO_INCREMENT` en esas tablas, la nota de que los seeds 003–009 exigen contadores en 1 y el orden migraciones → seeds → servidor.]**
- [X] T054 [P] Agregar a `server/.env.example` un comentario que indica que los datos del taller y los márgenes ya no se configuran por entorno (viven en `settings`) y que no hay variables `SHOP_*`; no se agregan variables ni secretos [FR-031][CA-15] **[Hecho 2026-11-23: comentario en `server/.env.example` (sin variables ni secretos nuevos; no hay `SHOP_*`).]**
- [X] T055 Buscar y corregir en `server/` y `client/lib/` los comentarios y docstrings que queden desactualizados (por ejemplo «constante del negocio» en `ticket-service.js`, «el Sprint 7 podrá volverlas configurables» en `maintenance-state.js` y `notification-service.js`, la cabecera de `app_shell.dart`); registrar el resultado de la búsqueda aunque no haya coincidencias y revisar el diff de P1 contra el plan (solo los archivos del plan, sin dependencias nuevas) [CA-15] **[Resultado 2026-11-23: búsqueda en `server/` y `client/lib/` de «constante del negocio», «podrá volverlas configurables», «márgenes constantes» y `TALLER`: los comentarios de `ticket-service.js`, `maintenance-state.js`, `notification-service.js` y la cabecera de `app_shell.dart` ya se actualizaron en las tareas de código; sin más coincidencias (solo la referencia histórica en `settings-defaults.js`). Diff de P1 contra el plan: solo los archivos del plan más los del diálogo «Agregar servicio» (`add_service_dialog.dart`, `service_order.dart` y `orders_provider.dart`, anotado en `plan.md`); sin cambios en `package.json` ni `pubspec.yaml` (sin dependencias nuevas).]**
- [X] T056 Tomar las capturas del bloque P1 en `docs/evidencias/sprint-7-configuracion/` (las toma el usuario) con estos nombres: `s7-00-configuracion-taller.png`, `s7-01-configuracion-operacion.png`, `s7-02-catalogo-servicios.png`, `s7-03-linea-con-tipo.png`, `s7-04-ticket-proximo-servicio.png`, `s7-05-propuesta-mantenimiento.png` [CA-1][CA-2][CA-4][CA-5][CA-14] **[Hecho 2026-11-24: las seis capturas `s7-00` a `s7-05` existen en `docs/evidencias/sprint-7-configuracion/` (tomadas por el usuario); la guía quedó en `guia-capturas-p1.md`.]**
- [X] T057 Ejecutar los escenarios E1 a E4 de `quickstart.md` sobre `motorix_test` recreada y registrar el resultado. **Pedir autorización antes de recrear una base** [CA-1][CA-2][CA-3][CA-4][CA-5][CA-10][CA-12][CA-14] **[Resultado 2026-11-23: E1 con `doble-corrida-seeds-p1.mjs`; E2 a E4 con `escenarios-p1-api.mjs` (38 verificaciones OK, salida en `escenarios-p1-api-corrida.txt`) sobre `motorix_test` con la API real; las partes visuales de E2 a E4 (pantallas) las cubren las pruebas de Flutter y las capturas del usuario (T056). `motorix_test` no se recreó: se vació y se reinició con el script; no se tocó `motorix`.]**
- [X] T058 Corrida de suites del bloque: `npm test` en `server/`, `flutter test` y `flutter analyze` en `client/`; todas las suites previas y las nuevas de P1 en verde; revisión contra la constitución (español, permisos en backend, sin secretos, sin dependencias nuevas) [FR-030][CA-13] **[Resultado 2026-11-23: `npm test` 86 suites y 691 pruebas en verde; `flutter test` 153 pruebas en verde; `flutter analyze` con los mismos 5 avisos informativos previos, sin errores. Revisión contra la constitución: español en documentos, comentarios y pruebas; permisos validados en el backend (`requireRole` y servicio); sin secretos ni variables nuevas en `.env.example`; sin dependencias nuevas en `package.json` ni `pubspec.yaml`; migraciones aditivas numeradas; seeds idempotentes. **LÍNEA DE CORTE 1 alcanzada** salvo las capturas pendientes del usuario (T056).]**

> ### ✂️ LÍNEA DE CORTE 1 — fin del bloque P1
> Con T058 verde y commiteado por el usuario, **el sprint puede cerrarse aquí**: configuración, catálogo, propuesta y próximo servicio funcionan, con seeds, documentos y evidencias. P2 y P3 se documentan como trabajo futuro.

---

# BLOQUE P2 — SEGURIDAD Y TÉRMINOS (US5, US6, US7)

## Fase 9: Base común del bloque P2 (bloquea las historias P2)

- [X] T059 [P] Escribir `server/tests/integration/migrations-022-023.test.js`: existen `audit_log` (FK `user_id` nula, índices por fecha, usuario y acción), `terms_versions` (`version` única) y `terms_acceptances` (`UNIQUE (user_id, terms_version_id)`, FKs); debe fallar antes de T060 [FR-011][FR-019][CA-20] **[Resultado 2026-11-24: 12 pruebas; fallaron antes de las migraciones (tablas inexistentes) y pasan ahora.]**
- [X] T060 Crear `database/migrations/022_create_audit_log.sql` (depende de T059) [FR-011] **[Hecho 2026-11-24: `database/migrations/022_create_audit_log.sql` con índices `idx_audit_created`, `idx_audit_user` e `idx_audit_action`.]**
- [X] T061 Crear `database/migrations/023_create_terms.sql` (depende de T060) [FR-019] **[Hecho 2026-11-24: `database/migrations/023_create_terms.sql` (sin datos; `uq_terms_version` y `uq_terms_acceptance`).]**
- [X] T062 Aplicar 022–023 sobre `motorix_test` y una base desechable (registro, segunda corrida sin repetir); T059 debe pasar. **Pedir autorización explícita antes de recrear una base** (depende de T059–T061) [CA-12] **[Resultado 2026-11-24: aplicadas sobre `motorix_test` con el helper y comprobadas con el runner (`DB_NAME=motorix_test`: 022 y 023 «Omitida (ya aplicada)» en la segunda corrida); T059 pasa dos corridas seguidas. No se creó una base desechable adicional ni se tocó `motorix`.]**
- [X] T063 Extender `limpiarTablas()` en `server/tests/helpers/db-test.js` para vaciar `audit_log`, `terms_acceptances` y `terms_versions` antes de `users` (helper; se agrega solo ahora que existen las tablas) (depende de T062) [CA-13] **[Hecho 2026-11-24: `limpiarTablas()` vacía `audit_log`, `terms_acceptances` y `terms_versions` antes de `users`; la prueba de T059 lo verifica.]**
- [X] T064 [P] Agregar a `server/utils/errors.js` `TERMS_NOT_ACCEPTED` (403) y `TERMS_VERSION_OUTDATED` (409) con mensajes en español [FR-021][CA-19] **[Hecho 2026-11-24: `errores.terminosNoAceptados()` (403 `TERMS_NOT_ACCEPTED`) y `errores.terminosVersionDesactualizada()` (409 `TERMS_VERSION_OUTDATED`). `npm test`: 87 suites y 703 pruebas en verde sin editar las previas.]**

**Punto de control**: esquema P2 aplicado; suites previas (incluido P1) en verde.

---

## Fase 10: US5 — Bitácora de acciones sensibles (Prioridad: P2)

**Objetivo**: ADMIN consulta quién hizo qué y cuándo; nadie edita ni borra la bitácora.

**Prueba independiente**: ejecutar cada acción auditada y consultar la bitácora (E6 del quickstart).

### Pruebas de US5 (escribirlas primero; deben fallar) ⚠️

- [X] T065 [P] [US5] Escribir `server/tests/unit/audit-detail.test.js`: la función pura que arma el `detalle` trunca el identificador a 100 caracteres, nunca incluye importes de precio de compra, ni contraseñas, hashes o tokens, y devuelve los textos del contrato para cada acción; debe fallar antes de T069 [FR-012][FR-013][CA-21] **[Resultado 2026-11-24: 14 pruebas; fallaron antes (módulo inexistente) y pasan ahora.]**
- [X] T066 [P] [US5] Crear `server/tests/integration/audit-log.test.js`: cada acción de `data-model.md` sección 4 genera su entrada (inicio de sesión fallido con cuenta existente, inexistente e inactiva; alta, baja, reactivación y cambio de rol —sin entrada si el rol no cambia—; cambio de ajustes con las claves; precio de venta con anterior y nuevo; precio de compra **sin importes**); filtros por fecha, usuario y acción; paginación de 50 con orden descendente; **ninguna entrada contiene** la contraseña usada en la prueba, el prefijo `$2b$` ni un token; no existen rutas `PUT`, `PATCH`, `DELETE` ni de exportación (404); que una falla de escritura de la bitácora no interrumpe la operación [FR-011][FR-012][FR-013][FR-014][CA-20][CA-21] **[Resultado 2026-11-24: 42 pruebas; fallaron antes de implementar (módulo inexistente) y pasan. Ajuste de la prueba: un identificador de más de 100 caracteres ya lo rechaza la validación del login (400, no es un fallo de credenciales), por lo que el truncado queda cubierto por `audit-detail.test.js` y la integración prueba 100 caracteres completos y 150 → 400 sin entrada. La prueba de «falla de la bitácora» renombra temporalmente la tabla `audit_log` en `motorix_test` (con `finally` que la restaura).]**
- [X] T067 [P] [US5] Crear `server/tests/contract/audit-log-roles.test.js`: sin token → 401; ADMIN 200; RECEPTIONIST y MECHANIC → `403 NO_AUTORIZADO`; filtros inválidos → 400 [FR-014][CA-20] **[Resultado 2026-11-24: 8 pruebas (401, 200, 403 con y sin filtros, 403 antes de validar filtros y 400 con filtro inválido).]**
- [X] T068 [P] [US5] Crear `client/test/audit_log_test.dart`: la sección «Bitácora» (solo ADMIN) lista entradas, filtra por fecha, usuario y acción, pagina de 50 en 50, estados cargando/vacío/error y no ofrece editar ni borrar [FR-014][CA-20] **[Resultado 2026-11-24: 15 pruebas de Flutter; fallaron antes (archivos inexistentes) y pasan.]**

### Implementación de US5

- [X] T069 [US5] Crear `server/utils/audit-detail.js` (función pura), `server/models/audit.js` (solo `INSERT` y `SELECT` paginado con filtros), `server/services/audit-service.js` (`registrar` best-effort con captura y log de errores; `listar`), `server/validators/audit-validator.js`, `server/controllers/audit-controller.js` y `server/routes/audit-routes.js` (`GET /api/audit-log`, `auth` + `requireRole('ADMIN')`), y montar en `server/app.js` (depende de T063, T065) [FR-011][FR-013][FR-014][CA-20][CA-21] **[Hecho 2026-11-24: `server/utils/audit-detail.js`, `models/audit.js`, `services/audit-service.js`, `validators/audit-validator.js`, `controllers/audit-controller.js` y `routes/audit-routes.js`, montada en `app.js` como `GET /api/audit-log` (solo ADMIN y solo lectura; sin rutas de edición, borrado ni exportación). Un error propio (`entityId` sin definir) lo atrapó la prueba de integración: el diseño «best-effort» lo dejó en el log del servidor sin afectar la operación.]** **[Diagnóstico 2026-11-24 tras la prueba manual del usuario («Bitácora vacía»): no se reprodujo en `motorix_test` con el proceso real `node server.js` (los dos fallos se guardan). Se agregó el diagnóstico de arranque en `server/server.js` (base conectada y disponibilidad de `audit_log`), un log más informativo en `audit-service.js` y la prueba `audit-login-servidor-real.test.js` (arranca el servidor real; falla si se quita el gancho). `npm test`: 91 suites y 772 pruebas.]**
- [X] T070 [US5] Registrar `LOGIN_FAILED` en `server/services/auth-service.js` (credenciales inválidas, cuenta inexistente o inactiva, con el identificador truncado) sin cambiar la respuesta ni el mensaje al usuario (depende de T069) [FR-012][CA-20] **[Hecho 2026-11-24: `auth-service.js` registra `LOGIN_FAILED` en cuenta inexistente, inactiva y contraseña incorrecta, sin cambiar la respuesta.]**
- [X] T071 [US5] Registrar `USER_CREATED`, `USER_DEACTIVATED`, `USER_REACTIVATED` y `USER_ROLE_CHANGED` en `server/services/user-service.js` (el autor viene del usuario autenticado; hay que pasarlo desde `server/controllers/user-controller.js`) sin cambiar las respuestas (depende de T069) [FR-012][CA-20] **[Hecho 2026-11-24: `user-service.js` (`USER_CREATED`, `USER_DEACTIVATED`, `USER_REACTIVATED` solo si el estado cambia y `USER_ROLE_CHANGED` solo si cambia el rol) y `user-controller.js` pasa `req.user` como autor (parámetro opcional: sin cambios de respuesta).]**
- [X] T072 [US5] Registrar `PART_SALE_PRICE_CHANGED` y `PART_PURCHASE_PRICE_CHANGED` en `server/services/part-service.js` (`editar`: solo cuando el valor cambia; sin importes en el precio de compra) sin cambiar las respuestas (depende de T069) [FR-012][CA-20] **[Hecho 2026-11-24: `part-service.js` `editar` registra `PART_SALE_PRICE_CHANGED` y `PART_PURCHASE_PRICE_CHANGED` solo si el valor cambia, y del precio de compra solo que cambió (sin importes). El alta no genera entrada.]**
- [X] T073 [US5] Registrar `SETTINGS_UPDATED` en `server/services/settings-service.js` (claves modificadas; sin entrada si no cambió ningún valor) (depende de T069) [FR-012][CA-20] **[Hecho 2026-11-24: `settings-service.js` `actualizar` registra `SETTINGS_UPDATED` con las claves cuyo valor efectivo cambió; guardar el mismo valor o el de respaldo no registra.]**
- [X] T074 [US5] Cliente: `client/lib/models/audit_entry.dart`, `client/lib/providers/audit_provider.dart`, `client/lib/screens/audit_log_screen.dart` (tabla, filtros, 50 por página) y la sección «Bitácora» (solo ADMIN) en `app_shell.dart` y `main.dart` (depende de T068, T069) [FR-014][CA-20] **[Hecho 2026-11-24: `client/lib/models/audit_entry.dart`, `providers/audit_provider.dart`, `screens/audit_log_screen.dart` (filtros de fecha AAAA-MM-DD, usuario y acción, 50 por página, solo lectura) y sección «Bitácora» (solo ADMIN) en `app_shell.dart` y `main.dart`.]**
- [X] T075 [US5] Ejecutar T065 a T068 hasta verlas pasar y repetir `npx jest auth users parts settings` en `server/` (suites previas sin editar) [CA-20][CA-21][CA-13] **[Resultado 2026-11-24: `npm test` 90 suites y 768 pruebas en verde (las 3 nuevas de P2 de este tramo más las 87 previas, sin editarlas); `flutter test` 168 pruebas en verde; `flutter analyze` con los mismos 5 avisos informativos previos.]**

**Punto de control**: US5 verificable; la bitácora registra sin exponer secretos.

---

## Fase 11: US6 — Contraseñas, sesión por inactividad y respuestas sin datos reservados (Prioridad: P2)

**Objetivo**: política de contraseñas verificada, token renovable con la actividad, cierre por inactividad y pruebas de no exposición e inyección.

**Prueba independiente**: E7 y E8 del quickstart.

### Pruebas de US6 (escribirlas primero; deben fallar) ⚠️

- [X] T076 [P] [US6] Crear `server/tests/integration/password-policy.test.js`: crear usuario y cambiar contraseña rechazan cada condición (menos de 8, sin mayúscula, sin minúscula, sin número) con `400 CONTRASENA_INVALIDA` y mensaje que nombra la regla; una válida se acepta y en base el valor es un hash bcrypt (`$2b$`) distinto del texto; las contraseñas de los seeds (`Admin123`, `Recepcion123`, `Mecanico123`) cumplen `cumplePoliticaContrasena` [FR-015][CA-22] _Verificada: 29 pruebas; la política ya existía y se cumple en alta y cambio._
- [X] T077 [P] [US6] Crear `server/tests/integration/session-renewal.test.js`: el token del login vence a los `session.inactivity_minutes` vigentes (30 sin fila; 10 con fila) y la respuesta incluye `inactividadMinutos`; `POST /api/auth/renew` con token vigente devuelve un token nuevo de esa vigencia; token vencido, firmado con otro secreto o de un usuario desactivado → `401 SESION_EXPIRADA`; **`GET /api/notifications` y las demás rutas nunca emiten ni modifican token**; el backend sigue rechazando tokens vencidos; `PUT /api/settings` con `seguridad.minutosInactividad` (5 a 120) lo guarda y fuera de límites → 400, y el `GET` ya trae el grupo `seguridad` [FR-016][CA-23] _Verificada: vigencia, `inactividadMinutos`, `POST /api/auth/renew`, ningún otro endpoint emite token._
- [X] T078 [P] [US6] Crear `server/tests/contract/no-exposure.test.js`: recorre `users` (solo ADMIN), `parts`, `orders`, `payments` y `tickets` (`GET /api/tickets/:orderId`, solo ADMIN y RECEPTIONIST; MECHANIC debe recibir 403) con los listados, detalles, altas y cambios que cada rol puede ejecutar, y comprueba que ningún cuerpo contiene `passwordHash`, `password_hash`, el prefijo `$2b$`, un token (salvo en login y renew) ni, para RECEPTIONIST y MECHANIC, `purchasePrice` o su importe [FR-017][CA-24] _Verificada: 14 pruebas con los tres roles; comprobada por mutación (exponer `passwordHash` en el login la hace fallar)._
- [X] T079 [P] [US6] Crear `server/tests/integration/injection-search.test.js`: primero enumerar y anotar en la prueba los parámetros de búsqueda de los `GET` existentes (`texto` en citas y órdenes, `q` en refacciones, los de clientes, vehículos, usuarios y mantenimientos); enviar `' OR 1=1 --`, `"; DROP TABLE users; --`, `%`, `_` y `\` a cada uno y comprobar 200 o 400 controlados, sin 500, sin trazas y con las tablas intactas [FR-018][CA-25] _Verificada: parámetros enumerados en la cabecera de la prueba; reveló los hallazgos de T083._
- [X] T080 [P] [US6] Crear `client/test/session_inactivity_test.dart` (reloj falso): sin actividad durante la vigencia se cierra la sesión y el login muestra «Tu sesión se cerró por inactividad.»; con actividad se renueva el token **a lo sumo una vez por `vigencia/3`** (mínimo 60 s) y sin renovaciones en paralelo; la consulta periódica de avisos **no** cuenta como actividad ni renueva; una renovación con 401 cierra la sesión; el temporizador se cancela al cerrar sesión [FR-016][CA-23] _Verificada: 27 pruebas con reloj falso en `session_inactivity_test.dart`._

### Implementación de US6

- [X] T081 [US6] Backend de sesión: `firmarToken(usuario, minutos = SESION_MINUTOS)` en `server/middlewares/auth.js` (conservando `SESION_MINUTOS` exportado), `login` en `server/services/auth-service.js` firma con `obtenerAjustes()` y responde `inactividadMinutos`, y `renovar` más su controlador y `POST /renew` en `server/routes/auth-routes.js` (por ahora con `auth`; T093 lo cambia a `authBase`); habilitar en `settings-service.js`, `settings-validator.js` y el controlador el grupo `seguridad` (`minutosInactividad`, 5 a 120) de `GET` y `PUT /api/settings` (depende de T019, T077) [FR-016][CA-23] _Hecho: `middlewares/auth.js`, `auth-service.js` (`renovar`), controlador, `POST /renew` y grupo `seguridad` en `GET`/`PUT /api/settings` (el validador conserva `incluirSeguridad` apagado por omisión; lo enciende el controlador)._
- [X] T082 [US6] Revisar los mensajes de `CONTRASENA_INVALIDA` en `server/validators/auth-validator.js` y `server/validators/user-validator.js` y, solo si falta nombrar alguna condición de la política, ajustar el texto sin cambiar códigos ni la regla `cumplePoliticaContrasena` (depende de T076) [FR-015][CA-22] _Sin cambios: los mensajes ya nombran las cuatro condiciones (8 caracteres, mayúscula, minúscula y número)._
- [X] T083 [US6] **Condicional**: si T079 revela una consulta que concatena texto del usuario o un error 500, corregirla con parámetros `?` y validación en el archivo afectado (modelo o validador); si no hay hallazgos, registrar «sin hallazgos» (depende de T079) [FR-018][CA-25] _Hallazgo corregido: no había concatenación SQL (todo usa parámetros), pero un `:id` no numérico, `fecha` inválida o `vehicleId` inválido daban 500. Ahora responden 400 `DATOS_INVALIDOS` con `middlewares/route-params.js` (10 routers) y validación en los controladores de citas y mantenimientos._
- [X] T084 [US6] Cliente de sesión: `client/lib/providers/session_provider.dart` (última actividad, temporizador de 15 s, regla `vigencia/3`, cierre por inactividad), `client/lib/widgets/session_activity.dart` (detector de puntero y teclado que solo registra la hora), ajustes en `client/lib/providers/auth_provider.dart` (guarda `inactividadMinutos`, mensaje de cierre por inactividad, renovación del token), `client/lib/screens/login_screen.dart` (mensaje) y `client/lib/main.dart` (envolver la app); `NotificationsProvider` no llama a la actividad (depende de T080, T081) [FR-016][CA-23] _Hecho: `session_provider.dart` (revisión cada 15 s; renueva con actividad pendiente a lo sumo cada `vigencia/3`, mínimo 60 s; reintento a los 60 s tras un fallo), `session_activity.dart`, ajustes en `auth_provider.dart` y `login_screen.dart`, y `ActividadSesion` en `MaterialApp.builder`. `NotificationsProvider` no se modificó ni conoce la sesión (lo verifica una prueba). _Corrección tras la prueba manual (2026-11-24): el token vence a la vez que la inactividad y un sondeo de avisos podía recibir el 401 antes de la revisión de 15 s, mostrando «Su sesión expiró»; ahora un 401 con inactividad cumplida (vigencia menos 60 s) se trata como cierre por inactividad (`AuthProvider.inactividadCumplida`, fijado por `SessionProvider`). 6 pruebas nuevas y verificación por mutación._
- [X] T085 [US6] Cliente: tarjeta «Seguridad» (minutos de inactividad, 5 a 120) en `client/lib/screens/settings_screen.dart` y su guardado en `settings_provider.dart` (depende de T028, T084) [FR-016][CA-23] _Hecho con `settings_security_test.dart` (13 pruebas); el modelo `AppSettings` tolera la ausencia del grupo `seguridad` (30)._
- [X] T086 [US6] Ejecutar T076 a T080 hasta verlas pasar y repetir `npx jest auth users notifications` y `flutter test` (en particular `login_screen_test.dart` y `notifications_refresh_test.dart`, sin editarlos) [CA-22][CA-23][CA-24][CA-25][CA-13] _Hecho: backend 95 suites y 875 pruebas; Flutter 208 pruebas; `login_screen_test.dart` y `notifications_refresh_test.dart` sin editar; `flutter analyze` con los 5 avisos informativos previos._

**Punto de control**: US6 verificable; las suites del Sprint 6 siguen en verde.

---

## Fase 12: US7 — Términos y condiciones y aviso de privacidad (Prioridad: P2)

**Objetivo**: todo usuario acepta la versión vigente antes de usar el sistema; el backend rechaza sin aceptación; el administrador publica versiones y ve aceptaciones.

**Prueba independiente**: E5 del quickstart.

### Pruebas de US7 (escribirlas primero; deben fallar) ⚠️

- [X] T087 [P] [US7] Crear `server/tests/integration/terms.test.js`: sin versión publicada no hay compuerta (`vigente: null`); con versión vigente, un usuario sin aceptación recibe `403 TERMS_NOT_ACCEPTED` en una ruta de cada módulo (`GET /api/clients`, `/api/notifications`, `/api/orders`, `/api/me`) y **no** en `GET /api/terms/current`, `POST /api/terms/accept`, `POST /api/auth/logout` ni `POST /api/auth/renew`; aceptar guarda usuario, versión y fecha y es idempotente; aceptar una versión anterior → `409 TERMS_VERSION_OUTDATED`; publicar una versión nueva (texto de 20 a 20,000 caracteres) la numera con máximo + 1 y exige aceptarla a todos incluido el autor; aceptaciones paginadas de 50; registra `TERMS_PUBLISHED`; el texto de `database/seeds/011_demo_terms.sql` contiene uso permitido, confidencialidad, cuentas personales, aviso de privacidad y la advertencia de plantilla [FR-019][FR-020][FR-021][FR-022][CA-16][CA-17][CA-18][CA-19] _Verificada: `terms.test.js` (43 pruebas, verificadas por mutación). El texto de `011_demo_terms.sql` se verifica en `seed-terms.test.js` (T096)._
- [X] T088 [P] [US7] Crear `server/tests/integration/terms-gate-queries.test.js`: una petición autenticada a `GET /api/me` con compuerta activa emite **una sola consulta** para autenticar y evaluar los términos (envolviendo `pool.query`), y `GET /api/notifications` de ADMIN se mantiene en **8 consultas o menos** [FR-021][CA-19] _Verificada: `terms-gate-queries.test.js`; `GET /api/me` emite 1 consulta y `GET /api/notifications` de ADMIN ≤ 8. Reveló el hallazgo de `payment-routes.js` (ver T093)._
- [X] T089 [P] [US7] Crear `server/tests/contract/terms-roles.test.js`: RECEPTIONIST y MECHANIC → 403 en `POST /api/terms` y `GET /api/terms/acceptances`; los tres roles autenticados pueden `GET /api/terms/current` y `POST /api/terms/accept`; sin token → 401 [FR-022][CA-18] _Verificada: `terms-roles.test.js` (sin token, RECEPTIONIST, MECHANIC, ADMIN y rutas de edición inexistentes)._
- [X] T090 [P] [US7] Crear `client/test/terms_acceptance_test.dart`: tras el login, si falta aceptar se muestra la pantalla con términos y aviso; «Aceptar» entra; «Rechazar» pide confirmación, cierra la sesión y vuelve al login; un `403 TERMS_NOT_ACCEPTED` en cualquier petición lleva a la pantalla; sin pendiente no se muestra [FR-020][CA-16][CA-17] _Verificada: `terms_acceptance_test.dart` (19 pruebas, con mutaciones: sin callback del 403, sin guarda de 403 repetidos y «Rechazar» sin cerrar sesión)._
- [X] T091 [P] [US7] Crear `client/test/terms_admin_test.dart`: la sección «Términos» (solo ADMIN) muestra la versión vigente y las aceptaciones, publica una versión nueva con confirmación y valida longitudes [FR-022][CA-18] _Verificada: `terms_admin_test.dart` (21 pruebas, con mutación: publicar sin confirmación)._

### Implementación de US7

- [X] T092 [US7] Crear `server/models/terms.js`, `server/services/terms-service.js`, `server/validators/terms-validator.js`, `server/controllers/terms-controller.js` y `server/routes/terms-routes.js` (`GET /current` y `POST /accept` con `authBase`; `POST /` y `GET /acceptances` con `auth` + `requireRole('ADMIN')`), registrar `TERMS_PUBLISHED` con el servicio de bitácora y montar en `server/app.js` (depende de T064, T069, T087, T089) [FR-019][FR-020][FR-022][CA-17][CA-18] _Hecho: modelo, servicio, validador, controlador y rutas de términos; `TERMS_PUBLISHED` en la bitácora sin guardar el texto; montado en `app.js`. Detalle: `publicar` y `acceptances` usan `auth` (con compuerta), así que un ADMIN debe aceptar la vigente antes de publicar la siguiente._
- [X] T093 [US7] Actualizar `server/middlewares/auth.js`: exportar `authBase` (comportamiento actual) y `auth` = `authBase` + compuerta, con la versión vigente y la aceptación en **la misma consulta** del usuario (subconsultas); responder `403 TERMS_NOT_ACCEPTED` cuando corresponda; cambiar a `authBase` solo `POST /logout` y `POST /renew` en `server/routes/auth-routes.js` y las dos rutas de términos; ninguna otra ruta cambia (depende de T088, T092) [FR-021][CA-19] _Hecho: `auth.js` exporta `authBase` y `auth` (consulta única con subconsultas); `logout` y `renew` pasan a `authBase`. Hallazgo corregido: `payment-routes.js` usaba `paymentRoutes.use(auth)` montado en `/api`, por lo que toda ruta montada después (`/me`, `/notifications`, `/settings`, `/terms`…) autenticaba dos veces y bloqueaba las rutas exentas; ahora `auth` va en cada ruta de pagos (sin cambio de comportamiento de esas rutas)._
- [X] T094 [US7] Cliente: `client/lib/services/api_client.dart` (callback `onTerminosPendientes` ante `403 TERMS_NOT_ACCEPTED`), `client/lib/models/terms.dart`, `client/lib/providers/terms_provider.dart`, `client/lib/screens/terms_acceptance_screen.dart` (ruta `/terminos` desde el login y el callback), `client/lib/screens/terms_admin_screen.dart`, la sección «Términos» (solo ADMIN) en `app_shell.dart` y los registros en `main.dart` (depende de T090, T091, T093) [FR-020][FR-022][CA-16][CA-17][CA-18] _Hecho: `ApiClient.onTerminosPendientes`, `models/terms.dart`, `providers/terms_provider.dart` (escucha la sesión: consulta al iniciar y descarta su estado al cerrar), `screens/terms_acceptance_screen.dart` (ruta `/terminos`), `screens/terms_admin_screen.dart`, sección «Términos» (solo ADMIN) en `app_shell.dart` y registros en `main.dart`. `login_screen.dart` no se modificó: el aviso sale del proveedor al cambiar la sesión, así que `login_screen_test.dart` sigue sin editarse. La sección del shell se verifica con las capturas (el shell no tiene pruebas de widget en el proyecto)._
- [X] T095 [US7] Ejecutar T087 a T091 hasta verlas pasar y repetir **la suite completa** `npm test` en `server/` y `flutter test` en `client/` (la compuerta afecta a todas las rutas; las suites previas deben seguir en verde sin editarse) [CA-16][CA-17][CA-18][CA-19][CA-26][CA-13] _Hecho: backend 98 suites y 937 pruebas; Flutter 254 pruebas; `flutter analyze` con los 5 avisos informativos previos; ninguna prueba previa editada. Una corrida del backend ejecutada a la vez que Flutter falló `notifications-lectura` por lentitud (109 s); sola y en la repetición completa pasó._

**Punto de control**: US7 verificable; sin versión publicada el comportamiento es el de antes.

---

## Fase 13: Datos de ejemplo del bloque P2 (CA-12)

- [X] T096 [P] Crear `database/seeds/011_demo_terms.sql` (`ON DUPLICATE KEY UPDATE`; tablas nuevas, IDs desde 1): la versión 1 de los términos y el aviso de privacidad (plantilla en español con uso permitido, confidencialidad de clientes y vehículos, responsabilidad de las cuentas personales, aviso de privacidad y advertencia de que debe revisarla el taller) con `id = 1` y `version = 1`, y cuatro entradas de bitácora de ejemplo (ids 1–4) con fechas relativas; **sin filas en `terms_acceptances`** [FR-029][CA-12][CA-18] _Hecho: `database/seeds/011_demo_terms.sql` y `server/tests/integration/seed-terms.test.js` (14 pruebas, con mutaciones: sin la guarda de términos, sin las guardas de bitácora y con aceptaciones sembradas). Dos decisiones: (1) la versión 1 se inserta SOLO si `terms_versions` está vacía (si el administrador ya publicó cualquier versión, el seed no hace nada); (2) las cuatro entradas de bitácora NO usan ids fijos sino que se reconocen por su texto (cada detalle termina con «(ejemplo)»), porque en una base con bitácora real los ids 1–4 pueden estar ocupados; en una base nueva resultan los ids 1 a 4. Cierra el punto del texto del seed de T087._
- [X] T097 **VERIFICACIÓN**: sobre una base limpia, migraciones 001–023 y seeds 001–011 **dos veces**: sin duplicados, la bitácora muestra las cuatro entradas, cada cuenta de demostración ve la pantalla de aceptación en su primer inicio de sesión y no se repite tras aceptar; guardar la salida. **Pedir autorización antes de recrear una base** (depende de T096) [FR-029][CA-12][CA-16] _Verificada: `docs/evidencias/sprint-7-configuracion/doble-corrida-seeds-p2.mjs` (salida en `seeds-doble-corrida-p2.txt`, TODO OK): migraciones 001–023 y seeds 001–011 dos veces con conteos idénticos, una versión (id 1), 0 aceptaciones, 4 entradas de bitácora (ids 1–4), las tres cuentas reciben 403 en su primer inicio de sesión y no se repite tras aceptar, y un seed posterior conserva las aceptaciones y la versión publicada por el administrador. No se recreó ninguna base: `motorix_test` ya estaba vacía y quedó vacía._
- [X] T098 **VERIFICACIÓN de scripts de evidencia previos**: comprobar el efecto de la versión 1 sembrada sobre `docs/evidencias/aseguramiento/quickstart-005.mjs` y `docs/evidencias/sprint-6-notificaciones/verificar-avisos-api.mjs` (esperado: `403 TERMS_NOT_ACCEPTED` hasta aceptar vía `POST /api/terms/accept`); **no editar los scripts**: documentar el procedimiento para repetirlos (aceptar primero) y consultar al usuario si desea actualizarlos [CA-12][CA-13] _Verificada: `docs/evidencias/sprint-7-configuracion/efecto-terminos-scripts-previos.txt`. Con la versión 1 sembrada y sin aceptar, `verificar-avisos-api.mjs` falla (todo responde 403 `TERMS_NOT_ACCEPTED`) y `quickstart-005.mjs` aborta con código 2 y el mensaje engañoso «La API NO está conectada a motorix_test» (su marcador se consulta con `GET /api/parts`, que da 403). Tras aceptar con las tres cuentas (`POST /api/terms/accept`) ambos pasan (avisos: código 0; quickstart: 65/65). Scripts previos sin editar; procedimiento: aceptar primero. `verificar-p1-api.mjs` y `escenarios-p1-api.mjs` sí reciben el paso opcional `--aceptar-terminos` (corridas en `*-corrida-con-terminos.txt`)._

---

## Fase 14: Cierre del bloque P2

- [X] T099 [P] Actualizar `docs/project-context.md`: sección 6.14 «Seguridad y términos» (bitácora y su catálogo de acciones, política de contraseñas ya existente, renovación del token e inactividad, compuerta de términos y su excepción, no exposición de datos), entidades nuevas, y dejar constancia de que `helmet` y el bloqueo por intentos **no existen** y son trabajo futuro [FR-031][CA-15] _Hecho: sección 6.14 «Seguridad y términos» de `docs/project-context.md` (bitácora y su catálogo de 9 acciones, contraseñas, renovación e inactividad, compuerta y sus excepciones, no exposición e inyección, entidades) con las limitaciones: `helmet` y el bloqueo por intentos **no existen**. También se corrigieron 6.13 (la clave de inactividad ya se administra) y la línea de «Sesión y bloqueo» de las decisiones técnicas, que describía un bloqueo y una duración de 8 horas que nunca existieron._
- [X] T100 [P] Actualizar `docs/design-system.md`: pantalla de aceptación de términos, administración de términos, bitácora, tarjeta «Seguridad» y mensaje de cierre por inactividad (estados 8.4) [FR-031][CA-15] _Hecho: sección 8.9 de `docs/design-system.md` (tarjeta «Seguridad», mensaje de cierre por inactividad, bitácora, pantalla de aceptación y administración de términos, con estados 8.4). Se alinearon los diálogos de rechazar términos y publicar una versión con «Cancelar» y «Confirmar» (8.5)._
- [X] T101 [P] Actualizar `database/README.md` con las migraciones 022–023, el seed 011, la nota de que los scripts de evidencia previos requieren aceptar términos y el orden obligatorio [FR-031][CA-15] _Hecho: `database/README.md` con las migraciones 022 y 023, el seed 011 (y cómo aplicarlo solo), la nota de IDs, el orden obligatorio para el bloque P2 y la sección «Efecto del seed 011 sobre los scripts de evidencia anteriores» (aceptar primero)._
- [X] T102 Buscar y corregir comentarios y docstrings desactualizados por P2 (por ejemplo «El token expira a los 30 minutos» en `server/middlewares/auth.js`, «solo del lado del cliente» en `auth-controller.js`) y revisar el diff de P2 contra el plan; registrar el resultado [CA-15] _Hecho: comentarios corregidos en `settings-service.js` (ya expone `seguridad`), `settings-validator.js`, `auth-controller.js` (logout: el token no se revoca) y `auth-routes.js`; `middlewares/auth.js` ya estaba al día desde el tramo 3A. Revisión del diff de P2 contra el plan: todos los archivos nuevos coinciden con la estructura del plan; lo no previsto son hallazgos ya registrados (`route-params.js` y validaciones en controladores de citas y mantenimientos, T083; `payment-routes.js` con `auth` por ruta, T093; diagnóstico de arranque en `server.js`)._
- [X] T103 Tomar las capturas del bloque P2 en `docs/evidencias/sprint-7-configuracion/` (las toma el usuario): `s7-06-terminos-aceptacion.png`, `s7-07-terminos-admin.png`, `s7-08-bitacora.png`, `s7-09-bitacora-filtros.png`, `s7-10-contrasena-rechazada.png`, `s7-11-sesion-inactividad.png` [CA-16][CA-18][CA-20][CA-22][CA-23] _Hecha: las 6 evidencias existen en `docs/evidencias/sprint-7-configuracion/` con los nombres reales (equivalencia en `guia-capturas-p2.md`): `s7-10-aceptacion-terminos.png` (aceptación), `s7-11-terminos-admin.png` (administración), `s7-08-bitacora.png` y `s7-09-bitacora-filtros.png` (bitácora), `s7-07-inactividad-login.png` (inactividad), `s7-12-contrasena-rechazada.png` (contraseña rechazada, CA-22) y, además, `s7-06-seguridad-ajustes.png` (tarjeta Seguridad)._
- [X] T104 Ejecutar los escenarios E5 a E9 de `quickstart.md` sobre `motorix_test` recreada y registrar el resultado. **Pedir autorización antes de recrear una base** [CA-16][CA-17][CA-18][CA-19][CA-20][CA-21][CA-22][CA-23][CA-24][CA-25][CA-26][CA-12] _Hecho: E5 a E7 por la API con `docs/evidencias/sprint-7-configuracion/escenarios-p2-api.mjs` (71 verificaciones, TODO OK; salida en `escenarios-p2-api-corrida.txt`); E8 con Jest (`e8-no-exposicion-inyeccion.txt`: 2 suites, 52 pruebas); E9 con `doble-corrida-seeds-p2.mjs` (`seeds-doble-corrida-p2.txt`). Los pasos solo visibles en pantalla (rechazar con confirmación, cierre real por inactividad) los cubren las pruebas de Flutter y las capturas. No se recreó ninguna base con DROP: `motorix_test` se vació y se resembró (como en T049 y T097) y quedó vacía._
- [X] T105 Corrida de suites del bloque: `npm test` en `server/`, `flutter test` y `flutter analyze` en `client/`, todas las suites previas y las de P1 y P2 en verde; revisión contra la constitución [FR-030][CA-13][CA-26] _Hecho: backend 99 suites y 951 pruebas, Flutter 254 pruebas y `flutter analyze` con los 5 avisos informativos previos, cada suite ejecutada sola; revisión contra la constitución registrada. Salida en `pruebas-cierre-p2.txt`._

> ### ✂️ LÍNEA DE CORTE 2 — fin del bloque P2
> Con T105 verde y commiteado por el usuario, **el sprint puede cerrarse aquí** con P1 + P2 completos (configuración, catálogo, bitácora, términos, sesión). P3 se documenta como trabajo futuro; no queda ninguna migración ni ruta de reportes.

---

# BLOQUE P3 — REPORTES (LÍNEA DE CORTE) (US8, US9, US10, US11)

> **Solo se inicia con P1 y P2 completos, verificados y commiteados.** P3 no agrega migraciones (salvo la 024 condicional de T134).

## Fase 15: Base común del bloque P3

- [ ] T106 [P] Escribir `server/tests/unit/report-range.test.js`: `desde`/`hasta` inclusivos, `periodo=MES_ACTUAL` y `MES_ANTERIOR` con un «hoy» fijo (incluidos enero y fin de mes), fecha final anterior a la inicial, rango de más de 366 días, formatos inválidos y ausencia de rango; debe fallar antes de T107 [FR-023][CA-6]
- [ ] T107 Crear `server/utils/report-range.js` (función pura con hora local) y hacer pasar T106 (depende de T106) [FR-023][CA-6]
- [ ] T108 [P] Escribir `server/tests/unit/csv.test.js`: BOM `﻿`, comillas dobles escapadas, comas y saltos de línea dentro de celdas, `\r\n`, acentos y eñes, importes con punto y dos decimales y **neutralización** de celdas que empiezan con `=`, `+`, `-`, `@`, tabulador o retorno de carro; debe fallar antes de T109 [FR-027][CA-9]
- [ ] T109 Crear `server/utils/csv.js` (función pura) y hacer pasar T108 (depende de T108) [FR-027][CA-9]
- [ ] T110 [P] Agregar a `server/utils/errors.js` `RANGO_INVALIDO` (400) y `REPORT_NOT_FOUND` (404) con mensajes en español [FR-023][CA-6]
- [ ] T111 Crear `server/validators/report-validator.js` (rango, `pagina`, `limite` de 1 a 100, nombre de reporte) con funciones puras y mensajes en español (depende de T107, T110) [FR-023][FR-028][CA-11]
- [ ] T112 Verificar y registrar: (a) cómo `client/lib/services/ticket_print.dart` escribe y abre archivos con `dart:io`, para reutilizar el mecanismo en la exportación sin dependencias; (b) que `payments`, `order_parts`, `inventory_movements` y `order_labor` tienen los índices que usarán los reportes (`idx_payments_status`, `idx_op_order`, `idx_mov_part`, `idx_order_labor_order`); si falta alguno, anotarlo para T134 [FR-027][CA-11]

---

## Fase 16: US8 — Ingresos por periodo (Prioridad: P3)

**Objetivo**: el administrador consulta los ingresos por periodo con filtro de fechas.

**Prueba independiente**: E10 del quickstart (parte de ingresos).

### Pruebas de US8 (escribirlas primero; deben fallar) ⚠️

- [ ] T113 [P] [US8] Crear `server/tests/integration/reports-income.test.js`: solo pagos `COMPLETED` (no `PENDING`, `EXPIRED` ni `STALE`); rango inclusivo en hora local; atajos de mes; agrupación por día (≤ 62 días) o mes; por método; centavos enteros que coinciden con la suma de los pagos insertados; coincide con el criterio del panel de control (`GET /api/dashboard`) para el mismo mes; rango sin pagos → totales 0 y listas vacías; rango inválido → `400 RANGO_INVALIDO` [FR-023][FR-024][CA-6][CA-7]
- [ ] T114 [P] [US8] Crear `server/tests/contract/reports-roles.test.js` con el bloque de ingresos: sin token → 401; ADMIN 200 con la forma del contrato; RECEPTIONIST y MECHANIC → `403 NO_AUTORIZADO` [FR-028][CA-10]
- [ ] T115 [P] [US8] Crear `client/test/reports_income_test.dart`: la sección «Reportes» (solo ADMIN) muestra el filtro de rango con «Mes actual» y «Mes anterior», los totales y el desglose, el estado vacío y el error sin trazas [FR-023][CA-6]

### Implementación de US8

- [ ] T116 [US8] Crear `server/models/report.js` (consulta de ingresos) y `server/services/report-service.js` (`ingresos(rango)` con `aCentavos`, agrupación y estructura única reutilizable por la exportación) (depende de T111, T113) [FR-023][FR-024][CA-7]
- [ ] T117 [US8] Crear `server/controllers/report-controller.js` y `server/routes/report-routes.js` con `GET /api/reports/income` (`auth` + `requireRole('ADMIN')`) y montar en `server/app.js` (depende de T116, T114) [FR-028][CA-10]
- [ ] T118 [US8] Cliente: `client/lib/models/report.dart`, `client/lib/providers/reports_provider.dart`, `client/lib/screens/reports_screen.dart` (pestaña Ingresos y filtro de rango), la sección «Reportes» (solo ADMIN) en `app_shell.dart` y el registro en `main.dart` (depende de T115, T117) [FR-023][CA-6]
- [ ] T119 [US8] Ejecutar T113 a T115 hasta verlas pasar y repetir `npx jest dashboard payments` (suites previas sin editar) [CA-6][CA-7][CA-13]

**Punto de control**: US8 verificable.

---

## Fase 17: US9 — Servicios más frecuentes y productividad por mecánico (Prioridad: P3)

### Pruebas de US9 (escribirlas primero; deben fallar) ⚠️

- [ ] T120 [P] [US9] Crear `server/tests/integration/reports-services-productivity.test.js`: población = órdenes `TERMINADO` o `ENTREGADO` con `status_changed_at` en el rango (las canceladas y las fuera del rango no cuentan); servicios agrupados por tipo y «Sin tipo» con cantidad e importe en centavos, por frecuencia; productividad por mecánico con número de órdenes e importe de mano de obra, «Sin asignar» para `mechanic_id` nulo [FR-023][FR-024][FR-026][CA-6][CA-7]
- [ ] T121 [US9] Agregar a `server/tests/contract/reports-roles.test.js` (depende de T114) los endpoints `services` y `productivity`: ADMIN 200 y los demás roles 403 [FR-028][CA-10]
- [ ] T122 [P] [US9] Crear `client/test/reports_services_productivity_test.dart`: pestañas «Servicios» y «Productividad» con sus tablas, «Sin tipo» y «Sin asignar», estados vacío y error [FR-026][CA-6]

### Implementación de US9

- [ ] T123 [US9] Agregar a `server/models/report.js` y `server/services/report-service.js` las consultas y estructuras de servicios y productividad (depende de T116, T120) [FR-023][FR-026][CA-6][CA-7]
- [ ] T124 [US9] Agregar `GET /api/reports/services` y `GET /api/reports/productivity` al controlador y a las rutas (depende de T117, T121, T123) [FR-028][CA-10]
- [ ] T125 [US9] Cliente: pestañas «Servicios» y «Productividad» en `reports_screen.dart` y métodos en `reports_provider.dart` (depende de T118, T122, T124) [FR-026][CA-6]
- [ ] T126 [US9] Ejecutar T120 a T122 hasta verlas pasar y repetir `npx jest orders` (suites previas sin editar) [CA-6][CA-13]

**Punto de control**: US9 verificable.

---

## Fase 18: US10 — Rentabilidad de refacciones y rotación de inventario (Prioridad: P3)

### Pruebas de US10 (escribirlas primero; deben fallar) ⚠️

- [ ] T127 [P] [US10] Crear `server/tests/integration/reports-parts-rotation.test.js`: usos de órdenes cerradas del periodo con ventas = `unit_price × quantity`, costo = precio de compra **vigente** × cantidad y margen en centavos; líneas sin precio de compra marcadas «sin costo» y **excluidas** del margen y de los totales de costo (nunca costo 0); líneas sin precio de venta «sin precio»; paginación (`pagina`, `limite` máximo 100); rotación = unidades `OUT` del rango entre la existencia actual, «sin existencia» con stock 0, refacciones inactivas excluidas [FR-023][FR-024][FR-025][FR-026][CA-6][CA-7][CA-8][CA-11]
- [ ] T128 [US10] Agregar a `server/tests/contract/reports-roles.test.js` (depende de T121) los endpoints `parts` y `rotation`: ADMIN 200; RECEPTIONIST y MECHANIC → 403 y **ninguna respuesta de estos roles contiene `purchasePrice` ni importes de compra** [FR-025][FR-028][CA-8][CA-10]
- [ ] T129 [P] [US10] Crear `client/test/reports_parts_rotation_test.dart`: pestañas «Refacciones» (costo, precio, margen, «sin costo», totales) y «Rotación» («sin existencia»), paginación y estados vacío y error [FR-025][FR-026][CA-8]

### Implementación de US10

- [ ] T130 [US10] Agregar a `server/models/report.js` y `server/services/report-service.js` las consultas y estructuras de refacciones y rotación (agregación en SQL, sin consultas por fila) (depende de T123, T127) [FR-025][FR-026][CA-7][CA-8][CA-11]
- [ ] T131 [US10] Agregar `GET /api/reports/parts` y `GET /api/reports/rotation` al controlador y a las rutas (depende de T124, T128, T130) [FR-028][CA-10]
- [ ] T132 [US10] Cliente: pestañas «Refacciones» y «Rotación» en `reports_screen.dart` y `reports_provider.dart` (depende de T125, T129, T131) [FR-025][FR-026][CA-8]
- [ ] T133 [US10] Crear `server/tests/integration/reports-performance.test.js` contra `motorix_test` (después de implementar los reportes): siembra por SQL masivo 1,000 órdenes cerradas en el rango, 3,000 usos de refacciones, 500 refacciones, 5,000 movimientos y 2,000 pagos; descarta un calentamiento, mide 5 llamadas por reporte (`income`, `services`, `productivity`, `parts`, `rotation`) con `performance.now()` y exige un **máximo menor de 2,000 ms** y **6 consultas SQL o menos** por petición (envolviendo `pool.query`) (depende de T130, T131) [FR-028][CA-11]
- [ ] T134 [US10] Ejecutar T133 y guardar los tiempos en `docs/evidencias/sprint-7-configuracion/reports-performance.txt`; **solo si algún reporte supera 2 s**, crear `database/migrations/024_reports_indexes.sql` (índices faltantes anotados en T112), aplicarla con autorización y repetir la medición; si no hace falta, no se crea [FR-028][CA-11]
- [ ] T135 [US10] Ejecutar T127 a T129 hasta verlas pasar y repetir `npx jest parts inventory` (suites previas sin editar) [CA-6][CA-8][CA-13]

**Punto de control**: US10 verificable y con rendimiento medido.

---

## Fase 19: US11 — Exportar reportes (Prioridad: P3)

### Pruebas de US11 (escribirlas primero; deben fallar) ⚠️

- [ ] T136 [P] [US11] Crear `server/tests/integration/reports-export.test.js`: cada reporte exporta `text/csv; charset=utf-8` con BOM y `Content-Disposition` con el nombre esperado; las filas, columnas e importes coinciden con la consulta JSON del mismo rango (se parsea el CSV en la prueba); `parts` incluye el precio de compra; una descripción que empieza con `=` sale neutralizada; `REPORT_NOT_FOUND` para un nombre inexistente; más de 10,000 filas → `400 RANGO_INVALIDO`; la exportación ignora `pagina` y `limite` [FR-027][CA-9]
- [ ] T137 [P] [US11] Crear `client/test/reports_export_test.dart`: el botón «Exportar CSV» pide el archivo al servidor con el mismo rango, lo guarda y muestra el resultado o el error sin trazas; no aparece para otros roles [FR-027][CA-9]
- [ ] T138 [US11] Agregar a `server/tests/contract/reports-roles.test.js` (depende de T128) la exportación de cada reporte: ADMIN 200 y los demás roles 403 [FR-028][CA-10]

### Implementación de US11

- [ ] T139 [US11] Agregar a `server/services/report-service.js` la conversión a filas de CSV de cada estructura (misma fuente que el JSON, con `server/utils/csv.js`) y `GET /api/reports/:reporte/export` al controlador y a las rutas, con las cabeceras del contrato (depende de T109, T131, T136, T138) [FR-027][FR-028][CA-9]
- [ ] T140 [US11] Cliente: «Exportar CSV» en `reports_screen.dart` y `reports_provider.dart` (descarga con el rango activo y guarda con `dart:io` usando el mecanismo de `ticket_print.dart`) (depende de T112, T137, T139) [FR-027][CA-9]
- [ ] T141 [US11] Ejecutar T136 a T138 hasta verlas pasar [CA-9][CA-13]

**Punto de control**: US11 verificable; cada archivo coincide con su pantalla.

---

## Fase 20: Datos de ejemplo del bloque P3 (CA-12)

- [ ] T142 [P] Crear `database/seeds/012_demo_reports.sql` (IDs desde 9001 porque inserta solo en tablas existentes; `ON DUPLICATE KEY UPDATE`): órdenes 9002–9007 cerradas en el mes anterior y el actual con mecánicos distintos y sin asignar, líneas de servicio con y sin tipo, mano de obra, pagos `COMPLETED` en ambos meses con métodos distintos, usos de refacciones con y sin precio de compra y movimientos `OUT` en el rango, de modo que cada reporte tenga datos al arrancar [FR-029][CA-12]
- [ ] T143 **VERIFICACIÓN**: migraciones 001–023 y seeds 001–012 **dos veces** sobre una base limpia: sin duplicados; los cinco reportes devuelven datos por la API con la cuenta `admin` y los importes cuadran con los datos del seed; guardar la salida. **Pedir autorización antes de recrear una base** (depende de T142) [FR-029][CA-12]
- [ ] T144 **VERIFICACIÓN de cifras absolutas**: revisar de nuevo los conteos de `quickstart-005.mjs` y de los quickstarts previos frente a las órdenes 9002–9007 y sus pagos y movimientos; **no editar el script**; documentar diferencias [CA-12][CA-13]

---

## Fase 21: Cierre del bloque P3

- [ ] T145 [P] Actualizar `docs/project-context.md`: sección 6.15 «Reportes» (los cinco reportes, población, atajos de periodo, centavos, costo vigente, limitaciones de fechas, exportación CSV y que son exclusivos de ADMIN) [FR-031][CA-15]
- [ ] T146 [P] Actualizar `docs/design-system.md`: pantalla Reportes (pestañas, filtro de rango, tablas, «sin costo» y «sin existencia», exportación, estados 8.4) [FR-031][CA-15]
- [ ] T147 [P] Actualizar `database/README.md` con el seed 012 (y la migración 024 solo si se creó) [FR-031][CA-15]
- [ ] T148 Buscar y corregir comentarios y docstrings desactualizados por P3 y revisar el diff contra el plan; registrar el resultado [CA-15]
- [ ] T149 Tomar las capturas del bloque P3 en `docs/evidencias/sprint-7-configuracion/` (las toma el usuario): `s7-12-reporte-ingresos.png`, `s7-13-servicios-productividad.png`, `s7-14-refacciones-margen.png`, `s7-15-rotacion.png`, `s7-16-exportacion-csv.png` [CA-6][CA-8][CA-9]
- [ ] T150 Ejecutar los escenarios E10 a E13 de `quickstart.md` sobre `motorix_test` recreada y registrar el resultado. **Pedir autorización antes de recrear una base** [CA-6][CA-7][CA-8][CA-9][CA-10][CA-11][CA-12]
- [ ] T151 Corrida de suites del bloque: `npm test` en `server/`, `flutter test` y `flutter analyze` en `client/` con todas las suites previas y las de P1, P2 y P3 en verde [FR-030][CA-13]

> ### ✂️ FIN DEL BLOQUE P3 — sprint completo

---

## Fase 22: Revisión final (se ejecuta al cierre del último bloque entregado)

- [ ] T152 Revisión final contra la constitución y `docs/reglas.md` del alcance entregado: español en documentos, comentarios y pruebas; permisos validados en backend; sin secretos ni variables nuevas en `.env.example`; sin dependencias nuevas en `package.json` ni `pubspec.yaml`; migraciones aditivas y numeradas; commits por Conventional Commits (a cargo del usuario); y confirmar que el alcance no entregado quedó documentado como trabajo futuro en `docs/project-context.md` [CA-13][CA-15]

---

## Trazabilidad CA → tareas

| CA | Pruebas (primero) | Implementación / verificación |
|---|---|---|
| CA-1 (P1) | T015, T017, T018 | T019, T020, T021, T022, T023, T056, T057 |
| CA-2 (P1) | T013, T024, T025 | T014, T026, T027, T028, T029 |
| CA-3 (P1) | T010, T013, T015, T017, T024 | T011, T014, T019, T021, T026, T029 |
| CA-4 (P1) | T004, T031, T034 | T012, T037, T038, T040, T042 |
| CA-5 (P1) | T030, T033, T035 | T036, T039, T041, T042 |
| CA-6 (P3) | T106, T113, T115, T120, T122, T127, T129 | T107, T116, T118, T123, T125, T130, T132, T135 |
| CA-7 (P3) | T113, T120, T127 | T116, T123, T130 |
| CA-8 (P3) | T127, T128, T129 | T130, T131, T132 |
| CA-9 (P3) | T108, T136, T137 | T109, T139, T140, T141 |
| CA-10 (P1, P3) | T016, T032, T033, T114, T121, T128, T138 | T020, T037, T039, T117, T124, T131, T139 |
| CA-11 (P3) | T127, T133 | T111, T130, T134 |
| CA-12 (P1, P2) | T049, T097, T143 (verificación) | T003, T008, T048, T050, T062, T096, T098, T142, T144 |
| CA-13 | T001, T010, T013, T015, T059, T066, T076, T087, T106, T113 | T023, T029, T042, T047, T058, T075, T086, T095, T105, T119, T126, T135, T141, T151, T152 |
| CA-14 (P1) | T043, T044 | T045, T046, T047, T056, T057 |
| CA-15 | — (revisión documental) | T051, T052, T053, T054, T055, T099, T100, T101, T102, T145, T146, T147, T148, T152 |
| CA-16 (P2) | T087, T090 | T092, T093, T094, T097 |
| CA-17 (P2) | T087, T090 | T092, T094 |
| CA-18 (P2) | T087, T089, T091 | T092, T094, T096 |
| CA-19 (P2) | T087, T088 | T093 |
| CA-20 (P2) | T059, T066, T067, T068 | T060, T069, T070, T071, T072, T073, T074 |
| CA-21 (P2) | T065, T066 | T069 |
| CA-22 (P2) | T076 | T082 |
| CA-23 (P2) | T077, T080 | T081, T084, T085 |
| CA-24 (P2) | T078 | — (verificación; correcciones en los archivos que la prueba señale) |
| CA-25 (P2) | T079 | T083 |
| CA-26 (P2) | T066, T076, T077, T078, T079, T087 | T095, T105 |

Todos los CA (CA-1 a CA-26) tienen al menos una tarea. CA-12 y CA-15 se validan por verificación documentada y revisión, no por Jest (los seeds y la documentación quedan fuera de las suites).

## Trazabilidad FR → tareas

| FR | Tareas |
|---|---|
| FR-001 | T004, T005, T015, T019 |
| FR-002 | T010, T011, T015, T017, T018, T019, T020, T022 |
| FR-003 | T004, T007, T017, T021 |
| FR-004 | T010, T013, T014, T024, T025, T026, T027, T028 |
| FR-005 | T010, T011, T015, T017, T019, T024 |
| FR-006 | T004, T006, T012, T031, T034, T037, T040 |
| FR-007 | T004, T006, T031, T038, T040 |
| FR-008 | T030, T033, T035, T036, T039, T041 |
| FR-009 | T030, T036, T043, T044, T045, T046 |
| FR-010 | T016, T020, T032, T037 |
| FR-011 | T059, T060, T066, T069 |
| FR-012 | T065, T066, T070, T071, T072, T073 |
| FR-013 | T065, T066, T069 |
| FR-014 | T066, T067, T068, T069, T074 |
| FR-015 | T076, T082 |
| FR-016 | T077, T080, T081, T084, T085 |
| FR-017 | T078 |
| FR-018 | T079, T083 |
| FR-019 | T059, T061, T087, T092 |
| FR-020 | T087, T090, T092, T094 |
| FR-021 | T064, T087, T088, T093 |
| FR-022 | T087, T089, T091, T092, T094 |
| FR-023 | T106, T107, T111, T113, T115, T116, T118, T120, T123, T127, T130 |
| FR-024 | T113, T116, T120, T123, T127, T130 |
| FR-025 | T127, T128, T129, T130, T132 |
| FR-026 | T120, T122, T123, T125, T127, T129, T130, T132 |
| FR-027 | T108, T109, T112, T136, T137, T139, T140 |
| FR-028 | T111, T114, T117, T121, T124, T128, T131, T133, T134, T138, T139 |
| FR-029 | T048, T096, T142 |
| FR-030 | T001, todas las tareas de pruebas y de ejecución de suites |
| FR-031 | T051, T052, T053, T054, T099, T100, T101, T145, T146, T147 |

## Dependencias y orden de ejecución

### Dependencias entre bloques y fases

- **Preparación (Fase 1)**: sin dependencias.
- **Bloque P1** (Fases 2 a 8): depende de la Fase 1; la Fase 2 bloquea las historias P1. Orden: US1 → US2 (usa `settings-service` de US1) → US3 → US4 (usa `next-service` y `findServicesWithTypes` de US3 y la instantánea de US1). Datos de ejemplo (Fase 7) después de US1 a US4; cierre (Fase 8) al final.
- **Bloque P2** (Fases 9 a 14): depende de que P1 esté **cerrado** (T058). La Fase 9 bloquea las historias P2. US5 (bitácora) primero porque US6 y US7 la usan (`TERMS_PUBLISHED`); US6 usa `settings` de US1 y `SessionProvider`; US7 cambia `auth.js` y por eso su tarea de ejecución (T095) corre **la suite completa**.
- **Bloque P3** (Fases 15 a 21): depende de que P2 esté **cerrado** (T105). US8 → US9 → US10 → US11 por los archivos compartidos (`report-service.js`, `reports-roles.test.js`, `reports_screen.dart`); US11 usa las estructuras de US8 a US10.
- **Revisión final (Fase 22)**: al cierre del último bloque entregado.

### Dependencias entre historias

- **US1 (P1)**: tras la Fase 2; sin dependencias de otras historias.
- **US2 (P1)**: tras US1 (T019 `settings-service`, T022 pantalla).
- **US3 (P1)**: tras la Fase 2; la lectura de órdenes y la ruta de mantenimientos no dependen de US1 y US2, pero los archivos `app_shell.dart` y `main.dart` se comparten por secuencia.
- **US4 (P1)**: tras US1 (instantánea) y US3 (`next-service`, tipos en líneas).
- **US5 (P2)**: tras la Fase 9; el gancho de ajustes (T073) requiere US1.
- **US6 (P2)**: tras US1 (T019, ajustes) y US5 solo por secuencia de archivos (`auth-service.js`, `user-service.js`).
- **US7 (P2)**: tras US5 (`audit-service`) y US6 (la ruta `renew`, T081, que T093 pasa a `authBase`).
- **US8 a US11 (P3)**: secuenciales por archivos compartidos; cada una verificable por separado.

### Dentro de cada historia

- Las pruebas se escriben primero y deben fallar antes de implementar.
- Modelos → servicios/controladores → rutas → cliente; cada historia termina con su tarea de ejecución de pruebas.

### Oportunidades de paralelismo

- Fase 2: T004, T010, T012 y T013 en paralelo.
- Cada historia: sus pruebas `[P]` (backend y Flutter) en paralelo; `reports-roles.test.js` y `report-service.js` se amplían en secuencia (sin `[P]`).
- Cierre de cada bloque: las tareas de documentos (`[P]`) en paralelo.
- Con varias personas, backend y cliente de una historia pueden avanzar a la vez coordinando `app.js`, `app_shell.dart` y `main.dart`.

## Estrategia de implementación

1. Fase 1 y bloque P1 (Fases 2 a 8) → validar E1 a E4 → **línea de corte 1**.
2. Bloque P2 (Fases 9 a 14) → validar E5 a E9 → **línea de corte 2**.
3. Bloque P3 (Fases 15 a 21) → validar E10 a E13.
4. Fase 22: revisión final.
5. Si el tiempo se agota, cortar en la línea de corte más reciente: el bloque en curso se descarta o se deja detrás de la rama sin fusionar; lo no entregado se documenta como trabajo futuro.

## Notas

- Los seeds 001 a 009 no se modifican; solo se agregan 010, 011 y 012.
- Verificar que cada prueba falle antes de implementar.
- Commits pequeños, en español y con Conventional Commits (por ejemplo `feat(settings): agregar configuración editable del taller`); los hace el usuario.
- No se agregan dependencias; no se editan pruebas existentes ni scripts de evidencia previos (si algo se rompe, detenerse y avisar).
- Las capturas `s7-NN` las toma el usuario; la tarea solo verifica nombres y contenido.
