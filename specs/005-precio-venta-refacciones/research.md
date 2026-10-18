# Investigación: Precio de venta de refacciones y total de la orden

**Feature**: `005-precio-venta-refacciones` | **Fecha**: 2026-10-18

Cada decisión se documenta con la alternativa descartada y su motivo. Sin dependencias nuevas; stack fijado por la constitución (Node.js LTS + Express ESM, `mysql2` sin ORM, MySQL local, Flutter + Provider, Jest + supertest, `flutter test`).

---

## D1 — "Pendiente de precio": `NULL` frente a `0`

**Decisión**: el precio de venta de una refacción pendiente se representa con `NULL` (`parts.sale_price DECIMAL(10,2) NULL`), nunca con `0`.

**Rationale**: el spec permite el precio `0` como importe válido (obsequio o promoción, CA del caso límite "precio $0"); si `0` significara "pendiente", un obsequio sería indistinguible de una omisión y el total querría $0 por error. `NULL` expresa "aún no definido" sin ambigüedad, permite el filtro `WHERE sale_price IS NULL` (FR-003) y que la base de datos distinga ambos estados por diseño.

**Alternativas descartadas**:
- **`0` como sentinel de "pendiente"**: colisiona con el precio válido $0; haría imposible el obsequio y forzaría lógica frágil para distinguirlo.
- **Booleano `has_price` + precio `NOT NULL DEFAULT 0`**: dos fuentes de verdad para el mismo hecho; pueden divergir (precio 0 con `has_price = 1` vs `0`), violando la integridad del modelo.
- **Precio obligatorio `NOT NULL` en el alta de refacción**: contradice el flujo real (el taller puede registrar una refacción antes de conocer su precio) y obligaría a inventar un precio provisional; el spec resolvió en Q1 que las existentes quedan pendientes hasta que administración asigne uno.

---

## D2 — Precio congelado en el uso (`order_parts.unit_price`) frente a leerlo del inventario

**Decisión**: cada línea de `order_parts` guarda su propio `unit_price DECIMAL(10,2) NULL`, copiado del `sale_price` vigente al momento de agregarla (FR-004, FR-006).

**Rationale**: es lo que el spec exige como caso límite central ("cambio de precio después de usarlas": el total no cambia). Un congelado por línea hace inmutables los importes históricos, permite auditar lo que se cobró en cada uso, evita recalcular hacia atrás y es la práctica estándar de punto de venta (línea de factura con su precio). `NULL` en `unit_price` marca los usos antiguos sin precio que disparan el total incompleto (FR-008) y la adopción (FR-011).

**Alternativas descartadas**:
- **Leer siempre `parts.sale_price` al calcular el total**: un cambio de precio reescribiría el total de órdenes ya usadas, rompiendo CA-4 y SC-004 (cero alteraciones históricas); además haría que pagos ya registrados dejen de corresponder con su total.
- **Congelar el precio en un snapshot del total de la orden**: mantendría el total estable, pero el desglose del ticket dejaría de coincidir con la suma de sus partes y dificultaría detectar usos sin precio; se prefirió congelar por línea (detalle) y derivar el total.
- **Tabla historial de precios de refacción (price log)**: resuelve auditoría de precios, pero no el importe cobrado por uso, no lo pide el alcance mínimo y agrega una entidad y operaciones extra.

---

## D3 — Total calculado al vuelo frente a total guardado en `service_orders`

**Decisión**: el total sigue **calculándose al vuelo** (como hoy desde `order_services` + `order_labor` en `orderModel.findTotals`), agregando la suma de `order_parts.unit_price × quantity`; no se crea una columna `total`.

**Rationale**: el total es una vista derivada de sus partes; guardarlo exigiría recalcularlo y mantenerlo sincronizado en cada alta/baja de servicio, mano de obra, uso/retiro de refacción, ajuste y adopción de precio — una superficie de errores de consistencia grande para cero beneficio en la escala del MVP. El cálculo al vuelo ya es el patrón aprobado en los sprints 2–4 y hace que CA-6/CA-7 sean ciertos por construcción (el total nunca queda por debajo de la suma de sus partes ni duplica importes). El "total incompleto" (FR-008) se expresa como un indicador derivado del mismo cálculo (`partsIncomplete`), no como estado persistido.

