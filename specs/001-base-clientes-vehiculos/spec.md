# Especificación de Funcionalidad: Base de Clientes y Vehículos (Sprint 1)

**Rama de Funcionalidad**: `001-base-clientes-vehiculos`

**Creado**: 2026-10-11

**Estado**: Borrador

**Input**: Descripción de usuario: "Usa la descripción de docs/sprints/sprint-1-base-clientes-vehiculos.md (insumo de especificación del Sprint 1 del MVP de Motorix: base del sistema, autenticación, usuarios, clientes y vehículos)."

## Clarificaciones

### Session 2026-10-11

- P: ¿Cuáles datos son obligatorios al registrar un cliente en el sistema? → R: Nombre completo y teléfono obligatorios; correo y demás datos opcionales.
- P: ¿Cuáles datos son obligatorios al registrar un vehículo? → R: Placas, marca, modelo y año obligatorios; color y otros datos opcionales.
- P: Cuando un usuario o cliente deja de estar activo en el taller, ¿el sistema debe desactivarlo o borrarlo físicamente? → R: Desactivar (conservando el registro inactivo).
- P: ¿Cómo debe organizarse el menú lateral y las pantallas iniciales disponibles en el Sprint 1? → R: Opción A: sidebar con Inicio, Clientes, Vehículos y Usuarios (esta última solo para el administrador), con pantalla de inicio de bienvenida y acceso rápido.
- P: ¿Cuánto tiempo puede durar una sesión iniciada sin actividad antes de que el sistema pida iniciar sesión de nuevo? → R: 30 minutos sin actividad.

## Escenarios de usuario y pruebas *(obligatorio)*

### US1 - Inicio de sesión con usuario o correo (Prioridad: P1)

Como usuario del taller (administrador, recepcionista o mecánico), quiero iniciar sesión
con mi usuario o correo electrónico y contraseña para acceder a las funciones según mi rol.

**Por qué esta prioridad**: sin inicio de sesión no hay forma de usar el sistema de forma
segura; es la puerta de entrada de todos los demás módulos y del control por roles.

**Prueba independiente**: se puede probar completamente iniciando sesión con credenciales
válidas (por usuario y por correo) y verificando que un usuario sin credenciales válidas
no accede.

**Escenarios de aceptación**:

1. **Dado** un usuario existente con contraseña válida, **Cuando** ingresa su usuario y
   contraseña y confirma el inicio de sesión, **Entonces** el sistema le concede acceso
   y muestra las funciones propias de su rol.
2. **Dado** un usuario existente con contraseña válida, **Cuando** ingresa su correo
   electrónico en el mismo campo del usuario y confirma, **Entonces** el sistema le
   concede acceso igual que con el usuario.
3. **Dado** un usuario con contraseña incorrecta o inexistente, **Cuando** intenta
   iniciar sesión, **Entonces** el sistema deniega el acceso y muestra un mensaje claro
   sin revelar cuál de los datos es incorrecto.
4. **Dado** un usuario sin sesión iniciada, **Cuando** intenta usar una pantalla o
   acción restringida, **Entonces** el sistema lo redirige al inicio de sesión.
5. **Dado** un usuario cuya sesión expiró, **Cuando** intenta continuar, **Entonces**
   el sistema vuelve a pedirle iniciar sesión.
6. **Dado** un usuario autenticado, **Cuando** aterriza en el sistema después del
   inicio de sesión, **Entonces** ve la pantalla de inicio con acceso rápido y el menú
   lateral con las secciones que su rol autoriza (el mecánico solo ve Inicio en este
   sprint; Usuarios solo lo ve el administrador).

---

### US2 - Gestión de usuarios y roles por el administrador (Prioridad: P2)

Como administrador, quiero gestionar los usuarios y roles de acceso (crear, consultar,
editar y desactivar o reactivar) para controlar quién puede usar el sistema.

**Por qué esta prioridad**: el sistema necesita cuentas y roles definidos para que las
demás historias puedan ejecutarse con el personal correcto, pero puede desarrollarse
sobre la base del inicio de sesión ya existente.

**Prueba independiente**: con un administrador autenticado se dan de alta un usuario
nuevo con un rol, se consulta y se edita; un usuario sin rol de administrador no puede
hacer estas acciones.

**Escenarios de aceptación**:

1. **Dado** un administrador autenticado, **Cuando** crea un usuario nuevo indicando
   nombre de usuario, correo, contraseña y rol, **Entonces** el sistema registra la
   cuenta y el usuario ya puede iniciar sesión.
2. **Dado** un nombre de usuario o un correo ya registrados, **Cuando** el administrador
   intenta crear otro usuario con ese mismo dato, **Entonces** el sistema rechaza la
   operación y explica el conflicto.
