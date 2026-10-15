# Plan de Implementación: Citas y Órdenes de Servicio (Sprint 2)

**Rama**: `002-citas-ordenes` | **Fecha**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Especificación de la funcionalidad en `/specs/002-citas-ordenes/spec.md`

## Resumen

Extiende el MVP de Motorix con el módulo operativo del taller: recepción registra,
consulta, modifica y cancela citas; crea órdenes de servicio vinculadas a un cliente y un
vehículo existentes con su kilometraje de entrada, asigna manualmente un mecánico y
administra la entrega o cancelación de la orden. El mecánico consulta únicamente sus
órdenes asignadas, agrega entradas de diagnóstico, observaciones y recomendaciones,
registra servicios y mano de obra, y avanza la orden por la máquina de estados
aclarada (avances estrictos, pausa ESPERANDO_REFACCION, retrocesos limitados y saltos
solo con administrador). El enfoque técnico es una extensión natural del Sprint 1:
migraciones nuevas numeradas e inmutables sobre MySQL local (InnoDB, utf8mb4, llaves
foráneas), backend en ES Modules con mysql2 y sin ORM, máquina de estados pura y
testable, y frontend Flutter con Provider y tokens del design system.

## Contexto Técnico

**Lenguaje/Versión**: JavaScript (ES Modules) en el backend con Node.js LTS; Dart/Flutter estable en el cliente. Sin CommonJS.

**Dependencias Principales**: Express 4, mysql2, jsonwebtoken, bcrypt, dotenv (existentes); Jest 29 + supertest para pruebas; Flutter + Provider + http en el cliente. Sin librerías nuevas en este sprint.

**Almacenamiento**: MySQL local (InnoDB, utf8mb4, llaves foráneas activas); migraciones y seeds versionados; sin ORM. Tablas nuevas: appointments, service_orders, order_services, order_labor, order_entries.

**Pruebas**: Jest + supertest contra la base `motorix_test` (unitarias, integración y contrato) y `flutter test` para pruebas de widget.

**Plataforma Objetivo**: Aplicación de escritorio (Windows) con backend local en `localhost:3000`; base de datos MySQL local.

**Tipo de Proyecto**: Aplicación web de escritorio (frontend Flutter + backend REST).

**Metas de Rendimiento**: Respuestas de la API en < 500 ms en operaciones locales; listados de órdenes y citas con decenas de registros; demo del flujo completo en < 10 minutos (SC-005).

**Restricciones**: Permisos validados en backend (RN-15); kilometraje validado contra el previo del vehículo (RN-4); órdenes ENTREGADO/CANCELADA de solo lectura (RN-9); sin secretos en el repositorio; español en docs, comentarios y pruebas; pantallas según `docs/design-system.md`; pruebas siempre contra `motorix_test`; seeds idempotentes con datos de ejemplo.

**Escala/Alcance**: Taller mecánico local (decenas de usuarios, cientos de órdenes por año); 5 pantallas nuevas (citas, órdenes, detalle de orden, formulario de orden, formulario de cita) y 10–14 endpoints nuevos.

## Verificación de la Constitución

*GATE: debe pasar antes de la investigación de la Fase 0. Se vuelve a evaluar después del diseño de la Fase 1.*

| Regla (constitución) | Cumplimiento en este plan |
|---|---|
| ES Modules obligatorios en backend, nunca CommonJS | Se reutiliza el backend existente con `"type": "module"`; los módulos nuevos (models, services, controllers, routes de citas y órdenes) siguen ESM. ✅ |
| Sin ORM; acceso a datos con mysql2 y pool central | Nuevos modelos (appointment, order) consultan mediante `getPool()` de `server/config/db.js`. ✅ |
| MySQL local InnoDB, utf8mb4, llaves foráneas, migraciones numeradas inmutables | Nuevas migraciones 005–009 con FKs a clients, vehicles y users; los scripts del Sprint 1 no se editan. ✅ |
| Permisos por rol validados en backend (RN-15) | Rutas nuevas montan `auth` + `requireRole`; el mecánico solo accede a sus propias órdenes verificando `mechanic_id` en servidor. ✅ |
| Sin secretos en el repositorio | No se agregan credenciales; se reutiliza `.env` existente. ✅ |
| Español en chat, docs, comentarios y pruebas | Todos los artefactos y el código nuevo en español (identificadores en inglés). ✅ |
| Diseño propio según design system (tema propio, nunca tema por defecto) | Pantallas nuevas usan tokens de `client/lib/config/theme.dart`. ✅ |
| Pruebas de integración/contrato contra `motorix_test` | Nuevas suites siguen el helper `server/tests/helpers/db-test.js`. ✅ |
| Seeds idempotentes con datos de ejemplo | Seeds 003–004 con citas y órdenes en distintos estados, usando claves únicas y `ON DUPLICATE KEY UPDATE`. ✅ |
| Bajo acoplamiento, lógica en services, controllers finos | Máquina de estados en servicio puro; controllers solo validan payload y delegan. ✅ |

