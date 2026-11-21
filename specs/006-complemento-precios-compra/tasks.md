---

description: "Lista de tareas para la feature 006-complemento-precios-compra"
---

# Tareas: Categoría, marca, precio de compra y cobro consistente

**Input**: Documentos de diseño de `/specs/006-complemento-precios-compra/`

**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, contracts/api-rest.md, quickstart.md

**Pruebas**: Sí — la spec (FR-015, CA-10) las exige. En cada historia las pruebas van ANTES de la implementación: primero se escriben y se comprueba que fallan; después se implementa lo que las hace pasar.

**Organización**: agrupadas por historia de usuario (US1 a US5) para permitir implementación y prueba independientes. Cada tarea cita entre corchetes el requisito (FR-xxx) o criterio de aceptación (CA-xx) que cubre.

**Decisión vigente (no se reabre)**: la migración 017 solo toca `parts` (category, brand, purchase_price, CHECK de límites) y `payments` (estado `STALE`). No hay llaves únicas en `order_services`/`order_labor`, no hay limpieza ni borrado de duplicados y no existe el error `ORDER_LINE_DUPLICATE`. La idempotencia del seed 004 (H-14) se logra con IDs fijos. `STALE` compara el importe del cobro contra el **saldo pendiente** (total − pagos `COMPLETED`), no contra el total a secas.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin depender de tareas incompletas)
- **[Historia]**: US1 a US5; las fases de preparación, base común y cierre no llevan etiqueta
- **[X]**: tarea ya hecha (los seeds 004, 005 y 008 están en el commit `1907be2` de esta rama)

## Convención de rutas

- Backend: `server/` (`models/`, `services/`, `controllers/`, `validators/`, `utils/`); pruebas en `server/tests/{unit,integration,contract}/`
- Frontend: `client/lib/` (`models/`, `providers/`, `screens/`) y `client/test/`
- Datos: `database/migrations/`, `database/seeds/`, `database/scripts/`
- Documentos: `docs/`

---

## Fase 1: Preparación

**Propósito**: línea base verde antes de tocar nada.

- [X] T001 Ejecutar `npm test` en `server/` y `flutter test` en `client/` sobre la rama actual y anotar el resultado como línea base (todas las suites previas deben estar en verde) [CA-10]
- [X] T002 Confirmar en `server/tests/helpers/db-test.js` que la base `motorix_test` aplica automáticamente toda migración numerada (incluida la futura `017_part_purchase_price_stale.sql`); solo se edita el helper si no la detecta [CA-10]

---

## Fase 2: Base común (bloquea todas las historias)

**Propósito**: esquema, utilidad de dinero y errores nuevos de los que dependen las cinco historias.

**⚠️ CRÍTICO**: ninguna historia empieza hasta terminar esta fase. Los seeds ya modificados (US5) también necesitan la migración 017 aplicada, porque escriben `category`, `brand` y `purchase_price`.

- [X] T003 Antes de crear la migración, consultar en la base local `SELECT MIN(sale_price), MAX(sale_price) FROM parts` y confirmar que ningún valor viola los `CHECK` nuevos (≥ 0 y ≤ 999,999.99); si alguno los viola, corregir el dato a mano o detenerse y avisar. Luego crear `database/migrations/017_part_purchase_price_stale.sql`, solo sobre `parts` y `payments`: en `parts` agregar `category ENUM('FRENOS','MOTOR','SUSPENSION','ELECTRICO','TRANSMISION','CLIMA','NEUMATICOS','LUBRICANTES','OTRO') NULL`, `brand VARCHAR(50) NULL`, `purchase_price DECIMAL(10,2) NULL` con `CHECK (purchase_price >= 0 AND purchase_price <= 999999.99)` y `CHECK (sale_price <= 999999.99)`; en `payments` ampliar `status` a `ENUM('PENDING','COMPLETED','EXPIRED','STALE')` con `STALE` al final. Sin tocar `order_services`, `order_labor` ni `order_entries`; sin borrados [FR-001][FR-002][FR-003][FR-008][CA-1][CA-2][CA-6]
- [ ] T004 Aplicar `node database/scripts/apply-migrations.mjs` sobre `motorix_test` y sobre la base local; comprobar que 017 queda registrada, que las filas existentes de `parts` y `payments` no cambian y que una segunda corrida no la repite (depende de T003) [CA-8]
- [X] T005 [P] Escribir `server/tests/unit/money-cents.test.js` (casos: `aCentavos(0.1 + 0.2)` = 30, `aCentavos(1234.56)` = 123456, `deCentavos`, `esImporteValido` con negativos, NaN y 3 decimales, límites `LIMITE_PRECIO_CENTAVOS` = 99 999 999 y `LIMITE_TOTAL_CENTAVOS` = 9 999 999 999); debe fallar antes de T006 [CA-5]
- [X] T006 Crear `server/utils/money.js` con `aCentavos()`, `deCentavos()`, `esImporteValido()` y los dos límites en centavos, y hacer pasar T005 (depende de T005) [FR-007][CA-5]
- [X] T007 [P] Agregar el código `ORDER_TOTAL_LIMIT_EXCEEDED` (422) al catálogo de `server/utils/errors.js`; no se agrega ningún código de línea duplicada [FR-003][CA-2]

