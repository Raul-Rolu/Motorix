# Investigación Técnica — Sprint 1: Base de Clientes y Vehículos

**Fecha**: 2026-10-11 | **Plan**: [plan.md](./plan.md)

Investigación de la Fase 0 para el `/speckit.plan` del Sprint 1. Resuelve todos los
puntos abiertos del contexto técnico y las dos decisiones diferidas en
`/speckit.clarify` (librería de componentes e íconos).

## D1 — Módulos ES Modules en Node.js con Jest

- **Decisión**: backend 100% ESM (`"type": "module"` en `server/package.json`), Jest
  ejecutado con `node --experimental-vm-modules ./node_modules/jest/bin/jest.js`, sin
  Babel ni transformadores.
- **Justificación**: la constitución lo exige como NO NEGOCIABLE; con Node LTS el runner
  experimental de módulos es la vía estable para que Jest entienda `import`/`export`.
- **Alternativas consideradas**: Babel + `@babel/preset-env` (más dependencias y
  configuración que un proyecto de este tamaño justifica); cambiar a CommonJS (prohibido
  por constitución).

## D2 — Acceso a datos: `mysql2` con pool de conexiones

- **Decisión**: driver `mysql2` directo con `mysql2/promise` y un pool creado en
  `server/config/` a partir de las variables de entorno (`DB_HOST`, `DB_PORT`,
  `DB_USER`, `DB_PASSWORD`, `DB_NAME`). Cada capa `models/` expone funciones que reciben
  la conexión/pool y devuelven filas mapeadas a objetos.
- **Justificación**: decisión ya resuelta del equipo (sin ORM ni query builder);
  `mysql2` soporta promesas y es compatible con ESM.
- **Alternativas consideradas**: Sequelize/Knex (descartadas por la decisión del equipo
  y por complejidad innecesaria); `mysql` legacy (sin promesas nativas).

## D3 — Autenticación: JWT con expiración de 30 minutos

- **Decisión**: al iniciar sesión se firma un JWT con `expiresIn: "30m"`, payload mínimo
  (`sub`, `username`, `role`), y `JWT_SECRET` desde variables de entorno. Middleware
  `auth` verifica el token en cada endpoint protegido; expiración → 401 y el frontend
  redirige al login.
- **Justificación**: la sesión de 30 minutos sin actividad fue aclarada en el spec
  (FR-002); el payload mínimo evita exponer datos sensibles en el token.
- **Alternativas consideradas**: sesiones de servidor en base de datos (estado extra que
  el MVP no necesita); tokens de larga duración (riesgo en computadoras compartidas).

## D4 — Contraseñas: bcrypt con costo 10 y política mínima

- **Decisión**: hash con bcrypt (costo 10). Política de cambio: mínimo 8 caracteres con
  mayúscula, minúscula y número, validada en backend (FR-011). Las cuentas iniciales
  `admin`, `recepcion` y `mecanico` se crean en los seeds con las contraseñas del
  estándar del proyecto, ya hasheadas.
- **Justificación**: exige la constitución (IV) y RN-17; el costo 10 es el equilibrio
  habitual para apps de bajo tráfico.
- **Alternativas consideradas**: argon2 (mejor cryptografía, pero dependencia menos
  común en el stack del equipo); texto plano o cifrado reversible (prohibido).

## D5 — Login por usuario o correo

- **Decisión**: un único campo de identificación en el formulario; el backend consulta
  `WHERE username = ? OR email = ?` y valida la contraseña contra el registro
  encontrado. El mensaje de error es genérico ("credenciales inválidas") para no revelar
  si la cuenta existe.
- **Justificación**: RN-16 / FR-001; el mensaje genérico mitiga enumeración de cuentas.
- **Alternativas consideradas**: dos campos separados (contradice la RN-16); validar
  formato de correo para decidir la columna (con usuario que contiene "@" fallaría).

## D6 — Autorización por roles

- **Decisión**: middleware `requireRole(...roles)` después de `auth`. Asignación por
  defecto del Sprint 1: gestión de usuarios solo ADMIN; clientes y vehículos ADMIN y
  RECEPTIONIST; MECHANIC solo puede iniciar sesión y ver la pantalla de inicio. La
  autorización SIEMPRE se evalúa en servidor (RN-15); el menú lateral solo oculta
  opciones para no confundir, nunca como seguridad.
- **Justificación**: FR-003, FR-016 y RN-5/RN-15.
- **Alternativas consideradas**: permisos por permiso individual (matriz fina) —
  sobreingeniería para tres roles del MVP.

## D7 — Validación de payloads sin librerías nuevas

- **Decisión**: validadores propios en `server/validators/` (funciones puras que reciben
  el payload y devuelven lista de errores), sin `express-validator` ni `joi`. Reglas:
  formato de correo, teléfono no vacío, placas no vacías, año rango razonable
  (1900–año actual+1), política de contraseña en cambios.
