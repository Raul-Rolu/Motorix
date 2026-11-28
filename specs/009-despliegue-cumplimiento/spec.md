# Especificación de la feature: Despliegue y cumplimiento

**Rama de la feature**: `009-despliegue-cumplimiento` (gestionada por el usuario)

**Creada**: 2026-11-27

**Estado**: Borrador

**Input**: Descripción del usuario: "Mini-sprint 009-despliegue-cumplimiento: dejar Motorix desplegado en servicios gratuitos para una revisión académica el lunes 30 de noviembre de 2026, con textos legales propios y datos ficticios realistas. Base de datos en TiDB Cloud Starter, API en un Web Service gratuito de Render y cliente Flutter web como Static Site de Render, sin gastar dinero. Debe resolver los hallazgos de la auditoría de despliegue: enmienda de la constitución, base de datos con TLS, zona horaria, pool y migraciones compatibles; API con CORS, proxy, límite de intentos, salud y validación del secreto; script de datos de demostración; textos legales como versión 2 de los términos; cliente web con exportación e impresión; guía de despliegue, pruebas de humo y evidencia. Orden de trabajo por riesgo: migraciones en TiDB, código, textos legales, despliegue, datos y evidencia."

## Aclaraciones

### Sesión 2026-11-27

- P: Los guiones de escenarios existentes escriben datos y exigen `motorix_test`; ¿contra qué se ejecutan las pruebas de humo? → R: **Los guiones corren solo en local contra `motorix_test`.** En la dirección pública se ejecutan únicamente comprobaciones nuevas de solo lectura. Esto sustituye la petición original de usar los guiones contra la dirección pública.
- P: Los clientes del taller no tienen cuenta; ¿dónde leen el aviso de privacidad? → R: **En una página estática pública publicada junto al cliente web, con enlace desde la pantalla de acceso.** El texto queda en dos lugares y una prueba comprueba que coinciden.
- Supuestos aceptados por el usuario: 10 intentos fallidos en 15 minutos; `JWT_SECRET` de al menos 32 caracteres; contraseñas de demostración de al menos 12 caracteres; versión 2 de los términos publicada directamente en la base nueva; y scripts de base de datos que funcionan en un clon limpio.

## Alcance de esta especificación

Este mini-sprint publica lo construido en los sprints 1 a 7 y cubre lo necesario para que la revisión académica pueda usarlo en línea. No agrega funciones de negocio.

### Hechos verificados en la auditoría de despliegue

| Hecho actual | Qué hace esta feature con él |
|---|---|
| La conexión a la base de datos no admite TLS, ni en el servidor, ni en los scripts, ni en las pruebas | Se vuelve configurable (US1) |
| Las migraciones 016, 017 y 020 agregan una columna y su restricción en una sola sentencia; es probable que la base en la nube las rechace (inferencia sin probar) | Variante compatible sin editar las originales (US1) |
| Los scripts de base de datos no encuentran sus dependencias en un clon limpio y toman en silencio la configuración local del servidor | Funcionan desde un clon limpio y no mezclan entornos (US1) |
| «Hoy» y «ahora» dependen de la zona horaria de la máquina que ejecuta el servidor y la base | Zona horaria fija de Ciudad de México (US1) |
| La API no admite un cliente web de otro origen, no limita intentos y su estado de salud responde correcto aunque la base falle | Se corrige (US2) |
| El cliente compila para web, pero exportar CSV e imprimir ticket dependen de funciones de escritorio | Funcionan en web o se desactivan con aviso (US3) |
| Los términos vigentes sembrados son una plantilla (versión 1) | Versión 2 con textos propios (US4) |
| La carga estándar de datos de ejemplo incluye cuentas con contraseñas publicadas en el repositorio | No se usa en producción; hay un script propio de demostración (US6) |
| El cliente no tiene pantalla para cambiar la contraseña | Deuda documentada; las contraseñas de demostración se asignan por script |
| Los guiones de escenarios existentes están pensados para un servidor local sobre `motorix_test`, escriben datos y usan las cuentas de ejemplo | Siguen siendo locales; la dirección pública tiene comprobaciones propias de solo lectura (US5) |
| Algunas consultas del sistema también escriben: el panel de control y los pagos de una orden actualizan cobros vencidos, y consultar un ticket puede emitirlo; un inicio de sesión fallido queda en la bitácora | Las comprobaciones de solo lectura las evitan (FR-037) |
| Los textos legales solo se pueden leer con una sesión iniciada | Página pública del aviso (US4) |

