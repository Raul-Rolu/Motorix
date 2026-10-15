---
description: "Lista de tareas de la funcionalidad 002-citas-ordenes (Sprint 2)"
---

# Tareas: Citas y Órdenes de Servicio (Sprint 2)

**Input**: Documentos de diseño de `/specs/002-citas-ordenes/`

**Prerequisites**: plan.md (requerido), spec.md (requerido para las historias de usuario), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Sí se requieren pruebas (CA-8 del spec exige las pruebas de la máquina de estados; la constitución exige suites unitarias, de integración y contra `motorix_test`).

**Organización**: las tareas están agrupadas por historia de usuario para permitir implementación y prueba independientes.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: historia de usuario a la que pertenece la tarea (p. ej. US1, US2)
- Incluir la ruta exacta del archivo en la descripción

## Convenciones de rutas

- Backend: `server/` (models, services, validators, controllers, routes, tests)
- Frontend: `client/lib/` (models, providers, screens, widgets)
- Base de datos: `database/migrations/`, `database/seeds/`
- Las rutas siguen la estructura definida en `plan.md`

## Phase 1: Setup (Infraestructura compartida del Sprint 2)

**Propósito**: esquema de base de datos y datos de ejemplo del sprint

- [X] T001 [P] Crear migración `database/migrations/005_create_appointments.sql` con la tabla `appointments` (client_id y vehicle_id NOT NULL con FK; appointment_date DATE y appointment_time TIME NOT NULL; reason VARCHAR(255) NOT NULL; status ENUM('PROGRAMADA','COMPLETADA','CANCELADA') DEFAULT 'PROGRAMADA'; cancellation_reason VARCHAR(255) NULL; created_by FK → users; UNIQUE (vehicle_id, appointment_date, appointment_time); índices en appointment_date y client_id; InnoDB utf8mb4)
- [X] T002 [P] Crear migración `database/migrations/006_create_service_orders.sql` con la tabla `service_orders` (client_id y vehicle_id NOT NULL con FK; mechanic_id NULL con FK → users; status ENUM('RECIBIDO','DIAGNOSTICO','EN_REPARACION','ESPERANDO_REFACCION','TERMINADO','ENTREGADO','CANCELADA') DEFAULT 'RECIBIDO'; previous_state VARCHAR(20) NULL; mileage_entry INT UNSIGNED NOT NULL; mileage_correction TINYINT(1) NOT NULL DEFAULT 0; reason VARCHAR(255) NOT NULL; notes y cancellation_reason VARCHAR(255) NULL; created_by FK → users; índices en vehicle_id, (mechanic_id, status) y status)
- [X] T003 [P] Crear migración `database/migrations/007_create_order_services.sql` con la tabla `order_services` (order_id NOT NULL con FK → service_orders; description VARCHAR(255) NOT NULL; amount DECIMAL(10,2) NOT NULL con CHECK amount >= 0; created_at)
- [X] T004 [P] Crear migración `database/migrations/008_create_order_labor.sql` con la tabla `order_labor` (order_id NOT NULL con FK → service_orders; description VARCHAR(255) NOT NULL; amount DECIMAL(10,2) NOT NULL con CHECK amount >= 0; created_at)
- [X] T005 [P] Crear migración `database/migrations/009_create_order_entries.sql` con la tabla `order_entries` (order_id NOT NULL con FK → service_orders; entry_type ENUM('DIAGNOSTIC','OBSERVATION','RECOMMENDATION') NOT NULL; content TEXT NOT NULL; created_by FK → users; created_at; índice (order_id, created_at))
- [X] T006 Crear seed idempotente `database/seeds/003_demo_appointments.sql`: 4–5 citas de ejemplo sobre los vehículos del seed 002 (IDs fijos; programadas de hoy y de la semana, una cancelada con motivo) usando INSERT ... ON DUPLICATE KEY UPDATE
- [X] T007 Crear seed idempotente `database/seeds/004_demo_service_orders.sql`: 4–5 órdenes de ejemplo sobre los vehículos del seed 002 (RECIBIDO sin mecánico, EN_REPARACION asignada a `mecanico` con diagnóstico y servicios, ESPERANDO_REFACCION con previous_state, ENTREGADO completa con entradas y partidas, CANCELADA con motivo) con sus order_services, order_labor y order_entries, usando INSERT ... ON DUPLICATE KEY UPDATE

