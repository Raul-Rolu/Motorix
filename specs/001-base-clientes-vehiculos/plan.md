# Plan de Implementación: Base de Clientes y Vehículos (Sprint 1)

**Rama**: `001-base-clientes-vehiculos` | **Fecha**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Especificación de funcionalidad de `/specs/001-base-clientes-vehiculos/spec.md`

## Resumen

Primer sprint del MVP de Motorix: levantar la estructura del repositorio (frontend
`client/`, backend `server/`, persistencia `database/`), conectar MySQL local, ofrecer
inicio de sesión con usuario o correo (JWT + bcrypt, sesión de 30 minutos), autorización
por roles (ADMIN, RECEPTIONIST, MECHANIC) validada en el servidor, y los módulos de
usuarios, clientes y vehículos con sus relaciones, siguiendo el sistema de diseño
`docs/design-system.md`.

## Contexto Técnico

**Lenguaje/versión**: Dart 3.x (Flutter stable) en el frontend; Node.js LTS (20+) con
JavaScript en modo ES Modules (`"type": "module"`) en el backend.

**Dependencias primarias**: Express (backend), driver `mysql2` (acceso a datos, sin ORM),
`jsonwebtoken`, `bcrypt` y `dotenv`; Flutter con Provider (estado), `google_fonts`,
`fl_chart`, `data_table_2` y un único set de íconos.

**Storage**: MySQL local (instalación nativa), InnoDB, `utf8mb4`, llaves foráneas;
esquema y seeds en scripts SQL versionados e inmutables en `database/`.

**Testing**: Jest (unitarias) y Jest + supertest (integración y contrato) contra la base
`motorix_test` en el backend; `flutter test` en el frontend.

**Plataforma objetivo**: escritorio primero (Windows) vía aplicación Flutter y navegador;
personal no técnico del taller.

**Tipo de proyecto**: aplicación web (frontend + backend separados) con base de datos
local.

**Metas de rendimiento**: interacción local percepción inmediata (acciones comunes bajo
1 s de extremo a extremo); listados con cientos de registros sin degradación.

**Restricciones**: ES Modules obligatorios; solo el backend accede a MySQL; secretos solo
en variables de entorno (`.env.example` sin valores); sesión de 30 minutos sin actividad;
permisos validados en servidor; toda pantalla sigue `docs/design-system.md`; español en
documentación, comentarios, pruebas y commits.

**Escala/alcance**: taller único; hasta ~10 usuarios registrados y cientos de clientes y
vehículos; ~6 pantallas en el Sprint 1 (login, inicio, clientes, vehículos, usuarios y
sus formularios).

## Constitution Check

*COMPUERTA: debe pasar antes de la investigación de la Fase 0. Se vuelve a evaluar tras
el diseño de la Fase 1.*

| Principio constitucional | Evaluación del Sprint 1 |
|--------------------------|--------------------------|
| I. Alcance y fuente de verdad | ✅ Alcance limitado al Sprint 1 del `spec.md`; sin Mercado Pago, dashboard, tickets ni WhatsApp; sigue el orden de sprints. |
| II. Arquitectura separada | ✅ `client/`, `server/` (con `config/`, `controllers/`, `models/`, `routes/`, `services/`, `middlewares/`, `validators/`, `utils/`) y `database/`; lógica de negocio solo en `services/`. |
| III. Stack y base de datos local | ✅ Flutter/Dart, Node.js LTS + Express, MySQL local con `mysql2`, JWT + bcrypt, ES Modules con `"type": "module"`, esquema en `database/` con scripts numerados, usuario dedicado `motorix_app`, InnoDB/`utf8mb4`, sin datos versionados. |
| IV. Seguridad | ✅ Contraseñas con bcrypt (nunca texto plano), secretos en `.env` (ignorado) con `.env.example` sin secretos, autorización por rol en servidor, validación de payloads en backend, sin stack traces al usuario. |
| V. Integridad de reglas de negocio | ✅ No se permite vehículo sin propietario; placas únicas; desactivación en lugar de borrado para conservar historial; datos persistentes entre sesiones. |
| VI. API y manejo de errores | ✅ API REST JSON con códigos HTTP apropiados, middleware de autenticación/autorización y manejo de errores centralizado (ver `contracts/api-rest.md`). |
| VII. Pruebas | ✅ Jest + supertest contra `motorix_test` para toda la lógica de negocio (login, roles, CRUD, asociaciones); `flutter test` en frontend. |
| VIII. UX/UI profesional | ✅ Material Design 3 con `ThemeData` propio, tokens de `docs/design-system.md`, confirmaciones en operaciones sensibles, máximo una librería complementaria (ninguna en este sprint, ver `research.md`). |

**Resultado**: ✅ SIN VIOLACIONES. Ninguna compuerta requiere justificación.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/001-base-clientes-vehiculos/
├── plan.md              # Este archivo (/speckit.plan)
├── research.md          # Salida de la Fase 0 (/speckit.plan)
├── data-model.md        # Salida de la Fase 1 (/speckit.plan)
├── quickstart.md        # Salida de la Fase 1 (/speckit.plan)
├── contracts/           # Salida de la Fase 1 (/speckit.plan)
│   └── api-rest.md      # Contrato de la API REST del Sprint 1
├── checklists/
│   └── requirements.md  # Checklist de calidad del spec (/speckit.specify)
└── tasks.md             # Salida de la Fase 2 (/speckit.tasks - NO lo crea /speckit.plan)
```

### Código fuente (raíz del repositorio)

```text
client/                          # Aplicación Flutter
├── lib/
│   ├── main.dart
│   ├── config/                  # Tema propio, tokens del design system
│   ├── models/                  # Modelos Dart (User, Client, Vehicle)
│   ├── services/                # Cliente HTTP contra la API REST
│   ├── providers/               # Estado con Provider (sesión, catálogos)
│   ├── screens/                 # login, home, clients, vehicles, users
│   └── widgets/                 # Componentes reutilizables del design system
└── test/                        # Pruebas flutter test

server/                          # Backend Node.js (ES Modules, sin carpeta src/)
├── config/                      # Entornos, conexión a MySQL (pool mysql2)
├── controllers/                 # HTTP fino: req/res, delega en services
├── models/                      # Consultas SQL (users, clients, vehicles)
├── services/                    # Lógica de negocio (auth, users, clients, vehicles)
├── routes/                      # Rutas Express + middlewares
├── middlewares/                 # auth (JWT), requireRole, errores centralizados
├── validators/                  # Validación de payloads (login, users, clients, vehicles)
├── utils/                       # Respuestas JSON, manejo de errores, helpers
├── app.js                       # Montaje de rutas y middlewares
├── server.js                    # Arranque
├── .env.example                 # DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
└── tests/
    ├── unit/
    ├── integration/             # supertest contra motorix_test
    └── contract/                # supertest contra motorix_test (contrato API)

database/
├── migrations/                  # Scripts SQL numerados e inmutables
├── seeds/                       # Seeds idempotentes (cuentas + datos de ejemplo)
├── scripts/                     # Scripts idempotentes de aplicación y registro
└── README.md                    # Cómo recrear la base desde cero
```

**Decisión de estructura**: opción "web application" de la plantilla, adaptada a la
constitución: frontend en `client/`, backend en `server/` con las ocho capas directamente
debajo (sin `src/` intermedio) y persistencia en `database/`, tal como exige el
Principio II y confirman las decisiones resueltas del Sprint 1.

## Registro de Complejidad

| Violación | Por qué se necesita | Alternativa más simple rechazada porque |
|-----------|---------------------|------------------------------------------|
| Sin violaciones | — | — |
