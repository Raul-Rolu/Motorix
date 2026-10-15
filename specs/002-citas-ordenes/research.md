# Investigación Técnica: Citas y Órdenes de Servicio (Sprint 2)

Decisiones técnicas resueltas para la implementación, siguiendo las reglas del Sprint 1
(ES Modules, mysql2 sin ORM, MySQL local, pruebas contra `motorix_test`).

## D1 — Migraciones del Sprint 2: numeración inmutable

- **Decisión**: crear cinco migraciones nuevas numeradas 005–009 (`005_create_appointments.sql`, `006_create_service_orders.sql`, `007_create_order_services.sql`, `008_create_order_labor.sql`, `009_create_order_entries.sql`) con `CREATE TABLE IF NOT EXISTS`; no editar ningún script del Sprint 1.
- **Racionalidad**: los runners `apply-migrations.mjs` y el helper de pruebas aplican los scripts en orden numérico y los registran; continuar la numeración conserva la inmutabilidad del historial de esquema.
- **Alternativas consideradas**: modificar la migración 003 para agregar columnas de kilometraje al vehículo (rechazada: rompe inmutabilidad); crear una única migración monolítica (rechazada: menos trazable).

## D2 — Máquina de estados como servicio puro testeable

- **Decisión**: implementar la máquina de estados en `server/services/order-state.js` como función pura `transicionValida({ estadoActual, estadoNuevo, rol, estadoPrevioPausa })` que devuelve `{ valido, motivo }`, con una tabla de transiciones declarativa. El servicio de órdenes consulta la máquina antes de aplicar cualquier cambio de estado.
- **Racionalidad**: satisface CA-8 (pruebas de la lógica de transiciones) con pruebas unitarias rápidas sin base de datos; centraliza la regla (FR-012) en un solo lugar testeable.
- **Alternativas consideradas**: validar transiciones con `CASE` en SQL (rechazada: lógica de negocio escondida en la base y difícil de probar); if repartidos por los controllers (rechazada: duplicación y riesgo de divergencia).

Reglas derivadas de la Clarificación 1 y el spec:

| Origen | Destino | Quién |
|---|---|---|
| RECIBIDO | DIAGNOSTICO | mecánico (dueño), recepción, administrador |
| RECIBIDO | CANCELADA | recepción, administrador |
| DIAGNOSTICO | EN_REPARACION | mecánico (dueño), recepción, administrador |
| DIAGNOSTICO | ESPERANDO_REFACCION | mecánico (dueño), recepción, administrador |
| DIAGNOSTICO | RECIBIDO | solo administrador (retroceso) |
| EN_REPARACION | TERMINADO | mecánico (dueño), recepción, administrador |
| EN_REPARACION | ESPERANDO_REFACCION | mecánico (dueño), recepción, administrador |
| EN_REPARACION | DIAGNOSTICO | mecánico (dueño), recepción, administrador (retroceso permitido) |
| ESPERANDO_REFACCION | estado previo a la pausa | mecánico (dueño), recepción, administrador |
| TERMINADO | ENTREGADO | solo recepción y administrador |
| TERMINADO | EN_REPARACION | mecánico (dueño), recepción, administrador (retroceso permitido) |
| Cualquier estado previo a ENTREGADO | CANCELADA | recepción, administrador |
| ENTREGADO | — (sin transiciones) | — |
| CANCELADA | — (sin transiciones) | — |
| Saltos de secuencia (p. ej. RECIBIDO → TERMINADO) | | solo administrador |

## D3 — Pausa ESPERANDO_REFACCION con retorno al estado anterior

- **Decisión**: la tabla `service_orders` incluye `previous_state` (NULL salvo en pausa); al entrar a ESPERANDO_REFACCION se guarda el estado de origen y la salida de la pausa siempre regresa a ese valor. Solo una pausa activa a la vez.
- **Racionalidad**: implementa "retorno al estado anterior desde el que se pausó" de forma explícita y verificable; evita deducir el origen por historial.
- **Alternativas consideradas**: inferir el estado anterior con un log de transiciones (rechazada: más complejidad de la necesaria para el MVP); pausa con estado genérico sin retorno (rechazada: contradice el spec).

## D4 — Kilometraje: valor previo y corrección explícita

- **Decisión**: el kilometraje previo de un vehículo es el de su última orden creada (cualquier estado, incluidas canceladas). Al crear una orden, si no hay orden previa se acepta cualquier entero ≥ 0; si hay, el valor debe ser ≥ al previo, salvo que se envíe el indicador `mileageCorrection: true`, que exige confirmación en la interfaz y se persiste en `mileage_correction` para dejar constancia.
- **Racionalidad**: cumple FR-006/FR-007 y RN-3/RN-4 sin tabla nueva de historial de kilometrajes; el flag deja rastro auditable de la corrección.
- **Alternativas consideradas**: columna `mileage` en `vehicles` actualizada en cada orden (rechazada: duplica el dato y complica la coherencia con órdenes canceladas); tabla separada de lecturas de odómetro (rechazada: excede el alcance del sprint).