**Checkpoint**: esquema y datos de ejemplo listos; las migraciones y seeds existentes siguen funcionando sin editarse.

---

## Phase 2: Foundational (Prerrequisitos bloqueantes)

**Propósito**: infraestructura compartida que DEBE estar completa antes de cualquier historia

**?? CRÍTICO**: ninguna historia puede comenzar hasta completar esta fase

- [X] T008 Implementar la máquina de estados pura en `server/services/order-state.js`: función `transicionValida({ estadoActual, estadoNuevo, rol, estadoOrigenPausa })` que devuelva `{ valido, motivo }` con la tabla de transiciones de research.md D2 (avances estrictos, ESPERANDO_REFACCION con retorno al estado de origen, retrocesos TERMINADO → EN_REPARACION y EN_REPARACION → DIAGNOSTICO, solo administrador para DIAGNOSTICO → RECIBIDO y saltos de secuencia, entrega TERMINADO → ENTREGADO solo para RECEPTIONIST/ADMIN, CANCELADA desde cualquier estado previo a ENTREGADO solo para RECEPTIONIST/ADMIN, y sin transiciones desde ENTREGADO o CANCELADA); el rol MECHANIC solo aplica transiciones cuando es el dueño de la orden (la pertenencia la valida el servicio)
- [X] T009 [P] Crear pruebas unitarias de la máquina de estados en `server/tests/unit/services/order-state.test.js` cubriendo: cada transición válida por rol, cada transición inválida (salto RECIBIDO → TERMINADO como mecánico, entrega como mecánico, retroceso DIAGNOSTICO → RECIBIDO como recepción, transiciones desde ENTREGADO y CANCELADA), la pausa y su retorno, y CANCELADA desde estados previos (CA-8)
- [X] T010 [P] Ampliar el catálogo de `server/utils/errors.js` con los errores nuevos: CITA_NO_ENCONTRADA, CITA_DUPLICADA, ORDEN_NO_ENCONTRADA, ORDEN_BLOQUEADA, TRANSICION_INVALIDA, KILOMETRAJE_INVALIDO, MECANICO_INVALIDO y VEHICULO_NO_DISPONIBLE (códigos y mensajes en español según contracts/api-rest.md)

**Checkpoint**: la máquina de estados y el catálogo de errores están listos; pueden iniciarse todas las historias.

---

## Phase 3: User Story 2 - Creación de órdenes de servicio (Prioridad: P1) ?? MVP

**Goal**: recepción crea órdenes de servicio con vehículo, kilometraje de entrada (RN-3/RN-4) y motivo, y las consulta en listado

**Independent Test**: crear una orden para un vehículo de ejemplo queda en RECIBIDO con el cliente derivado; una orden hacia un vehículo inexistente se rechaza (RN-2); un kilometraje menor al previo sin corrección se rechaza (RN-4) y con corrección explícita se guarda.

### Tests para la User Story 2 (OPCIONAL por TDD — requeridos por CA-8)

> **NOTA**: escribir estas pruebas PRIMERO y verificar que fallan antes de implementar

- [X] T011 [P] [US2] Pruebas unitarias del validador de órdenes en `server/tests/unit/validators/order-validator.test.js`: payload de creación con vehicleId, mileageEntry (entero ≥ 0, NOT NULL) y reason (no vacío, máx. 255) obligatorios; notes opcional máx. 255; mileageCorrection booleano
- [X] T012 [P] [US2] Pruebas de integración de creación y listado en `server/tests/integration/orders.test.js`: creación válida con recepción (201, status RECIBIDO, clientId derivado), vehículo inexistente o inactivo (404), kilometraje menor sin corrección (400 KILOMETRAJE_INVALIDO), kilometraje menor con mileageCorrection true (201), listado de recepción con todas las órdenes y de mecánico solo con las suyas (contra `motorix_test`)
- [X] T013 [P] [US2] Pruebas de contrato de creación en `server/tests/contract/orders.contract.test.js`: forma de la respuesta 201 (id, status, clientId, vehicleId, mechanicId, mileageEntry), formato de error centralizado y ausencia de datos internos

### Implementación para la User Story 2

