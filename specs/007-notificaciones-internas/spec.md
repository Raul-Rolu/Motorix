# Especificación de la feature: Notificaciones internas y clientes por avisar

**Rama de la feature**: `007-notificaciones-internas`

**Creada**: 2026-11-22

**Estado**: Borrador

**Input**: Descripción del usuario: "Usar `docs/sprints/sprint-6-notificaciones-internas.md` como único insumo de alcance (Sprint 6, notificaciones internas). Generar la especificación en español para el centro de notificaciones por rol y la lista de clientes por avisar. Tomar como ya acordadas las decisiones de la sección 9 del insumo; dejar como [NEEDS CLARIFICATION] solo lo que sea de verdad ambiguo (máximo 3). Numerar la spec como la siguiente (007). La migración de este sprint será la 018."

## Aclaraciones

### Sesión 2026-11-22

- P: FR-010, orden detenida: el sistema no guarda la fecha del último cambio de estado de una orden (no existe historial de estados); ¿se usa la última modificación del registro o una marca propia? → R: Opción (b). La migración 018 agrega a las órdenes de servicio una fecha propia de **último cambio de estado** (`status_changed_at`), rellenada para las órdenes existentes con su fecha de última modificación actual (`updated_at`). Se actualiza solo cuando cambia el estado de la orden, no con otras ediciones. La orden detenida se calcula con esa fecha y N = 3 días. Los componentes existentes que deberán actualizarla se listan en «Componentes existentes afectados», sin cambiar su comportamiento actual.
- P: FR-015, cliente avisado por mantenimiento: si un mantenimiento ya avisado como próximo pasa después a vencido, ¿es el mismo hecho o uno nuevo? → R: Es el **mismo hecho**. El cliente no vuelve a la lista por ese mantenimiento al pasar de próximo a vencido; solo aparece de nuevo si existe un mantenimiento nuevo (otro registro de plan de mantenimiento).
- Revisión de otras ambigüedades de alto impacto: no se encontraron (ver «Supuestos»); no se hicieron preguntas adicionales.
- P (hallazgo del plan): «mantenimiento próximo» no tiene margen en el sistema actual (la lista de Mantenimientos ordena por urgencia sin ventana y el panel cuenta como próximo todo pendiente no vencido); el insumo hablaba de «el margen que ya existe». ¿Qué define «próximo» en los avisos? → R: Se adoptan **márgenes constantes de 30 días o 1,000 km**, usados solo por el aviso: un mantenimiento pendiente no vencido es próximo si su umbral de fecha está a 30 días o menos, o su umbral de kilometraje está a 1,000 km o menos. Los **vencidos** del centro coinciden al 100 % con el panel de control y con la lista de Mantenimientos; los **próximos** del centro son un subconjunto del conteo de próximos del panel (que no aplica margen), definido por esos márgenes. El panel y la lista no cambian. El Sprint 7 podrá volver configurables los márgenes.
- P (hallazgo del plan): el insumo describe una insignia con el número de alertas en el ícono de Inventario y un `StockAlertsProvider`; ¿cómo se cumple CA-8? → R: **Ninguno de los dos existe en este repositorio** (el insumo lo describía mal). La única alerta existente es la tarjeta «Alertas que requieren atención» (`alertasPanel`) del panel de control del administrador. CA-8 se cumple conservando esa tarjeta sin cambios y comprobando con una prueba que sus cifras coinciden con las del centro de notificaciones. No se agrega ninguna insignia nueva.
- P (hallazgo del plan): el seed de ejemplo debe cubrir todos los tipos de aviso; ¿se agregan datos de demostración? → R: Se acepta el seed `009_demo_notifications.sql` (orden 6 terminada, mantenimiento 6 próximo y un ajuste guardado de la orden 3 para bases ya sembradas), además del ajuste de fechas del seed 004. Se revisarán las cifras absolutas de `docs/evidencias/aseguramiento/quickstart-005.mjs`, que siguen siendo válidas en sus comparaciones entre corridas.

## Alcance de esta especificación

Hoy los avisos están dispersos y limitados al administrador. Esta feature los reúne en un solo lugar del encabezado, por rol, y agrega la lista de clientes por avisar. Lo ya construido **no se reescribe**:

| Elemento existente | Qué hace esta feature con él |
|---|---|
| Tarjeta «Alertas que requieren atención» (`alertasPanel`) del panel de control de ADMIN (mantenimientos vencidos, stock bajo y cobros digitales pendientes). El insumo hablaba además de una insignia en Inventario y de un `StockAlertsProvider`, que **no existen** en este repositorio | Se conserva sin cambios y no debe contradecir al centro de notificaciones; no se agrega ninguna insignia |
| Contadores del panel de control (mantenimientos próximos y vencidos, citas, stock bajo; solo ADMIN) | Se conservan; los avisos usan el mismo cálculo de mantenimientos y de stock |
| Lista de Mantenimientos, que solo muestra «Pendiente» o «Vencido» (no tiene indicador «Próximo» ni margen) | Se conserva sin cambios; es la fuente de la regla de **vencido** (RN-11). La regla de **próximo** del aviso es nueva y usa los márgenes de 30 días o 1,000 km (ver «Aclaraciones») |
| Alertas de stock ya calculadas (`stock <= stock mínimo`) | Se consumen; no se redefinen |
| Precios de refacciones, cobros y `STALE` (specs 005 y 006) | No se tocan |

### Componentes existentes afectados por la fecha de último cambio de estado

Estos componentes deberán mantener la nueva fecha de último cambio de estado de la orden (`status_changed_at`) **sin cambiar su comportamiento actual** (mismas validaciones, mismas respuestas, misma máquina de estados):

| Componente existente | Qué debe hacer |
|---|---|
| `server/models/order.js`, función `setStatus` (único punto que ejecuta el cambio de estado de una orden) | Actualizar la fecha de último cambio de estado a la hora actual en el mismo `UPDATE` que cambia `status` |
| `server/services/order-service.js`, función de cambio de estado (la que llama a `setStatus`; cubre avance, pausa y reanudación de `ESPERANDO_REFACCION` y cancelación) | Sin cambios de lógica: al pasar por `setStatus` toda transición actualiza la fecha |
| `server/models/order.js`, alta de la orden (`INSERT INTO service_orders`) | La orden nueva inicia con la fecha de último cambio de estado igual a su creación |
| `server/models/order.js`, funciones que editan datos de la orden sin cambiar el estado (motivo, notas, kilometraje y mecánico asignado) | **No** modifican la fecha; hoy solo actualizan `updated_at` |
| Seeds de órdenes (`database/seeds/004_demo_service_orders.sql`) | Fijar la fecha de último cambio de estado de las órdenes de ejemplo para sostener los casos de demostración (incluida una orden detenida), manteniendo la carga idempotente |
| Pruebas existentes de órdenes | Siguen en verde sin editarse |

## Decisiones ya acordadas (sección 9 del insumo; no se reabren)

- **Orden detenida**: orden en estado activo (Recibido, Diagnóstico, En reparación o Esperando refacción; nunca Terminado, Entregado ni Cancelada) sin ningún cambio de estado desde hace más de **3 días**, medido con la fecha propia de último cambio de estado (ver «Aclaraciones»). El 3 es una constante del backend; el Sprint 7 podrá volverla configurable.
- **Cita del día**: citas de hoy, no canceladas ni completadas. En el sistema actual el estado vigente de una cita pendiente es `PROGRAMADA` (no existe un estado "confirmada"), por lo que "pendientes y confirmadas" del insumo equivale a `PROGRAMADA`. La "cita de mañana" solo aplica a la lista de clientes por avisar.
- **Actualización del contador**: al iniciar sesión, al navegar entre pantallas y con una consulta cada 60 segundos mientras la app está abierta; sin WebSocket.
- **Identidad de un aviso para la lectura**: por tipo, objeto y estado (por ejemplo `MANTENIMIENTO:12:VENCIDO`, `STOCK:7:AGOTADO`, `ORDEN:5:DETENIDA`). Un aviso que empeora cambia de clave y vuelve a aparecer como no leído.
- **Mantenimiento próximo**: pendiente no vencido cuyo umbral más cercano está a **30 días o menos** o a **1,000 km o menos** (márgenes constantes solo del aviso; ver «Aclaraciones»). «Vencido» usa la regla que ya existe (RN-11) sin cambios.
- **Cita en la lista de clientes por avisar**: se avisa un día antes (cita de mañana).
- **Orden terminada**: el aviso al cliente se registra una sola vez por orden; admite una nota opcional de hasta 255 caracteres; una vez avisado, el cliente sale de la lista por ese hecho.
- **Mecánico**: solo ve avisos de órdenes asignadas a él; no ve avisos de mantenimiento ni de stock.
- **Pendiente de decisión de diseño (no funcional)**: textos exactos, íconos y agrupación visual por tipo se deciden en el plan según `docs/design-system.md`.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia de usuario 1 - Contador de avisos en el encabezado (Prioridad: P1)

Como administrador, quiero ver en el encabezado cuántos avisos pendientes tengo para atenderlos sin recorrer cada módulo.

**Por qué esta prioridad**: Es el núcleo del sprint: sin la campana y su panel no existe un centro de notificaciones y el resto de las historias no tiene dónde mostrarse.

