# Evaluación del checklist de calidad de requisitos: precio-total (CHK001 a CHK040)

**Feature**: `005-precio-venta-refacciones` | **Rama**: `aseguramiento-calidad-005` | **Fecha de evaluación**: 2026-11-02
**Checklist evaluado**: `specs/005-precio-venta-refacciones/checklists/precio-total.md` (no se modificó; ninguna casilla está marcada `[x]`).
**Método**: cada ítem se contrastó con `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/api-rest.md`, `tasks.md` y `quickstart.md` de la feature, y con el código y las pruebas de `server/` y `client/` cuando hizo falta. Las rutas son relativas a la raíz del repositorio (`motorix/`). Las abreviaturas son: **spec** = `specs/005-precio-venta-refacciones/spec.md`, **contrato** = `specs/005-precio-venta-refacciones/contracts/api-rest.md`, **research** = `.../research.md`, **datos** = `.../data-model.md`.

**Criterio de veredicto** (según la guía, secciones 4 y 6):

- **Cumple**: el requisito está escrito en spec (FR/CA) con la claridad que pide el ítem.
- **Cumple con observación**: existe evidencia, pero vive en otro documento (research, contrato, código) o con una salvedad menor.
- **Hueco**: no hay requisito que responda el ítem, o los documentos se contradicen. Cada hueco trae un hallazgo en la sección 2.

**Alcance de la evaluación**: este checklist se ejecutó después de implementar y el spec no se va a cambiar. Los veredictos juzgan la calidad del texto del requisito. La columna «comentario» indica si el código o las pruebas cubren el comportamiento aunque el requisito falte.

## 1. Evaluación por ítem

### Cálculo del total y manejo de dinero

| Ítem | Veredicto | Evidencia | Comentario |
|---|---|---|---|
| CHK001 | Cumple | `spec.md:106` (FR-007: servicios + mano de obra + precio registrado × cantidad); `spec.md:104` (FR-004: el uso registra el precio vigente); `spec.md:105` (FR-006: precio congelado); `spec.md:124` (CA-6: $1,800 y $1,900) | La fórmula tiene un solo requisito y los otros dos fijan qué precio aplica a cada uso. |
| CHK002 | Cumple con observación | `spec.md:111` (FR-012: saldo a partir del total con refacciones); `spec.md:133` (CA-12: $1,800 − $1,000 = $800 y liquidación); `spec.md:145` (Entidades: liquidada = pagos alcanzan el total) | FR-012 define el saldo, pero la condición de liquidación solo está en CA-12 y en Entidades clave, no en un FR. |
| CHK003 | Cumple | `spec.md:112` (FR-013: total con refacciones); `spec.md:113` (FR-014: desglose con cantidad, precio e importe); `spec.md:131-132` (CA-13, CA-14) | Son dos FR independientes, cada uno con su CA. |
| CHK004 | Cumple con observación | `spec.md:107-109` (FR-008, FR-009, FR-010 separados); `spec.md:127-128` (CA-9, CA-10); `spec.md:78` (US3-4: «indica cuál refacción falta»); `contracts/api-rest.md:12` (`details.refaccionesSinPrecio`) | Los bloqueos están separados. Indicar qué refacción falta aparece en CA-9, US3-4 y el contrato, pero ni FR-009 ni FR-010 lo exigen. |
| CHK005 | Cumple con observación | `spec.md:93` (caso límite: $0 es válido y suma $0); `spec.md:176` (Supuesto); `spec.md:60` (US2-4); `research.md:13` (D1: `NULL` ≠ `0`); `server/tests/unit/validators/part-validator-part-price.test.js:9` | Ningún FR ni CA recoge el $0 (solo el caso límite, un supuesto y un escenario). El código lo cumple: `server/models/order.js:218` cuenta como incompletos solo los `unit_price IS NULL`. No hay prueba de integración que sume un uso de $0 al total. |
| CHK006 | Cumple con observación | `spec.md:177` (Supuesto: una moneda, dos decimales); `datos:13` (`DECIMAL(10,2)`); `server/validators/part-validator.js:52-53` (rechaza más de 2 decimales); `server/tests/unit/validators/part-validator-part-price.test.js:36` | Es solo un supuesto: no hay FR ni CA que lo vuelva verificable. La verificación existe en el validador y su prueba. |
| CHK007 | Cumple con observación | `research.md:138-140` (D11: redondeo a 2 decimales con `redondear`); `server/validators/order-validator.js:104-108` (cantidad entera > 0); `server/validators/part-validator.js:52-53` | FR-007 no dice nada del redondeo. D11 lo decide fuera del spec. En la práctica no hay importes de más de 2 decimales, porque precio (2 decimales) × cantidad (entera) no los produce. `redondear` solo se usa en `server/services/payment-service.js:17,105-110`; `findTotals` no redondea (`server/models/order.js:200`). |
| CHK008 | Hueco | `spec.md:158` (SC-006: «unos segundos»); `plan.md:25` (< 1 s para respuestas, sin relación con la actualización del total en pantalla) | Ningún documento fija un umbral numérico para SC-006. No hay prueba de tiempo. Ver HC-01. |
| CHK009 | Cumple con observación | `spec.md:106` (FR-007 → CA-15); `spec.md:133` (CA-15: $1,800 → $1,650 y el stock se repone); `spec.md:94` (caso límite); `contracts/api-rest.md:65-68`; `server/tests/integration/order-parts-rejection.test.js:160` | El descuento del total y la reposición están definidos en CA-15 (no en un FR; la reposición no aparece en FR-007). La prueba citada comprueba la baja del total; no verifiqué una prueba de reposición de stock en este sprint. |

