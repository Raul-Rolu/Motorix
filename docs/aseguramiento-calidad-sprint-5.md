# Aseguramiento de la calidad - Sprint 5: Precio de venta de refacciones

Este documento es el registro de calidad del Sprint 5 de Motorix. Reúne las puertas de calidad, las decisiones, los riesgos, la trazabilidad de los criterios de aceptación, los hallazgos y la regresión de los sprints anteriores. El control de calidad final y el cierre se completan en la fase 3.

**Aviso de método.** El aseguramiento de este sprint se documentó **después de implementar**, no antes. La implementación terminó el 2026-10-18 y este documento se compiló el 2026-11-02. Por eso hay dos puertas ejecutadas después: el checklist de calidad de requisitos (G-04) se generó y evaluó el 2026-11-02, y la línea base de Flutter se midió el 2026-11-02 sobre el commit `fef7e92`. El documento no presenta esas actividades como si hubieran ocurrido antes del código.

Resultado general: (se completa en la fase 3).

## 0. Datos del documento

| Campo | Valor |
|---|---|
| Sprint | 5 - Precio de venta de refacciones (versión propia del Sprint 5: solo precio de venta, total, cobro y ticket) |
| Insumo | No hubo archivo de insumo formal: `docs/sprints/` no contiene un archivo del Sprint 5 (solo `sprint-1` a `sprint-4` y `_plantilla.md`). Ver G-01 |
| Especificación | `specs/005-precio-venta-refacciones/` (16 FR, 21 CA, 7 SC en `spec.md`) |
| Rama de trabajo del sprint | `005-precio-refacciones` |
| Rama de este documento | `aseguramiento-calidad-005` |
| Base | `main` (commit `fef7e92`, 2026-10-14) |
| Responsable | Raúl Francisco Amador, Product Builder |
| Aprobador del cierre | Raúl Francisco Amador, Product Builder |
| Fecha de inicio | 2026-10-18 (línea base de backend, commit `0273fb7`) |
| Implementación terminada | 2026-10-18 (commit `b33ea9b`) |
| Capturas de la aplicación | 2026-10-19 (commit `78d2a7e`) |
| Documento compilado | 2026-11-02 (después de implementar) |
| Fecha de cierre | (se completa en la fase 3) |
| Estado general | (se completa en la fase 3) |
| Herramienta del ciclo Spec Kit | Spec Kit con OpenCode, modelo MiMo-V2.6-Flash (ciclo `specify`, `clarify`, `plan`, `tasks`, `analyze`, `implement`) |
| Herramienta de la lista de calidad | Spec Kit con OpenCode, modelo MiMo-V2.6-Flash (`/speckit.checklist`, ejecutado el 2026-11-02) |
| Herramienta de redacción de este documento | Claude Code |
| Guía y plantilla | Elaboradas por el equipo: `docs/aseguramiento-calidad/guia-aseguramiento-calidad.md` y `docs/aseguramiento-calidad/plantilla-aseguramiento-calidad.md` |

## 1. Objetivo y alcance

**Objetivo.** Asegurar que el Sprint 5 salga con calidad: que los requisitos estén completos, sean medibles y no se contradigan, que las pruebas estén planeadas antes del código y que el cambio no rompa lo construido en los sprints anteriores.

**Dentro del alcance** (según `specs/005-precio-venta-refacciones/spec.md`):

- Precio de venta en la ficha de cada refacción, con registro y modificación solo para administración (FR-001, FR-002).
- Detección de refacciones activas sin precio (pendientes de precio) en el inventario (FR-003).
- Precio congelado en cada uso de refacción dentro de una orden, y rechazo de refacciones sin precio (FR-004 a FR-006).
- Total de la orden con servicios, mano de obra y refacciones (precio × cantidad), con marca de total incompleto (FR-007, FR-008).
- Adopción del precio asignado en las órdenes abiertas no liquidadas (FR-011).
- Cobro y ticket con el total completo y el desglose de refacciones, con bloqueo por total incompleto en órdenes no liquidadas (FR-009, FR-010, FR-012 a FR-014, FR-016).
- Datos de ejemplo con precios definidos (FR-015).

**Fuera del alcance:**

- Lo que declara `spec.md` (líneas 161 a 166): precio de compra y su captura; reportes de utilidad, margen, costo o rentabilidad; recalcular retroactivamente órdenes ya pagadas; modificar los specs de los sprints 1 a 4.
- Además, para este sprint: la categoría y la marca de la refacción, el precio de compra y su visibilidad por rol, y los pagos pendientes de Mercado Pago desfasados. Quedan para un sprint posterior.

## 2. Criterios de entrada y de salida

Los criterios de entrada se evalúan contra el estado antes de comenzar la implementación (primer commit de código: `c577ba8`, 2026-10-18). Los de salida se cierran en la fase 3.

