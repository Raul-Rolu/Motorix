# Especificación de la feature: Categoría, marca, precio de compra y cobro consistente

**Rama de la feature**: `006-complemento-precios-compra`

**Creada**: 2026-11-21

**Estado**: Borrador

**Input**: Descripción del usuario: "Usar `docs/sprints/sprint-5-complemento-precios-compra.md` como único insumo de alcance. Generar la especificación en español solo para la diferencia descrita en el insumo: categoría, marca y precio de compra (visible solo para ADMIN), límites de precios, cálculo en centavos enteros, cobro desfasado de Mercado Pago, seeds idempotentes (hallazgo H-14) y actualización de documentación. Respetar la sección 9: las propuestas ya acordadas se toman como decisiones; dejar como [NEEDS CLARIFICATION] únicamente las dos que siguen abiertas. Numerar la spec como la siguiente disponible (006)."

## Clarifications

### Session 2026-11-21

- Q: ¿Cómo se representa exactamente el cobro de Mercado Pago desfasado: un nuevo estado `STALE` en `payments` o una columna/marca aparte? (FR-008) → A: Se agrega el estado `STALE` a `payments`; un cobro de Mercado Pago `PENDING` cuyo importe ya no coincide con el saldo pendiente de la orden (total menos pagos confirmados) pasa a `STALE`, no puede confirmarse y no cuenta como pago vigente (ni para la regla de un solo pago vigente ni para el saldo pendiente), de modo que se puede generar uno nuevo con el importe vigente.
- Q: ¿Cómo se muestran la categoría y la marca en el listado de inventario: columnas fijas, filtros o ambos? (FR-014) → A: El listado de inventario muestra columnas fijas de categoría y marca, sin filtros nuevos.

## Alcance de esta especificación

Esta feature es **solo la diferencia** entre la rama actual (spec `005-precio-venta-refacciones`) y el Sprint 5 completo del equipo (`docs/sprints/sprint-5-precios-refacciones-cobro.md`). Lo ya cubierto por la spec 005 **no se reescribe ni se vuelve a especificar**:

| Elemento del Sprint 5 del equipo | Estado en la spec 005 |
|---|---|
| Precio de venta vigente guardado al agregar la refacción | Cubierto |
| Total = servicios + mano de obra + refacciones | Cubierto (falta solo el cálculo en centavos enteros, que sí entra aquí) |
| Pago por el total con refacciones | Cubierto |
| Pagos y tickets anteriores sin cambios | Cubierto; aquí se agrega solo la prueba explícita de compatibilidad |
| Ticket con cantidad, precio e importe por refacción | Cubierto |
| Un solo pago vigente, sin datos de tarjeta | Cubierto (Sprint 4) |
| Panel y listados con el nuevo total | Cubierto |
| Precio de venta no negativo, numérico, 2 decimales | Cubierto; aquí se agregan los límites máximos y la validación de los tres precios |
| Refacción sin precio no se agrega a una orden | Cubierto |

## Decisiones ya acordadas (sección 9 del insumo; no se reabren)

- **Categoría**: lista fija definida en el sistema (no administrable) con valores de ejemplo; **marca**: texto libre de hasta 50 caracteres. Ambas opcionales.
- **Precio de venta menor al precio de compra**: se permite y se muestra una advertencia al administrador.
- **Precio de venta para mecánico y recepción**: lo ven (ya lo usan en la orden); solo el precio de compra se oculta.
- **Cobro desfasado de Mercado Pago**: un cobro `PENDING` cuyo importe ya no coincide con el saldo pendiente (total menos pagos confirmados) pasa al estado `STALE` (nuevo estado en `payments`), no puede confirmarse, no cuenta como pago vigente y se permite generar uno nuevo; no se actualiza el importe de un cobro ya generado.
- **Corrección del precio de una línea de orden abierta**: no se permite (se mantiene la instantánea de la spec 005).
- **Tickets anteriores**: se muestran igual que hoy, sin tocar su contenido.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Categoría, marca y precio de compra en la refacción (Prioridad: P1)

Como administrador, quiero registrar la categoría, la marca y el precio de compra de una refacción para conocer su costo y clasificarla.

