# Lista de verificación de calidad de requisitos: Precio de venta de refacciones y total de la orden

**Propósito**: Evaluar la calidad de los requisitos escritos (completitud, claridad, consistencia, medibilidad, trazabilidad y cobertura) en los focos de cálculo del total y manejo de dinero, permisos por rol, compatibilidad con datos anteriores y casos límite.
**Creada**: 2026-11-02
**Feature**: [spec.md](../spec.md)

**Nota**: Esta lista personalizada la genera el comando `/speckit.checklist` a partir del contexto del spec y sus requisitos. Es una "suite de pruebas unitarias" del texto de los requisitos, no del sistema.
**Propiedad de la revisión**: Esta lista es un artefacto de revisión propiedad del revisor. Marca un ítem `[x]` solo cuando el revisor determina que el criterio de calidad del requisito está satisfecho.
**Semántica de los marcadores**: `[x]` significa que el criterio de calidad del requisito fue revisado y satisfecho. NO significa que el trabajo de implementación esté completo.

## Cálculo del total y manejo de dinero

- [ ] CHK001 - ¿Está definida la fórmula del total en un solo requisito, con todos sus componentes (servicios, mano de obra, importe de cada refacción usada) y sin ambigüedad sobre qué precio aplica a cada uso? [Claridad, Spec §FR-007]
- [ ] CHK002 - ¿Están definidos como requisitos el saldo pendiente y la condición de liquidación de la orden derivados del total que incluye refacciones? [Completeness, Spec §FR-012, CA-12]
- [ ] CHK003 - ¿Están definidos como requisitos independientes ambos aspectos del ticket (total con refacciones incluidas y desglose de cada refacción con cantidad, precio e importe)? [Completeness, Spec §FR-013, FR-014]
- [ ] CHK004 - ¿Están definidos por separado los bloqueos de cobro y de ticket ante total incompleto, incluida la forma de indicar qué refacción falta por precios? [Completeness, Spec §FR-008, FR-009, FR-010, CA-9]
- [ ] CHK005 - ¿Está clarificado en un requisito que un precio de venta de $0 cuenta como precio registrado (no marca el total como incompleto) y suma $0 al total? [Claridad, Spec §Casos límite, FR-008]
- [ ] CHK006 - ¿Está cuantificado el formato monetario (moneda única y dos decimales) como requisito verificable y no solo como supuesto? [Claridad, Spec §Supuestos]
- [ ] CHK007 - ¿Está definido el tratamiento de importes con más de dos decimales al calcular precio × cantidad (redondeo o truncamiento)? [Gap, Spec §FR-007]
- [ ] CHK008 - ¿Está cuantificado con un umbral numérico el tiempo máximo de actualización del total al agregar o retirar una refacción ("unos segundos" en SC-006)? [Measurability, Spec §SC-006]
- [ ] CHK009 - ¿Están definidos como requisitos los efectos del retiro de una refacción (descuento de su importe del total y reposición de stock), no solo listados como caso límite? [Completeness, Spec §CA-15, Casos límite]

## Permisos por rol

- [ ] CHK010 - ¿Están enumeradas como requisito todas las acciones sobre el precio de venta restringidas a administración (registro y modificación), sin dejar acciones implícitas? [Completeness, Spec §FR-001, FR-002]
- [ ] CHK011 - ¿Está especificada la respuesta ante una denegación por rol (mensaje o estado visible y ausencia de cambios en los datos), no solo que "se deniega"? [Claridad, Spec §CA-16, US1 escenario 5]
- [ ] CHK012 - ¿Está definido qué roles pueden consultar o ver el precio de venta en la ficha, en el inventario y en el ticket, además de editarlo? [Gap, Spec §FR-001, FR-014]
- [ ] CHK013 - ¿Está definido qué roles pueden usar la lista o el filtro de pendientes de precio? [Gap, Spec §FR-003, CA-17]
- [ ] CHK014 - ¿Está definido qué rol asigna los precios que adoptan los usos antiguos de órdenes abiertas, con su validación en el servidor? [Gap, Spec §FR-011, CA-19]
- [ ] CHK015 - ¿Es consistente el rol autorizado entre el escenario US1-5, FR-002 y CA-16 (mismos roles, mismas acciones, misma denegación)? [Consistency, Spec §FR-002, CA-16]

## Compatibilidad con datos anteriores

- [ ] CHK016 - ¿Están reflejados en requisitos FR/CA (y no solo en la lista de casos límite) los destinos de los datos previos: usos sin precio en órdenes abiertas no liquidadas frente a órdenes ya pagadas? [Traceability, Spec §Casos límite, FR-011, FR-016]
- [ ] CHK017 - ¿Está definido como requisito verificable el criterio de "no liquidada" para la adopción de precios (evaluado con el total previo a la adopción), reflejado en FR/CA y no solo en las clarificaciones? [Claridad, Spec §Clarifications (AMB-01), FR-011, CA-19]
- [ ] CHK018 - ¿Está definido el destino de los pagos ya registrados tras la adopción de un precio (conservarlos y ajustar el saldo pendiente al nuevo total)? [Completeness, Spec §CA-19, Casos límite]
- [ ] CHK019 - ¿Están definidos como requisito los datos de ejemplo requeridos (refacciones con precio y usos en las órdenes de ejemplo con precio registrado)? [Completeness, Spec §FR-015, CA-18, CA-20]
- [ ] CHK020 - ¿Está formulado de forma medible el requisito de no regresión de specs y pruebas anteriores (qué debe seguir cumpliéndose tras el cambio)? [Measurability, Spec §SC-007, Supuestos]
- [ ] CHK021 - ¿Está documentada la relación con el FR-003 del spec 004 (complemento sin contradicción) y la lista de specs que no se modifican? [Consistency, Spec §Supuestos, Fuera de alcance]
- [ ] CHK022 - ¿Está definido como requisito (y no solo como supuesto) el destino de las órdenes entregadas o canceladas ante el cambio: no se reabren ni se recalculan? [Consistency, Spec §Supuestos, Casos límite]

