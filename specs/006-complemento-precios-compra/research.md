# Research: Categoría, marca, precio de compra y cobro consistente

**Feature**: `006-complemento-precios-compra` | **Fecha**: 2026-11-21 | **Plan**: [plan.md](./plan.md)

Investigación basada en el código actual (migraciones 010/013/014/016, `part-validator.js`, `part.js`, `order.js`, `inventory.js`, `payment-service.js`, `payment-gateway.js`, `payment.js`, seeds 004/005/008 y pantallas de inventario) y en la constitución. No hay dependencias nuevas que investigar: el stack es heredado.

---

## D1 — Migración 017: contenido y orden de sentencias

- **Decisión**: crear `database/migrations/017_part_purchase_price_stale.sql` **solo con cambios en `parts` y `payments`**, en este orden:
  1. **`parts`**: `ADD COLUMN category` (ver D3), `brand VARCHAR(50) NULL`, `purchase_price DECIMAL(10,2) NULL DEFAULT NULL`, `CONSTRAINT ck_part_purchase_price CHECK (purchase_price >= 0 AND purchase_price <= 999999.99)` y `CONSTRAINT ck_part_sale_price_max CHECK (sale_price <= 999999.99)` (refuerza el límite del CA-2 sobre la columna creada en 016, sin editarla).
  2. **`payments`**: `ALTER TABLE payments MODIFY status ENUM('PENDING','COMPLETED','EXPIRED','STALE') NOT NULL DEFAULT 'COMPLETED'` — se **agrega `STALE` al final** de la lista para que MySQL solo extienda el metadato y no reescriba filas existentes; es una alteración aditiva (no cambia valores previos).
  3. **Sin tocar `order_services`, `order_labor` ni `order_entries`**: ni limpieza de duplicados ni llaves únicas (corrección H-14 acordada). La idempotencia del seed 004 se resuelve con IDs fijos en el propio seed (D2/D8).
- **Rationale**: un solo archivo mantiene el patrón "una migración por sprint" (como 016); `MODIFY` de un `ENUM` con la lista original como prefijo es la forma soportada por MySQL de agregar un estado sin tocar datos; al no crear índices únicos no hay `ER_DUP_ENTRY` posible ni `ALTER TABLE` que pueda fallar en bases ya contaminadas.
- **Alternativas consideradas**:
  - *Limpieza de duplicados previos + llaves únicas `uq_order_service_line`/`uq_order_labor_line`* (versión anterior de este plan): **descartada por decisión del usuario** — la migración 017 queda limitada a `parts`/`payments`, no borra filas existentes y no impide coexistir a dos líneas idénticas; las duplicaciones históricas del H-14 quedan a criterio del taller y el seed corregido no agrega nuevas.
  - *Recrear la tabla*: viola "las migraciones son aditivas y no modifican las anteriores".
  - *Columna booleana `is_stale` en `payments`*: descartada por la decisión Q1 del usuario (opción A: estado `STALE`).

## D2 — Idempotencia del seed 004 con IDs fijos (H-14)

- **Decisión**: los `INSERT` de `order_services` (IDs **1–4**), `order_labor` (IDs **1–2**) y `order_entries` (IDs **1–5**) del seed 004 reciben el `id` explícito en la columna; su `ON DUPLICATE KEY UPDATE` existente se dispara entonces por la **clave primaria** y la segunda corrida actualiza en lugar de insertar. Sin cambios de esquema y sin borrados.
- **Rationale**: con la llave única fuera del alcance, la PK es la única palanca de idempotencia; los IDs fijos son el patrón que ya usan `service_orders` (1–5) y el resto de los seeds; en una base ya contaminada por el defecto H-14 las filas duplicadas previas se **conservan** (sin limpieza) y no se crean filas nuevas al re-ejecutar.
- **Alternativas consideradas**: *llaves únicas `(order_id, description, amount)` en la 017* (descartadas por decisión del usuario; además rechazarían líneas idénticas legítimas y obligarían a traducir `ER_DUP_ENTRY` a un error nuevo); *borrar duplicados exactos antes de re-insertar* (descartada: borraría también líneas legítimas creadas por el usuario en las órdenes 2 y 4, y "borrar datos" no deja los datos de trabajo); *limpieza solo dentro del seed* (descartada: no elimina los duplicados ya existentes si el usuario no re-ejecuta el seed).

