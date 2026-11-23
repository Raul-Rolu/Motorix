# Plan de implementación: Configuración, seguridad y reportes

**Rama**: `008-configuracion-seguridad-reportes` | **Fecha**: 2026-11-23 | **Especificación**: [spec.md](./spec.md)

**Entrada**: Especificación de la feature en `/specs/008-configuracion-seguridad-reportes/spec.md`

## Resumen

El Sprint 7 se entrega **por bloques que se pueden cortar**: **P1** (configuración y catálogo), **P2** (seguridad y términos) y **P3** (reportes). Cada bloque trae sus propias migraciones, seeds, pruebas, documentos y capturas, de modo que el sprint se puede cerrar después de cualquiera de ellos sin piezas a medias.

- **P1.** La tabla `settings` (clave-valor) reemplaza las constantes de código del taller (`TALLER` en `ticket-service.js`) y los márgenes del Sprint 6 (`MARGEN_PROXIMO_*`, `DIAS_ORDEN_DETENIDA`); las constantes quedan como **valores de respaldo**. El catálogo `service_types` y la columna opcional `order_services.service_type_id` permiten calcular el próximo servicio **desde la orden** (sin tocar `maintenance_plans`). El ticket guarda una instantánea de los datos del taller (columnas nuevas en `tickets`, `NULL` en los tickets existentes) y muestra «Próximo servicio» solo en tickets con instantánea.
- **P2.** Bitácora `audit_log` de solo inserción con ganchos en los servicios existentes; términos y condiciones (`terms_versions`, `terms_acceptances`) con compuerta en el backend dentro del middleware `auth` (una sola consulta); renovación del token por actividad (`POST /api/auth/renew`) con vigencia igual al ajuste de inactividad; pruebas de política de contraseñas (que ya existe), de no exposición de datos y de inyección. **Sin `helmet` ni bloqueo por intentos** (decisión del 2026-11-23).
- **P3.** Reportes calculados al consultar (RN-10), en centavos enteros, exclusivos de ADMIN, con exportación CSV UTF-8 con BOM. **Sin migraciones** (el índice de rendimiento es condicional y, si hiciera falta, también es de P3).

Sin dependencias nuevas en backend ni en cliente. Sin cambios de comportamiento en los sprints 1 a 6 cuando no hay configuración guardada.

## Contexto técnico

**Lenguaje/Versión**: JavaScript (ES Modules, `"type": "module"`) con Node.js LTS en el backend; Dart/Flutter 3.47 en el cliente.

**Dependencias principales**: Express, `mysql2`, `jsonwebtoken`, `bcrypt`, validadores puros en `server/validators/`; Flutter con Material 3 y `provider`. **Sin dependencias nuevas** (el CSV se genera con una función propia y el cliente guarda el archivo con `dart:io`, igual que `ticket_print.dart`).

**Almacenamiento**: MySQL local (InnoDB, `utf8mb4`, llaves foráneas). Migraciones aditivas `019` a `023` (no se editan 001–018): P1 = 019, 020, 021; P2 = 022, 023; P3 = ninguna.

**Pruebas**: Jest + supertest en `server/tests/` (hoy **74 suites**: `unit`, `contract`, `integration`) contra `motorix_test`; `flutter test` en `client/test/` (hoy **15 archivos**). Sin cambios de herramienta. Las suites previas no se editan.

**Plataforma objetivo**: Servidor local (Windows) + cliente de escritorio.

**Tipo de proyecto**: Aplicación con API REST (frontend Flutter + backend Express).

**Metas de rendimiento**:

- `GET /api/notifications` sigue por debajo de **1 s** y de **10 consultas SQL** por petición, ahora con una consulta de ajustes: ADMIN = 1 (autenticación, con la compuerta de términos unida) + 1 (ajustes) + 2 (mantenimientos y kilometraje) + 1 (citas) + 1 (órdenes detenidas) + 1 (stock) + 1 (lecturas) = **8**.
- Cada reporte (P3) responde en **menos de 2 s** con un volumen ampliado (ver `research.md` D15).

