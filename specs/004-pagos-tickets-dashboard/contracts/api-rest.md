# Contrato API REST: Pagos, Tickets y Dashboard

**Fecha**: 2026-10-11 | **Feature**: `004-pagos-tickets-dashboard` | **Plan**: [plan.md](./plan.md)

Extiende el contrato base (ver `specs/003-historial-inventario/contracts/api-rest.md`): misma autenticación por JWT con rol y mismo envoltorio verificado — éxito con payload directo (el recurso tal cual o colecciones bajo `datos`), error como `{ "error": { "codigo": "...", "mensaje": "...", "details": { } } }` (`details` solo donde el catálogo lo indica).

## Endpoints nuevos

### Pagos de una orden (US1–US2, FR-001 a FR-006)

#### `GET /api/orders/:id/payments`

- **Roles**: ADMIN, RECEPTIONIST
- **Reglas**: lista los pagos de la orden en orden `created_at` DESC; aplica la expiración perezosa (los `PENDING` con más de 24 h pasan a `EXPIRED`, D3); devuelve el total calculado de la orden, el acumulado cobrado y el saldo pendiente (derivados, sin copias)
- **Respuesta 200**:

```json
{
  "total": 1500.0,
  "cobrado": 800.0,
  "saldoPendiente": 700.0,
  "estadoCobro": "PARCIAL",
  "datos": [
    { "id": 9, "metodo": "TRANSFER", "monto": 800.0, "estado": "COMPLETED", "registradoPor": { "id": 2, "nombreCompleto": "Recepción del Taller" }, "fecha": "2026-10-11T16:20:00" }
  ]
}
```

- **Errores**: `ORDER_NOT_FOUND` (404)

#### `POST /api/orders/:id/payments`

- **Roles**: ADMIN, RECEPTIONIST (FR-005)
- **Cuerpo**: `{ "metodo": "CASH" | "CARD" | "TRANSFER", "monto": 700.0 }`
- **Reglas**: la orden debe existir y no estar cancelada (`ORDER_CANCELLED`, 409); el monto debe ser mayor que cero (`DATOS_INVALIDOS`, 400) y no mayor que el saldo pendiente (`PAYMENT_EXCEEDS_BALANCE`, 409 con `details.saldoPendiente`); el pago nace `COMPLETED` (D1); los pagos no se editan ni se eliminan (FR-006)
- **Respuesta 201**: el pago creado (directo)
- **Errores**: `ORDER_NOT_FOUND` (404), `ORDER_CANCELLED` (409), `DATOS_INVALIDOS` (400), `PAYMENT_EXCEEDS_BALANCE` (409)

#### `GET /api/payments/:id`

- **Roles**: ADMIN, RECEPTIONIST
- **Respuesta 200**: el pago (directo), tras aplicar expiración perezosa si corresponde
- **Errores**: `PAYMENT_NOT_FOUND` (404)

### Cobro digital con Mercado Pago (US3, FR-008 a FR-010)

#### `POST /api/orders/:id/payments/digital`

- **Roles**: ADMIN, RECEPTIONIST
- **Cuerpo**: `{ "monto": 1500.0 }` (por defecto, el saldo pendiente)
- **Reglas**: la orden no cancelada; no puede existir otro cobro `PENDING` vigente para la misma orden (`PAYMENT_DUPLICATE_PENDING`, 409); se crea el pago `PENDING` con `external_reference` y se genera la preferencia ante el proveedor (sandbox) o su simulador según `MP_MODE` (D6); el monto no excede el saldo (`PAYMENT_EXCEEDS_BALANCE`, 409)
- **Respuesta 201**: `{ "id": 12, "estado": "PENDING", "monto": 1500.0, "enlace": "https://..." }` (el enlace para compartir con el cliente)
- **Errores**: `ORDER_NOT_FOUND` (404), `ORDER_CANCELLED` (409), `DATOS_INVALIDOS` (400), `PAYMENT_EXCEEDS_BALANCE` (409), `PAYMENT_DUPLICATE_PENDING` (409), `MP_PROVIDER_ERROR` (502) sin registrar pagos incompletos

#### `POST /api/payments/:id/verify`

- **Roles**: ADMIN, RECEPTIONIST
- **Reglas**: solo un pago `MERCADO_PAGO` `PENDING` (`PAYMENT_NOT_MODIFICABLE`, 409); consulta al proveedor/simulador bajo demanda (Q1): confirmado → `COMPLETED`; si tiene más de 24 h y no está confirmado → `EXPIRED` (Q2); las transiciones ocurren como máximo una vez (los reintentos del proveedor no duplican importes, FR-010)
- **Respuesta 200**: el pago actualizado (directo) con su nuevo `estado`
- **Errores**: `PAYMENT_NOT_FOUND` (404), `PAYMENT_NOT_MODIFICABLE` (409), `MP_PROVIDER_ERROR` (502)

