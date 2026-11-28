# Enmienda a la constitución de Motorix: versión 2.0.0

**Estado**: **aprobada** el 2026-11-28, filas 1 a 12, por el equipo (consultado por Raul Francisco Amador). Registro en `docs/evidencias/sprint-9-despliegue/01-enmienda.md`.
**Motivo**: mini-sprint 009 (despliegue y cumplimiento).
**Uso**: este es el único texto que el equipo aprueba. La tarea T006 lo copia a `.specify/memory/constitution.md` sin reinterpretarlo.

## 1. Qué cambia respecto a lo ya aprobado

Lo ya aprobado es **un solo cambio**: «MySQL local» pasa a «MySQL o TiDB compatible». Todo lo marcado como **nuevo** va más allá y necesita aprobación expresa.

| # | Antes | Después | Estado | Si no se aprueba |
|---|---|---|---|---|
| 1 | Base de datos MySQL local | MySQL o una base compatible, como TiDB | **Ya aprobado** | — |
| 2 | Prohibidos la base en la nube y su hosting | Base alojada permitida para el despliegue; desarrollo y pruebas siguen en MySQL local | **Nuevo** | No hay despliegue |
| 3 | Pruebas solo en local contra `motorix_test` | También en una base alojada cuyo nombre termine en `_test`; las comprobaciones sobre el sistema publicado no modifican datos | **Nuevo** | No se puede comprobar TiDB ni la dirección pública |
| 4 | InnoDB, llaves foráneas y `utf8mb4` en todo caso | InnoDB en MySQL; en una base compatible se declaran llaves foráneas y `utf8mb4`, se comprueba qué hace cumplir y se documenta lo que no | **Nuevo** | TiDB no usa InnoDB: queda en conflicto |
| 5 | Esquema solo con scripts numerados; no se editan los aplicados | Igual, más variantes SQL para una base compatible, con el mismo nombre | **Nuevo** | Si TiDB rechaza una migración, no hay salida |
| 6 | Esquema **y datos iniciales** solo con scripts SQL | El esquema sigue solo en SQL; la carga de demostración y la publicación de textos legales pueden usar JavaScript y archivos de texto | **Nuevo** | No se pueden recibir contraseñas por variable de entorno |
| 7 | Conexión con cinco variables | Se agrega `DB_SSL`; TLS verificado obligatorio hacia una base alojada | **Nuevo** | TiDB no acepta la conexión |
| 8 | La aplicación usa un usuario dedicado, nunca `root` | Se mantiene y se endurece: también scripts y pruebas, tampoco la cuenta administradora; si no se puede crear el usuario, no se despliega | **Nuevo** (más estricto) | Sigue la regla actual |
| 9 | Los seeds aportan los datos de ejemplo | En el despliegue los aporta la carga de demostración | **Nuevo** | La carga de demostración no contaría como datos del sprint |
| 10 | Librerías de apoyo listadas | Se agregan `express-rate-limit` y `web`, justificadas | **Nuevo** | No hay límite de intentos ni exportación en web |
| 11 | Hosting como decisión pendiente | Resuelto: TiDB Cloud Starter y Render, planes gratuitos | **Nuevo** | Queda pendiente |
| 12 | Versión 1.0.0 | Versión 2.0.0, ratificación pendiente | **Nuevo** | — |

**Sin cambios**: principios I, II y IV a VIII, ES Modules en el backend, acceso a la base solo desde el backend y gobernanza.

## 2. Texto a aprobar

### 2.1 Principio III (sustituye el actual completo)

### III. Stack Tecnológico y Base de Datos

- Los seeds DEBEN incluir datos de ejemplo suficientes para que la aplicación
  muestre información al arrancar. La base no puede quedar vacía tras la instalación
  inicial. En el despliegue, esos datos los aporta la carga de demostración.
- Frontend: Flutter con Dart, interfaz responsiva y consumo de API REST.
- Backend: Node.js (versión LTS) con Express y JavaScript.
- **Sistema de módulos del backend (NO NEGOCIABLE):** todo el código JavaScript del
  backend DEBE usar ES Modules (`import`/`export`). NO se usa CommonJS
  (`require`/`module.exports`). `package.json` del backend DEBE declarar
  `"type": "module"`.
- Base de datos: MySQL o una base compatible con MySQL, como TiDB. En desarrollo y
  pruebas se usa MySQL local; para el despliegue PUEDE usarse una base alojada en la
  nube.
- Autenticación: JWT con contraseñas cifradas mediante bcrypt.
- Login: acepta usuario (`username`) o correo electrónico (`email`) en el mismo campo,
  para todos los roles.
- NO se introducen tecnologías o dependencias grandes sin justificar su necesidad.
- Cada integrante DEBE usar su propia instancia local de MySQL para desarrollar y
  probar. En una base alojada solo se permiten pruebas sobre una base cuyo nombre
  termine en `_test`. Sobre el sistema publicado, las pruebas y comprobaciones NO
  DEBEN modificar datos; usarlo a mano para la demostración y su evidencia es uso
  normal del sistema.
- El esquema DEBE definirse con scripts SQL versionados en la carpeta `database/`
  (`migrations/`, `seeds/`, `scripts/` y un `README.md`), de modo que la base pueda
  recrearse desde cero. Los cambios de esquema se agregan como nuevos scripts
  numerados; NO se editan scripts de sprints ya aplicados. Si una base compatible no
  admite una migración, PUEDE agregarse una variante SQL con el mismo nombre en
  `database/migrations/tidb/`, que produzca el mismo esquema y se registre una sola
  vez con el nombre original.