### Restricciones técnicas acordadas (no se reabren)

- Base de datos: TiDB Cloud Starter, compatible con MySQL, puerto 4000, TLS obligatorio, región AWS `us-west-2`.
- API: Web Service gratuito de Render. Cliente: Flutter web como Static Site de Render. Costo total: cero.
- Variables de configuración: `DB_SSL`, `TZ` con valor `America/Mexico_City`, `CORS_ORIGIN`, `NODE_VERSION`, `JWT_SECRET` y, al compilar el cliente, `API_BASE_URL`.
- Pool de conexiones: `maxIdle` 2 e `idleTimeout` 240000 milisegundos.
- Cliente web: separación por plataforma mediante importación condicional (`dart.library.io` / `dart.library.js_interop`) y `package:web`.
- Los pagos digitales quedan en modo simulado y se presentan como demostración.

### Restricciones de trabajo

- El agente no ejecuta `git add`, `commit` ni `push`, y no crea ramas: lo hace el usuario.
- Las pruebas corren solo contra `motorix_test`; la única excepción son las comprobaciones de solo lectura sobre la dirección pública (FR-037). Las migraciones y los datos sobre `motorix` (local o en la nube) los ejecuta únicamente el usuario, con respaldo previo. Un respaldo es una exportación del contenido a un archivo fuera del repositorio, comprobada; contar filas no es un respaldo. Una base recién creada y vacía no requiere exportación.
- Ninguna contraseña, secreto ni cadena de conexión se escribe en archivos del repositorio ni en la conversación.

## Escenarios de usuario y pruebas *(obligatorio)*

> El número de prioridad refleja el orden de trabajo por riesgo. Las seis historias son obligatorias para la revisión. La única reducción permitida es la de la historia 3 (FR-021).

### Historia de usuario 1 - Base de datos en la nube lista (Prioridad: P1)

Como responsable del despliegue, quiero que el esquema completo se pueda crear en la base de datos en la nube sin romper la instalación local, para tener una base confiable sobre la cual publicar el sistema.

**Por qué esta prioridad**: es el mayor riesgo desconocido; si el esquema no se puede crear, nada más funciona.

**Prueba independiente**: aplicar las migraciones desde un clon limpio sobre una base `motorix_test` vacía, en la nube y en MySQL local, y comparar el resultado.

**Escenarios de aceptación**:

1. **Dado** una base vacía en la nube y la conexión cifrada activada, **Cuando** se aplican las migraciones, **Entonces** las 23 quedan aplicadas y registradas por su nombre.
2. **Dado** una base vacía en MySQL local sin cifrado, **Cuando** se aplican las migraciones, **Entonces** terminan igual que antes de este cambio.
3. **Dado** una base ya migrada, **Cuando** se vuelven a aplicar las migraciones, **Entonces** no se ejecuta ninguna y no hay errores.
4. **Dado** una conexión sin cifrado hacia un servidor que lo exige, **Cuando** se intenta conectar, **Entonces** falla con un mensaje claro que no revela credenciales.
5. **Dado** un servidor alojado fuera de México, **Cuando** se registra un hecho a las 19:00 de Ciudad de México, **Entonces** aparece con ese mismo día en citas, avisos, panel y reportes.

---

### Historia de usuario 2 - API preparada para internet (Prioridad: P2)

Como responsable del despliegue, quiero que la API publicada acepte solo al cliente autorizado, frene los intentos repetidos y avise cuando no puede trabajar, para exponerla en internet con un riesgo aceptable.

**Por qué esta prioridad**: sin permiso de origen el cliente web no funciona, y sin límite de intentos las cuentas quedan expuestas.