### Permisos por rol

| Ítem | Veredicto | Evidencia | Comentario |
|---|---|---|---|
| CHK010 | Cumple | `spec.md:100-101` (FR-001, FR-002: registro y modificación solo para administración); `spec.md:134` (CA-16); `server/routes/part-routes.js:18-19` (`POST` y `PUT` con `requireRole('ADMIN')`) | Las acciones sobre el precio son registrar y modificar, y las dos están restringidas en servidor. |
| CHK011 | Hueco | `spec.md:43` (US1-5: «deniega la operación»); `spec.md:134` (CA-16: «denegado por el sistema, no solo oculto»); `server/middlewares/require-role.js:14-16`; `server/tests/contract/parts.contract.test.js:194-195,209-210` (403 `NO_AUTORIZADO`) | El spec no define mensaje ni estado visible, ni que los datos queden sin cambios. La prueba comprueba el 403 pero no que el precio siga igual tras el intento. Ver HC-02. |
| CHK012 | Cumple con observación | `contracts/api-rest.md:19` (`GET /api/parts`: ADMIN, RECEPTIONIST y MECHANIC); `contracts/api-rest.md:87` (ticket: ADMIN y RECEPTIONIST); `server/routes/part-routes.js:15`; `server/routes/ticket-routes.js:17` | El spec no define quién ve el precio (FR-001 y FR-014 hablan de registrar y mostrar). El contrato sí define los roles y el código los aplica. |
| CHK013 | Cumple con observación | `research.md:93` (D7: el listado ya existe con los tres roles y no se restringe más); `contracts/api-rest.md:19-20`; `server/tests/integration/parts-pending-price.test.js:110` (recepción consulta el filtro) | FR-003 dice «la administración» pero no excluye otros roles. La decisión de abrirlo a los tres roles está en research y en el contrato. |
| CHK014 | Cumple con observación | `contracts/api-rest.md:37-41` (`PUT /api/parts/:id` solo ADMIN; la adopción ocurre al asignar el precio); `spec.md:175` (Supuesto: registrar o modificar es de administración); `server/validators/part-validator.js:44-58`; `server/services/part-service.js:110-115` | FR-011 no nombra al rol, pero quien asigna el precio es ADMIN por FR-002 y por la ruta. La validación del precio en servidor existe. |
| CHK015 | Cumple | `spec.md:43` (US1-5: mecánico o recepción); `spec.md:101` (FR-002: administración); `spec.md:134` (CA-16: mecánico o recepción) | Mismos roles, misma acción y misma denegación en los tres textos. |

### Compatibilidad con datos anteriores

