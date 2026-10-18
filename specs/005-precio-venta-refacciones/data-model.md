# Modelo de datos: Precio de venta de refacciones y total de la orden

**Feature**: `005-precio-venta-refacciones` | **Fecha**: 2026-10-18

Cada cambio indica los FR del spec que lo exigen. Migración nueva: `database/migrations/016_add_part_prices.sql` (las migraciones 001–015 no se tocan). Seed nuevo: `database/seeds/008_demo_part_prices.sql` (los seeds 001–007 no se tocan).

## Cambios de esquema (migración 016)

### Tabla `parts` (existente, se amplía)

| Campo nuevo | Tipo | Regla | Exigen |
|-------------|------|-------|--------|
| `sale_price` | `DECIMAL(10,2) NULL` | `NULL` = pendiente de precio (D1); `0` es precio válido (obsequio); `CHECK (sale_price >= 0)`; editable solo por ADMIN | **FR-001**, **FR-002**, **FR-003**, **FR-005** (impide usarla sin precio), **FR-015** (seeds) |

Campos existentes sin cambio: `id`, `name`, `code`, `stock`, `min_stock`, `is_active`, `created_at`, `updated_at`.

**Reglas asociadas**:
- La refacción existente al aplicar el cambio queda con `sale_price = NULL` (pendiente) por herencia de columna nueva; la administración la asigna antes de usarla en una orden (**FR-005**, Supuesto del spec).
- El filtro de pendientes es `sale_price IS NULL AND is_active = 1` (**FR-003**).

### Tabla `order_parts` (existente, se amplía)

| Campo nuevo | Tipo | Regla | Exigen |
|-------------|------|-------|--------|
| `unit_price` | `DECIMAL(10,2) NULL` | Precio de venta **congelado** al agregar la refacción a la orden (D2); `NULL` solo en usos antiguos pre-migración; `CHECK (unit_price >= 0)` | **FR-004**, **FR-006**, **FR-008**, **FR-011** |

Campos existentes sin cambio: `id`, `order_id`, `part_id`, `quantity`, `created_by`, `created_at` (la devolución de una refacción elimina la línea y genera su `IN`, comportamiento del spec 003 sin cambios).

**Reglas asociadas**:
- El importe de la línea se deriva: `unit_price × quantity` (**FR-007**); no se almacena importe derivado (evita duplicar verdad, CA "sin duplicar importes" del FR-003 del spec 004).
- Una línea con `unit_price IS NULL` marca a su orden con total incompleto (**FR-008**); el cobro y el ticket se bloquean solo en órdenes no liquidadas (**FR-009, FR-010**), y su adopción posterior solo ocurre en órdenes abiertas no liquidadas (**FR-011**). En órdenes ya liquidadas el total histórico no cambia y el ticket muestra las líneas sin precio marcadas como "sin precio" (**FR-016**).

### Tablas sin cambio de esquema

| Tabla | Papel | Exigen |
|-------|-------|--------|
| `service_orders` | Sin columna `total`: el total se deriva al vuelo (D3) desde servicios + mano de obra + importes de `order_parts`; se agrega el indicador derivado `partsIncomplete` en la respuesta, no en la tabla | **FR-007**, **FR-008** |
| `order_services`, `order_labor` | Aportan sus importes al total como hasta ahora | **FR-007** |
| `inventory_movements` | El uso ya registra su `OUT`; el retiro su `IN` (comportamiento existente, sin cambios) | **FR-007** (retiro descuenta el total) |
| `payments` | Se calcula contra el total con refacciones; saldo pendiente = total − pagos completados; se bloquea si el total está incompleto | **FR-009**, **FR-012** |
| `tickets` | Refleja el total con refacciones y el desglose; se bloquea su emisión/consulta si el total está incompleto | **FR-010**, **FR-013**, **FR-014** |

## Entidades y relaciones (después del cambio)

```text
parts (1) ──── (N) order_parts (N) ──── (1) service_orders (1) ──── (N) payments
   │  sale_price                        │  unit_price (congelado)        │
   │                                    └─── (1) tickets (por orden)
   └─── (N) inventory_movements
```

- **Refacción** → `salePrice` (mapeo API camelCase desde `sale_price`); pendiente de precio si es `null`.
- **Uso en orden** (`orderParts`) → `quantity` + `unitPrice` congelado; importe derivado.
- **Orden de servicio** → total derivado (servicios + mano de obra + usos con precio) + indicador `partsIncomplete`; dimensiones abierta/no liquidada independientes (Clarificación Q2).

