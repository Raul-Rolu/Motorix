---

description: "Lista de tareas del Sprint 3: historial, mantenimiento e inventario"
---

# Tareas: Historial, mantenimiento e inventario

**Entrada**: Documentos de diseño de `/specs/003-historial-inventario/`

**Previos**: [plan.md](./plan.md) (requerido), [spec.md](./spec.md) (historias y prioridades), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/api-rest.md](./contracts/api-rest.md), [quickstart.md](./quickstart.md)

**Pruebas**: El FR-019 solicita explícitamente pruebas automatizadas (CA-8), por lo que estas tareas incluyen pruebas Jest + supertest contra `motorix_test` y `flutter test`.

**Organización**: Tareas agrupadas por historia de usuario para implementar y probar cada una de forma independiente.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: Ejecutable en paralelo (archivos distintos, sin dependencias de tareas incompletas)
- **[Story]**: Historia de usuario a la que pertenece la tarea (p. ej., US1, US2, US3)
- Rutas exactas de archivo en cada descripción; comentarios y mensajes en español, identificadores en inglés

## Fase 1: Preparación

**Propósito**: Verificar que el entorno de desarrollo del sprint está operativo

- [X] T001 Verificar el entorno: Node.js y `npm.cmd` disponibles, `server/.env` copiado desde `server/.env.example`, MySQL local activo con la base `motorix_test` creable, y Flutter en `C:\Users\rulam\Downloads\SDK Flutter\flutter\bin`

---

## Fase 2: Fundacional (previos bloqueantes)

**Propósito**: Infraestructura compartida que DEBE estar lista antes de cualquier historia de usuario

**?? CRÍTICO**: No puede iniciarse ninguna historia hasta completar esta fase

- [X] T002 Ampliar el catálogo de errores con `PART_NOT_FOUND` (404), `PART_DUPLICATE` (409), `PART_INACTIVE` (409), `PART_SIN_STOCK` (409), `MOVEMENT_INVALID` (422), `MAINTENANCE_NOT_FOUND` (404), `MAINTENANCE_NOT_MODIFIABLE` (409), `MAINTENANCE_INVALID_THRESHOLD` (422), `ORDER_CLOSED` (409), `ORDER_PART_NOT_FOUND` (404) y `FORBIDDEN_ORDER` (403) en `server/utils/errors.js`
- [X] T003 [P] Ampliar la limpieza de pruebas con las tablas nuevas `order_parts`, `inventory_movements`, `maintenance_plans` y `parts` (respetando el orden de las llaves foráneas) en `server/tests/helpers/db-test.js`

**Punto de control**: base lista; pueden iniciar las historias en paralelo

---

## Fase 3: Historia de usuario 1 - Historial de servicios del vehículo (Prioridad: P1) ?? MVP

**Meta**: El mecánico consulta el historial de servicios de un vehículo derivado de las órdenes terminadas (RN-10), con fecha, kilometraje, motivo y resumen.

**Prueba independiente**: Con las órdenes del seed 004, abrir el historial de un vehículo y verificar la lista cronológica completa; un vehículo sin órdenes muestra mensaje vacío sin error (CA-1, SC-001, SC-002).

### Pruebas para la Historia de usuario 1 ?? (primero, deben fallar)

- [X] T004 [P] [US1] Prueba de contrato de `GET /api/vehicles/:id/history` (envoltorio, campos del historial, ausencia de datos sensibles) en `server/tests/contract/vehicle-history.contract.test.js`
- [X] T005 [P] [US1] Prueba de integración del historial (solo estados `TERMINADO`/`ENTREGADO`, orden cronológico, vehículo inexistente → 404, vehículo vacío → lista vacía) en `server/tests/integration/history.test.js`

### Implementación para la Historia de usuario 1