### Ticket de servicio (US3, FR-011 a FR-013)

#### `GET /api/tickets/:orderId`

- **Roles**: ADMIN, RECEPTIONIST (FR-013)
- **Reglas**: si la orden aún no tiene ticket se emite uno nuevo (folio `TCK-AAAA-NNNN`); si ya existe se devuelve el mismo folio con el contenido más reciente (FR-004 de la historia de tickets); la orden no puede estar cancelada (`ORDER_CANCELLED`, 409); el contenido se deriva al vuelo (D4): folio, datos del taller, cliente, vehículo, placas, kilometraje, servicios, refacciones, mano de obra, subtotal, total, método de pago, estado de pago y fecha (CA-4)
- **Respuesta 200**:

```json
{
  "folio": "TCK-2026-0001",
  "fecha": "2026-10-11T16:40:00",
  "taller": { "nombre": "Motorix", "direccion": "...", "telefono": "..." },
  "cliente": { "id": 1, "nombreCompleto": "María López Hernández" },
  "vehiculo": { "id": 1, "marca": "Nissan", "modelo": "Versa", "anio": 2019, "placas": "ABC-123-A", "kilometraje": 45120 },
  "servicios": [ { "nombre": "Cambio de aceite", "precio": 350.0 } ],
  "refacciones": [ { "nombre": "Filtro de aceite", "codigo": "FLT-001", "cantidad": 1 } ],
  "manoObra": 200.0,
  "subtotal": 670.0,
  "total": 670.0,
  "metodosDePago": [ { "metodo": "CASH", "monto": 670.0, "estado": "COMPLETED" } ],
  "estadoPago": "LIQUIDADA",
  "saldoPendiente": 0.0
}
```

- **Errores**: `ORDER_NOT_FOUND` (404), `ORDER_CANCELLED` (409)

> Nota de implementación (T033): `subtotal` y `total` suman servicios + mano de obra, el mismo cálculo que ya usa el historial del Sprint 2/3. Las refacciones del inventario no tienen precio unitario en el esquema actual, por lo que el ticket las lista con nombre, código y cantidad sin sumarlas al total (revisado durante la implementación; el supuesto del spec sobre "refacciones con precio" no aplica al modelo real).

### Panel de control (US4, FR-014 a FR-016)

#### `GET /api/dashboard`

- **Roles**: solo ADMIN (FR-016)
- **Reglas**: agregados al vuelo sobre datos existentes, sin tablas de resumen (D7); el "dinero cobrado" solo suma pagos `COMPLETED`; los pendientes/expirados no cuentan (FR-007 del spec, SC-007)
- **Respuesta 200**:

```json
{
  "ordenes": { "RECIBIDO": 1, "DIAGNOSTICO": 0, "EN_REPARACION": 1, "ESPERANDO_REFACCION": 1, "TERMINADO": 0, "ENTREGADO": 1, "CANCELADA": 1 },
  "citas": { "hoy": 2, "proximas": 3 },
  "mantenimientos": { "vencidos": 2, "proximos": 3 },
  "inventario": { "stockBajo": 2 },
  "cobros": { "hoy": 1340.0, "total": 5620.0, "pendientesDigitales": 1 }
}
```

- **Errores**: `UNAUTHORIZED` (401), `FORBIDDEN` (403)

## Catálogo de errores nuevo (amplía `server/utils/errors.js`)

| Código | HTTP | Cuándo |
|--------|------|--------|
| `PAYMENT_NOT_FOUND` | 404 | Pago inexistente |
| `PAYMENT_NOT_MODIFIABLE` | 409 | Transición de estado no permitida (ya final) |
| `PAYMENT_EXCEEDS_BALANCE` | 409 | El monto supera el saldo pendiente (detalla `saldoPendiente`) |
| `PAYMENT_DUPLICATE_PENDING` | 409 | Ya existe un cobro digital vigente para la orden |
| `ORDER_CANCELLED` | 409 | Operación de pago o ticket sobre una orden cancelada |
| `MP_PROVIDER_ERROR` | 502 | El proveedor de pago no respondió; no se registra ningún cambio |

## Matriz de permisos (resumen, RN-15)

| Recurso | ADMIN | RECEPTIONIST | MECHANIC |
|---------|:-----:|:------------:|:--------:|
| Consultar/registrar pagos manuales | ✅ | ✅ | — |
| Crear y verificar cobros digitales | ✅ | ✅ | — |
| Generar/imprimir tickets | ✅ | ✅ | — |
| Panel de control | ✅ | — | — |