**Independiente**: Se puede probar con datos que generen avisos de varios tipos, iniciando sesión como administrador y verificando la campana, el total y el panel agrupado, sin usar la lista de clientes por avisar.

**Escenarios de aceptación**:

1. **Dado** un mantenimiento vencido, una cita para hoy, una refacción con stock bajo y una orden detenida, **Cuando** el administrador inicia sesión, **Entonces** el encabezado muestra una campana con el total de avisos no leídos (4).
2. **Dado** la campana con avisos, **Cuando** el administrador la abre, **Entonces** ve un panel con los avisos agrupados por tipo.
3. **Dado** que no existe ningún aviso, **Cuando** el administrador abre el panel, **Entonces** ve un estado vacío claro y la campana sin contador.
4. **Dado** que la consulta de avisos falla, **Cuando** se abre el panel, **Entonces** se muestra un mensaje de error en español con opción de reintentar, sin trazas internas.
5. **Dado** la app abierta, **Cuando** transcurren 60 segundos o el usuario navega a otra pantalla, **Entonces** el contador se actualiza con los datos vigentes.

---

### Historia de usuario 2 - Mantenimientos y citas para la recepción (Prioridad: P1)

Como recepcionista, quiero ver los mantenimientos próximos y vencidos y las citas del día para avisar a los clientes a tiempo.

**Por qué esta prioridad**: Es el valor operativo principal para el rol que más contacta a clientes, y reutiliza cálculos ya existentes.

**Independiente**: Se puede probar iniciando sesión como recepcionista con mantenimientos y citas sembrados y verificando solo esos avisos (y los de órdenes detenidas de la historia 4).

**Escenarios de aceptación**:

1. **Dado** un mantenimiento vencido (según la regla existente de la lista de Mantenimientos) y otro próximo (pendiente con su umbral a 30 días o menos, o a 1,000 km o menos), **Cuando** la recepcionista abre el centro, **Entonces** ve un aviso por cada uno con su estado correcto.
2. **Dado** una cita de hoy en estado `PROGRAMADA`, **Cuando** la recepcionista abre el centro, **Entonces** ve el aviso de cita del día.
3. **Dado** una cita de hoy cancelada o completada, **Cuando** se abre el centro, **Entonces** no genera aviso.
4. **Dado** una refacción con stock bajo, **Cuando** la recepcionista consulta sus avisos, **Entonces** el aviso de stock no aparece ni se devuelve en la respuesta.

---

### Historia de usuario 3 - Stock bajo o agotado para el administrador (Prioridad: P2)

Como administrador, quiero ver las refacciones con stock bajo o agotado para reabastecer a tiempo.

**Por qué esta prioridad**: Complementa la alerta de stock que hoy solo existe en la tarjeta de alertas del panel de control; depende del centro de la historia 1.

**Independiente**: Se prueba con refacciones en distintos niveles de stock y verificando los avisos y su coincidencia con la tarjeta de alertas del panel de control.

**Escenarios de aceptación**:

1. **Dado** una refacción activa con stock mayor que 0 y menor o igual a su stock mínimo, **Cuando** el administrador abre el centro, **Entonces** ve un aviso de stock bajo.
2. **Dado** una refacción activa con stock 0, **Cuando** el administrador abre el centro, **Entonces** ve un aviso de stock agotado.
3. **Dado** el total de refacciones en alerta, **Cuando** se compara el centro con la tarjeta de alertas del panel de control, **Entonces** las cifras coinciden.
4. **Dado** una refacción cuyo stock se repone por encima del mínimo, **Cuando** se vuelve a consultar, **Entonces** el aviso desaparece.

---

### Historia de usuario 4 - Órdenes detenidas (Prioridad: P2)

Como administrador o recepcionista, quiero ver las órdenes detenidas para destrabarlas.

**Por qué esta prioridad**: Detecta trabajo olvidado y es el único aviso que además llega al mecánico; requiere un criterio nuevo que hoy no existe.

**Independiente**: Se prueba con órdenes en distintos estados y con distinta antigüedad de su último cambio de estado.

**Escenarios de aceptación**:

1. **Dado** una orden en estado activo cuyo último cambio de estado fue hace más de 3 días, **Cuando** el administrador o la recepcionista abren el centro, **Entonces** ven el aviso de orden detenida.
2. **Dado** una orden con último cambio de estado hace 3 días o menos, **Cuando** se consulta, **Entonces** no genera aviso.
3. **Dado** una orden Terminada, Entregada o Cancelada, **Cuando** se consulta, **Entonces** nunca genera aviso de orden detenida.
4. **Dado** una orden detenida a la que se le cambia el estado, **Cuando** se vuelve a consultar, **Entonces** el aviso desaparece.
5. **Dado** una orden detenida a la que se le edita solo el motivo, las notas, el kilometraje o el mecánico asignado (sin cambiar el estado), **Cuando** se vuelve a consultar, **Entonces** sigue detenida: esas ediciones no reinician el plazo de 3 días.
6. **Dado** una orden que existía antes de esta feature, **Cuando** se aplica la migración, **Entonces** su fecha de último cambio de estado queda igual a su última modificación actual y el criterio de orden detenida se calcula a partir de ella.

---

### Historia de usuario 5 - El mecánico ve solo lo suyo (Prioridad: P2)

Como mecánico, quiero ver solo los avisos de mis órdenes asignadas para no recibir información que no me corresponde.

**Por qué esta prioridad**: Es una regla de seguridad y de negocio (RN-5, RN-15) que debe validarse en backend.

**Independiente**: Se prueba con órdenes detenidas asignadas a dos mecánicos distintos, verificando que cada uno recibe solo las suyas.

**Escenarios de aceptación**:

1. **Dado** dos órdenes detenidas, una asignada al mecánico A y otra al B, **Cuando** el mecánico A consulta sus avisos, **Entonces** recibe solo el de su orden.
2. **Dado** mantenimientos vencidos, citas del día y refacciones con stock bajo, **Cuando** un mecánico consulta sus avisos, **Entonces** no recibe ninguno de esos tipos, sin importar lo que muestre la interfaz.
3. **Dado** una orden detenida sin mecánico asignado, **Cuando** un mecánico consulta sus avisos, **Entonces** no la recibe.

---

### Historia de usuario 6 - Marcar como leído y abrir el módulo relacionado (Prioridad: P2)

Como usuario, quiero marcar un aviso como leído y abrir el módulo relacionado desde él para dar seguimiento rápido.

**Por qué esta prioridad**: Hace utilizable el centro: sin lectura el contador nunca baja y sin navegación el aviso no ayuda a actuar.

**Independiente**: Se prueba marcando avisos como leídos, cerrando sesión, volviendo a entrar y comprobando el estado por usuario, y abriendo cada aviso.

**Escenarios de aceptación**:

1. **Dado** un aviso no leído, **Cuando** el usuario lo marca como leído, **Entonces** el contador baja y el estado persiste para ese usuario (otro usuario lo sigue viendo no leído).
2. **Dado** un aviso leído cuya condición deja de cumplirse, **Cuando** se vuelve a consultar, **Entonces** el aviso desaparece.
3. **Dado** un aviso de mantenimiento próximo leído que pasa a vencido, **Cuando** se vuelve a consultar, **Entonces** reaparece como no leído por ser un estado distinto.
4. **Dado** un aviso, **Cuando** el usuario lo abre, **Entonces** llega a la pantalla relacionada: la orden, la cita, el vehículo o Inventario según el tipo.

---

### Historia de usuario 7 - Clientes por avisar (Prioridad: P3)

Como recepcionista, quiero una lista de clientes por avisar (vehículo listo, cita de mañana, mantenimiento próximo o vencido) con su teléfono, y marcar cada uno como avisado, para contactarlos por teléfono o en persona sin olvidar ni repetir avisos.

**Por qué esta prioridad**: Agrega una tabla y un flujo nuevos sobre los avisos ya derivados; es independiente del centro de notificaciones y se puede entregar después de él.

**Independiente**: Se prueba con una orden terminada, una cita de mañana y un mantenimiento próximo sembrados, listando, marcando como avisado y reconsultando.

**Escenarios de aceptación**:

1. **Dado** una orden Terminada sin entregar, una cita de mañana y un mantenimiento próximo o vencido, **Cuando** la recepcionista abre «Clientes por avisar», **Entonces** ve una fila por hecho con cliente, teléfono, vehículo y motivo.
2. **Dado** un cliente de la lista, **Cuando** la recepcionista lo marca como avisado (con nota opcional de hasta 255 caracteres), **Entonces** el sistema guarda quién lo avisó y cuándo, y el cliente sale de la lista por ese hecho.
3. **Dado** un cliente ya avisado por una orden, **Cuando** surge un hecho nuevo (otra orden terminada u otra cita), **Entonces** aparece de nuevo en la lista.
4. **Dado** un mecánico, **Cuando** intenta consultar o marcar clientes por avisar, **Entonces** el backend lo rechaza con un error de autorización.
5. **Dado** una nota de más de 255 caracteres, **Cuando** se intenta guardar, **Entonces** el sistema la rechaza con un mensaje claro y no registra el aviso.
6. **Dado** una orden Terminada sin entregar que pasa a Entregada antes de avisar al cliente, **Cuando** se consulta la lista, **Entonces** el motivo ya no aparece.
7. **Dado** un mantenimiento ya avisado como próximo que después pasa a vencido, **Cuando** se consulta la lista, **Entonces** el cliente no vuelve a aparecer por ese mantenimiento (es el mismo hecho).
8. **Dado** un cliente ya avisado por un mantenimiento, **Cuando** se registra un mantenimiento nuevo (otro registro) para el mismo cliente o vehículo y entra en próximo o vencido, **Entonces** aparece de nuevo en la lista por ese hecho nuevo.