- [X] T006 [US1] Implementar `obtenerHistorialPorVehiculo` en `server/models/order.js`: consulta a `service_orders` con `status IN ('TERMINADO','ENTREGADO')`, JOIN a `clients`, `vehicles` y `users` (mecánico), orden `created_at` por parámetro (`desc` por defecto), exponiendo `mileage_entry`, `reason`, `notes`, totales y la última `order_entries` como resumen (research D1)
- [X] T007 [US1] Implementar `historialVehiculo` en `server/services/order-service.js` (verificar que el vehículo existe, `VEHICLE_NOT_FOUND` 404)
- [X] T008 [US1] Exponer `GET /api/vehicles/:id/history` con `require-auth` y `require-role` (ADMIN, RECEPTIONIST, MECHANIC) en `server/controllers/order-controller.js` y `server/routes/vehicle-routes.js`
- [X] T009 [P] [US1] Crear el modelo Flutter `VehicleHistory` con `ServiceHistoryEntry` en `client/lib/models/vehicle_history.dart`
- [X] T010 [P] [US1] Crear `HistoryProvider` (cargar historial por vehículo, estado de carga y vacío) en `client/lib/providers/history_provider.dart`
- [X] T011 [US1] Crear la pantalla de historial con lista cronológica, mensaje vacío, indicador de carga y colores del design system en `client/lib/screens/vehicle_history_screen.dart`
- [X] T012 [US1] Agregar la acción "Historial" a cada vehículo en `client/lib/screens/vehicles_screen.dart` con su ruta en `client/lib/main.dart`

**Punto de control**: la US1 debe funcionar y probarse de forma independiente

---

## Fase 4: Historia de usuario 2 - Kilometraje registrado en cada servicio (Prioridad: P2)

**Meta**: Cada servicio del historial muestra el kilometraje registrado en su momento y la constancia de corrección (RN-3, RN-4, FR-003).

**Prueba independiente**: Verificar que el kilometraje mostrado en el historial coincide con el `mileage_entry` de la orden original y que una orden con corrección expresa se identifica como tal.

### Pruebas para la Historia de usuario 2 ?? (primero, deben fallar)

- [X] T013 [P] [US2] Prueba de integración del kilometraje en el historial (coincidencia con la orden, presencia de la marca de corrección) en `server/tests/integration/history-mileage.test.js`

### Implementación para la Historia de usuario 2

- [X] T014 [US2] Verificar y ajustar en `server/models/order.js` que el historial expone `kilometraje` (= `mileage_entry`) y `correccionKilometraje` (= `mileage_correction`) por servicio
- [X] T015 [US2] Mostrar el kilometraje de cada servicio y la constancia de corrección (textos en español) en `client/lib/screens/vehicle_history_screen.dart`

**Punto de control**: historial con kilometraje confiable; base para los mantenimientos por kilometraje (RN-11)

---

## Fase 5: Historia de usuario 3 - Programación del próximo mantenimiento (Prioridad: P2)

**Meta**: Registrar mantenimientos con motivo y umbrales (fecha y/o kilometraje, RN-11/RN-12), cumplimiento solo manual (aclaración Q1) y cancelación solo de administración con motivo (aclaración Q4).

**Prueba independiente**: Registrar un mantenimiento y verificarlo `PENDING` en la consulta; completarlo manualmente; el registro sin ningún umbral se rechaza (CA-2, FR-004 a FR-006).

### Pruebas para la Historia de usuario 3 ?? (primero, deben fallar)

- [X] T016 [P] [US3] Pruebas unitarias del cálculo de vencimiento en `server/tests/unit/maintenance-state.test.js`: vencido por fecha (`target_date <= CURDATE()`), por kilometraje (`target_mileage <= kmActual`), primero de los dos umbrales que se cumpla, umbral único no evaluado, cumplido/cancelado nunca vencidos
- [X] T017 [P] [US3] Pruebas de integración de mantenimientos en `server/tests/integration/maintenances.test.js`: registro con ambos umbrales y con uno solo, sin umbrales → 422 `MAINTENANCE_INVALID_THRESHOLD`, cumplimiento manual, cancelación solo ADMIN con motivo, acciones sobre estados no `PENDING` → 409 `MAINTENANCE_NOT_MODIFIABLE`, entregado el vehículo no completa nada
- [X] T018 [P] [US3] Pruebas de contrato de `POST /api/maintenances`, `PATCH /:id/complete` y `PATCH /:id/cancel` en `server/tests/contract/maintenances.contract.test.js`

### Implementación para la Historia de usuario 3