**Por qué esta prioridad**: Es el dato nuevo central de este complemento: sin el precio de compra y su clasificación no se cubre la brecha frente al Sprint 5 del equipo, y el resto de las historias (ocultarlo, limitarlo, sembrarlo) depende de que exista.

**Independiente**: Se puede probar registrando una refacción con categoría, marca y precio de venta, verificando que los tres datos se guardan, se consultan y se editan, sin tocar órdenes, cobros ni tickets.

**Escenarios de aceptación**:

1. **Dado** la ficha de una refacción sin categoría, marca ni precio de compra, **Cuando** la administración registra esos datos, **Entonces** quedan guardados y se muestran junto con el resto de la ficha.
2. **Dado** una refacción con categoría, marca y precio de compra registrados, **Cuando** la administración los modifica, **Entonces** los nuevos valores quedan guardados y se usan en las consultas siguientes.
3. **Dado** una categoría que no pertenece a la lista fija del sistema, **Cuando** se intenta guardar, **Entonces** el sistema rechaza el valor con un mensaje claro y los datos no cambian.
4. **Dado** una marca capturada, **Cuando** se guarda, **Entonces** se acepta si tiene hasta 50 caracteres y se rechaza si la excede.
5. **Dado** una refacción registrada sin categoría ni marca (ambas opcionales), **Cuando** se guarda, **Entonces** el sistema la acepta y la consulta sin errores.
6. **Dado** un precio de venta menor al precio de compra, **Cuando** la administración intenta guardarlo, **Entonces** el sistema lo acepta y muestra una advertencia clara sin impedir la operación.

---

### Historia de usuario 2 - Límites de precios y cálculo en centavos enteros (Prioridad: P2)

Como administrador, quiero que los precios respeten límites máximos y solo dos decimales, y que los importes del sistema se calculen en centavos enteros, para evitar capturas absurdas y diferencias de redondeo en el dinero.

**Por qué esta prioridad**: Protege la zona de mayor riesgo del sistema (el dinero): un límite ausente o un redondeo erróneo afecta totales, saldos y cobros; es independiente porque se valida con precios y totales capturados directamente.

**Independiente**: Se puede probar capturando precios en los límites y calculando un total con varias líneas, verificando el rechazo de valores inválidos y la ausencia de diferencias de redondeo, sin usar Mercado Pago.

**Escenarios de aceptación**:

1. **Dado** un precio de venta, de compra o total capturados con negativos, valores no numéricos o más de dos decimales, **Cuando** se intenta guardar, **Entonces** el sistema rechaza el valor con un mensaje claro y no cambia el dato previo.
2. **Dado** un precio de $999,999.99, **Cuando** se intenta guardarlo, **Entonces** el sistema lo acepta; **Dado** un precio de $1,000,000.00, **Cuando** se intenta guardarlo, **Entonces** el sistema lo rechaza.
3. **Dado** un total de orden de $99,999,999.99, **Cuando** se calcula, **Entonces** el sistema lo acepta; **Dado** un total mayor, **Cuando** se intenta registrar, **Entonces** el sistema lo rechaza.
4. **Dado** una orden con varias líneas cuyos importes individuales generan fracciones de centavo, **Cuando** se calculan totales, saldos y pagos, **Entonces** el resultado coincide con el cálculo hecho sobre centavos enteros, sin diferencias de redondeo.

---

### Historia de usuario 3 - El precio de compra solo lo ve administración (Prioridad: P2)

Como mecánico o recepcionista, quiero seguir trabajando con refacciones sin que el sistema me exponga el precio de compra para no revelar información financiera del taller.

**Por qué esta prioridad**: Es una regla de seguridad y de negocio (RN-15): si el dato se filtra, no hay forma de recuperar la confidencialidad; puede probarse de forma independiente sobre la consulta de una refacción.

**Independiente**: Se puede probar iniciando sesión con rol mecánico o recepción, consultando y editando refacciones, y verificando que el precio de compra no llega al cliente y que la operación de escritura es denegada en el backend.

**Escenarios de aceptación**:

1. **Dado** un usuario con rol mecánico o recepción, **Cuando** consulta el inventario o el detalle de una refacción, **Entonces** la respuesta no incluye el precio de compra, ni en pantalla ni en la interfaz de servicio.
2. **Dado** un usuario con rol mecánico o recepción, **Cuando** intenta registrar o modificar la categoría, la marca o el precio de compra, **Cuando** la operación llega al sistema, **Entonces** el sistema la rechaza con un error de autorización, sin importar lo que muestre la interfaz.
3. **Dado** un usuario con rol de administración, **Cuando** consulta o edita una refacción, **Entonces** recibe y modifica el precio de compra sin restricciones.

---

### Historia de usuario 4 - Cobro de Mercado Pago desfasado detectado y resuelto (Prioridad: P3)

Como recepcionista, quiero que un cobro de Mercado Pago pendiente cuyo importe ya no coincide con el saldo pendiente se detecte y se resuelva para no cobrar de más ni de menos.

**Por qué esta prioridad**: Es visible para el cliente y evita cobros incorrectos, pero depende del total correcto ya entregado por la spec 005; se prueba de forma independiente sobre una orden con un cobro ya generado.

**Independiente**: Se puede probar generando un cobro pendiente, cambiando el total de la orden y verificando que el cobro pasa a estado `STALE` (desfasado), que no puede confirmarse con el importe anterior, que no cuenta como pago vigente y que se puede generar uno nuevo con el importe correcto, sin tocar inventario ni documentación.

**Escenarios de aceptación**:

1. **Dado** una orden con total de $1,800 y un cobro de Mercado Pago pendiente por ese importe, **Cuando** la administración asigna precio a una refacción usada en esa orden y el total pasa a $2,000, **Entonces** el cobro pendiente pasa al estado `STALE` (desfasado) y la interfaz lo señala de forma visible.
2. **Dado** un cobro desfasado (`STALE`), **Cuando** se intenta confirmarlo con el importe anterior, **Entonces** el sistema lo rechaza.
3. **Dado** una orden con un cobro `STALE` y sin otro cobro vigente, **Cuando** la recepción genera un nuevo cobro, **Entonces** este se crea con el importe vigente del saldo pendiente, el cobro `STALE` no cuenta como pago vigente y la orden puede liquidarse por el importe nuevo.
4. **Dado** un cobro desfasado, **Cuando** se consulta, **Entonces** su importe original se conserva sin modificarse (no se reescribe un cobro ya generado).
5. **Dado** una orden cuyo total no cambia, **Cuando** existe un cobro pendiente, **Entonces** el cobro permanece en estado pendiente (`PENDING`), no pasa a `STALE` y su flujo sigue siendo el habitual.

---

### Historia de usuario 5 - Datos de ejemplo cargables varias veces (Prioridad: P3)

Como equipo, quiero que los datos de ejemplo se puedan cargar varias veces sin duplicarse para que cualquier instalación muestre datos coherentes.

**Por qué esta prioridad**: Afecta a la instalación y a la demostración del sprint, no al usuario final del taller; es la condición para que cualquier integrante pueda repetir la puesta en marcha sin romper datos.

**Independiente**: Se puede probar ejecutando la carga de datos de ejemplo dos veces seguidas sobre una base recién instalada y verificando que los registros no se duplican y que los datos de trabajo no se reinician.

**Escenarios de aceptación**:

1. **Dado** una instalación con los datos de ejemplo ya cargados, **Cuando** se vuelve a ejecutar la carga completa de datos de ejemplo, **Entonces** no se duplican registros y los datos de trabajo existentes se conservan.
2. **Dado** la carga de datos de ejemplo, **Cuando** se ejecuta por primera vez en una base vacía, **Entonces** entrega refacciones con categoría, marca, precio de compra y precio de venta, además del resto de los datos de demostración.
3. **Dado** la carga de datos de ejemplo del paso anterior (identificada por su clave lógica, como los servicios y la mano de obra de una orden de ejemplo), **Cuando** se ejecuta una segunda vez, **Entonces** las filas correspondientes se reutilizan en lugar de agregarse de nuevo.

---

### Casos límite

