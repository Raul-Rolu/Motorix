---

description: "Lista de tareas para la feature 005-precio-venta-refacciones"
---

# Tareas: Precio de venta de refacciones y total de la orden

**Input**: Documentos de diseño de `/specs/005-precio-venta-refacciones/`

**Prerrequisitos**: plan.md, spec.md, research.md, data-model.md, contracts/api-rest.md, quickstart.md

**Pruebas**: Sí — el usuario las solicita explícitamente y van ANTES de la implementación de cada historia (primero las pruebas, que deben fallar; después, la implementación que las hace pasar).

**Organización**: Agrupadas por historia de usuario para permitir implementación y prueba independientes. Cada tarea cita entre corchetes el requisito (FR-xxx) o criterio de aceptación (CA-xx) que cumple.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias de tareas incompletas)
- **[Historia]**: historia de usuario a la que pertenece (US1, US2, US3); las fases de preparación y pulido no llevan etiqueta
- Cada tarea indica el archivo exacto y su trazabilidad `[FR-xxx]`/`[CA-xx]`

## Convención de rutas

- Backend: `server/` (capas `models/`, `services/`, `controllers/`, `routes/`, `validators/`, `utils/`); pruebas en `server/tests/{unit,integration,contract}/`
- Frontend: `client/lib/` (models, providers, screens) y `client/test/`
- Datos: `database/migrations/`, `database/seeds/`

---

## Fase 1: Preparación (infraestructura compartida)

**Propósito**: esquema, datos de ejemplo y ajuste de la preparación de las pruebas existentes; todo lo demás depende de esta fase.

- [X] T001 Crear la migración `database/migrations/016_add_part_prices.sql` que agrega `parts.sale_price DECIMAL(10,2) NULL` con `CHECK (sale_price >= 0)` y `order_parts.unit_price DECIMAL(10,2) NULL` con `CHECK (unit_price >= 0)`, sin editar las migraciones 001–015 [FR-001][FR-004]
- [X] T002 Crear el seed idempotente `database/seeds/008_demo_part_prices.sql` (IDs fijos + `ON DUPLICATE KEY UPDATE`): precios de venta para las refacciones 1–6, una refacción nueva activa SIN precio para el filtro de pendientes, y usos con `unit_price` congelado en la orden 2 con sus movimientos `OUT` y **stock fijado en valores absolutos** que satisfagan `stock = IN + OUT + ajustes` (≥ 0, sin depender del stock previo, para que el seed sea reejecutable), sin editar los seeds 001–007 [FR-015][FR-003][CA-20]
- [X] T003 Adaptar la PREPARACIÓN de las pruebas existentes que agregan refacciones a órdenes — registrar primero un precio de venta en la preparación de cada caso, SIN cambiar ninguna aserción — en `server/tests/integration/order-parts.test.js`, `server/tests/contract/order-parts.contract.test.js` y el barrido de `server/tests/integration/inventory.test.js` y `server/tests/integration/parts*.test.js` [FR-005][CA-8]
- [X] T004 Agregar los códigos de error nuevos al catálogo en `server/utils/errors.js`: `PART_SIN_PRECIO` (409) y `TOTAL_INCOMPLETO` (409, con `details.refaccionesSinPrecio`) [FR-005][FR-008]

**Punto de control**: esquema 016 aplicable, seed 008 cargable sin romper la consistencia de stock y las suites existentes pasan con la sola adaptación de preparación.

---

## Fase 2: Fundacional (bloqueante para todas las historias)

**Propósito**: componentes compartidos sin los cuales ninguna historia puede completarse.

- [X] T005 Verificar que `server/tests/helpers/db-test.js` reconstruye el esquema de prueba con la migración 016 incluida (la base `motorix_test` debe tener `sale_price` y `unit_price` disponibles para todas las suites) [FR-001][FR-004]

**Punto de control**: la base de pruebas soporta los campos nuevos; las historias pueden avanzar en paralelo.

---