- [X] T019 Crear la migración `database/migrations/012_create_maintenance_plans.sql` según `data-model.md`: campos `vehicle_id`, `description`, `target_date`, `target_mileage`, `status ENUM('PENDING','COMPLETED','CANCELLED')`, `completed_at/by`, `cancelled_at/by`, `cancellation_reason`, `created_by`, CHECK "`target_date IS NOT NULL OR target_mileage IS NOT NULL`", índices `(vehicle_id, status)` y `(status, target_date)`
- [X] T020 [P] [US3] Crear `server/services/maintenance-state.js`: `esVencido(mantenimiento, kmActual)` y `proximidad(mantenimiento, kmActual)` (research D2, D9)
- [X] T021 [P] [US3] Crear `server/validators/maintenance-validator.js`: `vehicleId` y `descripcion` obligatorios, al menos un umbral, `targetDate` con formato `YYYY-MM-DD` y no anterior a hoy, `targetMileage` entero positivo, `reason` obligatorio al cancelar
- [X] T022 [US3] Crear `server/models/maintenance.js`: registrar (alta `PENDING`), completar (`PENDING → COMPLETED` con `completed_at/by`), cancelar (`PENDING → CANCELLED` con motivo y autor)
- [X] T023 [US3] Crear `server/services/maintenance-service.js`: orquestar registro/completar/cancelar con los mensajes de error en español (`MAINTENANCE_NOT_FOUND`, `MAINTENANCE_NOT_MODIFIABLE`)
- [X] T024 [US3] Crear `server/controllers/maintenance-controller.js` y `server/routes/maintenance-routes.js` (POST y PATCH con `require-role`: registro ADMIN/MECHANIC; cumplir ADMIN/RECEPTIONIST/MECHANIC; cancelar solo ADMIN) y montar el router en `server/app.js`
- [X] T025 [P] [US3] Crear el modelo Flutter `Maintenance` en `client/lib/models/maintenance.dart` (umbrales opcionales, estados, `isOverdue`, `daysLeft`, `kmLeft`)
- [X] T026 [P] [US3] Crear `MaintenancesProvider` en `client/lib/providers/maintenances_provider.dart` (registrar, completar, cancelar)
- [X] T027 [US3] Crear `client/lib/screens/maintenance_form_screen.dart` (alta con motivo y umbrales; acciones completar con confirmación y cancelar con motivo obligatorio, estilo FR-013 del Sprint 2) y su ruta en `client/lib/main.dart`
- [X] T028 [US3] Crear la semilla idempotente `database/seeds/006_demo_maintenances.sql` (`INSERT ... ON DUPLICATE KEY UPDATE`): mantenimientos de ejemplo sobre vehículos de los seeds previos, incluyendo al menos uno vencido por fecha y otro por kilometraje y dos futuros (FR-017)

**Punto de control**: registro y gestión de mantenimientos funciona y se prueba independientemente

---

## Fase 6: Historia de usuario 5 - Registro y consulta de refacciones (Prioridad: P2)

**Meta**: El administrador registra y edita refacciones (nombre, código único, stock inicial, stock mínimo) y registra entradas y ajustes de stock (FR-008, FR-013, FR-014, RN-8 uniforme según aclaración Q3).

**Prueba independiente**: Registrar una refacción con stock inicial y verla en la consulta; el código duplicado se rechaza (409); un ajuste que dejaría stock negativo se rechaza (422) sin modificar el stock (CA-4, CA-6).

### Pruebas para la Historia de usuario 5 ?? (primero, deben fallar)

- [X] T029 [P] [US5] Pruebas de integración de refacciones en `server/tests/integration/parts.test.js`: alta con stock inicial (genera movimiento `IN` "Stock inicial"), código duplicado → 409, edición, inactivación, rol sin permiso → 403
- [X] T030 [P] [US5] Pruebas de integración de movimientos en `server/tests/integration/inventory.test.js`: `IN` suma, `ADJUSTMENT` con signo suma/resta, `ADJUSTMENT` que dejaría stock negativo → 422 `MOVEMENT_INVALID`, cantidad 0 → 422, `reason` obligatorio, stock resultante = acumulado de movimientos (FR-009)
- [X] T031 [P] [US5] Pruebas de contrato de `POST /api/parts`, `PUT /api/parts/:id` y `POST /api/parts/:id/movements` en `server/tests/contract/parts.contract.test.js`

### Implementación para la Historia de usuario 5