**Alternativas descartadas**:
- **Columna `service_orders.total` con recalculo en cada evento**: duplica la verdad, exige transacciones de mantenimiento en todos los escritores del total (servicios, mano de obra, refacciones, retiros, adopción) y arriesga desfases silenciosos; el spec prioriza exactitud, no velocidad extrema (SC-006 solo pide ver el total "sin recargar nada a mano").
- **Vista/materialización de totales**: complejidad de MySQL sin necesidad; el volumen de un taller local no lo justifica.
- **Trigger SQL que mantiene el total**: traslada lógica de negocio a la base de datos, violando el Principio II (la lógica vive en `services/`).

---

## D4 — Estrategia de adopción de precios en usos antiguos (FR-011)

**Decisión**: cuando administración asigna `sale_price` a una refacción, el servicio ejecuta una actualización dirigida de los `order_parts` de esa refacción que tengan `unit_price IS NULL`, **solo en órdenes abiertas no liquidadas** (`status NOT IN ('ENTREGADO','CANCELADA')` y pagos completados menor que el total **previo a la adopción**, es decir, calculado sin los usos que van a adoptarse — criterio fijado en Clarifications, "Sesión posterior al análisis", por el hallazgo AMB-01 del análisis pre-implementación); los pagos registrados se conservan y el saldo pendiente se recalcula al vuelo. La adopción solo ajusta el saldo pendiente y nunca deja liquidada a una orden, porque el precio adoptado no reduce el total. En órdenes ya liquidadas los usos sin precio se conservan como `NULL` (la orden ya cobró su total anterior y este no se toca — "fuera de alcance: recalcular órdenes ya pagadas"; ven su ticket con líneas marcadas como "sin precio", FR-016).

**Rationale**: es la resolución explícita de Q1/Q4 de las sesiones de clarificación; evita el callejón sin salida de una orden parcialmente pagada con total incompleto (CA-19) y respeta SC-004 (cero alteración de históricos cobrados). La adopción es una escritura única y masiva por refacción, no un recálculo en cada lectura.

**Alternativas descartadas**:
- **Adoptar precio en TODAS las órdenes, incluidas pagadas**: recalcularía totales ya cobrados, generando saldos negativos fictorios o pagos "de más" sin efectivo real; contradictorio con el supuesto ratificado del spec.
- **No adoptar automáticamente; exiger una acción manual por orden**: dejaría órdenes parcialmente pagadas sin poder liquidarse (hueco señalado por el usuario); multiplica pasos manuales sin aporte de control.
- **Marcar usos antiguos como "resueltos al precio vigente" sin congelarlo por línea**: reutilizaría el precio actual en cada lectura y volvería a romper la inmutabilidad (mismos motivos que D2).
- **Adoptar solo al "abrir" la orden**: no existe evento de apertura para órdenes ya existentes; la adopción en el momento de asignar el precio es el único punto determinista.

---

## D5 — Estrategia de migración: `016` aditiva, sin editar migraciones anteriores

**Decisión**: nueva migración `database/migrations/016_add_part_prices.sql` que agrega `parts.sale_price` y `order_parts.unit_price` (ambos `DECIMAL(10,2) NULL`) más un `CHECK` de no negatividad por columna. No se editan las migraciones 001–015; el script `apply-migrations.mjs` la aplica por orden alfabético y la registra en `schema_migrations`, como las demás.

**Rationale**: regla explícita de la constitución (Principio III) y del usuario: los cambios de esquema son scripts nuevos numerados e inmutables. `DECIMAL(10,2)` es el tipo consistente con los importes existentes (`order_services.amount`, `payments.amount`). El `CHECK` refuerza en la base la regla de negocio "no negativo" (CA-2/FR-001) como defensa en profundidad; la validación principal sigue en el backend (Principio IV).

**Alternativas descartadas**:
- **Editar `010_create_parts.sql` y `013_create_order_parts.sql`**: prohibido por la constitución; rompería bases ya aplicadas y la trazabilidad de sprints previos.
- **Script de corrección fuera del patrón de migraciones**: dejaría la recreación desde cero de la base incompleta.
- **Validación solo en la aplicación (sin `CHECK`)**: se descarta como única defensa; el `CHECK` es gratis y evita importes negativos por escrituras directas (seeds, ajustes).

