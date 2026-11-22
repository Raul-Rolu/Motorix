# Data Model: Categoría, marca, precio de compra y cobro consistente

**Feature**: `006-complemento-precios-compra` | **Fecha**: 2026-11-21 | **Plan**: [plan.md](./plan.md) | **Decisiones**: [research.md](./research.md)

Todos los cambios viven en la migración aditiva `database/migrations/017_part_purchase_price_stale.sql`. No se editan migraciones 001–016 ni tablas ajenas al alcance.

## 1. `parts` (se amplía)

| Columna | Tipo | Null | Regla |
|---|---|---|---|
| `category` | `ENUM('FRENOS','MOTOR','SUSPENSION','ELECTRICO','TRANSMISION','CLIMA','NEUMATICOS','LUBRICANTES','OTRO')` | Sí | Lista fija del sistema, no administrable; `NULL` = sin clasificar (opcional). Valores en español en la interfaz: Frenos, Motor, Suspensión, Eléctrico, Transmisión, Clima, Neumáticos, Lubricantes, Otro (D3). |
| `brand` | `VARCHAR(50)` | Sí | Texto libre, máximo 50 caracteres, opcional (sección 9, decisión acordada). |
| `purchase_price` | `DECIMAL(10,2)` | Sí | `NULL` = pendiente de captura (no bloquea el uso en órdenes). `CHECK (purchase_price >= 0 AND purchase_price <= 999999.99)`. Dato financiero exclusivo de ADMIN (no participa en el cobro). |
| `sale_price` (016) | `DECIMAL(10,2)` | Sí | Sin cambios estructurales; se agrega `CHECK (sale_price <= 999999.99)` como refuerzo del límite CA-2. |

**Validación (backend, `part-validator.js`)**: los **tres** precios (venta, compra y, por proxy, cualquier importe capturado) deben ser numéricos, no negativos, con hasta 2 decimales y ≤ 999,999.99; `category` debe pertenecer al catálogo; `brand` ≤ 50 caracteres. Errores → `400 DATOS_INVALIDOS` con mensajes en español.

**Visibilidad**: `GET /api/parts` devuelve `category` y `brand` a los tres roles; `purchasePrice` **solo si `role === 'ADMIN'`** (D4: `part.aObjeto` omite `purchasePrice` por defecto y solo lo incluye cuando el servicio lo pide de forma explícita para ADMIN, así ninguna otra consulta puede filtrarlo por omisión).

**Relaciones**: sin cambios (`order_parts.part_id`, `inventory_movements.part_id`).

## 2. `payments` (se amplía)

| Cambio | Detalle |
|---|---|
| `status` | `ENUM('PENDING','COMPLETED','EXPIRED','STALE')` — `STALE` agregado **al final** de la lista (aditivo, sin reescritura de filas). `STALE` = cobro de Mercado Pago desfasado: su importe ya no coincide con el **saldo pendiente** vigente de la orden (total − pagos `COMPLETED`). |

### Máquina de estados (se amplía)

```text
                    ┌──────────────→ EXPIRED (caducidad > 24 h, perezoso)
                    │
nace ──→ PENDING ───┼──────────────→ COMPLETED (verificar: importe SÍ coincide con el saldo)
 (digital MP)       │
                    └──────────────→ STALE (el importe ya no coincide con el saldo pendiente:
                                         cambió el total o se registraron pagos confirmados)
                                         │
                                         └── terminal: sin salida; no se edita ni se confirma;
                                             no cuenta como pago vigente; se permite crear
                                             un nuevo cobro PENDING por el saldo vigente
```

- Transiciones **solo desde `PENDING`** (conserva `transitionFromPending`, de una sola vez; los reintentos no duplican importes).
- Pagos manuales (`CASH/CARD/TRANSFER`) nacen `COMPLETED` y nunca pasan por `STALE`.
- Inmutabilidad intacta: `STALE` es transición de estado; **el `amount` jamás se modifica**.

### Reglas derivadas (sin cambios de consulta)

- **Saldo pendiente** = total − `SUM(amount) WHERE status='COMPLETED'` → `STALE` no descuenta (decisión Q1).
- **Un solo pago vigente** = `status='PENDING' AND method='MERCADO_PAGO'` → `STALE` no bloquea un nuevo cobro.
- **Detección perezosa** del desfase en `listar` y `verificarCobro` (D6; **no** en `crearCobroDigital` ni en el panel): `UPDATE … SET status='STALE' WHERE order_id=? AND status='PENDING' AND method='MERCADO_PAGO' AND amount <> <saldo pendiente con 2 decimales>`. La regla compara contra el **saldo** (total − pagos `COMPLETED`), no contra el total, para no marcar `STALE` un cobro correcto con pagos parciales previos (total $2,000 − pago $800 → cobro $1,200 = saldo ⇒ sigue `PENDING`).

## 3. `order_services`, `order_labor` y `order_entries` (idempotencia por IDs fijos, H-14)