**Prueba independiente**: ejecutar las pruebas del servidor con la configuración de producción simulada contra `motorix_test`.

**Escenarios de aceptación**:

1. **Dado** un origen autorizado, **Cuando** el cliente web hace una petición, **Entonces** la API la permite y el cliente puede leer el nombre del archivo exportado.
2. **Dado** un origen no autorizado, **Cuando** un navegador hace una petición desde él, **Entonces** el navegador no recibe permiso.
3. **Dado** un origen que alcanzó el máximo de intentos fallidos, **Cuando** vuelve a intentar iniciar sesión o cambiar la contraseña, **Entonces** recibe un rechazo con un mensaje en español que indica esperar.
4. **Dado** otro origen sin intentos fallidos, **Cuando** inicia sesión correctamente, **Entonces** no se ve afectado.
5. **Dado** que la base de datos no responde, **Cuando** se consulta la salud del servicio, **Entonces** se informa como no disponible (código 503).
6. **Dado** un secreto de sesión ausente o débil, **Cuando** se arranca el servidor, **Entonces** no arranca y explica qué falta, sin mostrar el valor.

---

### Historia de usuario 3 - Cliente en el navegador (Prioridad: P3)

Como personal del taller, quiero usar Motorix desde el navegador, incluidas la exportación de reportes y la impresión del ticket, para trabajar sin instalar nada.

**Por qué esta prioridad**: es la cara visible de la revisión y depende de las historias 1 y 2.

**Prueba independiente**: compilar el cliente web apuntando a una API de prueba, abrirlo en un navegador, exportar cada reporte e imprimir un ticket.

**Escenarios de aceptación**:

1. **Dado** un cliente compilado con la dirección pública de la API, **Cuando** se inicia sesión, **Entonces** todas las peticiones van a esa dirección.
2. **Dado** un reporte con datos en la versión web, **Cuando** se exporta a CSV, **Entonces** el navegador descarga el archivo con acentos legibles y se muestra «Archivo descargado».
3. **Dado** un ticket en la versión web, **Cuando** se pide imprimirlo, **Entonces** se abre una vista imprimible con el mismo contenido que en escritorio.
4. **Dado** que la impresión o la exportación no se pudieron habilitar a tiempo, **Cuando** se usa la versión web, **Entonces** la acción aparece desactivada con un aviso claro y no produce errores.
5. **Dado** el cliente de escritorio, **Cuando** se exporta o imprime, **Entonces** se comporta igual que antes.

---

### Historia de usuario 4 - Textos legales propios (Prioridad: P4)

Como persona usuaria del sistema, quiero leer y aceptar unos términos y un aviso de privacidad que describan lo que Motorix realmente hace, para saber cómo se tratan los datos.

**Por qué esta prioridad**: es el requisito de cumplimiento de la revisión y no depende de la infraestructura.

**Prueba independiente**: publicar los textos en `motorix_test`, abrir la página pública del aviso sin iniciar sesión, revisar la lista de elementos legales y la tabla que relaciona cada afirmación con el comportamiento del sistema.

**Escenarios de aceptación**:

1. **Dado** que la versión 2 está publicada, **Cuando** una cuenta inicia sesión sin haberla aceptado, **Entonces** debe aceptarla antes de usar el sistema.
2. **Dado** el aviso integral, **Cuando** se revisa contra la lista de elementos tomada del texto oficial vigente, **Entonces** no falta ninguno.
3. **Dado** cualquier afirmación técnica de los textos, **Cuando** se contrasta con el sistema desplegado, **Entonces** corresponde a un comportamiento que existe.
4. **Dado** un plazo de derechos ARCO escrito en el aviso, **Cuando** se revisa la evidencia, **Entonces** tiene la referencia al artículo del texto oficial y la fecha de consulta.
5. **Dado** una persona sin cuenta en la pantalla de acceso del sistema publicado, **Cuando** sigue el enlace del aviso de privacidad, **Entonces** lee el aviso integral y el simplificado sin iniciar sesión.
6. **Dado** que el texto de la página pública difiere del aviso de la versión 2, **Cuando** se ejecutan las pruebas, **Entonces** fallan e indican la diferencia.