---

## D6 — Datos de ejemplo: seed nuevo `008` (FR-015)

**Decisión**: nuevo `database/seeds/008_demo_part_prices.sql` idempotente (IDs fijos + `ON DUPLICATE KEY UPDATE`), que: (a) asigna `sale_price` a las 6 refacciones de ejemplo; (b) agrega una refacción de ejemplo **sin precio** (activa) para demostrar el filtro de pendientes (FR-003) sin dejar ninguna orden incompleta; (c) registra usos de refacciones con precio congelado en la orden 2 (EN_REPARACION, parcialmente pagada) con sus movimientos `OUT` y ajuste de stock correspondiente, de modo que esa orden demuestre el total con refacciones y el saldo pendiente ajustado.

**Rationale**: FR-015 (clarificación Q2 de la segunda sesión) exige que ninguna orden de ejemplo arranque con total incompleto; la constitución exige que cada sprint se vea con datos reales al arrancar. La orden 2 es la única abierta con servicios registrados y pagos parciales — el escenario perfecto para demostrar CA-12/CA-19 (saldo pendiente = total con refacciones − pagos). La orden 3 (ESPERANDO_REFACCION) se deja sin usos porque espera una refacción que no está en el catálogo; las órdenes ENTREGADO/CANCELADA no reciben usos (regla de orden cerrada). Los `OUT` mantienen `stock = IN + OUT + ajustes` (SC-004 del spec 003) y `stock ≥ 0`.

**Alternativas descartadas**:
- **Editar `005_demo_parts.sql` y `004_demo_service_orders.sql`**: prohibido (seeds de sprints aplicados son inmutables).
- **No agregar usos de ejemplo**: la demo arrancaría sin ninguna orden con refacciones con precio, sin poder mostrar el objetivo central de la feature.
- **Dejar una orden de ejemplo a propósito incompleta para demostrar el bloqueo**: se descarta por la respuesta Q2 ("ninguna orden de ejemplo aparece con total incompleto"); el caso se demuestra con pruebas automatizadas y con la refacción sin precio en el catálogo (pendiente visible sin bloquear flujos).
- **Recalcular el stock de las refacciones usadas a mano en el seed sin movimientos**: dejaría el historial de movimientos inconsistente con el stock (viola FR-014 del spec 003).

---

## D7 — Diseño de la API para pendientes de precio (FR-003)

**Decisión**: reutilizar `GET /api/parts` con el query param `?pending-price=true`, que filtra las refacciones con `sale_price IS NULL` (solo sobre refacciones activas). Respuesta sin cambios de forma (lista estándar); el parámetro es opt-in y quien lo pida obtiene la lista de pendientes.

**Rationale**: no inventa un endpoint nuevo cuando un filtro de colección basta; mantiene la coherencia de la API (Principio VI) y es el patrón natural de listados. El rol objetivo es administración (FR-003); el endpoint de listado ya existe con los tres roles y el filtro no expone datos sensibles, por lo que no se restringe adicionalmente (el spec solo restringe registrar/modificar precios, CA-16/FR-002).

**Alternativas descartadas**:
- **Nuevo endpoint `GET /api/parts/pending-price`**: subrecursos para un filtro que el listado puede resolver; agrega ruta, controlador y prueba propios sin ganancia.
- **Campo booleano `lowStock`-style calculado en la respuesta sin filtro**: el cliente tendría que traer todo el inventario para filtrar en interfaz; ineficiente y peor para la prueba del "lista vacía" (CA-17).

---

## D8 — Bloqueo de cobro y ticket por total incompleto (FR-009, FR-010)