- [X] T014 [P] [US2] Crear el modelo de órdenes en `server/models/order.js` con `aObjeto`, `findAll({ estado, texto, mechanicId })`, `findById`, `findByIdConRelaciones` (JOIN clients y vehicles), `findLastMileageByVehicle`, `create`, `update` y `setStatus` usando `getPool()`
- [X] T015 [US2] Crear el validador en `server/validators/order-validator.js` con `validarCreacionOrden` y `validarEdicionOrden` según las restricciones citadas en T011 (RN-2 y RN-3)
- [X] T016 [US2] Crear el servicio en `server/services/order-service.js` con `listar` y `crear`: derivar client_id del vehículo (rechazar vehículo inexistente/inactivo con VEHICULO_NO_DISPONIBLE), validar kilometraje contra `findLastMileageByVehicle` (mayor o igual, salvo `mileageCorrection: true` que se persiste en `mileage_correction` — RN-4, research D4), validar mechanicId opcional contra usuarios activos MECHANIC (MECANICO_INVALIDO) y persistir en estado RECIBIDO
- [X] T017 [US2] Crear el controlador en `server/controllers/order-controller.js` con `listar` y `crear` (valida payload, delega en el servicio y usa `ok`/`created`/`error` de `server/utils/responses.js`)
- [X] T018 [US2] Crear las rutas en `server/routes/order-routes.js`: `auth` + `requireRole('ADMIN','RECEPTIONIST','MECHANIC')` en el router; GET `/` y POST `/` con las autorizaciones de research D6; montar `app.use('/api/orders', orderRoutes)` en `server/app.js`

**Checkpoint**: la US2 funciona de forma independiente: creación, listado y validaciones de RN-2/RN-3/RN-4.

---

## Phase 4: User Story 3 - Vinculación de la orden con cliente y vehículo (Prioridad: P1)

**Goal**: toda orden muestra el cliente propietario y el vehículo correctamente asociados (FR-015)

**Independent Test**: el detalle de una orden creada muestra cliente, vehículo, kilometraje y estado; un cliente desactivado no puede recibir órdenes nuevas.

### Tests para la User Story 3

- [X] T019 [P] [US3] Pruebas de integración del detalle de órdenes en `server/tests/integration/orders-detail.test.js`: GET /api/orders/:id devuelve client, vehicle, mileageEntry y status; orden inexistente (404 ORDEN_NO_ENCONTRADA); creación de orden para vehículo de un cliente desactivado (404)

### Implementación para la User Story 3

- [X] T020 [P] [US3] Ampliar `server/models/order.js` con `findByIdConRelaciones` (si no se creó en T014) y las consultas de totales (SUM de order_services y order_labor por orden)
- [X] T021 [US3] Ampliar `server/services/order-service.js` con `obtenerPorId(id, usuario)`: rechazar orden inexistente, aplicar la visibilidad del mecánico (solo sus órdenes → NO_AUTORIZADO) y devolver el detalle con client, vehicle, mechanic, totals (services, labor, grand) e arrays vacíos de entries/services/labor cuando no hay
- [X] T022 [US3] Ampliar `server/controllers/order-controller.js` y `server/routes/order-routes.js` con GET `/:id`

**Checkpoint**: la US3 completa la trazabilidad cliente ↔ vehículo ↔ orden.

---

## Phase 5: User Story 4 - Consulta de órdenes asignadas por el mecánico (Prioridad: P1)

**Goal**: asignación manual de mecánico por recepción/administración y visión del mecánico limitada a sus órdenes (FR-008, FR-009, CA-3)

**Independent Test**: con dos mecánicos y órdenes repartidas, cada mecánico ve solo las suyas; asignar a un usuario que no es mecánico activo se rechaza; la orden ajena responde 403/404 en servidor.

### Tests para la User Story 4

- [X] T023 [P] [US4] Pruebas de integración de asignación y visibilidad en `server/tests/integration/orders-assignment.test.js`: asignar y reasignar mecánico (200), liberar con mechanicId null, mechanicId de usuario inexistente/inactivo/no MECHANIC (400 MECANICO_INVALIDO), listado del mecánico solo con sus órdenes, acceso del mecánico a orden ajena (NO_AUTORIZADO), reasignación prohibida en orden ENTREGADO (409 ORDEN_BLOQUEADA)
- [X] T024 [P] [US4] Pruebas de contrato de asignación en `server/tests/contract/orders-assignment.contract.test.js`: forma de la respuesta de PATCH /:id/assignment y del listado filtrado por rol

### Implementación para la User Story 4

