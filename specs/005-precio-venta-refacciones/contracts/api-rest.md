# Contrato API REST: Precio de venta de refacciones y total de la orden

**Fecha**: 2026-10-18 | **Feature**: `005-precio-venta-refacciones` | **Plan**: [plan.md](../plan.md)

Extiende el contrato base (ver `specs/003-historial-inventario/contracts/api-rest.md` y `specs/004-pagos-tickets-dashboard/contracts/api-rest.md`): misma autenticación por JWT con rol, mismo envoltorio (éxito con payload directo o colecciones bajo `datos`; error como `{ "error": { "codigo": "...", "mensaje": "...", "details": { } } }`), mismas respuestas `ok`/`created`/`error`. **No se agregan dependencias ni rutas nuevas fuera de los ajustes listados.**

## Cambios transversales

- **`salePrice`** (`number | null`): precio de venta de una refacción; `null` = pendiente de precio (D1). No negativo, hasta 2 decimales.
- **`unitPrice`** (`number | null`): precio congelado de un uso de refacción en una orden (D2); `null` solo en usos antiguos sin asignar.
- **Totales con refacciones**: todo recurso que hoy devolvía el total de una orden (`GET /api/orders/:id`, `GET /api/orders/:id/payments`, ticket) ahora lo deriva como servicios + mano de obra + `unitPrice × quantity` (CA-6, CA-12, CA-14). El objeto de total incorpora `refacciones` (suma) y `totalCompleto` (booleano) + `refaccionesSinPrecio` (cantidad, D8).
- **Nuevo código de error**: `TOTAL_INCOMPLETO` (**409**): la orden **no liquidada** tiene usos de refacciones sin precio; `details` incluye `refaccionesSinPrecio` (lista de `{ orderPartId, partId, nombre }`) y el mensaje indica que falta asignar precio de venta (FR-008, CA-9, CA-10). No aplica a órdenes ya liquidadas, que conservan su total histórico (FR-016, CA-21).
- **Nuevo código de error**: `PART_SIN_PRECIO` (**409**): se intentó agregar a una orden una refacción sin `salePrice` (FR-005, CA-8); no cambian la orden ni el inventario.

## Endpoints que cambian

### `GET /api/parts` (FR-003, CA-17)

- **Roles**: ADMIN, RECEPTIONIST, MECHANIC (sin cambio)
- **Cambio de contrato**: cada refacción incluye `salePrice`; nuevo query param opcional `?pending-price=true` que filtra solo las refacciones **activas** (`is_active = 1`) con `salePrice` nulo (lista de pendientes de precio, D7; FR-003/CA-17). Con el filtro, la lista queda vacía cuando todas las activas tienen precio.
- **Respuesta 200** (fracción):

```json
{
  "datos": [
    { "id": 1, "nombre": "Filtro de aceite", "codigo": "FLT-OIL-010", "stock": 11, "minStock": 4, "salePrice": 85.0, "isActive": true, "lowStock": false }
  ]
}
```

### `POST /api/parts` (FR-001, FR-002, CA-1, CA-2)

- **Roles**: ADMIN (sin cambio)
- **Cambio de cuerpo**: opcional `"salePrice": 85.0` (decimal no negativo o `null` para dejarlo pendiente). Rechaza valores negativos o no numéricos con `DATOS_INVALIDOS` (400) sin crear la refacción (CA-3).
- **Respuesta 201**: la refacción creada con su `salePrice`.

### `PUT /api/parts/:id` (FR-001, FR-006, FR-011, CA-2, CA-4, CA-11, CA-19)

- **Roles**: ADMIN (sin cambio)
- **Cambio de cuerpo**: acepta `"salePrice": 90.0`.
- **Reglas nuevas**: al asignar o cambiar `salePrice`, el sistema adopta el precio en los usos sin precio (`unitPrice` nulo) de órdenes abiertas no liquidadas de esa refacción; los pagos registrados se conservan y el saldo pendiente se recalcula (D4). Las órdenes pagadas, entregadas o canceladas no se modifican.
- **Respuesta 200**: la refacción actualizada con su nuevo `salePrice`.

### `GET /api/orders/:id` (FR-007, FR-008, CA-6, CA-7)

- **Roles**: los mismos de hoy
- **Cambio de respuesta**: el bloque `totals` pasa a incluir las refacciones:

```json
{
  "totals": { "services": 600.0, "labor": 500.0, "parts": 510.0, "grand": 1610.0, "totalCompleto": true, "refaccionesSinPrecio": 0 }
}
```

