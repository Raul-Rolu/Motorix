<!--
Insumo de especificación para /speckit.specify.
Sprint 7 post-MVP de Motorix: configuración, seguridad y reportes.
Versión adaptada a este repositorio: numeración de migración corregida (019),
estado real tras el Sprint 6, decisiones de la sección 9 ya acordadas para
acortar la aclaración, prioridades y línea de corte para poder cerrar el sprint
aunque no alcance el tiempo.
-->

# Insumo de especificación - Sprint 7: Configuración, seguridad y reportes

> Referencias obligatorias para el agente:
> - Contexto maestro: `docs/project-context.md`
> - Constitución: `docs/reglas.md` y `.specify/memory/constitution.md`
> - Alcance completo del sprint del equipo: este documento (`docs/sprints/sprint-7-reportes-configuracion.md`)
> - Specs previas para no rehacer lo ya construido: `specs/005-precio-venta-refacciones/`, `specs/006-complemento-precios-compra/` y `specs/007-notificaciones-internas/`
> - Este documento describe únicamente el alcance del Sprint 7. La spec de este sprint será la `008`.

## 1. Contexto del sprint

Estado real del sistema tras los Sprints 5, su complemento y 6 (verificar en el código antes de planear):

- **Configuración:** no existe módulo ni tabla de configuración. Los datos del taller del ticket (`SHOP_NAME`, `SHOP_ADDRESS`, `SHOP_PHONE`) viven en `.env`; cambiarlos exige acceso al servidor y reiniciarlo.
- **Márgenes de mantenimiento próximo:** el Sprint 6 los fijó como constantes del servidor (30 días o 1,000 km) y solo los usa el centro de notificaciones. La lista de Mantenimientos solo muestra «Pendiente» o «Vencido» y el dashboard cuenta como próximo todo pendiente no vencido. Tampoco existe hoy un «margen» en `.env`; este sprint los hace configurables, y también los 3 días de «orden detenida».
- **Intervalos de mantenimiento:** la regla de negocio 12 pide intervalos configurables, pero hoy el próximo mantenimiento se captura a mano en cada orden; no hay catálogo de tipos de servicio con intervalo. Las líneas de `order_services` son texto libre.
- **Reportes:** no existe módulo de reportes ni exportación. El dashboard solo muestra ingresos pagados por mes y por método, y órdenes por estado.
- **Costeo:** el Sprint 5 y su complemento ya guardan el precio de compra (solo ADMIN) y de venta de las refacciones y el precio de venta en cada línea de orden; los importes usan centavos enteros (`server/utils/money.js`).
- **Términos y seguridad:** no hay pantalla de términos y condiciones ni de aviso de privacidad, no hay bitácora de acciones sensibles ni política de contraseñas, y la sesión solo expira por la vigencia del token. **Verificar la vigencia real del token**: este documento del equipo dice 8 horas y el plan del Sprint 6 observó 30 minutos. Sí existen bcrypt, JWT, `helmet`, el bloqueo temporal por intentos fallidos y la validación de permisos en backend.
- **Sprint 6:** `notification-service.js` usa constantes de margen; este sprint las reemplaza por los valores configurables sin cambiar sus resultados cuando no hay configuración guardada.

## 2. Objetivo

Que el administrador configure desde la aplicación los datos del taller y los márgenes de mantenimiento, mantenga un catálogo de tipos de servicio con intervalos, y consulte y exporte reportes de ingresos, servicios, productividad e inventario; y que todo usuario acepte los términos y condiciones al ingresar y la información del sistema quede protegida con bitácora, política de contraseñas y cierre de sesión por inactividad.

## 3. Prioridades y línea de corte

Este es el sprint más amplio. Se entrega por bloques en este orden; **cada bloque deja el sistema funcionando y se puede cerrar el sprint después de cualquiera de ellos**:

1. **P1 - Configuración y catálogo:** US1, US2, US3, US8.
2. **P2 - Seguridad y términos:** US10, US9.
3. **P3 - Reportes (línea de corte):** US4, US5, US6, US7. Solo si los bloques anteriores están completos, verificados y commiteados. Si no se entregan, se documentan como trabajo futuro.