## D3 — Lista fija de categorías (valores concretos)

- **Decisión**: `category ENUM('FRENOS','MOTOR','SUSPENSION','ELECTRICO','TRANSMISION','CLIMA','NEUMATICOS','LUBRICANTES','OTRO') NULL DEFAULT NULL` en `parts` (017). El validador rechaza cualquier valor fuera de la lista con `DATOS_INVALIDOS` (400) y mensaje en español; el cliente muestra etiquetas en español (Frenos, Motor, Suspensión, Eléctrico, Transmisión, Clima, Neumáticos, Lubricantes, Otro) con la misma técnica de `nombreEstadoOrden`. La lista vive en backend (no administrable, según la decisión acordada) y se documenta en `contracts/api-rest.md` y `docs/project-context.md`.
- **Rationale**: cubre las categorías típicas de un taller para las refacciones de ejemplo (filtro de aceite → `LUBRICANTES`, pastillas → `FRENOS`, correa → `MOTOR`, batería → `ELECTRICO`…); `ENUM` es el patrón del repo para estados (`payments.method`, `order_entries.entry_type`); `NULL` respeta la opcionalidad decidida.
- **Alternativas consideradas**: *tabla `part_categories` administrable* (contradice la decisión acordada); *`VARCHAR` con `CHECK (category IN (…))`* (equivalente en fuerza, pero el repo ya usa `ENUM`); *texto libre* (descartado por la misma decisión).

## D4 — Filtrado de `purchasePrice` por rol en la API

- **Decisión**: filtrado **en la capa de servicio** (`part-service.listar`): si `usuario.role !== 'ADMIN'`, el objeto de respuesta no incluye `purchasePrice` (el modelo `part.aObjeto` lo expone y `findAll` hace `SELECT *`, así que se omite al serializar, igual que el patrón actual de `soloActivas`). `category` y `brand` sí se devuelven a los tres roles. Las escrituras (alta/edición de los tres datos) ya están protegidas por `requireRole('ADMIN')` en `part-routes.js` (RN-15); se agregan pruebas por rol para que quede garantizado. No existe `GET /api/parts/:id` ni otro endpoint que filtre `parts` (el detalle de orden solo proyecta `name`/`code`), por lo que el único punto de fuga es el listado.
- **Rationale**: filtro en backend, no en UI (Principio IV); una sola capa de serialización evita olvidos futuros; la prueba por rol (CA-3/CA-4) queda en `contract/` y `integration/`.
- **Alternativas consideradas**: *proyección SQL por rol (`SELECT` sin la columna)* (descartada: duplicaría las consultas del modelo); *eliminar el campo en el controlador* (descartada: la lógica de negocio/permisos no vive en controladores, Principio II); *dos endpoints* (descartada: más superficie sin necesidad).

## D5 — Cálculo en centavos enteros y límites

