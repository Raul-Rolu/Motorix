# Plan de implementación: Notificaciones internas y clientes por avisar

**Rama**: `007-notificaciones-internas` | **Fecha**: 2026-11-22 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la feature en `/specs/007-notificaciones-internas/spec.md`

## Resumen

Reunir en un solo lugar del encabezado los avisos internos que hoy están dispersos y limitados al administrador, y agregar la lista de clientes por avisar. Los avisos **no se almacenan**: se calculan al consultar reutilizando las reglas que ya existen (`esVencido` de `maintenance-state.js`, la condición de stock en alerta del inventario, las citas y las órdenes), y lo único que se guarda es la lectura por usuario (`notification_reads`) y el registro de «cliente avisado» (`client_notices`). Para detectar órdenes detenidas, la migración aditiva `018_...sql` agrega a `service_orders` la columna `status_changed_at` (rellenada con `updated_at` sin alterarlo), que se actualiza solo en `orderModel.setStatus`. El backend expone cuatro rutas nuevas con permisos por rol validados en servidor; el cliente Flutter agrega una campana con panel lateral, un temporizador de 60 s y la pantalla «Clientes por avisar». Sin WebSocket, sin envío al cliente por ningún canal y sin cambios de comportamiento en los sprints 1 a 5.

## Contexto técnico

**Lenguaje/Versión**: JavaScript (ES Modules, `"type": "module"`) con Node.js LTS en el backend; Dart/Flutter 3.47 en el cliente.

**Dependencias principales**: Express, `mysql2`, `zod` (validadores), JWT; Flutter con Material 3 y `provider`. **Sin dependencias nuevas** (la campana usa el `Badge` de Material y el temporizador usa `dart:async`).

**Almacenamiento**: MySQL local (InnoDB, `utf8mb4`, llaves foráneas). Migración aditiva `018_notifications_status_changed.sql` (no se editan 001–017). Dos tablas nuevas y una columna nueva.

**Pruebas**: Jest + supertest en `server/tests/` (unit/contract/integration) contra `motorix_test`; `flutter test` en `client/test/`. Sin cambios de herramienta.

**Plataforma objetivo**: Servidor local (Windows) + cliente de escritorio (prioridad del MVP).

**Tipo de proyecto**: Aplicación con API REST (frontend Flutter + backend Express).

**Metas de rendimiento**: `GET /api/notifications` responde en **menos de 1 segundo** (máximo de 5 mediciones tras un calentamiento) con un volumen ampliado: 1,000 órdenes, 600 citas, 400 refacciones y 500 mantenimientos pendientes, y con no más de 10 consultas SQL por petición (incluida la autenticación). Detalle y método de medición en `research.md` D11.

**Restricciones**: Permisos solo en backend (RN-5, RN-15); sin secretos en el repo; español en docs, comentarios y pruebas; pantallas según `docs/design-system.md`; seeds idempotentes con IDs fijos; el estado de un aviso no se copia a otra tabla (RN-10); la sesión JWT dura 30 min (el cliente ya cierra sesión ante un 401 mediante `onSesionExpirada`).

**Escala/Alcance**: Base local de demostración; ~15 criterios de aceptación, 1 migración, 1 seed nuevo y 1 ajustado, 4 rutas, 9 suites backend nuevas, 5 suites Flutter nuevas, 3 documentos.

## Verificación de la constitución

*COMPUERTA: debe pasar antes de la Fase 0. Se reverifica tras el diseño de la Fase 1.*