**Criterios de entrada (para comenzar la implementación):**

- [ ] Las 8 puertas de la sección 3 están Aprobadas o Aprobadas con observación **antes** de implementar. No se cumplió en tiempo: 7 puertas estaban ejecutadas antes de `c577ba8`; G-04 se ejecutó el 2026-11-02, después de implementar.
- [x] Si el sprint exige un cambio a la constitución del proyecto, la enmienda está aprobada y registrada. No aplica: `plan.md` (sección «Comprobación de la constitución») no registra violaciones y no hay enmienda.
- [x] Las decisiones de la sección 4 están resueltas y registradas en `spec.md` (sección «Clarifications»).
- [x] No hay hallazgos críticos ni altos abiertos en el análisis de consistencia: el análisis (`607ccbd`) tuvo 0 críticos y 2 altos, y ambos se remediaron en `7ba97da`, antes del primer commit de código.
- [x] Cada criterio de aceptación tuvo al menos una prueba planeada (sección 6): el análisis registra 20 de 20 CA con tarea; CA-21 se agregó después con T025.
- [ ] La línea base de regresión está registrada **antes** del código. Se cumplió solo para el backend (`0273fb7`, 2026-10-18); la de Flutter se midió el 2026-11-02.
- [x] La documentación desfasada de los sprints anteriores está identificada: `specs/004-pagos-tickets-dashboard/informe-finalizacion.md` (líneas 124 a 128) registra que el total del Sprint 4 excluyó las refacciones por falta de precio, y `spec.md` (línea 51) cita esa brecha.

**Criterios de salida (para cerrar el sprint):** (se evalúan en la fase 3)

- [ ] Los 21 criterios de aceptación están Aprobados.
- [ ] Todas las pruebas de los sprints anteriores siguen pasando.
- [ ] No hay defectos críticos ni altos abiertos (sección 7).
- [ ] La matriz de calidad final (sección 9) está completa, con evidencia.
- [ ] Reporte, análisis y matriz no se contradicen.

## 3. Puertas de calidad

El detalle de cada puerta está en los documentos citados en la columna de evidencia. Los hashes y las fechas salen de `git log`.

| ID | Puerta | Estado | Evidencia |
|:--:|---|---|---|
| G-01 | Insumo del sprint revisado contra el código | Aprobado con observación | No hubo insumo formal en `docs/sprints/`. La justificación del sprint está en el informe del responsable, en [`docs/project-context.md`](project-context.md) (líneas 288 y 289 listan «Precio de venta» como dato del inventario) y en el Sprint 4 ([`specs/004-pagos-tickets-dashboard/spec.md`](../specs/004-pagos-tickets-dashboard/spec.md), FR-003, línea 112; e [`informe-finalizacion.md`](../specs/004-pagos-tickets-dashboard/informe-finalizacion.md), líneas 124 a 128). El informe del responsable no está en el repositorio, por lo que no pude comprobarlo |
| G-02 | Especificación (`/speckit.specify`) | Aprobado con observación | [`spec.md`](../specs/005-precio-venta-refacciones/spec.md), commit `37748a7` (2026-10-18). Hoy tiene 16 FR (EARS), 21 CA y 7 SC; [`checklists/requirements.md`](../specs/005-precio-venta-refacciones/checklists/requirements.md) tiene 16 de 16 casillas marcadas. Observación: el encabezado de `spec.md` (línea 7) sigue en «Estado: Borrador» |
| G-03 | Aclaraciones (`/speckit.clarify`) | Aprobado | 2 rondas el 2026-10-18 más la directiva de reescritura EARS: ronda 1 (`22ae286`: precio de las refacciones existentes, «abierta» frente a «pagada», filtro de pendientes) con la directiva de dividir los requisitos compuestos en requisitos EARS de una sola respuesta, y ronda 2 (`3a9d461`: adopción en órdenes con pagos parciales y precios en los datos de ejemplo). Después del análisis hubo 2 decisiones más (INC-01 y AMB-01, en `7ba97da`). Sin marcadores `[NEEDS CLARIFICATION]` en `spec.md` (comprobado con búsqueda) |
| G-04 | Lista de calidad de requisitos (`/speckit.checklist`) | Aprobado con observación | [`checklists/precio-total.md`](../specs/005-precio-venta-refacciones/checklists/precio-total.md), 40 ítems, **ejecutado después de implementar** (commit `ca67e2a`, 2026-11-02). Evaluado en [`evaluacion-checklist-precio-total.md`](evidencias/aseguramiento/evaluacion-checklist-precio-total.md) (commit `ff5840b`): 8 Cumple, 20 Cumple con observación, 12 Hueco y 11 hallazgos (HC-01 a HC-11). Observación: el spec no se cambió, así que los 11 hallazgos siguen abiertos (sección 7) y las 40 casillas del checklist siguen sin marcar |
| G-05 | Plan (`/speckit.plan`) | Aprobado | Commit `e3f137a` (2026-10-18): [`plan.md`](../specs/005-precio-venta-refacciones/plan.md) (comprobación de los 8 principios de la constitución sin violaciones), [`research.md`](../specs/005-precio-venta-refacciones/research.md), [`data-model.md`](../specs/005-precio-venta-refacciones/data-model.md), [`contracts/api-rest.md`](../specs/005-precio-venta-refacciones/contracts/api-rest.md) y [`quickstart.md`](../specs/005-precio-venta-refacciones/quickstart.md). La migración es aditiva: `016_add_part_prices.sql` sin editar la 001 a la 015 |
| G-06 | Tareas (`/speckit.tasks`) | Aprobado | Commit `32d2450` (2026-10-18): [`tasks.md`](../specs/005-precio-venta-refacciones/tasks.md) con 34 tareas (T001 a T034) agrupadas por historia; las pruebas van antes del código en las tres historias. T035 se agregó durante la implementación, en el commit `2b1d476` (ver H-10) y hoy el archivo tiene 35 tareas |
| G-07 | Consistencia (`/speckit.analyze`) | Aprobado con observación | [`analisis-005.md`](evidencias/analisis-005.md) (commit `607ccbd`): 0 críticos, 2 altos, 3 medios y 4 bajos; cobertura de 15 de 15 FR y 20 de 20 CA. Remediación en [`remediacion-005.md`](evidencias/remediacion-005.md) (commit `7ba97da`). Observación: solo hay un pase documentado; no hay un segundo `analyze` posterior a la remediación que confirme cero hallazgos |
| G-08 | Pruebas planeadas y línea base | Aprobado con observación | Los 21 CA tienen prueba planeada en `tasks.md` (T006 a T027, antes del código) y la sección 6 los enlaza. Línea base del backend: 49 suites y 223 pruebas, commit `0273fb7`, 2026-10-18 ([`pruebas-backend-base.txt`](evidencias/pruebas-backend-base.txt)). Observación: la línea base de Flutter (17 pruebas) se midió el 2026-11-02 sobre `fef7e92`, después de implementar ([`pruebas-flutter-base.txt`](evidencias/aseguramiento/pruebas-flutter-base.txt)) |

