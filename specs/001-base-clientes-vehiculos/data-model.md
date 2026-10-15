# Modelo de Datos — Sprint 1: Base de Clientes y Vehículos

**Fecha**: 2026-10-11 | **Plan**: [plan.md](./plan.md) | **Investigación**: [research.md](./research.md)

Modelo físico derivado de las entidades clave del [spec.md](./spec.md). Motor: MySQL
local, InnoDB, `utf8mb4`, llaves foráneas activas. Los tipos usan notación MySQL.

## Entidades

### `users` ( Usuario )

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| `id` | INT UNSIGNED AUTO_INCREMENT | PK |
| `username` | VARCHAR(50) | NOT NULL, UNIQUE |
| `email` | VARCHAR(100) | NOT NULL, UNIQUE |
| `password_hash` | VARCHAR(255) | NOT NULL (bcrypt, nunca texto plano) |
| `full_name` | VARCHAR(100) | NOT NULL |
| `role` | ENUM('ADMIN','RECEPTIONIST','MECHANIC') | NOT NULL |
| `active` | TINYINT(1) | NOT NULL, DEFAULT 1 |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

**Reglas de validación (FR-001, FR-004, FR-011, FR-015)**:
- `username` y `email` únicos; correo con formato válido.
- Contraseña: hasheada con bcrypt; el cambio exige la contraseña actual y la política
  mínima (8 caracteres, mayúscula, minúscula, número).
- Cuentas iniciales (seeds): `admin` (ADMIN), `recepcion` (RECEPTIONIST),
  `mecanico` (MECHANIC), con las contraseñas del estándar del MVP ya hasheadas.
- Identificación de login: `WHERE username = ? OR email = ?` (RN-16).

**Transiciones de estado**:

```text
activo (1) --desactivar (ADMIN)--> inactivo (0)   # no inicia sesión; token vigente rechazado
inactivo (0) --reactivar (ADMIN)--> activo (1)
```

No existe borrado físico en el Sprint 1 (clarificación 2026-10-11).

### `clients` ( Cliente )

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| `id` | INT UNSIGNED AUTO_INCREMENT | PK |
| `full_name` | VARCHAR(100) | NOT NULL (obligatorio) |
| `phone` | VARCHAR(20) | NOT NULL (obligatorio) |
| `email` | VARCHAR(100) | NULL, formato válido si se informa (opcional) |
| `notes` | VARCHAR(255) | NULL (opcional) |
| `active` | TINYINT(1) | NOT NULL, DEFAULT 1 |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

**Reglas de validación (FR-005, FR-006, FR-007, FR-015)**:
- Nombre completo y teléfono obligatorios (clarificación 1: nombre + teléfono); correo
  y demás datos opcionales.
- Cliente inactivo: no aparece en selectores de propietario; su ficha y vehículos
  siguen consultables.
- Editar conserva la relación con sus vehículos.

**Transiciones de estado**: misma semántica que `users` (desactivar/reactivar por
recepcionista o administrador; sin borrado físico).

### `vehicles` ( Vehículo )

| Campo | Tipo | Restricciones |
|-------|------|---------------|
| `id` | INT UNSIGNED AUTO_INCREMENT | PK |
| `client_id` | INT UNSIGNED | NOT NULL, FK → `clients.id` (NO ACTION) — propietario obligatorio |
| `plates` | VARCHAR(20) | NOT NULL, UNIQUE — obligatorias (clarificación 2) |
| `brand` | VARCHAR(50) | NOT NULL — obligatoria |
| `model` | VARCHAR(50) | NOT NULL — obligatorio |
| `year` | SMALLINT UNSIGNED | NOT NULL, CHECK 1900–(año actual+1) — obligatorio |
| `color` | VARCHAR(30) | NULL (opcional) |
| `notes` | VARCHAR(255) | NULL (opcional) |
| `created_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

**Reglas de validación (FR-008, FR-009, RN-1)**:
- No existe vehículo sin propietario: `client_id` NOT NULL con llave foránea; el
  formulario no permite guardar sin cliente seleccionado y el backend lo rechaza.
- Placas únicas: rechazo de registro con placas duplicadas (supuesto razonable
  documentado en el spec).
- Reasociación permitida: cambiar `client_id` actualiza la relación en ambas direcciones.

**No hay borrado físico en el Sprint 1** para vehículos; un cliente inactivo conserva
sus vehículos.

## Relaciones

```text
users (1) --- (N) [sin relaciones directas en el Sprint 1; auditoría futura]

clients (1) --- (N) vehicles      # 1 cliente tiene N vehículos; 1 vehículo tiene 1 dueño
```

- `vehicles.client_id` FK con `ON DELETE NO ACTION` (borrados físicos no existen en el
  sprint; un cliente con vehículos no puede eliminarse por integridad referencial).

## Esquema de migraciones y seeds

| Archivo | Contenido |
|---------|-----------|
| `database/migrations/001_create_users.sql` | Tabla `users` |
| `database/migrations/002_create_clients.sql` | Tabla `clients` |
| `database/migrations/003_create_vehicles.sql` | Tabla `vehicles` + FK |
| `database/migrations/004_create_schema_migrations.sql` | Tabla de registro del runner |
| `database/seeds/001_initial_accounts.sql` | Cuentas iniciales hasheadas (bcrypt) |
| `database/seeds/002_demo_clients_vehicles.sql` | Clientes y vehículos de ejemplo idempotentes |

Los scripts son numerados e inmutables; los cambios de esquema futuros se agregan como
nuevos números (Principio III). Los seeds son idempotentes
(`ON DUPLICATE KEY UPDATE`/`WHERE NOT EXISTS`): re-ejecutarlos no duplica registros
(FR-012).

## Volumen esperado

Taller único: decenas de usuarios como máximo, cientos de clientes y vehículos. Ninguna
tabla requiere particionado, caché ni índices compuestos más allá de los únicos y de
`vehicles.client_id` (índice para las consultas por propietario).