---

### Historia de usuario 5 - Sistema publicado y comprobado (Prioridad: P5)

Como evaluador académico, quiero abrir una dirección pública y usar el sistema, para revisarlo sin instalar nada.

**Por qué esta prioridad**: es el entregable de la revisión; integra las historias anteriores.

**Prueba independiente**: ejecutar los guiones de escenarios en local contra `motorix_test`, seguir la guía desde cero, abrir la dirección pública y ejecutar las comprobaciones de solo lectura.

**Escenarios de aceptación**:

1. **Dado** la guía de despliegue, **Cuando** el usuario la sigue paso a paso, **Entonces** quedan publicados la base, la API y el cliente sin pasos no documentados y sin costo.
2. **Dado** el servicio suspendido por inactividad, **Cuando** el evaluador abre la dirección pública, **Entonces** puede iniciar sesión en menos de 2 minutos.
3. **Dado** el sistema publicado, **Cuando** se ejecutan las comprobaciones de solo lectura, **Entonces** todas pasan, el contenido de cada tabla es idéntico antes y después y el resultado queda como evidencia sin secretos.
4. **Dado** el código final del mini-sprint y una base local `motorix_test`, **Cuando** se ejecutan los guiones de escenarios existentes, **Entonces** todas sus verificaciones pasan.

---

### Historia de usuario 6 - Datos de demostración (Prioridad: P6)

Como responsable del despliegue, quiero cargar datos ficticios realistas con tres cuentas protegidas por contraseñas propias, para mostrar todas las funciones sin exponer datos personales ni contraseñas conocidas.

**Por qué esta prioridad**: va al final porque necesita el esquema, los textos y el servicio listos; aun así es indispensable para la revisión.

**Prueba independiente**: ejecutar el script dos veces sobre `motorix_test` y comparar conteos y contenido.

**Escenarios de aceptación**:

1. **Dado** una base recién migrada y las tres contraseñas en variables de entorno, **Cuando** se ejecuta el script, **Entonces** se crean catálogos, configuración, cuentas, datos ficticios y la versión 2 de los términos.
2. **Dado** una base ya cargada, **Cuando** se ejecuta otra vez, **Entonces** no se duplica ningún registro.
3. **Dado** una contraseña ausente, débil, repetida entre cuentas o igual a una de las publicadas en el repositorio, **Cuando** se ejecuta el script, **Entonces** se detiene sin escribir nada.
4. **Dado** los datos cargados, **Cuando** el evaluador recorre el sistema el día de la revisión, **Entonces** cada sección muestra información, hay citas para ese día y existe al menos un aviso de cada tipo.

### Casos límite

- Una migración falla a la mitad en la base en la nube: se informa cuál, no queda registrada como aplicada y la guía explica cómo recuperarse.
- La base en la nube acepta una restricción pero no la hace cumplir: se comprueba y se documenta cuáles quedan protegidas solo por las validaciones del sistema.
- La instalación local de MySQL no reconoce nombres de zona horaria: la conexión debe funcionar de todos modos con la hora de Ciudad de México.
- La base cierra conexiones inactivas: la primera petición después de una pausa larga responde sin error.
- La base no está disponible (por ejemplo, por agotar la cuota gratuita): la salud responde 503 y el proveedor puede dejar de enviar tráfico a toda la API; la guía lo advierte.
- El servicio gratuito se suspende o reinicia: los contadores de intentos se pierden; se documenta.
- No se configuró ningún origen autorizado: ningún navegador de otro origen recibe permiso y el cliente de escritorio sigue funcionando.
- Un secreto de sesión local que hoy funciona deja de cumplir la regla nueva: el mensaje de arranque explica cómo corregirlo.
- El cliente se compila sin la dirección pública: la publicación debe detectarlo antes de dar el despliegue por bueno.
- El navegador bloquea la ventana de impresión: se muestra un aviso y la sesión continúa.
- Se recarga la página web: la sesión se cierra y se vuelve a pedir el acceso (comportamiento aceptado como deuda).
- Ya existe una versión 2 de los términos con otro contenido: no se sobrescribe; se informa y se detiene la publicación.
- Un titular pide cancelar sus datos y el sistema no tiene borrado: el aviso describe la atención por el responsable sin prometer funciones que no existen.
- El navegador descarga recursos del cliente web desde servidores de terceros: el aviso lo menciona o el despliegue lo evita.
- La revisión ocurre en una fecha distinta a la de la carga: los datos se generan respecto de una fecha de referencia indicada.
- No se puede crear el usuario dedicado en la base de la nube: el despliegue se detiene en ese paso; la aplicación, los scripts y las pruebas no usan la cuenta administradora.
- Hay que borrar o recrear una base `motorix` con datos: antes se exporta a un archivo fuera del repositorio y se comprueba; si la exportación falla, no se borra.
- Se publica desde el sistema una versión posterior a la 2: la página pública indica a qué versión corresponde y la guía advierte que debe actualizarse.
- Las cuentas aún no aceptan la versión 2: las comprobaciones de solo lectura no la aceptan por ellas y tratan el aviso de aceptación pendiente como el resultado esperado.
- Un guion de escenarios existente choca con una regla nueva (límite de intentos o secreto mínimo): se ajusta la configuración de la corrida sin debilitar los valores de producción, y la causa queda en la evidencia.

