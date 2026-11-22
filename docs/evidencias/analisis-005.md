# Análisis pre-implementación: feature 005-precio-venta-refacciones

**Fecha**: 2026-10-18
**Analista**: agente de IA (comando `/speckit.analyze`)
**Alcance**: `specs/005-precio-venta-refacciones/{spec.md, plan.md, research.md, data-model.md, contracts/api-rest.md, quickstart.md, tasks.md}` + `.specify/memory/constitution.md`
**Modo**: solo lectura de los artefactos; este informe es el único archivo creado.

---

## Resumen ejecutivo

- **0 hallazgos CRÍTICOS**: no hay violaciones de la constitución y ningún FR queda sin tarea.
- **Cobertura**: FR 15/15 (100 %), CA 20/20 con 2 notas de cobertura parcial, SC construibles reflejadas en tareas.
- **2 hallazgos HIGH**: (INC-01) las órdenes pagadas con usos de refacciones sin precio quedarían bloqueadas de forma permanente para generar ticket, en tensión con el supuesto "las órdenes pagadas conservan su total"; (INC-03) la instrucción de idempotencia del seed 008 no especifica el mecanismo, y el decremento relativo de stock no es idempotente.
- **3 MEDIUM** y **4 LOW**: ambigüedad en el predicado de adopción (posible circularidad), deriva de terminología sobre el filtro de pendientes, y pruebas sin tarea dedicada para el contrato de `GET /api/orders/:id`.

Recomendación: resolver INC-01 y INC-03 (y si se desea, AMB-01) antes de `/speckit.implement`; el resto no bloquea.

---

## Tabla de hallazgos

