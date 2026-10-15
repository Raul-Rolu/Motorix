# Modelo de datos: Historial, mantenimiento e inventario

**Fecha**: 2026-10-11 | **Feature**: `003-historial-inventario` | **Plan**: [plan.md](./plan.md)

Tablas nuevas (migraciones 010–013) sobre el esquema existente de MySQL local InnoDB/utf8mb4. Se reutilizan sin cambios `clients`, `vehicles`, `users`, `service_orders`, `order_entries`, `order_services` y `order_labor` de los sprints 1 y 2.

## Entidades nuevas

### 1. `parts` — Refacciones (FR-008, FR-010, US5/US6/US8)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | INT UNSIGNED PK AUTO_INCREMENT | |
| `name` | VARCHAR(100) NOT NULL | obligatorio |
| `code` | VARCHAR(50) NOT NULL | único (`UNIQUE KEY`); error `PART_DUPLICATE` (409) |
| `stock` | INT UNSIGNED NOT NULL DEFAULT 0 | nunca negativo (RN-8); siempre igual al acumulado de `inventory_movements` (FR-009) |
| `min_stock` | INT UNSIGNED NOT NULL DEFAULT 0 | umbral de alerta de stock bajo (CA-7) |
| `is_active` | TINYINT(1) NOT NULL DEFAULT 1 | baja lógica: inactiva → no seleccionable en órdenes, historial intacto (FR-010) |
| `created_at` / `updated_at` | DATETIME | patrón del proyecto |

**Validaciones de servicio**: `name`, `code` y `stock` inicial obligatorios; `stock` inicial ≥ 0; edición solo administración (FR-016).

**Relaciones**: `inventory_movements.part_id` (FK, muchos); `order_parts.part_id` (FK, muchos).

### 2. `inventory_movements` — Movimientos de inventario (FR-013, FR-014, RN-6/7/8)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | INT UNSIGNED PK AUTO_INCREMENT | |
| `part_id` | INT UNSIGNED NOT NULL FK → `parts` | |
| `movement_type` | ENUM('IN','OUT','ADJUSTMENT') NOT NULL | IN = entrada/reposición (admin); OUT = uso en orden (RN-6); AJUSTE = corrección solo admin con motivo (FR-014) |
| `quantity` | INT NOT NULL | IN/OUT: siempre > 0; ADJUSTMENT: con signo, distinto de 0; error `MOVEMENT_INVALID` (422) |
| `order_id` | INT UNSIGNED NULL FK → `service_orders` | presente cuando el origen es una orden (uso o devolución) |
| `reason` | VARCHAR(255) NOT NULL | obligatorio en IN y ADJUSTMENT; descriptivo en OUT/devolución |
| `created_by` | INT UNSIGNED NULL FK → `users` | autor del movimiento |
| `created_at` | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**Invariantes**:
- Los movimientos son inmutables: sin endpoint de borrado ni edición (mismo criterio de entradas de órdenes, Sprint 2).
- Para cualquier refacción: `parts.stock = SUM(movimientos con signo)` donde el signo lo da el tipo (IN +, OUT −, ADJUSTMENT con su propio signo) — FR-009, CA-5.
- Regla de consistencia aplicada en la misma transacción que el cambio de stock (`SELECT ... FOR UPDATE`, research D4): ninguna operación deja `stock` negativo (FR-012, RN-8).

**Índice**: `(part_id, created_at)` para el historial de movimientos por refacción.

