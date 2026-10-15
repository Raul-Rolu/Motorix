# Especificación de la feature: Pagos, Tickets y Dashboard

**Rama de la feature**: `004-pagos-tickets-dashboard`

**Creada**: 2026-10-11

**Estado**: Borrador

**Input**: Descripción del usuario: "Usa la descripción de `docs/sprints/sprint-4-pagos-tickets-dashboard.md`"

## Clarifications

### Session 2026-10-11

- Q: ¿Cómo debe enterarse la aplicación de que un cobro con Mercado Pago fue confirmado por el cliente? → A: La aplicación consulta el estado al proveedor bajo demanda (al ver la orden y mediante una acción explícita de "verificar pago"); no se reciben notificaciones automáticas del proveedor.
- Q: ¿Qué debe ocurrir con un cobro de Mercado Pago que el cliente nunca confirma? → A: Caduca automáticamente tras un plazo razonable (por ejemplo, 24 horas) y pasa a estado "expirado"; ya no cuenta ni se verifica, y el cobro manual posterior sigue disponible.
- Q: ¿Cómo deben probarse automáticamente los cobros con Mercado Pago? → A: Con un simulador interno del proveedor en las pruebas automatizadas (sin red ni credenciales); el sandbox real se usa solo en la demostración manual del sprint.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Registro del cobro de una orden (Prioridad: P1)

Como recepcionista, quiero registrar el pago de una orden terminada indicando cómo se cobró (efectivo, tarjeta, transferencia o Mercado Pago), para cerrar el ciclo del servicio y dejar constancia del cobro.

**Por qué esta prioridad**: Es el corazón del cierre del MVP: sin registrar el cobro, el taller no puede cerrar económicamente ninguna orden ni entregar comprobante. Todas las demás historias del sprint se apoyan en el dato de pago (ticket y dashboard).

**Independiente**: Se puede probar por completo registrando un pago sobre una orden ya existente con total calculado, verificando que persiste, que queda asociado a esa orden y que el estado de la orden refleja el cobro, sin necesidad de Mercado Pago, tickets ni dashboard.

**Escenarios de aceptación**:

1. **Dado** una orden terminada con total calculado (servicios, mano de obra y refacciones), **Cuando** la recepción registra un pago con método "efectivo" por el monto total, **Entonces** el pago queda guardado, asociado a la orden y la orden aparece como pagada.
2. **Dado** una orden con total de $1,500, **Cuando** la recepción registra un pago de $800 en "transferencia", **Entonces** el pago queda registrado como parcial y la orden muestra un saldo pendiente de $700; **y Dado** que se registra un segundo pago de $700, **Cuando** se confirma, **Entonces** la orden queda completamente liquidada.
3. **Dado** una orden cancelada, **Cuando** la recepción intenta registrar un pago sobre ella, **Entonces** el sistema rechaza la operación con un mensaje claro y no crea ningún pago.
4. **Dado** un usuario con rol mecánico autenticado, **Cuando** intenta registrar un pago, **Entonces** el sistema deniega la operación desde el servidor, independientemente de lo que muestre la interfaz.
5. **Dado** una orden ya pagada, **Cuando** la recepción registra un pago adicional por el mismo concepto, **Entonces** el sistema advierte que la orden ya está liquidada antes de confirmar.
6. **Dado** un pago registrado, **Cuando** se consulta el detalle de la orden, **Entonces** se muestran el método, el monto, la fecha y quién lo registró; los pagos no se eliminan ni se editan.

---

### Historia de usuario 2 - Pagos con Mercado Pago (Prioridad: P2)

Como recepcionista, quiero ofrecer el pago mediante Mercado Pago en modo de pruebas (sandbox) para dar una opción de pago digital al cliente, sin que la aplicación maneje datos de tarjeta.

**Por qué esta prioridad**: Es un canal adicional sobre el mismo registro de pagos de la US1; el taller puede operar completamente con cobros manuales, por lo que no bloquea el cierre del MVP, pero completa la experiencia de cobro ofrecida al cliente.

**Independiente**: Se puede probar generando un cobro digital de prueba para una orden, confirmando su resultado y verificando que el pago queda registrado con método "Mercado Pago" y el estado que corresponda.

**Escenarios de aceptación**:

