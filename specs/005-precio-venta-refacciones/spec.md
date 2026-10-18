# Especificación de la feature: Precio de venta de refacciones y total de la orden

**Rama de la feature**: `005-precio-venta-refacciones`

**Creada**: 2026-10-18

**Estado**: Borrador

**Input**: Descripción del usuario: "Cerrar la brecha de precios en refacciones: cada refacción debe tener precio de venta, el total de la orden debe sumar las refacciones usadas por su cantidad, y el cobro y el ticket deben reflejar ese total. Alcance mínimo: solo precio de venta (sin precio de compra ni reportes de utilidad). Requisitos en formato EARS, con criterios de aceptación comprobables y casos límite; sin mencionar tecnología."

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Precio de venta en la ficha de la refacción (Prioridad: P1)

Como administrador, quiero registrar el precio de venta de cada refacción para que el sistema pueda calcular cuánto cuesta cuando se usa en una orden.

**Por qué esta prioridad**: Es la base de todo lo demás: sin precio de venta no hay importe que sumar al total, por lo que ninguna otra historia de esta feature puede funcionar hasta que exista el dato.

**Independiente**: Se puede probar por completo registrando el precio de venta en una refacción, verificando que se guarda, que se consulta junto con el resto de su ficha y que no se admiten importes inválidos, sin tocar órdenes, cobros ni tickets.

**Escenarios de aceptación**:

1. **Dado** la ficha de una refacción sin precio de venta, **Cuando** la administración registra un precio de venta válido, **Entonces** el precio queda guardado y se muestra junto con los demás datos de la refacción.
2. **Dado** una refacción con precio de venta registrado, **Cuando** la administración modifica el precio, **Entonces** el nuevo precio queda guardado y se usa en las operaciones siguientes.
3. **Dado** un precio de venta negativo o no numérico, **Cuando** se intenta guardarlo, **Entonces** el sistema rechaza el valor con un mensaje claro y el precio no cambia.
4. **Dado** un usuario con rol mecánico o recepción, **Cuando** intenta registrar o modificar el precio de venta de una refacción, **Entonces** el sistema deniega la operación sin importar lo que muestre la interfaz.

---

### Historia de usuario 2 - Total de la orden con refacciones (Prioridad: P2)

Como recepcionista, quiero que el total de una orden incluya las refacciones usadas por su cantidad para cobrar el importe completo del servicio.

**Por qué esta prioridad**: Corrige el cálculo que hoy suma solo servicios y mano de obra (brecha frente al alcance original y al FR-003 del spec 004); mientras el total esté mal, cualquier cobro es incorrecto.

**Independiente**: Se puede probar agregando refacciones con precio a una orden en curso y verificando que el total de la orden refleja la suma de servicios, mano de obra y refacciones (precio × cantidad), sin registrar ningún pago.

**Escenarios de aceptación**:

1. **Dado** una orden con servicios por $1,000 y mano de obra por $500, **Cuando** el mecánico agrega 2 refacciones con precio de venta de $150 cada una, **Entonces** el total de la orden pasa a $1,800.
2. **Dado** una orden con una refacción de precio registrado, **Cuando** cambia el precio de venta de esa refacción en el inventario, **Entonces** el total de la orden no cambia porque conserva el precio vigente al momento de agregarla.
3. **Dado** una orden con una refacción agregada por error, **Cuando** se retira de la orden, **Entonces** el total de la orden se reduce por el importe de esa refacción y su cantidad.
4. **Dado** una orden con una refacción de precio cero (obsequio o promoción), **Cuando** se calcula el total, **Entonces** el total suma $0 por esa refacción sin alterar los demás importes.
5. **Dado** una orden sin servicios, mano de obra ni refacciones, **Cuando** se consulta, **Entonces** su total es $0, como hasta ahora.

---

### Historia de usuario 3 - Cobro y ticket con el total completo (Prioridad: P3)

Como recepcionista, quiero que el cobro y el ticket de la orden reflejen el total con las refacciones incluidas para entregar al cliente un importe correcto y desglosado.

