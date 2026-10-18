# Especificación de la feature: Precio de venta de refacciones y total de la orden

**Rama de la feature**: `005-precio-venta-refacciones`

**Creada**: 2026-10-18

**Estado**: Borrador

**Input**: Descripción del usuario: "Cerrar la brecha de precios en refacciones: cada refacción debe tener precio de venta, el total de la orden debe sumar las refacciones usadas por su cantidad, y el cobro y el ticket deben reflejar ese total. Alcance mínimo: solo precio de venta (sin precio de compra ni reportes de utilidad). Requisitos en formato EARS, con criterios de aceptación comprobables y casos límite; sin mencionar tecnología."

## Clarifications

### Session 2026-10-18

- Q: ¿Con qué precio de venta arrancan las refacciones que ya existen en el inventario (incluidas las de los datos de ejemplo), y qué pasa con las pruebas actuales que las usan sin precio? → A: Las existentes quedan pendientes de precio y no pueden usarse en una orden hasta que la administración asigne uno; los datos de ejemplo de la instalación inicial traen precios de venta ya definidos; las pruebas existentes que agregan refacciones registran un precio en su preparación, sin cambiar sus aserciones ni los specs anteriores.
- Q: ¿Qué significa exactamente "orden abierta" frente a "orden pagada" cuando una orden ya está liquidada económicamente pero aún no se entrega? → A: Son dos dimensiones independientes: "abierta" significa no entregada y no cancelada (sigue aceptando trabajo); "pagada" (o "liquidada") significa que sus pagos alcanzan su total; una orden puede ser ambas cosas a la vez.
- Q: ¿Debe ser un requisito que el inventario permita detectar qué refacciones no tienen precio de venta asignado? → A: Sí: el inventario debe mostrar o filtrar las refacciones sin precio para que la administración identifique y asigne los pendientes.
- Directiva del usuario: separar los requisitos que hacían varias cosas a la vez en requisitos EARS de una sola respuesta, usando el patrón "Mientras" donde corresponda. → A: Se dividen los antiguos FR-006 (total incompleto + bloqueo de cobro + bloqueo de ticket) y FR-009 (mostrar total + desglose) en requisitos independientes, y el recálculo del total pasa a patrón "Mientras una orden esté abierta".
- Q: Cuando una orden está abierta con pagos parciales y tiene usos antiguos de refacciones sin precio, ¿debe adoptar el precio que la administración asigne para poder completarse? → A: Sí: toda orden abierta no liquidada (incluida la parcialmente pagada) adopta el precio en sus usos antiguos; los pagos ya registrados se conservan y el saldo pendiente se ajusta al nuevo total.
- Q: ¿Los usos de refacciones en las órdenes de ejemplo que ya vienen con la instalación inicial deben quedar con precio definido para que ninguna orden de ejemplo aparezca con total incompleto? → A: Sí: todos los usos de refacciones en las órdenes de ejemplo traen precio registrado, de modo que ninguna orden de ejemplo aparece con total incompleto.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Precio de venta en la ficha de la refacción (Prioridad: P1)

Como administrador, quiero registrar el precio de venta de cada refacción para que el sistema pueda calcular cuánto cuesta cuando se usa en una orden.

**Por qué esta prioridad**: Es la base de todo lo demás: sin precio de venta no hay importe que sumar al total, por lo que ninguna otra historia de esta feature puede funcionar hasta que exista el dato.

**Independiente**: Se puede probar por completo registrando el precio de venta en una refacción, verificando que se guarda, que se consulta junto con el resto de su ficha y que no se admiten importes inválidos, sin tocar órdenes, cobros ni tickets.

**Escenarios de aceptación**:

1. **Dado** la ficha de una refacción sin precio de venta, **Cuando** la administración registra un precio de venta válido, **Entonces** el precio queda guardado y se muestra junto con los demás datos de la refacción.
2. **Dado** una refacción con precio de venta registrado, **Cuando** la administración modifica el precio, **Entonces** el nuevo precio queda guardado y se usa en las operaciones siguientes.
3. **Dado** un precio de venta negativo o no numérico, **Cuando** se intenta guardarlo, **Entonces** el sistema rechaza el valor con un mensaje claro y el precio no cambia.
4. **Dado** un inventario con varias refacciones sin precio de venta (existentes de antes del cambio), **Cuando** la administración consulta los pendientes de precio, **Entonces** el sistema lista o permite filtrar esas refacciones y la lista queda vacía cuando todas tienen precio.
5. **Dado** un usuario con rol mecánico o recepción, **Cuando** intenta registrar o modificar el precio de venta de una refacción, **Entonces** el sistema deniega la operación sin importar lo que muestre la interfaz.

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
5. **Dado** una orden abierta no liquidada con refacciones usadas antes de que existiera el precio de venta, **Cuando** la administración asigna el precio, **Entonces** el total de esa orden se recalcula con el precio asignado.

---

### Casos límite

- ¿Qué ocurre con refacciones ya usadas en órdenes existentes antes de este cambio? (en órdenes abiertas no liquidadas —incluidas las parcialmente pagadas—, al asignar el precio de venta se adopta en esos usos y el total se recalcula conservando los pagos registrados; en órdenes pagadas se conserva el total que se cobró, sin reabrir importes ni tocar los pagos)
- ¿Qué ocurre con una orden abierta con pagos parciales y usos antiguos sin precio? (adopta el precio al asignarse, mantiene sus pagos registrados, su saldo pendiente se ajusta al nuevo total y puede continuar su cobro hasta liquidarse)
- ¿Qué ocurre con una refacción sin precio de venta? (no se permite agregarla a una orden: se rechaza con un mensaje claro y la orden y el inventario no cambian; además se puede detectar en el inventario cuáles carecen de precio)
- ¿Qué ocurre si el precio de venta cambia después de usar la refacción en una orden? (los usos ya registrados conservan el precio vigente al momento de agregarlos: el total de esa orden no cambia; el nuevo precio aplica solo a usos futuros)
- ¿Qué ocurre si una orden abierta tiene usos sin precio registrado y se intenta cobrar o imprimir su ticket? (el total se marca como incompleto y el sistema impide el cobro y el ticket hasta que se asigne el precio)
- ¿Qué ocurre si se agrega una refacción a una orden que ya está pagada pero no entregada? (se permite mientras la orden siga abierta; el total aumenta y la orden vuelve a mostrar saldo pendiente por la diferencia)
- ¿Qué ocurre si se intenta agregar una refacción a una orden entregada o cancelada? (se rechaza: la orden cerrada no cambia, como ya rige desde el sprint de inventario)
- ¿Qué ocurre con un precio de venta igual a $0? (se permite: un obsequio o promoción es un importe válido y suma $0 al total; lo que no se admite es el precio vacío ni el negativo)
- ¿Qué ocurre con el retiro de una refacción de la orden? (se descuenta su importe del total y se devuelve el stock, según el comportamiento ya existente)

## Requisitos *(obligatorio)*

### Requisitos funcionales (formato EARS)