Las tareas deben ordenarse por bloque para que cortar P3 (o parte de P2) no deje piezas a medias.

## 4. Historias de usuario del sprint

- **US1 (P1)** - Como administrador, quiero editar el nombre, la dirección y el teléfono del taller para que el ticket muestre datos correctos sin tocar el servidor.
- **US2 (P1)** - Como administrador, quiero ajustar los márgenes de «Próximo» del mantenimiento (días y kilómetros) y los días para considerar una orden detenida, para adaptarlos a la operación del taller.
- **US3 (P1)** - Como administrador, quiero mantener un catálogo de tipos de servicio con su intervalo en días y en kilómetros para que el próximo mantenimiento se proponga sin asumir intervalos universales.
- **US8 (P1)** - Como cliente, quiero que mi ticket indique cuándo toca mi próximo servicio para recordarlo sin que nadie me escriba.
- **US10 (P2)** - Como administrador, quiero que la información del sistema esté protegida (bitácora de acciones sensibles, política de contraseñas, cierre de sesión por inactividad y respuestas sin datos reservados) para detectar usos indebidos y proteger los datos del taller y de sus clientes.
- **US9 (P2)** - Como usuario del taller, quiero leer y aceptar los términos y condiciones y el aviso de privacidad al ingresar al sistema para conocer las reglas de uso y cómo se protege la información de los clientes.
- **US4 (P3)** - Como administrador, quiero consultar los ingresos por periodo para conocer cómo avanza el taller.
- **US5 (P3)** - Como administrador, quiero ver los servicios más frecuentes y la productividad por mecánico para tomar decisiones de operación.
- **US6 (P3)** - Como administrador, quiero ver el costo, el precio y el margen de las refacciones usadas y la rotación del inventario para controlar la rentabilidad.
- **US7 (P3)** - Como administrador, quiero exportar cada reporte para compartirlo o archivarlo.

## 5. Flujo demostrable al cierre del sprint

Flujo de configuración (P1):

    Administrador cambia el nombre y teléfono del taller en Configuración
    -> genera un ticket nuevo y muestra los datos actualizados; los tickets anteriores no cambian
    -> cambia el margen de mantenimiento próximo y el centro de notificaciones lo respeta
    -> define un tipo de servicio "Cambio de aceite" con intervalo de 180 días y 5,000 km
    -> al terminar una orden con ese servicio se propone el próximo mantenimiento y el ticket muestra "Próximo servicio" con esa fecha y kilometraje

Flujo de términos y seguridad (P2):

    Un usuario inicia sesión por primera vez (o tras publicarse una nueva versión de los términos)
    -> el sistema le muestra los términos y condiciones y el aviso de privacidad
    -> si no los acepta, no entra; si los acepta, queda registrada la versión, la fecha y el usuario
    -> el usuario cambia a una contraseña que cumple la política
    -> el administrador abre la bitácora y ve quién cambió un precio, un rol o la configuración, y cuándo
    -> tras el tiempo de inactividad configurado, la sesión se cierra y pide iniciar sesión de nuevo

Flujo de reportes (P3, solo si se entrega):

    Administrador abre Reportes, elige el rango de fechas y ve ingresos, servicios frecuentes y productividad
    -> consulta el margen de refacciones y la rotación
    -> exporta el reporte y el archivo coincide con la pantalla

## 6. Entidades y tablas que toca este sprint

> Basado en las secciones 6.6, 6.7, 6.8, 6.10 y 6.11 de `project-context.md`.