- **Sin cambios de esquema**: la migración 017 no toca estas tablas — sin limpieza de duplicados ni llaves únicas (decisión acordada) — y `order_entries` sigue siendo historial inmutable.
- **Idempotencia en el seed 004 (D2)**: cada fila lleva `id` explícito (`order_services` 1–4, `order_labor` 1–2, `order_entries` 1–5); la segunda corrida dispara `ON DUPLICATE KEY UPDATE` por la clave primaria y reutiliza las filas sin crear nuevas.
- Consecuencia aceptada: dos líneas idénticas (misma orden, descripción e importe) **sí pueden coexistir**; no existe el error `ORDER_LINE_DUPLICATE`. En bases ya contaminadas por el defecto H-14 las duplicaciones previas se conservan (sin borrado).

## 4. Catálogo de categorías (valor de referencia)

| Identificador | Etiqueta en interfaz |
|---|---|
| `FRENOS` | Frenos |
| `MOTOR` | Motor |
| `SUSPENSION` | Suspensión |
| `ELECTRICO` | Eléctrico |
| `TRANSMISION` | Transmisión |
| `CLIMA` | Clima |
| `NEUMATICOS` | Neumáticos |
| `LUBRICANTES` | Lubricantes |
| `OTRO` | Otro |

Asignación en los seeds: filtro de aceite → `LUBRICANTES`; pastillas → `FRENOS`; aceite 5W30 → `LUBRICANTES`; bujía → `ELECTRICO`; correa → `MOTOR`; filtro de aire → `MOTOR`; batería → `ELECTRICO` (con marca y precio de compra).

## 5. Entidades lógicas afectadas (sin cambiar de forma)

- **Refacción**: + `category`, `brand`, `purchasePrice` (ADMIN); `salePrice` y stock con sus reglas 005/003 intactas.
- **Pago**: + estado `STALE` en la presentación (`estado`); importe inmutable; saldo y vigencia derivados por estado.
- **Orden de servicio**: totales, saldos y líneas se calculan en **centavos enteros** (`server/utils/money.js`, D5) y se presentan con 2 decimales; topes: precio ≤ 999,999.99, total ≤ 99,999,999.99 (`422 ORDER_TOTAL_LIMIT_EXCEEDED`).
- **Servicio/mano de obra/entrada de ejemplo**: filas con `id` fijo asignado por el seed 004 (sin llave única; dos líneas idénticas pueden coexistir).

## 6. Reglas de validación y topes (resumen)

| Dato | Regla | Error |
|---|---|---|
| `salePrice`, `purchasePrice` | numérico, ≥ 0, ≤ 2 decimales, ≤ 999,999.99 | `400 DATOS_INVALIDOS` |
| `category` | en el catálogo fijo o `null` | `400 DATOS_INVALIDOS` |
| `brand` | ≤ 50 caracteres o `null` | `400 DATOS_INVALIDOS` |
| importe de partida (servicio/mano de obra) | numérico, ≥ 0, ≤ 2 decimales | `400 DATOS_INVALIDOS` |
| total de orden resultante | ≤ 99,999,999.99 (en centavos) | `422 ORDER_TOTAL_LIMIT_EXCEEDED` |
| cobro `PENDING` con importe ≠ saldo pendiente | pasa a `STALE` al listar/verificar; nunca confirma | `409 PAYMENT_NOT_MODIFIABLE` al intentar confirmarlo después (ya no está en `PENDING`) |
| escritura de `category`/`brand`/`purchasePrice` por rol | solo ADMIN | `403 NO_AUTORIZADO` |
| lectura de `purchasePrice` por rol | solo ADMIN recibe el campo | (se omite en la respuesta) |

## 7. Datos de ejemplo (seeds)

| Seed | Cambio |
|---|---|
| `004_demo_service_orders.sql` | IDs fijos explícitos en las tres tablas de líneas (`order_services` 1–4, `order_labor` 1–2, `order_entries` 1–5) para que su `ON DUPLICATE KEY UPDATE` reutilice filas (H-14, D2); sin llaves únicas ni borrados. |
| `005_demo_parts.sql` | `parts` con `category`, `brand` y `purchase_price` (la rama `ON DUPLICATE KEY UPDATE` los fija, sin `stock`); crea la batería (ID 7, `sale_price` NULL) y concentra los usos congelados de la orden 2 (`order_parts` 1–2) y sus movimientos (`OUT` 8–9, `IN` 10) con el stock absoluto final (11 / 34 / 5). |
| `008_demo_part_prices.sql` | **Solo precios, categoría y marca**: `sale_price` (NULL en la batería), `purchase_price`, `category` y `brand` de las 7 refacciones; sin `stock` en la rama `ON DUPLICATE` y sin usos ni movimientos (viven en el 005). Precio de compra menor que el de venta para no disparar la advertencia en la demo. |

Ningún seed borra filas ajenas, toca el stock existente ni depende del estado previo (valores absolutos, IDs fijos): la segunda corrida no duplica ni reinicia datos de trabajo — incluido el stock — (CA-8), y la batería conserva `sale_price = NULL` a propósito (demo de pendiente de precio).