**Punto de control**: migración 017 aplicada y repetible, `money.js` probado y error nuevo disponible; las suites previas siguen en verde.

---

## Fase 3: Historia de usuario 1 — Categoría, marca y precio de compra en la refacción (Prioridad: P1) 🎯 MVP

**Objetivo**: la administración registra y edita categoría, marca y precio de compra, con advertencia si venta < compra, y el inventario muestra categoría y marca en columnas fijas.

**Prueba independiente**: registrar una refacción con categoría, marca y ambos precios, comprobar que persisten, se consultan y se editan; rechazo de categoría fuera del catálogo y de marca > 50; el listado muestra las dos columnas, sin tocar órdenes, cobros ni tickets (E2 del quickstart).

### Pruebas de la Historia 1 (escribirlas primero; deben fallar) ⚠️

- [ ] T008 [P] [US1] Crear `server/tests/integration/parts-purchase-price.test.js`: alta y edición con los tres datos, persistencia en la siguiente consulta, categoría inválida → 400 `DATOS_INVALIDOS`, marca de 51 caracteres → 400 y de 50 → 201/200, refacción sin categoría ni marca aceptada, venta < compra guardada con `"advertencia"` en la respuesta [FR-001][FR-002][FR-004][CA-1]
- [ ] T009 [P] [US1] Crear `client/test/parts_category_brand_test.dart`: el listado de inventario muestra las columnas fijas de categoría y marca (vacías si no hay dato, sin ocultar la fila) y el formulario ofrece el selector de categoría de lista fija, la marca (≤ 50) y el precio de compra para ADMIN [FR-014][CA-1]

### Implementación de la Historia 1

- [ ] T010 [US1] Extender `server/validators/part-validator.js` con `category` (catálogo fijo, nullable), `brand` (≤ 50, nullable) y `purchasePrice` (numérico, ≥ 0, ≤ 2 decimales), con mensajes en español [FR-001][FR-002][CA-1]
- [ ] T011 [US1] Actualizar `server/models/part.js` (`aObjeto`, `create`, `update`) para leer y escribir `category`, `brand` y `purchase_price` [FR-001][CA-1]
- [ ] T012 [US1] Actualizar `server/services/part-service.js` y `server/controllers/part-controller.js`: guardar los tres datos y devolver `"advertencia": "El precio de venta es menor al precio de compra."` cuando `salePrice < purchasePrice`, sin impedir el guardado (depende de T010, T011) [FR-004][CA-1]
- [ ] T013 [P] [US1] Actualizar `client/lib/models/part.dart` con `category`, `brand` y `purchasePrice` (opcional) y el catálogo de etiquetas en español [FR-001][CA-1]
- [ ] T014 [US1] Agregar las columnas fijas de categoría y marca en `client/lib/screens/parts_screen.dart`, sin filtros nuevos (depende de T013) [FR-014][CA-1]
- [ ] T015 [US1] Agregar selector de categoría, marca y precio de compra, y mostrar la advertencia de venta < compra, en `client/lib/screens/part_form_screen.dart` (depende de T013) [FR-001][FR-004][CA-1]
- [ ] T016 [US1] Ejecutar T008 y T009 hasta verlas pasar, y repetir `npx jest parts` en `server/` para confirmar que las suites previas de refacciones siguen verdes [CA-1][CA-10]

**Punto de control**: US1 funciona sola y es demostrable (MVP).

---