## D5 — Asignación manual de mecánico

- **Decisión**: `service_orders.mechanic_id` (FK a `users`, anulable); recepción o administrador lo eligen al crear o editar la orden desde el listado de usuarios activos con rol MECHANIC; pueden reasignarla en cualquier momento mientras no esté ENTREGADO/CANCELADA; si el mecánico asignado queda inactivo, la orden permanece visible para recepción/administración para reasignarla.
- **Racionalidad**: Clarificación 4; simple, trazable y sin reglas de disponibilidad.
- **Alternativas consideradas**: sugerencia automática por carga (rechazada: más complejidad, sprint futuro); asignación al crear la cita (rechazada: la cita no obliga a tener mecánico).

## D6 — Matriz de permisos por rol (RN-5, RN-15)

- **Decisión** (validada SIEMPRE en backend):

| Acción | ADMIN | RECEPTIONIST | MECHANIC |
|---|---|---|---|
| CRUD de citas y cancelación | ✔ | ✔ | ✖ |
| Crear/editar orden (datos, motivo, notas) | ✔ | ✔ | ✖ |
| Asignar/reasignar mecánico | ✔ | ✔ | ✖ |
| Cancelar orden (previo a ENTREGADO) | ✔ | ✔ | ✖ |
| Entregar orden (TERMINADO → ENTREGADO) | ✔ | ✔ | ✖ |
| Transiciones de trabajo y pausa | ✔ | ✔ | solo sus órdenes |
| Retrocesos permitidos (TERMINADO→EN_REPARACION, EN_REPARACION→DIAGNOSTICO) | ✔ | ✔ | solo sus órdenes |
| Retroceso DIAGNOSTICO→RECIBIDO y saltos de secuencia | ✔ | ✖ | ✖ |
| Agregar entradas (diagnóstico/observación/recomendación) | ✔ | ✖ | solo sus órdenes |
| Registrar servicios y mano de obra | ✔ | ✖ | solo sus órdenes |
| Ver listado de órdenes | todas | todas | solo las suyas |

- **Racionalidad**: deriva de FR-009/FR-010, las clarificaciones 1–3 y el rol del mecánico en el spec; ocultar opciones en la UI no sustituye la validación en servidor.
- **Alternativas consideradas**: permitir a recepción registrar diagnósticos (rechazada: el spec asigna esa acción al mecánico).

## D7 — Cancelación de orden como estado CANCELADA

- **Decisión**: CANCELADA es un estado más de `service_orders`, alcanzable desde cualquier estado previo a ENTREGADO por recepción o administrador, con motivo de cancelación opcional; una orden cancelada queda en los listados de historial pero fuera del trabajo activo y no admite transiciones ni ediciones (RN-9 aplicado igual que ENTREGADO).
- **Racionalidad**: Clarificación 3; conserva historial sin borrado físico, coherente con el tratamiento de usuarios, clientes y citas del MVP.
- **Alternativas consideradas**: borrado lógico con columna `active` (rechazada: una orden no es "reactivable" y su estado operativo ya expresa el ciclo).

## D8 — Modelo de estados de la cita

- **Decisión**: tres estados: PROGRAMADA (inicial), COMPLETADA (vehículo recibido) y CANCELADA con motivo. Cancelar solo desde PROGRAMADA; completar desde PROGRAMADA por recepción o administrador. La transición a COMPLETADA es manual (el flujo del taller la decide al recibir el vehículo) y puede hacerse al crear una orden desde la cita mediante una acción explícita en la pantalla de órdenes.
- **Racionalidad**: suficiente para organizar la llegada (US1) sin acoplar la cita a la orden; el spec exige excluir canceladas de las citas pendientes y conservar registro.
- **Alternativas consideradas**: estados AUTOMATICA/REPROGRAMADA (rechazada: fuera del alcance); derivar COMPLETADA automáticamente al crear la orden (rechazada: oculta la acción de recepción; se deja como opción explícita).

## D9 — Contrato REST de citas y órdenes

- **Decisión**: extender el patrón del Sprint 1 con los endpoints de `contracts/api-rest.md` de esta fase: `/api/appointments` (GET, POST, GET/PUT :id, PATCH :id/status) y `/api/orders` (GET, POST, GET/PUT :id, PATCH :id/status, PATCH :id/assignment, POST :id/entries, POST :id/services, DELETE :id/services/:serviceId para corregir partidas antes de entregar). Respuestas en el formato ya establecido (`{ datos: [...] }` para colecciones; `{ error: { codigo, mensaje } }` para errores) y catálogo de errores ampliado (TRANSICION_INVALIDA, ORDEN_BLOQUEADA, CITA_NO_ENCONTRADA, KILOMETRAJE_INVALIDO, MECANICO_INVALIDO).
- **Racionalidad**: coherencia con el contrato existente y con los helpers de respuesta y errores ya probados.
- **Alternativas consideradas**: un único endpoint de "workflow" que haga varias acciones (rechazada: difícil de probar y de autorizar por acción).

## D10 — Pantallas Flutter del Sprint 2

