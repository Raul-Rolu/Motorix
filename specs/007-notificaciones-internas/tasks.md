---

description: "Lista de tareas para la feature 007-notificaciones-internas"
---

# Tareas: Notificaciones internas y clientes por avisar

**Input**: Documentos de diseño de `/specs/007-notificaciones-internas/`

**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, contracts/api-rest.md, quickstart.md

**Pruebas**: Sí — la spec (FR-017, CA-13) las exige. En cada historia las pruebas van ANTES de la implementación: primero se escriben y se comprueba que fallan; después se implementa lo que las hace pasar. Única excepción: la prueba de rendimiento (Fase 11), que necesita todos los tipos de aviso ya implementados.

**Organización**: agrupadas por historia de usuario (US1 a US7) para permitir implementación y prueba independientes. Cada tarea cita entre corchetes el requisito (FR-xxx) o criterio de aceptación (CA-xx) que cubre.

**Decisiones vigentes (no se reabren)**:

- Los avisos **no se almacenan**: se calculan al consultar; solo se guarda la lectura por usuario (`notification_reads`) y el registro de cliente avisado (`client_notices`).
- La migración 018 agrega `status_changed_at` a `service_orders` (rellenada con `updated_at` **sin alterarlo**), `notification_reads` y `client_notices`. Solo `orderModel.setStatus` actualiza `status_changed_at`.
- Orden detenida = estado activo y más de **3 días** sin cambio de estado. Mantenimiento próximo = pendiente no vencido con umbral a **30 días o 1,000 km** o menos (márgenes constantes solo del aviso). Los **vencidos** coinciden al 100 % con el panel y la lista; los **próximos** del centro son un subconjunto del conteo del panel.
- Un mantenimiento avisado como próximo que pasa a vencido es **el mismo hecho** (no vuelve a la lista de clientes por avisar).
- La insignia de Inventario y `StockAlertsProvider` **no existen** en este repo: CA-8 se cumple con la tarjeta `alertasPanel` del panel de control y una prueba de coincidencia; **no se agrega ninguna insignia**.
- Seed 009 aceptado (orden 6 terminada, mantenimiento 6 próximo y ajuste guardado de la orden 3); sus efectos sobre `quickstart-005.mjs` se revisan en T069.
- Sin WebSocket, sin envío automático al cliente por ningún canal y sin cambios de comportamiento en los sprints 1 a 5 y su complemento.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin depender de tareas incompletas)
- **[Historia]**: US1 a US7; las fases de preparación, base común, datos de ejemplo, rendimiento y cierre no llevan etiqueta
- **[X]**: tarea ya hecha (ninguna al generar este archivo)

## Convención de rutas

- Backend: `server/` (`models/`, `services/`, `controllers/`, `routes/`, `validators/`, `utils/`); pruebas en `server/tests/{unit,integration,contract}/`
- Frontend: `client/lib/` (`models/`, `providers/`, `screens/`, `widgets/`) y `client/test/`
- Datos: `database/migrations/`, `database/seeds/`, `database/scripts/`
- Documentos: `docs/` (evidencias en `docs/evidencias/sprint-6-notificaciones/`)

---

## Fase 1: Preparación

**Propósito**: línea base verde y verificación de supuestos antes de tocar nada.

- [ ] T001 Ejecutar `npm test` en `server/` y `flutter test` en `client/` sobre la rama actual y anotar el resultado como línea base (todas las suites previas deben estar en verde) [CA-13]
- [ ] T002 Confirmar con una búsqueda en `server/` (excluyendo `node_modules` y `tests/`) y en `database/seeds/` que `orderModel.setStatus` (`server/models/order.js`) es el único código que ejecuta `UPDATE service_orders SET status`; registrar el resultado de la búsqueda (decisión D2 de `research.md`); si apareciera otro punto, detenerse y avisar [FR-020][CA-15]

---

## Fase 2: Base común (bloquea todas las historias)

**Propósito**: esquema, errores, claves de aviso y regla de «próximo» de los que dependen las siete historias.

**⚠️ CRÍTICO**: ninguna historia empieza hasta terminar esta fase.

