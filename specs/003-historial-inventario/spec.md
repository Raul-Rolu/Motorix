# Especificación de la funcionalidad: Historial, mantenimiento e inventario

**Rama de la funcionalidad**: `003-historial-inventario`

**Creado**: 2026-10-11

**Estado**: Listo para planificación (aclaraciones resueltas 2026-10-11)

**Entrada**: Descripción del usuario: "Usa la descripcion de docs/sprints/sprint-3-historial-inventario.md"

## Aclaraciones

### Sesión 2026-10-11

- P: Cuando se entrega una orden de servicio de un vehículo, ¿debe marcarse automáticamente como cumplido el mantenimiento pendiente? → R: Solo manual: el mantenimiento queda pendiente hasta que el mecánico o recepción lo marque como cumplido.
- P: ¿Puede un vehículo tener varios mantenimientos pendientes al mismo tiempo? → R: Sí, varios pendientes por vehículo, cada uno con su motivo y sus umbrales (fecha y/o kilometraje).
- P: ¿Un AJUSTE de inventario también debe quedar bloqueado si dejaría el stock en negativo? → R: También se bloquea: ninguna operación (ni el ajuste) puede dejar el stock negativo; RN-8 se aplica uniformemente.
- P: ¿Quién puede cancelar (dar de baja) un mantenimiento pendiente que ya no aplica? → R: Solo administración, con motivo obligatorio; los mantenimientos cancelados dejan de aparecer como pendientes, vencidos o próximos.
- P: ¿Qué debe mostrar la lista de "mantenimientos próximos" que consulta recepción? → R: Sin ventana fija: vencidos primero, luego todos los pendientes ordenados por el umbral más cercano (fecha o kilometraje).

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Historial de servicios del vehículo (Prioridad: P1)

Como mecánico, quiero consultar el historial de servicios de un vehículo para conocer su estado y antecedentes.

**Por qué esta prioridad**: El historial es el corazón del Sprint 3: sin él no hay forma de saber qué se le hizo al vehículo, y toda la información proviene de las órdenes ya terminadas (RN-10). Es la historia mínima que aporta valor al taller.

**Prueba independiente**: Se puede probando completamente con órdenes ya terminadas en el sistema: al abrir el historial de un vehículo se listan sus servicios pasados en orden cronológico, sin registrar nada nuevo.

**Escenarios de aceptación**:

1. **Dado** un vehículo con órdenes terminadas, **Cuando** se consulta su historial, **Entonces** se muestran las órdenes terminadas en orden cronológico con su fecha, kilometraje y motivo (CA-1).
2. **Dado** un vehículo sin órdenes terminadas, **Cuando** se consulta su historial, **Entonces** se muestra un mensaje claro de que aún no hay servicios registrados.
3. **Dado** un vehículo con órdenes en curso y otras terminadas, **Cuando** se consulta su historial, **Entonces** solo aparecen las terminadas o entregadas; las en curso no se duplican en el historial (RN-10).
4. **Dado** un mecánico autenticado, **Cuando** solicita el historial de cualquier vehículo registrado, **Entonces** el sistema le muestra la información (el historial de consulta está habilitado para el personal del taller).

---

### Historia de usuario 2 - Kilometraje registrado en cada servicio (Prioridad: P2)

Como mecánico, quiero que cada servicio quede asociado a su kilometraje para mantener actualizado el historial.

**Por qué esta prioridad**: El kilometraje es la base para programar mantenimientos por kilometraje (RN-11); sin datos de kilometraje confiables, los próximos servicios no pueden calcularse.

**Prueba independiente**: Se probando que al cerrar una orden con kilometraje, ese kilometraje aparece reflejado en el historial del vehículo y en el detalle de la orden.

**Escenarios de aceptación**:

1. **Dado** una orden en curso con kilometraje de entrada registrado, **Cuando** se consulta el historial del vehículo, **Entonces** cada servicio muestra el kilometraje registrado en ese momento.
2. **Dado** un kilometraje de entrada menor al de la última orden del vehículo, **Cuando** se intenta registrar el servicio, **Entonces** el sistema lo rechaza salvo que se indique explícitamente una corrección.
3. **Dado** dos servicios del mismo vehículo, **Cuando** se comparan sus kilometrajes, **Entonces** el historial permite ver el kilometraje de cada uno en orden cronológico.