| Ítem | Veredicto | Evidencia | Comentario |
|---|---|---|---|
| CHK016 | Cumple con observación | `spec.md:110` (FR-011: abiertas no liquidadas); `spec.md:129` (CA-11: la orden pagada conserva su total); `spec.md:115` (FR-016: ticket de orden liquidada); `spec.md:173` (Supuesto); `spec.md:85` | Los dos destinos tienen requisito, pero la conservación del total de la orden pagada está en CA-11 y en un supuesto, no en un FR. |
| CHK017 | Hueco | `spec.md:25` (Clarifications AMB-01: total previo a la adopción); `spec.md:110` y `spec.md:137` (FR-011 y CA-19 no mencionan el total previo); `research.md:50`; `datos:80-88`; `server/models/part.js:117-148`; `server/tests/integration/part-price-adoption.test.js:143,172` | El criterio de «no liquidada» con total previo solo está en Clarifications, research y data-model, no en un FR/CA. El código y dos pruebas lo cubren. Ver HC-03. |
| CHK018 | Cumple | `spec.md:137` (CA-19: conserva el pago y el saldo pendiente es la diferencia con el nuevo total); `spec.md:86`; `spec.md:19`; `server/tests/integration/part-price-adoption.test.js:103` | El destino de los pagos está dicho con precisión en el CA. |
| CHK019 | Cumple | `spec.md:114` (FR-015); `spec.md:136` (CA-18); `spec.md:138` (CA-20); `database/seeds/008_demo_part_prices.sql:18-26,29-32` | Los datos de ejemplo están requeridos en FR y en dos CA. |
| CHK020 | Cumple con observación | `spec.md:159` (SC-007); `spec.md:171` (Supuesto); `docs/evidencias/pruebas-backend-base.txt:325` (223 pruebas) y `docs/evidencias/pruebas-backend-final.txt:384` (260 pruebas); `docs/evidencias/pruebas-flutter-final.txt:30-31` | SC-007 es verificable («las pruebas existentes siguen pasando, sin cambiar sus aserciones»), pero no fija una línea base numérica. Esa línea se obtuvo después en las evidencias. |
| CHK021 | Cumple | `spec.md:179` (Supuesto: complementa el FR-003 del spec 004 sin contradecirlo); `spec.md:51` (US2); `spec.md:166` (Fuera de alcance: no se modifican los specs 1 a 4) | La relación con el spec 004 y la lista de no modificar están escritas. |
| CHK022 | Hueco | `spec.md:178` (Supuesto: entregadas o canceladas no se reabren ni se recalculan); `spec.md:92` (caso límite: se rechaza agregar); `contracts/api-rest.md:63` (`ORDER_CLOSED`); `server/services/order-service.js:425`; `server/models/part.js:147`; `server/tests/integration/part-price-adoption.test.js:198` | Ningún FR ni CA fija el destino de las órdenes entregadas o canceladas. Solo hay un supuesto y un caso límite. El código y la prueba de adopción lo cubren. Ver HC-04. |

### Casos límite y cobertura de escenarios

| Ítem | Veredicto | Evidencia | Comentario |
|---|---|---|---|
| CHK023 | Hueco | `spec.md:85-94` (diez casos límite sin identificadores FR/CA) | El spec no mapea los casos límite. Por contenido, siete tienen FR/CA: 1 (CA-11), 2 (CA-19), 3 (CA-8, CA-17), 4 (CA-4), 5 (CA-10), 6 (CA-21), 10 (CA-15). Los casos 7 (agregar a orden pagada no entregada), 8 (orden cerrada) y 9 (precio $0) no tienen CA y no se declaran «sin requisito». Ver HC-05. |
| CHK024 | Hueco | `spec.md:91` (caso límite: el total aumenta y reaparece el saldo); `spec.md:137` (CA-19 trata la adopción, no este caso); `server/tests/integration/order-totals-parts.test.js` y `order-parts-rejection.test.js` (sin escenario de orden pagada) | Ningún CA cubre agregar una refacción a una orden ya pagada y abierta. No encontré prueba. El código lo permite: solo rechaza órdenes cerradas (`server/services/order-service.js:425`) y el saldo se deriva (`server/services/payment-service.js:105`). Ver HC-06. |
| CHK025 | Hueco | `spec.md:94`, `spec.md:133` (CA-15 solo prueba una orden sin pagos); `server/services/payment-service.js:105` (`Math.max(total - cobrado, 0)`) | El spec no define qué pasa si los pagos superan el nuevo total. El código oculta el exceso (saldo 0, sin saldo a favor) y no hay prueba. Ver HC-07. |
| CHK026 | Hueco | `spec.md:110` (FR-011 sin flujo de excepción); `server/services/part-service.js:91-115` (`update` y `adoptarPrecios` son dos operaciones sin transacción); `server/models/part.js:129-150` (un solo `UPDATE`) | No hay escenario de error en la adopción ni mensaje ni consistencia definidos. Como la adopción es un solo `UPDATE`, no hay resultado parcial entre órdenes, pero un fallo después del `update` deja el precio asignado sin adoptar. Reintentar es seguro (`unit_price IS NULL`). No hay prueba de fallo. Ver HC-08. |
| CHK027 | Hueco | `spec.md:104-105` (FR-004, FR-006 sin escenario concurrente); `server/models/inventory.js:29-33` (`SELECT ... FOR UPDATE`); `server/services/order-service.js:456-457`, `server/services/order-service.js:477` (precio leído bajo bloqueo de la fila) | No hay requisito ni prueba de concurrencia (búsqueda de `concurr` y `Promise.all` en `server/tests/` sin resultados). El código sí bloquea la fila de la refacción al agregarla. Ver HC-09. |
| CHK028 | Cumple con observación | `spec.md:128` (CA-10: cobro y ticket vuelven a funcionar tras asignar el precio); `spec.md:129` (CA-11: totales recalculados); `spec.md:79` (US3-5); `server/tests/integration/payments-parts-total.test.js:144`; `server/tests/integration/tickets-parts.test.js:112` | La recuperación está definida para las órdenes abiertas no liquidadas. No cubre una orden entregada y no liquidada con usos sin precio (ver HC-11). |
| CHK029 | Hueco | `spec.md:93` («no se admite el precio vacío»); `spec.md:100` (FR-001 y CA-2 solo hablan de negativo o no numérico); `contracts/api-rest.md:34` (`null` deja el precio pendiente); `server/validators/part-validator.js:46-50` (acepta `''` y `null`); `server/services/part-service.js:105` (`''` pasa a `null`) | El caso límite y el contrato se contradicen: uno dice que el vacío no se admite y el otro lo usa para «pendiente». Ningún FR/CA ni prueba rechaza el vacío. Ver HC-10. |