## Fase 3: Historia de usuario 1 — Precio de venta en la ficha de la refacción (Prioridad: P1) ★ MVP

**Objetivo**: administración registra y modifica el precio de venta; el inventario lista los pendientes de precio; roles restringidos.

**Prueba independiente**: registrar un precio en una refacción, verificar que se guarda y consulta, que el filtro `pending-price` lista las pendientes y las deniega a roles no autorizados, sin tocar órdenes, cobros ni tickets.

### Pruebas para la Historia de usuario 1 (PRIMERO; deben fallar)

- [X] T006 [P] [US1] Prueba unitaria del validador con `salePrice` válido, `null`, negativo y no numérico en `server/tests/unit/validators/part-validator-part-price.test.js` [FR-001][CA-2]
- [X] T007 [P] [US1] Prueba de integración de `POST /api/parts` y `PUT /api/parts/:id` con `salePrice` (guardado, consulta, rechazo negativo) en `server/tests/integration/parts-sale-price.test.js` [FR-001][CA-1][CA-2]
- [X] T008 [P] [US1] Prueba de integración del filtro `GET /api/parts?pending-price=true` (lista pendientes, lista vacía cuando todas tienen precio, solo activas) en `server/tests/integration/parts-pending-price.test.js` [FR-003][CA-17]
- [X] T009 [P] [US1] Pruebas de contrato con `salePrice` y denegación por rol (mecánico/recepción) en `server/tests/contract/parts.contract.test.js` [FR-002][CA-16]
- [X] T010 [P] [US1] Prueba de Flutter del modelo `salePrice` (con precio, sin precio) en `client/test/part_price_test.dart` [FR-001]

### Implementación para la Historia de usuario 1

- [X] T011 [P] [US1] Agregar `salePrice` al mapeo y a la consulta del modelo en `server/models/part.js` (incluido el filtro `sale_price IS NULL AND is_active = 1` para pendientes) [FR-001][FR-003]
- [X] T012 [US1] Validar `salePrice` (decimal no negativo o ausente/`null`) en `server/validators/part-validator.js` [FR-001][CA-2]
- [X] T013 [US1] Aceptar y persistir `salePrice` en alta y edición en `server/services/part-service.js`, con la denegación a roles distintos de ADMIN verificada en el servidor en `server/routes/part-routes.js` y `server/controllers/part-controller.js` [FR-001][FR-002][CA-16]
- [X] T014 [US1] Exponer el query param `pending-price` en `server/controllers/part-controller.js` (delegando el filtro al modelo de T011) [FR-003][CA-17]
- [X] T015 [US1] Agregar `salePrice` a `client/lib/models/part.dart`, el filtro de pendientes a `client/lib/providers/parts_provider.dart`, el precio en `client/lib/screens/parts_screen.dart` (con indicador ámbar de pendiente) y el campo de precio en `client/lib/screens/part_form_screen.dart`, siguiendo `docs/design-system.md` [FR-001][FR-003][CA-1][CA-17]

**Punto de control**: la US1 es funcional y verificable por sí sola — precio visible y editable en la ficha, pendientes listados, roles validados.

---

## Fase 4: Historia de usuario 2 — Total de la orden con refacciones (Prioridad: P2)

**Objetivo**: el total de la orden suma refacciones usadas por su cantidad con precio congelado; rechazo al agregar refacción sin precio; adopción de precios en órdenes abiertas no liquidadas.

**Prueba independiente**: agregar refacciones con precio a una orden en curso y verificar el total (servicios + mano de obra + precio × cantidad) sin registrar pagos.

### Pruebas para la Historia de usuario 2 (PRIMERO; deben fallar)