| Principio (docs/reglas.md / .specify/memory/constitution.md) | Estado | Evidencia en este plan |
|---|---|---|
| I. Alcance y fuente de verdad | ✅ | Solo el Sprint 6; `docs/project-context.md` 6.12 y `docs/design-system.md` se actualizan al cierre (CA-14); las discrepancias con el insumo se registran en «Desviaciones respecto a la spec» |
| II. Responsabilidades separadas | ✅ | Reglas en `server/services` (`notification-service.js`, `maintenance-state.js`), acceso a datos en `server/models`, validación en `server/validators`, rutas y controladores nuevos; cliente en `providers/` y `screens/`; ningún widget calcula avisos |
| III. Stack y base local | ✅ | ES Modules, MySQL local, migración aditiva `018_...sql`, seeds con IDs fijos y `ON DUPLICATE KEY UPDATE`, sin dependencias nuevas |
| IV. Seguridad | ✅ | Filtrado por rol en el servicio y `requireRole` en rutas; el stock nunca se calcula para RECEPTIONIST/MECHANIC; el mecánico solo recibe sus órdenes; marcar como leído valida la clave contra los avisos vigentes del propio usuario |
| V. Integridad de reglas de negocio | ✅ | RN-8 (el stock en alerta reutiliza la condición existente), RN-10 (avisos derivados, no duplicados), RN-11 (se reutiliza `esVencido`), RN-15 (permisos en backend) |
| VI. API consistente | ✅ | Mismos envoltorios `ok/created/error` y códigos de error con el mismo formato; rutas documentadas en `contracts/api-rest.md` |
| VII. Pruebas | ✅ | Pruebas por CA (cálculo, roles, lectura, rendimiento, migración, `status_changed_at`) contra `motorix_test` + `flutter test`; suites previas sin editar |
| VIII. UX/UI profesional | ✅ | Campana y panel con tokens existentes (`warning`, `danger`, `textSecondary`), un solo set de íconos (Material), estados de carga/vacío/error según 8.4 |
| Flujo de desarrollo / idioma | ✅ | Plan y artefactos en español; rama `NNN-<nombre>` ya existente |

**Resultado**: sin violaciones; `Seguimiento de complejidad` queda vacío. Re-chequeo post-diseño (Fase 1): sin cambios.

## Desviaciones respecto a la spec y al insumo (hallazgos del código real)

Se revisó el código antes de decidir. Estas diferencias entre el insumo/la spec y el repositorio condicionan el diseño. Las filas 1, 2 y el seed 009 fueron **confirmadas por el equipo el 2026-11-22** y quedaron registradas en la sección «Aclaraciones» de la spec:

| # | Lo que dice el insumo o la spec | Lo que existe en el repo | Decisión del plan |
|---|---|---|---|
| 1 | «Usar el margen y el cálculo que ya existen en la lista de Mantenimientos» (FR-012) | **No existe margen**: la lista ordena por urgencia sin ventana (spec 003, Q5) y la etiqueta es «Pendiente» o «Vencido»; el panel cuenta como `proximos` todo pendiente no vencido (incluso de 2027) | Se reutiliza `esVencido` tal cual para «vencido» y se agrega en `maintenance-state.js` una función pura `esProximo` con **márgenes constantes de 30 días y 1,000 km** solo para el aviso (D4). Los **vencidos** coinciden al 100 % con el panel y la lista; los **próximos** del centro son un subconjunto del conteo de próximos del panel, definido por esos márgenes; el campo `proximos` del panel no se toca (**decisión confirmada 2026-11-22**) |
| 2 | «La insignia con el número de alertas en el ícono de Inventario» y «`StockAlertsProvider`» (contexto y CA-8) | **No existen** (ningún `Badge` ni `StockAlertsProvider` en `client/lib`); la única alerta de stock/mantenimientos existente es la tarjeta `alertasPanel` del panel de control de ADMIN | CA-8 se cumple conservando la tarjeta `alertasPanel` sin cambios y probando que sus cifras coinciden con las del centro (D12). **No se agrega** una insignia a Inventario (fuera de alcance); el insumo la describía mal (**decisión confirmada 2026-11-22**) |
| 3 | Tabla `order_status_history` | No existe | Resuelto por la aclaración: columna `status_changed_at` (D1, D2) |
| 4 | Tabla `maintenance` | La tabla es `maintenance_plans` | Se usa `maintenance_plans` |
| 5 | Citas «pendientes y confirmadas» | Estados `PROGRAMADA`, `COMPLETADA`, `CANCELADA` | `PROGRAMADA` (ya en la spec) |
| 6 | Cuentas de ejemplo `Admin2026!`… del quickstart de la 006 | Las cuentas reales de los seeds son `admin/Admin123`, `recepcion/Recepcion123`, `mecanico/Mecanico123` | El quickstart de esta feature usa las cuentas reales |