- [X] T025 [US4] Ampliar `server/services/order-service.js` con `asignarMecanico(id, mechanicId, usuario)`: validar orden no bloqueada, usuario activo MECHANIC (o null para liberar) y devolver la orden actualizada
- [X] T026 [US4] Ampliar `server/services/order-service.js` con el filtro de visibilidad en `listar`: MECHANIC solo `mechanic_id = req.user.id`; ADMIN/RECEPTIONIST todas, con filtros `?estado=` y `?texto=` (placas o nombre de cliente)
- [X] T027 [US4] Ampliar `server/controllers/order-controller.js` y `server/routes/order-routes.js` con PATCH `/:id/assignment` (solo ADMIN/RECEPTIONIST)
- [X] T028 [P] [US4] Crear el modelo Flutter `client/lib/models/service_order.dart` (campos del contrato de detalle incluidos totals, entries, services, labor y estado con nombre amigable en español)
- [X] T029 [P] [US4] Crear el provider `client/lib/providers/orders_provider.dart` (listar con filtros, crear, obtener detalle, asignar, transicionar, agregar entradas y partidas, borrar partida; manejo de ExcepcionApi)
- [X] T030 [US4] Crear la pantalla `client/lib/screens/orders_screen.dart`: listado con filtro por estado y búsqueda, etiqueta de estado con color del token (verde completado, ámbar próximo/EN_REPARACION, rojo vencido/error), acciones por rol (ver detalle, asignar para recepción/administración)
- [X] T031 [US4] Crear el formulario `client/lib/screens/order_form_screen.dart`: selector de vehículo con propietario derivado visible, kilometraje de entrada con validación de política (si es menor al previo ofrecer corrección explícita con confirmación — FR-013), motivo obligatorio, notas opcionales y selector de mecánico activo (solo recepción/administración)
- [X] T032 [US4] Actualizar `client/lib/widgets/app_shell.dart` y `client/lib/main.dart`: sección Órdenes visible para los tres roles (el mecánico con su listado propio) y rutas `/ordenes` y `/ordenes/nueva` (tokens de `client/lib/config/theme.dart`, sin tema por defecto)

**Checkpoint**: la US4 entrega la operación diaria del mecánico y la administración de asignaciones.

---

## Phase 6: User Story 1 - Registro y consulta de citas (Prioridad: P2)

**Goal**: recepción registra, consulta, edita, completa y cancela citas (FR-001–FR-003, CA-1)

**Independent Test**: crear, editar y cancelar una cita funciona de extremo a extremo; una cita duplicada (mismo vehículo, fecha y hora) se rechaza; el rol mecánico no accede.

### Tests para la User Story 1

- [X] T033 [P] [US1] Pruebas unitarias del validador de citas en `server/tests/unit/validators/appointment-validator.test.js`: clientId, vehicleId, appointmentDate, appointmentTime y reason obligatorios; fecha igual o posterior a hoy; hora con formato HH:MM; cancellationReason obligatorio al cancelar
- [X] T034 [P] [US1] Pruebas de integración de citas en `server/tests/integration/appointments.test.js`: creación (201, PROGRAMADA), fecha pasada (400), cita duplicada (409 CITA_DUPLICADA), edición de PROGRAMADA, cancelar con motivo (200) y sin motivo (400), completar (200), acciones sobre cita COMPLETADA/CANCELADA (409), mecánico (403)
- [X] T035 [P] [US1] Pruebas de contrato de citas en `server/tests/contract/appointments.contract.test.js`: forma de la respuesta de creación, listado con filtros `?fecha=` y `?texto=` (nombre de cliente o placas) y errores en formato centralizado

### Implementación para la User Story 1