## Fase 4: Historia de usuario 2 — Límites de precios y cálculo en centavos enteros (Prioridad: P2)

**Objetivo**: los tres precios y los totales rechazan valores inválidos y se calculan en centavos enteros: precio ≤ 999,999.99 y total de orden ≤ 99,999,999.99.

**Prueba independiente**: capturar precios límite (999,999.99 sí, 1,000,000.00 no), importes negativos, no numéricos o con 3 decimales; armar órdenes que lleguen y rebasen el tope de total; comprobar diferencia $0 en totales y saldos (E3 y E5 del quickstart).

### Pruebas de la Historia 2 (escribirlas primero; deben fallar) ⚠️

- [ ] T017 [P] [US2] Crear `server/tests/integration/parts-price-limits.test.js`: precio de venta y de compra negativo, no numérico, con 3 decimales → 400; 999,999.99 aceptado y 1,000,000.00 rechazado; importe de servicio o mano de obra inválido o > 999,999.99 → 400; total de orden exactamente 99,999,999.99 aceptado y mayor → 422 `ORDER_TOTAL_LIMIT_EXCEEDED` sin dejar la orden inconsistente; agregar una refacción (`POST /api/orders/:id/parts`) que haría rebasar el total → 422 `ORDER_TOTAL_LIMIT_EXCEEDED` sin cambiar stock ni la orden, y una que lo deja exactamente en 99,999,999.99 se acepta; dos líneas idénticas pueden coexistir (sin 409) [FR-003][CA-2]
- [ ] T018 [P] [US2] Agregar aserciones de centavos (diferencia $0 con importes como 0.10 + 0.20 y 19.99 × cantidades) a `server/tests/integration/order-totals-parts.test.js` [FR-007][CA-5]
- [ ] T019 [P] [US2] Agregar aserciones de saldo y pagos en centavos (diferencia $0 tras varios pagos con decimales) a `server/tests/integration/payments.test.js` [FR-007][CA-5]

### Implementación de la Historia 2

- [ ] T020 [US2] Agregar el límite de 999,999.99 a los tres precios en `server/validators/part-validator.js`, con mensajes separados para negativo, decimales y límite, apoyado en `server/utils/money.js` (secuencial con T010: mismo archivo) [FR-003][CA-2]
- [ ] T021 [P] [US2] Limitar el importe de cada partida (servicio y mano de obra) en `server/validators/order-validator.js` [FR-003][CA-2]
- [ ] T022 [US2] Pasar `calcularTotales`/`findTotals` y las líneas de `server/models/order.js` a centavos enteros, presentando 2 decimales [FR-007][CA-5]
- [ ] T023 [US2] En `server/services/order-service.js` validar que el total resultante no rebase 99,999,999.99 (en centavos) al agregar servicios, mano de obra **y refacciones** (`agregarRefaccion`, antes de descontar stock) y responder `422 ORDER_TOTAL_LIMIT_EXCEEDED`; sin traducciones de línea duplicada; actualizar el docstring de `obtenerTotalOrden` (depende de T022) [FR-003][CA-2]
- [ ] T024 [US2] Reemplazar `redondear` por aritmética en centavos en `server/services/payment-service.js` (saldo, montos y comparaciones) sin cambiar el comportamiento observable (depende de T006) [FR-007][CA-5]
- [ ] T025 [US2] Ejecutar T017, T018, T019 y T005 hasta verlas pasar, más `npm test` completo para confirmar que las suites previas no se rompen [CA-2][CA-5][CA-10]

**Punto de control**: US2 verificable sola; los totales no tienen diferencias de redondeo.

---

## Fase 5: Historia de usuario 3 — El precio de compra solo lo ve administración (Prioridad: P2)

**Objetivo**: `purchasePrice` solo se entrega al rol ADMIN y solo ADMIN escribe categoría, marca y precio de compra, con permisos validados en el backend.

**Prueba independiente**: con tokens de ADMIN, RECEPTIONIST y MECHANIC, consultar `GET /api/parts` y probar `POST`/`PUT`; solo ADMIN recibe el campo y solo ADMIN escribe (E4 del quickstart).

### Pruebas de la Historia 3 (escribirlas primero; deben fallar) ⚠️