## Estructura del proyecto

### Documentación (esta feature)

```text
specs/007-notificaciones-internas/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas D1–D14
├── data-model.md        # Fase 1: tabla/columna nuevas, claves de aviso y reglas de cálculo
├── quickstart.md        # Fase 1: guía de validación de extremo a extremo
├── contracts/
│   └── api-rest.md      # Fase 1: 4 rutas nuevas (sin cambios a rutas existentes)
├── checklists/
│   └── requirements.md  # Checklist de calidad (de /speckit.specify y /speckit.clarify)
└── tasks.md             # Fase 2: /speckit.tasks (NO creado por este comando)
```

### Código fuente (raíz del repositorio)

```text
database/
├── migrations/
│   └── 018_notifications_status_changed.sql   # status_changed_at (+ relleno), notification_reads, client_notices
├── seeds/
│   ├── 004_demo_service_orders.sql            # status_changed_at de las órdenes de ejemplo (orden 3 detenida), sin reiniciar datos
│   └── 009_demo_notifications.sql             # NUEVO: orden TERMINADA, mantenimiento próximo y ajuste guardado de la orden 3
└── scripts/                                    # sin cambios (detectan 018 y 009 automáticamente)

server/
├── models/
│   ├── order.js                # setStatus actualiza status_changed_at (único cambio de comportamiento-neutro)
│   ├── part.js                 # constante CONDICION_STOCK_EN_ALERTA compartida con el panel
│   ├── appointment.js          # consultas de citas programadas por fecha (hoy y mañana)
│   ├── dashboard.js            # contarStockBajo usa la condición compartida (mismo resultado)
│   ├── notification.js         # NUEVO: lecturas por usuario y consulta de órdenes detenidas
│   └── client-notice.js        # NUEVO: alta del aviso a cliente y consultas propias de hechos pendientes (órdenes TERMINADO, citas de mañana, mantenimientos pendientes; todas con cliente, teléfono y vehículo, excluyendo los ya avisados)
├── services/
│   ├── maintenance-state.js    # esProximo(…) y márgenes constantes (funciones puras)
│   ├── notification-service.js # NUEVO: arma los avisos por rol, claves y lectura
│   └── client-notice-service.js   # NUEVO: clientes por avisar y marcar como avisado (US7)
├── validators/
│   └── notification-validator.js  # NUEVO: clave de lectura (US6) y tipo/hecho/nota ≤ 255 (US7)
├── controllers/
│   ├── notification-controller.js     # NUEVO
│   └── client-notice-controller.js    # NUEVO
├── routes/
│   ├── notification-routes.js         # NUEVO: router montado en /api/notifications
│   └── client-notice-routes.js        # NUEVO: router montado en /api/client-notices
├── utils/
│   ├── errors.js               # nuevos códigos: NOTIFICATION_NOT_FOUND, CLIENT_NOTICE_NOT_PENDING, CLIENT_NOTICE_DUPLICATE
│   ├── notification-keys.js    # NUEVO: construir, validar y descomponer claves TIPO:ID:ESTADO (funciones puras)
│   └── notification-text.js    # NUEVO: nombre en español del estado de una orden para el detalle del aviso (el mapeo hoy solo existe en el cliente)
├── app.js                      # monta los dos routers nuevos con `app.use('/api/notifications', …)` y `app.use('/api/client-notices', …)`
└── tests/
    ├── helpers/db-test.js                            # limpiarTablas también vacía notification_reads y client_notices (helper, no una prueba)
    ├── unit/maintenance-proximo.test.js              # NUEVO (CA-3, CA-5)
    ├── unit/notification-keys.test.js                # NUEVO (CA-6: identidad del aviso)
    ├── integration/order-status-changed.test.js      # NUEVO (CA-15)
    ├── integration/notifications-calculo.test.js     # NUEVO (CA-2, CA-3, CA-5)
    ├── integration/notifications-lectura.test.js     # NUEVO (CA-6)
    ├── integration/client-notices.test.js            # NUEVO (CA-10, CA-11)
    ├── integration/notifications-performance.test.js # NUEVO (CA-13)
    ├── integration/migration-018.test.js             # NUEVO (CA-15: relleno sin alterar updated_at)
    └── contract/notifications-roles.test.js          # NUEVO (CA-4, CA-10)

client/
├── lib/
│   ├── models/notification.dart            # NUEVO: Aviso, GrupoAviso, ClientePorAvisar
│   ├── providers/notifications_provider.dart       # NUEVO: carga, temporizador de 60 s, marcar leído
│   ├── providers/clients_to_notify_provider.dart   # NUEVO
│   ├── providers/shell_navigation_provider.dart    # NUEVO: sección solicitada desde un aviso
│   ├── widgets/notification_bell.dart       # NUEVO: campana con Badge
│   ├── widgets/notifications_panel.dart     # NUEVO: panel lateral agrupado por tipo
│   ├── widgets/app_shell.dart               # campana en el AppBar, endDrawer y nueva sección
│   ├── screens/clients_to_notify_screen.dart       # NUEVO: «Clientes por avisar»
│   └── main.dart                            # registra los providers nuevos
└── test/
    ├── notifications_bell_test.dart          # NUEVO (CA-1, CA-9)
    ├── notifications_panel_test.dart         # NUEVO (CA-6, CA-7, CA-9)
    ├── notifications_refresh_test.dart       # NUEVO (CA-1: 60 s y navegación)
    ├── clients_to_notify_test.dart           # NUEVO (CA-10, CA-11)
    └── dashboard_alerts_compat_test.dart     # NUEVO (CA-8)

docs/
├── project-context.md   # sección 6.12 con el sistema real
├── design-system.md     # campana, panel de avisos y pantalla «Clientes por avisar»
└── evidencias/sprint-6-notificaciones/   # capturas del quickstart (s6-00 a s6-11) y tiempos de rendimiento
```

