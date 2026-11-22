# Contrato API REST: Categoría, marca, precio de compra y cobro consistente

**Fecha**: 2026-11-21 | **Feature**: `006-complemento-precios-compra` | **Plan**: [plan.md](../plan.md)

Extiende el contrato base y los previos (`specs/003-historial-inventario/contracts/api-rest.md`, `specs/004-pagos-tickets-dashboard/contracts/api-rest.md`, `specs/005-precio-venta-refacciones/contracts/api-rest.md`): misma autenticación por JWT con rol, mismo envoltorio (`ok` con payload directo o colecciones bajo `datos`; error como `{ "error": { "codigo": "...", "mensaje": "...", "details": { } } }`), mismas respuestas `ok`/`created`/`error`. **No se agregan rutas nuevas ni dependencias.**

## Cambios transversales

- **`category`** (`string | null`): identificador del catálogo fijo `FRENOS | MOTOR | SUSPENSION | ELECTRICO | TRANSMISION | CLIMA | NEUMATICOS | LUBRICANTES | OTRO`; `null` = sin clasificar. Visible a los tres roles.
- **`brand`** (`string | null`): texto libre, máximo 50 caracteres. Visible a los tres roles.
- **`purchasePrice`** (`number | null`): precio de compra; **solo se incluye en la respuesta cuando el rol es ADMIN** (se omite por completo para `RECEPTIONIST` y `MECHANIC`, no llega como `null`). `null` = pendiente de captura. No negativo, hasta 2 decimales, ≤ 999,999.99.
- **Límites de importe**: todo precio capturable ≤ **999,999.99**; total de orden ≤ **99,999,999.99**. Los cálculos de totales, saldos y montos se resuelven en centavos enteros y se responden con 2 decimales (diferencia $0).
- **Estado del pago**: `estado` puede ser `PENDING | COMPLETED | EXPIRED | STALE`. `STALE` = cobro de Mercado Pago desfasado (su importe ya no coincide con el **saldo pendiente** vigente de la orden, es decir, el total menos los pagos `COMPLETED`, no el total a secas); no cuenta como pago vigente (ni en el saldo ni en la regla de un solo cobro digital) y su importe jamás cambia.
- **Nuevo código de error**: `ORDER_TOTAL_LIMIT_EXCEEDED` (**422**): la operación dejaría el total de la orden por encima de 99,999,999.99.
- **Advertencia no bloqueante**: al guardar un `salePrice` menor que el `purchasePrice` de la misma refacción, la respuesta incluye `"advertencia"` (decisión acordada: se permite con advertencia).

## Endpoints que cambian

### `GET /api/parts` (FR-001, FR-005, FR-014, CA-1, CA-3)

- **Roles**: ADMIN, RECEPTIONIST, MECHANIC (sin cambio).
- **Cambio de respuesta**: cada refacción incluye `category` y `brand` siempre; `purchasePrice` **solo si el rol es ADMIN**. Sin filtros nuevos (se conserva `?pending-price=true` de la 005).

```json
{ "datos": [ { "id": 1, "name": "Filtro de aceite", "code": "FLT-OIL-010", "category": "LUBRICANTES", "brand": "Genérico", "stock": 11, "minStock": 4, "salePrice": 120.0, "purchasePrice": 78.5, "isActive": true, "lowStock": false } ] }
```

- Respuesta para MECHANIC/RECEPTIONIST: mismo objeto **sin la clave `purchasePrice`**.

### `POST /api/parts` y `PUT /api/parts/:id` (FR-001, FR-002, FR-004, FR-006, CA-1, CA-4)

- **Roles**: ADMIN (sin cambio; con otro rol → `403 NO_AUTORIZADO`, verificado en backend).
- **Cuerpo nuevo (opcional)**: `"category": "FRENOS"` (debe pertenecer al catálogo), `"brand": "Brembo"` (≤ 50), `"purchasePrice": 78.5`.
- **Validaciones nuevas** (`400 DATOS_INVALIDOS`, sin guardar nada):
  - precio de venta o de compra negativo, no numérico o con más de 2 decimales;
  - precio de venta o de compra > 999,999.99;
  - `category` fuera del catálogo fijo;
  - `brand` con más de 50 caracteres.
- **Advertencia** (decisión acordada): si `purchasePrice` existe y `salePrice < purchasePrice`, el guardado **se permite** y la respuesta agrega `"advertencia": "El precio de venta es menor al precio de compra."` (no es un error).
- **Sin efecto en cobros**: guardar `purchasePrice`/`category`/`brand` no recalcula totales, saldos ni pagos.

### `GET /api/orders/:id` (CA-2, CA-5)

- **Sin cambio de forma**: el bloque `totals` se sigue calculando en centavos enteros (servicios + mano de obra + refacciones) y se responde con 2 decimales; se agrega la validación de tope (ver `422 ORDER_TOTAL_LIMIT_EXCEEDED`).

### `POST /api/orders/:id/parts` (CA-2)

- **Cuerpo**: sin cambios. **Nueva respuesta de error**: `422 ORDER_TOTAL_LIMIT_EXCEEDED` si agregar la refacción (cantidad × precio de venta vigente) dejaría el total de la orden por encima de 99,999,999.99; la orden y el stock no cambian.
- La respuesta de este endpoint y la de `DELETE /api/orders/:id/parts/:partId` **nunca** incluyen `purchasePrice` (solo se proyectan nombre, código, cantidad y precio unitario).