- [ ] T003 [P] Escribir `server/tests/integration/migration-018.test.js`: existen la columna `service_orders.status_changed_at` (`NOT NULL`, con `DEFAULT CURRENT_TIMESTAMP`) y el índice `idx_orders_status_changed`; existen `notification_reads` (`UNIQUE (user_id, notification_key)`, FK a `users`) y `client_notices` (`UNIQUE (notice_type, fact_id)`, FK a `clients` y `users`, índice por `client_id`, `note VARCHAR(255)`); el **relleno** (se ejecuta la sentencia `UPDATE` de relleno de la migración sobre órdenes con `updated_at` antiguo) deja `status_changed_at = updated_at` y **`updated_at` sin cambios**; debe fallar antes de T004 [FR-020][CA-15]
- [ ] T004 Crear `database/migrations/018_notifications_status_changed.sql` (aditiva; no toca 001–017) con, en este orden: `ALTER TABLE service_orders ADD COLUMN status_changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` + `CREATE INDEX idx_orders_status_changed ON service_orders (status, status_changed_at)`; `UPDATE service_orders SET status_changed_at = updated_at, updated_at = updated_at` (la asignación explícita evita que `ON UPDATE CURRENT_TIMESTAMP` altere `updated_at`); `CREATE TABLE notification_reads` y `CREATE TABLE client_notices` con las columnas, llaves foráneas, restricciones únicas e índices de `data-model.md` (secciones 1 a 3); InnoDB y `utf8mb4` [FR-003][FR-015][FR-020][CA-15]
- [ ] T005 Aplicar la migración sobre `motorix_test` con `server/tests/helpers/db-test.js` (que ya detecta toda migración numerada) y con `node database/scripts/apply-migrations.mjs` sobre una base desechable; comprobar que 018 queda registrada, que las filas existentes de `service_orders` conservan su `updated_at` y que una segunda corrida no la repite; T003 debe pasar (depende de T003, T004). La base principal la aplica el usuario [CA-15]
- [ ] T006 Extender `limpiarTablas()` en `server/tests/helpers/db-test.js` para vaciar `notification_reads` y `client_notices` antes de `users` y `clients` (es un helper, no una prueba existente) (depende de T005) [CA-13]
- [ ] T007 [P] Agregar al catálogo de `server/utils/errors.js` los códigos `NOTIFICATION_NOT_FOUND` (404), `CLIENT_NOTICE_NOT_PENDING` (409) y `CLIENT_NOTICE_DUPLICATE` (409, con `details` de quién y cuándo) con mensajes en español [FR-006][FR-015][CA-6][CA-11]
- [ ] T008 [P] Escribir `server/tests/unit/notification-keys.test.js`: construcción y validación de claves `TIPO:ID:ESTADO` (`MANTENIMIENTO:12:VENCIDO`, `MANTENIMIENTO:12:PROXIMO`, `CITA:7:HOY`, `STOCK:7:BAJO`, `STOCK:7:AGOTADO`, `ORDEN:5:DETENIDA`), rechazo de formato inválido, de ID no numérico y de más de 80 caracteres, y que un cambio de estado cambia la clave; debe fallar antes de T009 [FR-006][CA-6]
- [ ] T009 Crear `server/utils/notification-keys.js` (construir, validar y descomponer claves; sin base de datos) y hacer pasar T008 (depende de T008) [FR-006][CA-6]
- [ ] T010 [P] Escribir `server/tests/unit/maintenance-proximo.test.js`: `esProximo` con fecha a 30 días (sí) y a 31 (no), con km a 1,000 (sí) y a 1,001 (no), con ambos umbrales (basta uno), con un solo umbral, vencido (no es próximo), cancelado o completado (no), sin umbrales alcanzables; y que `esVencido` conserva su comportamiento actual; debe fallar antes de T011 [FR-012][CA-3][CA-5]
- [ ] T011 Agregar a `server/services/maintenance-state.js` las constantes `MARGEN_PROXIMO_DIAS = 30` y `MARGEN_PROXIMO_KM = 1000` y la función pura `esProximo(mantenimiento, kmActual, hoy)`, sin modificar `esVencido` ni las demás funciones, y hacer pasar T010 (depende de T010) [FR-012][CA-3][CA-5]

**Punto de control**: migración 018 aplicada y repetible, claves y `esProximo` probados, errores nuevos disponibles; las suites previas siguen en verde.

---

## Fase 3: Historia de usuario 1 — Contador de avisos en el encabezado (Prioridad: P1) 🎯 MVP

**Objetivo**: el administrador ve en el encabezado una campana con el total de avisos no leídos y un panel agrupado por tipo, que se actualiza al iniciar sesión, al navegar y cada 60 segundos, con estados de carga, vacío y error. Esta historia entrega la ruta `GET /api/notifications` con su servicio y el cliente completo (campana, panel, proveedor y temporizador), con el primer tipo de aviso (mantenimiento vencido); los demás tipos se suman en las historias siguientes.

**Prueba independiente**: con un mantenimiento vencido, iniciar sesión como administrador y comprobar la campana, el total, el panel agrupado, el estado vacío y el de error (E2 y E7 del quickstart).

### Pruebas de la Historia 1 (escribirlas primero; deben fallar) ⚠️

- [ ] T012 [P] [US1] Crear `server/tests/integration/notifications-calculo.test.js` con el bloque inicial: forma de la respuesta `{ total, noLeidos, datos }` y de cada aviso (`clave`, `grupo`, `estado`, `titulo`, `detalle`, `leido`, `destino`); sin avisos devuelve `{ total: 0, noLeidos: 0, datos: [] }`; mantenimiento vencido por fecha y por kilometraje genera `MANTENIMIENTO:<id>:VENCIDO` con el texto del contrato; los avisos de vencido coinciden en cantidad con `GET /api/dashboard` (`mantenimientos.vencidos`) y con la lista de Mantenimientos; los avisos no se copian a ninguna tabla (solo existe `notification_reads`) [FR-001][FR-002][FR-003][FR-005][CA-1][CA-2][CA-3][CA-5]
- [ ] T013 [P] [US1] Crear `server/tests/contract/notifications-roles.test.js` con el bloque inicial: sin token → 401; ADMIN → 200 con la forma del contrato; `GET /api/notifications` no acepta parámetros que cambien el rol evaluado [FR-004][CA-4]
- [ ] T014 [P] [US1] Crear `client/test/notifications_bell_test.dart` (cliente HTTP falso): la campana muestra el número de no leídos con `Badge` (oculto en 0 y «99+» como máximo), abre el panel con los avisos agrupados por tipo, y el panel muestra los estados cargando (indicador discreto), vacío («No tienes avisos pendientes.») y error («No se pudieron cargar los avisos.» con «Reintentar», sin trazas) [FR-001][FR-009][CA-1][CA-9]
- [ ] T015 [P] [US1] Crear `client/test/notifications_refresh_test.dart` (reloj falso): se consulta al iniciar sesión, cada 60 segundos, al cambiar de sección del `AppShell` y no se duplican consultas en curso; el temporizador se cancela al cerrar sesión y al liberar el proveedor [FR-013][CA-1]

### Implementación de la Historia 1