## 4. Decisiones de aclaración

No hubo insumo formal con decisiones D-01 a D-NN. Las decisiones abiertas surgieron durante `/speckit.specify` y se resolvieron el 2026-10-18 en dos rondas de `/speckit.clarify` (más una sesión posterior al análisis), con la aprobación de Raúl Francisco Amador. El texto completo está en `specs/005-precio-venta-refacciones/spec.md`, sección «Clarifications» (líneas 11 a 25).

| ID | Decisión | Resolución | Requisito afectado |
|:--:|---|---|---|
| D-01 | Precio de las refacciones existentes | Quedan pendientes de precio y no se usan en una orden hasta que administración asigne uno; los datos de ejemplo traen precio | FR-003, FR-005, FR-015 |
| D-02 | «Abierta» frente a «pagada» | Son dos dimensiones independientes: abierta es no entregada y no cancelada; pagada es que los pagos alcanzan el total | FR-007 a FR-010 |
| D-03 | Detectar refacciones sin precio | Es requisito: el inventario las lista o filtra | FR-003, CA-17 |
| D-04 | Directiva de reescritura EARS | Se dividieron los requisitos compuestos en requisitos de una sola respuesta, con el patrón «Mientras» donde corresponde | FR-006 a FR-010 |
| D-05 | Órdenes con pagos parciales y usos sin precio | Adoptan el precio asignado; los pagos se conservan y el saldo se ajusta | FR-011, CA-19 |
| D-06 | Usos en las órdenes de ejemplo | Todos traen precio registrado; ninguna orden de ejemplo queda incompleta | FR-015, CA-20 |
| D-07 | Orden liquidada con usos sin precio (INC-01 del análisis) | No se bloquea: conserva su total histórico y su ticket marca las líneas «sin precio» | FR-016, CA-21 |
| D-08 | Total con el que se evalúa «no liquidada» (AMB-01 del análisis) | El total previo a la adopción; una orden ya pagada nunca adopta | FR-011 |

## 5. Riesgos y mitigaciones