---

### Historia de usuario 3 - Programación del próximo mantenimiento (Prioridad: P2)

Como mecánico, quiero establecer el próximo mantenimiento para programar el siguiente servicio.

**Por qué esta prioridad**: Convierte el historial en seguimiento activo: el taller sabe cuándo debe volver el vehículo y el cliente recibe avisos oportunos.

**Prueba independiente**: Se probando registrando un mantenimiento para un vehículo y verificando que aparece en las consultas de próximos servicios.

**Escenarios de aceptación**:

1. **Dado** un vehículo atendido, **Cuando** se registra el próximo mantenimiento con fecha y/o kilometraje objetivo, **Entonces** el sistema guarda el compromiso con sus umbrales (CA-2).
2. **Dado** un mantenimiento registrado solo con fecha, **Cuando** llega esa fecha, **Entonces** el sistema lo marca como vencido.
3. **Dado** un mantenimiento registrado solo con kilometraje, **Cuando** se registra un servicio que alcanza ese kilometraje, **Entonces** el sistema lo marca como vencido.
4. **Dado** un mantenimiento con fecha y kilometraje, **Cuando** se cumple cualquiera de los dos umbrales primero, **Entonces** el sistema lo marca como vencido (rige el primero de los dos que se cumpla).
5. **Dado** un mantenimiento ya cumplido, **Cuando** se consulta, **Entonces** se puede marcar como completado y deja de aparecer como pendiente.

---

### Historia de usuario 4 - Mantenimientos próximos para aviso al cliente (Prioridad: P3)

Como recepcionista, quiero consultar los mantenimientos próximos para avisar al cliente.

**Por qué esta prioridad**: Añade valor comercial (retención de clientes), pero depende de que existan mantenimientos registrados (US3).

**Prueba independiente**: Se probando con al menos un mantenimiento programado y uno vencido, consultando la lista filtrada.

**Escenarios de aceptación**:

1. **Dado** mantenimientos programados, **Cuando** la recepción consulta los mantenimientos, **Entonces** ve primero los vencidos y después los pendientes ordenados por el umbral más cercano (fecha o kilometraje), con los datos del cliente y del vehículo, sin recorte por ventana de tiempo.
2. **Dado** mantenimientos vencidos, **Cuando** se consulta la lista, **Entonces** aparecen diferenciados claramente de los que aún están próximos (color de advertencia para próximo, rojo para vencido).
3. **Dado** un usuario sin los permisos adecuados, **Cuando** intenta consultar los mantenimientos, **Entonces** el sistema rechaza la operación validada en el servidor.

---

### Historia de usuario 5 - Registro y consulta de refacciones (Prioridad: P2)

Como administrador, quiero registrar y consultar refacciones para controlar el inventario.

**Por qué esta prioridad**: Es la base del módulo de inventario: sin refacciones registradas no hay stock que controlar.

**Prueba independiente**: Se probando registrando una refacción y verificando que aparece en la consulta con sus datos y stock inicial.

**Escenarios de aceptación**:

1. **Dado** el rol administrador, **Cuando** registra una refacción con nombre, código, cantidad inicial y stock mínimo, **Entonces** el sistema la guarda y la muestra en el listado (CA-4).
2. **Dado** una refacción con un código ya registrado, **Cuando** se intenta registrar otra igual, **Entonces** el sistema rechaza la operación indicando que el código está en uso.
3. **Dado** una refacción existente, **Cuando** el administrador edita sus datos o su stock mínimo, **Entonces** los cambios quedan registrados.
4. **Dado** un usuario que no es administrador, **Cuando** intenta registrar o editar refacciones, **Entonces** el sistema rechaza la operación validada en el servidor.

---

### Historia de usuario 6 - Consulta de stock disponible (Prioridad: P3)

Como administrador, quiero consultar el stock disponible para saber qué hay en existencia.

**Por qué esta prioridad**: Valor inmediato pero sencillo; depende de que existan refacciones (US5).

**Prueba independiente**: Se probando abriendo el listado de inventario con refacciones registradas y verificando las cantidades mostradas.

**Escenarios de aceptación**:

1. **Dado** refacciones registradas, **Cuando** se consulta el inventario, **Entonces** se muestran nombre, código, stock disponible y stock mínimo de cada una.
2. **Dado** una búsqueda por nombre o código, **Cuando** se filtra, **Entonces** se devuelven solo las coincidencias.
3. **Dado** una refacción con movimientos registrados, **Cuando** se consulta, **Entonces** su stock coincide con el resultado de sus entradas y salidas acumuladas.

---

### Historia de usuario 7 - Refacciones utilizadas en una orden (Prioridad: P2)

Como mecánico, quiero agregar las refacciones utilizadas a una orden para reflejar su uso y descontar el inventario.

**Por qué esta prioridad**: Es el corazón del flujo demostrable del sprint (uso de refacción → salida de inventario) y garantiza la consistencia del stock (RN-6, RN-7, RN-8).

**Prueba independiente**: Se probando agregando una refacción a una orden en curso y verificando que el stock baja y queda registrado el movimiento de salida.

**Escenarios de aceptación**:

1. **Dado** una orden en curso asignada al mecánico, **Cuando** agrega una refacción con su cantidad, **Entonces** el sistema registra el uso en la orden, descuenta el stock y genera la salida de inventario correspondiente (CA-5).
2. **Dado** una refacción con stock insuficiente para la cantidad solicitada, **Cuando** se intenta agregarla a la orden, **Entonces** el sistema lo rechaza con un mensaje claro y el stock no cambia (CA-6, RN-8).
3. **Dado** una orden ya entregada o cancelada, **Cuando** se intenta agregar una refacción, **Entonces** el sistema rechaza la operación (la orden está cerrada).
4. **Dado** una refacción agregada por error a una orden aún abierta, **Cuando** se retira de la orden, **Entonces** el sistema registra la devolución al inventario y el stock vuelve a su nivel anterior.
5. **Dado** un mecánico con una orden que no le pertenece, **Cuando** intenta agregar refacciones, **Entonces** el sistema rechaza la operación validada en el servidor.

---

### Historia de usuario 8 - Alertas de stock bajo (Prioridad: P3)

Como administrador, quiero ver las alertas de stock bajo para reabastecer a tiempo.

**Por qué esta prioridad**: Es el cierre del flujo de inventario; depende de que existan refacciones y movimientos (US5 y US7).

**Prueba independiente**: Se probando llevando una refacción por debajo de su stock mínimo y verificando que aparece destacada en la interfaz.

**Escenarios de aceptación**:

1. **Dado** una refacción cuya cantidad disponible es menor o igual a su stock mínimo, **Cuando** el administrador abre el inventario, **Entonces** la refacción aparece destacada como stock bajo (CA-7).
2. **Dado** un movimiento de salida que reduce el stock por debajo del mínimo, **Cuando** se aplica, **Entonces** la alerta se muestra en la siguiente consulta sin recargar nada a mano.
3. **Dado** todas las refacciones por encima del mínimo, **Cuando** se consulta el inventario, **Entonces** no hay alertas visibles.

---

### Casos límite

