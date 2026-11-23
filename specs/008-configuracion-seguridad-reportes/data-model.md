# Modelo de datos: Configuración, seguridad y reportes

**Feature**: `008-configuracion-seguridad-reportes` | **Fecha**: 2026-11-23 | **Plan**: [plan.md](./plan.md) | **Decisiones**: [research.md](./research.md)

Todos los cambios son migraciones aditivas desde la `019` (no se editan 001–018). **P1** = 019, 020 y 021; **P2** = 022 y 023; **P3** no agrega tablas ni columnas (los reportes se calculan al consultar, RN-10). Todas las tablas son InnoDB, `utf8mb4` y `utf8mb4_unicode_ci`, con llaves foráneas.

## 1. `settings` (nueva, P1) — migración `019_create_settings.sql`

| Columna | Tipo | Null | Regla |
|---|---|---|---|
| `setting_key` | `VARCHAR(50)` | No | Clave primaria. |
| `setting_value` | `VARCHAR(255)` | No | Valor como texto; el servicio lo convierte según la clave. |
| `updated_by` | `INT UNSIGNED` | Sí | FK → `users(id)`. Último usuario que la cambió. |
| `updated_at` | `DATETIME` | No | `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`. |

**Claves, valores de respaldo y límites** (`server/utils/settings-defaults.js`):

| Clave | Respaldo | Límite | Usada por |
|---|---|---|---|
| `shop.name` | `Motorix` | 1–100 caracteres, obligatorio | Ticket (instantánea) |
| `shop.address` | `Av. Taller 123, Col. Centro` | 0–150 caracteres | Ticket |
| `shop.phone` | `555-000-0000` | 0–30; solo dígitos, espacios y `+ - ( )` | Ticket |
| `maintenance.margin_days` | `30` | entero 1–365 | Centro de notificaciones y clientes por avisar |
| `maintenance.margin_km` | `1000` | entero 100–50,000 | Ídem |
| `orders.stalled_days` | `3` | entero 1–90 | Orden detenida |
| `session.inactivity_minutes` | `30` | entero 5–120 | Vigencia del token e inactividad del cliente |

**Reglas**: si falta una clave o su valor guardado es inválido, se usa el respaldo (nunca falla el servidor). Los seeds insertan las claves con `ON DUPLICATE KEY UPDATE setting_key = setting_key` (no sobrescriben lo que el administrador cambió). La API de ajustes solo expone estas claves; no hay claves libres.

## 2. `service_types` (nueva, P1) — migración `020_create_service_types.sql`

| Columna | Tipo | Null | Regla |
|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | No | Clave primaria. |
| `name` | `VARCHAR(80)` | No | **Único** (la colación hace la comparación sin distinguir mayúsculas). |
| `interval_days` | `INT UNSIGNED` | Sí | Intervalo en días, 1–3,650. |
| `interval_km` | `INT UNSIGNED` | Sí | Intervalo en kilómetros, 1–500,000. |
| `active` | `TINYINT(1)` | No | `DEFAULT 1`. Desactivar no borra. |
| `created_at` / `updated_at` | `DATETIME` | No | Marcas de tiempo estándar. |

- `CHECK (interval_days IS NOT NULL OR interval_km IS NOT NULL)` y `CHECK` de valores positivos (RN-12: al menos un intervalo, sin valores universales).
- **No hay borrado**: ni ruta `DELETE` ni `ON DELETE CASCADE`; un tipo usado nunca se elimina.

### 2.1 `order_services` (se amplía, misma migración 020)

| Cambio | Detalle |
|---|---|
| `service_type_id` | `INT UNSIGNED NULL`, FK → `service_types(id)` (sin cascada) e índice `idx_order_services_type`. |

- Las líneas existentes quedan en `NULL` y **no proponen** próximo servicio.
- Solo lo asigna `POST /api/orders/:id/services` en líneas de servicio y con un tipo **activo**; las líneas de mano de obra viven en `order_labor` y no tienen tipo.