- [X] T032 Crear `database/migrations/010_create_parts.sql` según `data-model.md`: `name VARCHAR(100) NOT NULL`, `code VARCHAR(50) NOT NULL UNIQUE`, `stock INT UNSIGNED NOT NULL DEFAULT 0`, `min_stock INT UNSIGNED NOT NULL DEFAULT 0`, `is_active TINYINT(1) NOT NULL DEFAULT 1`, timestamps
- [X] T033 Crear `database/migrations/011_create_inventory_movements.sql`: `part_id` FK, `movement_type ENUM('IN','OUT','ADJUSTMENT')`, `quantity INT` (IN/OUT > 0; ADJUSTMENT con signo, ≠ 0), `order_id` FK NULL, `reason VARCHAR(255) NOT NULL`, `created_by` FK, índice `(part_id, created_at)`
- [X] T034 [P] [US5] Crear `server/validators/part-validator.js`: `name` y `code` obligatorios (longitudes del modelo), `stock` y `minStock` enteros ≥ 0, `movementType` ∈ {IN, ADJUSTMENT} para movimientos de stock, `quantity` ≠ 0 con signo válido, `reason` obligatorio
- [X] T035 [US5] Crear `server/models/part.js`: crear (con stock inicial), editar (nombre, código, `min_stock`, `is_active`; el `stock` NO es editable), listar y buscar
- [X] T036 [US5] Crear `server/models/inventory.js`: registrar movimiento con transacción y `SELECT ... FOR UPDATE` sobre `parts`, validar `stock + delta >= 0` antes de aplicar, devolver `stockResult` (research D4)
- [X] T037 [US5] Crear `server/services/part-service.js`: reglas de negocio (alta genera `IN` "Stock inicial"; AJUSTE con signo; `PART_SIN_STOCK` 409 con `details.stockDisponible`; `MOVEMENT_INVALID` 422; inactivación = baja lógica sin borrado, FR-010)
- [X] T038 [US5] Crear `server/controllers/part-controller.js` y `server/routes/part-routes.js` (POST /api/parts, PUT /api/parts/:id, POST /api/parts/:id/movements, todos solo ADMIN) y montar en `server/app.js`
- [X] T039 [P] [US5] Crear el modelo Flutter `Part` (con `lowStock` y `isActive`) en `client/lib/models/part.dart`
- [X] T040 [P] [US5] Crear `PartsProvider` (lista, alta, edición, entrada de stock) en `client/lib/providers/parts_provider.dart`
- [X] T041 [US5] Crear `client/lib/screens/part_form_screen.dart` (alta/edición de refacción y registro de entrada `IN` con motivo) con su ruta en `client/lib/main.dart`
- [X] T042 [US5] Crear la semilla idempotente `database/seeds/005_demo_parts.sql`: refacciones de ejemplo con movimientos `IN`, incluyendo al menos una con stock por debajo del mínimo y otra por encima (CA-7, FR-017)

**Punto de control**: inventario con refacciones registradas y stock consistente con sus movimientos

---

## Fase 7: Historia de usuario 7 - Refacciones utilizadas en una orden (Prioridad: P2)

**Meta**: El mecánico agrega y retira refacciones en sus órdenes abiertas con salida y devolución atómicas de inventario (RN-6, RN-7, RN-8, FR-011, FR-012, FR-018).

**Prueba independiente**: Agregar una refacción a una orden en curso y verificar el descuento y el movimiento `OUT`; retirarla y verificar la devolución; stock insuficiente rechazado sin cambio; orden cerrada rechazada (CA-5, CA-6).

### Pruebas para la Historia de usuario 7 ?? (primero, deben fallar)

- [X] T043 [P] [US7] Pruebas de integración de refacciones en orden en `server/tests/integration/order-parts.test.js`: alta con stock suficiente (genera `OUT` con `order_id`), stock insuficiente → 409 `PART_SIN_STOCK` sin cambio de stock, orden `ENTREGADO`/`CANCELADA` → 409 `ORDER_CLOSED`, orden en pausa `ESPERANDO_REFACCION` permite agregar, orden de otro mecánico → 403 `FORBIDDEN_ORDER`, retirar genera `IN` de devolución y restaura el stock
- [X] T044 [P] [US7] Pruebas de contrato de `POST /api/orders/:id/parts` y `DELETE /api/orders/:id/parts/:partId` (incluido el bloque `refacciones` en `GET /api/orders/:id`) en `server/tests/contract/order-parts.contract.test.js`