### `POST /api/orders/:id/services` (servicios y mano de obra, CA-2)

> **Nota:** no existe `POST /api/orders/:id/labor`. La mano de obra se agrega con este mismo endpoint indicando `kind: "LABOR"` (los servicios usan `kind: "SERVICE"`).

- **Cuerpo**: sin cambios (`{ "kind": "SERVICE" | "LABOR", "description": "...", "amount": 450.0 }`). No hay restricción de unicidad: dos líneas idénticas (misma orden, descripción e importe) pueden coexistir.
- **Nuevas respuestas de error**:
  - `422 ORDER_TOTAL_LIMIT_EXCEEDED` si el total resultante supera 99,999,999.99.
  - `400 DATOS_INVALIDOS` si `amount` no es un importe válido (numérico, ≥ 0, ≤ 2 decimales, ≤ 999,999.99).

### `GET /api/orders/:id/payments` (FR-008, CA-6)

- **Roles**: ADMIN, RECEPTIONIST (sin cambio).
- **Comportamiento**: al consultar se aplica la detección perezosa del desfase: todo cobro `MERCADO_PAGO` `PENDING` cuyo `monto` no coincida con el **saldo pendiente** (total menos pagos `COMPLETED`) se devuelve ya en estado `STALE`. Un cobro correcto por el saldo tras un pago parcial previo (total 2,000.00 − pago 800.00 → cobro 1,200.00) **no** se marca `STALE`.
- **Efecto en el bloque derivado**: `cobrado` y `saldoPendiente` **no** consideran los pagos `STALE` (solo `COMPLETED`); `estadoCobro` se deriva igual.

```json
{ "total": 2000.0, "cobrado": 800.0, "saldoPendiente": 1200.0, "estadoCobro": "PARCIAL",
  "datos": [ { "id": 9, "metodo": "MERCADO_PAGO", "monto": 1800.0, "estado": "STALE", "externalReference": "MP-1234", "fecha": "…" } ] }
```

### `POST /api/orders/:id/payments/digital` (FR-008, CA-6)

- **Roles**: ADMIN, RECEPTIONIST (sin cambio).
- **Comportamiento**: este endpoint **no** marca `STALE` (el desfase se detecta únicamente en `GET .../payments` y en `POST /api/payments/:id/verify`). `409 PAYMENT_DUPLICATE_PENDING` conserva su significado actual: existe un cobro `PENDING`. Un cobro desfasado deja de bloquear en cuanto una consulta de pagos lo marca `STALE`; la interfaz consulta `GET .../payments` **antes** de ofrecer un cobro nuevo, de modo que al crearlo el desfasado ya está `STALE` y el nuevo se crea con el importe del saldo actual.
- **Cuerpo**: sin cambios (`{ "monto": 1800.0 }`); sigue validándose contra el saldo (que ya no descuenta `STALE`).

### Consecuencia aceptada: cobro digital parcial creado por la API (D6)

- `POST .../payments/digital` acepta cualquier `monto` mayor que cero y no mayor que el saldo. La **aplicación de escritorio solo genera el enlace por el saldo completo** (`payment_form_screen.dart` envía `monto: saldoPendiente`; no ofrece un cobro digital parcial). Por tanto, un cobro digital por un importe **menor** al saldo solo puede crearse llamando directamente a la API.
- Como la regla de `STALE` compara contra el saldo pendiente, ese cobro parcial queda `STALE` en la **siguiente** consulta (`GET .../payments`) o verificación, aunque nadie haya cambiado el total. Es un comportamiento aceptado y documentado; los pagos parciales se registran con los métodos manuales.

### `POST /api/payments/:id/verify` (FR-008, FR-009, CA-6)

- **Roles**: ADMIN, RECEPTIONIST (sin cambio).
- **Comportamiento nuevo**: si el cobro `PENDING` tiene un importe distinto al saldo pendiente de su orden (total menos pagos `COMPLETED`), se transiciona a `STALE` y la respuesta lo devuelve así **sin** confirmarlo; nunca resulta `COMPLETED` con importe desfasado. Si coincide, el flujo actual (caducidad → consulta al proveedor → `PENDING → COMPLETED`) sigue igual.
- **Sobre un pago `STALE`**: `409 PAYMENT_NOT_MODIFIABLE` (no está en `PENDING`), con mensaje que menciona el estado desfasado.

### `GET /api/payments/:id`, tickets y panel (CA-6, CA-7)

- **Sin cambio de forma**: los pagos y tickets emitidos antes de este cambio se devuelven idénticos (CA-7); el panel sigue contando solo `COMPLETED` como cobrado y solo `PENDING` como cobro digital vigente.

## Garantías por rol (CA-3, CA-4)

| Rol | Lee `category`/`brand` | Lee `purchasePrice` | Escribe `category`/`brand`/`purchasePrice` |
|---|---|---|---|
| ADMIN | Sí | Sí | Sí |
| RECEPTIONIST | Sí | **No (clave ausente)** | `403 NO_AUTORIZADO` |
| MECHANIC | Sí | **No (clave ausente)** | `403 NO_AUTORIZADO` |

El filtrado y la autorización se validan en backend con pruebas de contrato por rol; la interfaz solo oculta los campos por comodidad.