- **Justificación**: constitución (no agregar librerías para lo que se resuelve con
  pocas líneas); los errores alimentan el manejo centralizado (D10).
- **Alternativas consideradas**: `zod`/`express-validator` (dependencias adicionales que
  el equipo puede reconsiderar más adelante si la validación crece).

## D8 — Migraciones y seeds idempotentes

- **Decisión**: `database/migrations/` con scripts numerados e inmutables
  (`001_create_users.sql`, `002_create_clients.sql`, `003_create_vehicles.sql`...);
  `database/scripts/apply-migrations.mjs` (Node, ESM) los aplica en orden, los registra
  en `schema_migrations` y omite los ya aplicados (idempotente). Los seeds usan claves
  únicas y `INSERT ... ON DUPLICATE KEY UPDATE` (o `WHERE NOT EXISTS`) para poder
  re-ejecutarse sin duplicar.
- **Justificación**: decisiones resueltas del Sprint 1 y CA-6/CA-10/FR-012; el runner en
  `.mjs` permite reutilizar el mismo entorno Node sin dependencias extra.
- **Alternativas consideradas**: Flyway/Liquibase (dependencia Java); Knex migrations
  (ORM/query builder descartado).

## D9 — Estrategia de pruebas de integración

- **Decisión**: base `motorix_test` recreada con las migraciones antes del suite de
  integración/contrato; Jest con supertest apuntando la app Express sin escuchar puerto.
  Unitarias para `services/` y `validators/`; integración para rutas con base real;
  contrato para el formato de respuestas (JSON y códigos HTTP).
- **Justificación**: Principio VII y CA-1/CA-2 del sprint; nunca contra la base principal.
- **Alternativas consideradas**: mocks de base de datos (no prueban la integridad
  referencial que exige el Principio V); Docker para la base de prueba (instalación
  nativa fue la decisión resuelta).

## D10 — Manejo de errores centralizado

- **Decisión**: middleware de error único al final de la cadena: errores de aplicación se
  definen con código y estado HTTP (`server/utils/`), y el middleware responde siempre
  `{ "error": { "codigo": "...", "mensaje": "..." } }` con el código HTTP apropiado.
  Nunca se filtran stack traces (Principio IV).
- **Justificación**: Principio VI; el contrato `contracts/api-rest.md` fija el formato.
- **Alternativas consideradas**: manejo ad hoc por controlador (inconsistente, exige la
  constitución centralizar).

## D11 — UI: librería complementaria e íconos (decisiones diferidas en clarify)

- **Decisión**: en el Sprint 1 NO se agrega ninguna librería complementaria de
  componentes; se usan widgets de Material 3 y componentes propios construidos sobre los
  tokens de `docs/design-system.md`. Set de íconos: los de Material (`Icons.*`) como
  provisional.
- **Justificación**: el Principio VIII permite máximo una librería y exige justificar
  dependencias; sin pantallas complejas aún, no hay caso de uso que la justifique. Esto
  libera la planificación sin bloquear; si más adelante se requiere, se propone y
  justifica antes de agregarla. Los íconos definitivos siguen abiertos como decisión de
  identidad visual.
- **Alternativas consideradas**: `shadcn_ui` para Flutter u otras librerías (evaluar
  cuando existan requerimientos de componentes que Material no cubra).

## D12 — Estado del frontend con Provider

- **Decisión**: un `AuthProvider` (sesión, token, usuario actual, expiración) y
  providers por módulo (clientes, vehículos, usuarios) que exponen listas y recargas;
  el cliente HTTP propio en `services/` adjunta el token y redirige al login ante 401.
- **Justificación**: decisión resuelta del equipo (Provider); encaja con el tamaño del
  MVP sin gestionadores de estado complejos.
- **Alternativas consideradas**: Riverpod/Bloc (fuera de la decisión ya tomada).

## D13 — Flujo de sesión y expiración en el frontend

- **Decisión**: ante 401 del backend, el `AuthProvider` limpia la sesión y navega al
  login con mensaje de "sesión expirada"; el token no se persiste en almacenamiento
  permanente (se conserva en memoria durante la sesión de la app).
- **Justificación**: escenario 5 de la US1; computadoras compartidas del taller.
- **Alternativas consideradas**: refresh tokens (complejidad innecesaria para 30 min).

## D14 — Semántica de desactivación

- **Decisión**: campo de estado (`active`/`inactive`) en usuarios y clientes; sin
  borrado físico en el Sprint 1. Usuario inactivo: no inicia sesión y su token vigente
  se rechaza (el middleware `auth` consulta el estado). Cliente inactivo: no aparece en
  los selectores de propietario, pero su ficha y vehículos siguen consultables.
- **Justificación**: respuesta de clarificación del spec (FR-015) y trazabilidad del
  Principio V.
- **Alternativas consideradas**: borrado físico (rompe historial); borrado lógico con
  cascade no controlado (riesgo de perder relaciones).