- [ ] T016 [US1] Crear `server/services/notification-service.js` con `obtenerAvisos(usuario)`: arma la lista del usuario al consultar, reutilizando `maintenanceModel.findAll` (pendientes), `maintenanceModel.findCurrentMileageByVehicles` y `esVencido` para el aviso de mantenimiento vencido; construye `clave` con `notification-keys.js`, `titulo`, `detalle`, `destino` y calcula `total` y `noLeidos` (por ahora `leido: false`), ordenando por grupo y urgencia (depende de T009) [FR-001][FR-002][FR-003][FR-005][CA-1][CA-2]
- [ ] T017 [US1] Crear `server/controllers/notification-controller.js` y `server/routes/notification-routes.js` con `GET /api/notifications` (`auth` + `requireRole('ADMIN','RECEPTIONIST','MECHANIC')`) y montar la ruta en `server/app.js` sin tocar las existentes (depende de T016) [FR-001][FR-004][CA-1]
- [ ] T018 [P] [US1] Crear `client/lib/models/notification.dart` con `Aviso` (clave, grupo, estado, título, detalle, leído, destino), `GrupoAviso` (orden de presentación) y la lectura de la respuesta `{ total, noLeidos, datos }` [FR-001][CA-1]
- [ ] T019 [US1] Crear `client/lib/providers/notifications_provider.dart`: carga de avisos, estados cargando/vacío/error con `Reintentar`, `Timer.periodic` de 60 s con cancelación al cerrar sesión o liberar el proveedor, sin consultas duplicadas en curso y recarga al iniciar sesión y al cambiar de sección (depende de T018) [FR-009][FR-013][CA-1][CA-9]
- [ ] T020 [US1] Crear `client/lib/widgets/notification_bell.dart` (`IconButton` con `Icons.notifications_outlined` y `Badge`) y `client/lib/widgets/notifications_panel.dart` (panel lateral con grupos con subtítulo y contador, filas con divisores y sin tarjetas, tokens de `docs/design-system.md`, un solo set de íconos) (depende de T019) [FR-001][FR-009][CA-1][CA-9]
- [ ] T021 [US1] Integrar la campana en `client/lib/widgets/app_shell.dart` (en las `actions` del `AppBar`, `endDrawer` con el panel, recarga al cambiar de sección) y registrar el proveedor en `client/lib/main.dart` (depende de T020) [FR-001][FR-013][CA-1]
- [ ] T022 [US1] Ejecutar T012 a T015 hasta verlas pasar y repetir `npx jest dashboard maintenance` en `server/` y `flutter test` en `client/` para confirmar que las suites previas siguen en verde [CA-1][CA-13]

**Punto de control**: US1 funciona sola y es demostrable (MVP).

---

## Fase 4: Historia de usuario 2 — Mantenimientos y citas para la recepción (Prioridad: P1)

**Objetivo**: la recepcionista ve los mantenimientos próximos y vencidos y las citas del día.

**Prueba independiente**: iniciar sesión como recepcionista con mantenimientos y citas sembrados y verificar solo esos avisos; la cita cancelada o completada no genera aviso (E2 y E4 del quickstart).

### Pruebas de la Historia 2 (escribirlas primero; deben fallar) ⚠️

- [ ] T023 [US2] Agregar a `server/tests/integration/notifications-calculo.test.js` (depende de T012): mantenimiento próximo por fecha (≤ 30 días) y por kilometraje (≤ 1,000 km) genera `MANTENIMIENTO:<id>:PROXIMO`; uno lejano no genera aviso; cancelado o completado no genera; cita de hoy `PROGRAMADA` genera `CITA:<id>:HOY` con hora, cliente, placas y motivo; citas `CANCELADA`, `COMPLETADA` y de otro día no generan; los próximos del centro son un subconjunto de `mantenimientos.proximos` del panel [FR-002][FR-011][FR-012][CA-3][CA-5]
- [ ] T024 [US2] Agregar a `server/tests/contract/notifications-roles.test.js` (depende de T013): RECEPTIONIST recibe mantenimientos, citas y órdenes detenidas y **ninguna** clave `STOCK:` aunque existan refacciones en alerta [FR-004][CA-4]
- [ ] T025 [P] [US2] Crear `client/test/notifications_panel_test.dart`: grupos de próximos (`warning`) y de citas de hoy (texto secundario) con sus títulos, íconos y orden de presentación (vencidos, órdenes detenidas, stock, próximos, citas) y estados cargando/vacío/error del panel [FR-001][FR-009][CA-1][CA-9]

### Implementación de la Historia 2

- [ ] T026 [US2] Agregar a `server/models/appointment.js` `findProgramadasPorFecha(fecha)` (citas `PROGRAMADA` de una fecha con cliente, vehículo, hora y motivo), sin modificar las funciones existentes; sirve también a la cita de mañana de US7 [FR-011]
- [ ] T027 [US2] Ampliar `server/services/notification-service.js` con los avisos de mantenimiento próximo (`esProximo`) y de cita del día (hoy con `hoyLocal()`), y con el filtro por rol de RECEPTIONIST (sin cálculo de stock) (depende de T011, T016, T026) [FR-002][FR-004][FR-011][FR-012][CA-3][CA-4]
- [ ] T028 [US2] Ajustar `client/lib/widgets/notifications_panel.dart` con título, ícono y color de los grupos «Mantenimientos próximos» y «Citas de hoy» (depende de T020) [FR-001][CA-1]
- [ ] T029 [US2] Ejecutar T023 a T025 hasta verlas pasar y repetir `npx jest appointments` en `server/` [CA-3][CA-4][CA-13]

**Punto de control**: US2 verificable; la recepción ve sus tres tipos de aviso.

---

## Fase 5: Historia de usuario 3 — Stock bajo o agotado para el administrador (Prioridad: P2)

**Objetivo**: el administrador ve las refacciones con stock bajo o agotado, con las mismas cifras que el panel de control.

**Prueba independiente**: refacciones en distintos niveles de stock, verificando los avisos y su coincidencia con `alertasPanel` (E2, E3 y E8 del quickstart).

### Pruebas de la Historia 3 (escribirlas primero; deben fallar) ⚠️