### Implementación para la Historia de usuario 7

- [X] T045 Crear `database/migrations/013_create_order_parts.sql`: `order_id` FK, `part_id` FK, `quantity INT UNSIGNED NOT NULL`, `created_by` FK, `created_at`, índice `(order_id, part_id)`
- [X] T046 [US7] Extender `server/models/order.js` con `agregarRefaccion`, `retirarRefaccion` y `obtenerRefacciones` (líneas de la orden)
- [X] T047 [US7] Extender `server/services/order-service.js`: alta de refacción valida orden no cerrada, dueño o admin, refacción activa y stock suficiente en transacción (`OUT` con `order_id`); retiro genera `IN` de devolución y conserva el `OUT` original (research D5); errores `ORDER_CLOSED`, `ORDER_PART_NOT_FOUND`, `PART_INACTIVE`, `PART_SIN_STOCK`, `FORBIDDEN_ORDER`
- [X] T048 [US7] Extender `server/routes/order-routes.js` y `server/controllers/order-controller.js` con `POST /api/orders/:id/parts` (ADMIN; MECHANIC dueño) y `DELETE /api/orders/:id/parts/:partId`, e incluir el bloque `refacciones` en `GET /api/orders/:id`
- [X] T049 [P] [US7] Crear el modelo Flutter `OrderPart` en `client/lib/models/order_part.dart`
- [X] T050 [US7] Extender `client/lib/providers/orders_provider.dart` con cargar/agregar/quitar refacciones de la orden y stock resultante
- [X] T051 [US7] Extender `client/lib/screens/order_detail_screen.dart` con la sección "Refacciones usadas": lista, formulario agregar (selector de refacciones activas con su stock y cantidad) y acción quitar con confirmación

**Punto de control**: el flujo demostrable del sprint (uso de refacción → salida de inventario) funciona extremo a extremo

---

## Fase 8: Historia de usuario 4 - Mantenimientos próximos para aviso al cliente (Prioridad: P3)

**Meta**: Recepción consulta los mantenimientos: vencidos primero (rojo) y después pendientes por umbral más cercano (advertencia), con cliente y vehículo, sin ventana fija (aclaración Q5, FR-007, SC-003).

**Prueba independiente**: Con un mantenimiento vencido y dos futuros (seed 006), la lista de recepción los muestra en orden de urgencia y con los colores del design system.

### Pruebas para la Historia de usuario 4 ?? (primero, deben fallar)

- [X] T052 [P] [US4] Pruebas de integración de la lista en `server/tests/integration/maintenances-list.test.js`: vencidos primero, pendientes por proximidad (fecha y kilometraje), cancelados excluidos por defecto, filtro por `vehicleId` y `status`, rol sin permiso → 403

### Implementación para la Historia de usuario 4

- [X] T053 [US4] Implementar `GET /api/maintenances` en `server/models/maintenance.js`, `server/services/maintenance-service.js`, `server/controllers/maintenance-controller.js` y `server/routes/maintenance-routes.js` (solo ADMIN/RECEPTIONIST; orden de urgencia con `isOverdue`, `daysLeft`, `kmLeft` calculados con el kilometraje actual del vehículo, research D9)
- [X] T054 [US4] Crear `client/lib/screens/maintenances_screen.dart`: lista con vencidos en rojo y próximos en advertencia, datos de cliente y vehículo, acciones de completar/cancelar y estado vacío
- [X] T055 [US4] Agregar la sección "Mantenimientos" a `client/lib/widgets/app_shell.dart` (solo ADMIN y RECEPTIONIST) con su ruta en `client/lib/main.dart`

**Punto de control**: recepción identifica vencidos y próximos en menos de 1 minuto (SC-003)

---

## Fase 9: Historia de usuario 6 - Consulta de stock disponible (Prioridad: P3)

**Meta**: Consultar el inventario con búsqueda por nombre o código y auditoría de movimientos por refacción (FR-009, FR-010).

**Prueba independiente**: Con refacciones del seed 005, buscar por nombre y código y verificar que el stock coincide con el acumulado de movimientos; el administrador ve el historial de movimientos de una refacción.

