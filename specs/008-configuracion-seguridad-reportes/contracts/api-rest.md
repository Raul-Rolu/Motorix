# Contrato API REST: Configuración, seguridad y reportes

**Fecha**: 2026-11-23 | **Feature**: `008-configuracion-seguridad-reportes` | **Plan**: [plan.md](../plan.md)

Extiende el contrato base y los previos (`specs/003-…` a `specs/007-notificaciones-internas/contracts/api-rest.md`): misma autenticación por JWT con rol (`Authorization: Bearer <token>`), mismo envoltorio (`ok` con payload directo o colecciones bajo `datos`; `created` = 201; error como `{ "error": { "codigo": "...", "mensaje": "...", "details": { } } }`). **La vigencia del token deja de ser fija de 30 minutos: es el ajuste de inactividad (30 por defecto).** Las rutas se agrupan por bloque; ninguna ruta existente cambia de forma salvo los cambios **aditivos** de la sección «Cambios a rutas existentes».

## Cambios transversales

- **Bloque P1**: `/api/settings`, `/api/service-types`, `GET /api/maintenances/proposal` y cambios aditivos en líneas de servicio y tickets.
- **Bloque P2**: `/api/audit-log`, `/api/terms`, `POST /api/auth/renew`, la compuerta `403 TERMS_NOT_ACCEPTED` y `inactividadMinutos` en el login.
- **Bloque P3**: `/api/reports`.
- **Permisos**: validados en el servidor con `auth` + `requireRole`; el ocultamiento en la interfaz no es seguridad.
- **Códigos de error nuevos** (los códigos existentes se reutilizan: `NO_AUTORIZADO` 403, `DATOS_INVALIDOS` 400, `SESION_EXPIRADA` 401, `NO_AUTENTICADO` 401, `RECURSO_NO_ENCONTRADO` 404):

| Bloque | Código | HTTP | Cuándo |
|---|---|---|---|
| P1 | `SERVICE_TYPE_NOT_FOUND` | 404 | El tipo de servicio no existe |
| P1 | `SERVICE_TYPE_DUPLICATE` | 409 | Ya existe un tipo con ese nombre |
| P1 | `SERVICE_TYPE_INACTIVE` | 409 | Se intenta asignar un tipo inactivo a una línea |
| P2 | `TERMS_NOT_ACCEPTED` | 403 | El usuario no ha aceptado la versión vigente |
| P2 | `TERMS_VERSION_OUTDATED` | 409 | Se acepta una versión que ya no es la vigente |
| P3 | `RANGO_INVALIDO` | 400 | Rango ausente, invertido, mayor de 366 días o exportación de más de 10,000 filas |
| P3 | `REPORT_NOT_FOUND` | 404 | El nombre de reporte no existe (exportación) |

---

# BLOQUE P1 — Configuración y catálogo

## `GET /api/settings` (FR-001, FR-005; CA-1 a CA-3, CA-10)

- **Roles**: ADMIN. RECEPTIONIST y MECHANIC → `403 NO_AUTORIZADO`.
- **Nota de bloques**: el grupo `seguridad` (y su límite `minutosInactividad`) **solo existe a partir del bloque P2**; en una entrega que se corte en P1 la respuesta trae únicamente `taller`, `operacion` y los límites de `operacion`, y un `PUT` con `seguridad` se rechaza con `400`.
- **Respuesta 200** (siempre completa: los valores faltantes salen con su respaldo):

```json
{
  "taller": { "nombre": "Motorix", "direccion": "Av. Taller 123, Col. Centro", "telefono": "555-000-0000" },
  "operacion": { "margenProximoDias": 30, "margenProximoKm": 1000, "diasOrdenDetenida": 3 },
  "seguridad": { "minutosInactividad": 30 },
  "limites": {
    "margenProximoDias": [1, 365], "margenProximoKm": [100, 50000],
    "diasOrdenDetenida": [1, 90], "minutosInactividad": [5, 120]
  }
}
```

## `PUT /api/settings` (FR-002, FR-004; CA-1, CA-2)

- **Roles**: ADMIN.
- **Cuerpo**: cualquier subconjunto de los tres grupos (`taller`, `operacion`, `seguridad`); solo se validan y guardan los campos enviados. Ejemplo: `{ "taller": { "nombre": "Taller El Pistón", "telefono": "555-123-4567" } }`.
- **Validaciones** (400 `DATOS_INVALIDOS`, mensaje en español): nombre obligatorio (1–100); dirección ≤ 150; teléfono ≤ 30 con solo dígitos, espacios y `+ - ( )`; enteros dentro de `limites`. Un solo error rechaza todo el guardado.
- **Respuesta 200**: la misma forma que el `GET` con los valores guardados. Registra `SETTINGS_UPDATED` en la bitácora cuando existe el bloque P2.
- **Errores**: `400`, `401`, `403`.