- [ ] T030 [US3] Agregar a `server/tests/integration/notifications-calculo.test.js` (depende de T023): `STOCK:<id>:BAJO` (0 < stock ≤ mínimo) y `STOCK:<id>:AGOTADO` (stock 0); refacción inactiva o con stock por encima del mínimo no genera; la suma de ambos coincide con `GET /api/dashboard` (`inventario.stockBajo`) y con las refacciones activas con `lowStock` de `GET /api/parts`; al reponer el stock el aviso desaparece y al pasar de bajo a agotado la clave cambia [FR-002][FR-005][CA-3][CA-5]
- [ ] T031 [P] [US3] Crear `client/test/dashboard_alerts_compat_test.dart`: la tarjeta `alertasPanel` del panel de control sigue mostrando mantenimientos vencidos, stock bajo y cobros digitales pendientes sin cambios, y sus cifras (vencidos y stock) coinciden con las del centro de notificaciones; no existe ni se agrega ninguna insignia en la sección Inventario [FR-008][CA-8]

### Implementación de la Historia 3

- [ ] T032 [US3] Exportar desde `server/models/part.js` la constante `CONDICION_STOCK_EN_ALERTA` (`is_active = 1 AND stock <= min_stock`) y agregar `findEnAlerta()` que devuelve las refacciones en alerta con su stock y mínimo [FR-005][CA-5]
- [ ] T033 [US3] Hacer que `contarStockBajo` de `server/models/dashboard.js` use `CONDICION_STOCK_EN_ALERTA` (cambio de una línea: mismo resultado y mismo comportamiento) y confirmar que `dashboard.test.js` sigue en verde sin editarse (depende de T032) [FR-005][CA-5]
- [ ] T034 [US3] Ampliar `server/services/notification-service.js` con los avisos de stock bajo y agotado solo para ADMIN (RECEPTIONIST y MECHANIC nunca ejecutan la consulta) (depende de T027, T032) [FR-002][FR-004][CA-3][CA-4]
- [ ] T035 [US3] Ajustar `client/lib/widgets/notifications_panel.dart` con el grupo «Stock bajo o agotado» (`warning` para bajo, `danger` para agotado, `Icons.inventory_2_outlined`) (depende de T028) [FR-001][CA-1]
- [ ] T036 [US3] Ejecutar T030 y T031 hasta verlas pasar y repetir `npx jest dashboard parts` en `server/` [CA-3][CA-5][CA-8][CA-13]

**Punto de control**: US3 verificable; las cifras de stock coinciden entre pantallas y `alertasPanel` no cambia.

---

## Fase 6: Historia de usuario 4 — Órdenes detenidas (Prioridad: P2)

**Objetivo**: administración y recepción ven las órdenes activas sin cambio de estado desde hace más de 3 días, medido con `status_changed_at`, que se actualiza solo al cambiar el estado.

**Prueba independiente**: órdenes en distintos estados y con distinta antigüedad del último cambio de estado; editar sin cambiar el estado no reinicia el plazo (E5 del quickstart).

### Pruebas de la Historia 4 (escribirlas primero; deben fallar) ⚠️

- [ ] T037 [P] [US4] Crear `server/tests/integration/order-status-changed.test.js`: cada transición de estado (avance, pausa y reanudación de `ESPERANDO_REFACCION`, cancelación) actualiza `status_changed_at`; el alta de una orden la inicia en su creación; editar motivo, notas, kilometraje o asignar mecánico **no** la modifica; ninguna respuesta existente de órdenes expone la columna ni cambia de forma [FR-020][CA-15]
- [ ] T038 [US4] Agregar a `server/tests/integration/notifications-calculo.test.js` (depende de T030): orden en estado activo con `status_changed_at` de hace más de 3 días genera `ORDEN:<id>:DETENIDA`; de 3 días o menos no; `TERMINADO`, `ENTREGADO` y `CANCELADA` nunca; cambiar el estado quita el aviso; editar motivo o notas no lo quita [FR-010][CA-3]
- [ ] T039 [US4] Agregar a `server/tests/contract/notifications-roles.test.js` (depende de T024): ADMIN y RECEPTIONIST reciben todas las órdenes detenidas [FR-004][CA-4]

### Implementación de la Historia 4

- [ ] T040 [US4] Actualizar `orderModel.setStatus` en `server/models/order.js` para que su `UPDATE` también asigne `status_changed_at = CURRENT_TIMESTAMP`, sin cambiar su firma, sus validaciones ni sus respuestas; `update`, `setMechanic` y `create` no cambian (depende de T005) [FR-020][CA-15]
- [ ] T041 [US4] Crear `server/models/notification.js` con `findOrdenesDetenidas({ dias, mechanicId })` (estados `RECIBIDO`, `DIAGNOSTICO`, `EN_REPARACION`, `ESPERANDO_REFACCION` y `status_changed_at < NOW() - INTERVAL ? DAY`, con placas y estado; `mechanicId` opcional) (depende de T005) [FR-010][CA-3]
- [ ] T042 [US4] Ampliar `server/services/notification-service.js` con los avisos de orden detenida (constante `DIAS_ORDEN_DETENIDA = 3`) para ADMIN y RECEPTIONIST (depende de T034, T041) [FR-002][FR-010][CA-3][CA-4]
- [ ] T043 [US4] Ajustar `client/lib/widgets/notifications_panel.dart` con el grupo «Órdenes detenidas» (`warning`, `Icons.assignment_late_outlined`) (depende de T035) [FR-001][CA-1]
- [ ] T044 [US4] Ejecutar T037 a T039 hasta verlas pasar y repetir `npx jest orders order-state` en `server/` para confirmar que las suites previas de órdenes siguen en verde sin editarse [CA-3][CA-15][CA-13]

**Punto de control**: US4 verificable; las órdenes detenidas aparecen y el plazo solo se reinicia con un cambio de estado.

---

## Fase 7: Historia de usuario 5 — El mecánico ve solo lo suyo (Prioridad: P2)

