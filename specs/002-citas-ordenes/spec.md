# Especificación de Funcionalidad: Citas y Órdenes de Servicio (Sprint 2)

**Rama de Funcionalidad**: `002-citas-ordenes`

**Creado**: 2026-10-11

**Estado**: Borrador

**Input**: Descripción de usuario: "Usa la descripción de docs/sprints/sprint-2-citas-ordenes.md (insumo de especificación del Sprint 2 del MVP de Motorix: citas y órdenes de servicio)."

## Clarificaciones

### Session 2026-10-11

- P: ¿Cuáles son exactamente las transiciones de estado permitidas entre los estados de una orden de servicio? → R: Avances estrictos en la secuencia RECIBIDO → DIAGNOSTICO → EN_REPARACION → TERMINADO → ENTREGADO; ESPERANDO_REFACCION accesible desde DIAGNOSTICO y EN_REPARACION con retorno al estado anterior; retrocesos permitidos solo: TERMINADO → EN_REPARACION y EN_REPARACION → DIAGNOSTICO; DIAGNOSTICO → RECIBIDO y cualquier salto de secuencia solo con rol administrador.
- P: ¿Quién debe poder marcar una orden como ENTREGADA? → R: Recepción y administrador; el mecánico no.
- P: ¿Qué debe hacer el sistema cuando se necesita cancelar una orden de servicio que todavía no ha sido entregada? → R: Recepción o administrador pueden cancelarla en cualquier estado previo a ENTREGADO; la orden se marca como CANCELADA, queda como historial de solo lectura y no aparece en los listados de trabajo activo.
- P: ¿Cómo debe asignarse el mecánico a una orden de servicio? → R: Asignación manual: recepción o administrador elige el mecánico activo al crear o editar la orden, y pueden reasignarla en cualquier momento.
- P: ¿El diagnóstico, las observaciones y las recomendaciones de una orden deben guardarse como un solo texto por orden o como una lista de entradas fechadas? → R: Listas de entradas fechadas y con autor por orden: el mecánico agrega diagnósticos, observaciones y recomendaciones y todas quedan en el historial de la orden.

## Escenarios de usuario y pruebas *(obligatorio)*

### US1 - Registro y consulta de citas (Prioridad: P2)

Como recepcionista, quiero registrar y consultar citas para organizar la llegada de los
vehículos al taller.

**Por qué esta prioridad**: las citas ordenan la operación diaria del taller y alimentan
el flujo de recepción, aunque el sistema sigue siendo útil sin ellas (las órdenes pueden
crearse directamente), por lo que va después de la creación de órdenes.

**Prueba independiente**: se puede probar registrando una cita con cliente, vehículo,
fecha, hora y motivo, consultándola en el listado del día y cancelándola; la cita aparece
o desaparece del listado según su estado sin tocar ningún otro módulo.

**Escenarios de aceptación**:

1. **Dado** un cliente con un vehículo registrados, **Cuando** el recepcionista crea una
   cita indicando fecha, hora, motivo y vehículo, **Entonces** el sistema la registra con
   estado programada y aparece en la consulta de citas.
2. **Dado** una cita programada, **Cuando** el recepcionista modifica su fecha, hora o
   motivo, **Entonces** el sistema guarda los cambios y la cita refleja la nueva
   información en la consulta.
3. **Dado** una cita programada, **Cuando** el recepcionista la cancela indicando un
   motivo, **Entonces** el sistema la marca como cancelada, la excluye de las citas
   pendientes del día y conserva su registro (no se borra).
4. **Dado** varias citas registradas, **Cuando** el recepcionista consulta las citas de un
   día o busca por nombre de cliente o placas, **Entonces** el sistema muestra solo las
   citas que coinciden con el criterio.
5. **Dado** una cita cuyo vehículo ya fue recibido o que está cancelada, **Cuando** el
   recepcionista intenta cambiar su estado a atendida desde una acción no permitida,
   **Entonces** el sistema rechaza la operación con un mensaje claro.