- **Decisión**: 
  - `appointments_screen.dart`: listado con filtro por fecha y búsqueda (cliente/placas), acciones nueva/editar/cancelar/completar.
  - `appointment_form_screen.dart`: selector de cliente (activos) y de su vehículo, fecha, hora y motivo.
  - `orders_screen.dart`: para recepción/administración todas las órdenes con filtros por estado; para el mecánico solo las suyas con estados de trabajo.
  - `order_form_screen.dart`: selector de vehículo (con propietario derivado), kilometraje de entrada, motivo y, para recepción/administración, selector de mecánico activo.
  - `order_detail_screen.dart`: datos de la orden, historial de entradas fechadas, servicios y mano de obra con totales informativos, y acciones de estado por rol (máquina de estados reflejada en botones disponibles).
  - `app_shell.dart`: secciones Citas y Órdenes visibles para ADMIN/RECEPTIONIST; Órdenes (MIS ÓRDENES) para MECHANIC.
- **Racionalidad**: sigue el patrón de providers + pantallas del Sprint 1 y los tokens del design system; los botones de acción se calculan a partir del estado y el rol, pero la autoridad es el servidor.
- **Alternativas consideradas**: una sola pantalla de órdenes con modales para todo (rechazada: satura la interfaz y complica el flujo del mecánico).

## D11 — Servicios y mano de obra de la orden

- **Decisión**: partidas independientes (`order_services` y `order_labor`) con descripción e importe; el mecánico las agrega a órdenes suyas que no estén ENTREGADO/CANCELADA; puede eliminar partidas agregadas por error mientras la orden no se entregue; los totales informativos (servicios + mano de obra) se calculan en el servidor para el detalle.
- **Racionalidad**: FR-011; separar servicios y mano de obra permite reportes futuros y coincide con las tablas definidas en el insumo del sprint; los pagos quedan fuera de alcance.
- **Alternativas consideradas**: un solo tabla de partidas con tipo (rechazada: el insumo pide ambas tablas); capturar totales directamente sin partidas (rechazada: sin documentación del trabajo realizado).

## D12 — Entradas de la orden (diagnóstico, observación, recomendación)

- **Decisión**: tabla `order_entries` con `entry_type` ENUM ('DIAGNOSTIC', 'OBSERVATION', 'RECOMMENDATION'), contenido de texto, autor (`created_by`) y fecha; sin endpoints de borrado ni edición (historial inmutable, FR-011/FR-014); visibles para los tres roles en el detalle de la orden.
- **Racionalidad**: Clarificación 5; una tabla con tipo es más simple que tres tablas y cubre el historial fechado con autor.
- **Alternativas consideradas**: tres tablas separadas (rechazada: duplica modelos, servicios y pantallas sin beneficio); campos de texto en la orden con sobrescritura (rechazada: contradice la clarificación).

## D13 — Semillas del Sprint 2 (idempotentes)

- **Decisión**: `003_demo_appointments.sql` (4–5 citas de ejemplo: programadas de hoy y de la semana, una cancelada) y `004_demo_service_orders.sql` (4–5 órdenes sobre los vehículos de ejemplo: una RECIBIDO sin mecánico, una EN_REPARACION asignada a `mecanico` con diagnóstico y servicios, una ESPERANDO_REFACCION, una ENTREGADO con entradas completas y servicios, una CANCELADA), con partidas y entradas incluidas. Uso de IDs fijos y claves únicas + `ON DUPLICATE KEY UPDATE`; el runner de seeds las aplica tras las migraciones.
- **Racionalidad**: FR-017/SC-006: la aplicación muestra citas y órdenes al arrancar y la base nunca queda vacía; idempotencia como en el Sprint 1.
- **Alternativas consideradas**: seeds generados por script Node (rechazada: se decidió SQL versionado en el Sprint 1 y funciona).

## D14 — Validación de fechas y horas de la cita

- **Decisión**: la cita requiere fecha (DATE), hora (TIME), motivo, cliente activo y vehículo activo de ese cliente; la fecha debe ser igual o posterior a hoy; no se permiten dos citas para el mismo vehículo en la misma fecha y hora (clave única en base). Cancelación y edición solo de citas PROGRAMADAS.
- **Racionalidad**: evita duplicados imposibles de atender y datos imposibles (citas pasadas nuevas); la unicidad se garantiza en la base.
- **Alternativas consideradas**: permitir múltiples citas simultáneas por vehículo con prioridad manual (rechazada: complejidad sin necesidad operativa demostrada).

## D15 — Totales informativos sin pagos

- **Decisión**: el detalle de la orden muestra el total (suma de servicios y mano de obra) calculado por el servidor como dato informativo; no hay módulo de pagos, cobros ni tickets en este sprint (fuera de alcance según el insumo).
- **Racionalidad**: da contexto útil al mecánico y a recepción sin invadir el alcance de sprints posteriores.
- **Alternativas consideradas**: ocultar los importes hasta el sprint de pagos (rechazada: perder visibilidad del trabajo registrado ya sería un retroceso de valor).