## Casos límite y cobertura de escenarios

- [ ] CHK023 - ¿Está mapeado cada uno de los diez casos límite listados a un FR/CA correspondiente, o están identificados explícitamente como sin requisito? [Traceability, Spec §Casos límite]
- [ ] CHK024 - ¿Está cubierto por un criterio de aceptación el escenario de agregar una refacción a una orden ya pagada pero no entregada (el total aumenta y el saldo pendiente reaparece)? [Gap, Spec §Casos límite, CA-19]
- [ ] CHK025 - ¿Está definido qué ocurre cuando los pagos acumulados superan el nuevo total tras el retiro de una refacción (sobrepago o saldo a favor)? [Gap, Spec §Casos límite, CA-15]
- [ ] CHK026 - ¿Están definidos los escenarios de error durante la adopción de precios en varias órdenes (resultado parcial, mensaje y consistencia de los totales afectados)? [Gap, Spec §FR-011, Exception Flow]
- [ ] CHK027 - ¿Están definidos los escenarios de uso concurrente (varios usuarios agregando refacciones o cambiando precios en el mismo momento)? [Gap, Spec §FR-004, FR-006]
- [ ] CHK028 - ¿Está definido el flujo de recuperación completo tras asignar el precio: qué desbloqueos ocurren (total, cobro, ticket) y en qué condiciones? [Recovery, Spec §CA-10, CA-11]
- [ ] CHK029 - ¿Está cubierto por un requisito el rechazo del precio vacío (no solo el negativo o no numérico)? [Gap, Spec §FR-001, CA-2, Casos límite]

## Consistencia y trazabilidad (EARS, FR ↔ CA)

- [ ] CHK030 - ¿Sigue cada FR un único patrón EARS con una sola respuesta, sin requisitos compuestos que mezclen varias respuestas? [Consistency, Spec §Requisitos]
- [ ] CHK031 - ¿Todo FR referencia al menos un CA y todo CA está referenciado por algún FR (cobertura cruzada completa)? [Traceability, Spec §FR-001–FR-016, CA-1–CA-21]
- [ ] CHK032 - ¿Están mapeados los escenarios de aceptación de US1–US3 a identificadores FR/CA? [Gap, Spec §Escenarios de usuario y pruebas]
- [ ] CHK033 - ¿Es consistente la definición de "orden abierta" frente a "orden liquidada" entre las clarificaciones, Entidades clave y los FR/CA que la usan? [Consistency, Spec §Entidades clave, FR-008–FR-012]
- [ ] CHK034 - ¿Es consistente la regla de total incompleto entre FR-008 (marca), FR-009 y FR-010 (bloqueos) y FR-016 (excepción para la orden ya liquidada)? [Consistency, Spec §FR-008–FR-010, FR-016]
- [ ] CHK035 - ¿Están alineados los SC con los FR, de modo que ningún SC exija alcance fuera del spec ni omita un resultado mensurable clave? [Consistency, Spec §SC-001–SC-007]

## Criterios de aceptación y éxito medibles

- [ ] CHK036 - ¿Usan todos los CA valores concretos (importes, cantidades, resultados) que permiten una comprobación objetiva sin términos vagos? [Measurability, Spec §CA-1–CA-21]
- [ ] CHK037 - ¿Definen SC-003 y SC-004 de forma verificable "total incompleto" y "total histórico", sin depender de interpretación? [Measurability, Spec §SC-003, SC-004]
- [ ] CHK038 - ¿Especifican SC-001 y SC-005 el universo de medición y el método de comprobación de sus porcentajes del 100 %? [Measurability, Spec §SC-001, SC-005]

## Supuestos, dependencias y alcance

- [ ] CHK039 - ¿Están identificados como supuestos los comportamientos heredados de specs previos (stock, órdenes cerradas) y confirmados como dependencias vigentes? [Assumption, Spec §Supuestos, Casos límite]
- [ ] CHK040 - ¿Es consistente el alcance mínimo (solo precio de venta) entre "Fuera de alcance", Supuestos y los FR, sin requisitos que lo excedan? [Consistency, Spec §Fuera de alcance]

## Notas

- Marca los ítems `[x]` solo cuando la revisión confirme que el criterio de calidad del requisito está satisfecho.
- Deja los ítems sin marcar cuando aún requieran aclaración, corrección o evaluación del revisor.
- `/speckit.implement` lee el estado de las casillas como gate y no debe modificar los marcadores.
- `checklists/requirements.md` tiene un ciclo de vida propio, mantenido por `/speckit.specify` y `/speckit.clarify`; esta lista es independiente.
- Añade comentarios o hallazgos directamente junto al ítem.
- Los ítems se numeran de forma correlativa (CHK001–CHK040) para facilitar la referencia.