---

### Casos límite

- ¿Qué ocurre si la condición de un aviso deja de cumplirse (stock repuesto, cita cancelada, orden con nuevo estado)? (el aviso desaparece; no se guarda historial de avisos pasados)
- ¿Qué ocurre si un aviso reaparece con el mismo estado después de haber desaparecido? (la lectura guardada para esa clave sigue vigente; solo un estado distinto vuelve a mostrarlo como no leído)
- ¿Qué pasa con un cliente sin teléfono registrado? (el teléfono es obligatorio en clientes; si faltara, la fila se muestra sin romper la lista)
- ¿Qué ocurre si dos recepcionistas marcan al mismo cliente como avisado casi al mismo tiempo? (el hecho queda registrado una sola vez y el segundo intento no duplica el registro)
- ¿Qué pasa con una cita de hoy `COMPLETADA`? (no genera aviso, aunque el panel de control la cuente entre las citas de hoy)
- ¿Qué ocurre con una orden detenida cuyo mecánico fue reasignado? (el aviso pasa a corresponder al mecánico actualmente asignado; la reasignación no es un cambio de estado y no reinicia el plazo)
- ¿Qué ocurre con una orden pausada en `ESPERANDO_REFACCION` durante más de 3 días? (cuenta como detenida por la regla acordada; reanudarla o cualquier otro cambio de estado reinicia el plazo)
- ¿Qué ocurre con un mantenimiento avisado como próximo que luego vence? (es el mismo hecho: no vuelve a la lista de clientes por avisar, aunque en el centro de notificaciones sí reaparece como aviso no leído por tener otro estado)
- ¿Qué ocurre con un mantenimiento cancelado o completado? (no genera aviso: solo los pendientes se evalúan)
- ¿Qué ocurre con una refacción inactiva? (no genera aviso, igual que en las alertas de stock actuales)
- ¿Qué ocurre si la sesión expira durante la consulta periódica de 60 segundos? (se trata como cualquier sesión vencida: se cierra la sesión sin dejar la campana con datos obsoletos)
- ¿Qué ocurre si en el mismo equipo cierra sesión un usuario e inicia otro con un rol distinto? (el centro de notificaciones descarta de inmediato la lista, los contadores y las marcas de leído del usuario anterior; no se muestran avisos ajenos mientras carga la consulta del nuevo usuario)
- ¿Qué ocurre con los datos de los sprints anteriores? (no se modifican; la feature solo agrega tablas y consultas)

## Requisitos *(obligatorio)*

### Requisitos funcionales (formato EARS)