- ¿Qué sucede cuando el historial se consulta de un vehículo recién registrado sin órdenes? (Debe mostrarse vacío con mensaje claro, sin error.)
- ¿Qué sucede cuando un mantenimiento tiene solo fecha o solo kilometraje? (Debe ser válido: el umbral no indicado simplemente no se evalúa.)
- ¿Qué pasa cuando dos acciones descuentan el mismo stock casi simultáneamente? (El descuento debe ser atómico: nunca puede dejar el stock por debajo de cero.)
- ¿Qué pasa cuando se agrega una refacción a una orden que está en pausa por refacción? (Debe estar permitido: es un estado de trabajo.)
- ¿Qué pasa cuando se intenta eliminar una refacción que ya tiene movimientos de inventario? (No debe eliminarse en el sentido tradicional; debe conservarse su historial de movimientos.)
- ¿Qué pasa cuando el kilometraje reportado en un servicio es menor al anterior? (Solo se acepta con corrección explícita y queda registrado.)
- ¿Qué pasa cuando el stock disponible es exactamente igual a la cantidad solicitada? (Debe permitirse: el stock resultante sería cero, no negativo.)
- ¿Qué pasa cuando un ajuste de inventario dejaría el stock en negativo? (Se rechaza como cualquier otra operación; primero debe registrarse la salida justificada y después ajustarse, FR-012.)
- ¿Qué pasa cuando un mantenimiento tiene fecha y kilometraje y se cumple solo uno de los dos? (Se considera vencido: rige el primero de los dos umbrales que se cumpla, FR-006.)

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001**: El sistema DEBE permitir consultar el historial de servicios de un vehículo, mostrando las órdenes terminadas y entregadas en orden cronológico con fecha, kilometraje, motivo y resumen del trabajo.
- **FR-002**: El historial DEBE derivarse de las órdenes ya registradas, sin duplicar la información de los servicios (RN-10); las órdenes entregadas se conservan y no se eliminan de forma ordinaria.
- **FR-003**: Cada servicio del historial DEBE mostrar el kilometraje asociado registrado en su momento; un kilometraje menor al previo solo se acepta con corrección explícita.
- **FR-004**: El sistema DEBE permitir registrar el próximo mantenimiento de un vehículo con motivo (qué servicio se debe realizar), fecha objetivo, kilometraje objetivo o ambos (RN-11), y los intervalos DEBEN ser configurables por el taller, sin asumir valores universales (RN-12). Un vehículo DEBE poder tener varios mantenimientos pendientes al mismo tiempo, cada uno con su motivo y umbrales.
- **FR-005**: Los mantenimientos DEBEN tener estados que distingan al menos entre pendiente, cumplido y cancelado, y su consulta DEBE permitir filtrar por vencidos y próximos (los cancelados NO DEBEN aparecer en esos filtros). El cumplimiento DEBE registrarse de forma manual por el mecánico o recepción: la entrega de una orden del vehículo NO completa automáticamente los mantenimientos pendientes. La cancelación DEBE estar reservada a administración, con motivo obligatorio.
- **FR-006**: Un mantenimiento DEBE considerarse vencido cuando se cumpla el primero de sus umbrales (fecha o kilometraje), conforme a RN-11; si solo tiene un umbral, se evalúa únicamente ese.
- **FR-007**: El sistema DEBE permitir a recepción y administración consultar los mantenimientos vencidos primero y después los pendientes ordenados por el umbral más cercano (fecha o kilometraje), sin ventana de tiempo fija, con los datos del cliente y del vehículo para avisar al cliente.
- **FR-008**: El sistema DEBE permitir al administrador registrar y editar refacciones con nombre, código único, cantidad inicial y stock mínimo, y consultarlas.
- **FR-009**: El sistema DEBE permitir consultar el stock disponible de cada refacción y buscar por nombre o código; el stock DEBE coincidir con el acumulado de sus movimientos.
- **FR-010**: Una refacción que ya tiene movimientos de inventario NO DEBE poder eliminarse de forma que se pierda su historial; la gestión debe conservar la trazabilidad de los movimientos.
- **FR-011**: El sistema DEBE permitir al mecánico agregar refacciones utilizadas a una orden en curso que le pertenezca, descontando el stock y registrando la salida de inventario correspondiente (RN-6, RN-7).
- **FR-012**: El sistema NO DEBE permitir que ninguna operación de inventario deje el stock negativo, incluidas las salidas y los ajustes: si la cantidad supera el disponible, la operación se rechaza con un mensaje claro y el stock no cambia (RN-8, CA-6).
- **FR-013**: El sistema DEBE permitir al administrador registrar entradas de stock (reposiciones) con la cantidad y el motivo, generando el movimiento de entrada correspondiente.
- **FR-014**: El sistema DEBE manejar tres tipos de movimiento de inventario: ENTRADA (registrada por administración con motivo, p. ej. reposición), SALIDA (generada por el uso de refacciones en una orden) y AJUSTE (exclusivo de administración, con motivo obligatorio, para corregir discrepancias de conteo); cada movimiento DEBE registrar su fecha, cantidad, refacción y motivo o referencia a la orden.
- **FR-015**: El sistema DEBE mostrar alertas de stock bajo (cantidad disponible menor o igual al stock mínimo) destacadas en la interfaz de inventario para el administrador (CA-7).
- **FR-016**: Las operaciones de inventario y mantenimiento DEBEN validar el rol en el servidor: registro/edición de refacciones y entradas de stock solo de administración; consulta de historial para el personal del taller; mantenimientos próximos para recepción y administración; uso de refacciones en órdenes para el mecánico dueño de la orden.
- **FR-017**: Los datos iniciales del sprint DEBEN incluir refacciones, movimientos, mantenimientos y órdenes de ejemplo suficientes para que el historial, el inventario y las alertas se vean poblados al instalar, sin duplicarse al re-ejecutarlos.
- **FR-018**: Los descuentos y movimientos de inventario DEBEN aplicarse de forma atómica: dos operaciones simultáneas jamás pueden dejar el stock por debajo de cero.
- **FR-019**: Toda lógica de negocio de este sprint (vencimiento de mantenimientos, cálculo y control de stock, generación de movimientos, permisos) DEBE tener pruebas automatizadas que pasen (CA-8).