**Restricciones**: permisos solo en backend (RN-5, RN-15); sin secretos en el repo; español en docs, comentarios y pruebas; pantallas según `docs/design-system.md`; seeds idempotentes (IDs desde 1 en las tablas nuevas y desde 9001 solo en tablas ya existentes); importes en centavos enteros (`server/utils/money.js`); `.env` solo conserva credenciales y secretos (la configuración del taller vive en `settings`).

**Escala/Alcance**: 11 historias, 31 requisitos, 26 criterios de aceptación, 5 migraciones, 3 seeds, 5 grupos de rutas nuevos (`/api/settings`, `/api/service-types`, `/api/audit-log`, `/api/terms`, `/api/reports`) más 2 rutas en recursos existentes (`GET /api/maintenances/proposal` y `POST /api/auth/renew`), 31 suites backend nuevas (6 unitarias, 19 de integración y 6 de contrato) y 13 archivos de prueba Flutter nuevos, 3 documentos de proyecto por bloque (`project-context.md`, `design-system.md`, `database/README.md`).

## Verificación de la constitución

*COMPUERTA: debe pasar antes de la Fase 0. Se reverifica tras el diseño de la Fase 1.*

| Principio (docs/reglas.md / .specify/memory/constitution.md) | Estado | Evidencia en este plan |
|---|---|---|
| I. Alcance y fuente de verdad | ✅ | Solo el Sprint 7; `docs/project-context.md` y `docs/design-system.md` se actualizan **al cierre de cada bloque** (incluida la corrección de las contraseñas sembradas); las diferencias con el insumo están en «Desviaciones» |
| II. Responsabilidades separadas | ✅ | Reglas en `server/services` (`settings-service.js`, `audit-service.js`, `terms-service.js`, `report-service.js`), acceso a datos en `server/models`, validación en `server/validators`, funciones puras en `server/utils` (`next-service.js`, `csv.js`, `report-range.js`); cliente en `providers/` y `screens/`; ningún widget calcula reglas |
| III. Stack y base local | ✅ | ES Modules, MySQL local, migraciones aditivas numeradas desde 019, seeds con IDs desde 1 en tablas nuevas y desde 9001 solo en tablas existentes, con `ON DUPLICATE KEY UPDATE`, sin dependencias nuevas |
| IV. Seguridad | ✅ | Compuerta de términos, bitácora sin secretos, token renovable con vigencia acotada (5 a 120 min), permisos con `requireRole` y filtrado en servicio; **el precio de compra solo se muestra a ADMIN** (reportes exclusivos de ADMIN); `.env` sin secretos nuevos; sin trazas al usuario |
| V. Integridad de reglas de negocio | ✅ | RN-12 (intervalos configurables, sin valores universales), RN-10 (reportes derivados), RN-9 (órdenes entregadas se conservan; los reportes las leen), RN-14 (nada de tarjetas en bitácora), RN-15 |
| VI. API consistente | ✅ | Mismos envoltorios `ok/created/error` y códigos de error; rutas documentadas en `contracts/api-rest.md` |
| VII. Pruebas | ✅ | Pruebas por CA antes de implementar; integración contra `motorix_test`; suites previas sin editar |
| VIII. UX/UI profesional | ✅ | Pantallas con tokens existentes y estados de carga/vacío/error; un solo set de íconos; confirmación en acciones destructivas (rechazar términos, desactivar tipo, publicar versión) |
| Flujo de desarrollo / idioma | ✅ | Documentos y comentarios en español; rama `NNN-<nombre>` ya existente; commits Conventional Commits |

**Resultado**: sin violaciones; `Seguimiento de complejidad` queda vacío. Re-chequeo post-diseño (Fase 1): sin cambios.

## Desviaciones respecto al insumo y a la spec (hallazgos del código real)

Las filas 1 a 7 ya están registradas en «Supuestos» de la spec; las filas 8 a 12 son hallazgos del plan.