- **Decisión**: crear `server/utils/money.js` con:
  - `aCentavos(valor)`: `Math.round(valor * 100)` → entero (con tolerancia para errores de coma flotante ya existentes);
  - `deCentavos(centavos)`: `centavos / 100` solo al presentar/persistir;
  - `LIMITE_PRECIO_CENTAVOS = 99_999_999` (999,999.99) y `LIMITE_TOTAL_CENTAVOS = 9_999_999_999` (99,999,999.99);
  - `esImporteValido(valor)` (no negativo y ≤ 2 decimales).
  Reglas de uso:
  - **Persistencia**: sigue siendo `DECIMAL(10,2)` (exactitud en MySQL); el backend convierte a centavos apenas recibe o lee un importe.
  - **Sumas y comparaciones en el backend** se hacen con enteros: totales (`order.calcularTotales`/`findTotals`), saldo (`payment-service`: `redondear` pasa a centavos), montos de pago, importes de línea.
  - **Validadores**: `part-validator` exige los tres precios válidos y ≤ 999,999.99 (mensajes separados para negativo, decimales y límite); `order-validator` limita el importe de cada partida y el servicio valida que el total resultante no rebase 99,999,999.99 → nuevo error `422 ORDER_TOTAL_LIMIT_EXCEEDED`.
- **Rationale**: es el patrón pedido por la constitución ("los importes se calculan en centavos enteros y se guardan como `DECIMAL(10,2)`"); una utilidad única evita `Math.round(x*100)/100` disperso (hoy en `payment-service.redondear`); MySQL DECIMAL ya es exacto, el riesgo está en JavaScript.
- **Alternativas consideradas**: *`decimal.js`* (descartada: dependencia nueva para lo que resuelven 6 líneas, Principio III); *enteros en la BD* (descartada: obliga a reglas de presentación en todos los consumidores y cambia el patrón heredado); *dejar el redondeo actual de solo-presentación* (descartada: no cubre el CA-5).

## D6 — Flujo de detección de `STALE` y generación de un cobro nuevo

- **Decisión**: detección **perezosa** (misma técnica que `expireStaleDigital`), sin cron, comparando el importe del cobro contra el **saldo pendiente de la orden** (no contra el total a secas):
  1. **Regla**: un cobro `PENDING` de Mercado Pago es `STALE` ⇔ `amount_centavos ≠ saldoPendiente_centavos`, donde `saldoPendiente = total − SUM(amount) WHERE status='COMPLETED'`; la comparación se resuelve en centavos enteros (D5) y el parámetro SQL se forma con `deCentavos(saldoCentavos)` (2 decimales exactos sobre el `DECIMAL` de la columna).
  2. Nueva función en `payment.js`: `markStaleMismatchedDigital(orderId, saldoCentavos)` → `UPDATE payments SET status='STALE' WHERE order_id=? AND status='PENDING' AND method='MERCADO_PAGO' AND amount <> <saldo con 2 decimales>`.
  3. Puntos de llamada en `payment-service.js`:
     - `listar(orderId)`: después de `expireStaleDigital` y con el saldo ya calculado (así el listado y el saldo ven `STALE`).
     - `verificarCobro(paymentId)`: después de la caducidad y antes de consultar al proveedor; si el importe no coincide con el saldo, `PENDING → STALE` y se devuelve **sin** confirmar (nunca `→ COMPLETED` con importe desfasado); si coincide, el flujo actual sigue igual.
     - **No** en `crearCobroDigital` ni en el panel: `409 PAYMENT_DUPLICATE_PENDING` sigue significando "existe cualquier cobro `PENDING`" (regla sin cambios) y el panel sigue contando `PENDING` tal cual; la interfaz consulta los pagos (`GET /api/orders/:id/payments`, `payments_provider.dart`) **antes** de ofrecer un cobro nuevo, con lo que el cobro desfasado ya quedó marcado al llegar a la creación.
  4. Confirmación bloqueada además en el propio `transitionFromPending` (solo sale de `PENDING`) y por la validación previa.
  5. **Saldo y "pago vigente"**: `sumCompletedByOrder` solo suma `COMPLETED` y `findPendingDigitalByOrder` solo acepta `PENDING`; por lo tanto `STALE` no cuenta para el saldo ni para la regla de un solo pago vigente **sin tocar esas consultas** (la decisión queda cumplida por construcción).