3. **Dado** un administrador autenticado, **Cuando** edita el rol o los datos de un
   usuario existente, **Entonces** el sistema guarda los cambios y los refleja en el
   próximo acceso.
4. **Dado** un usuario con rol distinto de administrador, **Cuando** intenta acceder a
   la gestión de usuarios, **Entonces** el sistema deniega la operación.
5. **Dado** un administrador autenticado, **Cuando** consulta la lista de usuarios,
   **Entonces** el sistema muestra las cuentas con su rol y estado.
6. **Dado** un usuario desactivado por el administrador, **Cuando** intenta iniciar
   sesión o usar una sesión que ya tenía abierta, **Entonces** el sistema le deniega el
   acceso; si el administrador lo reactiva, vuelve a poder entrar.

---

### US3 - Registro y consulta de clientes (Prioridad: P2)

Como recepcionista, quiero registrar y consultar clientes para mantener actualizada la
información de los propietarios.

**Por qué esta prioridad**: los clientes son el dato base sin el cual no se puede
registrar ningún vehículo con propietario.

**Prueba independiente**: se da de alta un cliente con sus datos de contacto y se
encuentra nuevamente en la consulta por nombre o contacto.

**Escenarios de aceptación**:

1. **Dado** un recepcionista autenticado, **Cuando** registra un cliente con nombre
   completo y teléfono válidos (el correo es opcional), **Entonces** el sistema guarda
   el cliente y lo muestra en la consulta.
2. **Dado** datos de cliente incompletos o inválidos, **Cuando** el recepcionista intenta
   guardarlo, **Entonces** el sistema no guarda nada y señala qué dato debe corregirse.
3. **Dado** uno o más clientes registrados, **Cuando** el recepcionista busca un cliente
   por nombre o dato de contacto, **Entonces** el sistema muestra los coincidentes.
4. **Dado** un usuario con rol mecánico, **Cuando** intenta registrar o editar un
   cliente, **Entonces** el sistema deniega la operación.

---

### US4 - Edición de la información de clientes (Prioridad: P3)

Como recepcionista, quiero editar la información de los clientes para corregir o
actualizar sus datos.

**Por qué esta prioridad**: mejora la calidad de los datos, pero el registro y consulta
ya entregan valor por sí solos.

**Prueba independiente**: se modifica el dato de contacto de un cliente existente y se
verifica que la consulta muestra el valor nuevo.

**Escenarios de aceptación**:

1. **Dado** un cliente registrado, **Cuando** el recepcionista guarda cambios en su
   información, **Entonces** el sistema actualiza el registro y lo confirma en pantalla.
2. **Dado** datos inválidos en la edición, **Cuando** el recepcionista intenta guardar,
   **Entonces** el sistema conserva el registro original y explica el error.
3. **Dado** un cliente con vehículos asociados, **Cuando** se edita su información,
   **Entonces** los vehículos siguen asociados y no se pierde la relación.
4. **Dado** un cliente desactivado por el recepcionista, **Cuando** se registra un
   vehículo nuevo, **Entonces** el cliente no aparece entre las opciones de propietario,
   pero su ficha y sus vehículos anteriores siguen consultables.

---

### US5 - Registro de vehículos (Prioridad: P3)

Como recepcionista, quiero registrar vehículos para llevar el control de los automóviles
atendidos.

**Por qué esta prioridad**: completa la base informativa del taller; depende de que
existan clientes con los cuales asociar los vehículos.

**Prueba independiente**: se registra un vehículo con sus datos y aparece en la consulta
del sistema.

**Escenarios de aceptación**:

1. **Dado** un recepcionista autenticado con un cliente existente, **Cuando** registra
   un vehículo con placas, marca, modelo y año válidos, **Entonces** el sistema guarda
   el vehículo y lo asocia a ese cliente como propietario.
2. **Dado** un vehículo sin propietario seleccionado, **Cuando** el recepcionista intenta
   guardarlo, **Entonces** el sistema rechaza el registro (RN-1: no existe vehículo sin
   propietario).
3. **Dado** datos del vehículo incompletos o inválidos, **Cuando** se intenta guardar,
   **Entonces** el sistema no guarda nada y señala el dato a corregir.

---

### US6 - Asociación de vehículo con su propietario (Prioridad: P3)

Como recepcionista, quiero asociar un vehículo con su cliente para vincular la
información correctamente.

**Por qué esta prioridad**: cierra el flujo demostrable del sprint; es el vínculo que
permite consultar el historial futuro del vehículo.

**Prueba independiente**: al consultar un cliente se listan sus vehículos, y al
consultar un vehículo se identifica a su propietario.

