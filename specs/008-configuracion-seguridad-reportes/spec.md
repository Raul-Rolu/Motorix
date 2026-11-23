# Especificación de la feature: Configuración, seguridad y reportes

**Rama de la feature**: `008-configuracion-seguridad-reportes`

**Creada**: 2026-11-23

**Estado**: Borrador

**Input**: Descripción del usuario: "Usar `docs/sprints/sprint-7-reportes-configuracion.md` como único insumo de alcance (Sprint 7: configuración, seguridad y reportes). Generar la especificación en español conservando las prioridades P1, P2 y P3 y la línea de corte de la sección 3 del insumo. Tomar como ya acordadas las decisiones de la sección 10. Verificar en el código real los hechos de la sección 1 y ajustar la spec donde el código contradiga al insumo. Numerar la spec como la siguiente (008). La migración de este sprint será la 019 en adelante."

## Aclaraciones

### Sesión 2026-11-23

Decisiones de la sección 10 del insumo, aplicadas tal cual (no se reabren):

- **Prioridad de corte**: configuración y catálogo (P1), después seguridad y términos (P2), después reportes (P3).
- **Exportación (P3)**: CSV con codificación UTF-8 y marca BOM, sin dependencias nuevas.
- **Datos del taller en el ticket**: el ticket guarda una instantánea de nombre, dirección y teléfono al emitirse; los tickets anteriores sin instantánea usan los datos vigentes (limitación documentada).
- **Tipo de servicio en las líneas**: `order_services` agrega `service_type_id` opcional; las líneas existentes quedan sin tipo y no proponen próximo mantenimiento.
- **Margen sin precio de compra (P3)**: la línea se excluye del margen y se marca «sin costo»; nunca se calcula con costo 0.
- **Periodos (P3)**: rango libre de fechas con atajos «mes actual» y «mes anterior»; el corte usa la hora local del servidor.
- **Productividad por mecánico (P3)**: órdenes terminadas o entregadas en el periodo e importe de mano de obra de esas órdenes.
- **Rotación (P3)**: unidades salidas en el periodo entre la existencia actual; si la existencia es 0 se muestra «sin existencia» (simplificación documentada).
- **Reportes**: exclusivos de ADMIN.
- **Términos y condiciones**: la versión 1 es una plantilla en español incluida en el seed; el administrador publica versiones nuevas desde la aplicación; se acepta una vez por versión; los usuarios existentes, incluidos los sembrados, aceptan en su siguiente inicio de sesión.
- **Bitácora**: sin purga automática, paginada de 50 en 50, con filtros por fecha, usuario y acción; sin exportación.
- **Política de contraseñas**: mínimo 8 caracteres con mayúscula, minúscula y número; las cuentas sembradas ya la cumplen.
- **Inactividad**: 30 minutos para todos los roles, configurable en `settings`.
- **Orden detenida**: los 3 días del Sprint 6 pasan a ajuste en `settings`, con 3 como predeterminado.

Aclaraciones resueltas con el usuario en `/speckit.clarify` (2026-11-23):

- P: El insumo da por existentes `helmet` y el bloqueo temporal por intentos fallidos, pero el código no tiene ninguno; ¿qué se hace con ellos? → R: **No se agregan** en este sprint. La bitácora registra los inicios de sesión fallidos; el evento «bloqueo» no aplica porque no existe bloqueo. El bloqueo por intentos y `helmet` quedan como trabajo futuro documentado.
- P: El token dura 30 minutos fijos y no se renueva; ¿cómo se logra el cierre por inactividad configurable? → R: **El token se renueva con la actividad del usuario.** La vigencia del token es igual al ajuste de inactividad (30 minutos por defecto; límites de 5 a 120 minutos), el cliente solicita la renovación cuando el usuario actúa, y el backend sigue validando la expiración. La consulta periódica de avisos del Sprint 6 no cuenta como actividad ni renueva el token.
- P: Las órdenes y los mantenimientos no están enlazados y el ticket se arma al vuelo; ¿de dónde sale «Próximo servicio» y la propuesta del próximo mantenimiento? → R: **Se calcula desde la orden**: fecha = fecha de emisión del ticket (o de la propuesta) más los días del intervalo; kilometraje = kilometraje de la orden más los km del intervalo, usando entre los servicios con tipo e intervalo de la orden el más próximo en cada dimensión. El formulario de Mantenimientos ofrece «proponer desde una orden» del vehículo y el usuario puede corregir antes de guardar. No se agrega ninguna columna a `maintenance_plans`.

## Alcance de esta especificación

Este sprint agrega configuración, seguridad y reportes sobre lo construido en los sprints 1 a 6. Lo ya construido **no se reescribe**:

| Elemento existente | Qué hace esta feature con él |
|---|---|
| Datos del taller del ticket: constante `TALLER` en `server/services/ticket-service.js` (`Motorix`, `Av. Taller 123, Col. Centro`, `555-000-0000`) | Pasan a `settings`, con esa constante como valor de respaldo |
| Márgenes de próximo mantenimiento (`MARGEN_PROXIMO_DIAS = 30`, `MARGEN_PROXIMO_KM = 1000` en `maintenance-state.js`) y `DIAS_ORDEN_DETENIDA = 3` en `notification-service.js` | Se vuelven configurables solo para el centro de notificaciones; la lista de Mantenimientos y el panel de control no cambian |
| Ticket emitido bajo demanda con folio y contenido derivado al vuelo (`tickets` guarda solo folio y emisión) | Agrega instantánea de los datos del taller y la línea «Próximo servicio» solo en tickets nuevos |
| Política de contraseñas (`cumplePoliticaContrasena`, RN-17: 8 caracteres, mayúscula, minúscula y número) ya aplicada al crear usuarios y al cambiar contraseña | Se conserva; este sprint agrega pruebas explícitas, mensajes claros y registro en bitácora |
| `bcrypt`, JWT con `SESION_MINUTOS = 30` fijo, validación de usuario activo en cada petición | Se conservan; la vigencia pasa a ser configurable y renovable por actividad |
| Cambio de contraseña, alta y baja (desactivación) y cambio de rol de usuarios (`/api/users`, `/api/auth/change-password`) | Se conservan; se registran en la bitácora |
| Precios de refacciones (`/api/parts`, solo ADMIN edita) | Se conservan; los cambios de precio se registran en la bitácora |
| Centro de notificaciones (Sprint 6) | Consume los márgenes configurables; sus resultados no cambian si no hay configuración guardada |