**Objetivo**: el mecánico recibe únicamente avisos de órdenes detenidas asignadas a él.

**Prueba independiente**: órdenes detenidas de dos mecánicos distintos y datos de mantenimiento, citas y stock; cada mecánico recibe solo las suyas (E4 del quickstart).

### Pruebas de la Historia 5 (escribirlas primero; deben fallar) ⚠️

- [ ] T045 [US5] Agregar a `server/tests/contract/notifications-roles.test.js` (depende de T039): MECHANIC recibe solo `ORDEN:` de sus órdenes; no recibe mantenimientos, citas ni stock aunque existan; una orden detenida sin mecánico no se devuelve; reasignarla cambia el destinatario; para MECHANIC no se ejecutan las consultas de otros tipos [FR-004][CA-4]

### Implementación de la Historia 5

- [ ] T046 [US5] Ampliar `server/services/notification-service.js` con la ruta de MECHANIC: solo `findOrdenesDetenidas({ mechanicId: usuario.id })` y ningún otro cálculo (depende de T042) [FR-004][CA-4]
- [ ] T047 [US5] Ampliar `client/test/notifications_panel_test.dart` (depende de T025): con una respuesta de mecánico solo se muestran los grupos recibidos (sin encabezados vacíos) y la campana cuenta solo sus avisos [FR-001][CA-4]
- [ ] T048 [US5] Ejecutar T045 y T047 hasta verlas pasar [CA-4][CA-13]

**Punto de control**: US5 verificable; el mecánico nunca recibe información ajena (validado en backend).

---

## Fase 8: Historia de usuario 6 — Marcar como leído y abrir el módulo relacionado (Prioridad: P2)

**Objetivo**: marcar un aviso como leído persiste por usuario; si cambia de estado vuelve como no leído; cada aviso abre su pantalla relacionada.

**Prueba independiente**: marcar avisos como leídos, cerrar sesión, volver a entrar y comprobar el estado por usuario; abrir cada tipo de aviso (E3 del quickstart).

### Pruebas de la Historia 6 (escribirlas primero; deben fallar) ⚠️

- [ ] T049 [P] [US6] Crear `server/tests/integration/notifications-lectura.test.js`: `POST /api/notifications/reads` marca para el usuario autenticado (otro usuario lo sigue viendo no leído), es idempotente, el contador `noLeidos` baja; clave ausente o de formato inválido → 400; clave no vigente, inexistente o de un tipo que el rol no ve → `404 NOTIFICATION_NOT_FOUND` sin guardar nada; si la condición deja de cumplirse el aviso desaparece; si cambia de estado (próximo → vencido, bajo → agotado) reaparece como no leído; si reaparece con el mismo estado sigue leído [FR-006][CA-6]
- [ ] T050 [P] [US6] Ampliar `client/test/notifications_panel_test.dart` (depende de T047): marcar como leído baja el contador y atenúa la fila; abrir un aviso lo marca como leído y navega (orden → detalle de la orden, mantenimiento → historial del vehículo, stock → sección Inventario, cita → sección Citas) [FR-006][FR-007][CA-6][CA-7]

### Implementación de la Historia 6

- [ ] T051 [US6] Ampliar `server/models/notification.js` (depende de T041) con la consulta de lecturas del usuario sobre un conjunto de claves y `marcarLeido(userId, clave)` con `INSERT … ON DUPLICATE KEY UPDATE read_at = read_at` [FR-006][CA-6]
- [ ] T052 [US6] Crear `server/validators/notification-validator.js` con `zod`: la clave de lectura (obligatoria, ≤ 80, formato válido) con mensajes en español [FR-006][CA-6]
- [ ] T053 [US6] Ampliar `server/services/notification-service.js`, `server/controllers/notification-controller.js` y `server/routes/notification-routes.js` (depende de T046, T051, T052): `leido` y `noLeidos` reales en `GET /api/notifications`; `POST /api/notifications/reads` valida que la clave pertenezca a los avisos vigentes del propio usuario, guarda la lectura y responde `{ clave, leido, noLeidos }` o `404 NOTIFICATION_NOT_FOUND` [FR-006][FR-004][CA-6]
- [ ] T054 [P] [US6] Crear `client/lib/providers/shell_navigation_provider.dart` (`ChangeNotifier` con la sección solicitada por un aviso: Inventario o Citas) [FR-007][CA-7]
- [ ] T055 [US6] Ampliar `client/lib/providers/notifications_provider.dart` con `marcarLeido(clave)` (optimista, con reversión si falla) y `client/lib/widgets/notifications_panel.dart` con el botón «Marcar como leído» y la apertura del aviso (`Navigator.push` a `OrderDetailScreen`, carga de `GET /api/vehicles/:id` y `VehicleHistoryScreen`, o petición al `ShellNavigationProvider`); `client/lib/widgets/app_shell.dart` escucha el `ShellNavigationProvider` y `client/lib/main.dart` lo registra (depende de T021, T054) [FR-006][FR-007][CA-6][CA-7]
- [ ] T056 [US6] Ejecutar T049 y T050 hasta verlas pasar y repetir las suites de T029, T036 y T044 [CA-6][CA-7][CA-13]

**Punto de control**: US6 verificable; el contador baja al leer y el aviso lleva a su pantalla.

---

## Fase 9: Historia de usuario 7 — Clientes por avisar (Prioridad: P3)

**Objetivo**: recepción y administración ven los clientes por avisar (vehículo listo, cita de mañana, mantenimiento próximo o vencido) con su teléfono, los marcan como avisados con nota opcional y no vuelven a verlos por el mismo hecho; el mecánico no accede.

**Prueba independiente**: una orden terminada, una cita de mañana y un mantenimiento próximo sembrados; listar, marcar como avisado y reconsultar (E6 del quickstart).

### Pruebas de la Historia 7 (escribirlas primero; deben fallar) ⚠️