| ID | Categoría | Severidad | Ubicación | Resumen | Recomendación |
|----|-----------|-----------|-----------|---------|---------------|
| INC-01 | Inconsistencia | HIGH | spec.md (FR-010, Casos límite, Supuestos "las órdenes pagadas conservan su total", Fuera de alcance); research.md D4/D8; data-model.md (adopción) | Una orden ya pagada (liquidada) con usos antiguos sin precio (`unit_price IS NULL`) no adopta precio (la adopción solo cubre órdenes abiertas no liquidadas) y, sin embargo, FR-010 bloquea el ticket de toda orden con total incompleto: esa orden quedaría **sin ticket de por vida**, contradiciendo el espíritu de "las órdenes pagadas conservan su total" (su total histórico sí está completo con el cobro que ya se hizo). El mismo choque afecta a `estadoCobro` de una orden liquidada con usos NULL (research D8 la describe como informativa). | Decidir e integrar en spec + contracts: el bloqueo `TOTAL_INCOMPLETO` del ticket (FR-010) y del cobro (FR-009) aplica solo a órdenes **no liquidadas**; una orden liquidada conserva su total histórico y su ticket se emite con los usos sin precio visibles como pendientes. Añadir el caso límite correspondiente. |
| INC-03 | Inconsistencia | HIGH | tasks.md T002; data-model.md (Datos de ejemplo); research.md D6 | La tarea T002 exige seed 008 idempotente, pero no especifica el mecanismo: un `UPDATE parts SET stock = stock - qty` (o `SET stock = stock + qty`) **no es idempotente** y re-aplicaría el descuento en cada corrida; además `apply-seeds.mjs` ejecuta todos los `.sql` en cada instalación. Los seeds anteriores son idempotentes por IDs fijos + `ON DUPLICATE KEY UPDATE`, pero eso no protege la columna `stock` de una `UPDATE` relativa. | Detallar en T002 (o como nota de implementación) que `stock` se fija con **valores absolutos** (`UPDATE parts SET stock = 10, sale_price = 85.00 WHERE id = 1`), no relativos, y que las líneas de `order_parts` y los movimientos usan IDs fijos con `ON DUPLICATE KEY UPDATE`. |
| AMB-01 | Ambigüedad | HIGH→MEDIUM | data-model.md (Adopción: "pagos COMPLETED < total recalculado de esa orden"); research.md D4 | El predicado de "no liquidada" usa el "total recalculado", pero el total depende de la propia adopción: si se evalúa **después** de adoptar, una orden pagada al 100 % con precio $0 de refacciones podría clasificarse como no liquidada y adoptar (rompiendo "las pagadas conservan su total"); si se evalúa **antes**, una orden parcial que al adoptar quedara liquidada por gredondeo no adoptaría. Hay que fijar el orden de evaluación. | Especificar: la elegibilidad se evalúa con el total **previo a la adopción** (`cobrado < total_sin_los_usos_por_adoptar`); tras adoptar, el total se recalcula al vuelo aunque la orden resulte liquidada (volvería a mostrar saldo $0). Quitar la palabra "recalculado" ambigua del SQL de data-model.md. |
| INC-02 | Inconsistencia | MEDIUM | contracts/api-rest.md (`?pending-price`, "solo activas"); data-model.md (`sale_price IS NULL AND is_active = 1`); spec.md FR-003/CA-17 | El filtro de pendientes considera solo refacciones **activas** en contrato y modelo de datos, pero el spec (FR-003, CA-17) no lo declara; un revisor podría probar el filtro con la refacción inactiva de ejemplo (ID 6) y esperar que aparezca. | Acotar en el spec (FR-003 o CA-17) que el filtro aplica a refacciones activas, o bien quitar la restricción de `is_active` en los otros documentos. |
| COV-01 | Cobertura | MEDIUM | tasks.md Fase 4/5; contracts/api-rest.md (`GET /api/orders/:id`); server/tests/contract/orders-detail.contract.test.js (existe en el repo y no se lista) | El cambio de la forma de `totals` en `GET /api/orders/:id` (`parts`, `totalCompleto`, `refaccionesSinPrecio`) no tiene tarea de actualización del contrato de esa ruta, aunque `server/tests/contract/orders-detail.contract.test.js` ya existe en el repo. CA-6/CA-14 se prueban por integración, pero el contrato podría quedar desactualizado. | Agregar una tarea en la Fase 4 (por ejemplo junto a T019) que actualice `server/tests/contract/orders-detail.contract.test.js` con el nuevo bloque `totals` [FR-007][FR-008]. |
| AMB-02 | Ambigüedad | LOW | spec.md CA-5; tasks.md T017 | CA-5 ("el mismo cambio de precio sí eleva el importe al agregar esa refacción a una orden nueva") no tiene una fase de prueba dedicada; T017 lo cubre de forma implícita. | Asegurar en T017 un caso explícito: agregar la refacción a una orden **tras** el cambio y verificar el precio nuevo (2 × $200 = $400). |
| AMB-03 | Ambigüedad | LOW | spec.md CA-10; tasks.md T024/T025 | CA-10 exige que cobro y ticket "vuelvan a funcionar tras asignar el precio"; las pruebas T024/T025 prueban el bloqueo, no explícitamente la re-habilitación (que depende de T019 + reintento). | Ampliar T024 (o T019) con un caso que asigne precio y luego registre el pago con éxito. |
| DUP-01 | Duplicación | LOW | spec.md Supuestos (bullets "Las órdenes ya pagadas conservan el total…" y "Las órdenes abiertas no liquidadas…adoptan…") | La regla de preservación de órdenes pagadas aparece dos veces con distinta extensión, riesgo de desfase si se edita una sola. | Consolidar en un solo bullet (mantener el segundo, que es el más completo) — sin romper la trazabilidad con las respuestas de clarificación. |
| COV-02 | Cobertura | LOW | tasks.md T020 (historialVehiculo); server/tests/integration/history-mileage.test.js y server/tests/contract/vehicle-history.contract.test.js (existentes, no listados) | El cambio de `historialVehiculo` (totales con refacciones) no tiene tarea de prueba asociada; las suites existentes de historial cubrían el total anterior. | Agregar a T020 la instrucción de verificar/ajustar `server/tests/contract/vehicle-history.contract.test.js` con el total que incluye refacciones [FR-007]. |

---

## Cobertura de requisitos

### Requisitos funcionales (FR)

| Requisito | ¿Tiene tarea? | IDs de tarea | Notas |
|-----------|---------------|--------------|-------|
| FR-001 | ✔ | T001, T006, T007, T011, T012, T013, T015, T034 | Cobertura completa backend + Flutter |
| FR-002 | ✔ | T009, T013 | Denegación por rol probada en contrato |
| FR-003 | ✔ | T002, T008, T011, T014, T015, T031 | Ver INC-02 sobre el filtro de activas |
| FR-004 | ✔ | T001, T017, T021 | Precio congelado al agregar |
| FR-005 | ✔ | T003, T004, T018, T021, T032 | Rechazo + código de error |
| FR-006 | ✔ | T017 | Prueba de inmutabilidad; la implementación se deriva de T020/T021 (congelado) |
| FR-007 | ✔ | T016, T017, T018, T020, T021, T023 | Ver COV-02 (historial) |
| FR-008 | ✔ | T004, T016, T020 | Bandera `partsIncomplete` |
| FR-009 | ✔ | T004, T024, T026, T027, T028, T030 | Ver INC-01 (orden liquidada) |
| FR-010 | ✔ | T004, T025, T026, T029, T030 | Ver INC-01 (orden liquidada) |
| FR-011 | ✔ | T019, T022 | Ver AMB-01 (predicado) |
| FR-012 | ✔ | T024, T028 | |
| FR-013 | ✔ | T025, T029 | |
| FR-014 | ✔ | T025, T029, T027, T030 | |
| FR-015 | ✔ | T002, T031, T033 | Ver INC-03 (mecanismo de idempotencia) |