- **Rationale**: la interfaz prellena el cobro con `saldoPendiente` (`payment_form_screen.dart`) y `crearCobroDigital` valida `monto ≤ saldoPendiente` (`payment-service.js`), así que el cobro "correcto" es el que coincide con el **saldo** (total − pagos confirmados): comparar contra el total marcaría `STALE` un cobro perfectamente válido cuando hay pagos parciales previos — exactamente el caso corregido: total $2,000, pago manual `COMPLETED` $800, cobro digital $1,200 (= saldo) → debe permanecer `PENDING`. Cero infraestructura de cron (consistente con el diseño del Sprint 4); el importe del cobro jamás se modifica (pagos inmutables).
- **Alternativas consideradas**: *comparar contra el total* (descartada: falsa alarma con pagos parciales previos); *marcar también en `crearCobroDigital` antes de `findPendingDigitalByOrder`* (descartada: con la regla estricta un cobro parcial creado vía API quedaría marcado al instante y rompería las suites previas `digital-payments.test.js` —"solo hay un cobro digital vigente", cobro de $500 sobre $1,500— y `dashboard.test.js` —$300 sobre $800 con `pendientesDigitales: 1`—; además la interfaz ya consulta antes de crear); *guardar el saldo al crear el cobro en una columna de `payments`* (descartada: excede el contenido fijado de la migración 017); *regla `amount > saldo`* (descartada: no detecta la subida de total, p. ej. $1,800 vs $2,000); *detección también en el panel* (descartada: contaría 0 cobros digitales en `dashboard.test.js`).
- **Consecuencia aceptada**: un cobro digital por importe **menor** al saldo (solo posible vía API; la interfaz siempre genera el enlace por el saldo completo) queda `STALE` al consultarse, porque su importe no coincide con lo adeudado; se documenta en el contrato.
- **Escenario de prueba** (CA-6, `integration/payments-stale.test.js` + E6 del `quickstart.md`): orden con total $2,000 y un pago manual `COMPLETED` de $800 → la recepción genera un cobro digital de $1,200 (el saldo) → al listar y al verificar, el cobro permanece `PENDING` (no pasa a `STALE`) y la verificación lo confirma; ningún cobro correcto con pagos parciales previos se marca `STALE`.

## D7 — Chip `STALE` y columnas de categoría/marca en el cliente

- **Decisión**:
  - `client/lib/models/payment.dart`: caso `'STALE'` en `nombreEstado` (pago y cobro digital) → **"Desfasado"**; el widget de estado existente lo pinta con `MotorixColores.advertencia` (ámbar = advertencia según `docs/design-system.md` y la convención de la constitución), como chip de color discreto (sección 8.2). El botón de verificar/confirmar un cobro `STALE` no se ofrece (el backend lo rechaza igual).
  - `client/lib/screens/parts_screen.dart`: la fila de cada refacción muestra **columnas fijas** de categoría y marca (línea propia en el subtítulo, junto a código y precio; marca vacía se muestra como "—"), **sin filtros nuevos** (decisión Q2). `part_form_screen.dart` agrega: selector fijo de categoría (solo ADMIN), campo de marca (máx. 50) y campo de precio de compra (solo ADMIN, con la misma máscara de 2 decimales que el precio de venta); para mecánico/recepción el formulario no pinta esos campos **y** el backend los rechaza/omite.
  - `client/lib/models/part.dart`: campos `category`, `brand`, `purchasePrice` (`purchasePrice` solo se rellena si viene en la respuesta).
- **Rationale**: sigue los tokens y el chip de la guía de diseño sin nuevos colores; columnas fijas sin filtros es exactamente la decisión acordada; ocultar en UI es comodidad, la garantía es del backend (D4).
- **Alternativas consideradas**: *convertir el listado a `DataTable`* (descartada: la pantalla actual usa tarjetas/lista y cambiarla excede el alcance; `docs/design-system.md` 8.2 sigue vigente como guía, no como rediseño pedido); *filtros por categoría* (descartados por decisión Q2); *chip con color nuevo* (descartado: paleta cerrada, un solo acento).