**Escenarios de aceptación**:

1. **Dado** un vehículo y un cliente registrados, **Cuando** el recepcionista asocia el
   vehículo al cliente, **Entonces** el sistema refleja la relación en ambas direcciones.
2. **Dado** un vehículo ya asociado a un propietario, **Cuando** el recepcionista lo
   reasocia a otro cliente, **Entonces** el sistema actualiza la relación y lo deja
   claro en la consulta.
3. **Dado** un cliente consultado, **Cuando** se abre su ficha, **Entonces** el sistema
   muestra sus datos junto con los vehículos que tiene asociados.

---

### Casos límite

- ¿Qué sucede cuando un usuario ingresa un correo con formato inválido en el inicio de
  sesión o en el registro de usuarios?
- ¿Qué ocurre cuando dos administradores intentan editar el mismo usuario o cliente a la
  vez? (El último cambio guardado debe reflejarse en la consulta.)
- ¿Cómo maneja el sistema un intento de crear un cliente o vehículo con campos vacíos o
  solo con espacios?
- ¿Qué sucede si un usuario es deshabilitado mientras tiene una sesión abierta? (Debe
  perder el acceso en la siguiente operación protegida.)
- ¿Cómo responde el sistema si se intenta eliminar o deshabilitar un usuario que es el
  único administrador activo? (Debe impedirse dejar el sistema sin administradores.)