| ID | Riesgo | Impacto | Mitigación | Prueba que lo cubre | Estado |
|:--:|---|---|---|---|---|
| R-01 | Un cambio de precio altera el total de órdenes ya calculadas | Alto: se cobraría un importe distinto al acordado | El uso conserva el precio vigente al agregarse (FR-004, FR-006) | `server/tests/integration/order-totals-parts.test.js:139` (CA-4) y `:164` (CA-5) | Mitigado |
| R-02 | Una refacción sin precio entra a una orden y subvalora el total | Alto: cobro incorrecto | Rechazo con `PART_SIN_PRECIO` sin tocar orden ni stock | `server/tests/integration/order-parts-rejection.test.js:79` (CA-8) | Mitigado |
| R-03 | Se cobra o se imprime un ticket con total incompleto | Alto: importe incorrecto frente al cliente | Bloqueo `TOTAL_INCOMPLETO` en cobro, cobro digital y ticket de órdenes no liquidadas | `server/tests/integration/payments-parts-total.test.js:144` y `:182`; `server/tests/integration/tickets-parts.test.js:112` | Mitigado |
| R-04 | La adopción del precio altera una orden ya pagada, entregada o cancelada | Alto: cambia un importe cobrado | La adopción se limita a órdenes no entregadas ni canceladas y no liquidadas con el total previo | `server/tests/integration/part-price-adoption.test.js:143` y `:198`; caso total cero en `:172` (H-10) | Mitigado |
| R-05 | Mecánico o recepción modifica el precio | Alto: manipulación de importes | `requireRole('ADMIN')` en las rutas de alta y edición, verificado en servidor | `server/tests/contract/parts.contract.test.js:173` (CA-16) | Mitigado (ver HC-02) |
| R-06 | El seed 008 no es idempotente y corrompe el stock | Medio: inventario inconsistente | `stock` en valores absolutos con IDs fijos (H-02) | Revisión de `database/seeds/008_demo_part_prices.sql` y la comprobación de stock absoluto en `docs/evidencias/validacion-quickstart-005.txt`. No comprobé la doble aplicación del seed | Mitigado |
| R-07 | El cambio de contrato rompe pruebas de sprints anteriores | Medio: regresión | Suite completa antes y después; los ajustes se registran (H-11) | Sección 8: 223 y 260 pruebas aprobadas, 0 fallidas | Mitigado |
| R-08 | Uso concurrente al agregar refacciones o cambiar precios (HC-09) | Bajo: carrera poco probable en un taller de un usuario por mostrador | Bloqueo de fila en `server/models/inventory.js:32` al agregar; la adopción no bloquea | Ninguna: no hay prueba de concurrencia | Aceptado |
| R-09 | Fallo entre la edición del precio y la adopción (HC-08) | Medio: precio asignado sin adoptar en órdenes abiertas | Reintentar es seguro (`unit_price IS NULL`); sin transacción hoy | Ninguna: no hay prueba de fallo | Abierto |
| R-10 | Orden entregada y no liquidada con usos sin precio queda sin salida (HC-11) | Medio: no se puede cobrar ni emitir ticket | Ninguna todavía; resolución propuesta en HC-11 | Ninguna | Abierto |
| R-11 | Retirar una refacción deja pagos mayores al nuevo total (HC-07) | Medio: sobrepago sin registro | El saldo se recorta a 0 (`server/services/payment-service.js:105`); no se registra el exceso | Ninguna | Abierto |
| R-12 | Un `PUT` con precio vacío borra el precio de una refacción que ya lo tenía (HC-10) | Medio: refacción vuelve a pendiente sin aviso | Ninguna todavía; resolución propuesta en HC-10 | `server/tests/integration/parts-sale-price.test.js:69` prueba que se puede limpiar, pero ninguna prueba lo rechaza | Abierto |

## 6. Trazabilidad

Cada criterio de aceptación (CA) se enlaza con su requisito, su tarea, su prueba y el resultado. Los resultados se apoyan en los registros de ejecución ya existentes (`pruebas-backend-final.txt`, `pruebas-flutter-final.txt` y `validacion-quickstart-005.txt`); para este documento **no se ejecutaron las suites**. Los números de línea corresponden a los títulos de las pruebas.