**Por qué esta prioridad**: Es la visible para el cliente; depende del total correcto (US2), pero puede probarse de forma independiente sobre una orden ya calculada.

**Independiente**: Se puede probar registrando un pago y generando el ticket de una orden con refacciones, verificando que ambos muestran el total completo y su desglose, sin importar el método de cobro usado.

**Escenarios de aceptación**:

1. **Dado** una orden con total de $1,800 que incluye refacciones, **Cuando** la recepción registra un pago por $1,800, **Entonces** la orden queda liquidada y el saldo pendiente es $0.
2. **Dado** una orden con total de $1,800 y un pago de $1,000, **Cuando** se consulta, **Entonces** el saldo pendiente es $800.
3. **Dado** una orden con servicios, mano de obra y refacciones, **Cuando** la recepción genera el ticket, **Entonces** el ticket muestra el total con las refacciones incluidas y detalla cada refacción con su cantidad, precio de venta e importe.
4. **Dado** una orden cuyo total está incompleto por falta de precio en una refacción usada, **Cuando** la recepción intenta registrar un cobro o generar el ticket, **Entonces** el sistema lo impide e indica cuál refacción falta por precios.
5. **Dado** una orden con refacciones usadas antes de que existiera el precio de venta, **Cuando** la administración asigna el precio, **Entonces** el total de esa orden abierta se recalcula con el precio asignado.

---

### Casos límite

- ¿Qué ocurre con refacciones ya usadas en órdenes existentes antes de este cambio? (en órdenes abiertas, al asignar el precio de venta se adopta en esos usos y el total se recalcula; en órdenes ya pagadas se conserva el total que se cobró, sin reabrir importes ni tocar los pagos)
- ¿Qué ocurre con una refacción sin precio de venta? (no se permite agregarla a una orden: se rechaza con un mensaje claro y la orden y el inventario no cambian; además se puede detectar en el inventario cuáles carecen de precio)
- ¿Qué ocurre si el precio de venta cambia después de usar la refacción en una orden? (los usos ya registrados conservan el precio vigente al momento de agregarlos: el total de esa orden no cambia; el nuevo precio aplica solo a usos futuros)
- ¿Qué ocurre si una orden abierta tiene usos sin precio registrado y se intenta cobrar o imprimir su ticket? (el total se marca como incompleto y el sistema impide el cobro y el ticket hasta que se asigne el precio)
- ¿Qué ocurre si se agrega una refacción a una orden que ya está pagada pero no entregada? (se permite mientras la orden siga abierta; el total aumenta y la orden vuelve a mostrar saldo pendiente por la diferencia)
- ¿Qué ocurre si se intenta agregar una refacción a una orden entregada o cancelada? (se rechaza: la orden cerrada no cambia, como ya rige desde el sprint de inventario)
- ¿Qué ocurre con un precio de venta igual a $0? (se permite: un obsequio o promoción es un importe válido y suma $0 al total; lo que no se admite es el precio vacío ni el negativo)
- ¿Qué ocurre con el retiro de una refacción de la orden? (se descuenta su importe del total y se devuelve el stock, según el comportamiento ya existente)

## Requisitos *(obligatorio)*

### Requisitos funcionales (formato EARS)

