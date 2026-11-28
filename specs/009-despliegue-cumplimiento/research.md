# Investigación: Despliegue y cumplimiento

**Fecha**: 2026-11-27. Cada hecho indica cómo se conoce: **código** (revisado en el repositorio), **probado** (ejecutado en una copia temporal), **documentación** (página oficial consultada), **texto oficial** o **por comprobar**.

## R-01 Enmienda de la constitución

- **Decisión**: versión 2.0.0, porque se redefine el Principio III (base «local» y sin nube). Se registra en el reporte de impacto que la ratificación sigue pendiente.
- **Razón**: la gobernanza pide MAJOR al redefinir principios.
- **Alternativa**: mantener 1.0.0 como en los ajustes previos a la ratificación; se descarta porque el cambio levanta una prohibición explícita. El equipo puede decidir lo contrario al aprobar.
- **Forma de aprobación**: un solo texto, [contracts/enmienda-constitucion.md](./contracts/enmienda-constitucion.md), que separa lo ya aprobado (fila 1: motor compatible) de lo nuevo (filas 2 a 12). Se copia a la constitución sin reinterpretarlo.
- **Alcance además del motor** (código y análisis): el Principio III exige datos iniciales en SQL, InnoDB y prohíbe la base en la nube; la enmienda acota esas reglas, admite variantes de migraciones, exige TLS y extiende «nunca `root`» a scripts y pruebas, sin excepciones.

## R-02 Migraciones compatibles con TiDB

- **Hechos**: TiDB no admite modificar el mismo objeto en varios cambios de un `ALTER TABLE` y valida contra el esquema previo (documentación). Las migraciones 016, 017 y 020 agregan columna y restricción juntas (código). Que fallen es una inferencia **por comprobar**.
- **Decisión**: `database/migrations/tidb/` con el mismo nombre de archivo. Si `SELECT VERSION()` contiene `TiDB` y hay variante, se ejecuta la variante y se registra el nombre original en `schema_migrations`. En la 020, el índice se crea antes de la llave foránea para que esta lo reutilice.
- **Recuperación**: el DDL no es transaccional. Si una migración queda a medias en una base vacía, se recrea la base y se aplica de nuevo.
- **Alternativas**: editar los originales (prohibido); migración 024 (no repara una instalación desde cero); partir las originales en tiempo de ejecución (frágil).

## R-03 Scripts en un clon limpio y sin mezclar entornos

- **Hechos**: `apply-migrations.mjs` falla con `ERR_MODULE_NOT_FOUND` en un clon limpio aunque `server/` tenga dependencias (probado). Cargan `server/.env` por su cuenta (código).
- **Decisión**: importar `mysql2`, `dotenv` y `bcrypt` por ruta relativa desde `server/node_modules` (ya lo hacen los guiones de evidencia). Bandera `--sin-env`. Para la nube se usa `node --env-file=<archivo fuera del repositorio> … --sin-env`. Siempre se muestra base y servidor, con el nombre del servidor enmascarado.
- **Nota**: en `--env-file`, una variable ya definida en la terminal gana sobre el archivo; la guía comprueba que no haya `DB_*` definidas.
- **Alternativa**: un `package.json` propio en `database/`; duplica dependencias.

## R-04 TLS

- **Hechos**: el endpoint público solo acepta TLS 1.2 o 1.3, con certificados de Let's Encrypt (documentación).
- **Decisión**: `DB_SSL=true` produce `{ minVersion: 'TLSv1.2', rejectUnauthorized: true }` con las autoridades incluidas en Node. Sin la variable no cambia nada.
- **Alternativa**: archivo de certificado propio; innecesario con Node.

## R-05 Zona horaria

- **Decisión**: `TZ=America/Mexico_City` en el proceso. Cada conexión ejecuta `SET time_zone` con el desfase actual del proceso (`-06:00`).
- **Razón**: proceso y base coinciden siempre y funciona en MySQL sin tablas de zonas horarias. Node en Windows respeta `TZ` (probado: desfase de 360 minutos).
- **Alternativa**: nombre de zona en SQL; falla en instalaciones locales sin tablas de zonas.

## R-06 Pool de conexiones

- **Hechos**: el endpoint público en AWS corta conexiones inactivas a los 340 s (documentación). mysql2 solo expulsa inactivas si `maxIdle` es menor que el límite de conexiones (código de la dependencia).
- **Decisión**: `maxIdle: 2`, `idleTimeout: 240000`.
- **Riesgo residual**: TiDB advierte que puede cerrar conexiones de más de 30 minutos y mysql2 no limita la vida total.

## R-07 Comprobación en TiDB