- **FR-001** (Ubicuo): El sistema deberá mostrar en el encabezado una campana con el total de avisos no leídos del usuario y un panel que los agrupa por tipo. (CA-1)
- **FR-002** (Ubicuo): Los tipos de aviso serán: mantenimiento próximo, mantenimiento vencido, cita del día, stock bajo o agotado y orden detenida. (CA-3)
- **FR-003** (Ubicuo): El sistema deberá calcular los avisos al consultar, con datos reales, sin copiarlos a otra tabla; lo único que se guardará de un aviso es su lectura por usuario. (CA-2)
- **FR-004** (Ubicuo): El backend deberá devolver a cada rol únicamente sus avisos: ADMIN todos; RECEPTIONIST mantenimientos, citas y órdenes detenidas; MECHANIC solo avisos de órdenes asignadas a él. El stock no se devolverá a RECEPTIONIST ni a MECHANIC. (CA-4)
- **FR-005** (Ubicuo): Los avisos deberán usar el mismo cálculo que el panel de control, la lista de Mantenimientos y las alertas de stock, de modo que los números coincidan entre pantallas. (CA-5)
- **FR-006** (Evento): Cuando un usuario marque un aviso como leído, el sistema deberá guardar la lectura por usuario usando la identidad del aviso (tipo, objeto y estado); si la condición deja de cumplirse el aviso desaparecerá, y si reaparece con otro estado volverá a mostrarse como no leído. (CA-6)
- **FR-007** (Evento): Cuando el usuario abra un aviso, el sistema deberá llevarlo a la pantalla relacionada (orden, cita, vehículo o Inventario). (CA-7)
- **FR-008** (Ubicuo): La tarjeta «Alertas que requieren atención» del panel de control de ADMIN deberá seguir funcionando sin cambios y sin contradecir al centro de notificaciones; no se agregará una insignia a Inventario. (CA-8)
- **FR-009** (Ubicuo): El centro de notificaciones deberá manejar los estados de carga, vacío y error conforme a `docs/design-system.md`. (CA-9)
- **FR-010** (Estado): Mientras una orden esté en estado Recibido, Diagnóstico, En reparación o Esperando refacción y su último cambio de estado haya ocurrido hace más de 3 días, el sistema deberá mostrarla como orden detenida, calculado con la fecha propia de último cambio de estado de la orden (FR-020); nunca aplicará a órdenes Terminadas, Entregadas ni Canceladas. (CA-3)
- **FR-011** (Estado): Mientras una cita de hoy esté en estado `PROGRAMADA`, el sistema deberá mostrarla como aviso de cita del día; las citas canceladas o completadas no generarán aviso. (CA-3)
- **FR-012** (Ubicuo): El aviso de mantenimiento vencido deberá usar el cálculo que ya existe (RN-11) sin modificarlo; el aviso de mantenimiento próximo será un pendiente no vencido con su umbral más cercano a 30 días o menos, o a 1,000 km o menos (márgenes constantes solo del aviso, no de la lista ni del panel). (CA-5)
- **FR-013** (Evento): Cuando el usuario inicie sesión, navegue entre pantallas o transcurran 60 segundos con la app abierta, el sistema deberá actualizar el contador de avisos mediante una consulta, sin notificaciones en tiempo real. Al cerrar sesión o al cambiar de usuario, el cliente deberá descartar la lista de avisos, los contadores y las marcas de leído del usuario anterior, de modo que nunca se muestren a otro usuario ni por un instante. (CA-1)
- **FR-014** (Ubicuo): ADMIN y RECEPTIONIST podrán ver la lista de clientes por avisar con cliente, teléfono, vehículo y motivo (orden terminada sin entregar, cita de mañana, mantenimiento próximo o vencido); MECHANIC no tendrá acceso, validado en el backend. (CA-10)
- **FR-015** (Evento): Cuando un usuario autorizado marque a un cliente como avisado, el sistema deberá guardar quién lo avisó, cuándo y una nota opcional de hasta 255 caracteres, sacarlo de la lista y no volver a mostrarlo por el mismo hecho; un hecho nuevo (otra orden, otra cita u otro registro de mantenimiento) lo hará aparecer de nuevo. Un mantenimiento ya avisado como próximo que pasa a vencido es el mismo hecho y no vuelve a la lista. (CA-11)
- **FR-016** (Evento): Cuando se carguen los datos de ejemplo del sprint, el sistema deberá incluir al menos un caso de cada tipo de aviso, y la carga será idempotente (IDs fijos, sin duplicar ni reiniciar datos de trabajo). (CA-12)
- **FR-017** (Ubicuo): Las pruebas de la feature deberán cubrir el cálculo de cada aviso, los permisos por rol, la lectura por usuario y el rendimiento de la consulta, sin dejar rojas las suites previas. (CA-13)
- **FR-018** (Evento): Cuando cierre este sprint, el equipo deberá actualizar la sección 6.12 de `docs/project-context.md` y `docs/design-system.md`. (CA-14)
- **FR-019** (Ubicuo): El sistema no deberá enviar avisos al cliente por ningún canal: el aviso lo hace la persona de recepción y el sistema solo lo registra. (Fuera de alcance, CA-10)
- **FR-020** (Evento): Cuando cambie el estado de una orden de servicio, el sistema deberá actualizar la fecha de último cambio de estado de esa orden; las demás ediciones (motivo, notas, kilometraje, mecánico asignado) no la modificarán. Una orden nueva iniciará con esa fecha igual a su creación y, al aplicar la migración 018, las órdenes existentes la recibirán con el valor actual de su fecha de última modificación. Los componentes existentes afectados no cambian su comportamiento actual (ver «Componentes existentes afectados»). (CA-15)

### Criterios de aceptación