- **FR-001** (Ubicuo): El sistema deberá registrar y consultar el precio de venta de cada refacción como dato de su ficha, con un importe en moneda no negativo. (CA-1, CA-2)
- **FR-002** (Evento): Cuando una refacción se agrega a una orden, el sistema deberá registrar en ese uso la cantidad y el precio de venta vigente de la refacción. (CA-3)
- **FR-003** (Evento): Cuando cambia el precio de venta de una refacción, el sistema deberá conservar en los usos ya registrados el precio vigente al momento de agregarlos. (CA-4, CA-5)
- **FR-004** (Evento): Cuando cambia el contenido de una orden (servicios, mano de obra o refacciones), el sistema deberá recalcular su total como la suma de servicios, mano de obra y el importe de cada refacción usada (precio registrado × cantidad). (CA-6, CA-7)
- **FR-005** (No deseado): Si se intenta agregar a una orden una refacción sin precio de venta, entonces el sistema deberá rechazar la operación con un mensaje claro, sin modificar la orden ni el inventario. (CA-8)
- **FR-006** (No deseado): Si una orden abierta contiene refacciones usadas sin precio registrado, entonces el sistema deberá marcar su total como incompleto e impedir registrar el cobro y generar el ticket de esa orden. (CA-9, CA-10)
- **FR-007** (Evento): Cuando se asigna precio de venta a una refacción ya usada en órdenes abiertas, el sistema deberá adoptarlo en esos usos y recalcular sus totales. (CA-11)
- **FR-008** (Evento): Cuando la recepción registra un pago sobre una orden, el sistema deberá calcular su saldo pendiente a partir del total que incluye las refacciones usadas. (CA-12)
- **FR-009** (Evento): Cuando la recepción genera el ticket de una orden, el sistema deberá mostrar el total con las refacciones incluidas, desglosando cada refacción con su cantidad, precio de venta e importe. (CA-13, CA-14)
- **FR-010** (Evento): Cuando se retira una refacción de una orden abierta, el sistema deberá descontar su importe del total de la orden. (CA-15)
- **FR-011** (Ubicuo): El sistema deberá limitar el registro y la modificación del precio de venta al rol de administración, con la validación aplicada también fuera de la interfaz. (CA-16)

### Criterios de aceptación

- **CA-1**: Se comprueba que una refacción con precio registrado muestra ese precio al consultarse, y que una refacción nueva puede guardarse con precio desde su registro.
- **CA-2**: Se comprueba que guardar un precio negativo o no numérico devuelve un error visible, no cambia el precio previo y no deja importes parciales.
- **CA-3**: Se comprueba que al agregar 2 unidades de una refacción con precio de $150, el uso queda registrado con cantidad 2 y precio $150, y el stock baja en 2.
- **CA-4**: Se comprueba que, tras cambiar el precio de una refacción de $150 a $200, el total de una orden que ya la usó con 2 unidades sigue sumando $300 (2 × $150).
- **CA-5**: Se comprueba que el mismo cambio de precio sí eleva el importe al agregar esa refacción a una orden nueva (2 × $200 = $400).
- **CA-6**: Se comprueba que una orden con servicios $1,000, mano de obra $500 y 2 refacciones de $150 muestra total $1,800, y que al agregar una tercera refacción de $100 pasa a $1,900.
- **CA-7**: Se comprueba que una orden sin servicios ni refacciones conserva total $0 y que el total nunca queda por debajo de la suma de sus partes.
- **CA-8**: Se comprueba que agregar una refacción sin precio a una orden en curso muestra un mensaje claro, el total no cambia y el stock no se descuenta.
- **CA-9**: Se comprueba que una orden abierta con un uso sin precio muestra su total como incompleto con la refacción señalada.
- **CA-10**: Se comprueba que sobre esa orden se rechazan tanto el registro de un pago como la generación del ticket, y que ambos vuelven a funcionar tras asignar el precio.
- **CA-11**: Se comprueba que, al asignar precio a una refacción usada en dos órdenes abiertas, ambos totales se recalculan con ese precio, y que una orden ya pagada con ese uso conserva su total original.
- **CA-12**: Se comprueba que con total $1,800 y pagos de $1,000 el saldo pendiente es $800, y que al pagar los $800 restantes la orden queda liquidada.
- **CA-13**: Se comprueba que el ticket de la orden del CA-6 muestra total $1,800 y lista cada refacción con su cantidad, precio e importe que suman ese total.
- **CA-14**: Se comprueba que el total del ticket es idéntico al total mostrado en la orden y al monto con que se liquida el cobro (diferencia $0).
- **CA-15**: Se comprueba que al retirar una refacción de $150 de una orden con total $1,800 el total pasa a $1,650 y el stock se repone.
- **CA-16**: Se comprueba que con rol mecánico o recepción el intento de registrar un precio de venta es denegado por el sistema, no solo oculto en la interfaz.