## Requisitos *(obligatorio)*

### Requisitos funcionales

#### Constitución y dependencias (antes de implementar)

- **FR-001**: La constitución DEBE enmendarse para permitir MySQL o una base compatible como TiDB, con versión, fecha y reporte de impacto según su sección de gobernanza, mediante un solo texto aprobado por el equipo ([contracts/enmienda-constitucion.md](./contracts/enmienda-constitucion.md)) que distinga lo ya aprobado de lo nuevo. Además del motor, cubre el alojamiento para el despliegue, los datos iniciales definidos con scripts que no son SQL, las variantes de migraciones, el cifrado de la conexión y la prohibición de la cuenta administradora. Las pruebas y el desarrollo local siguen siendo válidos.
- **FR-002**: Los documentos que hoy afirman que la base es solo local o que Motorix es solo de escritorio (contexto del proyecto, reglas y README) DEBEN actualizarse para no contradecir la enmienda.
- **FR-003**: Cada dependencia nueva DEBE justificarse por escrito antes de agregarse: qué necesidad cubre, por qué no se resuelve con pocas líneas propias y que es gratuita.

#### Base de datos (US1)

- **FR-004**: El servidor, los scripts de base de datos y las pruebas DEBEN poder conectarse con cifrado verificando el certificado del servidor, activado por `DB_SSL`; sin esa variable, el comportamiento local no cambia.
- **FR-005**: El proceso del servidor y cada conexión a la base DEBEN operar con la hora de Ciudad de México, de modo que ambos coincidan.
- **FR-006**: El grupo de conexiones DEBE descartar las conexiones inactivas antes de que el proveedor las cierre, con los valores acordados.
- **FR-007**: Las migraciones 016, 017 y 020 DEBEN tener una variante compatible con la base en la nube que separe cada columna de su restricción, sin editar los scripts originales y con un esquema equivalente. La equivalencia DEBE comprobarse con una comparación normalizada que falle ante cualquier diferencia no declarada como aceptada.
- **FR-008**: Cada migración aplicada, original o variante, DEBE quedar registrada una sola vez en `schema_migrations` con el nombre de la migración original.
- **FR-009**: Los scripts de base de datos DEBEN funcionar desde un clon limpio siguiendo la guía, mostrar a qué base se conectan (sin credenciales) y permitir usarlos sin que tomen la configuración local del servidor.
- **FR-010**: La compatibilidad con la base en la nube DEBE comprobarse sobre `motorix_test`: las 23 migraciones, el cumplimiento de llaves foráneas y restricciones, los flujos principales y las consultas de productividad y de adopción de precios.

#### API (US2)

