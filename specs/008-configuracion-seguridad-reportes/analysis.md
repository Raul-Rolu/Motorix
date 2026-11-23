# Análisis de consistencia: Configuración, seguridad y reportes

**Feature**: `008-configuracion-seguridad-reportes` | **Fecha**: 2026-11-23 | **Fase**: `/speckit.analyze` (solo lectura del código; correcciones aplicadas únicamente en `specs/008-configuracion-seguridad-reportes/`)

Documentos revisados: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/api-rest.md`, `quickstart.md`, `tasks.md` y `checklists/requirements.md`, contra el código real (`middlewares/auth.js`, `routes/*`, `services/*`, `models/order.js`, `validators/*`, `client/lib/widgets/app_shell.dart`, `main.dart`, seeds y migraciones 001–018) y la constitución.

## 1. Cobertura

| Verificación | Resultado |
|---|---|
| Requisitos funcionales (FR-001 a FR-031) con al menos una tarea | **31 de 31** (comprobado con búsqueda: FR-030 solo figuraba en la tabla; se etiquetó en T001, T058, T105 y T151) |
| Criterios de aceptación (CA-1 a CA-26) con al menos una tarea | **26 de 26** (CA-12, CA-15 y CA-24 se cubren por verificación o prueba transversal, no por una suite propia; está indicado en la trazabilidad) |
| Historias (11) con pruebas antes de implementar | **11 de 11** (única excepción justificada: rendimiento de reportes, T133) |
| Tareas | **152**, sin IDs duplicados |
| Marcadores `[NEEDS CLARIFICATION]` abiertos | 0 |

**Tareas por bloque y fase**

| Bloque | Fase | Tareas | Rango |
|---|---|---|---|
| Común | 1 Preparación | 3 | T001–T003 |
| **P1** (55) | 2 Base común | 11 | T004–T014 |
| | 3 US1 Datos del taller | 9 | T015–T023 |
| | 4 US2 Márgenes | 6 | T024–T029 |
| | 5 US3 Catálogo | 13 | T030–T042 |
| | 6 US4 Próximo servicio | 5 | T043–T047 |
| | 7 Datos de ejemplo | 3 | T048–T050 |
| | 8 Cierre P1 | 8 | T051–T058 |
| **P2** (47) | 9 Base común | 6 | T059–T064 |
| | 10 US5 Bitácora | 11 | T065–T075 |
| | 11 US6 Contraseñas, sesión, exposición | 11 | T076–T086 |
| | 12 US7 Términos | 9 | T087–T095 |
| | 13 Datos de ejemplo | 3 | T096–T098 |
| | 14 Cierre P2 | 7 | T099–T105 |
| **P3** (46) | 15 Base común | 7 | T106–T112 |
| | 16 US8 Ingresos | 7 | T113–T119 |
| | 17 US9 Servicios y productividad | 7 | T120–T126 |
| | 18 US10 Refacciones y rotación | 9 | T127–T135 |
| | 19 US11 Exportar | 6 | T136–T141 |
| | 20 Datos de ejemplo | 3 | T142–T144 |
| | 21 Cierre P3 | 7 | T145–T151 |
| Final | 22 Revisión final | 1 | T152 |

## 2. Hallazgos y correcciones

### Severidad ALTA (3, corregidos)

| # | Hallazgo | Corrección aplicada |
|---|---|---|
| A1 | **Contradicción spec ↔ contrato.** La spec (FR-010, CA-10, SC-004, escenario 8 de la historia 3) decía que el catálogo es exclusivo de ADMIN, pero el contrato y la investigación abren la **lectura de tipos activos** a los tres roles (recepción y mecánico la necesitan para elegir el tipo de una línea). Con la redacción anterior una prueba de CA-10 habría exigido 403 en una consulta necesaria. | `spec.md`: FR-010, CA-10, SC-004 y escenario 8 ahora distinguen **administración** (solo ADMIN) y **consulta de tipos activos** (tres roles). Ya estaba reflejado en `contracts`, `research.md` D7, el plan (desviación 11) y T031/T032/T037. |
| A2 | **Corte P1/P2 con una pieza a medias.** El ajuste de inactividad (`session.inactivity_minutes`) se habría expuesto en `GET/PUT /api/settings` desde P1 sin tener efecto hasta P2 (la renovación del token es P2). Un corte tras P1 dejaría un campo editable que no hace nada. | `contracts/api-rest.md` (nota de bloques), `research.md` D2, `spec.md` (Supuestos) y `tasks.md` T015, T019, T077 y T081: la clave existe en la tabla y se siembra con su respaldo desde P1, pero el grupo `seguridad` solo se expone y se valida desde P2 (T081). |
| A3 | **Excepciones de la compuerta de términos incompletas en la spec.** La spec decía «excepto aceptar, ver los términos y cerrar sesión»; el contrato y el diseño también exceptúan **renovar la sesión** (`POST /api/auth/renew`). Sin esa excepción, un usuario que no ha aceptado quedaría expulsado por el vencimiento del token mientras lee los términos. | `spec.md`: FR-021, CA-19 y escenario 6 de la historia 7 (y se aclara que sin versión publicada no hay compuerta). |

### Severidad MEDIA (9, corregidos)

| # | Hallazgo | Corrección aplicada |
|---|---|---|
| M1 | La spec limitaba los márgenes configurables al centro de notificaciones, pero la lista de clientes por avisar (Sprint 6) comparte la definición de «próximo»; dejarla fija crearía dos definiciones de «próximo» (contra RN-12). | `spec.md` FR-004 y CA-2; ya en `research.md` D3 y T027. |
| M2 | **Ruta de ticket inexacta en el contrato.** Decía `GET /api/tickets/...`; la ruta real es `GET /api/tickets/:orderId` y **solo ADMIN y RECEPTIONIST** (`ticket-routes.js`). La prueba de no exposición habría supuesto un acceso del mecánico que no existe. | `contracts/api-rest.md` y T078 (el mecánico debe recibir 403 en tickets). |
| M3 | **Roles de la propuesta de mantenimiento mal definidos.** La investigación decía ADMIN y RECEPTIONIST, pero `maintenance-routes.js` permite registrar mantenimientos a **ADMIN y MECHANIC**; recepción solo consulta. Además el mecánico solo puede operar sobre sus órdenes. | `research.md` D6 (corregido a ADMIN y MECHANIC con la restricción de órdenes asignadas), `spec.md` escenario 7 de la historia 3 y Supuestos; el contrato y T033/T039 ya estaban alineados. |
| M4 | La spec no definía la **población de los reportes** ni sus fuentes de fecha y costo, que el plan sí fija a partir del código (no hay costo por uso, ni fecha de confirmación de pago, ni historial de estados). Una prueba de CA-7 no habría tenido contra qué cuadrar. | `spec.md`: FR-025, FR-026 y nuevo supuesto «Definiciones de los reportes (P3)» (costo = precio de compra vigente; pagos por fecha de registro; órdenes cerradas por último cambio de estado). |
| M5 | **Cifras del plan incorrectas** (`~25` suites y `~14` archivos Flutter; «4 grupos de rutas»). Contadas en `tasks.md`: 31 suites backend (6 unitarias, 19 de integración, 6 de contrato), 13 archivos Flutter y 5 grupos de rutas nuevos. | `plan.md`, línea «Escala/Alcance». |
| M6 | **Efecto de la versión 1 de términos sobre los scripts de evidencia previos** (`quickstart-005.mjs`, `verificar-avisos-api.mjs`): inician sesión y llaman a la API; tras sembrar el seed 011 recibirían `403 TERMS_NOT_ACCEPTED`. Estaba en el plan (R6) pero no en la spec. | `spec.md` (Supuestos); las tareas T098 y T101 ya lo verifican y documentan sin editar los scripts. |
| M7 | **FR-013 no decía qué se guarda en un inicio de sesión fallido**: el identificador tecleado puede contener un secreto (alguien escribe la contraseña en el campo de usuario). | `spec.md` FR-013 (solo el identificador, truncado a 100 caracteres, nunca el campo de contraseña); riesgo residual R11 en el plan. |
| M8 | **FR-029 solo cubría P1 y P2** y hablaba de «configuración inicial, tipos, términos» sin los datos de P3 (seed 012); un corte tras P3 incompleto no tenía criterio. | `spec.md` FR-029 (P1, P2 y P3, un seed por bloque). |
| M9 | **Orden de dependencias que cruza bloques**: T073 (bitácora de ajustes) toca `settings-service.js` de P1; T085 amplía la pantalla de P1. Si se cortara en P1, ese código no existe, pero si se entrega P2 la edición es aditiva. | Sin cambio: está correctamente en el bloque P2 con dependencia explícita de T019 y T028; se confirmó que ningún archivo de P1 importa `audit-service` ni las tablas de P2 (el corte es seguro). |

### Severidad BAJA (4, aplicados por ser rápidos)

| # | Hallazgo | Corrección |
|---|---|---|
| B1 | `contracts`: el cuerpo de `POST /api/orders/:id/services` se describía como «líneas de servicio»; el campo real es `kind` con `SERVICE`/`LABOR`. | Texto con `kind` en el contrato. |
| B2 | `research.md` D2 no explicaba por qué `session.inactivity_minutes` se siembra pero no se expone en P1. | Frase agregada (ver A2). |
| B3 | La trazabilidad por FR no existía en `tasks.md`. | Se agregó la tabla «Trazabilidad FR → tareas» (31 filas). |
| B4 | `quickstart.md` y `tasks.md` citaban las mismas cuentas de ejemplo; la tabla de contraseñas de `docs/project-context.md` seguía con las del estándar anterior. | Tarea explícita T051 para corregirla (no se toca fuera de `specs/008`). |

## 3. Contradicciones entre documentos (nombres, rutas, constantes, migraciones)

Se cruzaron los nombres que aparecen en más de un documento; **sin diferencias pendientes** tras las correcciones:

- **Migraciones**: 019 (`settings`), 020 (`service_types` + `order_services.service_type_id`), 021 (`tickets` instantánea), 022 (`audit_log`), 023 (terms); P3 ninguna y 024 condicional. Coinciden en `plan.md`, `research.md` D1, `data-model.md`, `tasks.md` y `quickstart.md`. Las migraciones existentes llegan a 018 (verificado).
- **Seeds**: 010 (P1), 011 (P2), 012 (P3); los existentes llegan a 009 (verificado). IDs desde 1 en tablas nuevas y desde 9001 solo en tablas existentes (ajuste del 2026-11-23).
- **Claves de `settings`**: `shop.name`, `shop.address`, `shop.phone`, `maintenance.margin_days`, `maintenance.margin_km`, `orders.stalled_days`, `session.inactivity_minutes`: iguales en `data-model.md`, `research.md` D2 y el contrato (los nombres del cuerpo JSON están en español en la API: `taller`, `operacion`, `seguridad`).
- **Constantes**: respaldo 30 días, 1,000 km, 3 días, 30 minutos; límites 1–365, 100–50,000, 1–90, 5–120 (coinciden en `data-model.md`, `research.md`, contrato y T010); vigencia del token = ajuste (30 por omisión, antes `SESION_MINUTOS = 30`).
- **Rutas**: `/api/settings`, `/api/service-types`, `GET /api/maintenances/proposal` (antes de `/:id`), `/api/audit-log`, `/api/terms` (`current`, `accept`, `acceptances`, `POST /`), `POST /api/auth/renew`, `/api/reports/{income,services,productivity,parts,rotation}` y `/:reporte/export`; iguales en contrato, plan, quickstart y tareas.
- **Códigos de error**: `SERVICE_TYPE_*` (P1), `TERMS_NOT_ACCEPTED` y `TERMS_VERSION_OUTDATED` (P2), `RANGO_INVALIDO` y `REPORT_NOT_FOUND` (P3); tareas T012, T064 y T110 los crean por bloque.
- **Presupuesto de consultas** de `GET /api/notifications`: 8 (autenticación con compuerta unida + ajustes + 6) frente al límite de 10; coincide en plan, T029 y T088.

## 4. Cumplimiento de la constitución

| Principio | Resultado |
|---|---|
| I. Alcance | ✅ Todo el alcance está en el insumo; los añadidos justificados son dos y quedan declarados: lectura abierta de tipos activos (A1) y la ruta `renew` (decisión del usuario). |
| II. Capas | ✅ Reglas en `services/` y funciones puras en `utils/`; sin lógica en controladores ni widgets. |
| III. Stack y base local | ✅ ES Modules, migraciones numeradas, seeds idempotentes con IDs altos, sin dependencias nuevas. |
| IV. Seguridad | ✅ Permisos en backend, bitácora sin secretos, token acotado (5 a 120 min); riesgos residuales declarados (R7, R11). **Hallazgo informativo**: `helmet` y el bloqueo por intentos siguen ausentes por decisión del usuario; la constitución no los exige. |
| V. Integridad | ✅ RN-12 (intervalos configurables), RN-10 (reportes derivados). |
| VI. API consistente | ✅ Mismos envoltorios y códigos; contrato completo. |
| VII. Pruebas | ✅ Pruebas primero y contra `motorix_test`; una excepción justificada. |
| VIII. UX/UI | ✅ Confirmación en acciones destructivas; tokens del sistema de diseño; un solo set de íconos. |

## 5. Riesgo para las suites existentes y los sprints 1 a 6

Hoy: **74 suites de backend** (`server/tests`) y **15 archivos de prueba de Flutter** (`client/test`). Ninguna se edita. Riesgos identificados y su mitigación:

| Riesgo | Probabilidad / impacto | Mitigación en las tareas |
|---|---|---|
| La compuerta de términos vive en `auth`, importado por todos los routers | Media / **alto** | Sin versión publicada no hay compuerta; las suites previas no la publican; consulta unida (sin consulta extra); T088 cuenta consultas; T095 ejecuta **la suite completa**. |
| `limpiarTablas` debe vaciar tablas nuevas sin romper bases sin esas migraciones | Media / medio | El helper se amplía por bloque, después de aplicar cada migración (T009, T063). |
| `ticket-service` deja de usar `TALLER` y cambia `ticketModel.create` | Baja / medio | El respaldo repite los mismos valores; T017 y T047 repiten `tickets` y `payments`. |
| Nuevo campo `serviceTypeId` en líneas de servicio | Baja / medio | Solo aparece cuando no es nulo (pruebas previas que comparan cuerpos exactos no cambian); T042 repite órdenes, refacciones y mantenimientos. |
| `esProximo` cambia de firma | Baja / medio | Parámetro opcional al final y constantes exportadas; la prueba previa `maintenance-proximo.test.js` no se edita (T014). |
| Consulta extra de ajustes en avisos | Baja / medio | 8 consultas frente al límite de 10; T029 repite `notifications-performance`. |
| Seeds 010 y 012 agregan órdenes, pagos y tickets; 011 agrega términos | Media / medio (evidencias, no Jest) | T050, T098 y T144 revisan cifras absolutas y scripts previos sin editarlos. |
| Flutter: nuevas secciones en `app_shell.dart` y `main.dart`, mensaje en login, `ApiClient` | Media / medio | Las pruebas previas de login, avisos y tickets se repiten (T086, T047); sin editarlas. |

Ninguna tarea modifica migraciones, seeds, servicios o pruebas de los sprints 1 a 6 salvo los cambios aditivos listados en el plan (estructura del proyecto).

## 6. Riesgos abiertos

1. **Renovación solo del lado del cliente**: un cliente alterado podría renovar sin límite (R7); se recomienda un tope absoluto de sesión como trabajo futuro.
2. **Costo del reporte de refacciones no congelado** (R9): el margen histórico cambia si cambia el precio de compra.
3. **Salto de `AUTO_INCREMENT`** a 9002 en bases de usuario y **scripts de evidencia previos** que requerirán aceptar términos (R4, R6).
4. **Bitácora best-effort** (R8): una falla de escritura no revierte la operación.
5. **Tamaño del sprint**: 152 tareas; el diseño por bloques con líneas de corte reduce el riesgo, pero P2 (47 tareas) es el bloque más sensible por el cambio en `auth`.

## 7. Decisiones de alto impacto pendientes

Ninguna: todas las decisiones necesarias se resolvieron con el insumo y las tres respuestas del usuario del 2026-11-23. No se formularon preguntas nuevas.