### Consistencia y trazabilidad (EARS, FR ↔ CA)

| Ítem | Veredicto | Evidencia | Comentario |
|---|---|---|---|
| CHK030 | Cumple con observación | `spec.md:100-115` (FR-001 a FR-016, cada uno con su patrón); `spec.md:18` (la directiva de dividir los requisitos compuestos) | Cada FR usa un solo patrón. Quedan respuestas algo compuestas en FR-005 (rechazar con mensaje y sin modificar nada, `spec.md:104`) y FR-016 (total histórico con marca «sin precio», `spec.md:115`); son menores. |
| CHK031 | Cumple con observación | `spec.md:100-115` (todos los FR citan CA); `spec.md:119-139` (CA-1 a CA-21, todos citados al menos una vez) | La cobertura cruzada es completa. Salvedad fuera del spec: `contracts/api-rest.md:34` cita CA-3 para el rechazo del precio negativo, cuando le corresponde CA-2. |
| CHK032 | Hueco | `spec.md:39-43`, `spec.md:57-61`, `spec.md:75-79` (escenarios sin identificadores FR/CA); `tasks.md:61-65` (la trazabilidad por tarea sí existe, pero no por escenario) | Los escenarios de US1 a US3 no citan FR/CA. Por contenido casi todos tienen CA, pero US2-4 (precio $0, `spec.md:60`) no tiene ninguno. Ver HC-05. |
| CHK033 | Hueco | `spec.md:16` y `spec.md:145` (abierta y liquidada, dimensiones independientes); `spec.md:107` (FR-008: «orden abierta»); `spec.md:108-109` (FR-009, FR-010: «orden no liquidada»); `spec.md:178` (Supuesto: el bloqueo aplica a «órdenes abiertas no liquidadas»); `server/services/payment-service.js:56-65,81-84` (solo rechaza canceladas); `server/services/ticket-service.js:75` | FR-009 y FR-010 dicen «no liquidada» y el Supuesto dice «abierta no liquidada». El código aplica la primera lectura: una orden ENTREGADO sin liquidar también se bloquea. Ver HC-11. |
| CHK034 | Cumple con observación | `spec.md:107-109,115` (FR-008, FR-009, FR-010, FR-016); `contracts/api-rest.md:12`; `server/services/ticket-service.js:73-78` | La cadena marca → bloqueo → excepción para la liquidada es coherente (la orden liquidada queda marcada incompleta pero no se bloquea). La única diferencia es «abierta» frente a «no liquidada» (ver CHK033, HC-11). |
| CHK035 | Cumple con observación | `spec.md:153-159` (SC-001 a SC-007); `spec.md:158` (SC-006 vago) | Ningún SC exige alcance ajeno. Faltan SC para FR-002 (permisos), FR-003 (pendientes) y FR-015 (datos de ejemplo), aunque los cubren CA-16, CA-17 y CA-18/20. SC-006 no es medible (CHK008). |