- [X] T036 [P] [US1] Crear el modelo `server/models/appointment.js` con `findAll({ fecha, texto, incluirInactivas })` (JOIN clients y vehicles), `findById`, `findByVehicleAndSlot`, `create`, `update` y `setStatus` con `getPool()`
- [X] T037 [US1] Crear el validador `server/validators/appointment-validator.js` según T033 (research D14)
- [X] T038 [US1] Crear el servicio `server/services/appointment-service.js`: crear con vehículo activo del cliente (VEHICULO_NO_DISPONIBLE), unicidad de horario (CITA_DUPLICADA), editar/completar/cancelar solo desde PROGRAMADA con motivo obligatorio al cancelar (usar errores nuevos de T010)
- [X] T039 [US1] Crear el controlador `server/controllers/appointment-controller.js` y las rutas `server/routes/appointment-routes.js` (auth + requireRole ADMIN/RECEPTIONIST; GET `/`, POST `/`, GET/PUT `/:id`, PATCH `/:id/status`); montar en `server/app.js`
- [X] T040 [P] [US1] Crear el modelo Flutter `client/lib/models/appointment.dart` (cliente, vehículo, fecha, hora, motivo, estado con nombre amigable)
- [X] T041 [P] [US1] Crear el provider `client/lib/providers/appointments_provider.dart` (listar con filtro de fecha y texto, crear, editar, completar, cancelar con motivo)
- [X] T042 [US1] Crear la pantalla `client/lib/screens/appointments_screen.dart`: listado por fecha con buscador (nombre o placas), estados con tokens de color y acciones (editar, completar, cancelar con motivo — confirmación obligatoria, FR-013)
- [X] T043 [US1] Crear el formulario `client/lib/screens/appointment_form_screen.dart`: selector de cliente activo y de sus vehículos, fecha (≥ hoy), hora y motivo
- [X] T044 [US1] Actualizar `client/lib/widgets/app_shell.dart` y `client/lib/main.dart` con la sección Citas (ADMIN/RECEPTIONIST) y las rutas `/citas` y `/citas/nueva`

**Checkpoint**: la US1 funciona de forma independiente con su interfaz completa.

---

## Phase 7: User Story 5 - Registro de diagnósticos y servicios realizados (Prioridad: P3)

**Goal**: el mecánico registra diagnósticos (entradas fechadas), servicios y mano de obra en sus órdenes (FR-011, CA-4)

**Independent Test**: sobre una orden asignada en DIAGNOSTICO se agregan entradas y partidas que quedan en el detalle con totales; sobre una orden ENTREGADO/CANCELADA se rechaza con ORDEN_BLOQUEADA; sobre una orden ajena se deniega.

### Tests para la User Story 5

- [X] T045 [P] [US5] Pruebas de integración de trabajo de órdenes en `server/tests/integration/orders-work.test.js`: agregar entrada DIAGNOSTIC como dueño (201), agregar partidas SERVICE y LABOR (201) con totales en el detalle, agregar servicios en RECIBIDO sin haber avanzado a DIAGNOSTICO (400), orden ENTREGADO (409 ORDEN_BLOQUEADA), orden ajena como mecánico (NO_AUTORIZADO), borrar partida antes de entregar (204) y después (409)
- [X] T046 [P] [US5] Pruebas de contrato de trabajo en `server/tests/contract/orders-work.contract.test.js`: forma de las respuestas de POST /:id/entries, POST /:id/services y DELETE /:id/services/:serviceId

### Implementación para la User Story 5

- [X] T047 [US5] Ampliar `server/validators/order-validator.js` con `validarEntradaOrden` (entryType en DIAGNOSTIC/OBSERVATION/RECOMMENDATION y content no vacío) y `validarPartida` (description no vacía, amount numérico ≥ 0, kind en SERVICE/LABOR)
- [X] T048 [US5] Ampliar `server/services/order-service.js` con `agregarEntrada`, `agregarPartida` y `borrarPartida`: dueño de la orden (o rol con permiso), orden no bloqueada (RN-9), partidas solo desde estado DIAGNOSTICO en adelante (FR-011), y totales calculados en el servidor
- [X] T049 [US5] Ampliar `server/controllers/order-controller.js` y `server/routes/order-routes.js` con POST `/:id/entries`, POST `/:id/services` y DELETE `/:id/services/:serviceId`

**Checkpoint**: la US5 documenta el trabajo con historial inmutable de entradas.

---

## Phase 8: User Story 6 - Cambio de estado de la orden (Prioridad: P3)

**Goal**: el mecánico y recepción/administración mueven la orden por la máquina de estados con todas las reglas (FR-012, FR-013, CA-5)

**Independent Test**: la secuencia completa RECIBIDO → ... → ENTREGADO funciona; las transiciones inválidas se rechazan con TRANSICION_INVALIDA; la pausa y sus retornos, los retrocesos permitidos y los saltos solo-administrador se comportan según la tabla de research D2; la orden entregada queda bloqueada.

### Tests para la User Story 6