### 3. `maintenance_plans` — Mantenimientos (FR-004 a FR-007, RN-11/RN-12, US3/US4)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | INT UNSIGNED PK AUTO_INCREMENT | |
| `vehicle_id` | INT UNSIGNED NOT NULL FK → `vehicles` | un vehículo admite varios pendientes simultáneos (aclaración Q2) |
| `description` | VARCHAR(255) NOT NULL | motivo del servicio (qué se debe hacer) |
| `target_date` | DATE NULL | umbral por fecha (RN-11) |
| `target_mileage` | INT UNSIGNED NULL | umbral por kilometraje (RN-11) |
| `status` | ENUM('PENDING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING' | cumplimiento y cancelación son acciones manuales (aclaración Q1) |
| `completed_at` | DATETIME NULL | al completar manualmente |
| `completed_by` | INT UNSIGNED NULL FK → `users` | quién lo cumplió (mecánico o recepción, FR-005) |
| `cancelled_at` | DATETIME NULL | |
| `cancellation_reason` | VARCHAR(255) NULL | obligatorio al cancelar (aclaración Q4) |
| `cancelled_by` | INT UNSIGNED NULL FK → `users` | solo administración (FR-005) |
| `created_by` | INT UNSIGNED NULL FK → `users` | quién lo registró (mecánico o admin, US3) |
| `created_at` / `updated_at` | DATETIME | |

**Reglas**:
- CHECK de tabla: `target_date IS NOT NULL OR target_mileage IS NOT NULL` (al menos un umbral); validación espejo en el validador con error `MAINTENANCE_INVALID_THRESHOLD` (422).
- **"Vencido" es derivado, no un estado**: `PENDING` y (`target_date <= CURDATE()` o `target_mileage <= kmActual`), siendo `kmActual = MAX(service_orders.mileage_entry)` del vehículo (FR-006, research D2). Primero de los dos umbrales que se cumpla.
- Transiciones: `PENDING → COMPLETED` (admin, recepción o mecánico; manual, nunca automático por entrega de orden); `PENDING → CANCELLED` (solo admin, con motivo); desde `COMPLETED`/`CANCELLED` no hay acciones (`MAINTENANCE_NOT_MODIFIABLE`, 409).
- Cancelados no aparecen en los filtros de vencidos ni próximos (FR-005).

**Índices**: `(vehicle_id, status)`, `(status, target_date)`.

### 4. `order_parts` — Refacciones usadas en una orden (FR-011, RN-6/RN-7, US7)

| Campo | Tipo | Reglas |
|-------|------|--------|
| `id` | INT UNSIGNED PK AUTO_INCREMENT | |
| `order_id` | INT UNSIGNED NOT NULL FK → `service_orders` | |
| `part_id` | INT UNSIGNED NOT NULL FK → `parts` | |
| `quantity` | INT UNSIGNED NOT NULL | > 0; error `MOVEMENT_INVALID` (422) |
| `created_by` | INT UNSIGNED NULL FK → `users` | |
| `created_at` | DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP | |

**Reglas de servicio**:
- Alta solo con orden no cerrada (`status NOT IN ('ENTREGADO','CANCELADA')` → si no, `ORDER_CLOSED`, 409); el estado en pausa `ESPERANDO_REFACCION` sí permite agregar (caso límite del spec).
- Mecánico dueño de la orden o admin (`FORBIDDEN_ORDER`, 403).
- Refacción activa (`PART_INACTIVE`, 409) y con stock suficiente (`PART_SIN_STOCK`, 409 con el stock disponible); stock resultante ≥ 0 siempre (CA-6).
- Cada alta genera un movimiento `OUT` con `order_id` y referencia a la línea.
- Retiro (`DELETE`) solo en orden abierta: borra la línea y genera un movimiento `IN` de devolución con `order_id`; el `OUT` original se conserva (trazabilidad, research D5).

**Índice**: `(order_id, part_id)`.

## Entidades derivadas (sin tabla propia)

### Historial de servicios del vehículo (FR-001 a FR-003, RN-10)

Consulta sobre `service_orders` con `status IN ('TERMINADO','ENTREGADO')`, JOIN a `clients`, `vehicles` y `users` (mecánico asignado), ordenada por `created_at` DESC (o ASC según parámetro). Cada fila expone: id de la orden, fecha, `mileage_entry` (kilometraje registrado en ese servicio), `reason` (motivo), `notes`, totales y el último `order_entries` como resumen (research D1). No hay copia de datos: una orden entregada aparece automáticamente sin intervención manual (SC-002).

### Stock bajo (FR-015, CA-7)

Derivado en la consulta de `parts`: `stock <= min_stock` produce la bandera `low_stock` que la UI pinta con color de advertencia/rojo según `docs/design-system.md`.

### Estado del historial de movimientos de una refacción (FR-010)

Lista de `inventory_movements` por `part_id` con su autor, fecha, tipo, cantidad y motivo/referencia a orden; es la fuente de auditoría que reemplaza cualquier borrado de refacciones.

## Relaciones con el esquema existente

```text
clients 1 ─ * vehicles 1 ─ * maintenance_plans
vehicles 1 ─ * service_orders (existente) ─ * order_parts * ─ 1 parts
service_orders 1 ─ * inventory_movements (order_id, opcional)
parts 1 ─ * inventory_movements
users ─ (created_by / completed_by / cancelled_by) en todas las tablas nuevas
```

## Transiciones de estado (resumen)

| Entidad | Transición | Quién | Condición |
|---------|-----------|-------|-----------|
| `maintenance_plans` | PENDING → COMPLETED | ADMIN, RECEPTIONIST, MECHANIC | acción manual explícita (Q1) |
| `maintenance_plans` | PENDING → CANCELLED | solo ADMIN | motivo obligatorio (Q4) |
| `maintenance_plans` | (vencido) | derivado | umbral fecha/km alcanzado mientras PENDING (Q1 spec) |
| `order_parts` | alta | MECHANIC dueño / ADMIN | orden abierta + refacción activa + stock ≥ cantidad |
| `order_parts` | baja (retiro) | MECHANIC dueño / ADMIN | orden abierta; genera entrada de devolución |
| `parts` | activa → inactiva | solo ADMIN | edición con `is_active = 0`; sin borrado físico |