## Escenarios de usuario y pruebas *(obligatorio)*

> Orden por bloque de entrega (sección 3 del insumo). Cada bloque deja el sistema funcionando y el sprint se puede cerrar después de cualquiera de ellos. Entre paréntesis, la historia equivalente del insumo.

### Historia de usuario 1 - Datos del taller editables (US1 del insumo) (Prioridad: P1)

Como administrador, quiero editar el nombre, la dirección y el teléfono del taller para que el ticket muestre datos correctos sin tocar el servidor.

**Por qué esta prioridad**: Es la base de la configuración (tabla `settings`) de la que dependen las historias 2 y 6; entrega valor por sí sola.

**Independiente**: Se prueba cambiando los datos en Configuración y generando un ticket nuevo, sin catálogo ni seguridad.

**Escenarios de aceptación**:

1. **Dado** un administrador en Configuración, **Cuando** cambia nombre, dirección y teléfono y guarda, **Entonces** el sistema confirma el cambio y los valores quedan guardados.
2. **Dado** datos del taller cambiados, **Cuando** se emite un ticket nuevo, **Entonces** muestra los datos nuevos y los guarda como instantánea del ticket.
3. **Dado** un ticket ya emitido con instantánea, **Cuando** el administrador cambia después los datos del taller, **Entonces** ese ticket sigue mostrando los datos con los que se emitió.
4. **Dado** un ticket emitido antes de este sprint (sin instantánea), **Cuando** se consulta, **Entonces** usa los datos vigentes (limitación documentada).
5. **Dado** un nombre vacío o campos que excedan su longitud máxima, **Cuando** se intenta guardar, **Entonces** el sistema lo rechaza con un mensaje claro y no guarda nada.
6. **Dado** un recepcionista o un mecánico, **Cuando** intenta consultar o editar la configuración, **Entonces** el backend responde 403.

---

### Historia de usuario 2 - Márgenes de mantenimiento y orden detenida (US2 del insumo) (Prioridad: P1)

Como administrador, quiero ajustar los márgenes de «Próximo» del mantenimiento (días y kilómetros) y los días para considerar una orden detenida, para adaptarlos a la operación del taller.

**Por qué esta prioridad**: Cumple RN-12 (intervalos configurables) y reemplaza las constantes del Sprint 6; se apoya en la historia 1.

**Independiente**: Se prueba cambiando los márgenes y verificando el centro de notificaciones con datos sembrados.

**Escenarios de aceptación**:

1. **Dado** márgenes cambiados (por ejemplo 15 días y 500 km), **Cuando** el centro de notificaciones se consulta, **Entonces** clasifica como próximos solo los mantenimientos dentro de esos márgenes.
2. **Dado** un valor de días de orden detenida distinto de 3, **Cuando** se consulta el centro, **Entonces** las órdenes detenidas se calculan con ese valor.
3. **Dado** que no hay valores guardados, **Cuando** se consulta el centro, **Entonces** se usan 30 días, 1,000 km y 3 días y los resultados coinciden con los del Sprint 6.
4. **Dado** un valor fuera de límites (cero, negativo, no entero o por encima del máximo), **Cuando** se intenta guardar, **Entonces** el sistema lo rechaza con un mensaje claro.
5. **Dado** márgenes cambiados, **Cuando** se consultan la lista de Mantenimientos y el panel de control, **Entonces** su comportamiento no cambia.

---

### Historia de usuario 3 - Catálogo de tipos de servicio con intervalo (US3 del insumo) (Prioridad: P1)

Como administrador, quiero mantener un catálogo de tipos de servicio con su intervalo en días y en kilómetros para que el próximo mantenimiento se proponga sin asumir intervalos universales.

**Por qué esta prioridad**: Cumple RN-12 y es el insumo de la historia 4 y de la propuesta de mantenimiento.

**Independiente**: Se prueba creando, editando y desactivando tipos y asignándolos a líneas de servicio de una orden.

**Escenarios de aceptación**:

1. **Dado** el catálogo, **Cuando** el administrador crea el tipo «Cambio de aceite» con 180 días y 5,000 km, **Entonces** queda disponible para elegirlo en las líneas de servicio.
2. **Dado** un tipo con al menos un intervalo (días, km o ambos), **Cuando** se edita, **Entonces** los cambios aplican a propuestas futuras y no alteran tickets ni mantenimientos ya registrados.
3. **Dado** un tipo sin días ni kilómetros, **Cuando** se intenta guardar, **Entonces** se rechaza con un mensaje claro (se requiere al menos un intervalo).
4. **Dado** un tipo usado en órdenes, **Cuando** el administrador lo desactiva, **Entonces** deja de ofrecerse en líneas nuevas, se conserva en las líneas existentes y no se puede borrar.
5. **Dado** un nombre repetido (sin distinguir mayúsculas), **Cuando** se intenta crear, **Entonces** se rechaza.
6. **Dado** una línea de servicio de una orden, **Cuando** el usuario le asigna un tipo activo, **Entonces** la línea guarda `service_type_id`; las líneas anteriores quedan sin tipo y no proponen mantenimiento.
7. **Dado** una orden con líneas con tipo e intervalo, **Cuando** el administrador o el mecánico (los roles que registran mantenimientos; el mecánico solo sobre órdenes asignadas a él) abre el formulario de Mantenimientos y elige «proponer desde una orden» del vehículo, **Entonces** se proponen fecha y kilometraje (ver «Aclaraciones») y el usuario puede corregirlos antes de guardar.
8. **Dado** un recepcionista o un mecánico, **Cuando** intenta crear, editar o desactivar tipos, **Entonces** el backend responde 403; sí pueden consultar la lista de tipos activos y elegir uno en una línea de servicio de una orden que ya podían editar.

---

### Historia de usuario 4 - Próximo servicio en el ticket (US8 del insumo) (Prioridad: P1)

Como cliente, quiero que mi ticket indique cuándo toca mi próximo servicio para recordarlo sin que nadie me escriba.

**Por qué esta prioridad**: Es el beneficio visible para el cliente de las historias 1 y 3.

**Independiente**: Se prueba con una orden con servicio tipificado y otra sin tipo, emitiendo el ticket de cada una.

**Escenarios de aceptación**:

1. **Dado** una orden con un servicio de tipo «Cambio de aceite» (180 días y 5,000 km), **Cuando** se emite el ticket, **Entonces** muestra «Próximo servicio» con la fecha (emisión más 180 días) y el kilometraje (kilometraje de la orden más 5,000 km).
2. **Dado** un tipo con solo intervalo en días (o solo en km), **Cuando** se emite el ticket, **Entonces** muestra únicamente el dato calculable.
3. **Dado** varias líneas con tipo e intervalo, **Cuando** se emite el ticket, **Entonces** la línea muestra la fecha más cercana y el kilometraje menor de entre ellas.
4. **Dado** una orden sin tipos o con tipos sin intervalo, **Cuando** se emite el ticket, **Entonces** no muestra la línea de próximo servicio.
5. **Dado** un ticket emitido antes de este sprint, **Cuando** se consulta, **Entonces** no cambia (sin línea de próximo servicio).
6. **Dado** el ticket impreso o en pantalla, **Cuando** se muestra, **Entonces** el resto del contenido (folio, importes, refacciones, pagos) sigue idéntico al del Sprint 6.

---

### Historia de usuario 5 - Bitácora de acciones sensibles (US10 del insumo, parte de seguridad) (Prioridad: P2)

Como administrador, quiero una bitácora de acciones sensibles para saber quién hizo qué y cuándo, y detectar usos indebidos.

**Por qué esta prioridad**: Primer bloque de seguridad; no depende de P3 y sus eventos nacen en los módulos de P1.

**Independiente**: Se prueba ejecutando cada acción auditada y consultando la bitácora como ADMIN.

**Escenarios de aceptación**:

1. **Dado** un inicio de sesión con credenciales inválidas, **Cuando** ocurre, **Entonces** se registra el evento con el usuario o correo intentado y la fecha, sin guardar la contraseña.
2. **Dado** el alta, la baja (desactivación) o el cambio de rol de un usuario, **Cuando** el administrador lo realiza, **Entonces** se registra quién, a quién y cuándo.
3. **Dado** un cambio de configuración, de precio de venta o de precio de compra de una refacción, o la publicación de una versión de términos, **Cuando** se guarda, **Entonces** se registra quién, qué entidad y cuándo, sin guardar valores reservados al rol (el precio de compra se registra sin su importe).
4. **Dado** la bitácora, **Cuando** el administrador la consulta, **Entonces** la ve paginada de 50 en 50, con filtros por rango de fechas, usuario y acción.
5. **Dado** cualquier usuario, **Cuando** intenta editar o borrar una entrada de la bitácora, **Entonces** no existe operación para ello en la aplicación ni en la API.
6. **Dado** un recepcionista o un mecánico, **Cuando** intenta consultar la bitácora, **Entonces** el backend responde 403.
7. **Dado** cualquier entrada, **Cuando** se inspecciona, **Entonces** no contiene contraseñas, hashes, tokens ni datos de tarjeta.

---

### Historia de usuario 6 - Contraseñas, sesión por inactividad y respuestas sin datos reservados (US10 del insumo, parte de protección) (Prioridad: P2)

Como administrador, quiero que la sesión se cierre por inactividad, que las contraseñas cumplan una política y que las respuestas de la API no expongan datos reservados, para proteger los datos del taller y de sus clientes.

**Por qué esta prioridad**: Completa US10; depende del ajuste de inactividad de la historia 2 pero tiene valor por sí sola con el predeterminado.

**Independiente**: Se prueba con las cuentas de demostración: cambio de contraseña, inactividad y revisión de respuestas por endpoint.

**Escenarios de aceptación**:

1. **Dado** una contraseña nueva que no cumple la política (menos de 8 caracteres, o sin mayúscula, minúscula o número), **Cuando** se crea un usuario o se cambia la contraseña, **Entonces** el sistema la rechaza con un mensaje que explica la regla.
2. **Dado** una contraseña válida, **Cuando** se guarda, **Entonces** solo se almacena su hash.
3. **Dado** un usuario sin actividad durante el tiempo configurado (30 minutos por defecto), **Cuando** transcurre, **Entonces** el cliente cierra la sesión y pide iniciar sesión de nuevo.
4. **Dado** un usuario que actúa en la aplicación, **Cuando** pasa la actividad, **Entonces** el cliente renueva el token y la sesión no se cierra mientras haya actividad.
5. **Dado** la consulta periódica de notificaciones, **Cuando** se ejecuta, **Entonces** no cuenta como actividad ni renueva el token.
6. **Dado** un token vencido o de un usuario desactivado, **Cuando** llega al backend, **Entonces** se rechaza con 401 aunque el cliente no haya cerrado la sesión.
7. **Dado** el ajuste de inactividad cambiado por el administrador, **Cuando** un usuario inicia sesión después, **Entonces** el token nuevo usa esa vigencia.
8. **Dado** cualquier endpoint de usuarios, refacciones, órdenes, pagos y tickets, **Cuando** responde, **Entonces** no incluye hash de contraseña, token (salvo el login y la renovación) ni precios reservados al rol (precio de compra solo para ADMIN).
9. **Dado** texto de inyección en los campos de búsqueda, **Cuando** se consulta, **Entonces** se trata como texto literal y no altera la consulta ni genera errores internos.

---

### Historia de usuario 7 - Términos y condiciones y aviso de privacidad (US9 del insumo) (Prioridad: P2)

Como usuario del taller, quiero leer y aceptar los términos y condiciones y el aviso de privacidad al ingresar al sistema para conocer las reglas de uso y cómo se protege la información de los clientes.

**Por qué esta prioridad**: Segundo bloque de P2; se apoya en la bitácora (registro de publicaciones) pero se puede entregar por separado.

**Independiente**: Se prueba iniciando sesión con una cuenta sembrada, aceptando o rechazando, y publicando una versión nueva.

**Escenarios de aceptación**:

1. **Dado** un usuario que no ha aceptado la versión vigente, **Cuando** inicia sesión, **Entonces** ve los términos y el aviso de privacidad antes de usar el sistema.
2. **Dado** la pantalla de aceptación, **Cuando** el usuario acepta, **Entonces** el sistema guarda usuario, versión y fecha, y lo deja entrar.
3. **Dado** la pantalla de aceptación, **Cuando** el usuario rechaza, **Entonces** se cierra la sesión y no accede.
4. **Dado** un usuario con la versión vigente aceptada, **Cuando** vuelve a iniciar sesión, **Entonces** no se le pide de nuevo.
5. **Dado** una versión nueva publicada por el administrador (versión y texto), **Cuando** un usuario inicia sesión después, **Entonces** se le pide aceptar la nueva.
6. **Dado** un usuario sin aceptación vigente, **Cuando** llama a la API sin pasar por la pantalla, **Entonces** el backend rechaza sus operaciones, excepto ver los términos, aceptar, renovar la sesión y cerrar sesión.
7. **Dado** el administrador, **Cuando** consulta los términos, **Entonces** ve la versión vigente y la lista de aceptaciones (usuario, versión, fecha).
8. **Dado** el texto de la versión 1, **Cuando** se lee, **Entonces** describe el uso permitido, la confidencialidad de los datos de clientes y vehículos, la responsabilidad de las cuentas personales y el aviso de privacidad, y advierte que es una plantilla a revisar por el taller.
9. **Dado** un recepcionista o un mecánico, **Cuando** intenta publicar una versión, **Entonces** el backend responde 403.

---

### Historia de usuario 8 - Ingresos por periodo (US4 del insumo) (Prioridad: P3)

Como administrador, quiero consultar los ingresos por periodo para conocer cómo avanza el taller.

**Por qué esta prioridad**: Primer reporte; solo se entrega si P1 y P2 están completos, verificados y commiteados.

**Independiente**: Se prueba con pagos sembrados en distintos meses.

**Escenarios de aceptación**:

1. **Dado** pagos confirmados, **Cuando** el administrador elige un rango de fechas (o «mes actual» o «mes anterior»), **Entonces** ve los ingresos del rango, desglosados por día o por mes y por método de pago.
2. **Dado** el reporte, **Cuando** se comparan sus importes con los pagos que lo originan, **Entonces** coinciden al centavo (centavos enteros).
3. **Dado** pagos pendientes, vencidos o desfasados, **Cuando** se calcula el reporte, **Entonces** no se cuentan como ingreso.
4. **Dado** un rango sin pagos, **Cuando** se consulta, **Entonces** se muestra un estado vacío claro.
5. **Dado** un rango inválido (fecha final anterior a la inicial) o demasiado amplio, **Cuando** se consulta, **Entonces** se rechaza con un mensaje claro.
6. **Dado** un recepcionista o un mecánico, **Cuando** intenta consultar el reporte, **Entonces** el backend responde 403.

---

### Historia de usuario 9 - Servicios frecuentes y productividad (US5 del insumo) (Prioridad: P3)

Como administrador, quiero ver los servicios más frecuentes y la productividad por mecánico para tomar decisiones de operación.

**Por qué esta prioridad**: Segundo reporte del bloque P3; independiente de los demás reportes.

**Independiente**: Se prueba con órdenes terminadas y entregadas de varios mecánicos y tipos.

**Escenarios de aceptación**:

1. **Dado** un rango de fechas, **Cuando** se consulta servicios frecuentes, **Entonces** se listan por tipo de servicio (y las líneas sin tipo agrupadas como «Sin tipo») con cantidad e importe, ordenados por frecuencia.
2. **Dado** un rango de fechas, **Cuando** se consulta productividad, **Entonces** cada mecánico muestra el número de órdenes terminadas o entregadas en el periodo y el importe de mano de obra de esas órdenes.
3. **Dado** órdenes sin mecánico asignado, **Cuando** se calcula, **Entonces** aparecen agrupadas como «Sin asignar».
4. **Dado** órdenes canceladas, **Cuando** se calcula, **Entonces** no se cuentan.
5. **Dado** un recepcionista o un mecánico, **Cuando** intenta consultar, **Entonces** el backend responde 403.

---

### Historia de usuario 10 - Rentabilidad e inventario (US6 del insumo) (Prioridad: P3)

Como administrador, quiero ver el costo, el precio y el margen de las refacciones usadas y la rotación del inventario para controlar la rentabilidad.

**Por qué esta prioridad**: Tercer reporte del bloque P3; usa los precios de compra y venta de los Sprints 5 y su complemento.

**Independiente**: Se prueba con refacciones usadas en órdenes del periodo, algunas sin precio de compra.

**Escenarios de aceptación**:

1. **Dado** refacciones usadas en el periodo, **Cuando** se consulta el reporte, **Entonces** cada una muestra costo, precio de venta, cantidad y margen, en centavos enteros.
2. **Dado** una refacción sin precio de compra, **Cuando** se calcula el margen, **Entonces** la línea se excluye del cálculo y se marca «sin costo»; nunca se usa costo 0.
3. **Dado** una existencia actual de 0, **Cuando** se muestra la rotación, **Entonces** aparece «sin existencia».
4. **Dado** una existencia mayor que 0, **Cuando** se muestra la rotación, **Entonces** es unidades salidas en el periodo entre la existencia actual.
5. **Dado** el reporte, **Cuando** lo consulta el administrador, **Entonces** ve el precio de compra; ningún otro rol puede consultarlo (403).
6. **Dado** un reporte con muchos datos, **Cuando** se consulta, **Entonces** responde en un tiempo razonable y pagina o limita el rango.

---

### Historia de usuario 11 - Exportar reportes (US7 del insumo) (Prioridad: P3)

Como administrador, quiero exportar cada reporte para compartirlo o archivarlo.

**Por qué esta prioridad**: Cierra el bloque P3; depende de al menos un reporte.

**Independiente**: Se prueba exportando cada reporte y comparando el archivo con la pantalla.

**Escenarios de aceptación**:

1. **Dado** un reporte en pantalla, **Cuando** el administrador pulsa exportar, **Entonces** descarga un CSV (UTF-8 con BOM) que abre bien en Excel, con acentos correctos.
2. **Dado** el archivo exportado, **Cuando** se compara con la pantalla, **Entonces** filas, columnas e importes coinciden.
3. **Dado** valores que empiecen con `=`, `+`, `-` o `@`, **Cuando** se exportan, **Entonces** se neutralizan para que no se ejecuten como fórmulas.
4. **Dado** un recepcionista o un mecánico, **Cuando** intenta exportar, **Entonces** el backend responde 403.

---

### Casos límite