1. **Dado** una orden con total calculado, **Cuando** la recepción solicita un cobro por Mercado Pago, **Entonces** el sistema genera un cobro de prueba y ofrece al cliente el medio para pagar (por ejemplo, un enlace).
2. **Dado** un cobro por Mercado Pago en curso, **Cuando** la recepción verifica el cobro (acción "verificar pago" o al reabrir la orden) y el proveedor lo reporta confirmado, **Entonces** el pago pasa a estado "completado", queda asociado a la orden y esta se marca como pagada.
3. **Dado** un cobro por Mercado Pago que nunca se confirma, **Cuando** se consulta la orden, **Entonces** el pago aparece primero como "pendiente" y, tras el plazo de caducidad, como "expirado"; en ningún caso afecta el saldo liquidado de la orden.
4. **Dado** el proceso de pago, **Cuando** se inspecciona la información almacenada por la aplicación, **Entonces** no existe ningún dato de tarjeta ni credencial del proveedor de pago (se usan únicamente credenciales del proveedor mediante configuración secreta del entorno).
5. **Dado** un fallo de comunicación con el proveedor de pago, **Cuando** la recepción intenta iniciar el cobro, **Entonces** el sistema informa del problema sin registrar pagos incompletos.

---

### Historia de usuario 3 - Ticket de servicio (Prioridad: P2)

Como recepcionista, quiero generar un ticket de la orden para entregar un comprobante impreso o visible al cliente con el detalle del servicio y del cobro.

**Por qué esta prioridad**: Es el comprobante que el cliente exige al retirar el vehículo; depende del contenido de la orden y del estado de pago (US1/US2), pero es independiente del dashboard.

**Independiente**: Se puede probar generando el ticket de una orden concreta y verificando que contiene todos los datos requeridos y que puede visualizarse e imprimirse.

**Escenarios de aceptación**:

1. **Dado** una orden terminada con servicios, refacciones y mano de obra registrados, **Cuando** la recepción genera el ticket, **Entonces** este contiene: folio único, datos del taller, cliente, vehículo, placas, kilometraje, servicios, refacciones, mano de obra, subtotal, total, método de pago, estado del pago y fecha.
2. **Dado** una orden con pagos parciales, **Cuando** se genera el ticket, **Entonces** muestra el total, lo pagado hasta la fecha y el saldo pendiente.
3. **Dado** una orden sin ningún pago, **Cuando** se genera el ticket, **Entonces** se indica de forma explícita que la orden no está pagada.
4. **Dado** un ticket generado, **Cuando** se vuelve a solicitar para la misma orden, **Entonces** conserva el mismo folio (sin duplicar comprobantes) y refleja el estado de pago más reciente.
5. **Dado** un ticket en pantalla, **Cuando** la recepción usa la acción de imprimir, **Entonces** el comprobante se muestra en un formato legible listo para entregar al cliente.
6. **Dado** un usuario mecánico, **Cuando** intenta generar o imprimir un ticket, **Entonces** el servidor deniega la operación (solo recepción y administración).

---

### Historia de usuario 4 - Panel de control del taller (Prioridad: P3)

Como administrador, quiero consultar un panel de control con la información general del taller (órdenes, citas, mantenimientos y alertas de inventario) para supervisar la operación de un vistazo.

**Por qué esta prioridad**: Es una vista de supervisión que se alimenta de datos ya existentes; aporta visibilidad pero no bloquea el cobro ni la entrega de comprobantes.

**Independiente**: Se puede probar abriendo el panel con datos sembrados en el sistema y verificando que los indicadores coinciden con los datos reales de cada módulo.

**Escenarios de aceptación**:

1. **Dado** el taller con órdenes, citas, mantenimientos e inventario con datos de ejemplo, **Cuando** el administrador abre el panel, **Entonces** ve: órdenes por estado, citas del día y próximas, mantenimientos vencidos y próximos, alertas de stock bajo y el dinero cobrado.
2. **Dado** un indicador del panel (por ejemplo, órdenes en reparación), **Cuando** se compara con el listado de órdenes, **Entonces** los números coinciden (el panel no duplica ni duplica información propia).
3. **Dado** un usuario con rol recepción o mecánico, **Cuando** intenta abrir el panel, **Entonces** el servidor deniega el acceso (solo administración).
4. **Dado** el panel abierto, **Cuando** se registra un pago nuevo, **Entonces** el indicador de dinero cobrado se actualiza al refrescar la vista.
5. **Dado** el panel, **Cuando** hay stock bajo, mantenimientos vencidos u órdenes detenidas, **Entonces** las alertas correspondientes se destacan con la convención de color del sistema de diseño (rojo para crítico/vencido, ámbar para próximo).

---

### Casos límite