- [ ] T026 [P] [US3] Crear `server/tests/contract/parts-role-visibility.test.js`: la clave `purchasePrice` (no `null`) está ausente para MECHANIC y RECEPTIONIST y presente para ADMIN en `GET /api/parts`, `GET /api/parts?pending-price=true` y la búsqueda `GET /api/parts?q=`; ausente para todos los roles no ADMIN en el detalle de orden `GET /api/orders/:id`, en las respuestas de `POST /api/orders/:id/parts` y `DELETE /api/orders/:id/parts/:partId` (no existe `GET /api/orders/:id/parts`) y en la consulta de tickets; y una prueba unitaria de que `aObjeto` sin opción omite `purchasePrice`; `POST`/`PUT` de `category`, `brand` o `purchasePrice` con otro rol → 403 `NO_AUTORIZADO`, sin cambiar datos [FR-005][FR-006][CA-3][CA-4]
- [ ] T027 [P] [US3] Agregar a `client/test/part_price_test.dart` o `client/test/parts_category_brand_test.dart` el caso de que, con un usuario no ADMIN (`AuthProvider.esAdmin == false`, p. ej. RECEPTIONIST, que sí ve la sección Inventario), ni el listado ni el formulario muestran el precio de compra [FR-005][CA-3]

### Implementación de la Historia 3

- [ ] T028 [US3] Filtrar `purchasePrice` según el rol en `server/services/part-service.js` (`listar`, `crear` y `editar`; no existe `GET /api/parts/:id`) y recibir el rol desde `server/controllers/part-controller.js`; en `server/models/part.js` hacer que `aObjeto` omita `purchasePrice` por defecto (falla cerrada) y lo incluya solo con `{ incluirPrecioCompra: true }`, que el servicio activa únicamente para ADMIN; ajustar `findAll` para no pasar el índice de `map` como opción [FR-005][CA-3]
- [ ] T029 [US3] Confirmar que `POST`/`PUT` de refacciones siguen protegidos con `requireRole('ADMIN')` en `server/routes/part-routes.js` (verificación: ya usan `requireRole('ADMIN')`, que se ejecuta antes del controlador y de validar el cuerpo; sin cambio de código esperado) [FR-006][CA-4]
- [ ] T030 [P] [US3] Mostrar el precio de compra en `client/lib/screens/parts_screen.dart` y `client/lib/screens/part_form_screen.dart` solo si `context.watch<AuthProvider>().esAdmin` es verdadero (el rol sale de `usuario.role` en `client/lib/providers/auth_provider.dart`, getter `esAdmin`, patrón ya usado en `maintenances_screen.dart`). La sección Inventario NO es solo de ADMIN: `client/lib/widgets/app_shell.dart` la muestra a ADMIN y RECEPTIONIST (MECHANIC no la ve) y ni `parts_screen.dart` ni `part_form_screen.dart` consultan el rol hoy, así que el campo debe condicionarse explícitamente; la protección real sigue siendo la del backend [FR-005][CA-3]
- [ ] T031 [US3] Ejecutar T026 y T027 hasta verlas pasar [CA-3][CA-4]

**Punto de control**: US3 verificable por rol; ningún otro rol recibe el precio de compra.

---

## Fase 6: Historia de usuario 4 — Cobro de Mercado Pago desfasado detectado y resuelto (Prioridad: P3)

**Objetivo**: un cobro `MERCADO_PAGO` `PENDING` cuyo importe ya no coincide con el **saldo pendiente** (total − pagos `COMPLETED`) pasa a `STALE`: no se confirma, no cuenta como pago vigente y permite crear uno nuevo; su importe jamás cambia. Un cobro correcto por el saldo tras un pago parcial NO se marca `STALE`.

**Prueba independiente**: crear un cobro pendiente, cambiar el total y comprobar `STALE`, rechazo de confirmación, saldo sin descontarlo y nuevo cobro permitido; y el caso de pago parcial (E6 y E6b del quickstart).

### Pruebas de la Historia 4 (escribirlas primero; deben fallar) ⚠️