- [X] T016 [P] [US2] Prueba unitaria del cálculo de totales con `unit_price × quantity` y bandera `partsIncomplete` (incluido el caso sin partes: total $0) en `server/tests/unit/order-totals-parts.test.js` [FR-007][FR-008][CA-7]
- [X] T017 [P] [US2] Prueba de integración de `POST /api/orders/:id/parts` con precio: uso guardado con `unitPrice` congelado, stock descontado y total reflejado; cambio de precio posterior sin alterar el total pero elevando el importe al agregar la refacción a una orden nueva (CA-5); y actualización del contrato de detalle `server/tests/contract/orders-detail.contract.test.js` con `refacciones` y `totalCompleto` en la respuesta, en `server/tests/integration/order-totals-parts.test.js` [FR-004][FR-006][FR-007][CA-3][CA-4][CA-5][CA-6]
- [X] T018 [P] [US2] Prueba de integración del rechazo `PART_SIN_PRECIO` (sin cambio de total ni de stock) y del retiro que baja el total, en `server/tests/integration/order-parts-rejection.test.js` [FR-005][FR-007][CA-8][CA-15]
- [X] T019 [P] [US2] Prueba de integración de la adopción de precio al editar la refacción (orden abierta parcialmente pagada adopta y ajusta saldo; orden pagada y entregada/cancelada quedan intactas) en `server/tests/integration/part-price-adoption.test.js` [FR-011][CA-11][CA-19]

### Implementación para la Historia de usuario 2

- [X] T020 [US2] Ampliar `findTotals` en `server/models/order.js` para sumar `order_parts.unit_price × quantity` (solo líneas con precio) y devolver `partsIncomplete`/`totalCompleto`, incluida la suma de refacciones en el historial de vehículo (`historialVehiculo`) [FR-007][FR-008][CA-6]
- [X] T021 [US2] Rechazar el uso sin precio con `PART_SIN_PRECIO` y registrar el uso con `unitPrice` = `salePrice` vigente en `server/services/order-service.js` (`agregarRefaccionOrden`, `obtenerPorId`), conservando el comportamiento existente del retiro [FR-004][FR-005][CA-3][CA-8]
- [X] T022 [US2] Implementar la adopción dirigida en `server/models/part.js` (`UPDATE order_parts SET unit_price = :nuevo WHERE part_id = :id AND unit_price IS NULL` sobre órdenes `status NOT IN ('ENTREGADO','CANCELADA')` y no liquidadas) invocada desde `server/services/part-service.js` al asignar o cambiar precio [FR-011][CA-11][CA-19]
- [X] T023 [US2] Actualizar `client/lib/models/order_part.dart` (`unitPrice`, `amount`), `client/lib/providers/orders_provider.dart` y `client/lib/screens/order_detail_screen.dart` para mostrar las líneas de refacción con precio e importe y el total con refacciones, con aviso ámbar de total incompleto [FR-007][CA-6]

**Punto de control**: las US1 y US2 funcionan de forma independiente — la orden muestra el total correcto con refacciones y la adopción resuelve los usos antiguos.

---

## Fase 5: Historia de usuario 3 — Cobro y ticket con el total completo (Prioridad: P3)

**Objetivo**: el cobro y el ticket reflejan el total con refacciones; bloqueo `TOTAL_INCOMPLETO` en ambos.

**Prueba independiente**: registrar un pago y generar el ticket de una orden con refacciones y verificar total idéntico y desglose, sin importar el método de cobro.

### Pruebas para la Historia de usuario 3 (PRIMERO; deben fallar)

- [ ] T024 [P] [US3] Prueba de integración de pagos con total que incluye refacciones (saldo = total − pagos; liquidación) y bloqueo `TOTAL_INCOMPLETO` en `POST /api/orders/:id/payments` y `/payments/digital`, en `server/tests/integration/payments-parts-total.test.js` [FR-009][FR-012][CA-10][CA-12]
- [ ] T025 [P] [US3] Prueba de integración del ticket con desglose de refacciones (cantidad, precio, importe; total idéntico al de la orden) y bloqueo `TOTAL_INCOMPLETO` en emisión y consulta en una orden no liquidada; y del ticket de una orden **ya liquidada** con usos sin precio: se emite con el total histórico y las líneas marcadas `sinPrecio`, en `server/tests/integration/tickets-parts.test.js` [FR-010][FR-013][FR-014][FR-016][CA-13][CA-14][CA-21]
- [ ] T026 [P] [US3] Pruebas de contrato actualizadas con el total con refacciones y los nuevos códigos en `server/tests/contract/payments.contract.test.js` y `server/tests/contract/tickets.contract.test.js` [FR-009][FR-010]
- [ ] T027 [P] [US3] Extender la prueba de flujo de pago de Flutter con el aviso de total incompleto en `client/test/payment_flow_test.dart` y el desglose del ticket en `client/test/ticket_test.dart` [FR-009][FR-013]