| CA | Criterio de aceptación (resumen) | Requisito (FR) | Tarea | Prueba | Resultado | Evidencia |
|:--:|---|---|---|---|---|---|
| CA-1 | La refacción con precio lo muestra al consultarse; una nueva puede guardarse con precio | FR-001 | T007, T015 | T007, T010 | Aprobado | `server/tests/integration/parts-sale-price.test.js:39`; `client/test/part_price_test.dart:9` |
| CA-2 | Precio negativo o no numérico: error visible, el precio previo no cambia | FR-001 | T006, T007, T012 | T006, T007 | Aprobado | `server/tests/unit/validators/part-validator-part-price.test.js:24,30`; `server/tests/integration/parts-sale-price.test.js:98` |
| CA-3 | 2 unidades a $150: uso con cantidad 2 y precio $150, stock baja 2 | FR-004 | T017, T021 | T017 | Aprobado | `server/tests/integration/order-totals-parts.test.js:99` |
| CA-4 | Cambio de $150 a $200: el total de la orden que ya la usó sigue en $300 | FR-006 | T017 | T017 | Aprobado | `server/tests/integration/order-totals-parts.test.js:139` |
| CA-5 | El mismo cambio eleva el importe en una orden nueva ($400) | FR-006 | T017 | T017 | Aprobado | `server/tests/integration/order-totals-parts.test.js:164` |
| CA-6 | $1,000 + $500 + 2 refacciones de $150 = $1,800; con una tercera de $100, $1,900 | FR-007 | T016, T017, T020, T023 | T016, T017 | Aprobado | `server/tests/unit/order-totals-parts.test.js:29`; `server/tests/integration/order-totals-parts.test.js:99` |
| CA-7 | Orden sin servicios ni refacciones: total $0 | FR-007 | T016 | T016 | Aprobado | `server/tests/unit/order-totals-parts.test.js:5,17` |
| CA-8 | Refacción sin precio: mensaje claro, total y stock sin cambio | FR-005 | T003, T004, T018, T021 | T018 | Aprobado | `server/tests/integration/order-parts-rejection.test.js:79` |
| CA-9 | Orden abierta no liquidada con uso sin precio: total incompleto con la refacción señalada | FR-008 | T004, T016, T020, T023 | T016, T018 | Aprobado | `server/tests/unit/order-totals-parts.test.js:41`; `server/tests/integration/order-parts-rejection.test.js:124`; `server/tests/integration/payments-parts-total.test.js:144` |
| CA-10 | Cobro y ticket se rechazan con total incompleto, y vuelven a funcionar tras asignar el precio | FR-009, FR-010 | T024, T025, T028, T029 | T024, T025, T026 | Aprobado con observación | `server/tests/integration/payments-parts-total.test.js:144,182`; `server/tests/integration/tickets-parts.test.js:112`. Observación: no encontré una prueba que reintente el cobro o el ticket después de asignar el precio (ver H-07) |
| CA-11 | Asignar precio recalcula dos órdenes abiertas no liquidadas; la pagada conserva su total | FR-011 | T019, T022 | T019 | Aprobado | `server/tests/integration/part-price-adoption.test.js:103,143` |
| CA-12 | Total $1,800 y pagos $1,000: saldo $800; al pagarlo, liquidada | FR-012 | T024, T028 | T024 | Aprobado | `server/tests/integration/payments-parts-total.test.js:93` |
| CA-13 | El ticket muestra $1,800 y lista cada refacción con cantidad, precio e importe | FR-014 | T025, T029, T030 | T025, T027 | Aprobado | `server/tests/integration/tickets-parts.test.js:82`; `client/test/ticket_test.dart:195` |
| CA-14 | Total del ticket, de la orden y del cobro idénticos (diferencia $0) | FR-013 | T025, T029 | T025 | Aprobado | `server/tests/integration/tickets-parts.test.js:82` |
| CA-15 | Retirar una refacción de $150 baja el total a $1,650 y repone el stock | FR-007 | T018 | T018 | Aprobado con observación | `server/tests/integration/order-parts-rejection.test.js:160` prueba la baja del total; la reposición de stock consta en `docs/evidencias/validacion-quickstart-005.txt` (escenario 3), no en una prueba de Jest |
| CA-16 | Mecánico o recepción: el sistema deniega el registro del precio, no solo la interfaz | FR-002 | T009, T013 | T009 | Aprobado | `server/tests/contract/parts.contract.test.js:173` |
| CA-17 | El inventario filtra las refacciones activas sin precio; lista vacía si todas tienen | FR-003 | T008, T014, T015 | T008 | Aprobado | `server/tests/integration/parts-pending-price.test.js:60,87` |
| CA-18 | Tras la instalación, las refacciones de ejemplo muestran precio; una existente sin precio queda pendiente | FR-015 | T002, T031 | T031 | Aprobado con observación | `docs/evidencias/validacion-quickstart-005.txt` («Puesta en marcha»). Observación: lo comprueba el recorrido del quickstart, no una suite de Jest |
| CA-19 | Orden abierta con pago parcial y uso sin precio: recalcula, conserva el pago y ajusta el saldo | FR-011 | T019, T022 | T019 | Aprobado | `server/tests/integration/part-price-adoption.test.js:103` |
| CA-20 | Ninguna orden de ejemplo aparece con total incompleto | FR-015 | T002, T031 | T031 | Aprobado con observación | `docs/evidencias/validacion-quickstart-005.txt` («Ningún uso de ejemplo tiene total incompleto»). Observación: igual que CA-18 |
| CA-21 | Orden liquidada con usos sin precio: ticket con total histórico y líneas «sin precio», sin bloqueo | FR-016 | T025, T029, T030 | T025, T027 | Aprobado | `server/tests/integration/tickets-parts.test.js:139`; `server/tests/integration/payments-parts-total.test.js:203`; `client/test/ticket_test.dart:184` |