### Entidades clave

- **Refacción** (existente, se amplía): además de código, nombre, categoría, marca, stock actual y stock mínimo, lleva precio de venta, dato obligatorio para poder usarse en una orden. Relación: puede aparecer en muchas órdenes.
- **Refacción usada en orden** (existente, se amplía): vínculo entre una orden y una refacción con su cantidad; conserva el precio de venta vigente al momento de agregarse, de modo que el importe histórico no cambia si el precio se modifica después. Relación: origina la salida de inventario y aporta su importe al total de la orden.
- **Orden de servicio** (existente, se recalcula): su total pasa a derivarse de servicios + mano de obra + importes de las refacciones usadas; puede quedar marcado como incompleto mientras falte algún precio. Relación: alimenta al pago y al ticket.
- **Pago** (existente, solo consulta): se calcula contra el total con refacciones incluidas; su saldo pendiente es total menos pagos acumulados.
- **Ticket** (existente, solo consulta): refleja el total con refacciones y detalla cantidad, precio e importe de cada una.

## Criterios de éxito *(obligatorio)*

### Resultados mensurables

- **SC-001**: El total mostrado en cada orden coincide en el 100 % de los casos con la suma de servicios + mano de obra + (precio registrado × cantidad de cada refacción usada), verificado en órdenes con 0, 1 y varias refacciones.
- **SC-002**: El total del ticket y el total contra el que se registra el cobro son idénticos al total de la orden en el 100 % de los casos de prueba (diferencia $0).
- **SC-003**: Cero órdenes cobradas con total incompleto: ningún pago se registra ni ningún ticket se genera mientras exista una refacción usada sin precio.
- **SC-004**: Cero órdenes cuyo total histórico cambie por un cambio de precio posterior: modificar el precio de una refacción no altera ningún total ya calculado ni ningún importe pagado.
- **SC-005**: Las órdenes abiertas que ya usaban refacciones quedan con total correcto tras asignar precios: 100 % de ellas recalculadas sin intervención manual caso por caso.
- **SC-006**: El recepcionista ve el total actualizado al agregar o retirar una refacción, sin recargar nada a mano ni esperar más de unos segundos.
- **SC-007**: Ningún flujo de los sprints anteriores (inventario, órdenes, pagos, tickets) queda roto: todas las pruebas existentes siguen pasando y el alcance de los specs previos no se modifica.

## Fuera de alcance

- Precio de compra de las refacciones y su captura o modificación.
- Reportes de utilidad, margen, costo o rentabilidad por refacción u orden.
- Recalcular retroactivamente órdenes ya pagadas ni corregir importes ya cobrados.
- Modificar los specs de los sprints anteriores (1 a 4).

## Supuestos

- Cada uso de refacción en una orden conserva el precio de venta vigente al momento de agregarse (práctica estándar de punto de venta); los cambios posteriores de precio solo afectan usos futuros.
- Las órdenes ya pagadas conservan el total con el que se cobraron; la asignación posterior de precios no las modifica ni altera sus pagos.
- Las órdenes abiertas con usos antiguos sin precio sí adoptan el precio cuando se asigna, para poder completar su total y cobrarlas.
- Registrar o modificar el precio de venta corresponde al rol de administración, en continuidad con la edición de refacciones del sprint de inventario.
- El precio de venta puede ser $0 (obsequio o promoción); lo obligatorio es que exista un valor no negativo antes de usar la refacción en una orden.
- Se trabaja con una única moneda con dos decimales, como el resto de importes del sistema.
- El bloqueo de cobro y ticket por total incompleto aplica a órdenes abiertas; las órdenes entregadas o canceladas no se reabren ni se recalculan.
- Los requisitos de esta feature complementan sin contradecir el FR-003 del spec 004 (el total incluye refacciones); los specs anteriores se conservan intactos.