- Los datos iniciales DEBEN definirse con scripts versionados en `database/`, en SQL
  dentro de `seeds/`. Como excepción, la carga de demostración del despliegue y la
  publicación de textos legales PUEDEN usar scripts en JavaScript con ES Modules, con
  sus textos como archivos fuente, porque reciben secretos por variables de entorno o
  publican documentos. Esos scripts DEBEN poder repetirse sin duplicar, tener pruebas
  contra una base `_test`, exigir confirmación de la base de destino y NO contener
  secretos. Los seeds de ejemplo locales NO se ejecutan en producción.
- Los archivos físicos de datos de MySQL NO se versionan; si se usa un directorio de datos
  dentro del proyecto (por ejemplo `database/data/`), DEBE estar en `.gitignore`.
- La conexión DEBE configurarse solo con variables de entorno (`DB_HOST`, `DB_PORT`,
  `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`). Hacia una base alojada DEBE usarse
  TLS con verificación del certificado. `.env.example` incluye las variables sin
  secretos.
- La aplicación, los scripts y las pruebas DEBEN conectarse con un usuario dedicado al
  proyecto, NUNCA con `root` ni con la cuenta administradora, tampoco en una base
  alojada. Si el proveedor no permite crear ese usuario, NO se despliega.
- En MySQL se DEBE usar InnoDB. En toda base se DEBEN declarar llaves foráneas para
  mantener la integridad referencial y usar codificación `utf8mb4`. En una base
  compatible DEBE comprobarse qué restricciones hace cumplir y documentarse las que no.
- Solo el backend accede a la base de datos; el frontend NUNCA se conecta directamente.
- Justificación: un conjunto de tecnologías acotado y conocido por el equipo reduce
  riesgos en un proyecto con tiempo limitado.

### 2.2 Sección «Tecnologías y Dependencias» (sustituye la actual completa)

## Tecnologías y Dependencias

- Núcleo permitido: Flutter/Dart, Node.js, Express, MySQL o una base compatible como
  TiDB, JWT, bcrypt, Jest.
- Sistema de módulos del backend (NO NEGOCIABLE): ES Modules (`import`/`export`), nunca
  CommonJS. `package.json` del backend DEBE declarar `"type": "module"`.
- Frontend: Material Design 3 con tema propio (`docs/design-system.md`) y Provider para
  estado. Librerías de apoyo permitidas: `google_fonts`, `fl_chart`, `data_table_2`,
  `web` y un único set de íconos.
- Sistema de diseño: ver `docs/design-system.md`. Es de cumplimiento obligatorio para
  cualquier pantalla del frontend.
- Integración externa: Mercado Pago (modo sandbox/pruebas en etapas tempranas).
- Priorizar alternativas gratuitas o de bajo costo cuando sean suficientes.
- NO agregar librerías para lo que se pueda resolver con pocas líneas de código.
- Toda dependencia nueva DEBE justificarse antes de agregarse.
- Dependencias agregadas en el mini-sprint 009, ambas gratuitas:
  - `express-rate-limit` (servidor): límite de intentos en el inicio de sesión y el
    cambio de contraseña. Resuelve la ventana de tiempo, el conteo con peticiones
    simultáneas, las direcciones IPv6 y los avisos de proxy mal configurado, que a
    mano son fáciles de equivocar.
  - `web` (cliente): paquete del equipo de Dart para las APIs del navegador; permite
    descargar archivos e imprimir en la versión web en lugar de `dart:html`.

### 2.3 Sección «Flujo de Desarrollo» (sustituye solo el último punto)

- Cada sprint DEBE terminar con seeds que permitan ver la funcionalidad del sprint
  con datos reales en la interfaz, sin capturarlos a mano. En un sprint de despliegue,
  la carga de demostración cumple esta función.

### 2.4 Sección «Decisiones Pendientes»

Sustituir el punto «Servicio de hosting y proveedor de almacenamiento.» por:

- Proveedor de almacenamiento de archivos.

Agregar al final de la sección:

### Decisiones resueltas en el mini-sprint 009

- **Hosting del despliegue**: TiDB Cloud Starter para la base de datos y Render para
  la API y el sitio estático del cliente web, en planes gratuitos.

### 2.5 Encabezado y pie

Agregar al reporte de impacto del encabezado:

- Enmienda 2.0.0 (mini-sprint 009): cambio de versión 1.0.0 → 2.0.0. Se redefine el
  Principio III (motor compatible, base alojada para el despliegue, datos iniciales con
  scripts no SQL en casos acotados, variantes de migraciones, TLS y usuario dedicado).
  Se actualizan «Tecnologías y Dependencias», «Flujo de Desarrollo» y «Decisiones
  Pendientes». Documentos por alinear: `docs/project-context.md`, `docs/reglas.md`,
  `README.md` y `database/README.md`.

Sustituir el pie por (la fecha es la de aprobación):

**Versión**: 2.0.0 | **Redactada**: 2026-10-01 | **Ratificación**: pendiente del equipo | **Última enmienda**: fecha de aprobación

## 3. Registro de aprobación

La aprobación se anota en `docs/evidencias/sprint-9-despliegue/01-enmienda.md`: fecha, quién aprueba (según «Gobernanza») y filas de la tabla aprobadas.