6. **Dado** un usuario sin sesión o con rol no autorizado, **Cuando** intenta registrar o
   modificar citas, **Entonces** el sistema deniega la operación en el servidor.

---

### US2 - Creación de órdenes de servicio (Prioridad: P1)

Como recepcionista, quiero crear órdenes de servicio para registrar el trabajo a realizar
sobre un vehículo, incluyendo el kilometraje de entrada.

**Por qué esta prioridad**: la orden de servicio es el corazón del sprint: sin ella, el
mecánico no tiene nada que trabajar ni es posible documentar el diagnóstico ni el estado
del vehículo.

**Prueba independiente**: se puede probar creando una orden para un cliente y vehículo
existentes con su kilometraje de entrada, verificando que queda visible con su estado
inicial y que se rechaza una orden hacia un vehículo inexistente o con un kilometraje
menor al previo.

**Escenarios de aceptación**:

1. **Dado** un cliente con un vehículo registrado, **Cuando** el recepcionista crea una
   orden indicando el vehículo, el kilometraje de entrada y un motivo de ingreso,
   **Entonces** el sistema registra la orden en estado recibido con esos datos.
2. **Dado** un vehículo sin órdenes previas, **Cuando** se crea la primera orden con un
   kilometraje de entrada, **Entonces** el sistema acepta el valor y lo guarda como
   referencia inicial.
3. **Dado** un vehículo con una orden previa con kilometraje registrado, **Cuando** se
   crea una nueva orden con un kilometraje menor al previo sin registrar una corrección
   explícita, **Entonces** el sistema rechaza la operación y explica el motivo (RN-4).
4. **Dado** una orden existente en un estado previo a entregado, **Cuando** recepción o
   administrador la cancelan, **Entonces** el sistema la marca como cancelada, sale de
   los listados de trabajo activo y queda como historial de solo lectura; un mecánico o
   un rol no autorizado no puede cancelarla.
5. **Dado** una orden existente, **Cuando** el recepcionista la modifica (motivo, notas o
   datos permitidos), **Entonces** el sistema guarda los cambios conservando su
   identificador e historial.
6. **Dado** un vehículo que no existe en el sistema, **Cuando** el recepcionista intenta
   crear una orden para él, **Entonces** el sistema rechaza la operación (RN-2).
7. **Dado** un usuario con rol no autorizado, **Cuando** intenta crear u modificar
   órdenes, **Entonces** el sistema deniega la operación en el servidor (RN-15).

---

### US3 - Vinculación de la orden con cliente y vehículo (Prioridad: P1)

Como recepcionista, quiero asociar una orden con un cliente y un vehículo para vincular
correctamente la información que se mostrará en la orden.

**Por qué esta prioridad**: sin el vínculo correcto la orden no tiene sentido operativo;
es indivisible del alta de orden y aporta la trazabilidad que exige el flujo demostrable.

**Prueba independiente**: al crear una orden seleccionando un vehículo, el sistema
muestra automáticamente al cliente propietario de ese vehículo; si se consulta la orden,
cliente y vehículo aparecen correctamente asociados.

**Escenarios de aceptación**:

1. **Dado** un vehículo cuyo propietario es un cliente registrado, **Cuando** el
   recepcionista crea una orden seleccionando ese vehículo, **Entonces** el sistema
   asocia la orden al vehículo y a su cliente propietario de forma automática.
2. **Dado** una orden creada, **Cuando** se consulta su detalle, **Entonces** se muestran
   el cliente, el vehículo, el kilometraje de entrada y el estado actual.
3. **Dado** un cliente con varias órdenes, **Cuando** se consulta el cliente, **Entonces**
   el sistema permite distinguir sus órdenes sin perder la asociación con sus vehículos
   del Sprint 1.
4. **Dado** un cliente o vehículo que fue desactivado, **Cuando** se intenta crear una
   orden con ese vehículo, **Entonces** el sistema rechaza la operación indicando que el
   registro no está disponible para operaciones nuevas.

---

### US4 - Consulta de órdenes asignadas por el mecánico (Prioridad: P1)