## `GET /api/service-types` (FR-006; CA-4)

- **Roles**: ADMIN, RECEPTIONIST, MECHANIC (la lectura de tipos **activos** es necesaria para elegir el tipo de una línea). `?incluirInactivos=true` solo para ADMIN (con otro rol → `403`).
- **Respuesta 200**: `{ "datos": [ { "id": 9001, "nombre": "Cambio de aceite", "intervaloDias": 180, "intervaloKm": 5000, "activo": true } ] }`, ordenados por nombre.

## `POST /api/service-types` (FR-006; CA-4, CA-10) — ADMIN

- **Cuerpo**: `{ "nombre": "Cambio de aceite", "intervaloDias": 180, "intervaloKm": 5000 }`. Nombre 1–80; `intervaloDias` entero 1–3,650 o ausente; `intervaloKm` entero 1–500,000 o ausente; **al menos uno**.
- **Respuesta 201**: el tipo creado. **Errores**: `400 DATOS_INVALIDOS`, `409 SERVICE_TYPE_DUPLICATE` (sin distinguir mayúsculas), `401`, `403`.

## `PUT /api/service-types/:id` — ADMIN

- Mismo cuerpo y validaciones; los cambios no alteran tickets ya emitidos. **Errores**: `404 SERVICE_TYPE_NOT_FOUND`, `409 SERVICE_TYPE_DUPLICATE`.

## `PATCH /api/service-types/:id/status` — ADMIN

- **Cuerpo**: `{ "activo": false }`. Desactivar no borra ni afecta las líneas existentes. **No existe `DELETE`** (un tipo usado nunca se borra; `DELETE` responde `404` por ruta inexistente).

## `GET /api/maintenances/proposal?orderId=<id>` (FR-008; CA-5)

- **Roles**: ADMIN y MECHANIC (los mismos que registran mantenimientos). El mecánico solo puede proponer desde una orden **asignada a él** (`403 FORBIDDEN_ORDER`). Se declara **antes** de `/:id` en el router.
- **Respuesta 200**:

```json
{
  "orderId": 9001,
  "propuesta": { "fecha": "2027-05-22", "kilometraje": 47200, "servicio": "Cambio de aceite" }
}
```

- `propuesta` es `null` si la orden no tiene líneas con tipo e intervalo; `fecha` o `kilometraje` pueden ser `null` si el tipo solo tiene uno de los intervalos. **No crea ningún mantenimiento**: el cliente rellena el formulario y el usuario corrige antes de guardar con el `POST /api/maintenances` existente.
- **Errores**: `400 DATOS_INVALIDOS` (orderId ausente o no numérico), `404 ORDEN_NO_ENCONTRADA`, `403`, `401`.

## Cambios a rutas existentes (P1, aditivos)

- **`POST /api/orders/:id/services`**: acepta `serviceTypeId` opcional solo cuando `kind` es `SERVICE`. Errores nuevos: `404 SERVICE_TYPE_NOT_FOUND`, `409 SERVICE_TYPE_INACTIVE`, `400 DATOS_INVALIDOS` si se envía en mano de obra. Las líneas de servicio devueltas incluyen `serviceTypeId` **solo cuando no es nulo** (las respuestas existentes no cambian).
- **`GET /api/tickets/:orderId` (contenido del ticket; roles existentes: ADMIN y RECEPTIONIST, sin cambios)**:
  - `taller` toma los datos de la **instantánea** del ticket si existe y, si no (tickets anteriores), los ajustes vigentes (con respaldo).
  - Se agrega `proximoServicio: { "fecha": "2027-05-22" | null, "kilometraje": 47200 | null }` **solo** cuando el ticket tiene instantánea y la orden tiene al menos una línea de servicio con tipo e intervalo; en cualquier otro caso el campo **no aparece** (los tickets anteriores y sin tipos son idénticos a hoy).
  - La fecha es la de emisión del ticket más los días del intervalo menor; el kilometraje es el de entrada de la orden más los km del intervalo menor.

---

# BLOQUE P2 — Seguridad y términos

## `GET /api/audit-log` (FR-011, FR-014; CA-20, CA-21)