### Implementación para la Historia de usuario 3

- [ ] T028 [US3] Usar el total con refacciones y bloquear con `TOTAL_INCOMPLETO` (antes de `PAYMENT_EXCEEDS_BALANCE`) en `server/services/payment-service.js` (`listar`, `registrar`, `crearCobroDigital`) [FR-009][FR-012][CA-10][CA-12]
- [ ] T029 [US3] Agregar el desglose `{ nombre, codigo, cantidad, unitPrice, amount }` y el bloqueo `TOTAL_INCOMPLETO` (solo en órdenes no liquidadas) en emisión/consulta y en la emisión automática en `server/services/ticket-service.js`; en órdenes ya liquidadas emitir sin bloqueo, con `unitPrice`/`amount` nulos y `"sinPrecio": true` en las líneas sin precio [FR-010][FR-013][FR-014][FR-016][CA-13][CA-14][CA-21]
- [ ] T030 [US3] Mostrar el desglose con precios en `client/lib/screens/ticket_screen.dart` con `client/lib/providers/ticket_provider.dart` (las líneas con `sinPrecio` se muestran como **"sin precio"** en lugar del importe), y el aviso/bloqueo de total incompleto en `client/lib/screens/payment_form_screen.dart` con `client/lib/providers/payments_provider.dart` [FR-009][FR-010][FR-016][CA-13][CA-21]

**Punto de control**: las tres historias funcionan de forma independiente y el flujo completo orden → cobro → ticket refleja el total con refacciones.

---

## Fase 6: Pulido y aspectos transversales

**Propósito**: verificación integral, documentación y limpieza; afecta a todas las historias.

- [ ] T031 [P] Ejecutar la validación completa de `specs/005-precio-venta-refacciones/quickstart.md`: aplicar 016 y 008 en una base limpia y recorrer los 8 escenarios manuales [CA-20][CA-17]
- [ ] T032 [P] Ejecutar las suites completas (`cd server && npm test` contra `motorix_test` y `cd client && flutter test`) y confirmar que ningún flujo de los sprints 1–4 quedó roto [FR-005][CA-8]
- [ ] T033 [P] Actualizar `database/README.md` con la migración 016 y el seed 008 en sus listados correspondientes [FR-015]
- [ ] T034 Revisión final de consistencia: precios `DECIMAL(10,2)` redondeados a 2 decimales con la utilidad existente, mensajes de éxito/error visibles y tokens del sistema de diseño en los cambios de Flutter [FR-001][CA-1]

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Fase 1 (Preparación)**: sin dependencias — puede iniciar de inmediato. **Bloquea todo lo demás.**
- **Fase 2 (Fundacional)**: depende de T001 (la migración 016 debe existir para la base de pruebas) — **bloquea las historias**.
- **Fase 3 (US1)**: depende de las fases 1–2.
- **Fase 4 (US2)**: depende de las fases 1–2; usa `salePrice` de US1 en la adopción (depende funcionalmente de T011–T013, pero sus pruebas pueden escribirse en paralelo).
- **Fase 5 (US3)**: depende de US2 para el total con refacciones en pagos y ticket (T020–T021); las pruebas T024–T027 pueden escribirse en paralelo con la implementación de US2.
- **Fase 6 (Pulido)**: depende de las historias deseadas (mínimo US1 para el MVP; idealmente las tres).