- [ ] T057 [P] [US7] Crear `server/tests/integration/client-notices.test.js`: la lista incluye `ORDEN_TERMINADA` (orden `TERMINADO` sin entregar), `CITA_MANANA` (cita `PROGRAMADA` de mañana) y `MANTENIMIENTO` (vencido o próximo) con cliente, teléfono, vehículo y motivo; `POST /api/client-notices` guarda quién, cuándo y la nota (255 caracteres sí, 256 → 400), saca el hecho de la lista y repetirlo → `409 CLIENT_NOTICE_DUPLICATE`; un hecho no pendiente (orden ya entregada, cita cancelada, mantenimiento completado o inexistente) → `409 CLIENT_NOTICE_NOT_PENDING`; un mantenimiento avisado como próximo que pasa a vencido **no** vuelve a la lista y uno nuevo sí; otra orden terminada u otra cita reaparecen; dos solicitudes simultáneas del mismo hecho producen un solo registro [FR-014][FR-015][CA-10][CA-11]
- [ ] T058 [US7] Agregar a `server/tests/contract/notifications-roles.test.js` (depende de T045): MECHANIC → `403 NO_AUTORIZADO` en `GET /api/client-notices/pending` y en `POST /api/client-notices`; ADMIN y RECEPTIONIST autorizados; sin token → 401 [FR-014][CA-10]
- [ ] T059 [P] [US7] Crear `client/test/clients_to_notify_test.dart`: la pantalla lista cliente, teléfono, vehículo y motivo; «Marcar como avisado» abre el diálogo con nota opcional (contador y límite de 255) y botones «Cancelar» y «Confirmar»; al confirmar el cliente sale de la lista; estados cargando, vacío y error; la sección solo aparece para ADMIN y RECEPTIONIST [FR-014][FR-015][CA-10][CA-11]

### Implementación de la Historia 7

- [ ] T060 [US7] Crear `server/models/client-notice.js`: alta del aviso (cliente, tipo, hecho, nota, usuario), consulta de los hechos ya avisados y manejo de la restricción única como duplicado [FR-015][CA-11]
- [ ] T061 [US7] Ampliar `server/validators/notification-validator.js` (depende de T052) con `tipo` (catálogo), `hechoId` (entero positivo) y `nota` opcional (≤ 255) en español [FR-015][CA-11]
- [ ] T062 [US7] Ampliar `server/services/notification-service.js` (depende de T027, T053, T060, T061) con `listarClientesPorAvisar()` (hechos de orden terminada, cita de mañana con `findProgramadasPorFecha` y mantenimientos vencidos o próximos, menos los ya avisados; cliente y teléfono de `clients`) y `marcarAvisado()` (valida que el hecho esté pendiente, `409 CLIENT_NOTICE_NOT_PENDING` o `CLIENT_NOTICE_DUPLICATE`), y agregar a `server/controllers/notification-controller.js` y `server/routes/notification-routes.js` `GET /api/client-notices/pending` y `POST /api/client-notices` con `requireRole('ADMIN','RECEPTIONIST')` [FR-014][FR-015][FR-019][CA-10][CA-11]
- [ ] T063 [P] [US7] Agregar `ClientePorAvisar` a `client/lib/models/notification.dart` y crear `client/lib/providers/clients_to_notify_provider.dart` (carga, estados, marcar avisado con nota) (depende de T018) [FR-014][FR-015][CA-10][CA-11]
- [ ] T064 [US7] Crear `client/lib/screens/clients_to_notify_screen.dart` (lista densa con cliente, teléfono, vehículo y motivo, botón «Marcar como avisado», diálogo con nota y confirmación según `docs/design-system.md` 8.5) y agregar la sección «Clientes por avisar» (`Icons.phone_in_talk_outlined`) a `client/lib/widgets/app_shell.dart` para `puedeGestionarClientes`, registrando el proveedor en `client/lib/main.dart` (depende de T055, T063) [FR-014][FR-015][CA-10][CA-11]
- [ ] T065 [US7] Ejecutar T057 a T059 hasta verlas pasar y repetir `npx jest clients appointments maintenance` en `server/` [CA-10][CA-11][CA-13]

**Punto de control**: US7 verificable; ningún cliente avisado vuelve por el mismo hecho.

---

## Fase 10: Datos de ejemplo (CA-12)

**Propósito**: seeds idempotentes con un caso de cada tipo de aviso, sin reiniciar datos de trabajo. Dependen de la migración 018 (T005) y se verifican fuera de Jest (las suites no aplican seeds).