Como mecánico, quiero consultar las órdenes asignadas para saber qué trabajar.

**Por qué esta prioridad**: es la puerta de entrada del mecánico al sistema: sin ver sus
órdenes no puede ejecutar ninguna de las demás historias de su rol.

**Prueba independiente**: con dos mecánicos y órdenes repartidas entre ellos, cada
mecánico autenticado ve en su listado únicamente las órdenes que tiene asignadas y nunca
las del otro.

**Escenarios de aceptación**:

1. **Dado** un mecánico autenticado con órdenes asignadas, **Cuando** consulta su listado
   de órdenes, **Entonces** ve solo sus órdenes con vehículo, estado y fecha de ingreso.
2. **Dado** un mecánico sin órdenes asignadas, **Cuando** consulta su listado, **Entonces**
   ve un mensaje claro de que no tiene órdenes pendientes, sin errores.
3. **Dado** órdenes de otros mecánicos, **Cuando** un mecánico consulta su listado o
   intenta acceder directamente a una orden ajena, **Entonces** el sistema no le muestra
   ni le permite modificar esa orden (validado en el servidor, RN-15).
4. **Dado** un recepcionista o administrador, **Cuando** consulta las órdenes, **Entonces**
   ve todas las órdenes del taller, con el mecánico asignado, para poder administrarlas.

---

### US5 - Registro de diagnósticos y servicios realizados (Prioridad: P3)

Como mecánico, quiero registrar diagnósticos y servicios realizados para documentar el
trabajo.

**Por qué esta prioridad**: documenta el trabajo una vez que la orden ya existe y está
visible; añade valor sobre el flujo básico de órdenes.

**Prueba independiente**: sobre una orden asignada, el mecánico agrega un diagnóstico,
registra uno o más servicios realizados con su descripción y la información de mano de
obra, y al consultar la orden todo queda guardado.

**Escenarios de aceptación**:

1. **Dado** una orden asignada al mecánico, **Cuando** agrega una entrada de diagnóstico
   del vehículo, **Entonces** el sistema la guarda con fecha y autor en la orden y queda
   visible en su detalle junto con los diagnósticos anteriores, si los hay.
2. **Dado** una orden, **Cuando** el mecánico agrega uno o más servicios realizados con
   su descripción e importe, **Entonces** el sistema los registra en la orden y los
   muestra listados en su detalle.
3. **Dado** una orden con servicios registrados, **Cuando** se consulta la orden, **Entonces**
   se muestran los servicios y la mano de obra asociados sin perder la información
   previa.
4. **Dado** una orden en estado recibido, **Cuando** el mecánico intenta registrar
   servicios sin haber avanzado a diagnóstico según las reglas de estado, **Entonces** el
   sistema aplica la secuencia permitida y rechaza lo que no corresponda con un mensaje
   claro.
5. **Dado** una orden entregada, **Cuando** el mecánico intenta modificarla,
   **Entonces** el sistema conserva la orden como historial y no admite cambios
   ordinarios (RN-9).

---

### US6 - Cambio de estado de la orden (Prioridad: P3)

Como mecánico, quiero cambiar el estado de una orden para reflejar su avance.

**Por qué esta prioridad**: da visibilidad del progreso, pero depende de que existan
órdenes y de que el mecánico pueda consultarlas.

**Prueba independiente**: sobre una orden asignada, el mecánico la lleva por la secuencia
recibido → diagnóstico → en reparación → terminado → entregado y verifica que cada
transición inválida o retroceso sin autorización es rechazado.

**Escenarios de aceptación**:

1. **Dado** una orden en estado recibido, **Cuando** el mecánico la avanza a diagnóstico,
   **Entonces** el sistema permite la transición y el nuevo estado queda reflejado en
   todos los listados.
2. **Dado** una orden, **Cuando** el mecánico intenta una transición que no sigue la
   secuencia permitida (por ejemplo, de recibido directo a entregado), **Entonces** el
   sistema rechaza la transición y explica el estado válido al que puede avanzar.
