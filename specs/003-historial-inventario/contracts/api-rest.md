# Contrato API REST: Historial, mantenimiento e inventario

**Fecha**: 2026-10-11 | **Feature**: `003-historial-inventario` | **Plan**: [plan.md](./plan.md)

Extiende el contrato base de los sprints 1 y 2 (ver `specs/002-citas-ordenes/contracts/api-rest.md`): misma autenticación por JWT con rol y mismas reglas generales (errores en español, códigos del catálogo en `server/utils/errors.js`).

**Envoltorio de respuestas** (helper `server/utils/responses.js`, verificado por las pruebas contract):

- **Éxito**: payload directo, sin envoltorio `ok`. El recurso se devuelve tal cual (`{ "id": 1, ... }`) y las colecciones bajo `datos` (`{ "datos": [ ... ] }`); sin cuerpo en los 204.
- **Error**: `{ "error": { "codigo": "PART_NOT_FOUND", "mensaje": "...", "details": { } } }` (`details` solo donde el catálogo lo indica).

## Endpoints nuevos

### Historial de servicios del vehículo (US1–US2, FR-001 a FR-003)

#### `GET /api/vehicles/:id/history`

- **Roles**: ADMIN, RECEPTIONIST, MECHANIC (consulta del personal del taller)
- **Parámetros**: `id` (path, vehículo existente); `order=asc|desc` (query, por defecto `desc`)
- **Reglas**: solo órdenes con estado `TERMINADO` o `ENTREGADO` (RN-10); derivado sin copia; el kilometraje mostrado es el `mileage_entry` registrado en cada orden (FR-003)
- **Respuesta 200**:

```json
{
  "vehiculo": { "id": 1, "placas": "ABC-123", "marca": "Mazda", "modelo": "3", "anio": 2020, "kilometrajeActual": 84500 },
  "historial": [
    {
      "orderId": 12,
      "fecha": "2026-09-30T10:15:00",
      "kilometraje": 84000,
      "motivo": "Mantenimiento mayor",
      "notas": "Se cambió correa y tensores",
      "mecanico": { "id": 3, "nombreCompleto": "Juan Pérez" },
      "resumen": { "servicios": 3, "manoObra": 1, "refacciones": 2, "total": 3250.5 },
      "refacciones": [ { "nombre": "Filtro de aceite", "cantidad": 1 } ]
    }
  ]
}
- **Errores**: `VEHICLE_NOT_FOUND` (404) si el vehículo no existe

### Mantenimientos (US3–US4, FR-004 a FR-007)

#### `GET /api/maintenances`

- **Roles**: ADMIN, RECEPTIONIST
- **Parámetros**: `vehicleId` (query, opcional); `status=PENDING|COMPLETED|CANCELLED` (query, opcional)
- **Reglas**: sin ventana de tiempo fija (aclaración Q5); los vencidos primero y después pendientes por umbral más cercano; los cancelados no aparecen en la consulta por defecto; `isOverdue`, `daysLeft` y `kmLeft` calculados en el servidor (research D9)
- **Respuesta 200**:

```json
{
  "datos": [
    {
      "id": 5,
      "vehiculo": { "id": 1, "placas": "ABC-123", "marca": "Mazda", "modelo": "3" },
      "cliente": { "id": 1, "nombreCompleto": "Ana López", "telefono": "5512345678" },
      "descripcion": "Cambio de aceite y filtro",
      "targetDate": "2026-10-01",
      "targetMileage": 90000,
      "status": "PENDING",
      "isOverdue": true,
      "daysLeft": -10,
      "kmLeft": 5500,
      "createdBy": { "id": 3, "nombreCompleto": "Juan Pérez" }
    }
  ]
}
- **Errores**: `UNAUTHORIZED` (401), `FORBIDDEN` (403)

#### `POST /api/maintenances`

- **Roles**: ADMIN, MECHANIC
- **Cuerpo**:

```json
{
  "vehicleId": 1,
  "descripcion": "Cambio de aceite y filtro",
  "targetDate": "2026-12-01",
  "targetMileage": 90000
}
- **Reglas**: al menos un umbral obligatorio, `targetDate >= hoy` y/o `targetMileage` entero positivo (RN-11, FR-004); un vehículo puede tener varios pendientes (aclaración Q2); los intervalos los define quien registra, sin valores universales (RN-12)
- **Respuesta 201**: el objeto del mantenimiento creado (directo), con `status: "PENDING"`
- **Errores**: `DATOS_INVALIDOS` (400), `MAINTENANCE_INVALID_THRESHOLD` (422) sin ningún umbral, `VEHICLE_NOT_FOUND` (404)

#### `PATCH /api/maintenances/:id/complete`

- **Roles**: ADMIN, RECEPTIONIST, MECHANIC (cumplimiento manual, aclaración Q1)
- **Reglas**: solo `PENDING → COMPLETED`; registra `completed_at` y `completed_by`; la entrega de una orden NUNCA lo dispara automáticamente (FR-005)
- **Respuesta 200**: el objeto del mantenimiento actualizado (directo), con `status: "COMPLETED"`
- **Errores**: `MAINTENANCE_NOT_FOUND` (404), `MAINTENANCE_NOT_MODIFIABLE` (409)

#### `PATCH /api/maintenances/:id/cancel`

- **Roles**: solo ADMIN (aclaración Q4)
- **Cuerpo**: `{ "reason": "El cliente vendió el vehículo" }` — `reason` obligatorio
- **Reglas**: solo `PENDING → CANCELLED`; los cancelados dejan de aparecer en vencidos/próximos (FR-005)
- **Respuesta 200**: el objeto del mantenimiento actualizado (directo), con `status: "CANCELLED"`
- **Errores**: `MAINTENANCE_NOT_FOUND` (404), `MAINTENANCE_NOT_MODIFIABLE` (409), `DATOS_INVALIDOS` (400) sin motivo

### Refacciones e inventario (US5–US6, US8, FR-008 a FR-010, FR-013 a FR-015)

#### `GET /api/parts`

- **Roles**: ADMIN y RECEPTIONIST (todas); MECHANIC (solo lectura y solo activas)
- **Parámetros**: `q` (query, busca por nombre o código); `includeInactive=true` (solo ADMIN)
- **Reglas**: `lowStock` se calcula como `stock <= minStock` (CA-7, FR-015); el stock coincide siempre con el acumulado de movimientos (FR-009)
- **Respuesta 200**:

```json
{
  "datos": [
    { "id": 1, "name": "Filtro de aceite", "code": "FLT-001", "stock": 4, "minStock": 5, "lowStock": true, "isActive": true }
  ]
}
- **Errores**: `UNAUTHORIZED` (401), `FORBIDDEN` (403)

#### `POST /api/parts`

- **Roles**: solo ADMIN (FR-016)
- **Cuerpo**: `{ "name": "Filtro de aceite", "code": "FLT-001", "stock": 10, "minStock": 5 }` (`stock` inicial opcional, por defecto 0; solo ADMIN puede dar de alta con stock inicial, que genera un movimiento `IN` de motivo "Stock inicial")
- **Reglas**: `code` único (aclaración Q2 del spec / FR-008); nombre y código obligatorios
- **Respuesta 201**: la refacción creada (directa), con `stock` resultante del movimiento `IN` inicial
- **Errores**: `DATOS_INVALIDOS` (400), `PART_DUPLICATE` (409) código en uso

#### `PUT /api/parts/:id`

- **Roles**: solo ADMIN
- **Cuerpo**: `{ "name"?, "code"?, "minStock"?, "isActive"? }` — el `stock` NO se edita aquí: solo cambia mediante movimientos (FR-009)
- **Reglas**: `isActive: false` = baja lógica (FR-010); el historial de movimientos se conserva siempre
- **Respuesta 200**: la refacción actualizada (directa)
- **Errores**: `PART_NOT_FOUND` (404), `DATOS_INVALIDOS` (400), `PART_DUPLICATE` (409)

#### `POST /api/parts/:id/movements`

- **Roles**: solo ADMIN (FR-014, FR-016)
- **Cuerpo**: `{ "movementType": "IN", "quantity": 20, "reason": "Reposición proveedor" }` o `{ "movementType": "ADJUSTMENT", "quantity": -2, "reason": "Conteo físico, piezas dañadas" }`
- **Reglas**: `IN` con cantidad > 0 suma; `ADJUSTMENT` con signo suma o resta; `reason` obligatorio en ambos; ninguna operación deja el stock negativo (FR-012, RN-8 uniforme según aclaración Q3); movimiento inmutable (sin borrado ni edición)
- **Respuesta 201**: el movimiento creado (directo): `{ "id": 9, "partId": 1, "movementType": "IN", "quantity": 20, "reason": "Reposición proveedor", "stockResult": 24, "createdAt": "..." }`
- **Errores**: `PART_NOT_FOUND` (404), `MOVEMENT_INVALID` (422) cantidad 0 o AJUSTE que dejaría stock negativo, `PART_SIN_STOCK` (409) con `details.stockDisponible`

#### `GET /api/parts/:id/movements`

- **Roles**: solo ADMIN
- **Reglas**: auditoría completa e inmutable de la refacción (FR-010, FR-014), orden `created_at` DESC
- **Respuesta 200**:

```json
{
  "datos": [
    { "id": 18, "movementType": "OUT", "quantity": 1, "reason": "Uso en orden", "orderId": 12, "createdBy": { "id": 3, "nombreCompleto": "Juan Pérez" }, "createdAt": "2026-09-30T10:20:00" }
  ]
}
- **Errores**: `PART_NOT_FOUND` (404)

### Refacciones usadas en una orden (US7, FR-011, FR-012)

#### `POST /api/orders/:id/parts`

- **Roles**: ADMIN; MECHANIC solo dueño de la orden (`FORBIDDEN_ORDER`, 403)
- **Cuerpo**: `{ "partId": 1, "quantity": 2 }`
- **Reglas**: orden no cerrada (`ENTREGADO`/`CANCELADA` → `ORDER_CLOSED`, 409); la pausa `ESPERANDO_REFACCION` sí permite agregar (caso límite del spec); refacción activa (`PART_INACTIVE`, 409); stock suficiente (`PART_SIN_STOCK`, 409, stock resultante ≥ 0 siempre, CA-6); cada alta genera un movimiento `OUT` con `order_id` en la misma transacción (RN-6, RN-7, FR-018)
- **Respuesta 201**: la línea creada (directa): `{ "id": 44, "partId": 1, "quantity": 2, "stockResult": 2, ... }` (con ella se genera el movimiento `OUT` con `order_id`)
- **Errores**: `ORDER_NOT_FOUND` (404), `ORDER_CLOSED` (409), `FORBIDDEN_ORDER` (403), `PART_NOT_FOUND` (404), `PART_INACTIVE` (409), `PART_SIN_STOCK` (409), `DATOS_INVALIDOS` (400)

#### `DELETE /api/orders/:id/parts/:partId`

- **Roles**: ADMIN; MECHANIC solo dueño de la orden
- **Reglas**: solo en orden abierta (`ORDER_CLOSED`, 409); borra la línea y genera un movimiento `IN` de devolución con `order_id`; el `OUT` original se conserva (trazabilidad, research D5); el stock vuelve a su nivel anterior (escenario 4 de la US7)
- **Respuesta 204**: sin cuerpo (la línea se borra y se genera el movimiento `IN` de devolución; el stock vuelve a su nivel anterior, escenario 4 de la US7)
- **Errores**: `ORDER_NOT_FOUND` (404), `ORDER_CLOSED` (409), `FORBIDDEN_ORDER` (403), `ORDER_PART_NOT_FOUND` (404)

### Extensión de endpoints existentes

#### `GET /api/orders/:id` (extensión)

- El detalle de la orden existente añade el bloque `refacciones: [ { id, partId, nombre, code, quantity } ]` con las líneas de `order_parts` de la orden, para que la vista de detalle muestre el uso de inventario (US7).

## Catálogo de errores nuevo (amplía `server/utils/errors.js`)

| Código | HTTP | Cuándo |
|--------|------|--------|
| `PART_NOT_FOUND` | 404 | Refacción inexistente |
| `PART_DUPLICATE` | 409 | Código de refacción ya registrado |
| `PART_INACTIVE` | 409 | Refacción desactivada intenta usarse en una orden |
| `PART_SIN_STOCK` | 409 | Stock insuficiente para la cantidad solicitada (detalla `stockDisponible`) |
| `MOVEMENT_INVALID` | 422 | Cantidad 0, signo inválido o AJUSTE que dejaría stock negativo |
| `MAINTENANCE_NOT_FOUND` | 404 | Mantenimiento inexistente |
| `MAINTENANCE_NOT_MODIFIABLE` | 409 | Acción sobre estado distinto de PENDING |
| `MAINTENANCE_INVALID_THRESHOLD` | 422 | Registro sin fecha ni kilometraje objetivo |
| `ORDER_CLOSED` | 409 | Intento de modificar refacciones en orden ENTREGADO/CANCELADA |
| `ORDER_PART_NOT_FOUND` | 404 | La refacción no está asignada a la orden |
| `FORBIDDEN_ORDER` | 403 | Mecánico opera una orden que no le pertenece |

## Matriz de permisos (resumen, FR-016, RN-15)

| Recurso | ADMIN | RECEPTIONIST | MECHANIC |
|---------|:-----:|:------------:|:--------:|
| Historial de vehículo | leer | leer | leer |
| Lista de mantenimientos | leer | leer | — |
| Registrar mantenimiento | ✅ | — | ✅ |
| Completar mantenimiento | ✅ | ✅ | ✅ |
| Cancelar mantenimiento | ✅ | — | — |
| Consultar inventario | leer todo | leer | leer (activas) |
| Registrar/editar refacciones | ✅ | — | — |
| Entradas y ajustes de stock | ✅ | — | — |
| Historial de movimientos | ✅ | — | — |
| Refacciones en orden | ✅ | — | ✅ (solo su orden) |