- **FR-011**: La API DEBE permitir peticiones de navegador solo desde los orígenes indicados en `CORS_ORIGIN` y exponer la cabecera `Content-Disposition`.
- **FR-012**: Detrás del proxy del proveedor, la API DEBE identificar el origen real de cada petición sin aceptar un origen falsificado por quien la envía.
- **FR-013**: El inicio de sesión y el cambio de contraseña DEBEN rechazar nuevos intentos tras 10 intentos fallidos en 15 minutos desde un mismo origen, con un mensaje en español; los intentos correctos no cuentan.
- **FR-014**: Los intentos rechazados por el límite no DEBEN revelar si la cuenta existe ni agregar entradas sin control a la bitácora.
- **FR-015**: La consulta de salud DEBE responder 503 cuando la base falle y seguir respondiendo correcto cuando funcione.
- **FR-016**: El servidor DEBE negarse a arrancar si `JWT_SECRET` falta, tiene menos de 32 caracteres o es el valor de ejemplo.
- **FR-017**: La versión del entorno de ejecución del servidor DEBE quedar fija y documentada (`NODE_VERSION`), y las pruebas DEBEN pasar con ella o la diferencia con la versión local DEBE quedar documentada.

#### Cliente web (US3)

- **FR-018**: El cliente DEBE recibir la dirección de la API al compilar (`API_BASE_URL`); la publicación DEBE usar HTTPS y comprobar que no apunte a la dirección local.
- **FR-019**: En web, la exportación de cada reporte DEBE descargar el archivo con el nombre del servidor y mostrar «Archivo descargado».
- **FR-020**: En web, la impresión del ticket DEBE abrir una vista imprimible con el mismo contenido que en escritorio.
- **FR-021**: Si no alcanza el tiempo para FR-019 o FR-020, la acción afectada DEBE quedar desactivada en web con un aviso claro, y la reducción DEBE anotarse como deuda.
- **FR-022**: El cliente de escritorio DEBE conservar su comportamiento actual.

#### Textos legales (US4)

- **FR-023**: DEBEN redactarse con palabras propias, para un taller ficticio, unos términos y condiciones, un aviso de privacidad integral y un aviso simplificado, en español y con una nota visible de que son un ejemplo académico.
- **FR-024**: El aviso integral DEBE contener los elementos que exige la Ley Federal de Protección de Datos Personales en Posesión de los Particulares vigente, señalar como autoridad a la Secretaría Anticorrupción y Buen Gobierno y registrar la fuente oficial y la fecha de consulta.
- **FR-025**: El procedimiento de derechos ARCO y sus plazos DEBEN tomarse del texto oficial vigente; ningún plazo se escribe sin verificarlo. El procedimiento DEBE incluir los requisitos de la solicitud (artículo 28), la persona o área designada para tramitarla (artículo 29) y la gratuidad con sus únicas excepciones de costo (artículo 34).
- **FR-026**: Los textos DEBEN describir solo lo que el sistema hace: contraseña de al menos 8 caracteres con mayúscula, minúscula y número; datos alojados en servicios en la nube fuera de México; transmisión por HTTPS; y el límite de intentos solo si FR-013 quedó implementado. Una tabla DEBE relacionar cada afirmación técnica con su comprobación.
- **FR-027**: Los textos DEBEN publicarse como versión 2, exigir aceptación a todas las cuentas y no modificar versiones ni aceptaciones anteriores. En una base nueva, la versión publicada es directamente la 2.
- **FR-028**: Cada uno de los dos campos publicables (términos; aviso de privacidad, integral y simplificado juntos) DEBE caber en el límite actual de 20,000 caracteres.
- **FR-029**: El aviso de privacidad, integral y simplificado, DEBE poder leerse sin cuenta en una página estática pública publicada junto al cliente web, indicando su versión, con un enlace visible en la pantalla de acceso de la versión web. La página DEBE usar los colores, la tipografía y los espaciados reales de la aplicación (su tema actual); la diferencia entre ese tema y `docs/design-system.md` queda como deuda documentada. Una prueba automatizada DEBE fallar si su texto no coincide con el del aviso de la versión 2.

#### Datos de demostración (US6)

