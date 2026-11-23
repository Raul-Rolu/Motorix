# Modelo de datos: Notificaciones internas y clientes por avisar

**Feature**: `007-notificaciones-internas` | **Fecha**: 2026-11-22 | **Plan**: [plan.md](./plan.md) | **Decisiones**: [research.md](./research.md)

Todos los cambios viven en la migración aditiva `database/migrations/018_notifications_status_changed.sql`. No se editan las migraciones 001–017 ni tablas ajenas al alcance (solo se agrega una columna a `service_orders`). Los avisos **no tienen tabla**: se derivan al consultar (RN-10).

## 1. `service_orders` (se amplía)

| Cambio | Detalle |
|---|---|
| `status_changed_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`. Fecha del **último cambio de estado** de la orden. |
| `idx_orders_status_changed` | `INDEX (status, status_changed_at)` para la consulta de órdenes detenidas. |

**Reglas**:

- Se actualiza **solo** en `orderModel.setStatus` (avance, pausa/reanudación de `ESPERANDO_REFACCION` y cancelación), en la misma sentencia que cambia `status` (D2).
- Una orden nueva la inicia con su `DEFAULT` (= fecha de creación); `orderModel.create` no cambia.
- Editar motivo, notas, kilometraje o asignar mecánico **no** la modifica.
- No se expone en ninguna respuesta existente.

**Relleno de las órdenes existentes (en la misma migración)**:

```sql
-- updated_at = updated_at es obligatorio: sin él, ON UPDATE CURRENT_TIMESTAMP
-- movería la última modificación de todas las órdenes a «ahora».
UPDATE service_orders SET status_changed_at = updated_at, updated_at = updated_at;
```

## 2. `notification_reads` (nueva)

Lectura de avisos por usuario: el único estado que se guarda de un aviso.

| Columna | Tipo | Null | Regla |
|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | No | Clave primaria. |
| `user_id` | `INT UNSIGNED` | No | FK → `users(id)`. Usuario que marcó el aviso. |
| `notification_key` | `VARCHAR(80)` | No | Identidad del aviso: `TIPO:ID:ESTADO` (sección 4). |
| `read_at` | `DATETIME` | No | `DEFAULT CURRENT_TIMESTAMP`. |

- `UNIQUE KEY uq_notification_read (user_id, notification_key)`: una lectura por usuario y aviso; garantiza idempotencia y seguridad ante concurrencia.
- `CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users (id)`.
- No hay `ON DELETE CASCADE`: los usuarios no se eliminan (se desactivan, RN de usuarios del Sprint 1).
- Las filas de avisos que dejan de aplicar **no se borran** (si la condición vuelve con el mismo estado sigue leído).

## 3. `client_notices` (nueva)

Registro de que alguien avisó a un cliente por un hecho concreto.

| Columna | Tipo | Null | Regla |
|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | No | Clave primaria. |
| `client_id` | `INT UNSIGNED` | No | FK → `clients(id)`. Cliente avisado. |
| `notice_type` | `ENUM('ORDEN_TERMINADA','CITA_MANANA','MANTENIMIENTO')` | No | Tipo de hecho. |
| `fact_id` | `INT UNSIGNED` | No | Id del hecho: orden, cita o plan de mantenimiento según `notice_type`. **Sin FK** (referencia polimórfica); el servicio valida que el hecho exista y esté pendiente. |
| `note` | `VARCHAR(255)` | Sí | Nota opcional («no contestó»). |
| `notified_by` | `INT UNSIGNED` | No | FK → `users(id)`. Quién avisó. |
| `notified_at` | `DATETIME` | No | `DEFAULT CURRENT_TIMESTAMP`. Cuándo. |

- `UNIQUE KEY uq_client_notice_fact (notice_type, fact_id)`: un hecho se avisa **una sola vez**; resuelve la concurrencia.
- `INDEX idx_client_notices_client (client_id)`.
- `FOREIGN KEY fk_client_notices_client (client_id) → clients(id)` y `fk_client_notices_user (notified_by) → users(id)`.
- El `fact_id` de un mantenimiento es el id del plan, **sin** el estado: un mantenimiento avisado como próximo que pasa a vencido es el mismo hecho; un mantenimiento nuevo es otro `fact_id` y aparece de nuevo.

## 4. Claves de aviso (identidad para la lectura)

Formato `TIPO:ID:ESTADO` (≤ 80 caracteres). Si el estado cambia, la clave cambia y el aviso vuelve como no leído (CA-6).