**Decisión de estructura**: se conserva la estructura por capas existente (opción «Mobile + API»). No se crean carpetas nuevas ni dependencias. Los cambios a archivos existentes se limitan a: `order.js` (`setStatus`), `part.js` y `dashboard.js` (compartir la condición de stock, mismo resultado), `appointment.js` y `maintenance-state.js` (funciones nuevas, aditivas), `errors.js`, `app.js`, `app_shell.dart`, `main.dart` y el seed 004.

## Plan de fases

### Fase 0 → `research.md`

Resuelve las decisiones D1–D14: migración 018 y relleno sin alterar `updated_at` (D1), actualización de `status_changed_at` (D2), avisos derivados al consultar (D3), regla de «próximo» (D4), stock (D5), citas (D6), orden detenida (D7), identidad de aviso y lectura (D8), rutas y roles (D9), clientes por avisar (D10), cifra y método de rendimiento (D11), cliente Flutter: textos, íconos, agrupación y actualización (D12), seeds (D13) y pruebas y documentos (D14).

### Fase 1 → `data-model.md`, `contracts/api-rest.md`, `quickstart.md`

- `data-model.md`: DDL de la columna y las dos tablas con índices y llaves foráneas, claves de aviso, matriz de visibilidad por rol y reglas de cálculo por tipo.
- `contracts/api-rest.md`: `GET /api/notifications`, `POST /api/notifications/reads`, `GET /api/client-notices/pending` y `POST /api/client-notices`, con roles, cuerpos, respuestas y errores.
- `quickstart.md`: escenarios E1–E10 ejecutables que prueban los CA de extremo a extremo.