- [X] T050 [P] [US6] Pruebas de integración de estados en `server/tests/integration/orders-status.test.js`: avanzar la secuencia completa, pausa ESPERANDO_REFACCION desde DIAGNOSTICO y EN_REPARACION con retorno al estado de origen, retrocesos permitidos como mecánico, salto RECIBIDO → TERMINADO como mecánico (400) y como administrador (200), DIAGNOSTICO → RECIBIDO solo administrador, entrega como mecánico denegada y como recepción (200), cancelación por recepción desde RECIBIDO (200) y desde ENTREGADO (409), transiciones posteriores a ENTREGADO/CANCELADA (409 ORDEN_BLOQUEADA)
- [X] T051 [P] [US6] Pruebas de contrato de estados en `server/tests/contract/orders-status.contract.test.js`: forma de la respuesta de PATCH /:id/status y del error TRANSICION_INVALIDA con el estado válido sugerido en el mensaje

### Implementación para la User Story 6

- [X] T052 [US6] Ampliar `server/services/order-service.js` con `cambiarEstado(id, estadoNuevo, usuario)`: verificar pertenencia/rol, consultar `transicionValida` de `server/services/order-state.js`, gestionar `previous_state` al entrar y salir de ESPERANDO_REFACCION, persistir `cancellation_reason` al cancelar y rechazar órdenes bloqueadas (RN-9)
- [X] T053 [US6] Ampliar `server/controllers/order-controller.js` y `server/routes/order-routes.js` con PATCH `/:id/status`
- [X] T054 [US6] Crear la pantalla `client/lib/screens/order_detail_screen.dart`: datos de la orden (cliente, vehículo, mecánico, kilometraje), historial de entradas fechadas con autor, servicios y mano de obra con totales informativos, y acciones de estado calculadas con la máquina de estados para el rol (botones de transición permitidas, pausa/retorno, entrega y cancelación con confirmación obligatoria — FR-013, tokens de color según estado)

**Checkpoint**: la US6 cierra el flujo demostrable del sprint (quickstart V6–V7).

---

## Phase 9: User Story 7 - Observaciones y recomendaciones del mecánico (Prioridad: P4)

**Goal**: el mecánico agrega observaciones y recomendaciones fechadas visibles para recepción y administración (FR-014)

**Independent Test**: las entradas de tipo OBSERVATION y RECOMMENDATION quedan en el historial con fecha y autor, son visibles en el detalle para los tres roles y no admiten borrado.

### Tests para la User Story 7

- [X] T055 [P] [US7] Pruebas de integración de entradas en `server/tests/integration/orders-entries.test.js`: observaciones y recomendaciones como dueño (201 con createdBy y createdAt), visibles para recepción y administración en el detalle, rechazo de entrada sin content o con entryType inválido (400), inexistencia de endpoint de borrado de entradas (405/404) y bloqueo en orden ENTREGADO (409)

### Implementación para la User Story 7

- [X] T056 [US7] Ampliar `client/lib/screens/order_detail_screen.dart` con el formulario de entradas por tipo (diagnóstico, observación, recomendación) visible según el rol, el historial cronológico de entradas con autor y fecha, y sin acciones de borrado (historial inmutable)

**Checkpoint**: todas las historias del sprint funcionan de forma independiente y en conjunto.

---

## Phase 10: Polish y Cross-Cutting Concerns

**Propósito**: mejoras transversales y validación final

- [X] T057 [P] Revisión de seguridad: verificar que no se agregaron secretos al repositorio, que toda acción nueva valida rol y pertenencia en el servidor (RN-15), que los errores no exponen trazas y que los payloads no filtran datos internos (`server/` y `client/`)
- [X] T058 [P] Verificar que todos los comentarios, mensajes y pruebas nuevos están en español y que los identificadores del código siguen en inglés (`server/`, `client/`, `database/`)
- [ ] T059 Re-ejecutar `node database/scripts/apply-migrations.mjs` y `node database/scripts/apply-seeds.mjs` sobre una base vacía y sobre una poblada para confirmar idempotencia (V1)
- [ ] T060 Ejecutar `cd server && npm test` y dejar en verde las suites unitarias, de integración y contrato contra `motorix_test` (CA-8)
- [X] T061 Ejecutar `cd client && flutter analyze` sin issues y `cd client && flutter test` en verde
- [ ] T062 Ejecutar los escenarios V1–V8 de `specs/002-citas-ordenes/quickstart.md` manualmente y registrar el resultado de cada CA-1–CA-8
- [X] T063 Emitir el informe de finalización del sprint con el estado de las tareas y las suites

---

## Dependencies & Execution Order

### Dependencias entre fases