**FR sin cobertura: 0 (100 %).**

### Criterios de aceptación (CA)

| Criterio | ¿Tiene tarea? | IDs de tarea | Notas |
|----------|---------------|--------------|-------|
| CA-1 | ✔ | T007, T015 | |
| CA-2 | ✔ | T006, T007, T012 | |
| CA-3 | ✔ | T017 | |
| CA-4 | ✔ | T017 | |
| CA-5 | ✔ (parcial) | T017 | Ver AMB-02: caso "orden nueva tras el cambio" implícito |
| CA-6 | ✔ | T017, T023 | Ver COV-01 (contrato de `GET /api/orders/:id`) |
| CA-7 | ✔ | T016 | |
| CA-8 | ✔ | T018 | |
| CA-9 | ✔ | T004, T016, T020, T023 | Detalle de refacciones señaladas en `details` |
| CA-10 | ✔ (parcial) | T024, T025 | Ver AMB-03: re-habilitación tras asignar precio |
| CA-11 | ✔ | T019 | |
| CA-12 | ✔ | T024 | |
| CA-13 | ✔ | T025, T027, T030 | |
| CA-14 | ✔ | T025 | |
| CA-15 | ✔ | T018 | |
| CA-16 | ✔ | T009, T013 | |
| CA-17 | ✔ | T008, T014, T031 | Ver INC-02 |
| CA-18 | ✔ | T002, T031 | |
| CA-19 | ✔ | T019 | Ver AMB-01 |
| CA-20 | ✔ | T002, T031 | |

**CA sin cobertura: 0 (100 %); 2 con nota de cobertura parcial (CA-5, CA-10).**

### Criterios de éxito construibles (SC)

SC-005 (recálculo de órdenes sin intervención manual) → T022; SC-007 (pruebas existentes siguen pasando, solo preparación adaptada) → T003 + T032; SC-006 (total visible sin recargar) → T023/T030. Los SC de resultado (SC-001 a SC-004) se derivan de las pruebas de las historias; ninguno exige infraestructura no contemplada.

---

## Detecciones por pase

### Duplicaciones
- **DUP-01** (única): regla de órdenes pagadas repetida en Supuestos del spec. El resto de reglas tienen una sola fuente por documento: el precio congelado se documenta una vez (research D2) y se consume en data-model/contracts/tasks.

### Ambigüedades
- **AMB-01**, **AMB-02**, **AMB-03** (tabla). No se hallaron adjetivos sin medida ("rápido", "robusto", "escalable") ni placeholders (TODO/TKTK/`<...>`) en los seis artefactos.

### Insuficiencia de especificación
- Sin tareas que referencien archivos inexistentes: todos los paths citados en tasks.md existen en el repo o se declaran como archivos nuevos con su ruta exacta (`016_add_part_prices.sql`, `008_demo_part_prices.sql`, `part-validator-part-price.test.js`, etc.).
- El spec no define permisos de lectura de `salePrice` (solo de escritura, FR-002/CA-16); el contrato lo expone a los tres roles en `GET /api/parts`. No es contradictorio y es coherente con el catálogo actual de partes (mecánico necesita verlo para la orden); se anota como decisión registrada en contracts, no como hallazgo.

### Alineación con la constitución
- Sin violaciones. Verificación detallada:

| Principio | Verificación |
|-----------|--------------|
| I (alcance/fuente de verdad) | ✔ Brecha declarada en project-context + FR-003 del spec 004; specs 1–4 intactos; trazabilidad FR → historia → tarea presente |
| II (arquitectura) | ✔ Lógica de negocio en `services/`; SQL en `models/`; sin lógica en controllers/widgets |
| III (stack/base de datos) | ✔ ES Modules, `mysql2` sin ORM, migración 016 numerada e inmutable (001–015 sin editar), seeds con IDs fijos + `ON DUPLICATE KEY UPDATE`, sin dependencias nuevas (revisado: tasks.md no introduce librerías) |
| IV (seguridad) | ✔ Roles validados en servidor (T009/T013); validación de entradas (T012); sin secretos nuevos |
| V (reglas de negocio) | ✔ Uso de refacción = salida de inventario conservada (T018/T021); stock ≥ 0 en seed (T002 lo exige); pagos siempre sobre una orden |
| VI (API) | ✔ Códigos de error nuevos en el catálogo central (T004); envoltorio estándar `ok/created/error` |
| VII (pruebas) | ✔ Jest + supertest contra `motorix_test` (T005), `flutter test` (T010, T027); pruebas antes que implementación; T003/T032 preservan flujos previos |
| VIII (UX/UI) | ✔ T015/T023/T030 citan el sistema de diseño; mensajes de aviso/error |

### Idempotencia de los datos de ejemplo
- **Semilla de precios (partes)**: segura — `ON DUPLICATE KEY UPDATE` con asignación absoluta de `sale_price`.
- **Líneas de uso y movimientos**: seguras si usan IDs fijos + `ON DUPLICATE KEY UPDATE` (patrón de los seeds 001–007).
- **`stock`**: **no segura con decremento relativo** → hallazgo **INC-03**. Con asignación absoluta queda resuelta.
- **Re-aplicación completa** (`apply-seeds.mjs` dos veces): OK tras aplicar INC-03; la verificación manual está en quickstart paso 2 y T031.

### Reglas circulares
- Único candidato: el predicado de adopción vs. el total → **AMB-01**. El resto de las reglas tienen dependencia unidireccional: `sale_price` → `unit_price` → total → saldo → estado de cobro → bloqueos.

---

## Tareas sin requisito mapeado

Ninguna. T004 y T005 (infraestructura) se mapean a FR-005/FR-008 y a la base de pruebas respectivamente; T031–T034 se mapean a CA-20/CA-17, FR-015, CA-8 y CA-1.

---

## Métricas

| Métrica | Valor |
|---------|-------|
| Requisitos funcionales (FR) | 15 |
| Criterios de aceptación (CA) | 20 |
| Criterios de éxito construibles revisados | 3 de 7 (los otros 4 son métricas de resultado) |
| Tareas totales | 34 (Preparación 4, Fundacional 1, US1 10, US2 8, US3 7, Pulido 4) |
| Cobertura FR (≥ 1 tarea) | 15/15 = **100 %** |
| Cobertura CA (≥ 1 tarea) | 20/20 = **100 %** (2 parciales) |
| Hallazgos de ambigüedad | 3 |
| Hallazgos de duplicación | 1 |
| Hallazgos CRÍTICOS | **0** |
| Hallazgos HIGH | 2 (INC-01, INC-03) |
| Hallazgos MEDIUM | 3 (AMB-01, INC-02, COV-01) |
| Hallazgos LOW | 4 (AMB-02, AMB-03, DUP-01, COV-02) |

---

## Próximas acciones

1. **Antes de `/speckit.implement`**: resolver INC-01 (alcance del bloqueo `TOTAL_INCOMPLETO` en órdenes liquidadas) y INC-03 (mecanismo absoluto de idempotencia del seed 008). Son cambios pequeños: un ajuste de una regla en spec + contracts, y una nota de implementación en T002/data-model.
2. **Recomendado en el mismo pase**: AMB-01 (fijar "elegibilidad evaluada con el total previo a la adopción"), INC-02 (acotar el filtro a activas en el spec) y COV-01 (tarea para `orders-detail.contract.test.js`).
3. **Opcionales**: AMB-02, AMB-03, DUP-01 y COV-02 pueden resolverse como ajustes menores de redacción o durante la implementación sin riesgo de retrabajo.
4. **Comandos sugeridos**: 
   - Tras resolver los HIGH: `/speckit.implement` (o `/speckit.checklist` si se desea una segunda revisión de calidad).
   - Si se prefiere corregir en origen: `/speckit.clarify` para INC-01/AMB-01 y edición manual de `tasks.md` para INC-03/COV-01.

---

## Oferta de remediación

¿Te gustaría que proponga las ediciones concretas para los N problemas principales (por defecto los 5: INC-01, INC-03, AMB-01, INC-02, COV-01)? No las aplicaré sin tu confirmación explícita.