3. **Dado** una orden cuyo vehículo espera una refacción, **Cuando** el mecánico la pone
   en espera de refacción, **Entonces** el sistema permite esa salida y su posterior
   retorno al flujo normal.
4. **Dado** una orden en estado terminado, **Cuando** el recepcionista la entrega al
   cliente, **Entonces** el sistema la marca como entregada y a partir de ese momento la
   orden queda como historial que no se elimina de manera ordinaria (RN-9).
5. **Dado** una orden que no está asignada al mecánico autenticado, **Cuando** intenta
   cambiar su estado, **Entonces** el sistema deniega la operación en el servidor
   (RN-15).

---

### US7 - Observaciones y recomendaciones del mecánico (Prioridad: P4)

Como mecánico, quiero agregar observaciones y recomendaciones para dejar constancia del
estado del vehículo.

**Por qué esta prioridad**: enriquece la información de la orden, pero el sprint ya
entrega valor con diagnóstico, servicios y estados; es el último incremento.

**Prueba independiente**: sobre una orden asignada, el mecánico agrega una recomendación
(algo que debería revisarse pronto) y una observación, y al consultar la orden ambas
aparecen con su fecha.

**Escenarios de aceptación**:

1. **Dado** una orden asignada, **Cuando** el mecánico agrega una recomendación,
   **Entonces** el sistema la guarda junto a la orden y queda visible en su detalle.
2. **Dado** una orden asignada, **Cuando** el mecánico agrega una observación,
   **Entonces** el sistema la guarda con su fecha y autor, y queda visible en la orden.
3. **Dado** una orden con observaciones y recomendaciones, **Cuando** el recepcionista o
   el administrador consultan la orden, **Entonces** también ven la información
   registrada por el mecánico.
4. **Dado** una orden entregada, **Cuando** el mecánico intenta agregar nuevas entradas,
   **Entonces** el sistema conserva lo ya registrado y no admite cambios ordinarios
   (RN-9).

---

### Casos límite