| Entidad / tabla | Acción en este sprint |
|-----------------|-----------------------|
| `settings` | crear tabla de configuración clave-valor (datos del taller, márgenes de mantenimiento, días de orden detenida, minutos de inactividad) |
| `service_types` | crear catálogo de tipos de servicio con intervalo en días y en kilómetros (desactivable, nunca borrado si está en uso) |
| `order_services` | agregar columna opcional `service_type_id`; las líneas existentes quedan sin tipo |
| `maintenance_plans` | consultar y proponer el próximo mantenimiento a partir del intervalo |
| `tickets` | agregar instantánea de los datos del taller al emitir; el ticket nuevo agrega la línea de próximo servicio; los tickets anteriores sin instantánea usan los datos vigentes y esto se documenta como limitación |
| `terms_versions` | crear tabla con el texto vigente de los términos y del aviso de privacidad, su versión y su fecha |
| `terms_acceptances` | crear tabla con el usuario, la versión aceptada y la fecha de aceptación |
| `audit_log` | crear bitácora de acciones sensibles: usuario, acción, entidad afectada, fecha (sin guardar contraseñas, hashes, tokens ni datos de pago) |
| `users` | consultar; la política de contraseñas se aplica al crear o cambiar la contraseña |
| `payments`, `order_parts`, `parts`, `inventory_movements`, `service_orders` | consultar para los reportes (P3); sin cambios de estructura |
| migraciones `019_...sql` en adelante y seeds del sprint | crear (las migraciones 001–018 ya existen; la 019 es la siguiente; pueden ser varias, una por tema, aditivas) |

## 7. Reglas de negocio aplicables

- RN-5: Solo usuarios autorizados pueden modificar registros.
- RN-9: Una orden entregada debe conservarse como historial.
- RN-10: No duplicar información: los reportes se calculan de datos existentes.
- RN-11: Los próximos mantenimientos se basan en fecha, kilometraje o ambos.
- RN-12: Los intervalos de mantenimiento son configurables; no asumir valores universales.
- RN-14: Los datos sensibles no se almacenan en la aplicación.
- RN-15: Los permisos deben validarse en backend.

## 8. Criterios de aceptación

Marcados con su prioridad. Los de P3 solo se exigen si se entrega ese bloque.

