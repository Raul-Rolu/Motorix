# Investigación técnica: Historial, mantenimiento e inventario

**Fecha**: 2026-10-11 | **Feature**: `003-historial-inventario` | **Plan**: [plan.md](./plan.md)

Todos los puntos sin clarificar del contexto técnico quedan resueltos aquí. Las decisiones de negocio ya vinieron resueltas del spec (sesión de aclaraciones 2026-10-11); esta investigación traduce esas decisiones a diseño técnico.

## D1 — Modelo del historial de servicios

**Decisión**: El historial se materializa como una consulta (vista lógica) sobre `service_orders` filtrando `status IN ('TERMINADO','ENTREGADO')`, con JOIN a `clients`, `vehicles` y `users` (mecánico), ordenado por `created_at` descendente por defecto.

**Razón**: RN-10 prohíbe duplicar la información del servicio; la tabla ya contiene todo lo necesario (fecha de creación, `mileage_entry`, `reason`, `notes`, totales y entradas). No hay datos derivados costosos de calcular.

**Alternativas consideradas**:
- Tabla `maintenance_history` poblada al cambiar de estado: descartada porque duplica datos y abre divergencias (RN-10) sin beneficio de rendimiento a escala de taller local.
- Triggers que copian la orden al historial: descartados por lógica invisible al servidor y difícil de probar con Jest.

## D2 — Entidad y vencimiento de mantenimientos

**Decisión**: Tabla `maintenance_plans` con estado almacenado `PENDING | COMPLETED | CANCELLED`. El carácter de "vencido" **no se almacena**: se deriva en la consulta como `PENDING` y (`target_date <= CURDATE()` o `target_mileage <= kilometrajeActual`), donde el kilometraje actual es `MAX(mileage_entry)` del vehículo.

**Razón**: Con la regla "primero de los dos umbrales que se cumpla" (FR-006) y el cumplimiento manual (aclaración Q1), un estado "OVERDUE" almacenado requeriría un proceso programado o recalculado en cada escritura; derivarlo elimina ese mecanismo y garantiza que la consulta sea siempre correcta.

**Alternativas consideradas**:
- Estado `OVERDUE` almacenado con job nocturno: descartado por complejidad operativa (proceso extra) y riesgo de estado obsoleto entre ejecuciones.
- Recalcular el estado al consultar el vehículo: descartado como mecanismo único porque la lista global de vencidos/próximos de recepción (FR-007) necesita el cálculo en una sola consulta por todos los vehículos.

## D3 — Catálogo de movimientos de inventario

**Decisión**: `inventory_movements.movement_type ENUM('IN','OUT','ADJUSTMENT')`. Para `IN` y `OUT` la `quantity` siempre es positiva y la dirección la fija el tipo. Para `ADJUSTMENT` la `quantity` lleva signo: positiva suma, negativa resta. Todo movimiento exige `reason` y registra `created_by` y `created_at`; los generados por una orden añaden `order_id`.

**Razón**: Coincide con el catálogo aclarado (Q2 de spec): ENTRADA = administración/reposición, SALIDA = uso en orden (RN-6), AJUSTE = solo administración con motivo obligatorio. El signo en el ajuste evita una tercera columna y modela directamente la corrección de conteo (puede subir o bajar stock, pero nunca dejarlo negativo: FR-012).

**Alternativas consideradas**:
- Dos columnas `quantity` y `delta`: descartada por redundancia.
- Tipos separados INCREASE/DECREASE además de ADJUSTMENT: descartados porque IN y ADJUSTMENT positivo se solapan.

## D4 — Control atómico de stock (RN-8)

**Decisión**: Toda operación que modifica stock (alta de refacción con cantidad inicial, `IN`, `OUT`, `ADJUSTMENT`, uso/retiro en orden) corre en una transacción MySQL con `SELECT ... FOR UPDATE` sobre la fila de `parts` antes de validar `stock + delta >= 0`. Si la validación falla, la transacción se revierte y se devuelve `PART_SIN_STOCK` (409) con el stock disponible; el movimiento se inserta en la misma transacción que el cambio de stock.

**Razón**: RN-8 (y su política uniforme decidida en Q3 del spec) exige que dos operaciones simultáneas jamás dejen stock negativo; el bloqueo pesimista de fila en InnoDB resuelve la condición de carrera sin procesos adicionales, y la transacción garantiza que stock y movimiento queden consistentes (CA-5, CA-6, FR-018).

**Alternativas consideradas**:
- Actualización condicional `UPDATE parts SET stock = stock - ? WHERE id = ? AND stock >= ?` y verificar filas afectadas: descartada porque no sirve para `ADJUSTMENT` con signo ni para validación de movimiento referenciado.
- Trigger de base de datos que impide stock negativo: descartado porque la regla debe producir un error comprensible en la API y probarse con Jest.

## D5 — Refacciones usadas en una orden

**Decisión**: Tabla `order_parts` (id, order_id, part_id, quantity, created_by, created_at) análoga a `order_labor`. Agregar requiere orden no cerrada (`ENTREGADO`/`CANCELADA` prohíben) y dueño mecánico o admin (FR-11, FR-16). Cada alta genera un movimiento `OUT` con `order_id`. Retirar una línea (`DELETE`) solo en orden abierta: borra la fila física y genera un movimiento `IN` de devolución con `order_id` y motivo; el `OUT` original nunca se borra (trazabilidad). Se permiten varias líneas del mismo part en la orden; cada una tiene su movimiento.

**Razón**: Sigue el patrón de tablas hijas ya existente (`order_services`, `order_labor`); el par salida + entrada de devolución deja el historial de movimientos completo y explica el stock final, cumpliendo FR-010 y el escenario 4 de la US7 sin endpoint de borrado de movimientos.