- ¿Qué ocurre con las refacciones existentes al aplicar este cambio? (las que ya tienen precio de venta quedan con categoría y marca vacías y precio de compra pendiente hasta que administración los capture; no bloquean su uso en órdenes, porque el precio de compra no participa en el cobro)
- ¿Qué ocurre si un precio de compra capturado supera el límite máximo o trae más de dos decimales? (se rechaza con mensaje claro, sin guardar valor parcial)
- ¿Qué ocurre si el total de una orden alcanza su máximo permitido? (el sistema rechaza operaciones que lo rebasen con un mensaje claro y la orden no queda en un estado inconsistente)
- ¿Qué pasa con un cobro de Mercado Pago ya confirmado cuando cambia el total de la orden? (no se toca: solo los cobros pendientes pueden quedar desfasados; los confirmados conservan su importe, en línea con "los pagos ya emitidos no cambian")
- ¿Qué ocurre si el total vuelve a coincidir con el importe de un cobro desfasado? (sigue requiriendo atención explícita de la recepción para resolverlo; el sistema no lo revierte por silencio)
- ¿Cómo se ve el saldo de una orden con un cobro en `STALE`? (el cobro `STALE` no cuenta como pago vigente: el saldo pendiente se muestra sin descontar ese importe hasta que se registre un cobro nuevo por el saldo pendiente vigente)
- ¿Qué ocurre con las columnas de categoría y marca cuando la refacción no tiene esos datos opcionales? (las columnas existen siempre en el listado y muestran el campo vacío, sin ocultar la fila)
- ¿Qué ocurre si dos personas cambian el total de una orden con un cobro pendiente casi al mismo tiempo? (el cobro queda desfasado como máximo una vez y nunca puede confirmarse con un importe distinto al saldo pendiente vigente)
- ¿Qué ocurre con un pago o ticket emitidos antes de este cambio? (se consultan y muestran exactamente igual que hoy; el cambio no altera su contenido ni su importe)
- ¿Qué ocurre si un integrante sin permiso intenta leer el precio de compra directamente por la interfaz de servicio? (el backend lo rechaza u omite el campo, con prueba automatizada por rol)
- ¿Qué ocurre si la carga de datos de ejemplo se ejecuta a media instalación? (se comporta como cualquier reejecución: completa lo que falte sin duplicar lo ya cargado)

## Requisitos *(obligatorio)*

### Requisitos funcionales (formato EARS)

- **FR-001** (Ubicuo): El sistema deberá registrar y editar en la ficha de la refacción la categoría, la marca y el precio de compra, además del precio de venta ya existente. (CA-1)
- **FR-002** (Ubicuo): La categoría deberá elegirse de una lista fija definida en el sistema (no administrable) y la marca será texto libre de hasta 50 caracteres; ambas serán opcionales. (CA-1)
- **FR-003** (Ubicuo): El sistema deberá rechazar precios de venta, de compra y totales de orden negativos, no numéricos o con más de dos decimales; el límite máximo de un precio será 999,999.99 y el de un total de orden, 99,999,999.99. (CA-2)
- **FR-004** (No deseado): Si el precio de venta capturado es menor que el precio de compra de la misma refacción, entonces el sistema deberá permitir el guardado mostrando una advertencia clara al administrador. (CA-1)
- **FR-005** (Ubicuo): El precio de compra será un dato exclusivo de administración: el sistema no lo entregará en las consultas de los demás roles y validará el permiso en el backend, no solo en la interfaz. (CA-3)
- **FR-006** (Ubicuo): Solo administración podrá registrar o modificar categoría, marca y precio de compra; con cualquier otro rol la operación será rechazada por el sistema. (CA-4)
- **FR-007** (Ubicuo): Los totales de orden, saldos y pagos se calcularán en centavos enteros y se conservarán con precisión de dos decimales, sin diferencias de redondeo. (CA-5)
- **FR-008** (Evento): Cuando cambie el total de una orden mientras exista un cobro de Mercado Pago pendiente (`PENDING`) sobre ella, el sistema deberá pasar ese cobro al estado `STALE` (desfasado) de los pagos; el cobro en `STALE` no podrá confirmarse con el importe anterior, no contará como pago vigente (ni para la regla de un solo pago vigente ni para el saldo pendiente) y se permitirá generar un nuevo cobro con el importe vigente; el importe del cobro ya generado no se modifica. (CA-6)
- **FR-009** (No deseado): Si se intenta confirmar un cobro de Mercado Pago cuyo importe no coincide con el saldo pendiente vigente de la orden (el total menos los pagos confirmados), entonces el sistema deberá rechazar la confirmación. (CA-6)
- **FR-010** (Evento): Cuando se carguen los datos de ejemplo, la ejecución deberá ser idempotente: poder repetirse dos veces seguidas sin duplicar registros ni reiniciar datos de trabajo, corrigiendo la duplicación del seed 004 (hallazgo H-14) con identificadores fijos en los servicios, la mano de obra y las entradas de las órdenes de ejemplo, sin llaves únicas ni borrado de filas. (CA-8)
- **FR-011** (Evento): Cuando se instala o se cargan los datos de ejemplo, el sistema deberá entregar refacciones que incluyan categoría, marca, precio de compra y precio de venta. (CA-9)
- **FR-012** (Evento): Cuando se emita un pago o un ticket antes de este cambio, el sistema deberá conservar su consulta y su contenido exactamente como están hoy (prueba explícita de compatibilidad). (CA-7)
- **FR-013** (Evento): Cuando cierre este sprint, el equipo deberá actualizar `docs/project-context.md`, `docs/design-system.md` y los comentarios del código que afirman que las refacciones no suman importe, para que la documentación no contradiga al sistema. (CA-11)
- **FR-014** (Ubicuo): El listado de inventario deberá mostrar la categoría y la marca de cada refacción en columnas fijas, sin agregar filtros nuevos en esta feature. (CA-1)
- **FR-015** (Ubicuo): Las pruebas de esta feature deberán cubrir límites de precios, permisos por rol del precio de compra, cálculo en centavos, cobro desfasado y compatibilidad, sin dejar rojas las suites previas. (CA-10)