- **FR-001** (Ubicuo): El sistema deberá registrar el precio de venta de cada refacción como dato de su ficha, con un importe en moneda no negativo. (CA-1, CA-2)
- **FR-002** (Ubicuo): El sistema deberá limitar el registro y la modificación del precio de venta al rol de administración. (CA-16)
- **FR-003** (Mientras): Mientras existan en el inventario refacciones sin precio de venta, el sistema deberá permitir a la administración identificarlas (lista o filtro de pendientes de precio). (CA-17)
- **FR-004** (Evento): Cuando una refacción se agrega a una orden, el sistema deberá registrar en ese uso la cantidad y el precio de venta vigente de la refacción. (CA-3)
- **FR-005** (No deseado): Si se intenta agregar a una orden una refacción sin precio de venta, entonces el sistema deberá rechazar la operación con un mensaje claro, sin modificar la orden ni el inventario. (CA-8)
- **FR-006** (Evento): Cuando cambia el precio de venta de una refacción, el sistema deberá conservar en los usos ya registrados el precio vigente al momento de agregarlos. (CA-4, CA-5)
- **FR-007** (Mientras): Mientras una orden esté abierta, el sistema deberá mantener su total al día como la suma de servicios, mano de obra y el importe de cada refacción usada (precio registrado × cantidad). (CA-6, CA-7, CA-15)
- **FR-008** (Mientras): Mientras una orden abierta tenga refacciones usadas sin precio registrado, el sistema deberá marcar su total como incompleto. (CA-9)
- **FR-009** (No deseado): Si se intenta registrar un pago sobre una orden cuyo total está incompleto, entonces el sistema deberá rechazar el cobro. (CA-10)
- **FR-010** (No deseado): Si se intenta generar el ticket de una orden cuyo total está incompleto, entonces el sistema deberá rechazar la generación del ticket. (CA-10)
- **FR-011** (Evento): Cuando se asigna precio de venta a una refacción usada en órdenes abiertas no liquidadas (incluidas las parcialmente pagadas), el sistema deberá registrar ese precio en los usos correspondientes. (CA-11, CA-19)
- **FR-012** (Evento): Cuando la recepción registra un pago sobre una orden, el sistema deberá calcular su saldo pendiente a partir del total que incluye las refacciones usadas. (CA-12)
- **FR-013** (Evento): Cuando la recepción genera el ticket de una orden, el sistema deberá mostrar su total con las refacciones usadas incluidas. (CA-14)
- **FR-014** (Ubicuo): El ticket de una orden deberá detallar cada refacción usada con su cantidad, precio de venta e importe. (CA-13)
- **FR-015** (Evento): Cuando se instala o se cargan los datos de ejemplo, el sistema deberá entregar todas las refacciones de ejemplo y sus usos en las órdenes de ejemplo con precio de venta ya definido. (CA-18, CA-20)

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
- **CA-11**: Se comprueba que, al asignar precio a una refacción usada en dos órdenes abiertas no liquidadas, ambos totales se recalculan con ese precio, y que una orden ya pagada con ese uso conserva su total original.
- **CA-12**: Se comprueba que con total $1,800 y pagos de $1,000 el saldo pendiente es $800, y que al pagar los $800 restantes la orden queda liquidada.
- **CA-13**: Se comprueba que el ticket de la orden del CA-6 muestra total $1,800 y lista cada refacción con su cantidad, precio e importe que suman ese total.
- **CA-14**: Se comprueba que el total del ticket es idéntico al total mostrado en la orden y al monto con que se liquida el cobro (diferencia $0).
- **CA-15**: Se comprueba que al retirar una refacción de $150 de una orden con total $1,800 el total pasa a $1,650 y el stock se repone.
- **CA-16**: Se comprueba que con rol mecánico o recepción el intento de registrar un precio de venta es denegado por el sistema, no solo oculto en la interfaz.
- **CA-17**: Se comprueba que el inventario lista o permite filtrar las refacciones sin precio de venta asignado, que una refacción sin precio aparece en esa consulta y que la lista queda vacía cuando todas tienen precio.
- **CA-18**: Se comprueba que tras la instalación inicial todas las refacciones de los datos de ejemplo muestran precio de venta, y que una refacción existente sin precio queda como pendiente hasta que la administración le asigna uno.
- **CA-19**: Se comprueba que una orden abierta con un pago parcial y un uso sin precio, tras asignarse el precio, recalcula su total, conserva el pago registrado y muestra como saldo pendiente la diferencia con el nuevo total.
- **CA-20**: Se comprueba que ninguna orden de los datos de ejemplo aparece con total incompleto: todos sus usos de refacciones tienen precio registrado y sus totales son cobrables desde el primer arranque.

### Entidades clave

- **Refacción** (existente, se amplía): además de código, nombre, categoría, marca, stock actual y stock mínimo, lleva precio de venta, dato obligatorio para poder usarse en una orden; mientras carezca de él, queda señalada como pendiente de precio para la administración (FR-003). Relación: puede aparecer en muchas órdenes.
- **Refacción usada en orden** (existente, se amplía): vínculo entre una orden y una refacción con su cantidad; conserva el precio de venta vigente al momento de agregarse, de modo que el importe histórico no cambia si el precio se modifica después. Relación: origina la salida de inventario y aporta su importe al total de la orden.
- **Orden de servicio** (existente, se recalcula): su total pasa a derivarse de servicios + mano de obra + importes de las refacciones usadas; puede quedar marcado como incompleto mientras falte algún precio. Dimensión de trabajo: es **abierta** mientras no se entregue ni se cancele. Dimensión de pago: es **pagada** (o **liquidada**) cuando sus pagos alcanzan su total; ambas dimensiones son independientes y una orden puede estar abierta y pagada a la vez. Relación: alimenta al pago y al ticket.
- **Pago** (existente, solo consulta): se calcula contra el total con refacciones incluidas; su saldo pendiente es total menos pagos acumulados.
- **Ticket** (existente, solo consulta): refleja el total con refacciones y detalla cantidad, precio e importe de cada una.