## Derivaciones y reglas de cálculo

### Total de la orden (FR-007, FR-008)

```
total        = SUM(order_services.amount)
             + SUM(order_labor.amount)
             + SUM(order_parts.unit_price × order_parts.quantity)   -- solo líneas con unit_price no nulo
partsIncomplete = COUNT(order_parts WHERE unit_price IS NULL)
totalCompleto   = (partsIncomplete = 0)
```

Cálculo único en `orderModel.findTotals` (al vuelo, D3); lo consumen `orderService` (detalle e historial), `paymentService` (saldo y bloqueos) y `ticketService` (contenido), garantizando CA-14 (diferencia $0).

### Saldo pendiente (FR-012)

```
saldoPendiente = max(total − SUM(payments.amount WHERE status = 'COMPLETED'), 0)
```

### Adopción de precio al asignar `sale_price` (FR-011)

Al actualizar una refacción con precio nuevo, en la misma operación:

```
UPDATE order_parts SET unit_price = :nuevoPrecio
 WHERE part_id = :id AND unit_price IS NULL
   AND order_id IN (órdenes con status NOT IN ('ENTREGADO','CANCELADA')
                    y pagos COMPLETED < total previo a la adopción,
                    calculado sin los usos que van a adoptarse)
```

El total previo evita la circularidad de evaluar la liquidación con los usos que aún no tienen precio y evita que una orden ya pagada adopte (hallazgo AMB-01 del análisis; criterio fijado en Clarifications, "Sesión posterior al análisis"). Los usos de órdenes ya liquidadas (o entregadas/canceladas) conservan `NULL` y su total histórico no cambia (**FR-011** + Supuestos; fuera de alcance recalcularlas). La adopción solo ajusta el saldo pendiente y nunca deja liquidada a una orden (el precio adoptado no reduce el total). El saldo pendiente de las órdenes adoptantes se recalcula al vuelo (CA-19).

## Estados y transiciones (de uso de refacción)

| Evento | Efecto en datos | Exige |
|--------|-----------------|-------|
| Agregar refacción con precio | `order_parts` + línea con `unit_price = parts.sale_price`; `OUT` de inventario; total crece | FR-004, FR-007 |
| Agregar refacción sin precio | Se rechaza: sin línea, sin movimiento, sin cambio de total | FR-005 |
| Cambiar `sale_price` | No altera líneas existentes con precio; adopta en líneas `NULL` de órdenes abiertas no liquidadas | FR-006, FR-011 |
| Retirar refacción de la orden | Se elimina la línea, `IN` de inventario; el total baja por su importe | FR-007 |
| Registrar pago con total incompleto en orden no liquidada | Se rechaza (`409 TOTAL_INCOMPLETO`) | FR-009 |
| Generar ticket con total incompleto en orden no liquidada | Se rechaza (`409 TOTAL_INCOMPLETO`) | FR-010 |
| Generar ticket de orden ya liquidada con usos sin precio | Se emite con el total histórico; las líneas sin precio van marcadas "sin precio" (`unitPrice`/`amount` nulos, `sinPrecio: true`) | FR-016 |

## Datos de ejemplo (seed 008, FR-015)

| Elemento | Contenido | Exigen |
|----------|-----------|--------|
| Precios de las 6 refacciones existentes | `sale_price` asignado a los IDs 1–6 | FR-015 |
| Refacción nueva sin precio (activa) | Ejemplo de "pendiente de precio" visible en el inventario, sin uso en ninguna orden | FR-003 (demostración), FR-015 (no deja órdenes incompletas) |
| Usos con precio congelado | Líneas en la orden 2 (EN_REPARACION, pagos parciales de la orden) con `unit_price` y sus `OUT` de inventario; `stock` se fija en **valores absolutos** que satisfacen `stock = IN + OUT + ajustes` tras aplicar el seed (sin dependencia del stock previo, para que el seed 008 sea idempotente — hallazgo INC-03) | FR-004, FR-007, FR-012 (demostración) |
| Órdenes 1, 3, 4, 5 | Sin usos nuevos: la 4 está ENTREGADO (cerrada) y ya liquidada; la 3 espera una refacción fuera del catálogo; la 1 y 5 no tienen trabajo registrado | Regla de orden cerrada + FR-015 |

Ninguna orden de ejemplo queda con `partsIncomplete > 0` tras aplicar seeds (**CA-20**).