- [ ] T066 [P] Ajustar `database/seeds/004_demo_service_orders.sql`: agregar `status_changed_at` explícito a las órdenes de ejemplo (orden 3 `ESPERANDO_REFACCION` hace 5 días; las demás recientes o antiguas según su estado) y mantener su `ON DUPLICATE KEY UPDATE` sin tocar esa columna (una segunda corrida no la reinicia) [FR-016][CA-12]
- [ ] T067 [P] Crear `database/seeds/009_demo_notifications.sql` (IDs fijos y `ON DUPLICATE KEY UPDATE` solo sobre descripciones): orden **6** `TERMINADO` del cliente 3 y vehículo 4 con el mecánico de ejemplo y `status_changed_at` de hace 1 día; mantenimiento **6** del vehículo 1 con fecha objetivo `CURDATE() + 10 días`; y el ajuste guardado de la orden 3 (`UPDATE … WHERE id = 3 AND status = 'ESPERANDO_REFACCION' AND notes = 'Falta el compresor en el almacén' AND status_changed_at > DATE_SUB(NOW(), INTERVAL 3 DAY)`); sin filas en `notification_reads` ni `client_notices` [FR-016][CA-12]
- [ ] T068 **VERIFICACIÓN**: sobre una base limpia, correr `node database/scripts/apply-migrations.mjs` (001–018) y `node database/scripts/apply-seeds.mjs` **dos veces**; comparar los conteos de `service_orders` (6), `maintenance_plans` (6), `notification_reads` (0), `client_notices` (0) y de las demás tablas (idénticos entre corridas); comprobar que la orden 3 conserva su fecha antigua; y con las cuentas de ejemplo comprobar por la API que existe al menos un aviso de cada tipo (vencido, próximo, cita del día, stock bajo, orden detenida) y la lista de clientes por avisar con la orden 6, la cita de mañana y los mantenimientos; guardar la salida como evidencia (depende de T066, T067) [FR-016][CA-12]
- [ ] T069 **VERIFICACIÓN de cifras absolutas**: con `motorix_test` recreada (migraciones 001–018 y seeds 001–009) ejecutar `docs/evidencias/aseguramiento/quickstart-005.mjs` y revisar sus cifras absolutas frente al seed 009 (recorridos por las órdenes 1 a 5, conteos de refacciones, usos y movimientos, y comparaciones antes/después de la doble corrida); además revisar las cifras absolutas citadas en el quickstart de la 006 (E1). Si todo coincide, registrarlo; si una cifra absoluta ya no coincide por la orden 6 o el mantenimiento 6, **no editar el script de evidencia**: documentar la diferencia (en el informe de la tarea) y consultarla antes de decidir (depende de T068) [CA-12][CA-13]

**Punto de control**: seeds idempotentes comprobados; la evidencia de la spec 005 revisada tras agregar los datos del Sprint 6.

---

## Fase 11: Rendimiento (CA-13)

**Propósito**: comprobar la cifra de rendimiento con volumen ampliado. Se escribe **después** de las historias porque necesita todos los tipos de aviso implementados.

- [ ] T070 [P] Escribir `server/tests/integration/notifications-performance.test.js` contra `motorix_test` (depende de T046, T053): siembra por SQL masivo 1,000 órdenes (200 en estados activos, 100 detenidas), 600 citas (100 `PROGRAMADA` de hoy), 400 refacciones (100 en alerta), 500 mantenimientos pendientes en 300 vehículos (100 vencidos o próximos) y 200 lecturas; descarta una llamada de calentamiento, mide 5 llamadas de `GET /api/notifications` con `performance.now()` para ADMIN, RECEPTIONIST y MECHANIC y exige que el **máximo** de cada rol sea **menor de 1,000 ms**; envuelve `pool.query` para contar consultas y exige **8 o menos** por petición [FR-017][CA-13]
- [ ] T071 Ejecutar T070 hasta verla pasar y guardar los tiempos medidos en `docs/evidencias/sprint-6-notificaciones/notifications-performance.txt`; si el máximo supera 1,000 ms, evaluar el índice de `appointments (appointment_date, status)` descartado en D11 antes de relajar el criterio (depende de T070) [FR-017][CA-13]

**Punto de control**: la consulta de avisos cumple < 1 s con el volumen ampliado y sin N+1.

---

## Fase 12: Documentación y cierre

**Propósito**: documentación sin contradicciones, evidencia visual y validación final.

- [ ] T072 [P] Actualizar `docs/project-context.md` sección 6.12: tipos de aviso, reglas (orden detenida 3 días, próximo 30 días o 1,000 km), visibilidad por rol, claves de aviso y lectura por usuario, clientes por avisar, entidades `notification_reads` y `client_notices` y la columna `status_changed_at` [FR-018][CA-14]
- [ ] T073 [P] Actualizar `docs/design-system.md`: campana con `Badge` en el encabezado, panel lateral de avisos (grupos, colores `warning`/`danger`, estados cargando/vacío/error) y pantalla «Clientes por avisar» con su diálogo de nota (8.2 a 8.5) [FR-018][CA-14]
- [ ] T074 [P] Actualizar `database/README.md` con la migración 018 y los seeds 004 (ajuste) y 009, y la nota de idempotencia [FR-018][CA-14]
- [ ] T075 Buscar y corregir en `server/` y `client/lib/` los comentarios y docstrings que queden desactualizados por esta feature (por ejemplo, que el estado de una orden solo cambia el estado, o que las alertas viven solo en el panel de control); registrar el resultado de la búsqueda aunque no haya coincidencias [FR-018][CA-14]
- [ ] T076 Ejecutar el paso 3 del escenario E10 de `quickstart.md` (revisión de T072 a T075) y dejar constancia del diff revisado; no se tocan specs anteriores [CA-14]
- [ ] T077 Tomar las capturas de evidencia del quickstart en `docs/evidencias/sprint-6-notificaciones/` con estos nombres: `s6-00-campana-admin.png` (campana con contador), `s6-01-panel-admin.png` (grupos de avisos), `s6-02-aviso-leido.png` (contador baja), `s6-03-aviso-stock-inventario.png` (abre Inventario), `s6-04-panel-recepcion.png` (sin avisos de stock), `s6-05-panel-mecanico.png` (solo sus órdenes), `s6-06-clientes-por-avisar.png`, `s6-07-marcar-avisado.png` (diálogo con nota), `s6-08-lista-tras-avisar.png`, `s6-09-panel-vacio.png`, `s6-10-panel-error.png` y `s6-11-alertas-panel-compat.png` (`alertasPanel` junto a la campana) [CA-1][CA-4][CA-7][CA-8][CA-9][CA-10]
- [ ] T078 Ejecutar los escenarios E1 a E10 de `quickstart.md` sobre `motorix_test` recreada y registrar el resultado (con un guion de validación fuera del repositorio si se automatiza) [CA-1][CA-2][CA-3][CA-4][CA-5][CA-6][CA-7][CA-8][CA-9][CA-10][CA-11][CA-12][CA-13][CA-15]
- [ ] T079 Corrida final: `npm test` en `server/`, `flutter test` y `flutter analyze` en `client/`; todas las suites previas y las nuevas (migración, claves, próximo, cálculo, roles, lectura, clientes por avisar, `status_changed_at`, rendimiento y pantallas) en verde, y revisión contra la constitución y `docs/reglas.md` (español, permisos en backend, sin secretos, sin dependencias nuevas, commits por Conventional Commits) [FR-017][CA-13]