## Criterios de éxito *(obligatorio)*

### Resultados mensurables

- **SC-001**: El total mostrado en cada orden coincide en el 100 % de los casos con la suma de servicios + mano de obra + (precio registrado × cantidad de cada refacción usada), verificado en órdenes con 0, 1 y varias refacciones.
- **SC-002**: El total del ticket y el total contra el que se registra el cobro son idénticos al total de la orden en el 100 % de los casos de prueba (diferencia $0).
- **SC-003**: Cero órdenes cobradas con total incompleto: ningún pago se registra ni ningún ticket se genera mientras exista una refacción usada sin precio.
- **SC-004**: Cero órdenes cuyo total histórico cambie por un cambio de precio posterior: modificar el precio de una refacción no altera ningún total ya calculado ni ningún importe pagado.
- **SC-005**: Las órdenes abiertas no liquidadas que ya usaban refacciones quedan con total correcto tras asignar precios: 100 % de ellas recalculadas sin intervención manual caso por caso.
- **SC-006**: El recepcionista ve el total actualizado al agregar o retirar una refacción, sin recargar nada a mano ni esperar más de unos segundos.
- **SC-007**: Ningún flujo de los sprints anteriores (inventario, órdenes, pagos, tickets) queda roto: las pruebas existentes siguen pasando —incluidas las que agregan refacciones, que registran un precio de venta en su preparación, sin cambiar sus aserciones— y el alcance de los specs previos no se modifica.

## Fuera de alcance

- Precio de compra de las refacciones y su captura o modificación.
- Reportes de utilidad, margen, costo o rentabilidad por refacción u orden.
- Recalcular retroactivamente órdenes ya pagadas ni corregir importes ya cobrados.
- Modificar los specs de los sprints anteriores (1 a 4).

## Supuestos

- Las refacciones que ya existen en el inventario al aplicar este cambio quedan sin precio de venta y deben tenerlo asignado por administración antes de poder usarse en una orden; los datos de ejemplo de la instalación inicial incluyen precios de venta ya definidos, tanto en las refacciones como en sus usos dentro de las órdenes de ejemplo, de modo que la demostración no requiere captura manual y ninguna orden de ejemplo arranca con total incompleto.
- Las pruebas existentes que agregan refacciones a una orden registran un precio de venta en su preparación; sus aserciones y los specs anteriores no se modifican.
- Cada uso de refacción en una orden conserva el precio de venta vigente al momento de agregarse (práctica estándar de punto de venta); los cambios posteriores de precio solo afectan usos futuros.
- Las órdenes ya pagadas conservan el total con el que se cobraron; la asignación posterior de precios no las modifica ni altera sus pagos.
- Las órdenes abiertas no liquidadas (incluidas las parcialmente pagadas) con usos antiguos sin precio sí adoptan el precio cuando se asigna, conservando los pagos ya registrados, para poder completar su total y cobrarlas.
- Registrar o modificar el precio de venta corresponde al rol de administración, en continuidad con la edición de refacciones del sprint de inventario.
- El precio de venta puede ser $0 (obsequio o promoción); lo obligatorio es que exista un valor no negativo antes de usar la refacción en una orden.
- Se trabaja con una única moneda con dos decimales, como el resto de importes del sistema.
- El bloqueo de cobro y ticket por total incompleto aplica a órdenes abiertas; las órdenes entregadas o canceladas no se reabren ni se recalculan.
- Los requisitos de esta feature complementan sin contradecir el FR-003 del spec 004 (el total incluye refacciones); los specs anteriores se conservan intactos.