**Alternativas consideradas**:
- Columna `removed_at` (borrado lógico) en `order_parts`: descartada por simplicidad; el rastro vive en movimientos, que es donde FR-009 exige consistencia del stock.
- Un único movimiento `ADJUSTMENT` de devolución: descartado porque el retiro de una orden es una entrada física, no una corrección de conteo.

## D6 — Baja lógica de refacciones

**Decisión**: `parts.is_active TINYINT(1)`; no existe endpoint de eliminación. La edición por administración puede desactivar una refacción: deja de aparecer en el selector de órdenes y en el alta de usos, pero sigue visible en el inventario (con su estado) y en el historial de movimientos. Las reglas de stock se aplican igual aunque esté inactiva.

**Razón**: FR-010 y el caso límite correspondiente exigen conservar la trazabilidad; la baja lógica es el patrón estándar para catálogos con historial transaccional.

**Alternativas consideradas**:
- Eliminación física con cascada de movimientos: descartada; destruiría la evidencia de las entradas y salidas.

## D7 — Permisos por operación (RN-15, FR-016)

**Decisión**: matriz validada en el servidor con `require-role`:

| Operación | ADMIN | RECEPTIONIST | MECHANIC |
|-----------|:-----:|:------------:|:--------:|
| `GET /api/vehicles/:id/history` | ✅ | ✅ | ✅ |
| `GET /api/maintenances` | ✅ | ✅ | ❌ |
| `POST /api/maintenances` | ✅ | ❌ | ✅ |
| `PATCH /api/maintenances/:id/complete` | ✅ | ✅ | ✅ |
| `PATCH /api/maintenances/:id/cancel` | ✅ | ❌ | ❌ |
| `GET /api/parts` | ✅ | ✅ (solo lectura) | ✅ (solo lectura, activas) |
| `POST /api/parts`, `PUT /api/parts/:id` | ✅ | ❌ | ❌ |
| `POST /api/parts/:id/movements` (IN/ADJUSTMENT) | ✅ | ❌ | ❌ |
| `GET /api/parts/:id/movements` | ✅ | ❌ | ❌ |
| `POST /api/orders/:id/parts`, `DELETE .../parts/:partId` | ✅ | ❌ | ✅ (solo dueño de la orden) |

**Razón**: Historial es consulta del personal del taller (escenario 4 de la US1); la lista de próximos es de recepción/administración (US4); registro de mantenimiento lo hace el mecánico en la atención (US3) o admin; cancelar es solo administración (Q4 del spec). El mecánico necesita listar refacciones activas para agregarlas a sus órdenes (US7), pero no tocar stock.

**Alternativas consideradas**: ocultar `GET /api/parts` al mecánico: descartado porque sin catálogo no puede armar la partida de refacciones de su orden.

## D8 — Errores nuevos del catálogo

**Decisión**: ampliar `server/utils/errors.js` con: `PART_NOT_FOUND` (404), `PART_INACTIVE` (409), `PART_SIN_STOCK` (409, mensaje con el stock disponible), `MOVEMENT_INVALID` (422, p. ej. AJUSTE que dejaría stock negativo o cantidad 0), `MAINTENANCE_NOT_FOUND` (404), `MAINTENANCE_NOT_MODIFIABLE` (409, estado distinto de PENDING), `MAINTENANCE_INVALID_THRESHOLD` (422, sin fecha ni kilometraje objetivo), `ORDER_CLOSED` (409, orden ENTREGADO/CANCELADA), `ORDER_PART_NOT_FOUND` (404), `FORBIDDEN_ORDER` (403, orden de otro mecánico).

**Razón**: sigue el patrón de `CITA_NO_MODIFICABLE` del Sprint 2: cada rechazo de negocio tiene código estable, mensaje en español y detalle útil (p. ej. el stock disponible al fallar RN-8), lo que alimenta los tests de contrato.

## D9 — Semántica de "vencido" en la consulta de próximos (FR-007)

**Decisión**: una sola consulta ordenada por prioridad: 1) vencidos (`PENDING` y algún umbral alcanzado), 2) pendientes por umbral más cercano. Para ordenar los pendientes se calcula la "proximidad" con el umbral disponible: si tiene kilometraje, `target_mileage - kmActual`; si tiene fecha, `target_date - CURDATE()`; si ambos, el menor de los dos. Devolviendo `isOverdue` y `daysLeft`/`kmLeft` por registro, la UI pinta advertencia (ámbar) o rojo según el design system sin recálculos.

**Razón**: Responde directamente el Q5 del spec (sin ventana fija) y hace trivial el SC-003: la lista ya viene en orden de urgencia.

**Alternativas consideradas**: calcular la proximidad en el cliente: descartado porque duplica la regla de negocio y el kilometraje actual solo lo tiene el servidor.

## D10 — Semillas y limpieza de pruebas

**Decisión**: seeds `005_demo_parts.sql` y `006_demo_maintenances.sql` idempotentes (`INSERT ... ON DUPLICATE KEY UPDATE` sobre `code` y por clave natural), apoyados en clientes/vehículos/usuarios y órdenes existentes de los seeds 001–004; incluyen refacciones por encima y por debajo del mínimo (para CA-7), al menos un mantenimiento vencido y uno futuro por fecha y otro por kilometraje. `db-test.js` amplía la limpieza a `order_parts`, `inventory_movements`, `maintenance_plans` y `parts` (respetando los órdenes de FK).

**Razón**: FR-017 exige datos poblados sin duplicados al re-ejecutar; CA-8 exige que las suites nuevas corran limpias contra `motorix_test`.

**Alternativas consideradas**: seeds por script Node: descartados; el proyecto ya estandarizó seeds SQL idempotentes en los sprints anteriores.