## D8 — Contenido de los seeds 005 y 008 (sin tocar stock; batería sin precio)

- **Decisión**:
  - **005** (`005_demo_parts.sql`): además de las refacciones 1–6, crea la **batería (ID 7)** con stock inicial 5 y **sin `sale_price`** (NULL a propósito: demo de refacción sin precio, FR-003 de la spec 005); agrega `category`, `brand` y `purchase_price` a las 7 filas y a su rama `ON DUPLICATE KEY UPDATE` (**sin `stock`** en la rama). Traslada aquí los **usos congelados de la orden 2** (`order_parts` 1–2) y sus movimientos (`OUT` 8–9, `IN` 10), con los valores absolutos de stock finales (parte 1 = 11, parte 3 = 34, batería = 5) para que `stock = IN + OUT − ajustes` (SC-004) se cumpla en cualquier punto de la carga.
  - **008** (`008_demo_part_prices.sql`): **solo establece precios, categoría y marca** — un único `INSERT … ON DUPLICATE KEY UPDATE` sobre `parts` con `sale_price` (NULL para la batería), `purchase_price`, `category` y `brand`. **Sin `stock` en la rama `ON DUPLICATE`** (el valor de `stock` del `INSERT` solo aplica si la fila es nueva) y **sin** las sentencias de usos ni de movimientos: re-ejecutarlo no altera stock ni reinicia datos de trabajo.
  - Los precios de compra de ejemplo son menores que los de venta (78.50 < 120, 310 < 450, 130 < 180, 55 < 90, 240 < 350, 95 < 150) para no activar la advertencia del FR-004 en la demo; la batería queda sin precio de venta (su precio de compra 620 no compara contra `NULL`).
- **Rationale**: el 008 ya no puede fijar stock, y dejar sus `OUT` sin el descuento correspondiente rompería `stock = movimientos` (y a la inversa, fijar el stock en el 005 sin sus `OUT` dejaría la inconsistencia a media instalación): por eso usos, `OUT` y la batería con su `IN` viajan **juntos** al 005, que sí es el dueño del stock demo. El papel de la batería en la demo es carecer de precio de venta, por lo que el 008 la escribe explícitamente con `sale_price = NULL`.
- **Alternativas consideradas**: *dejar los usos en el 008 y quitar solo `stock = VALUES(stock)`* (descartada: los `OUT` dejarían el stock demo inconsistente con los movimientos); *borrar usos y movimientos* (descartada: pierde la demo de precio congelado del spec 005); *actualización condicional del stock con `CASE`* (descartada: sigue tocando el stock y viola "solo precios, categoría y marca"); *batería e `IN` en el 008* (descartada: dejaría de ser "solo precios, categoría y marca" y la fila 7 con su movimiento 10 deben ir juntos por la llave foránea).
- **Verificación de las pruebas de la spec 005**: ninguna suite Jest aplica seeds (`server/tests/helpers/db-test.js` solo aplica las migraciones 001–017 y ningún archivo bajo `server/tests/` referencia `apply-seeds`), así que las pruebas de la spec 005 no dependen de estos datos y siguen válidas. El script de evidencia `docs/evidencias/aseguramiento/quickstart-005.mjs` (R-06/H-14) también queda en verde: sus aserciones exigen que tras una doble corrida no cambien los conteos de refacciones, usos ni movimientos y que el stock quede intacto — exactamente lo que garantizan los IDs fijos y la ausencia de `stock` en las ramas `ON DUPLICATE`.

## D9 — Pruebas por criterio de aceptación

- **Decisión** (mapeo CA → suite; todas contra `motorix_test`):