## 7. Hallazgos y defectos

Se registra todo lo encontrado en el análisis, en las pruebas y en la lista de calidad de requisitos. Los hallazgos H-01 a H-09 vienen del análisis ([`analisis-005.md`](evidencias/analisis-005.md)); H-10 es el defecto T035; H-11 a H-14 son observaciones que encontré al compilar este documento; HC-01 a HC-11 vienen de la evaluación del checklist y conservan **la severidad exacta** de [`evaluacion-checklist-precio-total.md`](evidencias/aseguramiento/evaluacion-checklist-precio-total.md). Los HC están **Abiertos** con una resolución propuesta: el responsable decide si los acepta. No hay hallazgos críticos ni altos abiertos.

### 7.1 Análisis, defecto T035 y observaciones de este documento

| ID | Descripción | Severidad | Origen | Estado | Resolución | Evidencia |
|:--:|---|---|---|---|---|---|
| H-01 | INC-01: una orden ya liquidada con usos sin precio quedaría sin ticket de por vida | Alta | G-07 | Resuelto | El bloqueo se acota a órdenes no liquidadas; la liquidada emite ticket con las líneas «sin precio» (nuevos FR-016 y CA-21) | `remediacion-005.md`, commit `7ba97da`; `server/tests/integration/tickets-parts.test.js:139` |
| H-02 | INC-03: el seed 008 ajustaba el stock de forma relativa y no era idempotente | Alta | G-07 | Resuelto | El `stock` se fija en valores absolutos con IDs fijos | `remediacion-005.md`, commit `7ba97da`; T002 en `tasks.md` |
| H-03 | AMB-01: el predicado «no liquidada» era circular con el total que se adopta | Media | G-07 | Resuelto | Se evalúa con el total previo a la adopción | `remediacion-005.md`; `spec.md:25`; `server/tests/integration/part-price-adoption.test.js:143` |
| H-04 | INC-02: el filtro de pendientes solo cubría activas y el spec no lo decía | Media | G-07 | Resuelto | FR-003 y CA-17 acotan el filtro a refacciones activas | `remediacion-005.md`; `spec.md:102,135`; `server/tests/integration/parts-pending-price.test.js:60` |
| H-05 | COV-01: faltaba actualizar el contrato de `GET /api/orders/:id` | Media | G-07 | Resuelto | T017 incluye `orders-detail.contract.test.js` | `remediacion-005.md`; `server/tests/contract/orders-detail.contract.test.js` |
| H-06 | AMB-02: CA-5 no tenía un caso explícito | Baja | G-07 | Resuelto | T017 cita CA-5 y hay prueba dedicada | `server/tests/integration/order-totals-parts.test.js:164` |
| H-07 | AMB-03: CA-10 exige que cobro y ticket vuelvan a funcionar tras asignar el precio; no encontré una prueba que reintente después de asignarlo | Baja | G-07 | Abierto | Propuesta: agregar un caso que asigne el precio y reintente el cobro y el ticket | `server/tests/integration/payments-parts-total.test.js:144`; `server/tests/integration/tickets-parts.test.js:112` (solo prueban el bloqueo) |
| H-08 | DUP-01: la regla de las órdenes pagadas aparece dos veces en los Supuestos | Baja | G-07 | Aceptado | No se consolidó; las dos formulaciones no se contradicen (la remediación no la atendió) | `spec.md:173,174` |
| H-09 | COV-02: el total de `historialVehiculo` con refacciones no tiene prueba automatizada (las pruebas de historial no cambiaron en el sprint) | Baja | G-07 | Abierto | Propuesta: agregar un caso a `server/tests/contract/vehicle-history.contract.test.js`. El escenario 8 del quickstart lo recorre, pero con resultado fallido en la versión confirmada (ver H-12) | `docs/evidencias/validacion-quickstart-005.txt` |
| H-10 | Defecto T035: `adoptarPrecios` trataba como liquidada a una orden con total previo 0 y cobrado 0, y no adoptaba el precio | Media (clasificación mía; ningún documento del repositorio la asigna) | Prueba (T035) | Resuelto | Una orden se considera liquidada solo si su total previo es mayor que cero y lo cobrado lo alcanza. Prueba escrita primero y corrección después | Rojo: [`t035-pruebas-rojo.txt`](evidencias/t035-pruebas-rojo.txt), commit `3c79511`. Verde: [`t035-pruebas-verde.txt`](evidencias/t035-pruebas-verde.txt), commit `2b1d476`. `server/tests/integration/part-price-adoption.test.js:172` |
| H-11 | Ajuste de pruebas de la línea base por la ampliación declarada del contrato: 4 aserciones del backend cambiaron (forma de `totals` en `orders-detail.test.js` y `orders-work.test.js`; `refacciones` y total 300 a 400 en `tickets.contract.test.js`). `SC-007` pedía no cambiar aserciones | Baja | Regresión | Aceptado | Los cambios son consecuencia de FR-007 y FR-013; ninguna prueba se borró ni se debilitó. En Flutter se reestructuraron los dobles de `payment_flow_test.dart` y `ticket_test.dart`; no revisé línea por línea que sus aserciones se mantuvieran | `git diff fef7e92 b33ea9b` sobre `server/tests/` y `client/test/` |
| H-12 | La evidencia confirmada del quickstart ([`validacion-quickstart-005.txt`](evidencias/validacion-quickstart-005.txt) en `HEAD`) termina en 37 de 42 verificaciones y código de salida 1 (escenarios 5, 6 y 8). El árbol de trabajo trae una versión sin confirmar con 43 de 43 y código 0. No determiné si las 5 fallas eran del guion o del código; las pruebas de Jest sí cubren los bloqueos | Media (clasificación mía) | T031 | Abierto | El responsable debe revisar y confirmar el archivo corregido (o repetir la corrida) antes del cierre | `git diff docs/evidencias/validacion-quickstart-005.txt` |
| H-13 | En `tasks.md` siguen sin marcar T031 a T035, aunque T035 tiene commits de rojo y verde y hay cambios sin confirmar en `database/README.md` (T033) y en la evidencia del quickstart (T031) | Baja | G-06 | Abierto | Marcar las tareas cuando el responsable confirme los cambios | `specs/005-precio-venta-refacciones/tasks.md:130-134`; `git status` |
| H-14 | `remediacion-005.md` (línea 35) nombra hallazgos bajos «AMT-01, AMT-02, COV-02, TST-01» que no existen en el análisis (allí son AMB-02, AMB-03, DUP-01 y COV-02) | Baja | G-07 | Abierto | Corregir el texto de la remediación o aclararlo en una nota | `docs/evidencias/remediacion-005.md:35`; `docs/evidencias/analisis-005.md:150-152` |