- ¿Qué pasa si falta una clave en `settings`? (se usan los valores de respaldo: los de las constantes actuales; el sistema no falla)
- ¿Qué pasa si el administrador baja la inactividad a 5 minutos y otros usuarios tienen sesión abierta? (sus tokens vigentes conservan su vencimiento original; el valor nuevo aplica a los tokens emitidos después)
- ¿Qué pasa si el usuario cierra el cliente sin cerrar sesión? (el token vence por su vigencia y el backend lo rechaza)
- ¿Qué pasa si se desactiva un tipo de servicio usado en una orden en curso? (la línea conserva el tipo; no se ofrece en líneas nuevas)
- ¿Qué pasa si se desactivan todos los tipos? (las líneas siguen siendo texto libre y no se propone próximo mantenimiento)
- ¿Qué pasa si la orden ya tiene ticket y luego se le agrega un tipo de servicio? (el ticket nuevo, ya emitido con instantánea, deriva la línea de próximo servicio de las líneas vigentes de la orden con la fecha de emisión; los tickets previos al sprint no cambian)
- ¿Qué pasa con el usuario que rechaza los términos varias veces? (se cierra la sesión cada vez; no hay bloqueo)
- ¿Qué pasa si se publica una versión de términos mientras un usuario tiene la sesión abierta? (el backend rechaza sus operaciones hasta que acepte; el cliente le muestra la pantalla de aceptación)
- ¿Qué pasa con una cuenta desactivada? (no inicia sesión; ver Sprint 1)
- ¿Qué pasa con las entradas de bitácora de un usuario que luego se desactiva? (se conservan; la bitácora no se purga)
- ¿Qué pasa con las órdenes con pagos en centavos que suman fracciones? (los reportes suman centavos enteros y convierten a pesos solo al mostrar)
- ¿Qué pasa si un reporte excede el límite de filas? (se pagina o se pide acotar el rango; la exportación respeta el mismo rango)
- ¿Qué pasa con los datos de los sprints 1 a 6? (no se modifican; las migraciones son aditivas)

## Requisitos *(obligatorio)*

### Requisitos funcionales (formato EARS)

**Bloque P1 - Configuración y catálogo**

- **FR-001** (P1, Ubicuo): El sistema deberá guardar la configuración en una tabla clave-valor `settings` con los datos del taller (nombre, dirección, teléfono), los márgenes de próximo mantenimiento (días y km), los días de orden detenida y los minutos de inactividad. (CA-1)
- **FR-002** (P1, Evento): Cuando el administrador guarde los datos del taller, el sistema deberá validarlos (nombre obligatorio, longitudes máximas) y persistirlos, y los tickets emitidos desde ese momento deberán usarlos. (CA-1)
- **FR-003** (P1, Evento): Cuando se emita un ticket, el sistema deberá guardar con él una instantánea del nombre, dirección y teléfono vigentes; los tickets con instantánea no cambian al editar la configuración y los emitidos antes de este sprint usan los datos vigentes (limitación documentada). (CA-1)
- **FR-004** (P1, Ubicuo): Los márgenes de próximo mantenimiento (días y km) y los días de orden detenida deberán ser editables con límites válidos (enteros positivos dentro de un máximo definido en el plan), y el centro de notificaciones y la lista de clientes por avisar (que comparte la definición de «próximo») deberán usarlos en lugar de las constantes. La lista de Mantenimientos y el panel de control no cambian. (CA-2)
- **FR-005** (P1, Estado): Mientras no exista un valor guardado, el sistema deberá usar los valores de respaldo (los de las constantes actuales: `Motorix`, `Av. Taller 123, Col. Centro`, `555-000-0000`, 30 días, 1,000 km, 3 días y 30 minutos), de modo que una instalación existente sigue funcionando y los resultados del Sprint 6 no cambian. (CA-3)
- **FR-006** (P1, Ubicuo): El sistema deberá ofrecer un catálogo `service_types` (nombre único, intervalo en días y/o km con al menos uno, activo o inactivo) que el administrador crea, edita y desactiva; un tipo usado en órdenes nunca se borra. (CA-4)
- **FR-007** (P1, Ubicuo): Las líneas de servicio de las órdenes deberán admitir un `service_type_id` opcional; las líneas existentes quedan sin tipo. (CA-4, CA-5)
- **FR-008** (P1, Evento): Cuando el usuario pida proponer el próximo mantenimiento desde una orden de un vehículo, el sistema deberá calcular fecha (fecha de la propuesta más los días del intervalo) y kilometraje (kilometraje de la orden más los km del intervalo) con el servicio tipificado más próximo en cada dimensión, y permitir corregirlos antes de guardar. No se agregan columnas a `maintenance_plans`. (CA-5)
- **FR-009** (P1, Estado): Mientras una orden tenga al menos una línea con tipo e intervalo, el ticket emitido después de este sprint deberá mostrar «Próximo servicio» con la fecha (fecha de emisión más días) y/o el kilometraje (kilometraje de la orden más km) calculados; si no existe tal línea, no la mostrará; los tickets previos no cambian. (CA-14)
- **FR-010** (P1, Ubicuo): La configuración y la administración del catálogo (crear, editar y desactivar tipos) serán exclusivas de ADMIN, validado en el backend; RECEPTIONIST y MECHANIC recibirán 403. La **consulta de los tipos de servicio activos** queda abierta a los tres roles porque es necesaria para elegir el tipo de una línea de servicio. (CA-10)

**Bloque P2 - Seguridad y términos**