| Clave | Grupo del panel | Condición (sección 5) |
|---|---|---|
| `MANTENIMIENTO:<id>:VENCIDO` | Mantenimientos vencidos | `esVencido` |
| `MANTENIMIENTO:<id>:PROXIMO` | Mantenimientos próximos | `esProximo` y no vencido |
| `CITA:<id>:HOY` | Citas de hoy | cita `PROGRAMADA` con fecha de hoy |
| `STOCK:<id>:BAJO` | Stock bajo o agotado | `0 < stock ≤ min_stock`, refacción activa |
| `STOCK:<id>:AGOTADO` | Stock bajo o agotado | `stock = 0`, refacción activa |
| `ORDEN:<id>:DETENIDA` | Órdenes detenidas | estado activo y `status_changed_at` de hace más de 3 días |

## 5. Reglas de cálculo por tipo (reutilización de lo existente)

| Tipo | Fuente | Regla reutilizada o nueva |
|---|---|---|
| Mantenimiento vencido | `maintenance_plans` `PENDING` + kilometraje actual (`findCurrentMileageByVehicles`) | **Reutiliza** `esVencido` de `maintenance-state.js` (RN-11, sin cambios): coincide con el panel y la lista de Mantenimientos |
| Mantenimiento próximo | igual | **Nueva** `esProximo(m, kmActual, hoy)` en `maintenance-state.js`: pendiente no vencido con `diasRestantes ≤ MARGEN_PROXIMO_DIAS (30)` **o** `kmRestantes ≤ MARGEN_PROXIMO_KM (1000)`; solo se evalúan los umbrales que existan (D4) |
| Cita del día | `appointments` | `appointment_date = hoy` y `status = 'PROGRAMADA'` (no canceladas ni completadas) |
| Stock bajo o agotado | `parts` | **Reutiliza** `CONDICION_STOCK_EN_ALERTA` (`is_active = 1 AND stock <= min_stock`), compartida con el panel; `stock = 0` es agotado |
| Orden detenida | `service_orders` | `status IN ('RECIBIDO','DIAGNOSTICO','EN_REPARACION','ESPERANDO_REFACCION')` y `status_changed_at < NOW() - INTERVAL 3 DAY` (`DIAS_ORDEN_DETENIDA = 3`) |

## 6. Visibilidad por rol (validada en backend)

| Grupo de aviso | ADMIN | RECEPTIONIST | MECHANIC |
|---|---|---|---|
| Mantenimientos vencidos | ✔ | ✔ | ✘ |
| Mantenimientos próximos | ✔ | ✔ | ✘ |
| Citas de hoy | ✔ | ✔ | ✘ |
| Stock bajo o agotado | ✔ | ✘ (ni se calcula) | ✘ |
| Órdenes detenidas | ✔ todas | ✔ todas | ✔ solo `mechanic_id` = su id |
| Clientes por avisar (lista y marcar) | ✔ | ✔ | ✘ (`403`) |

## 7. Lista de clientes por avisar (derivada)

Cada fila es un hecho `(tipo, id)` que **no** existe aún en `client_notices`:

| Motivo (`tipo`) | Hecho | Cliente |
|---|---|---|
| `ORDEN_TERMINADA` | orden `TERMINADO` (no `ENTREGADO`) | cliente de la orden |
| `CITA_MANANA` | cita `PROGRAMADA` con fecha de mañana | cliente de la cita |
| `MANTENIMIENTO` | plan `PENDING` vencido o próximo | cliente propietario del vehículo del plan |

Datos mostrados: cliente (`clients.full_name`), teléfono (`clients.phone`), vehículo (placas, marca y modelo) y motivo. Al marcar como avisado el hecho sale de la lista y no vuelve por el mismo `(tipo, id)`; si la orden pasa a `ENTREGADO`, la cita se completa/cancela o el mantenimiento deja de ser vencido/próximo (se completa o cancela), el motivo desaparece por sí solo.

## 8. Efecto en datos existentes y compatibilidad

- **Datos existentes**: ninguna fila existente se borra ni cambia de valor, salvo el relleno de `status_changed_at` (columna nueva). `updated_at` de las órdenes se conserva exactamente.
- **Órdenes activas antiguas**: tras migrar, toda orden activa con `updated_at` de hace más de 3 días aparece como detenida (comportamiento esperado).
- **Pruebas existentes**: ninguna consulta ni respuesta existente cambia; las suites previas siguen en verde sin editarse.
- **Datos de ejemplo** (D13): ajuste del seed 004 (solo `status_changed_at` en filas nuevas) y seed nuevo `009_demo_notifications.sql` (orden 6 `TERMINADO`, mantenimiento 6 próximo y ajuste guardado de la orden 3); sin filas en `notification_reads` ni `client_notices`.