- **FR-030**: DEBE existir un script de demostración para el despliegue, separado de la carga estándar de datos de ejemplo, que esta no ejecute. En producción no se ejecuta la carga estándar.
- **FR-031**: El script DEBE crear la configuración, los catálogos y tres cuentas (`admin`, `recepcion`, `mecanico`) cuyas contraseñas se reciben solo por variables de entorno; DEBE exigir al menos 12 caracteres con mayúscula, minúscula y número, distintas entre sí y de las publicadas en el repositorio. Nunca las muestra.
- **FR-032**: El script DEBE crear datos ficticios coherentes: al menos 8 clientes con correos `@ejemplo.com`, 10 vehículos, 12 órdenes que cubran todos los estados, 10 cobros con los métodos disponibles, 10 refacciones (con existencia baja y sin precio entre ellas), 8 citas, mantenimientos y datos suficientes para los cinco reportes. Ningún dato personal real.
- **FR-033**: Las existencias DEBEN cuadrar con sus movimientos y ningún cobro DEBE exceder el total de su orden.
- **FR-034**: El script DEBE poder repetirse sin duplicar registros ni deshacer cambios hechos desde el sistema, salvo que las contraseñas de las tres cuentas se igualan a las variables de cada ejecución (es la forma de cambiarlas).
- **FR-035**: El script DEBE mostrar la base de destino sin credenciales, exigir confirmación explícita y no tomar la configuración local del servidor por su cuenta.

#### Despliegue y evidencia (US5)

- **FR-036**: DEBE existir una guía paso a paso con la creación de los tres servicios, las variables de cada uno (solo nombres y explicación), los comandos de construcción y arranque, la verificación de salud, el orden de ejecución, el respaldo previo y cómo volver atrás. DEBE explicar cómo recuperar una migración aplicada a medias, qué hace el proveedor cuando la salud responde 503 y qué hacer si se publica una versión posterior de los términos.
- **FR-037**: Las pruebas de humo DEBEN tener dos partes. En local, contra `motorix_test`, los guiones de escenarios de los bloques P1, P2 y P3 del Sprint 7. En la dirección pública, comprobaciones nuevas de solo lectura: salud, página del cliente y del aviso, permiso de origen, rechazo sin sesión, inicio de sesión correcto de las tres cuentas y consulta de la versión vigente de los términos. Estas comprobaciones NO DEBEN cambiar la base, lo que se verifica comparando el contenido de cada tabla antes y después: no aceptan términos, no provocan inicios de sesión fallidos y no consultan el panel de control, pagos ni tickets. Las contraseñas se reciben por variables de entorno.
- **FR-038**: La evidencia DEBE guardarse en `docs/evidencias/sprint-9-despliegue/`, sin contraseñas, secretos ni cadenas de conexión: migraciones, pruebas, límite de intentos (comprobado solo en local), guiones de escenarios locales, comprobaciones de solo lectura sobre la dirección pública, doble ejecución del script y capturas del sistema publicado.
- **FR-039**: La guía y la evidencia DEBEN declarar que los pagos digitales son una demostración simulada y no registran dinero real.
- **FR-040**: La deuda técnica de la sección «Fuera de alcance» DEBE quedar documentada con su riesgo.

#### Calidad

- **FR-041**: Cada cambio DEBE tener pruebas, y las existentes DEBEN seguir pasando: servidor (109 suites, 1329 pruebas) y cliente (351 pruebas).

### Entidades clave

