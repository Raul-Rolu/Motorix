# Modelo de datos: Pagos, Tickets y Dashboard

**Fecha**: 2026-10-11 | **Feature**: `004-pagos-tickets-dashboard` | **Plan**: [plan.md](./plan.md)

Extiende el modelo de los sprints previos (`database/migrations/`). Migraciones nuevas inmutables: `014_create_payments.sql` y `015_create_tickets.sql`. Todas las tablas InnoDB/utf8mb4 con llaves foráneas.

## Entidades nuevas

### `payments` (Pago)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | INT UNSIGNED PK AUTO_INCREMENT | |
| `order_id` | INT UNSIGNED NOT NULL FK → `service_orders.id` | RN-13: todo pago pertenece a una orden; `ON DELETE RESTRICT` (no se borra la orden con pagos) |
| `method` | VARCHAR(16) NOT NULL | `CASH`, `CARD`, `TRANSFER`, `MERCADO_PAGO` |
| `amount` | DECIMAL(10,2) NOT NULL | Debe ser mayor que cero (FR-001, caso límite del spec) |
| `status` | VARCHAR(16) NOT NULL | `PENDING`, `COMPLETED`, `EXPIRED` (ver transiciones) |
| `external_reference` | VARCHAR(64) NULL | Identificador de la preferencia creada ante el proveedor (solo `MERCADO_PAGO`); jamás datos de tarjeta (RN-14) |
| `created_by` | INT UNSIGNED FK → `users.id` | Quién registró el pago |
| `created_at` | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**Reglas de negocio**:

- **Inmutable**: los pagos no se editan ni se eliminan (FR-006); la única escritura posterior al alta son las transiciones de estado.
- Un pago nace `COMPLETED` si es manual (`CASH`, `CARD`, `TRANSFER`) y `PENDING` si es digital (`MERCADO_PAGO`) (D1).
- La liquidación de la orden se deriva: `SUM(amount) de COMPLETED >= total calculado` (FR-004); no se almacena (D2).
- El "expirado" se aplica de forma perezosa: `PENDING` con más de 24 h pasa a `EXPIRED` al consultar/verificar (D3, FR-009).

**Transiciones de estado**:

```text
PENDING ──(verificación confirmada del proveedor)──▶ COMPLETED
PENDING ──(más de 24 h al consultar/verificar)─────▶ EXPIRED
COMPLETED y EXPIRED: estado final, sin transiciones
```

### `tickets` (Ticket)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | INT UNSIGNED PK AUTO_INCREMENT | |
| `order_id` | INT UNSIGNED NOT NULL FK → `service_orders.id` UNIQUE | Un ticket por orden; se reutiliza al regenerar (FR-004, D4) |
| `folio` | VARCHAR(16) NOT NULL UNIQUE | Formato `TCK-AAAA-NNNN` (año + secuencial) (D4) |
| `issued_by` | INT UNSIGNED FK → `users.id` | Quién generó el ticket por primera vez |
| `issued_at` | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | Fecha de emisión del folio |

**Reglas de negocio**:

- El **contenido** del ticket no se persiste: se deriva al consultarlo desde la orden (servicios, mano de obra, refacciones), su cliente/vehículo y sus pagos (FR-011, FR-012; sin duplicar importes).
- No se emite ticket sobre una orden cancelada (caso límite del spec).
- Solo recepción y administración generan/consultan tickets (FR-013).

## Entidades derivadas (no se almacenan)

- **Total de la orden**: servicios + mano de obra, el mismo cálculo que ya usan el detalle y el historial del Sprint 2/3 (`orderModel.findTotals`, expuesto como `orderService.obtenerTotalOrden`) (D2). Las refacciones no suman: el inventario del Sprint 3 no registra precio unitario y el ticket las lista solo con cantidad (revisado en T009/T033).
- **Saldo pendiente**: total − pagos `COMPLETED` acumulados.
- **Estado de cobro de la orden**: `PENDIENTE` (sin pagos), `PARCIAL` (acumulado < total) o `LIQUIDADA` (acumulado ≥ total).
- **Contenido del ticket**: folio + datos del taller (configuración inicial) + cliente, vehículo, placas, kilometraje, servicios, refacciones, mano de obra, subtotal, total, método de pago, estado del pago y fecha (CA-4).
- **Indicadores del panel**: conteos de órdenes por estado; citas de hoy y próximas; mantenimientos vencidos y próximos (cálculo del Sprint 3); refacciones con `stock <= min_stock`; dinero cobrado del día y acumulado (sumas de pagos `COMPLETED`) (D7, FR-014/FR-015).

## Relaciones con entidades existentes

| Relación | Detalle |
|----------|---------|
| `payments.order_id → service_orders` | N pagos por orden (FR-002) |
| `tickets.order_id → service_orders` | 1 ticket por orden (unicidad) |
| Panel → `service_orders`, `appointments`, `maintenance_plans`, `parts`, `payments` | Solo lectura agregada, sin copias (CA-6) |

## Validaciones (servidor, RN-15)

- Registrar pago: orden existente y no cancelada; método en el catálogo; importe > 0 y no mayor que el saldo pendiente salvo tolerancia de centavos; rol recepción o administración (FR-005).
- Cobro digital: rol recepción o administración; solo sobre órdenes no canceladas; un cobro `PENDING` vigente por orden a la vez (evita enlaces múltiples simultáneos).
- Verificar cobro: el pago debe existir, ser `MERCADO_PAGO` y estar `PENDING`.
- Ticket: orden existente, no cancelada; rol recepción o administración (FR-013).
- Panel: solo administración (FR-016).

## Semilla del Sprint 4 (`007_demo_payments_tickets.sql`)

Idempotente (IDs fijos + `ON DUPLICATE KEY UPDATE`), con datos de ejemplo sobre las órdenes de los seeds previos: pagos manuales completados (incluido uno que liquida su orden), un cobro digital de ejemplo (completado), un ticket emitido y al menos un pago pendiente/expirado para que el panel y el listado muestren todos los estados (FR-021, CA-8 del insumo).