| # | Lo que dice el insumo o la spec | Lo que existe en el repo | Decisión del plan |
|---|---|---|---|
| 1 | Datos del taller en `SHOP_NAME`, `SHOP_ADDRESS`, `SHOP_PHONE` de `.env` | No existen; son la constante `TALLER` de `server/services/ticket-service.js` | Se vuelven filas de `settings`; la constante pasa a valor de respaldo en `server/utils/settings-defaults.js`; `.env.example` no tiene nada que retirar (se le agrega un comentario) |
| 2 | Token de 8 horas | 30 minutos fijos (`SESION_MINUTOS`, `middlewares/auth.js`), sin renovación | Vigencia = ajuste de inactividad; renovación por actividad (D10) |
| 3 | `helmet` y bloqueo por intentos ya existen | No existen | Fuera de alcance (decisión 2026-11-23); la bitácora registra los fallos de inicio de sesión |
| 4 | La política de contraseñas se agrega | Ya existe (`cumplePoliticaContrasena`, RN-17) en alta y cambio | Solo pruebas, mensajes y verificación de que los seeds la cumplen (D11) |
| 5 | «Pagos cancelados» en la bitácora | Los pagos no se cancelan (vencen o quedan `STALE`) | No se registra; documentado |
| 6 | El próximo mantenimiento «se captura en cada orden» | `maintenance_plans` no se enlaza con órdenes | Propuesta calculada desde la orden, sin columna nueva (D5, D6) |
| 7 | Contraseñas sembradas `Admin2026!`… (`docs/project-context.md`) | `Admin123`, `Recepcion123`, `Mecanico123` (seed 001) | Se corrige `docs/project-context.md` al cierre de P1 |
| 8 | El reporte de refacciones muestra «costo» de lo usado | `order_parts` guarda el precio de venta (`unit_price`) pero **no el de compra** | El costo es el **precio de compra vigente** de la refacción; se documenta como limitación y **no** se agrega columna (alterar sprints 5 y 6 está fuera de alcance) (D13) |
| 9 | Ingresos por periodo | `payments` no tiene fecha de confirmación; solo `created_at` y `status` | Se cuentan pagos `COMPLETED` por `created_at`, igual que el panel de control (D13) |
| 10 | «Órdenes terminadas o entregadas en el periodo» | No hay historial de estados; solo `status_changed_at` (Sprint 6) | Se usa `status_changed_at` de las órdenes en `TERMINADO` o `ENTREGADO`; una orden terminada en un mes y entregada en otro cuenta en el de su último cambio (D13) |
| 11 | El catálogo es «exclusivo de ADMIN» (CA-10) | Recepción y mecánico necesitan **leer** los tipos activos para elegirlos en una línea de servicio | La **administración** del catálogo es solo de ADMIN; la lectura de tipos activos es para los tres roles (D7). Se ajusta CA-10 en la spec |
| 12 | Los seeds de términos «solo se aceptan en el siguiente inicio de sesión» | Los scripts de evidencia de los sprints 5 y 6 (`docs/evidencias/aseguramiento/quickstart-005.mjs`, `docs/evidencias/sprint-6-notificaciones/verificar-avisos-api.mjs`) inician sesión y llaman a la API | Tras sembrar la versión 1 de los términos, esos scripts recibirán `403 TERMS_NOT_ACCEPTED`; se documenta y no se editan (D16, riesgo R6) |

## Estructura del proyecto

### Documentación (esta feature)

```text
specs/008-configuracion-seguridad-reportes/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones D1–D18 (con alternativa descartada)
├── data-model.md        # Fase 1: 5 migraciones, claves de settings, acciones de bitácora, reglas de reportes
├── quickstart.md        # Fase 1: guía de validación por bloque (E1–E13)
├── contracts/
│   └── api-rest.md      # Fase 1: rutas nuevas y cambios aditivos a rutas existentes
├── checklists/
│   └── requirements.md  # Checklist de calidad
├── analysis.md          # /speckit.analyze: hallazgos y correcciones aplicadas
└── tasks.md             # Fase 2: /speckit.tasks
```

### Código fuente (raíz del repositorio)