### Criterios de aceptación y éxito medibles

| Ítem | Veredicto | Evidencia | Comentario |
|---|---|---|---|
| CHK036 | Cumple con observación | `spec.md:121-124,133-134` (CA-3, CA-4, CA-5, CA-6, CA-12, CA-15 con importes concretos); `spec.md:119-120,126,127,137,139` (CA-1, CA-2, CA-8, CA-9, CA-19, CA-21: «mensaje claro», «error visible», «la diferencia») | La mayoría de los CA tiene valores concretos. Los CA-1, CA-2, CA-8, CA-9, CA-19 y CA-21 usan expresiones subjetivas o no dan importes. |
| CHK037 | Cumple con observación | `spec.md:107` (FR-008: total incompleto = orden abierta con refacciones usadas sin precio registrado); `spec.md:155` (SC-003); `spec.md:156` (SC-004); `spec.md:115` y `spec.md:90` (uso de «total histórico») | «Total incompleto» está bien definido. «Total histórico» se usa sin definición formal (se entiende como el total que se cobró). SC-004 no usa ese término, pero sí es verificable. |
| CHK038 | Cumple con observación | `spec.md:153` (SC-001: universo «órdenes con 0, 1 y varias refacciones» y método de suma); `spec.md:157` (SC-005: «100 % ... sin intervención manual») | SC-001 trae universo y método. SC-005 define el universo (órdenes abiertas no liquidadas que usaban refacciones), pero no dice cómo se comprueba. |

### Supuestos, dependencias y alcance

| Ítem | Veredicto | Evidencia | Comentario |
|---|---|---|---|
| CHK039 | Cumple con observación | `spec.md:178` (Supuesto: órdenes cerradas); `spec.md:92` y `spec.md:94` («como ya rige desde el sprint de inventario», «comportamiento ya existente»); `spec.md:168-179` (no hay sección de dependencias) | Las órdenes cerradas están como supuesto. El comportamiento de stock heredado solo aparece en casos límite, sin listarse como dependencia vigente. |
| CHK040 | Cumple | `spec.md:163-166` (Fuera de alcance); `spec.md:175-176` (Supuestos); `spec.md:100-115` (ningún FR trata precio de compra, utilidad o recálculo retroactivo) | El alcance mínimo es coherente en las tres secciones. |

## 2. Hallazgos propuestos para los huecos

Ninguno es crítico ni alto: el comportamiento principal está implementado y probado. Cada hallazgo indica si el código o las pruebas lo cubren de todos modos.

