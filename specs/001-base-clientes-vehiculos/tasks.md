---

description: "Lista de tareas para la funcionalidad de Base de Clientes y Vehículos (Sprint 1)"
---

# Tareas: Base de Clientes y Vehículos (Sprint 1)

**Input**: Documentos de diseño de `/specs/001-base-clientes-vehiculos/`

**Prerrequisitos**: plan.md (requerido), spec.md (historias de usuario), research.md, data-model.md, contracts/

**Tests**: SÍ se incluyen tareas de prueba: la constitución (Principio VII) y el spec exigen Jest + supertest contra `motorix_test` en backend y `flutter test` en frontend.

**Organización**: tareas agrupadas por historia de usuario para permitir implementación y prueba independientes.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Historia]**: historia de usuario a la que pertenece (US1, US2, ...)
- Todas las tareas incluyen la ruta exacta del archivo a crear o modificar

## Convenciones de ruta

- Aplicación web según plan.md: backend `server/` (capas directas, sin `src/`), frontend `client/`, persistencia `database/`
- Backend en ES Modules (`"type": "module"`); español en comentarios, pruebas y mensajes

---

## Fase 1: Setup (Infraestructura Compartiente)

**Propósito**: inicialización del proyecto y estructura básica

- [X] T001 [P] Crear la estructura de carpetas del repositorio según plan.md: `client/lib/` (config, models, services, providers, screens, widgets), `server/` (config, controllers, models, routes, services, middlewares, validators, utils), `server/tests/` (unit, integration, contract) y `database/` (migrations, seeds, scripts)
- [X] T002 [P] Inicializar `server/package.json` con `"type": "module"` y dependencias: express, mysql2, jsonwebtoken, bcrypt, dotenv; desarrollo: jest y supertest, con scripts `start`, `test` (usando `node --experimental-vm-modules ./node_modules/jest/bin/jest.js`)
- [X] T003 [P] Configurar Jest para ESM en `server/jest.config.js` con directorios de pruebas unit, integration y contract
- [X] T004 [P] Crear `server/.env.example` con `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `JWT_SECRET` sin valores sensibles, y `server/.gitignore` que ignora `.env`
- [X] T005 [P] Inicializar la app Flutter en `client/` (flutter create) con estructura `lib/config/`, `lib/models/`, `lib/services/`, `lib/providers/`, `lib/screens/`, `lib/widgets/` y `test/`, agregando provider, google_fonts, fl_chart y data_table_2 a `client/pubspec.yaml`
- [X] T006 Crear el runner idempotente de migraciones en `database/scripts/apply-migrations.mjs`: aplica `database/migrations/` en orden numérico, registra en `schema_migrations` y omite las ya aplicadas (research D8)
- [X] T007 Crear el runner idempotente de seeds en `database/scripts/apply-seeds.mjs`: ejecuta `database/seeds/` en orden y puede re-ejecutarse sin duplicar registros (FR-012)
- [X] T008 [P] Crear `database/README.md` con los pasos para recrear la base MySQL local desde cero (usuario dedicado `motorix_app`, migraciones, seeds) en español

---

## Fase 2: Fundacional (Prerrequisitos Bloqueantes)

**Propósito**: infraestructura que DEBE estar lista antes de CUALQUIER historia de usuario

**?? CRÍTICO**: ninguna historia puede iniciar hasta completar esta fase

- [X] T009 Configurar el pool de conexiones MySQL en `server/config/db.js` leyendo las variables de entorno con `mysql2/promise` (research D2)
- [X] T010 [P] Crear utilidades de respuesta en `server/utils/responses.js` con el formato de éxito y de error `{ "error": { "codigo", "mensaje" } }` del contrato `contracts/api-rest.md`
- [X] T011 Crear el middleware centralizado de errores en `server/middlewares/error-handler.js`: devuelve el formato del contrato con el código HTTP apropiado y NUNCA expone stack traces (Principio IV, research D10)
- [X] T012 [P] Crear helpers de validación en `server/validators/validation-helpers.js`: formato de correo, teléfono no vacío, placas no vacías, año entre 1900 y (año actual + 1), política de contraseña (8 caracteres mínimo, mayúscula, minúscula, número) (research D7)
- [X] T013 Crear el middleware de autenticación en `server/middlewares/auth.js`: verifica el JWT (expiración 30 min), consulta el estado activo del usuario y responde 401 `NO_AUTENTICADO` o `SESION_EXPIRADA` (research D3, D14)
- [X] T014 [P] Crear el middleware de autorización en `server/middlewares/require-role.js`: recibe los roles permitidos y responde 403 `NO_AUTORIZADO` (research D6)
- [X] T015 [P] Configurar el tema propio en `client/lib/config/theme.dart`: Material Design 3 (`useMaterial3: true`), `ThemeData` propio con los tokens de `docs/design-system.md` (paleta verde/ámbar/rojo, tipografía, espaciados y radios; sin valores sueltos) (Principio VIII)
- [X] T016 [P] Crear el cliente HTTP en `client/lib/services/api_client.dart`: adjunta el token en `Authorization`, maneja 401 limpiando la sesión y navegando al login con mensaje de sesión expirada (research D13)
- [X] T017 Montar la aplicación Express en `server/app.js` y el arranque en `server/server.js`, con endpoint público `GET /api/health` que informa el estado del servicio y la conexión a base de datos (`contracts/api-rest.md`)

**Checkpoint**: base lista; las historias de usuario pueden iniciar en paralelo

---

## Fase 3: User Story 1 - Inicio de sesión con usuario o correo (Prioridad: P1) ?? MVP

**Goal**: un usuario autorizado inicia sesión con usuario o correo y contraseña, con JWT de 30 minutos y acceso según rol, incluyendo cambio de contraseña propia

**Independent Test**: iniciar sesión con usuario y con correo de la cuenta `admin`, verificar el rechazo con credenciales incorrectas (mensaje genérico) y que la sesión expira a los 30 minutos

### Pruebas para User Story 1 (requeridas por constitución VII)

> **NOTA**: escribir estas pruebas PRIMERO y verificar que fallan antes de implementar

- [X] T018 [P] [US1] Prueba unitaria del validador de login en `server/tests/unit/validators/auth-validator.test.js`: identificación no vacía, contraseña no vacía
- [X] T019 [P] [US1] Prueba de integración del login en `server/tests/integration/auth.test.js` (Jest + supertest contra `motorix_test`): éxito por username y por email (RN-16), 401 con mensaje genérico `CREDENCIALES_INVALIDAS`, y cambio de contraseña con política (FR-011)
- [X] T020 [P] [US1] Prueba de contrato de `POST /api/auth/login` y `POST /api/auth/change-password` en `server/tests/contract/auth.contract.test.js`: forma del token y del usuario sin `passwordHash`, y códigos de error del catálogo

### Implementación para User Story 1

- [X] T021 [P] [US1] Crear `database/migrations/001_create_users.sql`: tabla `users` con `id` PK, `username` VARCHAR(50) NOT NULL UNIQUE, `email` VARCHAR(100) NOT NULL UNIQUE, `password_hash` VARCHAR(255) NOT NULL, `full_name` VARCHAR(100) NOT NULL, `role` ENUM('ADMIN','RECEPTIONIST','MECHANIC') NOT NULL, `active` TINYINT(1) NOT NULL DEFAULT 1, `created_at` y `updated_at` (data-model.md)
- [X] T022 [P] [US1] Crear `database/seeds/001_initial_accounts.sql` con las cuentas `admin`, `recepcion` y `mecanico` (contraseñas del estándar del MVP ya hasheadas con bcrypt, costo 10) e idempotente con `ON DUPLICATE KEY UPDATE` (CA-10, FR-012)
- [X] T023 [P] [US1] Crear `server/models/user.js` con `findByLogin(identificacion)` (`WHERE username = ? OR email = ?`), `findById`, `create`, `update`, `setStatus` y `countActiveAdmins` (RN-16)
- [X] T024 [US1] Crear `server/services/auth-service.js`: `login` (bcrypt compare, JWT con `expiresIn: "30m"` y payload `sub`/`username`/`role`), `changePassword` (exige contraseña actual y política 8+ con mayúscula, minúscula y número) (research D3, D4, FR-011)
- [X] T025 [US1] Crear `server/validators/auth-validator.js` para payloads de login y cambio de contraseña, usando los helpers de T012
- [X] T026 [US1] Crear `server/controllers/auth-controller.js` y `server/routes/auth-routes.js` con `POST /api/auth/login`, `POST /api/auth/change-password` (protegido con `auth`) y `POST /api/auth/logout`, según `contracts/api-rest.md`
- [X] T027 [P] [US1] Crear el modelo Dart `client/lib/models/user.dart` (id, username, email, fullName, role, active)
- [X] T028 [US1] Crear `client/lib/providers/auth_provider.dart`: login con el campo único `identificacion`, manejo de expiración y logout, redirección al login ante 401 (research D12, D13)
- [X] T029 [US1] Crear la pantalla de login `client/lib/screens/login_screen.dart` con el tema de T015 y mensajes de éxito/error (FR-013)
- [X] T030 [US1] Crear la pantalla de inicio y el menú lateral en `client/lib/screens/home_screen.dart` y `client/lib/widgets/app_shell.dart`: secciones Inicio, Clientes, Vehículos y Usuarios; Usuarios solo para ADMIN y el mecánico solo ve Inicio (FR-016, escenario 6 de la US1)
- [X] T031 [US1] Agregar la prueba de Flutter `client/test/login_screen_test.dart`: formulario de login valida campos vacíos y muestra error ante credenciales inválidas (`flutter test`)

**Checkpoint**: la US1 debe funcionar de extremo a extremo (login → pantalla de inicio por rol)

---

## Fase 4: User Story 2 - Gestión de usuarios y roles por el administrador (Prioridad: P2)

**Goal**: el administrador crea, consulta, edita, desactiva y reactiva usuarios y roles

**Independent Test**: con sesión de `admin`, crear un usuario con rol, intentar duplicar username/email (409), desactivarlo (no puede iniciar sesión) y reactivarlo; con sesión de recepcionista, la gestión de usuarios responde 403

### Pruebas para User Story 2

- [X] T032 [P] [US2] Prueba de integración de usuarios en `server/tests/integration/users.test.js`: crear/consultar/editar, duplicado 409 `USUARIO_DUPLICADO`, 403 para rol no autorizado, desactivación con rechazo del último ADMIN (`ULTIMO_ADMIN`) y usuario desactivado sin acceso (FR-015)
- [X] T033 [P] [US2] Prueba de contrato de `/api/users` en `server/tests/contract/users.contract.test.js`: respuestas sin `passwordHash` y códigos de error del catálogo

### Implementación para User Story 2

- [X] T034 [P] [US2] Crear `server/validators/user-validator.js`: username/email con formato, `role` en `ADMIN|RECEPTIONIST|MECHANIC`, política de contraseña en creación
- [X] T035 [US2] Crear `server/services/user-service.js`: creación con hash bcrypt, edición de datos y rol, desactivar/reactivar con el guard de último administrador activo (FR-015, edge case del spec)
- [X] T036 [US2] Crear `server/controllers/user-controller.js` y `server/routes/user-routes.js` con `requireRole('ADMIN')` en `GET/POST /api/users`, `GET/PUT /api/users/:id` y `PATCH /api/users/:id/status` (`contracts/api-rest.md`)
- [X] T037 [P] [US2] Crear `client/lib/providers/users_provider.dart` con lista, recarga, crear, editar y cambiar estado
- [X] T038 [US2] Crear la pantalla de lista de usuarios `client/lib/screens/users_screen.dart` (rol y estado visibles)
- [X] T039 [US2] Crear el formulario de usuario `client/lib/screens/user_form_screen.dart` con creación, edición y desactivación/reactivación bajo confirmación obligatoria (FR-013)

**Checkpoint**: la US2 funciona en paralelo con la US1 y ambas siguen operativas

---

## Fase 5: User Story 3 - Registro y consulta de clientes (Prioridad: P2)

**Goal**: el recepcionista registra y consulta clientes (nombre y teléfono obligatorios; correo opcional)

**Independent Test**: registrar un cliente con nombre y teléfono, validarlo en la consulta, rechazar el registro sin teléfono y bloquear al rol mecánico

### Pruebas para User Story 3

- [X] T040 [P] [US3] Prueba de integración de clientes en `server/tests/integration/clients.test.js`: crear/consultar, `DATOS_INVALIDOS` sin nombre o teléfono, 403 para MECHANIC, correo opcional aceptado (FR-005)

### Implementación para User Story 3

- [X] T041 [P] [US3] Crear `database/migrations/002_create_clients.sql`: tabla `clients` con `id` PK, `full_name` VARCHAR(100) NOT NULL, `phone` VARCHAR(20) NOT NULL, `email` VARCHAR(100) NULL, `notes` VARCHAR(255) NULL, `active` TINYINT(1) NOT NULL DEFAULT 1, timestamps (data-model.md)
- [X] T042 [P] [US3] Crear `server/validators/client-validator.js`: nombre completo y teléfono obligatorios (clarificación 1), email opcional con formato válido
- [X] T043 [P] [US3] Crear `server/models/client.js` con `findAll`, `findById`, `create`, `update` y `setStatus`
- [X] T044 [US3] Crear `server/services/client-service.js` con validación previa y respuestas de error del catálogo
- [X] T045 [US3] Crear `server/controllers/client-controller.js` y `server/routes/client-routes.js` con `requireRole('ADMIN', 'RECEPTIONIST')` para `GET/POST /api/clients` y `GET /api/clients/:id` (`contracts/api-rest.md`)
- [X] T046 [P] [US3] Crear el modelo Dart `client/lib/models/client.dart`
- [X] T047 [US3] Crear `client/lib/providers/clients_provider.dart` con lista, recarga y alta de clientes
- [X] T048 [US3] Crear la pantalla de lista de clientes `client/lib/screens/clients_screen.dart` con búsqueda por nombre o contacto
- [X] T049 [US3] Crear el formulario de registro de cliente `client/lib/screens/client_form_screen.dart` con mensajes de éxito/error (FR-013)

**Checkpoint**: la US3 funciona y la US1/US2 no se rompen

---

## Fase 6: User Story 4 - Edición de la información de clientes (Prioridad: P3)

**Goal**: el recepcionista edita datos de un cliente existente sin perder sus vehículos asociados

**Independent Test**: editar el teléfono de un cliente con vehículos y verificar que la ficha muestra el dato nuevo y conserva la relación

### Pruebas para User Story 4

- [X] T050 [P] [US4] Prueba de integración de edición en `server/tests/integration/clients-update.test.js`: `PUT /api/clients/:id` actualiza el dato, rechaza payloads inválidos conservando el original, y la relación con vehículos permanece intacta (escenarios de la US4)

### Implementación para User Story 4

- [X] T051 [US4] Extender `server/services/client-service.js` y `server/controllers/client-controller.js` con la edición (`PUT /api/clients/:id`) sin afectar la relación con vehículos (FR-006)
- [X] T052 [US4] Crear la pantalla de edición `client/lib/screens/client_edit_screen.dart` prellenada, con validación y confirmación antes de guardar cambios

**Checkpoint**: la US4 funciona junto con las historias previas

---

## Fase 7: User Story 5 - Registro de vehículos (Prioridad: P3)

**Goal**: el recepcionista registra vehículos con placas, marca, modelo y año obligatorios, siempre con propietario

**Independent Test**: registrar un vehículo con cliente propietario; intentar guardarlo sin propietario y con placas duplicadas, y verificar ambos rechazos

### Pruebas para User Story 5

- [X] T053 [P] [US5] Prueba de integración de vehículos en `server/tests/integration/vehicles.test.js`: crear con propietario, `DATOS_INVALIDOS` sin placas/marca/modelo/año, `VEHICULO_DUPLICADO` por placas repetidas, y rechazo de creación sin cliente (RN-1, escenarios de la US5)

### Implementación para User Story 5

- [X] T054 [P] [US5] Crear `database/migrations/003_create_vehicles.sql`: tabla `vehicles` con `id` PK, `client_id` INT UNSIGNED NOT NULL con FK a `clients.id` (NO ACTION) e índice, `plates` VARCHAR(20) NOT NULL UNIQUE, `brand` VARCHAR(50) NOT NULL, `model` VARCHAR(50) NOT NULL, `year` SMALLINT UNSIGNED NOT NULL con CHECK 1900–(año actual+1), `color` VARCHAR(30) NULL, `notes` VARCHAR(255) NULL, timestamps (data-model.md)
- [X] T055 [P] [US5] Crear `server/validators/vehicle-validator.js`: placas, marca, modelo y año obligatorios (clarificación 2), año en rango 1900–(año actual+1), color y notas opcionales
- [X] T056 [P] [US5] Crear `server/models/vehicle.js` con `findAll`, `findById`, `findByPlates`, `create`, `update` y `findByClient`
- [X] T057 [US5] Crear `server/services/vehicle-service.js`: rechaza vehículos sin propietario existente o activo (`CLIENTE_NO_ENCONTRADO`) y placas duplicadas (`VEHICULO_DUPLICADO`) (RN-1)
- [X] T058 [US5] Crear `server/controllers/vehicle-controller.js` y `server/routes/vehicle-routes.js` con `requireRole('ADMIN', 'RECEPTIONIST')` para `GET/POST /api/vehicles` y `GET/PUT /api/vehicles/:id` (`contracts/api-rest.md`)
- [X] T059 [P] [US5] Crear el modelo Dart `client/lib/models/vehicle.dart`
- [X] T060 [US5] Crear `client/lib/providers/vehicles_provider.dart` con lista, recarga y alta de vehículos
- [X] T061 [US5] Crear la pantalla de lista de vehículos `client/lib/screens/vehicles_screen.dart`
- [X] T062 [US5] Crear el formulario de vehículo `client/lib/screens/vehicle_form_screen.dart` con selector de propietario que solo muestra clientes activos

**Checkpoint**: la US5 funciona; registrar cliente y vehículo ya es posible de extremo a extremo

---

## Fase 8: User Story 6 - Asociación de vehículo con su propietario (Prioridad: P3)

**Goal**: la relación cliente↔vehículo se refleja en ambas direcciones y permite reasociar

**Independent Test**: consultar la ficha del cliente y ver sus vehículos, consultar el vehículo y ver a su dueño, y reasociar un vehículo a otro cliente verificando ambos lados

### Pruebas para User Story 6

- [X] T063 [P] [US6] Prueba de integración de la asociación en `server/tests/integration/vehicle-owner.test.js`: `GET /api/clients/:id` incluye los vehículos del cliente (FR-007), el detalle del vehículo muestra al propietario, y la reasociación actualiza ambos lados (escenarios de la US6)

### Implementación para User Story 6

- [X] T064 [US6] Extender `server/services/client-service.js` para que el detalle del cliente incluya sus vehículos (FR-007)
- [X] T065 [US6] Extender `server/services/vehicle-service.js` para la reasociación de propietario (`PUT /api/vehicles/:id` con `clientId`) validando que el nuevo propietario exista y esté activo
- [X] T066 [US6] Crear la ficha de cliente `client/lib/screens/client_detail_screen.dart` con sus datos y la lista de vehículos asociados
- [X] T067 [P] [US6] Crear `database/seeds/002_demo_clients_vehicles.sql` con clientes y vehículos de ejemplo idempotentes (ON DUPLICATE KEY UPDATE) para que la base nunca quede vacía tras la instalación (FR-012, CA-10)

**Checkpoint**: todas las historias funcionan de forma independiente y el flujo demostrable completo opera

---

## Fase 9: Pulido y Temas Transversales

**Propósito**: mejoras que afectan a varias historias

- [X] T068 [P] Revisar y completar `database/README.md` y la documentación en español con cualquier decisión relevante surgida durante la implementación (Flujo de Desarrollo de la constitución)
- [X] T069 [P] Revisión de seguridad transversal: sin secretos en el repositorio, `.env` ignorado, sin stack traces en respuestas, permisos validados en servidor en todos los endpoints protegidos, contraseñas solo como hash (Principio IV)
- [ ] T070 Re-ejecutar `apply-migrations.mjs` y `apply-seeds.mjs` sobre una base vacía y después sobre una ya poblada, verificando recreación desde cero y ausencia de duplicados (CA-6, FR-012)
- [ ] T071 Ejecutar los escenarios de validación V1 a V7 de `specs/001-base-clientes-vehiculos/quickstart.md` y corregir cualquier hallazgo
- [ ] T072 Ejecutar `npm test` (backend, contra `motorix_test`) y `flutter test` (frontend) y dejar ambas suites en verde (Principio VII)
- [X] T073 Emitir el reporte final de cierre de sprint: archivos modificados, historias cubiertas, pruebas realizadas, pendientes y riesgos (Flujo de Desarrollo de la constitución)

---

## Dependencias y Orden de Ejecución

### Dependencias por fase

- **Setup (Fase 1)**: sin dependencias; puede iniciar de inmediato
- **Fundacional (Fase 2)**: depende del Setup; BLOQUEA todas las historias
- **User Stories (Fases 3–8)**: todas dependen del Fundacional
  - T031 (prueba Flutter de login) depende de T015 (tema) y T028 (AuthProvider)
  - Las historias US2–US6 pueden avanzar en paralelo si hay capacidad; si no, en orden de prioridad P1 → P2 → P3
  - US4 extiende la base de US3; US6 extiende la base de US5 y US3 — completar esas historias antes de sus extensiones
- **Pulido (Fase 9)**: depende de las historias que se deseen dar por terminadas; T070–T073 requieren todas las historias completas

### Dependencias entre historias

- **US1 (P1)**: arranca tras Fundacional; sin dependencias de otras historias
- **US2 (P2)**: arranca tras Fundacional; usa el middleware `auth`/`requireRole` del Fundacional
- **US3 (P2)**: arranca tras Fundacional; independiente de US1/US2 en datos (tabla propia)
- **US4 (P3)**: depende de US3 (extiende la edición de clientes)
- **US5 (P3)**: arranca tras Fundacional; usa la tabla de clientes de US3 para el selector de propietarios en la interfaz
- **US6 (P3)**: depende de US3 y US5 (asocia sus entidades)

### Oportunidades de paralelismo

- Todas las tareas [P] del Setup y del Fundacional pueden ejecutarse en paralelo (archivos distintos)
- En cada historia: las pruebas [P] primero, luego modelos/validadores [P] en paralelo, luego servicios y controladores en orden
- Historias distintas pueden trabajar en paralelo distintos desarrolladores tras el Fundacional (p. ej. US1 backend con US3 backend, o pantallas de US2 con pantallas de US3)

## Ejemplo Paralelo: User Story 5

```bash
# Lanzar juntas las pruebas de la US5 (distintos archivos):
Tarea: "Prueba de integración de vehículos en server/tests/integration/vehicles.test.js"