**Decisión**: `obtenerTotalOrden`/`findTotals` exponen además `partsIncomplete` (número de usos de la orden con `unit_price IS NULL`). En órdenes **no liquidadas**, `paymentService.registrar` y `crearCobroDigital` rechazan con `409 CONFLICT` + código `TOTAL_INCOMPLETO` (mensaje que identifica la refacción faltante), y `ticketService` (emisión y consulta) responde `409` con el mismo código; `paymentService.listar` consulta el total incompleto como informativo sin permitir liquidar. En órdenes **ya liquidadas** el bloqueo no aplica: su total histórico está completo con lo cobrado, el ticket se emite con `totalCompleto: false` marcando las líneas sin precio como "sin precio" (FR-016, CA-21) y el estado de cobro permanece `LIQUIDADA`. Motivo: bloquearles el ticket sería un callejón sin salida porque la adopción (D4) no las alcanza y recalcularlas está fuera de alcance (decisión registrada en Clarifications, "Sesión posterior al análisis", por el hallazgo INC-01 del análisis pre-implementación).

**Rationale**: el spec exige impedir ambos flujos con mensaje claro (CA-10) y la respuesta Q1/Q2 acordó que la única salida es asignar el precio (adopción automática en órdenes no liquidadas). El patrón `409` + código de error es el ya usado por la API para conflictos de negocio y entra por el manejo centralizado de errores (Principio VI).

**Alternativas descartadas**:
- **Permitir el cobro y advertir**: contradice FR-009/FR-010 textualmente y arriesga cobrar de menos.
- **Bloquear solo en la interfaz**: la constitución exige validación en el servidor; el frontend no es seguridad suficiente.
- **Excepción automática de "total provisorio"**: abriría la puerta a cobrar importes que después cambian; fuera del comportamiento resuelto en clarificación.

---

## D9 — Desglose de refacciones en el ticket y en la orden

**Decisión**: `ticketService` y `orderService.obtenerPorId` devuelven cada uso como `{ partId, nombre, code, quantity, unitPrice, amount }` (amount = unitPrice × quantity), y el total del ticket es el mismo total con refacciones (CA-13, CA-14). Los usos sin precio (solo posibles en órdenes no cobrables) se muestran con `unitPrice: null` e `amount: null` y disparan el bloqueo.

**Rationale**: el ticket ya lista refacciones por cantidad (decisión D2 del spec 004); solo se le agregan precio e importe. Un solo punto de cálculo (`findTotals`) alimenta orden, pagos y ticket, garantizando CA-14 (diferencia $0) por construcción.

**Alternativas descartadas**:
- **Calcular el desglose por separado en cada servicio**: riesgo de divergencia entre ticket y orden (rompería SC-002).
- **No mostrar precio por línea en el ticket**: insuficiente para CA-13 y para la confianza del cliente en el comprobante.

---

## D10 — Pruebas de la adaptación de las pruebas existentes (SC-007)

**Decisión**: las pruebas de integración existentes que agregan refacciones a órdenes (`order-service` / `inventory`) registran primero un `sale_price` en la preparación del caso (por ejemplo, un `UPDATE` de prueba o alta con `salePrice`), sin tocar aserciones; se añaden pruebas nuevas: rechazo por `PART_SIN_PRECIO`, `TOTAL_INCOMPLETO` en pagos y tickets, congelamiento del precio al agregar, adopción en órdenes abiertas y no adopción en pagadas, filtro `pending-price` y suma del total. En frontend, `flutter test` cubre los modelos con `salePrice`/`unitPrice` y los estados de los providers.

**Rationale**: es exactamente la conciliación resuelta en Q1 de la primera sesión de clarificación: cero cambios de aserción, cero cambios de specs previos, y toda la lógica nueva con prueba propia (Principio VII).

**Alternativas descartadas**:
- **Dejar las pruebas existentes tal cual (sin precio)**: fallarían por el rechazo `PART_SIN_PRECIO`, que es el comportamiento deseado; no es una opción válida, es el costo de la regla nueva.
- **Permitir usos sin precio para no tocar pruebas**: contradice FR-005 y reabre la brecha de dinero.

---

## D11 — Moneda y redondeo

**Decisión**: importes en `DECIMAL(10,2)` (una única moneda, dos decimales, según Supuestos del spec); los cálculos en JavaScript se redondean a 2 decimales con la utilidad `redondear` existente, consistente con `payments`.

**Alternativas descartadas**: enteros en centavos (más precisión, pero rompe la coherencia con los importes existentes de servicios, mano de obra y pagos); punto flotante sin redondeo (imprecisiones de decimal binario).