- **Hechos**: no hay disparadores ni procedimientos (código); TiDB no los soporta (documentación). `CHECK` está desactivado por omisión; las llaves foráneas son estables desde 8.5.0 (documentación). La versión de Starter y si permite activar `CHECK` están **por comprobar**.
- **Decisión**: antes de migrar, intentar `SET GLOBAL tidb_enable_check_constraint = ON` y anotar el resultado. Después, `check-schema --probar-restricciones` (solo en bases `_test`) y estas suites: `auth`, `terms`, `settings`, `inventory`, `order-parts`, `part-price-adoption`, `payments`, `reports-income`, `reports-services-productivity`, `reports-parts-rotation`, `notifications-calculo`.
- **Alternativa**: las 109 suites por internet; demasiado lentas y consumen cuota. Se excluyen las de rendimiento.

## R-08 CORS

- **Decisión**: middleware propio con lista exacta de `CORS_ORIGIN`.
- **Razón**: son pocas líneas (la constitución pide no agregar librerías en ese caso).
- **Alternativa**: paquete `cors`.

## R-09 Límite de intentos (dependencia nueva)

- **Decisión**: `express-rate-limit` ^8.7.5 (publicada para Node ≥ 16 y Express ≥ 4.11; consultado en el registro de npm). 10 fallos en 15 minutos por origen, compartidos entre inicio de sesión y cambio de contraseña; cuentan las respuestas 4xx.
- **Justificación**: resuelve ventana, conteo con peticiones simultáneas, agrupación de direcciones IPv6, descuento de intentos correctos y avisos de proxy mal configurado, que a mano son fáciles de equivocar. Es gratuita. Fue pedida expresamente con justificación.
- **Alternativa**: contador propio en memoria.
- **Límite conocido**: el conteo se pierde al reiniciar.

## R-10 Proxy de Render

- **Hechos**: no se encontró documentación oficial sobre el número de saltos; un hilo de la comunidad indica que el proxy conserva el `X-Forwarded-For` del cliente y agrega el suyo (**por comprobar**).
- **Decisión**: `TRUST_PROXY` con número de saltos (0 en local). Al desplegar, `LOG_CLIENT_IP=true` registra en `/api/health` la IP resuelta y cuántas direcciones traía la cabecera; el usuario ajusta el número hasta ver su IP pública, comprueba que una cabecera falsificada no la cambie y quita la variable. No escribe en la base.
- **Alternativa**: `trust proxy: true`; permite falsificar el origen.

## R-11 Salud

- **Decisión**: 503 si la consulta falla o tarda más de 3 s, con el mismo cuerpo.
- **Hechos**: Render considera sano un 2xx o 3xx, exige respuesta en 5 s y reinicia tras 60 s de fallos (documentación).

## R-12 Entorno de Render

- **Hechos** (documentación): puerto por omisión 10000; se puede fijar Node con `NODE_VERSION`; por omisión 24.22.1 en servicios nuevos; el plan gratuito se suspende tras 15 minutos, despierta en cerca de un minuto y no ofrece consola.
- **Decisión**: `NODE_VERSION=24.22.1` y `engines` en `server/package.json`. Las pruebas corren con la versión local (25.1.0); la diferencia se documenta y la salud y las comprobaciones de lectura verifican la versión de Render. Las migraciones se aplican desde la máquina del usuario.
- **Validación de arranque**: `JWT_SECRET` presente, de 32 caracteres o más y distinto del ejemplo, solo en `server.js`.

## R-13 Marco legal (texto oficial)

**Fuente**: Ley Federal de Protección de Datos Personales en Posesión de los Particulares, Cámara de Diputados, <https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf>. Nueva ley en el DOF del **20-03-2025**; última reforma DOF **14-11-2025**. Consultada el **2026-11-27** extrayendo el texto del PDF.

| Art. | Contenido que usan los textos |
|---|---|
| 2 | Definiciones: «Días» son **hábiles**; «Secretaría» es la Secretaría Anticorrupción y Buen Gobierno; persona encargada; transferencia (no incluye la comunicación a la persona encargada) |
| 7 | Consentimiento expreso o tácito; datos financieros o patrimoniales requieren expreso salvo excepciones; el aviso fija cómo revocarlo |
| 8 | Datos sensibles: consentimiento expreso y por escrito |
| 15 | El aviso contiene al menos: I identidad y domicilio; II datos tratados, señalando los sensibles; III finalidades, distinguiendo las que requieren consentimiento; IV opciones para limitar uso o divulgación; V medios y procedimiento ARCO; VI cómo se comunican los cambios |
| 16 | En medios electrónicos, aviso simplificado con al menos las fracciones I a IV y el sitio del integral |
| 18, 19 | Medidas de seguridad; aviso inmediato de vulneraciones significativas |
| 24, 25 | Cancelación con periodo de bloqueo; excepciones |
| 28 | Requisitos de la solicitud ARCO |
| 29 | Persona o departamento que tramita las solicitudes |
| 31 | Respuesta en máximo **20 días** desde la recepción; si procede, se hace efectiva en los **15 días** siguientes a la comunicación; ampliables **una sola vez** por un periodo igual |
| 33, 34 | Causas de negativa; gratuidad salvo costos de reproducción o envío |
| 35, 36 | Transferencias y excepciones al consentimiento |
| 40 | Solicitud de protección ante la Secretaría dentro de los **15 días** siguientes a la respuesta, o vencido el plazo sin ella |

