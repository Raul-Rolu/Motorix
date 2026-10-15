---

description: "Lista de tareas para la implementación de pagos, tickets y dashboard"
---

# Tasks: Pagos, Tickets y Dashboard

**Input**: Documentos de diseño de `/specs/004-pagos-tickets-dashboard/`

**Prerrequisitos**: [plan.md](./plan.md) (requerido), [spec.md](./spec.md) (historias), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Sí solicitados explícitamente en el spec (SC-008: las pruebas automatizadas de la lógica de pagos y de generación de tickets deben pasar íntegramente, con simulación interna del proveedor).

**Organization**: Las tareas están agrupadas por historia de usuario para permitir implementación y prueba independientes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Story]**: Historia a la que pertenece la tarea (US1, US2, US3, US4)
- Rutas exactas en cada descripción, según la estructura real del proyecto (`server/`, `client/lib/`, `database/`)

## Path Conventions

Proyecto web con backend Express (`server/`) + cliente Flutter (`client/`) + scripts SQL (`database/`), según [plan.md](./plan.md).

---

## Phase 1: Setup (Infraestructura compartida)

**Propósito**: esquema de base de datos, configuración y catálogo de errores compartido por todas las historias.

- [X] T001 [P] Ampliar `server/.env.example` con las claves `MP_MODE` (vacía, documentando `sandbox|simulated`) y `MP_ACCESS_TOKEN` (vacía), sin valores secretos, según research D6
- [X] T002 [P] Ampliar el catálogo de errores en `server/utils/errors.js` con `PAYMENT_NOT_FOUND` (404), `PAYMENT_NOT_MODIFIABLE` (409), `PAYMENT_EXCEEDS_BALANCE` (409), `PAYMENT_DUPLICATE_PENDING` (409), `ORDER_CANCELLED` (409) y `MP_PROVIDER_ERROR` (502) según contracts/api-rest.md
- [X] T003 [P] Crear migración `database/migrations/014_create_payments.sql`: tabla `payments` InnoDB/utf8mb4 con `id` INT UNSIGNED PK AUTO_INCREMENT, `order_id` NOT NULL FK → `service_orders.id` ON DELETE RESTRICT, `method` VARCHAR(16) NOT NULL (`CASH`,`CARD`,`TRANSFER`,`MERCADO_PAGO`), `amount` DECIMAL(10,2) NOT NULL, `status` VARCHAR(16) NOT NULL (`PENDING`,`COMPLETED`,`EXPIRED`), `external_reference` VARCHAR(64) NULL, `created_by` FK → `users.id`, `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP, según data-model.md
- [X] T004 [P] Crear migración `database/migrations/015_create_tickets.sql`: tabla `tickets` InnoDB/utf8mb4 con `id` PK AUTO_INCREMENT, `order_id` NOT NULL FK → `service_orders.id` UNIQUE, `folio` VARCHAR(16) NOT NULL UNIQUE con formato `TCK-AAAA-NNNN`, `issued_by` FK → `users.id`, `issued_at` DATETIME DEFAULT CURRENT_TIMESTAMP, según data-model.md
- [X] T005 Crear la semilla idempotente `database/seeds/007_demo_payments_tickets.sql` con IDs fijos y `ON DUPLICATE KEY UPDATE`: pagos manuales completados (uno que liquide su orden), un cobro digital de ejemplo, un cobro `PENDING` antiguo (más de 24 h, para demostrar el estado `EXPIRED`) y un ticket emitido (FR-021, SC-009; depende de T003, T004)
- [X] T006 Ejecutar `node .\database\scripts\apply-migrations.mjs` y `node .\database\scripts\apply-seeds.mjs` y verificar con el cliente MySQL que `payments` y `tickets` existen pobladas sin errores (depende de T003, T004, T005)

---

## Phase 2: Foundational (Prerrequisitos bloqueantes)

**Propósito**: base de pagos compartida por las cuatro historias. Ninguna historia puede empezar hasta completar esta fase.

- [X] T007 [P] Crear el modelo `server/models/payment.js` con las consultas de pagos por orden (orden `created_at` DESC), inserción inmutable (sin UPDATE de importe/método/orden) y las transiciones únicas de estado `PENDING → COMPLETED` y `PENDING → EXPIRED` (research D1; depende de T003)
- [X] T008 [P] Crear el validador `server/validators/payment-validator.js`: método en catálogo `CASH|CARD|TRANSFER|MERCADO_PAGO`, `monto` numérico mayor que cero (caso límite del spec: montos 0 o negativos se rechazan) — mensajes de error en español
- [X] T009 [P] Localizar y exponer para reutilización el cálculo del total de la orden (servicios + mano de obra + refacciones) ya usado por el historial del Sprint 3 en `server/services/order-service.js`, sin duplicar importes (FR-003, research D2)

**Checkpoint**: base de pagos y cálculo de total listos — las cuatro historias pueden iniciar.

---

## Phase 3: User Story 1 - Registro del cobro de una orden (Prioridad: P1) ⭐ MVP

**Goal**: la recepción registra pagos manuales (efectivo, tarjeta, transferencia) sobre una orden, con saldos y liquidación correctos.

**Independent Test**: registrar un pago sobre una orden existente con total calculado, verificar persistencia, asociación a la orden, cálculo de saldo y liquidación — sin Mercado Pago, tickets ni dashboard.

### Tests para User Story 1

> **NOTA: Escribir estas pruebas PRIMERO y verificar que fallan antes de implementar.**

- [X] T010 [P] [US1] Prueba de integración de registro de pago completo en `server/tests/integration/payments.test.js`: pago total en efectivo → 201, asociado a la orden, `estadoCobro` en `GET /api/orders/:id/payments` = `LIQUIDADA` (escenarios 1 y 2 de la US1)
- [X] T011 [P] [US1] Pruebas de validación en `server/tests/integration/payments-validation.test.js`: monto 0 o negativo → `DATOS_INVALIDOS` (400); monto mayor al saldo → `PAYMENT_EXCEEDS_BALANCE` (409) con `details.saldoPendiente`; orden cancelada → `ORDER_CANCELLED` (409); mecánico → 403 (escenarios 3, 4 y casos límite de la US1)
- [X] T012 [P] [US1] Prueba de contrato de `GET/POST /api/orders/:id/payments` en `server/tests/contract/payments.contract.test.js` contra `contracts/api-rest.md`: payload directo, colección bajo `datos`, errores con `{ "error": { "codigo", "mensaje" } }`

### Implementación para User Story 1

- [X] T013 [US1] Implementar `server/services/payment-service.js`: registrar pago manual (nace `COMPLETED`), listar pagos con `total`, `cobrado`, `saldoPendiente` y `estadoCobro` derivados (`PENDIENTE|PARCIAL|LIQUIDADA`), rechazar órdenes canceladas (FR-001 a FR-004, FR-020; depende de T007, T008, T009)
- [X] T014 [US1] Implementar `server/controllers/payment-controller.js` con manejo central de errores en español (depende de T013)
- [X] T015 [US1] Crear `server/routes/payment-routes.js` con `GET /api/orders/:id/payments` y `POST /api/orders/:id/payments` restringidos a ADMIN y RECEPTIONIST con el middleware de roles existente (FR-005, RN-15; depende de T014)
- [X] T016 [US1] Registrar `payment-routes` en `server/app.js` (depende de T015)
- [X] T017 [P] [US1] Crear el modelo Flutter `client/lib/models/payment.dart` con los campos del contrato (`id`, `metodo`, `monto`, `estado`, `registradoPor`, `fecha`) y los saldos (`total`, `cobrado`, `saldoPendiente`, `estadoCobro`)
- [X] T018 [P] [US1] Crear el provider `client/lib/providers/payments_provider.dart` con carga, registro de pago y errores en español (depende de T017)
- [X] T019 [US1] Crear el formulario de cobro `client/lib/screens/payment_form_screen.dart` con método (efectivo/tarjeta/transferencia), monto, confirmación antes de registrar y mensajes de éxito/error según `docs/design-system.md` (depende de T018)
- [X] T020 [US1] Añadir la sección de pagos y el botón "Cobrar" al detalle de orden en `client/lib/screens/order_detail_screen.dart`, mostrando saldos y estado de cobro (depende de T019)
- [X] T021 [US1] Prueba Flutter del flujo de cobro en `client/test/payment_flow_test.dart`: abrir detalle, registrar pago, verificar saldos y estado liquidada (depende de T020)

**Checkpoint**: la US1 queda funcional y verificable de forma independiente (V1–V3 del quickstart).

---

## Phase 4: User Story 2 - Pagos con Mercado Pago (Prioridad: P2)

**Goal**: cobro digital por enlace en sandbox, verificación bajo demanda y caducidad a las 24 h, sin datos de tarjeta.

**Independent Test**: crear un cobro digital de prueba para una orden, verificar su resultado con el simulador y comprobar que el pago queda registrado con método "Mercado Pago" y el estado que corresponda.

### Tests para User Story 2

- [X] T022 [P] [US2] Prueba unitaria de la lógica digital en `server/tests/unit/payment-digital.test.js`: doble confirmación no duplica importe (FR-010), `PENDING` con más de 24 h pasa a `EXPIRED` al consultar (expiración perezosa, research D3), expirados no cuentan para `cobrado` ni liquidan (FR-009, SC-007) — con control de reloj y sin red
- [X] T023 [P] [US2] Prueba de integración del cobro digital en `server/tests/integration/digital-payments.test.js` con `MP_MODE=simulated`: crear cobro → 201 con `enlace`; verificar → `COMPLETED`; segundo cobro simultáneo → `PAYMENT_DUPLICATE_PENDING` (409); fallo simulado del proveedor → `MP_PROVIDER_ERROR` (502) sin pagos incompletos

### Implementación para User Story 2

- [X] T024 [US2] Crear `server/services/payment-gateway.js` con la interfaz `createPaymentLink()` y `checkPaymentStatus()`, usando `fetch` nativo de Node contra la API del proveedor cuando `MP_MODE=sandbox` y un simulador interno equivalente cuando `MP_MODE=simulated`, con credenciales solo de `MP_ACCESS_TOKEN` (research D6, RN-14)
- [X] T025 [US2] Extender `server/services/payment-service.js`: crear cobro digital (pago nace `PENDING` con `external_reference`, sin cobro digital duplicado vigente), `verify` (confirmado → `COMPLETED`; mayor de 24 h sin confirmar → `EXPIRED`; transición única) y expiración perezosa al listar los pagos (FR-008 a FR-010, FR-017; depende de T024)
- [X] T026 [US2] Extender `server/controllers/payment-controller.js` con `createDigitalPayment` y `verifyPayment` (depende de T025)
- [X] T027 [US2] Extender `server/routes/payment-routes.js` con `POST /api/orders/:id/payments/digital` y `POST /api/payments/:id/verify` para ADMIN y RECEPTIONIST (depende de T026)
- [X] T028 [US2] Añadir el flujo digital a `client/lib/screens/payment_form_screen.dart` y `client/lib/providers/payments_provider.dart`: botón "Cobro con Mercado Pago", mostrar el `enlace` para compartir, acción "Verificar pago" y estados pendiente/completado/expirado con colores del sistema de diseño (depende de T027)
- [X] T029 [US2] Prueba Flutter del flujo digital en `client/test/digital_payment_test.dart`: crear cobro, mostrar enlace, verificar y ver el estado reflejado (depende de T028)

**Checkpoint**: la US2 queda funcional de forma independiente con el simulador (V4–V6 del quickstart); la demo con sandbox real queda para la fase de polish.

---

## Phase 5: User Story 3 - Ticket de servicio (Prioridad: P2)

**Goal**: ticket por orden con folio único y contenido derivado, como vista imprimible dentro de la aplicación.

**Independent Test**: generar el ticket de una orden concreta, verificar los 17 campos de FR-011, la estabilidad del folio y la acción de imprimir.

### Tests para User Story 3

- [X] T030 [P] [US3] Prueba unitaria del folio en `server/tests/unit/ticket-folio.test.js`: formato `TCK-AAAA-NNNN`, unicidad y secuencial por año (research D4)
- [X] T031 [P] [US3] Prueba de integración del ticket en `server/tests/integration/tickets.test.js`: contenido con los 17 campos de FR-011, mismo folio al regenerar (FR-012), orden cancelada → `ORDER_CANCELLED` (409), mecánico → 403, sin pagos → estado "no pagada" (escenarios 1 a 6 de la US3)

### Implementación para User Story 3

- [X] T032 [P] [US3] Crear el modelo `server/models/ticket.js` con la emisión idempotente (un ticket por `order_id`, reutilizado) y la consulta por orden (depende de T004)
- [X] T033 [US3] Crear `server/services/ticket-service.js`: derivar el contenido del ticket al vuelo desde la orden, cliente, vehículo y pagos — folio, datos del taller (configuración inicial), servicios, refacciones, mano de obra, subtotal, total, métodos de pago, estado de pago y fecha; rechazar órdenes canceladas (FR-011, FR-012, research D4; depende de T032, T013)
- [X] T034 [US3] Crear `server/controllers/ticket-controller.js` (depende de T033)
- [X] T035 [US3] Crear `server/routes/ticket-routes.js` con `GET /api/tickets/:orderId` para ADMIN y RECEPTIONIST (FR-013; depende de T034)
- [X] T036 [US3] Registrar `ticket-routes` en `server/app.js` (depende de T035)
- [X] T037 [P] [US3] Crear el modelo Flutter `client/lib/models/ticket.dart` con todos los campos del contrato de `GET /api/tickets/:orderId`
- [X] T038 [P] [US3] Crear el provider `client/lib/providers/ticket_provider.dart` con generación/recuperación del ticket (depende de T037)
- [X] T039 [US3] Crear la vista imprimible `client/lib/screens/ticket_screen.dart`: hoja estándar con el contenido completo, acción "Imprimir" que genera el documento y abre el diálogo de impresión del sistema sin librerías nuevas (research D5, FR-018) y acción de compartir por la app (depende de T038)
- [X] T040 [US3] Añadir el botón "Ver ticket" al detalle de orden en `client/lib/screens/order_detail_screen.dart` (depende de T039)
- [X] T041 [US3] Prueba Flutter del ticket en `client/test/ticket_test.dart`: generar, verificar campos clave y reabrir con el mismo folio (depende de T040)

**Checkpoint**: la US3 queda funcional de forma independiente (V7–V8 del quickstart).

---

## Phase 6: User Story 4 - Panel de control del taller (Prioridad: P3)

**Goal**: panel administrativo con los indicadores reales del taller, solo para ADMIN, con los colores del sistema de diseño.

**Independent Test**: abrir el panel con datos sembrados y comprobar que los indicadores coinciden con los listados de cada módulo; verificar que recepción y mecánico reciben 403.

### Tests para User Story 4

- [X] T042 [P] [US4] Prueba de integración del panel en `server/tests/integration/dashboard.test.js`: ADMIN → 200 con los grupos `ordenes`, `citas`, `mantenimientos`, `inventario`, `cobros`; RECEPTIONIST y MECHANIC → 403; `cobros.hoy` y `cobros.total` coinciden con la suma de pagos `COMPLETED` (escenarios 1 a 3 de la US4, FR-016)

### Implementación para User Story 4

- [X] T043 [US4] Crear `server/services/dashboard-service.js` con los agregados al vuelo: órdenes por estado, citas de hoy y próximas, mantenimientos vencidos y próximos (reusando el cálculo de vencimiento del Sprint 3), refacciones con `stock <= min_stock` y dinero cobrado del día y acumulado solo de pagos `COMPLETED`, sin tablas de resumen (FR-014, FR-015, research D7; depende de T007)
- [X] T044 [US4] Crear `server/controllers/dashboard-controller.js` (depende de T043)
- [X] T045 [US4] Crear `server/routes/dashboard-routes.js` con `GET /api/dashboard` exclusivo de ADMIN (FR-016, RN-15; depende de T044)
- [X] T046 [US4] Registrar `dashboard-routes` en `server/app.js` (depende de T045)
- [X] T047 [P] [US4] Crear el modelo Flutter `client/lib/models/dashboard.dart` con los grupos y valores del contrato de `GET /api/dashboard`
- [X] T048 [P] [US4] Crear el provider `client/lib/providers/dashboard_provider.dart` con carga y recarga manual de la vista (depende de T047)
- [X] T049 [US4] Crear `client/lib/screens/dashboard_screen.dart` con los indicadores, refresco al abrir y alertas destacadas según `docs/design-system.md` (rojo para crítico/vencido, ámbar para próximo) (FR-014, escenario 5; depende de T048)
- [X] T050 [US4] Añadir la opción "Panel" al menú de `client/lib/screens/home_content.dart`, visible únicamente para ADMIN (escenario 3; depende de T049)
- [X] T051 [US4] Prueba Flutter del panel en `client/test/dashboard_test.dart`: carga de indicadores y ausencia de la opción para roles no administradores (depende de T050)

**Checkpoint**: las cuatro historias funcionan de forma independiente (V9–V11 del quickstart).

---

## Phase 7: Polish y concerns transversales

**Propósito**: verificación integral, seguridad y documentación del cierre del sprint.

- [X] T052 [P] Actualizar `README.md` con la funcionalidad del Sprint 4 (pagos, tickets y panel), en español
- [X] T053 Ejecutar la suite completa del backend en verde: `node --experimental-vm-modules .\node_modules\jest\bin\jest.js --runInBand` desde `server/` (SC-008: ningún sprint anterior roto)
- [X] T054 Ejecutar `flutter test` desde `client/` en verde (SC-008)
- [X] T055 Recorrer los escenarios V1–V12 de `specs/004-pagos-tickets-dashboard/quickstart.md` y registrar resultados (SC-001 a SC-009)
- [X] T056 Verificación de seguridad: consultar `payments` en la base para confirmar cero datos de tarjeta (RN-14, SC-006), confirmar que `MP_ACCESS_TOKEN`/`MP_MODE` solo viven en `.env` sin versionar y probar los 403 de roles en servidor (RN-15)
- [X] T057 Escribir el informe de cierre en `specs/004-pagos-tickets-dashboard/informe-finalizacion.md` con la cobertura de FRs/SCs, resultados de pruebas y recorrido manual (patrón del Sprint 3)

---

## Dependencies & Execution Order

### Dependencias por fase

- **Setup (Fase 1)**: sin dependencias — T001 y T002 en paralelo; T003 y T004 en paralelo; T005 → T006 al final
- **Foundational (Fase 2)**: depende de Setup (T003) — **bloquea las cuatro historias**
- **User Stories (Fases 3–6)**: dependen de Foundational; entre sí son independientes y pueden ejecutarse en paralelo o en orden P1 → P2 → P2 → P3
- **Polish (Fase 7)**: depende de las historias que se deseen cerrar (para el cierre completo: las cuatro)

### Dependencias entre historias

- **US1 (P1)**: arranca tras Foundational; sin dependencias de otras historias
- **US2 (P2)**: reutiliza `payment-service.js`/rutas de US1, pero es independiente funcionalmente (se puede probar con el simulador sin UI de US1 completada)
- **US3 (P2)**: depende del servicio de pagos de US1 para el estado de pago del ticket (T033 → T013); independiente de US2 y US4
- **US4 (P3)**: depende del modelo de pagos de Foundational (T043 → T007); independiente de US2 y US3

### Dentro de cada historia

- Pruebas primero (verificando que fallan) → modelos → servicios → endpoints → UI → prueba Flutter
- Historia completa antes de pasar a la siguiente prioridad

### Oportunidades de paralelismo

- Fase 1: T001 ∥ T002 ∥ T003 ∥ T004
- Fase 2: T007 ∥ T008 ∥ T009
- US1: T010 ∥ T011 ∥ T012 (pruebas) y T017 ∥ T018 (Flutter)
- US2: T022 ∥ T023
- US3: T030 ∥ T031 (pruebas) y T037 ∥ T038 (Flutter)
- US4: T047 ∥ T048 (Flutter)
- Historias completas en paralelo: US1 ∥ US2 ∥ US3 ∥ US4 tras Foundational (con T013 previo a T033 y T007 previo a T043)

---

## Parallel Example: User Story 1

```text
# Lanzar juntas las pruebas de la US1:
Task: "Prueba de integración de registro de pago completo en server/tests/integration/payments.test.js"
Task: "Pruebas de validación en server/tests/integration/payments-validation.test.js"
Task: "Prueba de contrato de GET/POST /api/orders/:id/payments en server/tests/contract/payments.contract.test.js"