```text
database/
├── migrations/
│   ├── 019_create_settings.sql                # P1: tabla clave-valor
│   ├── 020_create_service_types.sql           # P1: catálogo + order_services.service_type_id
│   ├── 021_tickets_shop_snapshot.sql          # P1: instantánea del taller en tickets (NULL en los existentes)
│   ├── 022_create_audit_log.sql               # P2: bitácora
│   └── 023_create_terms.sql                   # P2: terms_versions y terms_acceptances
├── seeds/
│   ├── 010_demo_settings_service_types.sql    # P1: ajustes, tipos 1–4, orden 9001 entregada con ticket con instantánea
│   ├── 011_demo_terms.sql                     # P2: versión 1 de los términos y entradas de bitácora de ejemplo
│   └── 012_demo_reports.sql                   # P3: órdenes, pagos, usos y movimientos de periodos anteriores
└── scripts/                                    # sin cambios (detectan 019–023 y 010–012)

server/
├── models/
│   ├── setting.js              # NUEVO (P1)
│   ├── service-type.js         # NUEVO (P1)
│   ├── audit.js                # NUEVO (P2)
│   ├── terms.js                # NUEVO (P2)
│   ├── report.js               # NUEVO (P3): consultas de agregación
│   ├── order.js                # createPart acepta serviceTypeId; findServices lo devuelve solo si no es nulo; findServicesWithTypes
│   └── ticket.js               # create guarda la instantánea; aObjeto la expone
├── services/
│   ├── settings-service.js     # NUEVO (P1): ajustes con valores de respaldo
│   ├── service-type-service.js # NUEVO (P1)
│   ├── audit-service.js        # NUEVO (P2): registrar (best-effort) y listar
│   ├── terms-service.js        # NUEVO (P2)
│   ├── report-service.js       # NUEVO (P3)
│   ├── ticket-service.js       # instantánea al emitir; proximoServicio; sin constante TALLER
│   ├── notification-service.js # lee ajustes (márgenes y días de orden detenida)
│   ├── client-notice-service.js# lee ajustes (margen de próximo)
│   ├── maintenance-state.js    # esProximo acepta márgenes opcionales (las constantes siguen exportadas)
│   ├── maintenance-service.js  # proponerDesdeOrden
│   ├── auth-service.js         # inactividad en el token, renovar, bitácora de fallos
│   ├── user-service.js         # bitácora de alta, baja y cambio de rol
│   └── part-service.js         # bitácora de cambios de precio
├── validators/
│   ├── settings-validator.js   # NUEVO (P1)
│   ├── service-type-validator.js # NUEVO (P1)
│   ├── audit-validator.js      # NUEVO (P2)
│   ├── terms-validator.js      # NUEVO (P2)
│   └── report-validator.js     # NUEVO (P3)
├── controllers/                # settings, service-type, audit, terms, report (NUEVOS); maintenance y auth se amplían
├── routes/
│   ├── settings-routes.js      # /api/settings
│   ├── service-type-routes.js  # /api/service-types
│   ├── audit-routes.js         # /api/audit-log
│   ├── terms-routes.js         # /api/terms
│   ├── report-routes.js        # /api/reports
│   ├── auth-routes.js          # + POST /renew
│   └── maintenance-routes.js   # + GET /proposal (antes de /:id)
├── middlewares/auth.js         # authBase (sin compuerta) y auth (con compuerta de términos); firmarToken con vigencia
├── utils/
│   ├── settings-defaults.js    # NUEVO: claves, valores de respaldo y límites
│   ├── next-service.js         # NUEVO: cálculo puro del próximo servicio
│   ├── report-range.js         # NUEVO: resolución de rangos y atajos
│   ├── csv.js                  # NUEVO: CSV con BOM y neutralización de fórmulas
│   └── errors.js               # códigos nuevos por bloque
├── app.js                      # monta los routers nuevos
└── tests/
    ├── helpers/db-test.js      # limpiarTablas vacía las tablas nuevas (por bloque; es un helper, no una prueba)
    ├── unit/                   # settings-rules, maintenance-proximo-margenes, next-service, audit-detail, report-range, csv
    ├── integration/            # migrations-019-021, settings, tickets-taller-snapshot, notifications-margenes,
    │                           # service-types, maintenance-proposal, tickets-proximo-servicio, migrations-022-023,
    │                           # audit-log, password-policy, session-renewal, injection-search, terms, terms-gate-queries,
    │                           # reports-income, reports-services-productivity, reports-parts-rotation,
    │                           # reports-performance, reports-export
    └── contract/               # settings-roles, service-types-roles, audit-log-roles, no-exposure, terms-roles, reports-roles

client/
├── lib/
│   ├── models/                 # app_settings, service_type, audit_entry, terms, report (NUEVOS); ticket.dart se amplía
│   ├── providers/              # settings, service_types, audit, terms, session, reports (NUEVOS)
│   ├── screens/                # settings, service_types, audit_log, terms_acceptance, terms_admin, reports (NUEVAS);
│   │                           # order_detail, maintenance_form, ticket, login se amplían
│   ├── widgets/add_service_dialog.dart # NUEVO (P1, hallazgo de la implementación): diálogo «Agregar servicio» con tipo opcional; la pantalla de la orden no tenía forma de agregar líneas de servicio
│   ├── widgets/session_activity.dart  # NUEVO: detecta actividad del usuario (puntero y teclado)
│   ├── widgets/app_shell.dart  # secciones Configuración, Catálogo, Bitácora, Términos y Reportes (solo ADMIN)
│   ├── services/ticket_print.dart     # línea «Próximo servicio»
│   ├── services/api_client.dart       # callback ante 403 TERMS_NOT_ACCEPTED
│   └── main.dart               # registra providers, ruta /terminos y el detector de actividad
└── test/                       # settings_screen, settings_margins, service_types, maintenance_proposal,
                                # ticket_proximo_servicio, audit_log, session_inactivity, terms_acceptance,
                                # terms_admin, reports_income, reports_services_productivity, reports_parts_rotation,
                                # reports_export

docs/
├── project-context.md   # secciones 6.13, 6.14 y 6.15 por bloque; corrige las contraseñas sembradas
├── design-system.md     # pantallas nuevas por bloque
└── evidencias/sprint-7-configuracion/   # capturas s7-00 en adelante (las toma el usuario)
```