- ¿Qué sucede cuando se crea una orden para un vehículo que no existe o está inactivo? → Se rechaza con mensaje claro (RN-2).
- ¿Qué sucede cuando el kilometraje de entrada es menor al registrado previamente sin una corrección explícita? → Se rechaza la operación y se explica cómo corregir (RN-4).
- ¿Qué sucede cuando se intenta una transición de estado fuera de la secuencia permitida? → Se rechaza y se indica la transición válida; los únicos casos que el sistema acepta con el rol administrador son DIAGNOSTICO → RECIBIDO y los saltos de secuencia (ver FR-012).
- ¿Qué pasa con una orden cuando la cita relacionada se cancela? → La orden no se ve afectada: cancelar una cita no elimina órdenes existentes.
- ¿Qué pasa si una orden creada por error ya no debe continuar? → Recepción o administrador la cancelan en cualquier estado previo a ENTREGADO; queda como historial de solo lectura (ver FR-012).
- ¿Qué sucede si el mecánico asignado queda inactivo o no existe? → La orden no puede avanzar hasta que un usuario autorizado la reasigne a otro mecánico activo.
- ¿Qué pasa si una orden llegó a entregado y alguien intenta editarla o borrarla? → Se conserva como historial; no se admite modificación ni borrado ordinario (RN-9).
- ¿Qué ve el mecánico cuando no tiene órdenes asignadas? → Un estado vacío amigable, sin errores.
- ¿Qué sucede si dos usuarios intentan modificar la misma orden a la vez? → Gana la última operación confirmada; el estado mostrado siempre es el del servidor.
- ¿Qué sucede si una cita programada vence sin atención? → Queda en el histórico con su estado; el sistema no la borra automáticamente.

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001**: El sistema debe permitir a recepción (y administración) crear citas con cliente, vehículo, fecha, hora y motivo, y asignarles un estado inicial de programada.
- **FR-002**: El sistema debe permitir consultar las citas con filtros por fecha y por criterios de texto (nombre de cliente o placas), y mostrar su estado actual.
- **FR-003**: El sistema debe permitir modificar los datos de una cita programada y cancelarla con motivo, conservándola en el registro con estado cancelado (sin borrado físico).
- **FR-004**: El sistema debe permitir crear órdenes de servicio asociadas a un cliente y un vehículo existentes y activos, rechazando órdenes hacia vehículos inexistentes (RN-2).
- **FR-005**: Toda orden nueva debe registrar el kilometraje de entrada (RN-3).
- **FR-006**: El sistema debe rechazar un kilometraje menor al previamente registrado para el mismo vehículo cuando no se indique una corrección explícita, explicando el motivo (RN-4); el kilometraje previo es el de la última orden del vehículo.
- **FR-007**: Cuando no existe un kilometraje previo para el vehículo, el sistema debe aceptar el kilometraje de entrada informado como valor inicial.
- **FR-008**: El sistema debe permitir asignar manualmente una orden a un mecánico activo desde recepción o administración, y reasignarla si es necesario.
- **FR-009**: El sistema debe mostrar al mecánico autenticado únicamente las órdenes asignadas a él, y a recepción/administración todas las órdenes del taller.
- **FR-010**: El sistema debe validar en el servidor que solo los roles autorizados creen, modifiquen, asignen órdenes y gestionen citas (RN-5, RN-15), y que un mecánico solo pueda modificar sus propias órdenes.
- **FR-011**: El sistema debe permitir al mecánico registrar diagnósticos como entradas fechadas y con autor en una orden, y los servicios realizados (cada uno con descripción e importe) más su mano de obra asociada; los diagnósticos anteriores se conservan en el historial de la orden sin posibilidad de borrado.
- **FR-012**: El sistema debe gestionar los estados de orden RECIBIDO, DIAGNOSTICO, EN_REPARACION, TERMINADO, ENTREGADO y CANCELADA. Los avances son estrictos en la secuencia RECIBIDO → DIAGNOSTICO → EN_REPARACION → TERMINADO → ENTREGADO. ESPERANDO_REFACCION es accesible desde DIAGNOSTICO y EN_REPARACION y permite regresar al estado anterior desde el que se pausó. Solo se permiten los retrocesos TERMINADO → EN_REPARACION y EN_REPARACION → DIAGNOSTICO sin permiso especial; DIAGNOSTICO → RECIBIDO y cualquier salto de secuencia requieren el rol administrador. La transición TERMINADO → ENTREGADO solo la pueden realizar recepción y administrador; el mecánico no. Cualquier estado previo a ENTREGADO puede pasar a CANCELADA por decisión de recepción o administrador, y una orden CANCELADA queda como historial de solo lectura fuera de los listados de trabajo activo.
- **FR-013**: El sistema debe rechazar con un mensaje claro cualquier transición de estado fuera de las permitidas y toda edición de una orden en estado ENTREGADO o CANCELADA (RN-9), las cuales se conservan como historial sin eliminación ordinaria.
- **FR-014**: El sistema debe permitir al mecánico agregar observaciones y recomendaciones como entradas fechadas y con autor en sus órdenes, conservándolas todas en el historial de la orden (sin borrado) y haciéndolas visibles para recepción y administración.
- **FR-015**: El sistema debe mantener la trazabilidad de la orden: al crearla se vincula automáticamente al vehículo seleccionado y a su cliente propietario, y el detalle de la orden muestra ambos junto con kilometraje, estado y mecánico asignado.
- **FR-016**: El sistema debe ofrecer una pantalla de gestión de citas y una de gestión de órdenes (listado, detalle y acciones por rol) que sigan `docs/design-system.md`, con confirmación obligatoria para acciones sensibles (cancelar cita, entregar orden, reasignar).
- **FR-017**: Los seeds de este sprint deben incluir citas y órdenes de ejemplo (en distintos estados y con servicios) idempotentes, de modo que la aplicación muestre información al arrancar y la base nunca quede vacía.
- **FR-018**: La demostración al cierre del sprint debe poder recorrer el flujo completo: registrar cita → recibir vehículo → crear orden → asignar mecánico → registrar diagnóstico → registrar servicios → actualizar estado → terminar trabajo.