- **Roles**: ADMIN. Con otro rol → `403`.
- **Parámetros**: `desde`, `hasta` (`AAAA-MM-DD`, inclusivos, hora local), `usuarioId`, `accion` (una de las acciones del catálogo), `pagina` (1 por omisión). Tamaño de página fijo de **50**.
- **Respuesta 200**:

```json
{
  "pagina": 1, "totalPaginas": 3, "total": 112,
  "datos": [
    {
      "id": 9002, "fecha": "2026-11-20T10:15:00.000Z",
      "usuario": { "id": 1, "nombre": "Administrador del Taller" },
      "accion": "USER_ROLE_CHANGED", "entidad": "USER", "entidadId": 3,
      "detalle": "Rol: MECHANIC → RECEPTIONIST"
    }
  ]
}
```

- Orden: fecha descendente. `usuario` es `null` cuando el inicio de sesión fallido no corresponde a una cuenta. **No hay rutas de edición, borrado ni exportación.** `400 DATOS_INVALIDOS` si un filtro es inválido.

## `GET /api/terms/current` (FR-019, FR-020; CA-16, CA-18)

- **Roles**: los tres (con `authBase`: **no** exige haber aceptado).
- **Respuesta 200**: `{ "vigente": { "id": 9001, "version": 1, "terminos": "…", "avisoPrivacidad": "…", "publicadaEn": "…" } | null, "aceptada": true | false }`. Sin versión publicada: `{ "vigente": null, "aceptada": true }` (no hay compuerta).

## `POST /api/terms/accept` (FR-020; CA-16, CA-17)

- **Roles**: los tres (`authBase`). **Cuerpo**: `{ "termsVersionId": 9001 }`.
- **Efecto**: guarda usuario, versión y fecha; idempotente. **Respuesta 200**: `{ "aceptada": true, "version": 1 }`.
- **Errores**: `400 DATOS_INVALIDOS`, `409 TERMS_VERSION_OUTDATED` (no es la vigente), `404 RECURSO_NO_ENCONTRADO` (no existe).

## `POST /api/terms` (FR-022; CA-17, CA-18) — ADMIN

- **Cuerpo**: `{ "terminos": "…", "avisoPrivacidad": "…" }` (cada texto de 20 a 20,000 caracteres). La versión la asigna el servidor (máximo + 1) y pasa a ser la vigente; **todos** los usuarios, incluido el autor, deben aceptarla. Registra `TERMS_PUBLISHED`.
- **Respuesta 201**: la versión creada. **Errores**: `400`, `401`, `403`.

## `GET /api/terms/acceptances` (FR-022; CA-18) — ADMIN

- **Parámetros**: `pagina`; 50 por página. **Respuesta 200**: `{ "pagina", "totalPaginas", "total", "vigente": { "id", "version" }, "datos": [ { "usuario": { "id", "nombre" }, "version": 1, "aceptadaEn": "…" } ] }`.

## `POST /api/auth/renew` (FR-016; CA-23)

- **Roles**: los tres (`authBase`; **no** exige términos aceptados, para mantener la pantalla de aceptación). Sin cuerpo.
- **Respuesta 200**: `{ "token": "<jwt nuevo>", "inactividadMinutos": 30 }`; la vigencia del nuevo token es el ajuste vigente.
- **Errores**: `401 SESION_EXPIRADA` (token vencido o usuario desactivado). **Es la única ruta que emite token fuera del inicio de sesión**; `GET /api/notifications` y las demás nunca renuevan la sesión.

## Cambios a rutas existentes (P2, aditivos)

- **`POST /api/auth/login`**: la respuesta agrega `inactividadMinutos` (el token se firma con esa vigencia). Cada intento fallido registra `LOGIN_FAILED`; el mensaje al usuario no cambia (`CREDENCIALES_INVALIDAS`).
- **Compuerta de términos (toda ruta con `auth`)**: con una versión vigente y sin aceptación del usuario → `403 TERMS_NOT_ACCEPTED` (`"No ha aceptado la versión vigente de los términos y condiciones."`). **Exentas** (usan `authBase`): `GET /api/terms/current`, `POST /api/terms/accept`, `POST /api/auth/logout` y `POST /api/auth/renew`.
- **Bitácora**: `POST /api/users`, `PUT /api/users/:id`, `PATCH /api/users/:id/status`, `PUT /api/settings`, `PUT /api/parts/:id` y `POST /api/terms` registran sus acciones **sin cambiar** sus respuestas.
- **Política de contraseñas** (sin cambios de contrato): `POST /api/users` y `POST /api/auth/change-password` responden `400 CONTRASENA_INVALIDA` con el mensaje de la regla.

---

# BLOQUE P3 — Reportes (solo ADMIN)

