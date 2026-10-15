# Contrato API REST — Sprint 1: Base de Clientes y Vehículos

**Fecha**: 2026-10-11 | **Plan**: [plan.md](./plan.md) | **Modelo de datos**: [data-model.md](./data-model.md)

Contrato de la interfaz que el backend expone al frontend Flutter. Todas las respuestas
son JSON. Este contrato se valida con pruebas de tipo contrato (Jest + supertest contra
`motorix_test`).

## Convenciones generales

- **Base**: rutas bajo `/api`. Versión inicial sin prefijo de versión (MVP local).
- **Autenticación**: header `Authorization: Bearer <token>` en los endpoints
  protegidos. Sin token o con token expirado → `401`. Token válido pero rol no
  autorizado → `403`. Usuario desactivado con token vigente → `401`.
- **Formato de éxito**: el recurso representado o `{ "datos": ... }` para colecciones,
  con código HTTP apropiado (200, 201, 204).
- **Formato de error** (centralizado, Principio VI):

```json
{
  "error": {
    "codigo": "CREDENCIALES_INVALIDAS",
    "mensaje": "Credenciales inválidas."
  }
}
```

- Nunca se incluyen stack traces ni datos internos (Principio IV).

## Endpoints de autenticación

| Método y ruta | Acceso | Descripción |
|---------------|--------|-------------|
| `POST /api/auth/login` | Público | Inicia sesión con usuario o correo en un mismo campo |
| `POST /api/auth/change-password` | Autenticado | Cambia la contraseña de la cuenta propia |
| `POST /api/auth/logout` | Autenticado | Confirma la salida (el frontend descarta el token) |

### `POST /api/auth/login`

Petición:

```json
{ "identificacion": "admin", "contrasena": "********" }
```

- `identificacion`: username o email (RN-16).
- Éxito `200`:

```json
{
  "token": "<jwt>",
  "usuario": {
    "id": 1,
    "username": "admin",
    "email": "admin@motorix.local",
    "fullName": "Administrador",
    "role": "ADMIN"
  }
}
```

- Token con expiración de 30 minutos (`sub`, `username`, `role` en el payload).
- Error `401` `CREDENCIALES_INVALIDAS`: mensaje genérico, no distingue usuario
  inexistente de contraseña incorrecta.

### `POST /api/auth/change-password`

Petición: `{ "contrasenaActual": "********", "contrasenaNueva": "********" }`
- Éxito `204`.
- Errores: `400` `CONTRASENA_INVALIDA` (no cumple política: 8+ caracteres, mayúscula,
  minúscula, número), `401` `CREDENCIALES_INVALIDAS` (contraseña actual incorrecta).

## Endpoints de usuarios (solo ADMIN — FR-003)

| Método y ruta | Acceso | Descripción |
|---------------|--------|-------------|
| `GET /api/users` | ADMIN | Lista usuarios con rol y estado |
| `GET /api/users/:id` | ADMIN | Detalle de un usuario |
| `POST /api/users` | ADMIN | Crea usuario |
| `PUT /api/users/:id` | ADMIN | Editar datos y rol |
| `PATCH /api/users/:id/status` | ADMIN | Desactivar o reactivar (`{ "active": false }`) |

- Petición de creación: `{ "username", "email", "password", "fullName", "role" }`
  con `role` en `ADMIN|RECEPTIONIST|MECHANIC`.
- Éxito: `201` (creación, devuelve el usuario sin `passwordHash`), `200` (consultas y
  edición), `204` (cambio de estado).
- Errores: `400` `DATOS_INVALIDOS` (validación), `409` `USUARIO_DUPLICADO` (username o
  email ya registrados), `403` `NO_AUTORIZADO` (rol distinto de ADMIN), `400`
  `ULTIMO_ADMIN` (intentar desactivar al único ADMIN activo).
- Ninguna respuesta incluye `passwordHash`.