### Entidades clave

- **Cita (appointment)**: reserva de llegada de un vehículo; atributos: fecha, hora, motivo, estado (programada, completada, cancelada) y vínculos con cliente y vehículo.
- **Orden de servicio (service_order)**: registro del trabajo solicitado para un vehículo; atributos: motivo de ingreso, kilometraje de entrada, estado, mecánico asignado y sus entradas de diagnóstico, observaciones y recomendaciones; se vincula a un vehículo y, por él, a su cliente.
- **Entrada de orden (order_entry)**: anotación fechada y con autor agregada a una orden por el mecánico; tipo (diagnóstico, observación o recomendación) y texto; se conserva en el historial sin borrado.
- **Servicio de orden (order_service)**: partida de trabajo aplicada a una orden; descripción e importe.
- **Mano de obra de orden (order_labor)**: carga de mano de obra de una orden; descripción e importe.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Un recepcionista capacitado registra una cita completa en menos de 2 minutos y una orden de servicio completa en menos de 3 minutos.
- **SC-002**: El 100% de las órdenes creadas tienen cliente, vehículo y kilometraje de entrada registrados; ningún registro con kilometraje inválido o vehículo inexistente llega a guardarse.
- **SC-003**: El 100% de las transiciones de estado inválidas se rechazan con un mensaje comprensible, y las transiciones válidas quedan reflejadas de inmediato en el listado del usuario.
- **SC-004**: En pruebas, el mecánico ve 0 órdenes que no le estén asignadas, tanto en listado como al intentar acceder por detalle.
- **SC-005**: Un usuario capacitado completa el flujo demostrable completo (cita → entrega de la orden) en menos de 10 minutos sin ayuda.
- **SC-006**: Al arrancar la aplicación con los seeds instalados, el usuario ve citas y órdenes de ejemplo en pantalla (nunca una lista vacía en la instalación inicial).
- **SC-007**: El 100% de las órdenes en estado ENTREGADO siguen consultables después de 30 días (historial conservado, sin eliminación ordinaria).

## Supuestos

- **Estados de orden**: definidos en las Clarificaciones 1 a 3 de esta sesión (avances estrictos, pausa ESPERANDO_REFACCION con retorno, retrocesos limitados, saltos solo con administrador, entrega por recepción/administración y cancelación en cualquier estado previo a ENTREGADO).
- **Asignación de mecánico**: manual por recepción o administración, según la Clarificación 4 (sin reparto automático por disponibilidad); si el mecánico asignado queda inactivo, la orden espera reasignación.
- **Kilometraje**: el valor previo corresponde a la última orden registrada del vehículo; una "corrección explícita" se marca mediante un indicador que exige confirmación y deja constancia. La primera orden de un vehículo acepta cualquier kilometraje mayor o igual a cero.
- **Citas**: estados programada, completada (vehículo recibido) y cancelada; cancelar nunca borra el registro ni afecta órdenes ya creadas; una cita no es obligatoria para crear una orden.
- **Entrega**: marcar una orden como entregada lo hace recepción o administración (el mecánico la deja en TERMINADO); a partir de ENTREGADO la orden es historial de solo lectura.
- **Servicios y mano de obra**: se registran con descripción e importe para documentar el trabajo; los totales informativos se muestran, pero cobros, inventario y refacciones quedan fuera de este sprint.
- **Reutilización**: el sprint se apoya en usuarios, roles, clientes, vehículos, autenticación, cliente HTTP, tema de diseño y patrones de validación/errores ya construidos en el Sprint 1.
- **Alcance**: fuera de alcance (según el insumo) historial de mantenimiento por vehículo, próximo mantenimiento, inventario y refacciones, pagos, Mercado Pago, tickets y dashboard.
- **Semilla**: los seeds del sprint son idempotentes y dejan datos de ejemplo suficientes para recorrer la demo sin captura manual.