Todos los reportes aceptan el mismo rango: `desde` y `hasta` (`AAAA-MM-DD`, inclusivos, hora local del servidor) **o** `periodo=MES_ACTUAL|MES_ANTERIOR`. Máximo 366 días. Todos los importes son **centavos enteros** (`…Centavos`) más su equivalente en pesos con dos decimales. RECEPTIONIST y MECHANIC → `403`. Respuesta común: `{ "rango": { "desde": "2026-11-01", "hasta": "2026-11-30" }, … }`. Errores comunes: `400 RANGO_INVALIDO`, `401`, `403`.

## `GET /api/reports/income` (FR-023, FR-024; CA-6, CA-7)

```json
{
  "rango": { "desde": "2026-11-01", "hasta": "2026-11-30" },
  "agrupacion": "DIA",
  "totalCentavos": 345000, "total": 3450.0,
  "porPeriodo": [ { "periodo": "2026-11-05", "totalCentavos": 120000, "total": 1200.0 } ],
  "porMetodo": [ { "metodo": "CASH", "totalCentavos": 200000, "total": 2000.0 } ]
}
```

Solo pagos `COMPLETED`; `agrupacion` es `DIA` (rangos de hasta 62 días) o `MES`. Rango sin pagos: totales en 0 y listas vacías.

## `GET /api/reports/services` (FR-023; CA-6)

`{ "rango", "datos": [ { "tipo": "Cambio de aceite" | "Sin tipo", "cantidad": 12, "importeCentavos": 960000, "importe": 9600.0 } ] }`, por cantidad descendente. Población: órdenes cerradas del periodo (ver `data-model.md`, sección 6).

## `GET /api/reports/productivity` (FR-026; CA-6)

`{ "rango", "datos": [ { "mecanico": { "id": 3, "nombre": "Mecánico del Taller" } | null, "ordenes": 8, "manoObraCentavos": 240000, "manoObra": 2400.0 } ] }`; `mecanico: null` equivale a «Sin asignar».

## `GET /api/reports/parts` (FR-025; CA-8, CA-11)

- Parámetros: rango + `pagina` y `limite` (50 por defecto, máximo 100).
- **Respuesta 200**:

```json
{
  "rango": { "desde": "2026-11-01", "hasta": "2026-11-30" },
  "pagina": 1, "totalPaginas": 2, "total": 61,
  "totales": { "ventasCentavos": 500000, "costoCentavos": 320000, "margenCentavos": 180000, "lineasSinCosto": 2, "lineasSinPrecio": 0 },
  "datos": [
    { "parteId": 2, "codigo": "FRN-PAS-220", "nombre": "Pastillas de freno delanteras", "cantidad": 4,
      "precioVentaCentavos": 45000, "precioCompraCentavos": 30000, "ventasCentavos": 180000,
      "costoCentavos": 120000, "margenCentavos": 60000, "sinCosto": false, "sinPrecio": false }
  ]
}
```

En líneas «sin costo» (la refacción no tiene precio de compra) los campos de costo y margen son `null`, `sinCosto` es `true` y la línea **no** entra en `totales.costoCentavos` ni `margenCentavos`. El costo es el precio de compra **vigente**.

## `GET /api/reports/rotation` (FR-026; CA-6, CA-11)

- Parámetros: rango + `pagina` y `limite`. `datos`: `{ "parteId", "codigo", "nombre", "unidadesSalidas": 12, "existencia": 6, "rotacion": 2.0 | null, "sinExistencia": false }`; con existencia 0, `rotacion` es `null` y `sinExistencia` es `true`. Orden: rotación descendente, «sin existencia» al final.

## `GET /api/reports/:reporte/export` (FR-027; CA-9)

- `:reporte` ∈ `income | services | productivity | parts | rotation` (otro → `404 REPORT_NOT_FOUND`). Mismos parámetros de rango; `pagina` y `limite` se ignoran (se exporta **todo** el rango, tope 10,000 filas → `400 RANGO_INVALIDO`).
- **Respuesta 200**: `Content-Type: text/csv; charset=utf-8`, cuerpo con BOM `﻿`, `Content-Disposition: attachment; filename="motorix-<reporte>-<desde>-<hasta>.csv"`. Primera fila: encabezados en español; importes con punto y dos decimales; las celdas que empiecen con `=`, `+`, `-`, `@`, tabulador o retorno de carro se neutralizan anteponiendo `'`. El contenido coincide fila por fila con la consulta JSON.
- Los CSV de `parts` incluyen el precio de compra (reporte exclusivo de ADMIN).