- [ ] T032 [P] [US4] Crear `server/tests/integration/payments-stale.test.js`: cambio de total → el cobro se devuelve `STALE` al listar; `verify` no lo confirma (queda `STALE` o `409 PAYMENT_NOT_MODIFIABLE`); `cobrado` y `saldoPendiente` no lo descuentan; se permite un nuevo cobro sin `PAYMENT_DUPLICATE_PENDING`; el `monto` original queda intacto; con total sin cambio el cobro permanece `PENDING`; los pagos manuales y `COMPLETED` nunca pasan a `STALE`; si el total vuelve a coincidir con el importe de un cobro ya `STALE`, este sigue `STALE` (terminal); un cobro digital por un importe menor al saldo creado por la API queda `STALE` en la siguiente consulta (consecuencia aceptada de D6) y `crearCobroDigital` no marca `STALE` por sí mismo. La concurrencia (dos cambios simultáneos del total) queda como riesgo aceptado sin prueba automatizada [FR-008][FR-009][CA-6]
- [ ] T033 [US4] Escenario E6b en el mismo `server/tests/integration/payments-stale.test.js` (bloque propio, después de T032; sin `[P]` porque comparte archivo): orden con total $2,000, pago manual `COMPLETED` de $800, cobro digital de $1,200 (= saldo) → al listar y al verificar permanece `PENDING` y la verificación lo confirma (`COMPLETED`); caso contrario: tras otro pago manual de $100 el cobro de $1,200 pasa a `STALE` [FR-008][FR-009][CA-6]
- [ ] T034 [P] [US4] Crear `server/tests/integration/payments-compat.test.js`: la prueba crea **sus propios fixtures** dentro del archivo (orden, pagos manuales y digitales, ticket) y no depende de `apply-seeds` ni de los datos del seed 007 (las suites Jest no aplican seeds); verifica que pagos y tickets emitidos antes del cambio se consultan idénticos en importes, folios y contenido, sin mostrar `STALE` en pagos anteriores [FR-012][CA-7]
- [ ] T035 [P] [US4] Crear `client/test/stale_payment_chip_test.dart`: un pago `STALE` se muestra con el chip "Desfasado" con los tokens de color del tema y no ofrece confirmar [FR-008][CA-6]

### Implementación de la Historia 4

- [ ] T036 [US4] Agregar en `server/models/payment.js` el estado `STALE` y `markStaleMismatchedDigital(orderId, saldoCentavos)` (`UPDATE … SET status='STALE' WHERE order_id=? AND status='PENDING' AND method='MERCADO_PAGO' AND amount <> <saldo con 2 decimales>`), sin tocar `sumCompletedByOrder` ni `findPendingDigitalByOrder` [FR-008][CA-6]
- [ ] T037 [US4] En `server/services/payment-service.js` llamar al marcado perezoso en `listar` (tras `expireStaleDigital`, con el saldo ya calculado) y en `verificarCobro` (tras la caducidad y antes de consultar al proveedor; si no coincide con el saldo, `PENDING → STALE` y se devuelve sin confirmar); no llamarlo en `crearCobroDigital` ni en el panel (depende de T024 y T036) [FR-008][FR-009][CA-6]
- [ ] T038 [US4] Mensaje de `409 PAYMENT_NOT_MODIFIABLE` sobre un pago `STALE` en `server/services/payment-service.js` que mencione el estado desfasado [FR-009][CA-6]
- [ ] T039 [P] [US4] Agregar el estado `STALE` (etiqueta "Desfasado") a `client/lib/models/payment.dart` y a `client/lib/providers/payments_provider.dart` [FR-008][CA-6]
- [ ] T040 [US4] Mostrar el chip "Desfasado" (tokens existentes de advertencia) en `client/lib/screens/payment_form_screen.dart` (junto a `EXPIRED`, donde se resuelve la etiqueta de estado) y `client/lib/models/payment.dart`, sin tocar `order_detail_screen.dart`; y refrescar los pagos antes de ofrecer un cobro nuevo (depende de T039) [FR-008][CA-6]
- [ ] T041 [US4] Ejecutar T032 a T035 hasta verlas pasar y confirmar que `digital-payments.test.js`, `dashboard.test.js` y `payments.test.js` previas siguen en verde [CA-6][CA-7][CA-10]

**Punto de control**: US4 verificable; ningún cobro correcto con pagos parciales se marca `STALE`.

---

## Fase 7: Historia de usuario 5 — Datos de ejemplo cargables varias veces (Prioridad: P3)

**Objetivo**: los seeds 001 a 008 se corren dos veces sin duplicar filas ni reiniciar datos de trabajo (incluido el stock), y las refacciones de ejemplo traen categoría, marca, precio de compra y precio de venta (la batería, refacción 7, conserva `sale_price` NULL).