No se revisó el Reglamento. Los textos son un ejercicio académico y no sustituyen asesoría legal.

## R-14 Textos y página pública

- **Decisión**: fuentes en `database/legal/*.txt` (máximo 20,000 caracteres cada campo; saltos de línea normalizados). `publish-terms` publica la versión 2; `build-privacy-page` genera la página; una prueba de Jest compara el texto.
- **Qué pueden afirmar los textos** (código): contraseñas con bcrypt y política de 8 caracteres; bitácora sin purga que guarda el identificador tecleado en intentos fallidos; no se guardan datos de tarjeta; pagos digitales simulados; la sesión vive en memoria; no hay borrado automático. La atención ARCO es manual y el texto no promete funciones inexistentes.
- **Por confirmar en el navegador** (tramo 4): recursos pedidos a terceros. La compilación referencia `fonts.gstatic.com` (probado).
- **Cuidado**: el sistema no recaba consentimientos de clientes; el texto describe ese paso como procedimiento del taller ficticio, nunca como función del sistema.
- **Proveedores**: TiDB Cloud y Render se describen como personas encargadas con alojamiento fuera de México (interpretación académica de los artículos 2 y 35).

## R-15 Acciones de plataforma en web (dependencia nueva)

- **Hechos**: la compilación web actual termina bien (probado), pero CSV y ticket usan `dart:io` (código).
- **Decisión**: una exportación condicional `dart.library.io` / `dart.library.js_interop` y `package:web`.
- **Justificación de `web`**: paquete del equipo de Dart para las APIs del navegador, reemplaza a `dart:html`, gratuito y ya presente de forma transitiva (1.1.1).
- **Alternativa**: `dart:html` (obsoleto).

## R-16 Compilación del cliente

- **Hechos**: con `--dart-define` la salida no contiene `localhost:3000` (probado). `--no-web-resources-cdn` existe (probado).
- **Decisión**: `client/tool/build_web.ps1 -ApiUrl` valida HTTPS y el sufijo `/api`, compila sin CDN y comprueba la salida.
- La salida incluye un service worker: tras republicar puede hacer falta recargar dos veces.

## R-17 Publicación del cliente

- **Decisión** (del usuario): rama huérfana `despliegue-web` con solo el contenido de `client/build/web`, creada en un `git worktree` aparte para no alterar la carpeta de trabajo, con `.gitattributes` `* -text` para no convertir archivos. En Render: comando de construcción `echo listo`, carpeta publicada `.`.
- **Por comprobar**: que Render acepte ese comando mínimo.

## R-18 Datos de demostración

- **Decisión**: `database/demo/seed-demo.mjs`, fuera de `database/seeds/`. Sin identificadores fijos (TiDB desaconseja mezclar identificadores propios y automáticos), con claves naturales y una transacción por agregado. Ver [data-model.md](./data-model.md).
- **Contraseñas publicadas**: se rechazan comparando contra los hashes del seed 001 y buscando la candidata en los documentos del repositorio, sin copiar ninguna al script.

## R-19 Comprobaciones de lectura

- **Hechos** (código): panel, pagos y ticket escriben al consultarse; un acceso fallido escribe en la bitácora; el acceso correcto y la consulta de términos vigentes no escriben.
- **Decisión**: `server/scripts/smoke-readonly.js` con lista cerrada de peticiones permitidas. Que no cambiaron datos se comprueba con `check-schema --conteos --huellas` antes y después: filas y huella SHA-256 del contenido de cada tabla.
- **Razón**: los conteos solos no detectan actualizaciones.

## R-20 Escenarios locales existentes

- **Hechos** (código): P1 requiere migraciones y seeds 001–010; P2, hasta 011; P3 recrea `motorix_test` y siembra 001–012. Las contraseñas de ejemplo son las del seed.
- **Decisión**: `apply-seeds --hasta=NNN`; recrear `motorix_test` local antes de P1 y de P2. No se editan los guiones.