## 3. `tickets` (se amplía, P1) — migración `021_tickets_shop_snapshot.sql`

| Columna nueva | Tipo | Null | Regla |
|---|---|---|---|
| `shop_name` | `VARCHAR(100)` | Sí | Nombre del taller al emitir. |
| `shop_address` | `VARCHAR(150)` | Sí | Dirección al emitir. |
| `shop_phone` | `VARCHAR(30)` | Sí | Teléfono al emitir. |

- **Tickets existentes**: las tres columnas quedan en `NULL` **sin relleno** (no se inventa un dato que nunca se capturó); al consultarse usan los datos vigentes y **no** muestran «Próximo servicio» (limitación documentada).
- **Marcador**: `shop_name IS NOT NULL` identifica un ticket con instantánea (el nombre es obligatorio al guardarse).
- Se llenan **solo al emitir** (`emitirSiFalta`); un ticket ya emitido nunca se actualiza. El contenido (importes, líneas, pagos) sigue derivándose al vuelo.

## 4. `audit_log` (nueva, P2) — migración `022_create_audit_log.sql`

| Columna | Tipo | Null | Regla |
|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | No | Clave primaria. |
| `user_id` | `INT UNSIGNED` | Sí | FK → `users(id)`. `NULL` cuando el inicio de sesión fallido no corresponde a una cuenta. |
| `action` | `VARCHAR(40)` | No | Una de las acciones de la tabla siguiente. |
| `entity_type` | `VARCHAR(30)` | No | `USER`, `SETTINGS`, `PART`, `TERMS` o `SESSION`. |
| `entity_id` | `INT UNSIGNED` | Sí | Id de la entidad afectada (si aplica). |
| `detail` | `VARCHAR(255)` | Sí | Texto no reservado armado por una función pura (ver abajo). |
| `created_at` | `DATETIME` | No | `DEFAULT CURRENT_TIMESTAMP`. |

- Índices: `(created_at)`, `(user_id, created_at)` y `(action, created_at)` para los filtros.
- **Solo inserción**: la aplicación solo expone `INSERT` y `SELECT`; no hay `UPDATE` ni `DELETE`. No se purga automáticamente.
- **No contiene** contraseñas, hashes, tokens ni datos de tarjeta, ni el **importe** del precio de compra.

**Acciones y su detalle**:

| Acción | Cuándo | `entity_type` / `entity_id` | `detail` |
|---|---|---|---|
| `LOGIN_FAILED` | Credenciales inválidas, cuenta inexistente o inactiva | `SESSION` / `NULL` | `Identificador: <texto tecleado, máximo 100>` |
| `USER_CREATED` | Alta de usuario | `USER` / id nuevo | `Rol: <rol>` |
| `USER_DEACTIVATED` / `USER_REACTIVATED` | Baja o reactivación | `USER` / id | — |
| `USER_ROLE_CHANGED` | Edición que cambia el rol | `USER` / id | `Rol: <anterior> → <nuevo>` |
| `SETTINGS_UPDATED` | Guardado de ajustes | `SETTINGS` / `NULL` | `Claves: <lista de claves cambiadas>` |
| `PART_SALE_PRICE_CHANGED` | Cambia el precio de venta de una refacción | `PART` / id | `Precio de venta: <anterior> → <nuevo>` |
| `PART_PURCHASE_PRICE_CHANGED` | Cambia el precio de compra | `PART` / id | `Precio de compra modificado` (**sin importes**) |
| `TERMS_PUBLISHED` | Se publica una versión de términos | `TERMS` / id de la versión | `Versión <n>` |

El usuario autor de la acción se guarda en `user_id` (en `LOGIN_FAILED`, el de la cuenta si existe). Un cambio de ajustes que no modifica ningún valor no genera entrada.

## 5. `terms_versions` y `terms_acceptances` (nuevas, P2) — migración `023_create_terms.sql`

### 5.1 `terms_versions`