- **FR-011** (P2, Ubicuo): El sistema deberá mantener una bitácora `audit_log` (usuario, acción, entidad afectada, fecha) de solo inserción. (CA-20)
- **FR-012** (P2, Evento): Cuando ocurra un inicio de sesión fallido, el alta, la baja o el cambio de rol de un usuario, un cambio de configuración, un cambio de precio de venta o de compra de una refacción o la publicación de una versión de términos, el sistema deberá registrar el evento. No se registran «bloqueos» ni «pagos cancelados» porque el sistema no los tiene (ver «Supuestos»). (CA-20)
- **FR-013** (P2, Ubicuo): La bitácora no deberá contener contraseñas, hashes, tokens, datos de tarjeta ni el importe del precio de compra; en un inicio de sesión fallido solo se guarda el identificador (usuario o correo) tecleado, truncado a 100 caracteres, nunca el campo de contraseña. (CA-21)
- **FR-014** (P2, Evento): Cuando el administrador consulte la bitácora, el sistema deberá devolverla paginada de 50 en 50 con filtros por fecha, usuario y acción; no habrá edición, borrado ni exportación, y los demás roles recibirán 403. (CA-20)
- **FR-015** (P2, Ubicuo): La política de contraseñas (8 caracteres como mínimo, con mayúscula, minúscula y número) deberá aplicarse al crear usuarios y al cambiar la contraseña con un mensaje claro, y las contraseñas se guardarán solo como hash. (CA-22)
- **FR-016** (P2, Estado): Mientras haya actividad del usuario, el cliente deberá renovar el token; tras el periodo de inactividad configurado cerrará la sesión y pedirá iniciar sesión de nuevo. La vigencia de cada token nuevo será igual al ajuste de inactividad (límites de 5 a 120 minutos) y el backend validará siempre la expiración. La consulta periódica de notificaciones no cuenta como actividad ni renueva el token. (CA-23)
- **FR-017** (P2, Ubicuo): Ninguna respuesta de la API deberá incluir el hash de contraseña, el token (salvo en el inicio de sesión y la renovación) ni los precios reservados al rol; deberá existir una prueba por cada endpoint de usuarios, refacciones, órdenes, pagos y tickets. (CA-24)
- **FR-018** (P2, Ubicuo): Las consultas deberán usar parámetros, las entradas se validarán en el backend y una prueba automática deberá comprobar intentos de inyección en los campos de búsqueda. (CA-25)
- **FR-019** (P2, Ubicuo): El sistema deberá guardar en `terms_versions` el texto vigente de los términos y del aviso de privacidad con su versión y fecha, y en `terms_acceptances` el usuario, la versión aceptada y la fecha. (CA-17, CA-18)
- **FR-020** (P2, Evento): Cuando un usuario inicie sesión sin haber aceptado la versión vigente, el sistema deberá mostrarle la pantalla de aceptación antes de usar el sistema; si la rechaza se cierra la sesión; si la acepta se guarda usuario, versión y fecha. (CA-16, CA-17)
- **FR-021** (P2, Ubicuo): El backend deberá rechazar las operaciones de un usuario sin aceptación vigente, excepto ver los términos, aceptar, renovar la sesión y cerrar sesión. Si no existe ninguna versión publicada, no se exige aceptación. (CA-19)
- **FR-022** (P2, Evento): Cuando el administrador publique una versión nueva (versión y texto), el sistema deberá volverla la vigente y pedir su aceptación a todos los usuarios; el administrador podrá consultar la versión vigente y las aceptaciones. (CA-17, CA-18)

**Bloque P3 - Reportes (línea de corte)**

- **FR-023** (P3, Ubicuo): El sistema deberá ofrecer reportes de ingresos por periodo, servicios más frecuentes, productividad por mecánico, refacciones (costo, precio y margen) y rotación de inventario, con filtro por rango libre de fechas y atajos «mes actual» y «mes anterior» (hora local del servidor). (CA-6)
- **FR-024** (P3, Ubicuo): Los reportes se calcularán al consultar con los datos existentes (RN-10) y los importes en centavos enteros, y coincidirán con los pagos y órdenes que los originan. (CA-7)
- **FR-025** (P3, Estado): Mientras una refacción no tenga precio de compra, el reporte de refacciones deberá excluirla del margen y marcarla «sin costo»; el costo de una línea es el precio de compra **vigente** de la refacción (el sistema no guarda el costo por uso); el precio de compra solo se mostrará a ADMIN. (CA-8)
- **FR-026** (P3, Ubicuo): Los reportes de servicios, productividad y refacciones usarán las **órdenes cerradas del periodo** (estado Terminado o Entregado, con su último cambio de estado dentro del rango; las canceladas nunca cuentan); el reporte de productividad contará esas órdenes y el importe de mano de obra de ellas; la rotación será unidades salidas en el periodo entre la existencia actual, con «sin existencia» cuando sea 0. (CA-6)
- **FR-027** (P3, Evento): Cuando el administrador exporte un reporte, el sistema deberá generar un CSV UTF-8 con BOM cuyo contenido coincida con la pantalla y que neutralice valores que Excel interpretaría como fórmula. (CA-9)
- **FR-028** (P3, Ubicuo): Los reportes y su exportación serán exclusivos de ADMIN (403 para los demás roles) y deberán paginar o limitar el rango para responder en un tiempo razonable. (CA-10, CA-11)

**Transversales**

- **FR-029** (P1, P2, P3, Evento): Cuando se carguen los datos de ejemplo del sprint, el sistema deberá incluir configuración inicial, tipos de servicio y una orden con ticket (P1), la versión 1 de los términos y entradas de bitácora (P2) y datos de periodos para los reportes (P3), de modo que cada bloque entregado muestre información al arrancar; la carga será idempotente, con IDs de demostración desde 9001 que no choquen con datos del usuario. (CA-12)
- **FR-030** (P1, P2, P3, Ubicuo): Las pruebas deberán cubrir las reglas de configuración, los permisos por rol y, por cada bloque entregado, sus reglas (términos, bitácora, política de contraseñas, inactividad y no exposición de datos en P2; cálculo y exportación en P3), sin dejar rojas las suites previas. (CA-13, CA-26)
- **FR-031** (P1, Evento): Cuando cierre el bloque P1, el equipo deberá actualizar `docs/project-context.md` y `docs/design-system.md`, y documentar en `server/.env.example` que la configuración pasó a la aplicación; se repite por cada bloque posterior entregado. (CA-15)

### Criterios de aceptación