# Lanzar juntas las migraciones/validadores/modelos de la US5:
Tarea: "Crear database/migrations/003_create_vehicles.sql"
Tarea: "Crear server/validators/vehicle-validator.js"
Tarea: "Crear server/models/vehicle.js"
```

## Estrategia de Implementación

### MVP primero (solo User Story 1)

1. Completar Fase 1: Setup
2. Completar Fase 2: Fundacional (CRÍTICO - bloquea todas las historias)
3. Completar Fase 3: User Story 1
4. **PARAR y VALIDAR**: probar la US1 de forma independiente (login por usuario y correo, menú por rol, expiración)
5. Demostrar si está lista

### Entrega incremental

1. Setup + Fundacional → base lista
2. US1 → probar por separado → demo (MVP del sprint)
3. US2 → probar por separado → demo (gestión de usuarios)
4. US3 → probar por separado → demo (clientes)
5. US4 → probar por separado → demo (edición de clientes)
6. US5 → probar por separado → demo (vehículos)
7. US6 → probar por separado → demo (asociación y flujo demostrable completo del sprint)
8. Pulido → cierre de sprint

### Estrategia de equipo en paralelo

1. El equipo completo completa Setup + Fundacional
2. Una vez fundacional listo:
   - Desarrollador A: US1 y US2 (backend + frontend de acceso)
   - Desarrollador B: US3 y US4 (clientes)
   - Desarrollador C: US5 y US6 (vehículos y asociación)
3. Las historias se integran y prueban de forma independiente

## Notas

- Las tareas [P] usan archivos distintos y no tienen dependencias entre sí
- La etiqueta [Historia] vincula cada tarea a su historia para trazabilidad
- Cada historia debe poder completarse y probarse de forma independiente
- Verificar que las pruebas fallan antes de implementar (Principio VII)
- Commits pequeños y enfocados, con descripción en español (Conventional Commits)
- Detenerse en cualquier checkpoint para validar la historia por separado
- Los guiones largos (??) de esta plantilla representan íconos del template original