## Endpoints de clientes (ADMIN y RECEPTIONIST — FR-003, FR-005/FR-006)

| Método y ruta | Acceso | Descripción |
|---------------|--------|-------------|
| `GET /api/clients` | ADMIN, RECEPTIONIST | Lista clientes (por defecto solo activos) |
| `GET /api/clients/:id` | ADMIN, RECEPTIONIST | Ficha con sus vehículos (FR-007) |
| `POST /api/clients` | ADMIN, RECEPTIONIST | Registra cliente |
| `PUT /api/clients/:id` | ADMIN, RECEPTIONIST | Edita datos sin perder vehículos |
| `PATCH /api/clients/:id/status` | ADMIN, RECEPTIONIST | Desactivar o reactivar |

- Petición de creación: `{ "fullName", "phone", "email"?, "notes"? }` — `fullName` y
  `phone` obligatorios; `email` opcional pero con formato válido si se informa.
- Éxito: `201`, `200`, `204`. `GET /:id` devuelve:

```json
{
  "id": 3,
  "fullName": "María López",
  "phone": "5512345678",
  "email": "maria@ejemplo.com",
  "active": true,
  "vehiculos": [
    { "id": 1, "plates": "ABC-123", "brand": "Nissan", "model": "Versa", "year": 2019 }
  ]
}
```

- Errores: `400` `DATOS_INVALIDOS`, `403` `NO_AUTORIZADO` (p. ej. MECHANIC).

## Endpoints de vehículos (ADMIN y RECEPTIONIST — FR-008, FR-009)

| Método y ruta | Acceso | Descripción |
|---------------|--------|-------------|
| `GET /api/vehicles` | ADMIN, RECEPTIONIST | Lista vehículos (con propietario) |
| `GET /api/vehicles/:id` | ADMIN, RECEPTIONIST | Detalle con datos del propietario |
| `POST /api/vehicles` | ADMIN, RECEPTIONIST | Registra vehículo con propietario |
| `PUT /api/vehicles/:id` | ADMIN, RECEPTIONIST | Edita datos y/o reasocia propietario |

- Petición de creación: `{ "clientId", "plates", "brand", "model", "year", "color"?, "notes"? }`.
- Éxito: `201`, `200`. El detalle incluye `duenio` con los datos del cliente.
- Errores: `400` `DATOS_INVALIDOS`, `409` `VEHICULO_DUPLICADO` (placas repetidas),
  `404` `CLIENTE_NO_ENCONTRADO` (propietario inexistente o inactivo), `403`
  `NO_AUTORIZADO`.

## Endpoints de inicio (todos los roles)

| Método y ruta | Acceso | Descripción |
|---------------|--------|-------------|
| `GET /api/health` | Público | Estado del servicio y de la conexión a base de datos |
| `GET /api/me` | Autenticado | Usuario de la sesión actual (pantalla de inicio) |

## Códigos de error del Sprint 1

| Código HTTP | `codigo` | Cuándo |
|-------------|----------|--------|
| 400 | `DATOS_INVALIDOS` | Payload que no pasa validación |
| 400 | `CONTRASENA_INVALIDA` | Política de contraseña incumplida |
| 400 | `ULTIMO_ADMIN` | Desactivación que dejaría sin administradores |
| 401 | `NO_AUTENTICADO` | Sin token o token ausente |
| 401 | `CREDENCIALES_INVALIDAS` | Login o contraseña actual incorrectas |
| 401 | `SESION_EXPIRADA` | Token expirado o usuario desactivado |
| 403 | `NO_AUTORIZADO` | Rol insuficiente para el endpoint |
| 404 | `RECURSO_NO_ENCONTRADO` | Id inexistente |
| 404 | `CLIENTE_NO_ENCONTRADO` | Propietario inexistente o inactivo |
| 409 | `USUARIO_DUPLICADO` | Username o email ya registrados |
| 409 | `VEHICULO_DUPLICADO` | Placas ya registradas |