- **Setup (Phase 1)**: sin dependencias; puede iniciarse de inmediato
- **Foundational (Phase 2)**: depende del Setup (los modelos usan las tablas); BLOQUEA todas las historias
- **User Stories (Phase 3+)**: todas dependen del Foundational (máquina de estados y catálogo de errores)
  - Orden recomendado por prioridad: US2 (P1) → US3 (P1) → US4 (P1) → US1 (P2) → US5 (P3) → US6 (P3) → US7 (P4)
  - US3 depende de la creación de la US2 (modelo/servicio compartidos); US4, US5, US6 y US7 extienden el mismo servicio de órdenes y deben secuenciarse sobre él
  - US1 (citas) es independiente de las órdenes y puede ejecutarse en paralelo a US3–US7
- **Polish (fase final)**: depende de todas las historias deseadas

### Dependencias entre historias

- **US2 (P1)**: arranca tras Foundational; base de las demás historias de órdenes
- **US3 (P1)**: usa el modelo y servicio de la US2
- **US4 (P1)**: usa el modelo y servicio de la US2; añade asignación y visibilidad
- **US1 (P2)**: independiente; solo necesita Foundational
- **US5 (P3)**: usa el servicio de la US2/US4; añade entradas y partidas
- **US6 (P3)**: usa la máquina de estados (Foundational) y el servicio acumulado
- **US7 (P4)**: usa las entradas de la US5 (backend) y su pantalla (order_detail_screen.dart)

### Dentro de cada historia

- Las pruebas se escriben PRIMERO y deben fallar antes de implementar
- Modelos antes de servicios; servicios antes de controladores y rutas
- Backend completo antes de las pantallas que lo consumen
- Historia completa antes de pasar a la siguiente prioridad

### Oportunidades de paralelismo

- Todas las tareas marcadas [P] del Setup (T001–T005) pueden ejecutarse juntas
- En Foundational: T009 y T010 en paralelo con T008 (mismo archivo de máquina solo en T008)
- Por historia: pruebas unitarias/integración/contrato en paralelo; modelos Flutter y providers en paralelo (T028/T029, T036/T040/T041)
- US1 puede avanzar en paralelo a US3–US4 por otra persona (archivos de citas independientes de órdenes)

---

## Ejemplo de paralelismo: User Story 2

```text
# Lanzar juntas las pruebas de la US2:
Tarea: "Pruebas unitarias del validador de órdenes en server/tests/unit/validators/order-validator.test.js"
Tarea: "Pruebas de integración de creación y listado en server/tests/integration/orders.test.js"
Tarea: "Pruebas de contrato de creación en server/tests/contract/orders.contract.test.js"

# Luego el modelo (único archivo compartido por el resto del sprint):
Tarea: "Crear el modelo de órdenes en server/models/order.js"
```

---

## Estrategia de implementación

### MVP primero (solo P1: US2 + US3 + US4)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO - bloquea todas las historias)
3. Completar Phase 3 (US2), Phase 4 (US3) y Phase 5 (US4)
4. **PARAR y VALIDAR**: probar creación, detalle y asignación/visión del mecánico de forma independiente
5. Demo: recepción crea y asigna una orden; el mecánico la ve

### Entrega incremental

1. Setup + Foundational → base lista
2. + US2/US3/US4 (P1) → prueba independiente → demo (MVP del sprint)
3. + US1 (P2) → citas completas → demo del flujo cita → orden
4. + US5/US6 (P3) → trabajo documentado y estados → flujo demostrable completo (quickstart V1–V8)
5. + US7 (P4) → observaciones y recomendaciones → cierre del sprint

### Estrategia de equipo en paralelo

Con varios desarrolladores:

1. El equipo completa Setup + Foundational juntos
2. Una vez listo:
   - Desarrollador A: US2 → US3 → US5 → US6 → US7 (backend/órdendes)
   - Desarrollador B: US1 (citas completas) + pantallas Flutter de órdenes
3. Las historias se integran y prueban de forma independiente

---

## Notas

- [P] = archivos distintos, sin dependencias
- La etiqueta [Historia] vincula cada tarea con su historia para trazabilidad
- Cada historia debe poder completarse y probarse de forma independiente
- Verificar que las pruebas fallan antes de implementar
- Hacer commit después de cada tarea o grupo lógico
- Detenerse en cada checkpoint para validar la historia de forma independiente
- La rama actual `002-citas-ordenes` es la de trabajo del sprint