**Decisión de estructura**: se conserva la estructura por capas existente. No se crean carpetas nuevas de código. Cambios a archivos existentes: `order.js`, `ticket.js`, `ticket-service.js`, `notification-service.js`, `client-notice-service.js`, `maintenance-state.js` (parámetro opcional), `maintenance-service.js`, `auth.js`, `auth-service.js`, `auth-routes.js`, `maintenance-routes.js`, `user-service.js`, `part-service.js`, `errors.js`, `app.js`, `order-validator.js`, y en el cliente `app_shell.dart`, `main.dart`, `api_client.dart`, `auth_provider.dart`, `login_screen.dart`, `order_detail_screen.dart`, `maintenance_form_screen.dart`, `ticket.dart`, `ticket_screen.dart` y `ticket_print.dart`.

## Plan de fases

### Fase 0 → `research.md`

Resuelve D1–D18: partición de migraciones por bloque (D1), `settings` (D2), consumo de ajustes por avisos (D3), instantánea del taller (D4), cálculo del próximo servicio (D5), propuesta de mantenimiento (D6), catálogo (D7), bitácora (D8), compuerta de términos (D9), renovación del token (D10), política de contraseñas (D11), no exposición e inyección (D12), reportes (D13), CSV (D14), rendimiento de reportes (D15), seeds (D16), cliente Flutter (D17) y pruebas y documentos por bloque (D18).

### Fase 1 → `data-model.md`, `contracts/api-rest.md`, `quickstart.md`

- `data-model.md`: DDL de las cinco migraciones, claves y límites de `settings`, acciones de bitácora, reglas de cálculo de los reportes.
- `contracts/api-rest.md`: rutas nuevas por bloque, cambios aditivos a login, ticket y líneas de servicio, y códigos de error nuevos.
- `quickstart.md`: escenarios E1–E13 ejecutables, agrupados por bloque.

## Seguimiento de complejidad

| Violación | Por qué es necesaria | Alternativa más simple descartada porque |
|-----------|----------------------|------------------------------------------|
| *Sin violaciones de constitución* | — | — |

## Riesgos y mitigaciones (no son violaciones)