### Pruebas para la Historia de usuario 6 ?? (primero, deben fallar)

- [X] T056 [P] [US6] Pruebas de integración de búsqueda en `server/tests/integration/parts-search.test.js`: filtro `q` por nombre y código, refacciones inactivas visibles solo para ADMIN, mecánico ve solo activas, `GET /api/parts/:id/movements` solo ADMIN con autor/fecha/motivo

### Implementación para la Historia de usuario 6

- [X] T057 [US6] Implementar la búsqueda `q` y `GET /api/parts/:id/movements` en `server/models/part.js`, `server/models/inventory.js`, `server/services/part-service.js`, `server/controllers/part-controller.js` y `server/routes/part-routes.js`
- [X] T058 [US6] Crear `client/lib/screens/parts_screen.dart`: listado con nombre, código, stock, mínimo y estado activo; búsqueda por nombre o código; estado vacío
- [X] T059 [US6] Agregar la sección "Inventario" a `client/lib/widgets/app_shell.dart` (ADMIN y RECEPTIONIST) con su ruta en `client/lib/main.dart`

**Punto de control**: el stock mostrado coincide en el 100% de los casos con los movimientos (SC-004)

---

## Fase 10: Historia de usuario 8 - Alertas de stock bajo (Prioridad: P3)

**Meta**: Destacar como stock bajo (cantidad ≤ mínimo) las refacciones que lo necesitan, sin cálculos manuales (FR-015, CA-7, SC-005).

**Prueba independiente**: Llevar una refacción hasta su mínimo y verificar que aparece destacada en la primera consulta posterior al movimiento; sin alertas cuando todo está por encima del mínimo.

### Pruebas para la Historia de usuario 8 ?? (primero, deben fallar)

- [X] T060 [P] [US8] Pruebas de integración de stock bajo en `server/tests/integration/parts-low-stock.test.js`: `stock <= min_stock` produce `lowStock: true`, una salida que cruza el mínimo refleja la alerta en la siguiente consulta, por encima del mínimo sin alerta

### Implementación para la Historia de usuario 8

- [X] T061 [US8] Calcular `lowStock` en el listado de `server/models/part.js` y pintar las refacciones destacadas (color de advertencia/rojo del design system) en `client/lib/screens/parts_screen.dart`

**Punto de control**: las 8 historias funcionan de forma independiente

---

## Fase 11: Pulido y temas transversales

**Propósito**: Mejores que afectan a varias historias

- [X] T062 [P] Ejecutar `flutter analyze` sin issues y corregir hallazgos en `client/`
- [X] T063 [P] Ejecutar `flutter test` en `client/` hasta dejar todas las pruebas en verde
- [X] T064 Ejecutar `npm.cmd test` completo en `server/` (unit, integration, contract contra `motorix_test`) y corregir fallos
- [X] T065 Verificar seguridad y consistencia: sin secretos en el repositorio, sin trazas de base de datos en errores, `password_hash` jamás en respuestas, validación de rol en servidor para todo endpoint nuevo (RN-15)
- [X] T066 [P] Ejecutar `node --check` sobre todos los archivos JS nuevos o modificados de `server/`
- [X] T067 Ejecutar los escenarios V1–V12 de `specs/003-historial-inventario/quickstart.md` con backend y cliente en funcionamiento y anotar los resultados (requiere MySQL activo)
- [X] T068 Actualizar `specs/003-historial-inventario/tasks.md` con el progreso y redactar el informe de cierre del sprint en `specs/003-historial-inventario/informe-finalizacion.md`

---

## Dependencias y orden de ejecución

### Dependencias entre fases

- **Preparación (Fase 1)**: sin dependencias
- **Fundacional (Fase 2)**: depende de la Fase 1; BLOQUEA todas las historias
- **US1 (Fase 3)**: depende de la Fase 2 — MVP
- **US2 (Fase 4)**: depende de la Fase 3 (verifica el historial de la US1)
- **US3 (Fase 5)**: depende de la Fase 2; usa T003 (limpieza) y T002 (errores)
- **US5 (Fase 6)**: depende de la Fase 2
- **US7 (Fase 7)**: depende de la US5 (necesita `parts` y `inventory` de las migraciones 010/011 y sus modelos)
- **US4 (Fase 8)**: depende de la US3 (necesita `maintenance_plans` y su servicio)
- **US6 (Fase 9)**: depende de la US5 (necesita el módulo de refacciones y movimientos)
- **US8 (Fase 10)**: depende de la US6 (destacado en la pantalla de inventario) y de la US5 (movimientos que cruzan el mínimo)
- **Pulido (Fase 11)**: depende de las historias deseadas