- **CA-1** (P1): El administrador edita nombre, dirección y teléfono del taller desde la aplicación y los tickets nuevos los usan; los tickets ya emitidos no cambian.
- **CA-2** (P1): Los márgenes de «Próximo» (días y km) y los días de orden detenida se editan desde la aplicación con límites válidos y el centro de notificaciones y la lista de clientes por avisar los respetan; la lista de Mantenimientos y el panel no cambian de comportamiento.
- **CA-3** (P1): Si no hay valor guardado se usan los valores de respaldo (30 días, 1,000 km, 3 días y los datos actuales del taller), de modo que una instalación existente sigue funcionando y los resultados del Sprint 6 no cambian.
- **CA-4** (P1): El catálogo de tipos de servicio se crea, edita y desactiva sin borrar tipos ya usados en órdenes.
- **CA-5** (P1): Al proponer el próximo mantenimiento desde una orden con un tipo con intervalo, la fecha y el kilometraje se proponen y el usuario puede corregirlos.
- **CA-6** (P3): Existen reportes de ingresos por periodo, servicios más frecuentes, productividad por mecánico y rotación de inventario, con filtro por rango de fechas.
- **CA-7** (P3): Los importes de los reportes se calculan en centavos enteros y coinciden con los pagos y órdenes que los originan.
- **CA-8** (P3): El reporte de refacciones muestra costo, precio de venta y margen; el precio de compra solo lo ve el administrador.
- **CA-9** (P3): Cada reporte se exporta a un archivo y su contenido coincide con la pantalla.
- **CA-10** (P1, P3): Configuración, administración del catálogo y reportes son exclusivos de ADMIN, validado en el backend; RECEPTIONIST y MECHANIC reciben 403 (solo pueden consultar los tipos de servicio activos para elegirlos en una línea).
- **CA-11** (P3): Los reportes con muchos datos responden en un tiempo razonable y paginan o limitan el rango.
- **CA-12** (P1, P2): Los seeds incluyen configuración inicial, tipos de servicio, la versión inicial de los términos y datos suficientes para mostrar la información; son idempotentes y usan IDs de demostración desde 9001.
- **CA-13** (P1, P2, P3): Existen y pasan pruebas de reglas de configuración y permisos por rol y, por cada bloque entregado, de sus reglas; las suites previas siguen en verde.
- **CA-14** (P1): El ticket nuevo muestra el próximo servicio (fecha o kilometraje) cuando la orden tiene un tipo con intervalo y no lo muestra cuando no lo tiene; los tickets ya emitidos no cambian.
- **CA-15** (P1): `docs/project-context.md` y `docs/design-system.md` se actualizan; `server/.env.example` documenta que la configuración del taller y los márgenes pasaron a la aplicación (no contiene `SHOP_*` que retirar).
- **CA-16** (P2): Al iniciar sesión, un usuario que no ha aceptado la versión vigente ve la pantalla de aceptación antes de usar el sistema; si la rechaza, se cierra la sesión y no accede.
- **CA-17** (P2): La aceptación guarda usuario, versión y fecha; no se vuelve a pedir mientras la versión no cambie, y se pide de nuevo cuando el administrador publica una versión nueva.
- **CA-18** (P2): Los términos describen el uso permitido, la confidencialidad de los datos de clientes y vehículos, la responsabilidad de las cuentas personales y el aviso de privacidad; el administrador consulta la versión vigente y las aceptaciones.
- **CA-19** (P2): La aceptación se valida en backend: sin aceptación vigente la API rechaza las operaciones del usuario (excepto aceptar, ver los términos, renovar la sesión y cerrar sesión).
- **CA-20** (P2): La bitácora registra inicios de sesión fallidos, altas, bajas y cambios de rol de usuarios, cambios de configuración y de precios y publicaciones de términos; ADMIN la consulta con filtros por fecha, usuario y acción; nadie puede editarla ni borrarla desde la aplicación.
- **CA-21** (P2): La bitácora no guarda contraseñas, hashes, tokens ni datos de tarjeta.
- **CA-22** (P2): La política de contraseñas se aplica al crear y al cambiar la contraseña con un mensaje claro; las contraseñas siguen guardándose solo con hash.
- **CA-23** (P2): La sesión se cierra tras el periodo de inactividad configurado y pide iniciar sesión de nuevo; el token se renueva con la actividad y su expiración se valida en backend; la consulta periódica de notificaciones no cuenta como actividad.
- **CA-24** (P2): Ninguna respuesta de la API incluye el hash de contraseña, el token (salvo login y renovación) ni los precios reservados al rol; existen pruebas en cada endpoint de usuarios, refacciones, órdenes, pagos y tickets.
- **CA-25** (P2): Las consultas usan parámetros y las entradas se validan en backend; una prueba automática comprueba intentos de inyección en los campos de búsqueda.
- **CA-26** (P2): Existen y pasan pruebas de aceptación de términos, bitácora, política de contraseñas, inactividad y no exposición de datos.

### Entidades clave

- **Configuración** (`settings`, nueva): pares clave-valor con datos del taller, márgenes, días de orden detenida y minutos de inactividad; con valores de respaldo si falta alguno.
- **Tipo de servicio** (`service_types`, nueva): nombre único, intervalo en días y/o km, activo o inactivo; nunca se borra si está en uso.
- **Línea de servicio** (`order_services`, existente, se amplía): agrega tipo de servicio opcional.
- **Ticket** (`tickets`, existente, se amplía): agrega la instantánea de nombre, dirección y teléfono del taller al emitirse.
- **Versión de términos** (`terms_versions`, nueva): versión, texto de términos y aviso de privacidad, fecha de publicación y quién la publicó.
- **Aceptación de términos** (`terms_acceptances`, nueva): usuario, versión aceptada y fecha.
- **Bitácora** (`audit_log`, nueva): usuario, acción, entidad afectada y fecha; solo inserción.
- **Pagos, usos de refacciones, refacciones, movimientos de inventario y órdenes** (existentes, solo consulta): fuente de los reportes (P3).

## Criterios de éxito *(obligatorio)*

### Resultados mensurables

- **SC-001** (P1): 100 % de los tickets emitidos después del cambio de configuración muestran los datos nuevos y 0 tickets con instantánea cambian al editar la configuración.
- **SC-002** (P1): Con una base sin configuración guardada, 100 % de los resultados del centro de notificaciones coinciden con los del Sprint 6.
- **SC-003** (P1): 0 tipos de servicio usados en órdenes se pueden borrar; 100 % de las líneas con tipo e intervalo producen la línea «Próximo servicio» en el ticket nuevo y 0 líneas sin tipo la producen.
- **SC-004** (P1, P2, P3): 100 % de los endpoints de configuración, administración del catálogo, bitácora, términos (publicación y aceptaciones) y reportes rechazan a RECEPTIONIST y MECHANIC con 403 en las pruebas.
- **SC-005** (P2): 100 % de los eventos auditados definidos en CA-20 generan una entrada y 0 entradas contienen contraseñas, hashes, tokens, datos de tarjeta o importes de precio de compra.
- **SC-006** (P2): 100 % de los usuarios sin aceptación vigente son rechazados por la API en operaciones distintas de ver, aceptar y cerrar sesión, y 0 usuarios con aceptación vigente vuelven a ver la pantalla mientras la versión no cambie.
- **SC-007** (P2): La sesión se cierra a los minutos configurados sin actividad y no se cierra antes mientras haya actividad; la consulta periódica de avisos renueva 0 veces el token.
- **SC-008** (P3): 100 % de los importes de reportes coinciden al centavo con los pagos y órdenes que los originan, y 100 % de los archivos exportados coinciden con la pantalla.
- **SC-009** (P3): Cada reporte responde en menos de 2 segundos con un volumen de cientos de órdenes y miles de movimientos (cifra exacta en el plan).
- **SC-010** (P1, P2): La carga de datos de ejemplo ejecutada dos veces seguidas produce 0 registros duplicados y no altera datos de trabajo existentes.
- **SC-011**: Ninguna suite previa queda en roto tras cada bloque entregado y las pruebas nuevas del bloque pasan.