- [ ] CA-1 (P1): El administrador edita nombre, dirección y teléfono del taller desde la aplicación y los tickets nuevos los usan; los tickets ya emitidos no cambian.
- [ ] CA-2 (P1): Los márgenes de «Próximo» (días y kilómetros) y los días de orden detenida se editan desde la aplicación con límites válidos, y el centro de notificaciones los respeta. La lista de Mantenimientos y el dashboard no cambian de comportamiento.
- [ ] CA-3 (P1): Si no hay valor guardado, se usan los valores de `.env` cuando existan o los predeterminados (30 días, 1,000 km y 3 días), de modo que una instalación existente sigue funcionando y los resultados del Sprint 6 no cambian.
- [ ] CA-4 (P1): El catálogo de tipos de servicio se crea, edita y desactiva sin borrar tipos ya usados en órdenes.
- [ ] CA-5 (P1): Al registrar el próximo mantenimiento de una orden con un tipo de servicio que tiene intervalo, la fecha y el kilometraje se proponen y el usuario puede corregirlos.
- [ ] CA-6 (P3): Existen reportes de ingresos por periodo, servicios más frecuentes, productividad por mecánico y rotación de inventario, con filtro por rango de fechas.
- [ ] CA-7 (P3): Los importes de los reportes se calculan en centavos enteros y coinciden con los pagos y órdenes que los originan.
- [ ] CA-8 (P3): El reporte de refacciones muestra costo, precio de venta y margen; el precio de compra solo lo ve el administrador.
- [ ] CA-9 (P3): Cada reporte se exporta a un archivo y su contenido coincide con la pantalla.
- [ ] CA-10 (P1, P3): Configuración, catálogo y reportes son exclusivos de ADMIN, validado en backend; RECEPTIONIST y MECHANIC reciben 403.
- [ ] CA-11 (P3): Los reportes con muchos datos responden en un tiempo razonable y paginan o limitan el rango.
- [ ] CA-12 (P1, P2): Los seeds incluyen configuración inicial, tipos de servicio, la versión inicial de los términos y datos suficientes para mostrar la información; son idempotentes y usan IDs de demostración que no choquen con datos del usuario.
- [ ] CA-13: Existen y pasan pruebas de reglas de configuración, permisos por rol y, si se entrega P3, de cálculo de reportes y exportación.
- [ ] CA-14 (P1): El ticket nuevo muestra el próximo servicio (fecha o kilometraje) cuando la orden tiene un tipo de servicio con intervalo, y no lo muestra cuando no lo tiene; los tickets ya emitidos no cambian.
- [ ] CA-15: `docs/project-context.md` y `docs/design-system.md` se actualizan y se retira de `.env.example` lo que pase a la aplicación, o se documenta que queda como valor de respaldo.
- [ ] CA-16 (P2): Al iniciar sesión, un usuario que no ha aceptado la versión vigente de los términos y condiciones y del aviso de privacidad ve la pantalla de aceptación antes de usar el sistema; si la rechaza, se cierra la sesión y no accede.
- [ ] CA-17 (P2): La aceptación guarda usuario, versión y fecha; no se vuelve a pedir mientras la versión no cambie, y se pide de nuevo cuando el administrador publica una versión nueva.
- [ ] CA-18 (P2): Los términos describen el uso permitido del sistema, la confidencialidad de los datos de clientes y vehículos, la responsabilidad de las cuentas personales y el aviso de privacidad. El administrador puede consultar la versión vigente y las aceptaciones.
- [ ] CA-19 (P2): La aceptación se valida en backend: sin aceptación vigente, la API rechaza las operaciones del usuario (excepto aceptar, ver los términos y cerrar sesión), no solo la pantalla.
- [ ] CA-20 (P2): La bitácora registra, como mínimo, inicios de sesión fallidos y bloqueos, altas, bajas y cambios de rol de usuarios, cambios de configuración y de precios, y pagos cancelados; ADMIN la consulta con filtros por fecha, usuario y acción; nadie puede editarla ni borrarla desde la aplicación.
- [ ] CA-21 (P2): La bitácora no guarda contraseñas, hashes, tokens ni datos de tarjeta.
- [ ] CA-22 (P2): La política de contraseñas se aplica al crear y al cambiar la contraseña, con un mensaje claro; las contraseñas siguen guardándose solo con hash.
- [ ] CA-23 (P2): La sesión se cierra tras un periodo de inactividad y pide iniciar sesión de nuevo; la expiración del token se mantiene validada en backend. La consulta periódica de notificaciones del Sprint 6 no cuenta como actividad del usuario.
- [ ] CA-24 (P2): Ninguna respuesta de la API incluye el hash de contraseña, el token ni los precios reservados al rol; existen pruebas que lo verifican en cada endpoint de usuarios, refacciones, órdenes, pagos y tickets.
- [ ] CA-25 (P2): Las consultas usan parámetros (sin concatenar texto del usuario) y las entradas se validan en backend; una prueba automática comprueba intentos de inyección en los campos de búsqueda.
- [ ] CA-26 (P2): Existen y pasan pruebas de aceptación de términos, bitácora, política de contraseñas, inactividad y no exposición de datos.

## 9. Fuera de alcance de este sprint

- Gráficas avanzadas, tableros personalizables y analítica predictiva.
- Impuestos, facturación electrónica y contabilidad.
- Gestión de usuarios y roles (ya existe desde el Sprint 1).
- Configuración de credenciales de Mercado Pago o de proveedores externos; siguen en variables de entorno.
- Notificaciones (Sprint 6) y mensajes al cliente (fuera del alcance del proyecto).
- Programación o envío automático de reportes por correo.
- Cifrado de la base de datos en disco, respaldos, HTTPS y despliegue.
- Autenticación de dos factores y recuperación de contraseña por correo.
- Asesoría legal: el texto de los términos es una plantilla que el taller debe revisar con quien corresponda.
- Cualquier cambio a lo ya construido en los sprints 1 a 6, salvo lo que este sprint necesite consumir.

## 10. Decisiones ya acordadas (propuestas para ahorrar tiempo; confirmar o ajustar en /speckit.clarify, no reabrir sin razón)