- ¿Qué ocurre cuando se registra un pago con un monto igual a cero o negativo? (debe rechazarse)
- ¿Qué ocurre cuando dos personas registran un pago sobre la misma orden al mismo tiempo? (no debe duplicarse el cobro)
- ¿Qué ocurre con una orden que no tiene servicios ni refacciones (total $0)? (debe poder marcarse como cobrada sin importes absurdos)
- ¿Qué ocurre si el cobro digital de Mercado Pago nunca se confirma? (caduca automáticamente y no debe bloquear el cobro manual posterior de la misma orden)
- ¿Qué ocurre si se intenta generar un ticket de una orden cancelada? (debe rechazarse o señalarse como no válido)
- ¿Qué ocurre si un pago digital se confirma dos veces por reintentos del proveedor? (no debe duplicarse el importe cobrado)
- ¿Qué ocurre si el panel se consulta sin conexión al proveedor de pagos? (debe mostrar los datos propios del sistema; los indicadores no dependen del proveedor externo)
- ¿Qué ocurre al imprimir un ticket varias veces? (el folio se mantiene estable; el comprobante no se duplica)

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001**: El sistema DEBE permitir registrar uno o más pagos sobre una orden, cada uno con monto, método (efectivo, tarjeta, transferencia o Mercado Pago), fecha y usuario que lo registró.
- **FR-002**: Todo pago DEBE estar relacionado con una orden existente; nunca se permiten pagos huérfanos (RN-13).
- **FR-003**: El total de la orden DEBE derivarse de sus servicios, mano de obra y refacciones, sin duplicar importes; el saldo pendiente DEBE calcularse como total menos pagos acumulados.
- **FR-004**: Una orden DEBE considerarse liquidada cuando sus pagos acumulados alcanzan o superan su total; antes de ello se muestra como parcialmente pagada.
- **FR-005**: Solo los roles de recepción y administración DEBEN poder registrar y consultar pagos; la restricción DEBE aplicarse también en el servidor (RN-15).
- **FR-006**: Los pagos DEBEN conservarse como historial: no se eliminan ni se editan; una corrección se hace registrando un nuevo movimiento relacionado.
- **FR-007**: El sistema NO DEBE almacenar datos de tarjetas ni credenciales del proveedor de pago en la aplicación ni en la base de datos (RN-14); las credenciales del proveedor se manejan mediante configuración secreta del entorno.
- **FR-008**: El sistema DEBE ofrecer el pago mediante Mercado Pago en modo de pruebas (sandbox), registrando el resultado confirmado como un pago con método "Mercado Pago" y estado "pendiente" mientras no haya confirmación; el estado del cobro DEBE verificarse con el proveedor bajo demanda (al consultar la orden y mediante una acción explícita de "verificar pago"), sin notificaciones automáticas entrantes.
- **FR-009**: Un pago digital no confirmado NO DEBE contar para liquidar la orden ni para el dinero cobrado, pero SÍ DEBE ser visible para recepción; los cobros no confirmados DEBEN pasar a estado "expirado" automáticamente tras un plazo razonable (por ejemplo, 24 horas), tras lo cual dejan de verificarse y solo quedan como histórico.
- **FR-010**: Los pagos digitales confirmados repetidamente por el proveedor NO DEBEN duplicar el importe.
- **FR-011**: El sistema DEBE generar un ticket por orden con folio único que incluya: folio, datos del taller, cliente, vehículo, placas, kilometraje, servicios, refacciones, mano de obra, subtotal, total, método de pago, estado del pago y fecha (CA-4).
- **FR-012**: El ticket DEBE reflejar el estado de pago más reciente (incluidos pagos parciales y saldo pendiente) y DEBE poder visualizarse e imprimirse desde la aplicación (CA-5).
- **FR-013**: Solo recepción y administración DEBEN poder generar o imprimir tickets, con la restricción aplicada también en el servidor.
- **FR-014**: El panel de control DEBE mostrar estos indicadores reales y actuales: órdenes por estado, citas de hoy y próximas, mantenimientos vencidos y próximos, alertas de stock bajo y dinero cobrado (del día y acumulado). Se actualiza al abrir o al refrescar la vista; no se requiere actualización en tiempo real por segundos.
- **FR-015**: Los indicadores del panel DEBEN derivarse de la información ya registrada (órdenes, citas, mantenimientos, inventario y pagos), sin duplicar ni persistir copias (CA-6).
- **FR-016**: Solo el rol de administración DEBE acceder al panel de control, con la restricción aplicada también en el servidor.
- **FR-017**: El cobro digital con Mercado Pago se implementará como enlace de pago (preferencia de pago) compartible: la aplicación genera el cobro de prueba en modo sandbox, ofrece el enlace al cliente y refleja la confirmación del proveedor en el pago correspondiente.
- **FR-018**: El ticket DEBE entregarse como vista imprimible dentro de la aplicación, en formato de hoja estándar, con acción de imprimir; no se generan archivos descargables ni se envía por servicios externos (CA-5).
- **FR-019**: El sistema NO DEBE gestionar reembolsos ni devoluciones de dinero en el MVP: un pago confirmado es definitivo y su corrección (si ocurriera) queda fuera del alcance de esta feature.
- **FR-020**: El sistema DEBE rechazar el registro de pagos sobre órdenes canceladas, y el cobro manual DEBE seguir disponible aunque un cobro digital quede pendiente.
- **FR-021**: El sistema DEBE entregar datos de ejemplo (órdenes cobradas, un cobro digital de prueba, tickets y cifras de panel) mediante la instalación inicial, de modo que el panel nunca aparezca vacío tras instalar.