- ¿Qué ocurre al buscar clientes o vehículos sin resultados? (Mensaje claro de "sin
  coincidencias", sin error.)
- ¿Qué sucede cuando la contraseña nueva no cumple la política mínima al cambiarse?
- ¿Cómo actúa el sistema ante un cambio de contraseña con la contraseña actual incorrecta?

## Requisitos *(obligatorio)*

### Requisitos funcionales

- **FR-001**: El sistema DEBE permitir iniciar sesión con usuario o correo electrónico
  en el mismo campo, para todos los roles, y DENEGAR el acceso con credenciales inválidas.
- **FR-002**: El sistema DEBE mantener la sesión iniciada hasta que el usuario salga o
  pasen 30 minutos sin actividad, y DEBE exigir inicio de sesión para toda función
  protegida.
- **FR-003**: El sistema DEBE limitar cada acción al rol autorizado (administrador,
  recepcionista, mecánico), y la autorización DEBE comprobarse en el servidor, no solo
  ocultando controles en la interfaz (RN-5, RN-15).
- **FR-004**: El sistema DEBE permitir al administrador crear, consultar y editar
  usuarios con rol; los nombres de usuario y los correos electrónicos DEBEN ser únicos.
- **FR-005**: El sistema DEBE permitir al recepcionista registrar y consultar clientes.
  El nombre completo y el teléfono DEBEN ser obligatorios; el correo electrónico y los
  demás datos son opcionales. Los campos obligatorios y los de formato DEBEN validarse
  antes de guardar.
- **FR-006**: El sistema DEBE permitir al recepcionista editar la información de un
  cliente existente sin perder sus vehículos asociados.
- **FR-007**: Al consultar un cliente, el sistema DEBE mostrar sus datos y los vehículos
  asociados a él.
- **FR-008**: El sistema DEBE permitir al recepcionista registrar vehículos. Las
  placas, la marca, el modelo y el año DEBEN ser obligatorios; el color y otros datos
  son opcionales. El sistema NO DEBE permitir guardar un vehículo sin propietario (RN-1).
- **FR-009**: El sistema DEBE asociar cada vehículo a un cliente propietario, y DEBE
  reflejar la relación al consultar desde cualquiera de los dos lados.
- **FR-010**: El sistema DEBE conservar los datos registrados entre sesiones y reinicios,
  sin pérdida ni duplicación.
- **FR-011**: El sistema DEBE permitir cambiar la contraseña de la cuenta propia,
  validando la política mínima: 8 caracteres como mínimo, con mayúscula, minúscula y
  número (RN-17); el cambio DEBE exigir la contraseña actual.
- **FR-012**: La instalación inicial DEBE dejar cuentas de ejemplo operativas y datos de
  ejemplo (clientes y vehículos) visibles en la interfaz sin capturarlos a mano; los
  procesos iniciales DEBEN poder repetirse sin duplicar registros.
- **FR-013**: El sistema DEBE mostrar mensajes claros de éxito o error en cada operación,
  y DEBE pedir confirmación antes de operaciones que modifiquen o deshabiliten registros.
- **FR-014**: Toda pantalla de este sprint DEBE seguir el sistema de diseño del proyecto
  (`docs/design-system.md`): paleta, tipografía, espaciados y tokens definidos.
- **FR-015**: El sistema DEBE permitir desactivar y reactivar registros sin borrarlos:
  usuarios por el administrador y clientes por el recepcionista. Un usuario desactivado
  NO DEBE poder iniciar sesión ni conservar acceso, y un cliente desactivado NO DEBE
  aparecer como opción en operaciones nuevas, conservándose siempre su historial y sus
  vehículos asociados.
- **FR-016**: El sistema DEBE mostrar una pantalla de inicio con acceso rápido y un menú
  lateral con las secciones del sprint (Inicio, Clientes, Vehículos y Usuarios),
  presentando a cada rol únicamente las secciones que su rol autoriza: Usuarios solo
  para el administrador, y Clientes y Vehículos para el administrador y el recepcionista.

### Entidades clave *(incluido porque la funcionalidad maneja datos)*

- **Usuario**: persona con cuenta de acceso al sistema. Atributos clave: nombre de
  usuario (único), correo electrónico (único), contraseña (nunca en texto plano),
  rol (administrador, recepcionista o mecánico) y estado activo/inactivo.
- **Cliente**: propietario o contacto del taller. Atributos clave: nombre completo
  (obligatorio), teléfono (obligatorio), correo electrónico (opcional) y estado.
  Relación: un cliente puede tener varios vehículos.
- **Vehículo**: automóvil atendido por el taller. Atributos clave: placas (obligatorias
  y únicas), marca, modelo y año (obligatorios), color (opcional). Relación: un vehículo
  tiene un solo propietario (cliente) y no puede existir sin él.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El 100% de las cuentas activas pueden iniciar sesión indistintamente con
  usuario o correo electrónico, sin asistencia técnica.
- **SC-002**: Una recepcionista registra un cliente, registra un vehículo, lo asocia a
  ese cliente y lo consulta en menos de 3 minutos siguiendo la interfaz.
- **SC-003**: En el 100% de las acciones protegidas probadas, los usuarios sin el rol
  adecuado son rechazados en el servidor.
- **SC-004**: El 100% de los registros creados se conservan intactos tras un reinicio
  completo del sistema, sin duplicados.
- **SC-005**: Tras la instalación inicial, el sistema muestra datos de ejemplo
  utilizables de inmediato: al menos cuentas operativas, clientes y vehículos de
  demostración, sin captura manual.
- **SC-006**: El 100% de las contraseñas nuevas cumplen la política mínima; ninguna
  contraseña se guarda ni se muestra en texto plano.
- **SC-007**: El personal completa el flujo demostrable del sprint (iniciar sesión →
  registrar cliente → registrar vehículo → asociarlo → consultar) a la primera, sin
  ayuda y sin errores de la herramienta.

## Supuestos

- Los roles del sistema son administrador, recepcionista y mecánico, definidos en
  `docs/project-context.md`.
- Existen cuentas iniciales para el MVP (`admin`, `recepcion`, `mecanico`) con las
  contraseñas del estándar del proyecto; dichas contraseñas solo aplican a entornos
  locales de demostración y, al cambiarse, deben cumplir la política mínima (RN-17).
- "Gestionar usuarios" (US2) significa crear, consultar, editar, desactivar y reactivar
  usuarios y roles. La baja de usuarios y clientes es una desactivación reversible; los
  registros nunca se borran físicamente para conservar trazabilidad (resuelto en
  `/speckit.clarify`, sesión 2026-10-11).
- El stack tecnológico y las restricciones heredadas (motor de módulos del backend,
  base de datos local, motor y codificación de la base, validación en servidor,
  herramientas de prueba, idioma español de la documentación) se gobiernan por la
  constitución del proyecto (`.specify/memory/constitution.md`) y NO se reabren en este
  sprint.
- La política de contraseñas de las cuentas iniciales se distingue de la política
  mínima exigible a todo cambio de contraseña posterior.
- Las placas se consideran el identificador único de un vehículo dentro del sistema;
  registrar dos autos con las mismas placas debe rechazarse (supuesto razonable por
  convención de tránsito; si el equipo decide otra política, se documenta en
  `docs/project-context.md`).
- Las decisiones visuales aún pendientes (librería complementaria de componentes y set
  de íconos) se resuelven en `/speckit.clarify` sin bloquear este sprint. La estructura
  del menú lateral y las pantallas iniciales quedó resuelta en la sesión de clarificación
  del 2026-10-11 (opción A).
- La interfaz usa tema claro (el modo oscuro está fuera de alcance del MVP).
- Fuera de alcance de este sprint: citas, órdenes de servicio, inventario y
  refacciones, pagos y Mercado Pago, tickets, dashboard, chatbot de WhatsApp,
  recuperación de contraseña por correo y registro público de usuarios.