---

## Trazabilidad CA → tareas

| CA | Pruebas (primero) | Implementación / verificación |
|---|---|---|
| CA-1 | T012, T014, T015, T025 | T016, T017, T018, T019, T020, T021, T022, T028, T035, T043 |
| CA-2 | T012 | T016, T022 |
| CA-3 | T010, T012, T023, T030, T038 | T011, T016, T027, T034, T041, T042 |
| CA-4 | T013, T024, T039, T045, T047 | T027, T034, T042, T046, T048 |
| CA-5 | T010, T012, T023, T030, T031 | T011, T016, T027, T032, T033, T034, T036 |
| CA-6 | T008, T049, T050 | T009, T051, T052, T053, T055, T056 |
| CA-7 | T050 | T054, T055, T056 |
| CA-8 | T031 | T036, T077 |
| CA-9 | T014, T025 | T019, T020, T028 |
| CA-10 | T057, T058, T059 | T062, T063, T064, T065 |
| CA-11 | T057, T059 | T060, T061, T062, T065 |
| CA-12 | T068 (verificación) | T066, T067, T068, T069 |
| CA-13 | T001, T008, T010, T012, T049, T057, T070 | T022, T029, T036, T044, T048, T056, T065, T069, T071, T078, T079 |
| CA-14 | T076 | T072, T073, T074, T075, T076 |
| CA-15 | T003, T037 | T002, T004, T005, T040, T044, T068 |

Todos los CA (CA-1 a CA-15) tienen al menos una tarea. CA-12 y CA-14 se validan por verificación documentada y revisión, no por Jest (los seeds y la documentación quedan fuera de las suites).

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (Fase 1)**: sin dependencias.
- **Base común (Fase 2)**: depende de la Fase 1 y **bloquea** todas las historias. Dentro de ella: T003 → T004 → T005 → T006; T007 es independiente; T008 → T009; T010 → T011.
- **Historias (Fases 3 a 9)**: dependen de la Fase 2. US1 es el MVP.
- **Datos de ejemplo (Fase 10)**: depende de T005; T068 y T069 conviene correrlas cuando US1 a US4 y US7 estén implementadas para verificar los avisos por la API.
- **Rendimiento (Fase 11)**: depende de los tipos de aviso (US1 a US5 y US6 para las lecturas).
- **Cierre (Fase 12)**: depende de las historias; T072 y T073 pueden empezar cuando US1 y US7 definan su contenido; T079 es siempre la última.

### Dependencias entre historias

- **US1 (P1)**: tras la Fase 2; sin dependencias de otras historias.
- **US2 (P1)**: tras US1 (T016, T017, T020 y los archivos compartidos del servicio y las pruebas).
- **US3 (P2)**: tras US1; comparte `notification-service.js`, `notifications-calculo.test.js` y el panel, por lo que sus tareas van después de T027 y T028.
- **US4 (P2)**: tras la Fase 2 (T005) y US1; el servicio y el panel se amplían después de US3 (T034, T035).
- **US5 (P2)**: **depende de US4** (T041, T042): reutiliza la consulta de órdenes detenidas con el filtro por mecánico.
- **US6 (P2)**: tras US1 y la Fase 2 (T009); T053 se ordena después de US5 porque comparte el servicio, y T055 después de T021 (app shell).
- **US7 (P3)**: **depende de US2** (T026, T027: citas de mañana, próximo) y de US6 (T052, T053, T055: validador, servicio, rutas y `app_shell.dart`).

### Dentro de cada historia

- Las pruebas se escriben primero y deben fallar antes de implementar.
- Modelos → servicios/controladores → cliente; cada historia termina con su tarea de ejecución de pruebas.

### Oportunidades de paralelismo

- Fase 2: T003, T007, T008 y T010 en paralelo.
- US1: T012, T013, T014 y T015 en paralelo; T018 en paralelo con las pruebas.
- US2: T025 en paralelo con T023 y T024 solo si se evita editar los mismos archivos (T023 y T024 comparten archivo con T012 y T013 y por eso no llevan `[P]`).
- US4: T037 en paralelo con T038 y T039 (archivos distintos); US6: T049, T050 y T054 en paralelo; US7: T057, T059 y T063 en paralelo.
- Fase 10: T066 y T067 en paralelo; Fase 12: T072, T073 y T074 en paralelo.
- Con varias personas, tras la Fase 2 el backend (T012 a T017) y el cliente (T018 a T021) de US1 pueden avanzar a la vez si se coordinan `app.js`, `app_shell.dart` y `main.dart`.

## Estrategia de implementación

1. Fase 1 y Fase 2 (base común).
2. US1 como MVP → validar con E2 y E7.
3. US2, US3 y US4 → validar con E2, E3, E5 y E8.
4. US5 y US6 → validar con E3 y E4.
5. US7 → validar con E6.
6. Fase 10 (datos de ejemplo y revisión de `quickstart-005.mjs`) → E1.
7. Fase 11 (rendimiento) → E9.
8. Fase 12: documentación, capturas y corrida final → E10.

## Notas

- Los seeds 001 a 003 y 005 a 008 no se modifican; solo se ajusta el 004 y se agrega el 009.
- Verificar que cada prueba falle antes de implementar.
- Commits pequeños, en español y con Conventional Commits (por ejemplo `feat(avisos): agregar centro de notificaciones por rol`).
- No se agregan dependencias; no se editan pruebas existentes (si una se rompe, detenerse y avisar).
- Evitar tareas vagas, conflictos de archivo y dependencias entre historias que rompan su independencia.