### Entidades clave

- **Pago**: comprobante de cobro de una orden; conoce su orden, monto, método, estado (pendiente, completado o expirado), fecha de registro y quién lo registró. Relación: N pagos por orden; los pagos no se eliminan.
- **Ticket**: comprobante imprimible derivado del contenido de una orden (servicios, refacciones, mano de obra, cliente, vehículo) y de su situación de pago; conoce un folio único y la fecha de generación. Relación: se genera desde una orden; no duplica los importes, solo los refleja.
- **Orden de servicio** (existente, solo consulta): aporta el total, el kilometraje, el estado y el historial de pagos; su estado de pago (sin pagar / parcial / liquidada) se deriva de sus pagos.
- **Indicadores del taller** (vista derivada): agregados de órdenes, citas, mantenimientos, inventario y pagos; se calculan al consultar y no almacenan información propia.

## Criterios de éxito *(obligatorio)*

### Resultados mensurables

- **SC-001**: La recepción puede registrar un cobro completo en menos de 2 minutos desde que abre la orden, sin salir de la aplicación.
- **SC-002**: El 100 % de los pagos registrados quedan asociados a una orden válida (cero pagos huérfanos).
- **SC-003**: El flujo completo terminada → cobro → ticket → consulta del panel se completa en menos de 5 minutos por un usuario del taller entrenado.
- **SC-004**: El ticket generado contiene el 100 % de los campos requeridos (los 17 listados en FR-011) en todas las órdenes con y sin pagos, y se genera en menos de 5 segundos.
- **SC-005**: El panel muestra los mismos números que los listados de detalle de cada módulo (diferencia 0 por efecto de duplicación) y se actualiza al refrescar sin necesidad de reinstalar nada.
- **SC-006**: Cero datos de tarjeta o credenciales de pago presentes en la información almacenada por la aplicación, verificado antes del cierre del sprint.
- **SC-007**: Los pagos digitales no confirmados jamás cuentan como cobro: 0 órdenes aparecen liquidadas solo por cobros pendientes.
- **SC-008**: Las pruebas automatizadas de la lógica de pagos y de generación de tickets pasan íntegramente —incluido el flujo digital con simulación interna del proveedor, sin requerir conexión ni credenciales externas—, y ningún flujo de los sprints anteriores queda roto.
- **SC-009**: La instalación inicial termina con datos de ejemplo visibles: al menos un cobro registrado, un ticket generado y un panel con cifras reales.

## Supuestos

- El total de la orden ya existe derivado de servicios, mano de obra y refacciones (Sprint 2); este sprint solo lo consulta y lo cobra.
- Se admiten pagos parciales con distintos métodos; la orden se liquida al alcanzar su total (comportamiento estándar de punto de venta para talleres).
- Un pago confirmado es definitivo: no hay reembolsos ni devoluciones en el MVP (FR-019); cualquier corrección se documentaría como ajuste manual fuera del sistema.
- El modo de pruebas (sandbox) de Mercado Pago es suficiente para la demostración del MVP; no se manejan credenciales de producción. El cobro se ofrece mediante enlace de pago compartible con el cliente (decisión Q1). Las pruebas automatizadas del flujo digital usan un simulador interno del proveedor; el sandbox real se usa únicamente en la demostración manual del sprint (decisión Q3).
- Los tickets se muestran dentro de la misma aplicación del taller, con formato listo para imprimir en hoja estándar; no se envían por correo ni mensaje (fuera de alcance).
- Los indicadores del panel son agregados simples de datos existentes, con actualización al abrir o refrescar la vista; no se requiere tiempo real por segundos.
- El taller tiene los datos de contacto fijos para el ticket (nombre, dirección y teléfono) registrados como parte de la configuración inicial.
- La autenticación y los roles existentes (administración, recepción, mecánico) se reutilizan tal cual.
- El sistema de diseño definido para el proyecto se aplica al panel, al formulario de cobro y a la vista del ticket.