- **CA-1**: Se comprueba que el encabezado muestra una campana con el total de avisos no leídos del usuario, que abre un panel con los avisos agrupados por tipo y que el contador se actualiza al iniciar sesión, al navegar y cada 60 segundos.
- **CA-2**: Se comprueba que los avisos se calculan al consultar con datos reales, que no existe una copia de ellos en otra tabla y que solo se guarda la lectura.
- **CA-3**: Se comprueba que los tipos incluidos son mantenimientos próximos, mantenimientos vencidos, citas del día, stock bajo o agotado y órdenes detenidas, cada uno con su regla.
- **CA-4**: Se comprueba con pruebas por rol que ADMIN recibe todos los avisos; RECEPTIONIST mantenimientos, citas y órdenes detenidas; MECHANIC solo avisos de órdenes asignadas a él, y que el stock no llega a RECEPTIONIST ni a MECHANIC.
- **CA-5**: Se comprueba que los avisos de mantenimiento **vencido** coinciden al 100 % con el conteo del panel de control y con la lista de Mantenimientos, que los avisos de stock coinciden con la alerta de stock del panel, y que los avisos de mantenimiento **próximo** del centro son un subconjunto del conteo de próximos del panel, definido por los márgenes de 30 días o 1,000 km.
- **CA-6**: Se comprueba que marcar un aviso como leído persiste por usuario, que si la condición deja de cumplirse el aviso desaparece y que si reaparece con otro estado vuelve a mostrarse como no leído.
- **CA-7**: Se comprueba que cada aviso abre la pantalla relacionada (orden, cita, vehículo o inventario).
- **CA-8**: Se comprueba con una prueba que la tarjeta «Alertas que requieren atención» del panel de control de ADMIN sigue funcionando sin cambios y que sus cifras (mantenimientos vencidos y stock bajo) coinciden con las del centro de notificaciones. No existe ni se agrega una insignia en Inventario.
- **CA-9**: Se comprueba que el centro maneja los estados de carga, vacío y error según `docs/design-system.md`.
- **CA-10**: Se comprueba que RECEPTIONIST y ADMIN ven la lista de clientes por avisar con cliente, teléfono, vehículo y motivo, y que MECHANIC no accede, validado en el backend.
- **CA-11**: Se comprueba que marcar a un cliente como avisado guarda quién y cuándo, lo saca de la lista y no vuelve a aparecer por el mismo hecho, y que un hecho nuevo (otra orden, otra cita u otro registro de mantenimiento) lo hace aparecer de nuevo; un mantenimiento avisado como próximo que pasa a vencido no vuelve a la lista.
- **CA-12**: Se comprueba que los seeds incluyen al menos un caso de cada tipo de aviso y que son idempotentes (dos corridas seguidas sin duplicar).
- **CA-13**: Se comprueba que existen y pasan pruebas de cálculo de cada aviso, permisos por rol, lectura por usuario y rendimiento de la consulta, y que las suites previas siguen en verde.
- **CA-14**: Se comprueba que la sección 6.12 de `docs/project-context.md` y `docs/design-system.md` quedan actualizadas en el mismo sprint.
- **CA-15**: Se comprueba que la fecha de último cambio de estado de las órdenes existentes se rellena con su última modificación al aplicar la migración, que toda transición de estado (avance, pausa, reanudación y cancelación) y el alta de una orden la establecen, que editar motivo, notas, kilometraje o mecánico no la modifica y que las pruebas existentes de órdenes siguen en verde sin editarse.

### Entidades clave

- **Aviso** (derivado, no se guarda): condición calculada al consultar sobre datos existentes (mantenimientos, citas, refacciones, órdenes). Se identifica por tipo, objeto y estado. Relación: un aviso se muestra a uno o más roles según FR-004.
- **Lectura de aviso** (nueva): constancia de que un usuario marcó como leído un aviso, con su identidad (tipo, objeto y estado) y la fecha. Es el único estado que se guarda de los avisos. Relación: pertenece a un usuario.
- **Aviso a cliente** (nueva): constancia de que alguien de recepción o administración avisó a un cliente por un hecho concreto (orden, cita o mantenimiento), con quién lo avisó, cuándo y una nota opcional de hasta 255 caracteres. Relación: pertenece a un cliente y a un usuario.
- **Orden de servicio** (existente, se amplía): incorpora la fecha de último cambio de estado, que solo se actualiza al cambiar el estado y sustenta el criterio de orden detenida. Además es fuente de los avisos y de la lista de clientes por avisar.
- **Cita, mantenimiento, refacción y cliente** (existentes, solo consulta): fuente de los avisos y de la lista de clientes por avisar. El teléfono del cliente se consulta de la ficha existente. Un «mantenimiento nuevo» es un registro distinto de plan de mantenimiento.

## Criterios de éxito *(obligatorio)*

### Resultados mensurables