### 7.2 Hallazgos de la lista de calidad de requisitos (G-04)

Todos con estado **Abierto**. La columna «Resolución propuesta» es una propuesta para el responsable; no se aplicó ningún cambio al spec.

| ID | Descripción | Severidad | Origen | Estado | Resolución propuesta | Evidencia |
|:--:|---|---|---|---|---|---|
| HC-01 | SC-006 usa «unos segundos» sin umbral | Baja | G-04 (CHK008) | Abierto | Fijar un umbral (por ejemplo, 2 s) y decir cómo se mide | `spec.md:158`; evaluación, sección 2 |
| HC-02 | CA-16 no define el mensaje ni el estado de la denegación ni que el precio quede intacto | Baja | G-04 (CHK011) | Abierto | Precisar el mensaje y agregar a la prueba la comprobación de que el precio no cambió | `spec.md:134`; `server/tests/contract/parts.contract.test.js:173` |
| HC-03 | El criterio «no liquidada = pagos < total previo a la adopción» no está en ningún FR ni CA | Media | G-04 (CHK017) | Abierto | Subirlo a FR-011 y CA-19. El código y dos pruebas ya lo cubren | `spec.md:25,110,137`; `server/models/part.js:117-148` |
| HC-04 | El destino de las órdenes entregadas o canceladas solo es supuesto y caso límite | Baja | G-04 (CHK022) | Abierto | Agregar un FR o CA. El código y una prueba ya lo cubren | `spec.md:178`; `server/tests/integration/part-price-adoption.test.js:198` |
| HC-05 | Los casos límite y los escenarios de US1 a US3 no tienen identificadores FR/CA; faltan CA para orden pagada no entregada, orden cerrada y precio $0 | Baja | G-04 (CHK023, CHK032) | Abierto | Mapear los casos límite a FR/CA y agregar los tres CA | `spec.md:85-94` |
| HC-06 | Falta un CA para agregar una refacción a una orden pagada y abierta | Media | G-04 (CHK024) | Abierto | Agregar el CA y una prueba. El código lo permite | `spec.md:91`; `server/services/payment-service.js:105` |
| HC-07 | No se define qué pasa si los pagos superan el nuevo total tras retirar una refacción | Media | G-04 (CHK025) | Abierto | Definir el comportamiento (sobrepago o saldo a favor) y probarlo | `server/services/payment-service.js:105` |
| HC-08 | FR-011 no define el error durante la adopción y `part-service.js` hace dos operaciones sin transacción | Media | G-04 (CHK026) | Abierto | Definir el flujo de error y envolver la edición y la adopción en una transacción | `server/services/part-service.js:91-115` |
| HC-09 | No hay requisito de uso concurrente al agregar refacciones o cambiar precios | Baja | G-04 (CHK027) | Abierto | Declarar el supuesto o agregar el requisito. La fila se bloquea al agregar; la adopción no | `server/models/inventory.js:32` |
| HC-10 | El caso límite («no se admite el precio vacío») contradice el contrato y el código, donde vacío o `null` significa «pendiente»; un `PUT` con vacío borra el precio existente | Media | G-04 (CHK029) | Abierto | Decidir cuál regla rige, escribirla en un FR o CA y ajustar validador y pruebas | `server/validators/part-validator.js:46-50`; `server/tests/integration/parts-sale-price.test.js:69` |
| HC-11 | FR-008 dice «abierta», FR-009 y FR-010 dicen «no liquidada» y el Supuesto dice «abierta no liquidada»; una orden ENTREGADO sin liquidar con usos antiguos sin precio no se puede cobrar, no emite ticket y no adopta el precio | Media | G-04 (CHK033) | Abierto | Unificar la redacción y decidir cómo se desbloquea ese caso (por ejemplo, adopción también en entregadas no liquidadas) | `server/services/payment-service.js:56-65,81-84`; `server/services/ticket-service.js:75`; `server/models/part.js:147` |