- **R1 — La compuerta de términos afecta a todas las rutas.** Vive en el middleware `auth`, que importan todos los routers. Mitigación: sin versión publicada no hay compuerta (las 74 suites previas no publican versión), la consulta se une a la de autenticación (sin consulta extra) y una prueba nueva cuenta las consultas. Las rutas que deben seguir abiertas (términos, cierre de sesión, renovación) usan `authBase`.
- **R2 — Suites previas y `limpiarTablas`.** Las tablas nuevas deben vaciarse en el helper (con `FOREIGN_KEY_CHECKS = 0` ya existe), pero **solo cuando la migración correspondiente ya existe**, por eso el helper se amplía por bloque (P1 y P2) y no antes. Si no, las suites previas fallarían por tabla inexistente.
- **R3 — Presupuesto de consultas de avisos.** La consulta de ajustes sube el máximo a 8 (límite 10). No se usa caché para no mezclar datos entre pruebas ni ocultar cambios del administrador; si el máximo llegara a 10, se evaluaría una caché con invalidación en la escritura.
- **R4 — Salto de `AUTO_INCREMENT` por los IDs 9001+ en tablas existentes.** Solo ocurre donde un seed inserta en tablas que ya existían (órdenes, líneas, pagos, tickets…): en una base de usuario, los registros nuevos de esas tablas continúan desde 9002 tras sembrar. Las tablas nuevas del sprint usan IDs desde 1 y no tienen salto. Es la limitación aceptada por el insumo (rango alto para no chocar con datos propios); se documenta en `database/README.md` y en el quickstart.
- **R5 — Cifras absolutas de evidencias previas.** Las órdenes y pagos del seed 010 y 012 cambian los conteos que citan `quickstart-005.mjs` y el quickstart de la 007; hay tareas explícitas de revisión que **no editan** los scripts.
- **R6 — Scripts de evidencia anteriores y términos.** Al sembrar la versión 1 (seed 011), un login seguido de llamadas a la API devuelve `403 TERMS_NOT_ACCEPTED` hasta aceptar; se documenta cómo aceptar por la API para repetir esos scripts y la decisión de editarlos queda al usuario.
- **R7 — La renovación depende del cliente.** El backend no puede saber si hubo actividad humana; un cliente comprometido podría renovar sin límite. Se acepta en el MVP (decisión del insumo: «el cierre lo controla el cliente») y se registra como trabajo futuro un tope absoluto de sesión.
- **R8 — Bitácora «best-effort».** Si la escritura de la bitácora falla, la operación principal no se revierte y el error se registra en el log del servidor; alternativa de transacción única descartada por tocar modelos de sprints previos. Riesgo aceptado y documentado.
- **R9 — Costo no congelado en el reporte de refacciones.** El margen usa el precio de compra vigente; si el precio cambia, el margen histórico cambia. Limitación documentada (fila 8).
- **R10 — El cálculo de «próximo servicio» depende de las líneas actuales de la orden.** Si se agrega un tipo después de emitir el ticket, la línea aparece en consultas posteriores; la fecha base es la de emisión (estable) y el kilometraje el de entrada de la orden (estable).
- **R11 — El identificador tecleado en un inicio de sesión fallido puede contener algo sensible** (por ejemplo, una contraseña escrita en el campo de usuario). Se registra truncado a 100 caracteres, nunca el campo de contraseña; riesgo residual documentado.
- **R12 — El corte de P3 y el seed 012.** Los datos de ejemplo de reportes viven en un seed aparte y no hay migración de P3, por lo que cortar P3 no deja tablas ni datos huérfanos.
- **Orden de despliegue obligatorio: migraciones → seeds → servidor.** El servidor nuevo falla al emitir tickets si la 021 no está aplicada (columnas de instantánea) y al iniciar sesión si falta la 019; `apply-seeds` se detiene en el seed 010 si faltan las migraciones 019–021. Se documenta en el quickstart y en `database/README.md`.
- **Autorización de operaciones destructivas en pruebas**: recrear `motorix_test` o cualquier base requiere autorización explícita del usuario; si una base desechable necesita permisos, el usuario ejecuta el `GRANT` como root (nunca se piden ni se escriben contraseñas).