### Entidades clave *(incluye si la funcionalidad maneja datos)*

- **Mantenimiento**: Compromiso de próximo servicio de un vehículo; motivo del servicio, fecha objetivo y/o kilometraje objetivo, estado pendiente/cumplido/cancelado (cancelación solo de administración, con motivo) y referencia al vehículo; un vehículo puede tener varios pendientes simultáneamente.
- **Refacción**: Pieza del inventario; nombre, código único, cantidad disponible y stock mínimo que dispara la alerta de stock bajo.
- **Movimiento de inventario**: Registro de cada cambio de cantidad de una refacción (entrada o salida), con fecha, cantidad, motivo y, cuando corresponde, referencia a la orden que lo originó.
- **Refacción usada en orden**: Vínculo entre una orden de servicio y las refacciones aplicadas con su cantidad, origen de las salidas de inventario (RN-6/RN-7).
- **Servicio del vehículo (derivado)**: No es un registro nuevo: el historial se construye a partir de las órdenes terminadas existentes, con su fecha, kilometraje y resumen (RN-10).

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Un mecánico puede encontrar el historial completo de un vehículo y su kilometraje más reciente en menos de 30 segundos desde que selecciona el vehículo.
- **SC-002**: El 100% de las órdenes terminadas aparecen en el historial de su vehículo sin intervención manual, sin duplicados y sin información contradicha.
- **SC-003**: Al final del día, la persona de recepción puede identificar en menos de 1 minuto qué vehículos tienen mantenimiento vencido o por vencer.
- **SC-004**: El stock mostrado en la interfaz coincide en el 100% de los casos con el acumulado de movimientos registrados; ningún caso de prueba produce stock negativo.
- **SC-005**: Cuando una refacción llega a su stock mínimo, el administrador la ve destacada como stock bajo en la primera consulta posterior al movimiento, sin cálculos manuales.
- **SC-006**: El 100% de las operaciones de inventario y mantenimiento validadas por pruebas pasan antes de dar por terminada la funcionalidad.

## Supuestos

- El historial no requiere una copia propia de los datos: se consulta a partir de las órdenes ya registradas (RN-10); si el equipo decide materializarlo después, es una decisión de implementación para la fase de planificación.
- La política de stock negativo es la que fija la constitución (RN-8): prohibido; una operación que lo provocaría se rechaza completa.
- La regla de vencimiento de los mantenimientos es el primero de sus umbrales (fecha o kilometraje) que se cumpla; si solo tiene un umbral, se evalúa únicamente ese (RN-11).
- El próximo mantenimiento se registra de forma manual por el taller al atender el vehículo; no se genera automáticamente, y su cumplimiento también es manual (la entrega de una orden no lo completa por sí sola).
- Los intervalos de mantenimiento (días y/o kilómetros) los define el taller por cada registro; no se asumen valores de fábrica (RN-12).
- Los tipos de movimiento de inventario son ENTRADA (administración, reposiciones con motivo), SALIDA (uso de refacciones en una orden) y AJUSTE (solo administración, correcciones de conteo con motivo obligatorio).
- La eliminación de refacciones es una baja lógica: la refacción deja de estar disponible para nuevas órdenes pero su historial de movimientos se conserva.
- Los permisos heredados de los sprints anteriores se mantienen: validación de rol en el servidor para toda operación, y el mecánico solo opera órdenes que le pertenecen.
- Los datos de ejemplo del sprint se apoyan en las órdenes y vehículos ya existentes de los seeds de los sprints 1 y 2.
- Fuera de alcance del sprint: pagos, Mercado Pago, tickets, dashboard y notificaciones externas (correo o WhatsApp).