## Fuera de alcance

- Gráficas avanzadas, tableros personalizables y analítica predictiva.
- Impuestos, facturación electrónica y contabilidad.
- Gestión de usuarios y roles (existe desde el Sprint 1; aquí solo se audita).
- Credenciales de Mercado Pago o proveedores externos (siguen en variables de entorno).
- Notificaciones (Sprint 6) y mensajes al cliente.
- Envío automático de reportes por correo.
- Cifrado en disco, respaldos, HTTPS y despliegue.
- Autenticación de dos factores y recuperación de contraseña por correo.
- Bloqueo temporal por intentos fallidos y `helmet` (no existen hoy; decisión del 2026-11-23: trabajo futuro).
- Asesoría legal: el texto de los términos es una plantilla que el taller debe revisar.
- Cualquier cambio a lo construido en los sprints 1 a 6, salvo lo que este sprint consuma.

## Supuestos

- Las decisiones de la sección 10 del insumo se aplican como firmes y las tres aclaraciones del `/speckit.clarify` se resolvieron el 2026-11-23; no quedan marcadores abiertos. Siguen abiertos solo (sin impacto funcional, se deciden en el plan): diseño exacto de pantallas, textos de la plantilla de términos, nombre de las claves de `settings` y los límites máximos de los márgenes.
- **Diferencias entre el insumo y el código real** (la spec sigue al código):
  - `SHOP_NAME`, `SHOP_ADDRESS` y `SHOP_PHONE` **no existen** en `.env` ni en `.env.example`: los datos del taller son la constante `TALLER` de `server/services/ticket-service.js`, y los márgenes del Sprint 6 son constantes de código (`maintenance-state.js`, `notification-service.js`). El valor de respaldo de CA-3 son esas constantes, no variables de entorno, y no hay nada que retirar de `.env.example` (CA-15).
  - La vigencia del token es de **30 minutos fijos** (`SESION_MINUTOS = 30` en `middlewares/auth.js`), no 8 horas; no hay renovación. Por eso el cierre por inactividad exige la renovación del token por actividad.
  - `helmet` y el bloqueo temporal por intentos fallidos **no existen** (el login solo compara la contraseña con bcrypt); quedan fuera de alcance.
  - La política de contraseñas **ya existe** (RN-17, `cumplePoliticaContrasena`) en el alta de usuarios y el cambio de contraseña; este sprint la conserva, la prueba y la audita.
  - Los pagos **no se cancelan** (solo vencen o quedan desfasados), por lo que «pagos cancelados» de CA-20 del insumo no se registra; el sistema tampoco tiene «bloqueos» de cuenta.
  - Las órdenes y los mantenimientos **no están enlazados**: `maintenance_plans` no tiene orden; por eso el próximo servicio se calcula desde la orden y no se enlaza (ver «Aclaraciones»).
  - Las contraseñas de las cuentas sembradas son `Admin123`, `Recepcion123` y `Mecanico123` (seed 001), no las de `docs/project-context.md` (`Admin2026!`, etc.). Todas cumplen la política y no se obliga a cambiarlas; la documentación se corrige en este sprint.
  - El ticket **no persiste su contenido**: se arma al vuelo desde la orden y sus pagos, y solo guarda folio y emisión. Por eso la instantánea de los datos del taller es una columna nueva en `tickets`.
- **Definiciones de los reportes (P3)**: los ingresos cuentan pagos `COMPLETED` por su fecha de registro (el sistema no guarda fecha de confirmación; es el mismo criterio del panel de control); las órdenes «del periodo» son las cerradas (Terminado o Entregado) según su último cambio de estado, de modo que una orden terminada en un mes y entregada en otro cuenta en el de su último cambio; el costo de las refacciones es el precio de compra vigente (limitación: el margen histórico cambia si cambia el precio de compra; no se agrega columna de costo congelado porque alteraría los sprints 5 y 6).
- **Ajuste de inactividad por bloque**: la clave `session.inactivity_minutes` existe desde P1 con su valor de respaldo, pero solo se expone en la API y en la pantalla (grupo «Seguridad») cuando se entrega P2, para que cortar después de P1 no deje un ajuste sin efecto.
- **Evidencias de sprints previos**: al sembrar la versión 1 de los términos (P2), los scripts de evidencia anteriores que inician sesión y llaman a la API reciben `403` hasta aceptar; no se editan y se documenta el procedimiento (aceptar por la API primero).
- **Roles de la propuesta de mantenimiento**: «proponer desde una orden» la usan los roles que ya registran mantenimientos (administrador y mecánico; el mecánico solo sobre sus órdenes).
- Un tipo de servicio sin días ni km no tiene intervalo y no genera próximo servicio; se exige al menos uno al crearlo.
- La fecha de la propuesta y la del ticket usan la fecha local del servidor; la fecha base del ticket es la de su emisión.
- El kilometraje base de la propuesta y del ticket es el kilometraje de entrada de la orden.
- Los mecánicos y el personal de recepción siguen usando las líneas de servicio con los permisos que ya tienen; solo ADMIN administra el catálogo.
- La renovación del token se hace con una petición explícita del cliente cuando hay actividad del usuario; los límites de 5 a 120 minutos para la inactividad son una propuesta del plan.
- El volumen para el rendimiento de los reportes (P3) se toma del orden de cientos de órdenes y miles de movimientos, sin cifras de producción.
- Los seeds usan IDs desde 9001; las migraciones son aditivas desde la `019_...sql` (una por tema); orden de aplicación obligatorio: migraciones, seeds, servidor.
- Las restricciones técnicas heredadas se mantienen: ES Modules, solo el backend accede a MySQL, permisos en backend, sin secretos en el repositorio, MySQL con InnoDB y `utf8mb4`, login por usuario o correo, pruebas contra `motorix_test`, importes en centavos enteros (`server/utils/money.js`) y `DECIMAL(10,2)`, y pantallas conforme a `docs/design-system.md`.
- Como el ADMIN siembra con la versión 1 de los términos sin aceptar, el primer inicio de sesión de cada cuenta de demostración mostrará la pantalla de aceptación (decisión acordada).