**Resumen:** 25 hallazgos registrados (H-01 a H-14 y HC-01 a HC-11). Críticos abiertos: 0. Altos abiertos: 0 (los 2 altos, H-01 y H-02, están resueltos). Medios abiertos: 7 (HC-03, HC-06, HC-07, HC-08, HC-10, HC-11 y H-12). Bajos abiertos: 9 (H-07, H-09, H-13, H-14, HC-01, HC-02, HC-04, HC-05, HC-09). Aceptados: 2 (H-08, H-11). Resueltos: 7 (H-01 a H-06 y H-10).

## 8. Línea base de regresión

Se ejecutó la suite completa antes de tocar el código del backend y de nuevo al cierre de la implementación. Para este documento **no se volvieron a ejecutar las suites**: los conteos salen de los archivos de evidencia. Ninguna prueba de la línea base pasó de verde a rojo según los registros finales.

| Suite | Comando | Antes del sprint | Después del sprint | Diferencia | Evidencia |
|---|---|---|---|---|---|
| Backend | `npm test` en `server/` | 49 suites y 223 pruebas aprobadas, 0 fallidas | 58 suites y 260 pruebas aprobadas, 0 fallidas | +9 suites y +37 pruebas | [`pruebas-backend-base.txt`](evidencias/pruebas-backend-base.txt) y [`pruebas-backend-final.txt`](evidencias/pruebas-backend-final.txt) |
| Frontend | `flutter test` en `client/` | 17 pruebas aprobadas, 0 fallidas | 28 pruebas aprobadas, 0 fallidas | +11 pruebas | [`pruebas-flutter-base.txt`](evidencias/aseguramiento/pruebas-flutter-base.txt) y [`pruebas-flutter-final.txt`](evidencias/pruebas-flutter-final.txt) |

**Fecha de la línea base:**

- Backend: 2026-10-18, registrada en el commit `0273fb7`, antes de cualquier cambio de código del sprint (el primer commit de código es `c577ba8`); el código es el de `fef7e92`.
- Frontend: **2026-11-02**, medida sobre el commit `fef7e92` (el encabezado del archivo lo declara) en una copia aparte del repositorio (`C:/motorix-base`, según las rutas del registro). Se midió **después** de implementar, así que no cumple el criterio de «antes de tocar el código». No pude comprobar por mi cuenta que esa copia estuviera limpia.

**Evidencia del cierre (en lugar de capturas PNG):** los registros `.txt` de arriba, con código de salida 0 al final (`codigo_salida=0`). Se registraron el 2026-10-18 en el commit `b33ea9b`. Las capturas PNG de la aplicación (2026-10-19, `78d2a7e`) están en `docs/evidencias/capturas/` y no sustituyen a estos registros.

**Duración del backend:** 74.813 s al inicio y 71.825 s al cierre.

**Fecha del cierre de la implementación:** 2026-10-18, rama `005-precio-refacciones`. Se ajustaron 4 aserciones de pruebas de la línea base del backend por el cambio de contrato declarado (H-11); no se borró ninguna prueba. Además se adaptó la preparación de las pruebas existentes que agregan refacciones (T003) sin cambiar sus aserciones. No hay registro de análisis estático (por ejemplo `flutter analyze`) en las evidencias.

## 9. Control de calidad final

(se completa en la fase 3)

## 10. Cierre

(se completa en la fase 3)

# Anexo de evidencias

(se completa en la fase 3)