| CA | Suite (backend `server/tests/…` o Flutter `client/test/…`) |
|---|---|
| CA-1 | `integration/parts-purchase-price.test.js` (alta/edición/consulta con los 3 datos; persistencia) + `parts_category_brand_test.dart` |
| CA-2 | `integration/parts-price-limits.test.js` (negativos, no numéricos, 3 decimales, 999,999.99 ok / 1,000,000.00 rechazado, total 99,999,999.99 ok / mayor rechazado) |
| CA-3 | `contract/parts-role-visibility.test.js` (respuesta sin `purchasePrice` para MECHANIC/RECEPTIONIST; con él para ADMIN) |
| CA-4 | `contract/parts-role-visibility.test.js` (POST/PUT con otros roles → 403 `NO_AUTORIZADO`) |
| CA-5 | `unit/money-cents.test.js` + aserciones de centavos en `integration/order-totals-parts.test.js` y `payments.test.js` (saldo $0 de diferencia) |
| CA-6 | `integration/payments-stale.test.js` (cambio de total → `STALE`; verificar con importe viejo rechazado/no confirma; nuevo cobro permitido; saldo no descuenta `STALE`; importe original intacto; sin cambio de total no marca; **y el caso de pagos parciales previos: total $2,000 + pago manual $800 → cobro digital de $1,200 = saldo permanece `PENDING` y se confirma**) |
| CA-7 | `integration/payments-compat.test.js` (pagos/tickets precargados del seed 007 se leen idénticos: importes, folios y contenido) |
| CA-8 | escenario E1 de `quickstart.md` (correr `apply-seeds.mjs` dos veces y comparar conteos, incluidos usos, movimientos y stock de la orden 2); las suites Jest no aplican seeds, así que la doble corrida se valida fuera de Jest, igual que en la spec 005 |
| CA-9 | escenario E1 del quickstart (refacciones con categoría, marca y ambos precios) |
| CA-10 | corrida completa `npm test` (suite previa en verde) + `flutter test`; `stale_payment_chip_test.dart` |
| CA-11 | revisión manual documentada en `quickstart.md` (E9): `grep` sin resultados obsoletos + diff revisado de los dos documentos |

- **Rationale**: el mapeo uno a uno con los CA hace trazables las pruebas (Principio I); las de permisos van a `contract/` porque validan el contrato por rol (patrón del repo).
- **Alternativas consideradas**: *una sola suite por feature* (descartada: el repo separa unit/contract/integration); *probar la doble corrida de seeds dentro de Jest* (descartada como única opción: manipularía la base del runner; el escenario del quickstart ya lo hace sobre `motorix_test` recreada, como en el 005).

## D10 — Documentos a actualizar

- **Decisión**:
  1. `docs/project-context.md`: estados de pago (sección 6.8: agregar **Desfasado/`STALE`** a la lista de estados); entidad `Part` de la sección 12 ya tiene los campos (verificar redacción `category`/`brand`/`purchasePrice`); donde se afirme que el total es "solo servicios + mano de obra", corregirlo; sección 14.1: topes de precio/total y "importes en centavos enteros" (ya presente, verificar).
  2. `docs/design-system.md`: chip de estado "Desfasado" (ámbar/`warning`) en la convención de estados de pago y columnas de categoría/marca en el listado de inventario (8.2).
  3. Comentarios de código obsoletos ("las refacciones no suman importe"): búsqueda dirigida y corrección; candidatos verificados hoy: `server/services/order-service.js:327` y docstrings que describan el total sin refacciones (la mayoría ya los actualizó la 005; la búsqueda final se hace en la implementación).
  4. `specs/005-…/data-model.md` y otros specs previos: **no se tocan** (los specs anteriores quedan intactos por regla del repo).
- **Rationale**: Principio I ("si cambia una regla o entidad, se actualiza el contexto maestro") y CA-11.
- **Alternativas consideradas**: *actualizar solo al final del sprint* (se hace al cierre, como exige FR-013, con verificación en E9); *reescribir specs anteriores* (descartado por la spec 005 y por el insumo).