### Dependencias dentro de cada historia

- Las pruebas (T006–T010, T016–T019, T024–T027) se escriben y deben FALLAR antes de la implementación de su historia.
- Modelo → validador → servicio → controlador/rutas → frontend, en ese orden.
- T012 depende de T006 (prueba del validador antes); T013 depende de T007 y T011; T014 depende de T008 y T011; T021 depende de T017 y T018; T022 depende de T019; T028 depende de T024; T029 depende de T025.

### Oportunidades de paralelismo

- T001 ∥ T004 (archivos distintos); T002 tras T001.
- T006 ∥ T007 ∥ T008 ∥ T009 ∥ T010 (pruebas de la US1, archivos distintos).
- T016 ∥ T017 ∥ T018 ∥ T019 (pruebas de la US2).
- T024 ∥ T025 ∥ T026 ∥ T027 (pruebas de la US3).
- T011 ∥ T012 (modelo y validador de la US1).
- T031 ∥ T032 ∥ T033 (pulido).
- Con equipo: un desarrollador en US1 y otro en las pruebas de US2/US3 en paralelo tras la Fase 2.

---

## Ejemplo de paralelismo: Historia de usuario 1

```text
Tarea: "Prueba unitaria del validador ... en server/tests/unit/validators/part-validator-part-price.test.js"        (T006)
Tarea: "Prueba de integración de POST /api/parts ... en server/tests/integration/parts-sale-price.test.js"          (T007)
Tarea: "Prueba de integración del filtro pending-price ... en server/tests/integration/parts-pending-price.test.js"  (T008)
Tarea: "Pruebas de contrato con salePrice ... en server/tests/contract/parts.contract.test.js"                       (T009)

# En paralelo, tras las pruebas en rojo:
Tarea: "Agregar salePrice al mapeo ... en server/models/part.js"                                                    (T011)
Tarea: "Validar salePrice ... en server/validators/part-validator.js"                                               (T012)
```

---

## Estrategia de implementación

### MVP primero (solo Historia de usuario 1)

1. Completar Fase 1 (Preparación) y Fase 2 (Fundacional).
2. Completar Fase 3 (US1: precio de venta en la ficha + pendientes + roles).
3. **PARAR y VALIDAR**: probar la US1 de forma independiente (escenarios 1 y 2 de quickstart.md).
4. Demostrar: administración asigna precios y ve los pendientes.

### Entrega incremental

1. Preparación + Fundacional → base lista.
2. US1 → probar de forma independiente → demo (MVP).
3. US2 → probar de forma independiente → demo (la orden suma refacciones y la adopción resuelve los usos antiguos).
4. US3 → probar de forma independiente → demo (cobro y ticket con total completo y bloqueos).
5. Pulido → validación rápida completa y suites en verde.

### Estrategia de equipo en paralelo

1. El equipo completa Preparación + Fundacional.
2. Una vez fundacional: Desarrollador A en US1; Desarrollador B escribe las pruebas de US2/US3 (T016–T019, T024–T027).
3. Las historias se integran y validan de forma independiente.

---

## Notas

- `[P]` = archivos distintos, sin dependencias; `[US1/US2/US3]` = trazabilidad a la historia.
- Cada tarea cita `[FR-xxx]` o `[CA-xx]` para trazabilidad por requisito.
- Trazabilidad de numeración: `FR-016` y `CA-21` se agregaron después del análisis pre-implementación (remediación del hallazgo INC-01, registrada en Clarifications, "Sesión posterior al análisis"); no renumeran tareas ni FR/CA existentes.
- Las pruebas se escriben primero y deben fallar antes de implementar.
- No se ejecutan comandos de git ni se hacen commits en esta fase; tampoco se agregan dependencias.
- Alcance mínimo del spec: sin precio de compra ni reportes de utilidad; no se modifican specs, migraciones ni seeds de los sprints 1–4.