**Nota**: `tasks.md` lo genera `/speckit.tasks`; este comando no lo crea.

## Seguimiento de complejidad

| Violación | Por qué es necesaria | Alternativa más simple descartada porque |
|-----------|----------------------|------------------------------------------|
| *Sin violaciones de constitución* | — | — |

## Riesgos y mitigaciones (no son violaciones)

- **«Próximo» no tenía definición con margen** (desviación 1): los márgenes de 30 días y 1,000 km quedaron **confirmados por el equipo el 2026-11-22** como constantes solo del aviso; si más adelante se cambian solo varían dos constantes y la prueba unitaria. Sin margen, cada mantenimiento pendiente futuro generaría un aviso permanente. Los próximos del centro son un subconjunto del conteo del panel (los vencidos coinciden al 100 %).
- **El relleno de la migración puede alterar `updated_at`**: `UPDATE … SET status_changed_at = updated_at` dispararía el `ON UPDATE CURRENT_TIMESTAMP` y movería `updated_at` a «ahora»; se evita asignando explícitamente `updated_at = updated_at` y se prueba (D1, `migration-018.test.js`).
- **Órdenes antiguas aparecen detenidas el primer día**: las órdenes activas con `updated_at` viejo quedan detenidas al migrar (comportamiento esperado, ya en los Supuestos de la spec).
- **Demostración en bases ya sembradas**: en una base donde el seed 004 ya corrió, la orden 3 no tendría fecha antigua; el seed 009 la ajusta con una condición estricta que solo actúa una vez y nunca reinicia trabajo real (D13).
- **Concurrencia al marcar «avisado»**: dos marcas simultáneas se resuelven con la restricción `UNIQUE (notice_type, fact_id)`; la segunda recibe `409 CLIENT_NOTICE_DUPLICATE` sin duplicar (D10).
- **Sesión de 30 minutos y consulta cada 60 s**: la consulta periódica no renueva el token; al vencer, el 401 ya cierra la sesión (`onSesionExpirada`) y el temporizador se detiene con el cierre (D12).
- **Orden de despliegue obligatorio: migraciones → seeds → servidor.** `orderModel.setStatus` pasa a escribir `status_changed_at`; si el servidor nuevo arranca antes de aplicar la migración 018, todo cambio de estado de una orden falla por columna inexistente, y el seed 004 ajustado detendría `apply-seeds` en ese punto (los seeds 005 a 009 no se aplicarían). Se documenta en el quickstart y en `database/README.md` (T076).
- **Montaje de rutas**: se sigue la convención existente de un router por recurso montado en su prefijo (`/api/clients`, `/api/orders`, …) y no el router de `/api` con rutas completas que usan los pagos, porque `/api/notifications` y `/api/client-notices` son recursos distintos con permisos distintos.
- **Estado del cliente al cambiar de usuario**: `NotificationsProvider` es global; al cerrar sesión o cambiar de usuario descarta lista, contadores y marcas de leído (T019, prueba en T014) para no mostrar avisos ajenos ni por un instante.
- **Autorización de operaciones destructivas en pruebas**: recrear `motorix_test` o cualquier base requiere autorización explícita del usuario; si una base desechable necesita permisos, el usuario ejecuta el `GRANT` como root (nunca se piden ni se escriben contraseñas).
- **Listas largas**: no se pagina el panel (la spec no lo pide); con el volumen ampliado se mide la respuesta y el cliente usa una lista con desplazamiento. Si el volumen real creciera mucho, se paginaría en una feature posterior.
- **Los datos de demostración cambian ligeramente** (seed 009 **aceptado el 2026-11-22**; la revisión de las cifras absolutas de `quickstart-005.mjs` es una tarea explícita en `tasks.md`): se agregan la orden 6, el mantenimiento 6 y ajustes de fechas; los scripts de evidencia que comparan conteos entre dos corridas (p. ej. `quickstart-005.mjs`) siguen válidos, pero cualquier cifra absoluta de tablas cambia y debe revisarse al cerrar el sprint.