- **SC-001**: 100 % de los avisos que corresponden a las condiciones sembradas (un caso por tipo) aparecen en el centro del rol correcto, y 0 avisos de tipos no permitidos llegan a RECEPTIONIST o MECHANIC (verificado en la respuesta del servidor).
- **SC-002**: El número de avisos de mantenimiento y de stock del centro coincide al 100 % con el del panel de control, la lista de Mantenimientos y las alertas de stock en las pruebas.
- **SC-003**: La consulta de avisos responde en menos de 1 segundo con un volumen de datos ampliado respecto al de demostración (ver Supuestos).
- **SC-004**: 100 % de los avisos marcados como leídos conservan ese estado tras cerrar e iniciar sesión, y 0 afectan a otros usuarios.
- **SC-005**: 0 clientes avisados por un hecho vuelven a aparecer en «Clientes por avisar» por ese mismo hecho, y 100 % de los hechos nuevos sí aparecen.
- **SC-006**: La carga de datos de ejemplo ejecutada dos veces seguidas produce 0 registros duplicados y no altera los datos de trabajo existentes.
- **SC-007**: Ninguna suite de pruebas previa queda en roto tras este sprint; las nuevas pruebas de cálculo, permisos, lectura y rendimiento pasan todas.
- **SC-008**: La sección 6.12 de `docs/project-context.md` y `docs/design-system.md` reflejan el sistema real al cerrar el sprint.
- **SC-009**: 100 % de las transiciones de estado de una orden actualizan su fecha de último cambio de estado, 0 ediciones sin cambio de estado la modifican y 0 pruebas existentes de órdenes requieren edición.

## Fuera de alcance

- Envío automático de avisos al cliente por cualquier canal (WhatsApp, correo, SMS): el aviso lo hace la persona de recepción y el sistema solo lo registra.
- Notificaciones en tiempo real por WebSocket o notificaciones del sistema operativo.
- Preferencias por usuario sobre qué avisos recibir.
- Historial o bitácora de avisos pasados.
- Reportes y configuración del taller (Sprint 7), incluida la configuración del umbral de 3 días.
- Cualquier cambio a lo ya construido en los sprints 1 a 5 y su complemento, salvo lo que este sprint necesite consumir.

## Supuestos

- Las decisiones de la sección 9 del insumo se aplican como firmes (ver «Decisiones ya acordadas») y las dos aclaraciones abiertas se resolvieron el 2026-11-22 (ver «Aclaraciones»); no quedan marcadores abiertos.
- El insumo menciona una tabla de historial de estados de órdenes; **no existe en el sistema actual**. Se resolvió agregando una fecha propia de último cambio de estado en la migración 018, en lugar de crear un historial (el historial de avisos y de estados sigue fuera de alcance).
- Las órdenes existentes que al migrar tengan una última modificación antigua pueden aparecer de inmediato como detenidas si siguen en estado activo; es el comportamiento esperado de rellenar la fecha con su última modificación actual.
- Se revisaron otras posibles ambigüedades y se resolvieron con valores por defecto sin impacto alto: el aviso a cliente por una cita se identifica por esa cita (reprogramarla a otro día no genera un hecho nuevo salvo que sea otra cita); marcar a un cliente como avisado es independiente de marcar un aviso como leído en el centro de notificaciones; «hoy» y «mañana» se evalúan con la fecha local del servidor.
- El insumo habla de citas «pendientes y confirmadas»; el sistema actual solo tiene `PROGRAMADA`, `COMPLETADA` y `CANCELADA`, por lo que se usa `PROGRAMADA`.
- El panel de control cuenta las citas de hoy no canceladas (incluye las completadas); el centro de notificaciones excluye además las completadas por la decisión acordada. No se modifica el panel (fuera de alcance), de modo que ambas cifras coinciden cuando no hay citas completadas hoy.
- El volumen para la prueba de rendimiento (SC-003) se toma como orden de magnitud de cientos de órdenes, citas, refacciones y mantenimientos, sin cifras de producción; la cifra exacta se fija en el plan.
- «Stock agotado» es stock igual a 0 y «stock bajo» es stock mayor que 0 y menor o igual al stock mínimo; juntos coinciden con la alerta de stock que ya existe.
- Los mantenimientos próximos y vencidos solo consideran planes pendientes; los cancelados y completados no generan aviso.
- La numeración de la migración de esta feature es `018_...sql` (aditiva; no modifica las 001 a 017).
- Las restricciones técnicas heredadas del insumo se mantienen: backend en ES Modules, solo el backend accede a MySQL, permisos validados en backend, sin secretos en el repositorio, MySQL local con InnoDB y `utf8mb4`, login por usuario o correo, pruebas de integración contra `motorix_test`, seeds de ejemplo suficientes e idempotentes, importes en centavos enteros y español en docs, comentarios y pruebas, con interfaces conforme a `docs/design-system.md`.