### Criterios de aceptación

- **CA-1**: Se comprueba que una refacción puede registrarse y editarse con categoría, marca y precio de compra, además del precio de venta, que los datos persisten y se vuelven a consultar correctamente, y que el listado de inventario muestra las columnas de categoría y marca.
- **CA-2**: Se comprueba que los tres precios y los totales rechazan negativos, no numéricos y más de dos decimales; que un precio de $999,999.99 se acepta y de $1,000,000.00 se rechaza; y que un total de $99,999,999.99 se acepta y uno mayor se rechaza.
- **CA-3**: Se comprueba que con rol mecánico o recepción la API no devuelve el precio de compra (ni en pantalla ni en la respuesta), con una prueba automatizada por rol.
- **CA-4**: Se comprueba que con rol mecánico o recepción el intento de registrar o modificar categoría, marca o precio de compra se rechaza en el backend.
- **CA-5**: Se comprueba que los totales, saldos y pagos calculados coinciden con el cálculo en centavos enteros (diferencia $0 en las pruebas) y que se conservan con dos decimales.
- **CA-6**: Se comprueba que, al cambiar el total de una orden con un cobro de Mercado Pago pendiente, este pasa al estado `STALE`, que su confirmación con el importe anterior se rechaza, que no cuenta como pago vigente (el saldo pendiente no lo descuenta), que se permite generar un nuevo cobro con el importe vigente y que el importe original del cobro no cambia.
- **CA-7**: Se comprueba con una prueba que pagos y tickets emitidos antes del sprint se consultan y se muestran idénticos a como lo hacen hoy.
- **CA-8**: Se comprueba que los seeds 001 a 008 pueden correrse dos veces seguidas sin duplicar registros ni reiniciar datos de trabajo, incluida la corrección del seed 004 (H-14).
- **CA-9**: Se comprueba que los datos de ejemplo incluyen refacciones con categoría, marca, precio de compra y precio de venta.
- **CA-10**: Se comprueba que existen y pasan pruebas de límites, permisos por rol del precio de compra, centavos, cobro desfasado y compatibilidad, y que las suites previas siguen en verde.
- **CA-11**: Se comprueba que `docs/project-context.md`, `docs/design-system.md` y los comentarios obsoletos sobre "las refacciones no suman importe" quedan actualizados.

### Entidades clave