- La lista `refacciones` de la orden incluye `unitPrice` e `amount` por línea; con `unitPrice: null` y `amount: null` en usos sin precio (CA-13).

### `POST /api/orders/:id/parts` (FR-004, FR-005, CA-3, CA-8)

- **Roles**: MECHANIC dueño de la orden (sin cambio); recepción/administración siguen rechazados
- **Cuerpo**: sin cambios `{ "partId": 1, "quantity": 2 }`
- **Reglas nuevas**: la refacción debe tener `salePrice`; si no, se responde `PART_SIN_PRECIO` (409) sin modificar la orden ni el inventario (CA-8). El uso se guarda con `unitPrice` = `salePrice` vigente (CA-3), y el total de la orden refleja la suma al vuelo (CA-6).
- **Respuesta 201**: `{ "id": 33, "partId": 1, "quantity": 2, "unitPrice": 85.0, "amount": 170.0, "stockResult": { "stock": 10 } }`
- **Errores nuevos**: `PART_SIN_PRECIO` (409); se conservan `ORDER_NOT_FOUND`, `ORDER_CLOSED`, `STOCK_INSUFFICIENT`, `DATOS_INVALIDOS`.

### `DELETE /api/orders/:id/parts/:orderPartId` (FR-007, CA-15)

- **Roles**: sin cambio
- **Reglas**: sin cambios (devuelve la línea y genera el `IN`); el total baja automáticamente por el importe de la línea retirada porque se deriva de las líneas (D3).

### `GET /api/orders/:id/payments` (FR-009, FR-012, CA-12, CA-19)

- **Roles**: sin cambio
- **Cambio de respuesta**: `total` ahora incluye las refacciones y el objeto agrega `totalCompleto`; con total incompleto en una orden no liquidada, `saldoPendiente` sigue siendo informativo pero no puede registrarse ningún pago (`TOTAL_INCOMPLETO`, D8); una orden ya liquidada conserva `estadoCobro: "LIQUIDADA"` con su total histórico aunque tenga usos sin precio (FR-016).
- **Ejemplo**: total $1,610, cobrado $800 → `saldoPendiente: 810.0`, `estadoCobro: "PARCIAL"`.

### `POST /api/orders/:id/payments` (FR-009, CA-10)

- **Regla nueva**: si la orden tiene total incompleto se responde `TOTAL_INCOMPLETO` (409) sin registrar el pago (CA-10); se validará antes que `PAYMENT_EXCEEDS_BALANCE`.
- **Cálculo nuevo**: el límite del monto (`saldoPendiente`) parte del total con refacciones (CA-12).

### `POST /api/orders/:id/payments/digital` (FR-009, CA-10)

- **Regla nueva**: igual que el pago manual — total incompleto ⇒ `TOTAL_INCOMPLETO` (409) sin crear el cobro ante el proveedor.

### `GET /api/tickets/:orderId` (FR-010, FR-013, FR-014, CA-13, CA-14)

- **Roles**: sin cambio (ADMIN, RECEPTIONIST)
- **Regla nueva**: en una orden **no liquidada** con total incompleto no se emite ni se consulta el ticket: `TOTAL_INCOMPLETO` (409) con `details.refaccionesSinPrecio` (CA-10); la emisión automática (`emitirSiFalta`) se omite en ese caso. En una orden **ya liquidada** el ticket se emite sin bloqueo con su total histórico (FR-016, CA-21).
- **Cambio de contenido**: `total` incluye las refacciones (idéntico al de la orden, CA-14) y cada línea de `refacciones` ahora es `{ nombre, codigo, cantidad, unitPrice, amount }` (CA-13); el bloque incluye `totalCompleto`; en una orden liquidada con usos sin precio esas líneas se envían con `unitPrice: null`, `amount: null` y `"sinPrecio": true` (FR-016).

```json
{
  "refacciones": [
    { "nombre": "Aceite sintético 5W30 (litro)", "codigo": "LUB-0530-1L", "cantidad": 4, "unitPrice": 120.0, "amount": 480.0 }
  ],
  "subtotal": 2610.0,
  "total": 2610.0,
  "totalCompleto": true
}
```

## Endpoints sin cambios

`GET /api/parts/:id/movements`, `POST /api/parts/:id/movements`, `GET /api/payments/:id`, `POST /api/payments/:id/verify`, y todos los endpoints de citas, órdenes, mantenimientos e historial (este último solo ve su `total` heredado ahora con refacciones incluidas, sin cambiar su forma).