| Columna | Tipo | Null | Regla |
|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | No | Clave primaria. |
| `version` | `INT UNSIGNED` | No | **Única**; la asigna el servidor (máximo + 1). La versión vigente es la de mayor número. |
| `terms_text` | `TEXT` | No | Términos y condiciones (20–20,000 caracteres). |
| `privacy_text` | `TEXT` | No | Aviso de privacidad (20–20,000 caracteres). |
| `published_by` | `INT UNSIGNED` | Sí | FK → `users(id)`. `NULL` en la versión sembrada. |
| `published_at` | `DATETIME` | No | `DEFAULT CURRENT_TIMESTAMP`. |

### 5.2 `terms_acceptances`

| Columna | Tipo | Null | Regla |
|---|---|---|---|
| `id` | `INT UNSIGNED AUTO_INCREMENT` | No | Clave primaria. |
| `user_id` | `INT UNSIGNED` | No | FK → `users(id)`. |
| `terms_version_id` | `INT UNSIGNED` | No | FK → `terms_versions(id)`. |
| `accepted_at` | `DATETIME` | No | `DEFAULT CURRENT_TIMESTAMP`. |

- `UNIQUE (user_id, terms_version_id)`: una aceptación por usuario y versión (idempotente, seguro ante concurrencia).
- **Compuerta**: con una versión vigente, un usuario sin fila en `terms_acceptances` para esa versión recibe `403 TERMS_NOT_ACCEPTED` en toda ruta protegida con `auth` (excepto las de `authBase`). **Sin versión publicada no hay compuerta.**
- Las versiones y aceptaciones **no se editan ni borran** desde la aplicación.

## 6. Reglas de cálculo de reportes (P3, sin tablas)

Rango: `desde` y `hasta` inclusivos en hora local del servidor, o `periodo=MES_ACTUAL|MES_ANTERIOR`; máximo 366 días. «Órdenes cerradas del periodo» = `service_orders` con `status IN ('TERMINADO','ENTREGADO')` y `status_changed_at` dentro del rango; las canceladas nunca cuentan.

| Reporte | Fuente | Regla |
|---|---|---|
| `income` | `payments` | `status = 'COMPLETED'` y `created_at` en el rango; total, por día (rango ≤ 62 días) o por mes, y por método; centavos enteros. Mismo criterio del panel de control. |
| `services` | `order_services` de las órdenes cerradas del periodo + `service_types` | Agrupado por tipo (las líneas sin tipo, «Sin tipo»); cantidad e importe; orden por cantidad descendente. |
| `productivity` | Órdenes cerradas del periodo + `order_labor` + `users` | Por mecánico: número de órdenes e importe de mano de obra; sin mecánico, «Sin asignar». |
| `parts` | `order_parts` de las órdenes cerradas del periodo + `parts` | Por línea: cantidad, precio de venta congelado (`unit_price`), precio de compra **vigente** y margen = (venta − compra) × cantidad. Líneas sin precio de compra: «sin costo» (fuera del margen, con su conteo). Líneas sin precio de venta: «sin precio». Totales de ventas, costo y margen **solo** de líneas completas. |
| `rotation` | `inventory_movements` (`OUT`) + `parts` | Por refacción activa: unidades `OUT` del rango ÷ existencia actual; existencia 0 → «sin existencia». |

- Los importes se suman en **centavos enteros** (`aCentavos`) y se convierten a pesos solo al presentar.
- El precio de compra solo se muestra en `parts`; el reporte es exclusivo de ADMIN.
- La exportación CSV reutiliza exactamente la estructura de la consulta (mismas filas y totales).

## 7. Resumen de cambios por bloque

| Bloque | Migraciones | Tablas/columnas | Seeds |
|---|---|---|---|
| P1 | 019, 020, 021 | `settings`, `service_types`, `order_services.service_type_id`, `tickets.shop_*` | 010 |
| P2 | 022, 023 | `audit_log`, `terms_versions`, `terms_acceptances` | 011 |
| P3 | (024 condicional de índices) | — | 012 |