# Lanzar juntos los modelos Flutter de la US1:
Task: "Crear el modelo Flutter client/lib/models/payment.dart"
Task: "Crear el provider client/lib/providers/payments_provider.dart"
```

---

## Implementation Strategy

### MVP primero (solo US1)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (CRÍTICO — bloquea todas las historias)
3. Completar Fase 3: US1
4. **PARAR y VALIDAR**: probar la US1 de forma independiente (V1–V3)
5. Demo/entrega del MVP de cobro manual

### Entrega incremental

1. Setup + Foundational → base lista
2. US1 → probar → demo (MVP con cobro manual)
3. US2 → probar con simulador → demo (cobro digital)
4. US3 → probar → demo (ticket imprimible)
5. US4 → probar → demo (panel administrativo)
6. Polish → suite completa en verde + recorrido V1–V12 + informe

### Estrategia en paralelo (varios desarrolladores)

1. El equipo completa Setup + Foundational
2. Tras Foundational:
   - Desarrollador A: US1 (pagos manuales)
   - Desarrollador B: US3 (tickets; usa T013 en cuanto US1 lo entregue)
   - Desarrollador C: US4 (panel; usa T007 desde Foundational)
3. US2 continúa sobre la base de US1

---

## Notes

- Tareas con [P] = archivos distintos, sin dependencias
- La etiqueta [Story] vincula cada tarea a su historia para trazabilidad
- Cada historia es completable y testeable de forma independiente
- Verificar que las pruebas fallan antes de implementar
- Commitear tras cada tarea o grupo lógico (Conventional Commits en español)
- Detenerse en cada checkpoint para validar la historia por separado
- Evitar: tareas vagas, conflictos en un mismo archivo y dependencias que rompan la independencia entre historias