- **Migración**: cambio numerado del esquema; puede tener una variante para la base en la nube y se registra una vez con el nombre original.
- **Versión de los términos**: número, texto de términos, texto del aviso y fecha de publicación; la vigente es la de número mayor.
- **Aceptación**: relación entre una cuenta y una versión de los términos.
- **Cuenta de demostración**: una de las tres cuentas con rol propio y contraseña definida fuera del repositorio.
- **Conjunto de demostración**: datos ficticios relacionados entre sí, identificables para poder repetir la carga sin duplicar.
- **Intentos fallidos**: conteo temporal por origen; no se conserva en la base de datos.
- **Página pública del aviso**: copia del aviso de la versión 2, legible sin cuenta, que indica su versión.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: El 30 de noviembre de 2026 el evaluador inicia sesión con las tres cuentas desde la dirección pública, cada una en menos de 2 minutos incluso tras una suspensión del servicio. El primer acceso se cronometra con el servicio suspendido, antes de cualquier otra comprobación; después el servicio se mantiene activo hasta terminar la revisión.
- **SC-002**: El 100 % de las 23 migraciones queda aplicado en una base nueva en la nube y en una local; una segunda ejecución aplica 0.
- **SC-003**: Dos ejecuciones consecutivas del script de demostración producen los mismos conteos por tipo de registro.
- **SC-004**: Hay 0 contraseñas, secretos o cadenas de conexión de la nube en el repositorio y en la evidencia, y 0 datos personales reales en los datos cargados.
- **SC-005**: Pasa el 100 % de los guiones de escenarios en local y el 100 % de las comprobaciones de solo lectura en la dirección pública, con 0 registros creados, borrados o modificados por estas últimas, comprobado por el contenido de cada tabla.
- **SC-006**: El intento número 11 tras 10 fallos en 15 minutos se rechaza, y otro origen puede seguir entrando.
- **SC-007**: Desde el navegador, los 5 reportes se descargan legibles y un ticket se puede imprimir; o cada acción pendiente muestra su aviso.
- **SC-008**: El 100 % de los elementos legales de la lista tiene su apartado en el aviso, y 0 afirmaciones técnicas quedan sin comprobación.
- **SC-009**: Pasan las 1329 pruebas existentes del servidor, las 351 del cliente y todas las nuevas.
- **SC-010**: El costo de los tres servicios es cero.
- **SC-011**: Una persona del equipo reproduce el despliegue siguiendo solo la guía.
- **SC-012**: Una persona sin cuenta llega al aviso de privacidad desde la pantalla de acceso en un solo paso, y su texto coincide al 100 % con el de la versión 2.

## Fuera de alcance (deuda documentada)

- Cabeceras de seguridad adicionales (Helmet).
- Transacción que impida que dos pagos simultáneos excedan el saldo.
- Pantalla para cambiar la contraseña.
- Textos de plantilla de `index.html` y `manifest.json`.
- Cobro digital real: queda simulado. La verificación del modo de pruebas del proveedor no se corrige ni se usa.
- Conservar la sesión al recargar la página y proteger el acceso directo a una sección por su dirección.
- Contadores de intentos que sobrevivan a reinicios del servicio.
- Actualización automática de la página pública del aviso al publicar una versión nueva.
- Ejecución de los guiones de escenarios contra la dirección pública.
- Alinear `docs/design-system.md` con el tema real de la aplicación (paleta y tipografía distintas).

## Supuestos

- La revisión usa un navegador de escritorio actualizado; no se adapta la interfaz a teléfonos.
- El usuario crea las cuentas en los proveedores, captura los secretos en sus paneles o en su terminal, ejecuta lo que toca `motorix` y publica los cambios en el repositorio; el despliegue depende de que lo haga a tiempo.
- El usuario habilita una base `motorix_test` en la nube para las comprobaciones de compatibilidad.
- Los proveedores conservan sus planes gratuitos y la cuota alcanza para la revisión.
- Ciudad de México no aplica horario de verano, por lo que un desfase fijo de −06:00 es equivalente donde no se admitan nombres de zona.
- Los valores de 10 intentos en 15 minutos, 32 caracteres para el secreto y 12 para las contraseñas de demostración fueron aceptados por el usuario.
- El enlace al aviso aparece en la versión web; la pantalla de acceso de escritorio no cambia (FR-022).
- Las contraseñas de ejemplo que ya aparecen en la documentación siguen valiendo solo para entornos locales.
- La aprobación de la enmienda de la constitución sigue su sección de gobernanza y la gestiona el equipo.
- Los textos legales son un ejercicio académico y no sustituyen asesoría legal.
- Plazo: se especifica el viernes 27 de noviembre y la revisión es el lunes 30 de noviembre de 2026.