- **Prioridad si el sprint no alcanza:** configuración y catálogo (P1), después seguridad y términos (P2), después reportes (P3). La línea de corte está en la sección 3.
- **Formato de exportación (P3):** CSV con codificación UTF-8 y marca BOM para que Excel lo abra bien; sin dependencias nuevas.
- **Datos del taller en el ticket:** el ticket guarda una instantánea de nombre, dirección y teléfono al emitirse. Los tickets anteriores sin instantánea usan los datos vigentes (limitación documentada).
- **Tipo de servicio en las líneas:** `order_services` agrega `service_type_id` opcional; las líneas existentes quedan sin tipo y no proponen próximo mantenimiento.
- **Margen sin precio de compra (P3):** la línea se excluye del cálculo del margen y se marca «sin costo»; nunca se calcula con costo 0.
- **Periodos de los reportes (P3):** rango libre de fechas con atajos «mes actual» y «mes anterior»; el corte usa la hora local del servidor.
- **Productividad por mecánico (P3):** órdenes terminadas o entregadas en el periodo e importe de mano de obra de esas órdenes.
- **Rotación de inventario (P3):** unidades salidas en el periodo entre la existencia actual; si la existencia es 0 se muestra «sin existencia». Es una simplificación documentada.
- **Reportes para RECEPTIONIST:** no; exclusivos de ADMIN (CA-10).
- **Términos y condiciones:** el texto de la versión 1 es una plantilla en español incluida en el seed. El administrador publica versiones nuevas desde la aplicación (versión y texto). Se acepta una sola vez por versión. Los usuarios existentes, incluidos los sembrados, deben aceptar en su siguiente inicio de sesión.
- **Bitácora:** registra al menos los eventos de CA-20; se conserva sin purga automática; se consulta paginada (50 por página) con filtros por fecha, usuario y acción; sin exportación.
- **Política de contraseñas:** mínimo 8 caracteres con al menos una mayúscula, una minúscula y un número. Las cuentas sembradas de demostración ya la cumplen y no se les obliga a cambiarla.
- **Inactividad:** 30 minutos para todos los roles, configurable en `settings`; el cierre lo controla el cliente por inactividad del usuario y el backend mantiene la expiración del token.
- **Orden detenida:** el valor de 3 días del Sprint 6 pasa a ser un ajuste en `settings`, con 3 como predeterminado.

Siguen abiertas (decidir en el plan, sin impacto funcional): diseño exacto de las pantallas, textos de la plantilla de términos y nombre de las claves de `settings`.

## 11. Restricciones técnicas heredadas

- Backend en ES Modules, nunca CommonJS.
- Solo el backend accede a MySQL; el frontend nunca se conecta directo.
- Permisos validados en backend, no solo en UI.
- Sin secretos en el repositorio.
- Idioma: español en chat, docs, comentarios y pruebas.
- MySQL local, InnoDB, llaves foráneas, `utf8mb4`.
- Login acepta usuario o correo electrónico en el mismo campo.
- Ya existen bcrypt para las contraseñas, JWT, `helmet` y el bloqueo temporal por intentos fallidos desde el Sprint 1; este sprint los complementa y no los reemplaza.
- Toda pantalla del frontend sigue `docs/design-system.md`.
- Pruebas de integración contra `motorix_test`, nunca contra la base principal.
- Los seeds del sprint DEBEN incluir datos de ejemplo suficientes para que la aplicación muestre información al arrancar. La base no puede quedar vacía tras la instalación.
- Los seeds DEBEN ser idempotentes: si se corren de nuevo, no duplican registros ni reinician datos de trabajo (`ON DUPLICATE KEY UPDATE`). Los IDs fijos de demostración deben ir en un rango alto (por ejemplo desde 9001) para no chocar con datos propios del usuario (limitación detectada en el Sprint 6).
- Los importes se calculan en centavos enteros (`server/utils/money.js`) y se guardan como `DECIMAL(10,2)`.
- Las migraciones son aditivas y numeradas (`019_...sql` en adelante); no modifican las migraciones anteriores.
- Orden de aplicación obligatorio: migraciones, luego seeds, luego servidor.