### Dependencias entre historias

- **US1 (P1)**: sin dependencias de otras historias tras la Fase 2
- **US2 (P2)**: integra con US1 (misma pantalla de historial)
- **US3 (P2)**: sin dependencias de otras historias tras la Fase 2
- **US5 (P2)**: sin dependencias de otras historias tras la Fase 2
- **US7 (P2)**: requiere US5 (modelo de refacciones y movimientos)
- **US4 (P3)**: requiere US3 (tabla y servicio de mantenimientos)
- **US6 (P3)**: requiere US5
- **US8 (P3)**: requiere US5 y US6

### Dentro de cada historia

- Las pruebas se escriben primero y deben fallar antes de la implementación
- Migraciones y modelos antes que servicios; servicios antes que rutas; backend antes que la UI de la historia
- Historia completa antes de pasar a la siguiente prioridad

### Oportunidades de paralelismo

- Toda tarea marcada [P] con archivos distintos puede ejecutarse en paralelo
- Tras la Fase 2, pueden avanzar en paralelo las ramas US1, US3 y US5 (sin dependencias cruzadas)
- US2, US4, US6 y US8 son fases pequeñas que suelen ejecutarse tras sus dependencias

---

## Ejemplo de paralelismo: Historia de usuario 3

```text
Tarea: "Pruebas unitarias del cálculo de vencimiento en server/tests/unit/maintenance-state.test.js"
Tarea: "Pruebas de integración de mantenimientos en server/tests/integration/maintenances.test.js"
Tarea: "Pruebas de contrato en server/tests/contract/maintenances.contract.test.js"
Tarea: "Crear el modelo Flutter Maintenance en client/lib/models/maintenance.dart"
Tarea: "Crear MaintenancesProvider en client/lib/providers/maintenances_provider.dart"

# Después, de forma secuencial (mismo archivo o dependencias):
Tarea: "Crear server/models/maintenance.js y server/services/maintenance-service.js"
Tarea: "Crear server/controllers/maintenance-controller.js y server/routes/maintenance-routes.js"
```

---

## Estrategia de implementación

### MVP primero (solo Historia de usuario 1)

1. Completar Fase 1 (Preparación) y Fase 2 (Fundacional)
2. Completar Fase 3 (US1 — historial)
3. **PARAR y VALIDAR**: probar la US1 de forma independiente (escenarios V1 y V2 del quickstart)
4. Demostrar el historial del taller

### Entrega incremental

1. Preparación + Fundacional → base lista
2. US1 → probar → demo (MVP: historial de servicios)
3. US3 + US5 → probar → demo (mantenimientos e inventario base)
4. US7 → probar → demo (uso de refacciones con salida atómica — cierre del flujo del sprint)
5. US2, US4, US6, US8 → probar → demo (verificación de kilometraje, avisos, consulta y alertas)
6. Pulido → quickstart V1–V12 e informe de cierre

### Estrategia de equipo en paralelo

1. El equipo completa Preparación y Fundacional juntos
2. Una vez fundacional: desarrollador A → US1; desarrollador B → US3; desarrollador C → US5
3. Después: US7 (tras US5), US4 (tras US3), US6 y US8 (tras US5)

---

## Notas

- Las tareas [P] usan archivos distintos y no dependen de tareas incompletas
- La etiqueta [USn] vincula cada tarea con su historia para trazabilidad
- Cada historia debe poder completarse y probarse de forma independiente
- Verificar que las pruebas fallen antes de implementar
- Commits por tarea o grupo lógico con formato Conventional Commits (`feat(inventory): agregar migración de refacciones`)
- Detenerse en cada punto de control para validar la historia por separado
- Bloqueo conocido: T067 requiere el servicio MySQL local activo (ver Blocked conocido del Sprint 2)