**Prueba independiente**: base limpia, migraciones, seeds dos veces, comparar conteos (E1 del quickstart). Las suites Jest no aplican seeds: la doble corrida se valida fuera de Jest.

### Implementación de la Historia 5 (ya hecha en el commit `1907be2`)

- [X] T042 [US5] `database/seeds/004_demo_service_orders.sql`: IDs fijos en `order_services` (1–4), `order_labor` (1–2) y `order_entries` (1–5) para que su `ON DUPLICATE KEY UPDATE` reutilice filas (H-14); sin llaves únicas ni borrados [FR-010][CA-8]
- [X] T043 [US5] `database/seeds/005_demo_parts.sql`: `category`, `brand` y `purchase_price` en las 7 refacciones (rama `ON DUPLICATE KEY UPDATE` sin `stock`), batería (ID 7) sin `sale_price`, usos congelados de la orden 2 y movimientos con el stock absoluto final [FR-010][FR-011][CA-8][CA-9]
- [X] T044 [US5] `database/seeds/008_demo_part_prices.sql`: solo precios, categoría y marca de las 7 refacciones (batería con `sale_price` NULL), sin tocar `stock`, usos ni movimientos [FR-010][FR-011][CA-8][CA-9]

### Verificación de la Historia 5 (pendiente)

- [ ] T045 [US5] **VERIFICACIÓN**: sobre una base limpia (recrear `motorix_test`), correr `node database/scripts/apply-migrations.mjs` (001–017) y luego `node database/scripts/apply-seeds.mjs` **dos veces**; comparar los conteos de `clients`, `vehicles`, `appointments`, `service_orders`, `order_services` (orden 2 = 2 servicios $600; orden 4 = 2 servicios $950), `order_labor`, `order_entries`, `parts`, `order_parts`, `inventory_movements`, `payments` y `tickets`, y confirmar que son idénticos, que el stock de cada refacción no se reinicia (11 / 34 / 5 en las refacciones 1, 3 y 7 y `stock = IN + OUT − ajustes`), que las 7 refacciones traen categoría, marca y precio de compra, y que la batería conserva `salePrice = NULL`; guardar la salida como evidencia (depende de T003, T004) [FR-010][FR-011][CA-8][CA-9]
- [ ] T046 [US5] **VERIFICACIÓN**: sobre esa misma base ejecutar `npm test` en `server/` y el script `docs/evidencias/aseguramiento/quickstart-005.mjs` para confirmar que las suites y la evidencia de la spec 005 (R-06/H-14) siguen en verde tras migración 017 y seeds modificados (depende de T045) [CA-8][CA-10]

**Punto de control**: seeds idempotentes comprobados; sin nuevas duplicaciones. Las duplicaciones previas en bases ya contaminadas por el H-14 no se limpian (decisión vigente).

---

## Fase 8: Documentación y cierre

**Propósito**: documentación sin contradicciones y validación final.

- [ ] T047 [P] Actualizar `docs/project-context.md`: estados de pago con **Desfasado (`STALE`)** (sección 6.8), entidad `Part` con `category`, `brand` y `purchasePrice` (solo ADMIN), regla de `STALE` contra el saldo pendiente, topes de precio/total y centavos enteros, y corregir cualquier texto que diga que el total es solo servicios + mano de obra [FR-013][CA-11]
- [ ] T048 [P] Actualizar `docs/design-system.md`: chip de estado "Desfasado" (ámbar/advertencia) en la convención de estados de pago y columnas de categoría y marca en el listado de inventario (8.2) [FR-013][CA-11]
- [ ] T049 Buscar y corregir en `server/` y `client/lib/` los comentarios y docstrings que afirmen que las refacciones no suman importe o que el total es solo servicios + mano de obra (candidatos: `server/services/order-service.js` en `obtenerTotalOrden` y `server/models/order.js` en `calcularTotales`); registrar el resultado de la búsqueda `grep` sin coincidencias obsoletas [FR-013][CA-11]
- [ ] T050 Ejecutar el escenario E9 de `quickstart.md` (revisión de T047 a T049) y dejar constancia del diff revisado; no se tocan specs anteriores [CA-11]
- [ ] T051 Ejecutar los escenarios E1 a E9 y E6b de `quickstart.md` sobre `motorix_test` recreada y registrar el resultado [CA-1][CA-2][CA-3][CA-4][CA-5][CA-6][CA-7][CA-8][CA-9][CA-11]
- [ ] T052 Corrida final: `npm test` en `server/` y `flutter test` en `client/`; todas las suites previas y las nuevas (límites, permisos por rol, centavos, `STALE`, compatibilidad) en verde, y revisión contra la constitución y `docs/reglas.md` (español, permisos en backend, sin secretos, commits por Conventional Commits) [FR-015][CA-10]