**Resultado**: sin violaciones; no se requiere tabla de justificación de complejidad.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/002-citas-ordenes/
├── plan.md              # Este archivo (salida de /speckit.plan)
├── research.md          # Salida de la Fase 0
├── data-model.md        # Salida de la Fase 1
├── quickstart.md        # Salida de la Fase 1
├── contracts/           # Salida de la Fase 1
│   └── api-rest.md
└── tasks.md             # Salida de /speckit.tasks (NO la crea /speckit.plan)
```

### Código fuente (raíz del repositorio)

```text
database/
├── migrations/               # Migraciones del Sprint 1 (001–004) + nuevas del Sprint 2
│   ├── 001_create_users.sql          # (existente)
│   ├── 002_create_clients.sql        # (existente)
│   ├── 003_create_vehicles.sql       # (existente)
│   ├── 004_create_schema_migrations.sql # (existente)
│   ├── 005_create_appointments.sql   # NUEVO
│   ├── 006_create_service_orders.sql # NUEVO
│   ├── 007_create_order_services.sql # NUEVO
│   ├── 008_create_order_labor.sql    # NUEVO
│   └── 009_create_order_entries.sql  # NUEVO
└── seeds/
    ├── 001_initial_accounts.sql      # (existente)
    ├── 002_demo_clients_vehicles.sql # (existente)
    ├── 003_demo_appointments.sql     # NUEVO
    └── 004_demo_service_orders.sql   # NUEVO

server/
├── models/
│   ├── user.js / client.js / vehicle.js   # (existentes)
│   ├── appointment.js                     # NUEVO
│   └── order.js                           # NUEVO (orden, servicios, mano de obra, entradas)
├── services/
│   ├── auth-service.js / user-service.js / client-service.js / vehicle-service.js # (existentes)
│   ├── order-state.js                     # NUEVO (máquina de estados pura)
│   ├── appointment-service.js             # NUEVO
│   └── order-service.js                   # NUEVO
├── validators/
│   ├── appointment-validator.js           # NUEVO
│   └── order-validator.js                 # NUEVO
├── controllers/
│   ├── appointment-controller.js          # NUEVO
│   └── order-controller.js                # NUEVO
├── routes/
│   ├── appointment-routes.js              # NUEVO
│   └── order-routes.js                    # NUEVO
├── app.js                                 # Modificado: monta rutas nuevas
└── tests/
    ├── unit/validators/ (appointment-validator.test.js, order-validator.test.js)     # NUEVOS
    ├── unit/services/order-state.test.js                                             # NUEVO
    ├── integration/ (appointments.test.js, orders.test.js, orders-workflow.test.js)  # NUEVOS
    └── contract/ (appointments.contract.test.js, orders.contract.test.js)            # NUEVOS

client/
├── lib/
│   ├── models/ (appointment.dart, service_order.dart)              # NUEVOS
│   ├── providers/ (appointments_provider.dart, orders_provider.dart) # NUEVOS
│   ├── screens/
│   │   ├── appointments_screen.dart / appointment_form_screen.dart  # NUEVOS
│   │   ├── orders_screen.dart / order_form_screen.dart              # NUEVOS
│   │   └── order_detail_screen.dart                                 # NUEVO
│   ├── widgets/app_shell.dart   # Modificado: secciones Citas y Órdenes por rol
│   └── main.dart                # Modificado: rutas nuevas
└── test/
    └── appointments_screen_test.dart   # NUEVO
```

**Decisión de estructura**: se mantiene la estructura frontend + backend del Sprint 1
(`server/`, `client/`, `database/`), ya que el código existente funciona y este sprint
solo agrega módulos sobre ella; duplicar la estructura rompería el bajo acoplamiento y la
reutilización de pool, middlewares y helpers ya probados.