- **Refacción** (existente, se amplía): además de código, nombre, stock y precios de venta, incorpora categoría (lista fija), marca (texto libre opcional) y precio de compra (dato financiero reservado a administración). Relación: puede aparecer en muchas órdenes.
- **Pago** (existente, se amplía): conserva su importe original de forma inmutable y sus estados incluyen el nuevo `STALE` (desfasado): cuando su orden cambia de total con el cobro en estado pendiente (`PENDING`), el pago pasa a `STALE`, no puede confirmarse y no cuenta como pago vigente (ni para la regla de un solo pago vigente ni para el saldo pendiente), habilitando un nuevo cobro. Relación: siempre pertenece a una orden (RN-13).
- **Orden de servicio** (existente, solo cálculo): sus totales, saldos y pagos se calculan en centavos enteros; su cambio de total es lo que provoca el desfase de un cobro pendiente.
- **Servicios y mano de obra de ejemplo** (datos, se corrigen): filas de los datos de ejemplo que reciben un identificador fijo para que su carga sea repetible sin duplicarse (H-14).

## Criterios de éxito *(obligatorio)*

### Resultados mensurables

- **SC-001**: 100 % de las capturas de precio inválidas (negativas, no numéricas, con más de dos decimales o fuera de límite) son rechazadas con mensaje claro y sin guardar valores parciales, en los tres precios y en los totales.
- **SC-002**: 0 respuestas de la interfaz de servicio ante roles mecánico o recepción contienen el precio de compra; 0 escrituras de categoría, marca o precio de compra de esos roles son aceptadas por el backend.
- **SC-003**: 0 diferencias de redondeo entre el cálculo esperado en centavos enteros y los totales, saldos y pagos mostrados en las pruebas.
- **SC-004**: 100 % de los cobros de Mercado Pago `PENDING` afectados por un cambio de total pasan a `STALE`, 0 de ellos pueden confirmarse con el importe anterior, 0 cuentan como pago vigente en el saldo o en la regla de un solo pago vigente y 0 cobros ya generados tienen su importe modificado.
- **SC-005**: La carga de datos de ejemplo ejecutada dos veces seguidas produce 0 registros duplicados y no altera los datos de trabajo existentes.
- **SC-006**: 100 % de los pagos y tickets emitidos antes del sprint se consultan sin ningún cambio en su importe ni en su contenido.
- **SC-007**: Ninguna suite de pruebas previa queda en roto tras este sprint; las nuevas pruebas de límites, permisos, centavos, desfase y compatibilidad pasan todas.
- **SC-008**: `docs/project-context.md` y `docs/design-system.md` reflejan el sistema real al cerrar el sprint: 0 afirmaciones desactualizadas de que las refacciones no suman importe.

## Fuera de alcance

- Costeo, margen, utilidad y reportes financieros (Sprint 7).
- Impuestos, facturación, descuentos, reembolsos y catálogo de proveedores.
- Pagos parciales nuevos: ya existen desde el Sprint 4; no se rediseñan.
- Notificaciones, reportes, configuración del taller y WhatsApp.
- Cualquier cambio a lo marcado como cubierto en la tabla de "Alcance de esta especificación", salvo el cálculo en centavos enteros (FR-007).

## Supuestos

- Las propuestas acordadas de la sección 9 del insumo se aplican como decisiones firmes (ver sección "Decisiones ya acordadas" y la sección "Clarifications"); no quedan preguntas abiertas en esta especificación.
- El precio de compra no participa en el cobro: asignarlo o modificarlo no recalcula totales, saldos ni cobros existentes.
- Las refacciones existentes al aplicar este cambio quedan con precio de compra pendiente de captura por administración, sin bloquear su uso en órdenes.
- Los límites de precio (999,999.99) y de total (99,999,999.99) son los acordados en el insumo y aplican a capturas nuevas; los datos ya guardados dentro del rango no se alteran.
- Solo los cobros de Mercado Pago **pendientes** pueden quedar desfasados; los confirmados y los tickets ya emitidos no se modifican.
- La corrección del seed 004 (H-14) se hace con identificadores fijos en las filas de servicios, mano de obra y entradas de ejemplo (sin llaves únicas ni limpieza de duplicados previos), sin cambiar el resto del contenido de demostración.
- Las migraciones siguen siendo aditivas y numeradas (siguiente número disponible, `017_...`), sin modificar scripts ya aplicados.
- Las restricciones técnicas heredadas del insumo se mantienen: backend en ES Modules, permisos validados en backend, solo el backend accede a MySQL, pruebas de integración contra `motorix_test`, español en docs, comentarios y pruebas, e interfaces conforme a `docs/design-system.md`.