---

## Trazabilidad CA → tareas

| CA | Pruebas (primero) | Implementación / verificación |
|---|---|---|
| CA-1 | T008, T009 | T003, T010, T011, T012, T013, T014, T015, T016 |
| CA-2 | T017 | T003, T007, T020, T021, T023, T025 |
| CA-3 | T026, T027 | T028, T030, T031 |
| CA-4 | T026 | T029, T031 |
| CA-5 | T005, T018, T019 | T006, T022, T024, T025 |
| CA-6 | T032, T033, T035 | T003, T036, T037, T038, T039, T040, T041 |
| CA-7 | T034 | T041 |
| CA-8 | T045 (verificación) | T004, T042, T043, T044, T045, T046 |
| CA-9 | T045 (verificación) | T043, T044, T045 |
| CA-10 | T001, T002 | T016, T025, T041, T046, T052 |
| CA-11 | T050 | T047, T048, T049, T050 |

Todos los CA (CA-1 a CA-11) tienen al menos una tarea. CA-8, CA-9 y CA-11 se validan por escenarios del quickstart y revisión documentada, no por Jest (decisión D9 de `research.md`).

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (Fase 1)**: sin dependencias.
- **Base común (Fase 2)**: depende de la Fase 1 y **bloquea** todas las historias. Dentro de ella: T003 → T004; T005 → T006; T007 es independiente.
- **Historias (Fases 3 a 7)**: dependen de la Fase 2. US1 es el MVP.
- **Cierre (Fase 8)**: depende de las historias deseadas; T047 y T048 pueden empezar cuando US4 y US1 definan su contenido, T052 es siempre la última.

### Dependencias entre historias

- **US1 (P1)**: tras la Fase 2; sin dependencias de otras historias.
- **US2 (P2)**: tras la Fase 2 y **depende de US1 (T010, T011)**: T017 prueba el límite de `purchasePrice` y T020 comparte `server/validators/part-validator.js` (T020 después de T010).
- **US3 (P2)**: tras la Fase 2 y **depende de US1 (T010–T012)**: sus pruebas necesitan que exista `purchasePrice`; además comparte `part-service.js`, `part-controller.js` y las pantallas de inventario, por lo que T028 y T030 van después de T012, T014 y T015.
- **US4 (P3)**: tras la Fase 2 y **depende de US2 (T024)**, porque T037 usa el saldo en centavos.
- **US5 (P3)**: los seeds ya están hechos; la verificación T045 depende de T003 y T004 (la migración 017 debe estar aplicada).

### Dentro de cada historia

- Las pruebas se escriben primero y deben fallar antes de implementar.
- Modelos → servicios/controladores → cliente; cada historia termina con su tarea de ejecución de pruebas.

### Oportunidades de paralelismo

- Fase 2: T005 y T007 en paralelo con T003.
- US1: T008, T009 y T013 en paralelo; US2: T017, T018, T019 y T021 en paralelo; US3: T026, T027 y T030 en paralelo; US4: T032, T034, T035 y T039 en paralelo (T033 va después de T032 porque comparte archivo y por eso no lleva `[P]`).
- Con varias personas, tras la Fase 2 US1, US2 y US4 pueden avanzar a la vez si se coordinan los archivos compartidos indicados arriba.

## Estrategia de implementación

1. Fase 1 y Fase 2 (base común).
2. US1 como MVP → validar con E2.
3. US2 y US3 → validar con E3, E4 y E5.
4. US4 → validar con E6 y E6b.
5. US5 → ejecutar la verificación T045 y T046 (los seeds ya están hechos).
6. Fase 8: documentación y corrida final.

## Notas

- Los seeds 004, 005 y 008 no se modifican en esta fase de tareas; solo se verifican.
- Verificar que cada prueba falle antes de implementar.
- Commits pequeños, en español y con Conventional Commits (por ejemplo `feat(parts): agregar categoría, marca y precio de compra`).
- Evitar tareas vagas, conflictos de archivo y dependencias entre historias que rompan su independencia.