| ID | Ítem | Severidad | Hallazgo | ¿Lo cubren código o pruebas? |
|---|---|---|---|---|
| HC-01 | CHK008 | baja | SC-006 usa «unos segundos» sin umbral. Debería fijar un valor (por ejemplo, 2 s) y decir cómo se mide. | Parcialmente: el total se calcula al vuelo en cada lectura (`server/models/order.js:186-201`), así que se actualiza sin recarga. No hay prueba de tiempo. |
| HC-02 | CHK011 | baja | CA-16 no define el mensaje ni el estado visible de la denegación ni que el precio quede intacto. | Parcialmente: 403 `NO_AUTORIZADO` en `server/middlewares/require-role.js:14-16`, probado en `server/tests/contract/parts.contract.test.js:194-195,209-210`. La prueba no verifica que el precio no cambió. |
| HC-03 | CHK017 | media | El criterio «no liquidada = pagos < total previo a la adopción» (AMB-01) no está en ningún FR/CA; FR-011 y CA-19 no lo mencionan. | Sí: `server/models/part.js:117-148` lo implementa y `server/tests/integration/part-price-adoption.test.js:143,172` lo prueban. |
| HC-04 | CHK022 | baja | El destino de las órdenes entregadas o canceladas (no se reabren ni se recalculan) solo es supuesto y caso límite, sin FR/CA. | Sí: `server/models/part.js:147` las excluye y `server/tests/integration/part-price-adoption.test.js:198` lo prueba; `ORDER_CLOSED` en `server/services/order-service.js:425`. |
| HC-05 | CHK023, CHK032 | baja | Los casos límite y los escenarios de US1 a US3 no tienen identificadores FR/CA. Quedan sin CA: agregar a una orden pagada no entregada, la orden cerrada, y el precio $0 (US2-4). | Parcialmente: el código implementa los tres casos; el $0 se prueba solo en el validador (`server/tests/unit/validators/part-validator-part-price.test.js:9`). |
| HC-06 | CHK024 | media | Falta un CA para agregar una refacción a una orden pagada y abierta (el total aumenta y reaparece el saldo). | Código sí (no hay bloqueo, el saldo se deriva: `server/services/payment-service.js:105`). Pruebas: no encontré ninguna. |
| HC-07 | CHK025 | media | No se define qué pasa si, tras retirar una refacción, los pagos superan el nuevo total (sobrepago o saldo a favor). | Parcialmente: el saldo se recorta a 0 (`server/services/payment-service.js:105`), sin registrar el exceso. Sin prueba. |
| HC-08 | CHK026 | media | FR-011 no define el error durante la adopción. En el código, `part-service.js:91-115` hace `update` y `adoptarPrecios` sin transacción. | Parcialmente: la adopción es un solo `UPDATE` (sin resultado parcial entre órdenes) y es repetible, pero un fallo entre las dos operaciones deja el precio sin adoptar. Sin prueba de fallo. |
| HC-09 | CHK027 | baja | No hay requisito de uso concurrente al agregar refacciones o cambiar precios. | Parcialmente: `server/models/inventory.js:32` bloquea la fila de la refacción (`FOR UPDATE`) al agregar. `adoptarPrecios` no bloquea. Sin prueba de concurrencia. |
| HC-10 | CHK029 | media | El caso límite («no se admite el precio vacío») contradice el contrato y el código, donde vacío o `null` significa «pendiente de precio». Ningún FR/CA define cuál rige. Además, un `PUT` con vacío borra el precio de una refacción que ya lo tenía. | No: `server/validators/part-validator.js:46-50` acepta `''`/`null`, y `server/tests/integration/parts-sale-price.test.js:69` prueba que se puede limpiar el precio. Ninguna prueba rechaza el vacío. |
| HC-11 | CHK033 (afecta a CHK028, CHK034) | media | FR-008 dice «orden abierta», FR-009 y FR-010 dicen «no liquidada» y el Supuesto (`spec.md:178`) dice «abierta no liquidada». El código bloquea cobro y ticket en toda orden no cancelada y no liquidada, también entregada (`server/services/payment-service.js:56-65,81-84`, `server/services/ticket-service.js:75`), pero la adopción excluye las entregadas (`server/models/part.js:147`). Una orden ENTREGADO sin liquidar con usos antiguos sin precio queda sin salida: no se puede cobrar, no emite ticket y no adopta el precio. | No: ninguna prueba cubre ese caso. Es poco probable (requiere datos anteriores a la migración 016), pero el bloqueo no tiene remedio dentro de la aplicación. |

## 3. Conteos por veredicto

| Veredicto | Cantidad | Ítems |
|---|---|---|
| Cumple | 8 | CHK001, CHK003, CHK010, CHK015, CHK018, CHK019, CHK021, CHK040 |
| Cumple con observación | 20 | CHK002, CHK004, CHK005, CHK006, CHK007, CHK009, CHK012, CHK013, CHK014, CHK016, CHK020, CHK028, CHK030, CHK031, CHK034, CHK035, CHK036, CHK037, CHK038, CHK039 |
| Hueco | 12 | CHK008, CHK011, CHK017, CHK022, CHK023, CHK024, CHK025, CHK026, CHK027, CHK029, CHK032, CHK033 |
| **Total** | **40** | |

**Hallazgos por severidad**: críticas 0, altas 0, medias 6 (HC-03, HC-06, HC-07, HC-08, HC-10, HC-11), bajas 5 (HC-01, HC-02, HC-04, HC-05, HC-09). Total: 11 hallazgos para 12 ítems en hueco (CHK023 y CHK032 comparten HC-05).

**Límites de esta evaluación**: no ejecuté las suites; los conteos de pruebas (223 antes, 260 después) provienen de los archivos de evidencia ya existentes. No verifiqué línea por línea todas las pruebas heredadas de sprints anteriores, por eso en CHK009 no afirmo que haya una prueba de reposición de stock.
