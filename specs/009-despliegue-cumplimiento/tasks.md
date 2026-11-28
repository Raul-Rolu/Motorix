---

description: "Lista de tareas de la feature 009-despliegue-cumplimiento"
---

# Tareas: Despliegue y cumplimiento

**Input**: documentos de `specs/009-despliegue-cumplimiento/`: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/) y [quickstart.md](./quickstart.md).

**Entrega**: lunes 30 de noviembre de 2026.

**Pruebas**: obligatorias (FR-041). En cada historia se escriben primero, se comprueba que fallan y después se implementa.

## Formato: `[ID] [P?] [Historia] Descripción`

- **[P]**: puede hacerse en paralelo (archivos distintos y sin depender de tareas pendientes).
- **[US1]…[US6]**: historia de usuario de la especificación.
- **USUARIO**: solo la ejecuta la persona usuaria (proveedores, `motorix`, git o aprobación). El agente se detiene ahí, indica **un comando a la vez** y espera la verificación.

## Reglas para todas las tareas

- No ejecutar `git add`, `commit` ni `push`, ni crear ramas: lo hace el usuario.
- Pruebas solo contra `motorix_test`. `motorix` (local o nube) solo lo toca el usuario, con respaldo previo.
- Ninguna contraseña, secreto ni cadena de conexión en el repositorio, la evidencia o la conversación. Las pruebas generan sus contraseñas al ejecutarse.
- Comentarios, mensajes y nombres de pruebas en español; identificadores y nombres de archivos de código en inglés.
- La evidencia va en `docs/evidencias/sprint-9-despliegue/` en UTF-8.

## Orden de las fases

Las fases siguen el orden por riesgo acordado en el plan: US1 → US2 → **US4 → US3** → **US6 → US5**. El número de historia es el de la especificación.

---

## Fase 1: Preparación (tramo 0, viernes noche)

- [X] T001 USUARIO: ejecutar los pasos 0.1 a 0.3 de `specs/009-despliegue-cumplimiento/quickstart.md` (rama correcta; instancia TiDB Cloud Starter en AWS `us-west-2` con límite de gasto 0; bases `motorix_test` y `motorix` con `utf8mb4` y `utf8mb4_unicode_ci`; usuario dedicado). Si no se puede crear el usuario dedicado, **detenerse**: no se usa `root` ni la cuenta administradora
- [X] T002 USUARIO: crear `$HOME\motorix-nube-test.env` (fuera del repositorio y de OneDrive) con las variables de `specs/009-despliegue-cumplimiento/contracts/configuracion.md` y comprobar que la terminal no tenga `DB_*` (pasos 0.4 y 0.5)
- [X] T003 USUARIO: crear la cuenta de Render conectada a GitHub, sin método de pago, y comprobar que el `JWT_SECRET` de `server/.env` mida 32 caracteres o más sin mostrarlo (pasos 0.6 y 0.7)
- [X] T004 [P] Crear `docs/evidencias/sprint-9-despliegue/README.md` con el índice de evidencias esperadas (FR-038) y la regla de no incluir contraseñas, secretos ni cadenas de conexión
- [X] T005 Registrar la línea base en `docs/evidencias/sprint-9-despliegue/00-linea-base.txt`: `npm.cmd test` en `server` (109 suites, 1329 pruebas) y `flutter test` en `client` (351 pruebas); si no coincide, detenerse e informar

---

## Fase 2: Fundamentos (bloquea todo lo demás)

**Objetivo**: la constitución permite el despliegue antes de tocar código.

- [X] T006 Aplicar a `.specify/memory/constitution.md` el texto de la sección 2 de `specs/009-despliegue-cumplimiento/contracts/enmienda-constitucion.md`, sin reinterpretarlo ni agregar cambios (versión 2.0.0; Principio III, «Tecnologías y Dependencias» con la justificación de `express-rate-limit` y `web`, «Flujo de Desarrollo», «Decisiones Pendientes», reporte de impacto y pie); si el equipo pide cambios, corregir primero ese archivo (FR-001, FR-003)
- [X] T007 [P] Actualizar en `docs/project-context.md` las afirmaciones de base solo local, sin nube ni hosting y aplicación solo de escritorio, y registrar el mini-sprint 009 (FR-002)
- [X] T008 [P] Alinear `docs/reglas.md` con la enmienda de la constitución (FR-002)
- [X] T009 [P] Actualizar `README.md` y `database/README.md`: cliente de escritorio y web, base local o compatible en la nube y requisito `npm ci` en `server` antes de usar los scripts (FR-002)
- [X] T010 USUARIO: enviar al equipo `specs/009-despliegue-cumplimiento/contracts/enmienda-constitucion.md`, señalando las filas nuevas respecto a lo ya aprobado, obtener la aprobación según la sección de gobernanza y anotar fecha, quién aprueba y filas aprobadas en `docs/evidencias/sprint-9-despliegue/01-enmienda.md` (paso 1.1). **No continuar sin este paso**

---

## Fase 3: Historia de usuario 1 - Base de datos en la nube lista (Prioridad: P1) 🎯 MVP

**Objetivo**: crear el esquema completo en TiDB sin romper MySQL local, con TLS, hora de Ciudad de México y pool correcto.

**Prueba independiente**: aplicar las migraciones desde un clon limpio sobre `motorix_test` vacía, en la nube y en local, y comparar el esquema.

### Pruebas de US1 (tramo 1; escribirlas primero)

- [ ] T011 [P] [US1] Prueba unitaria en `server/tests/unit/db-options.test.js`: con `DB_SSL=true` se obtiene `ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }`; sin la variable o con otro valor no hay clave `ssl`; puerto por omisión 3306; los errores no incluyen la contraseña (FR-004)
- [ ] T012 [P] [US1] Prueba unitaria en `server/tests/unit/migration-files.test.js`: la variante se usa solo si `SELECT VERSION()` contiene `TiDB` y existe el archivo; se registra con el nombre original; el orden es numérico; en MySQL se usan los originales; la subcarpeta `tidb/` no cuenta como migración (FR-007, FR-008)
- [ ] T013 [P] [US1] Prueba unitaria en `server/tests/unit/migration-variants.test.js`: existen solo las variantes 016, 017 y 020; ninguna sentencia combina `ADD COLUMN` con `ADD CONSTRAINT`; conservan los nombres de columnas, índices y restricciones de los originales; en la 020 el índice se crea antes de la llave foránea (FR-007)
- [ ] T014 [P] [US1] Prueba unitaria en `server/tests/unit/database-scripts.test.js`: ningún `.mjs` de `database/` importa `mysql2`, `dotenv` ni `bcrypt` por nombre; con `--sin-env` no se carga `server/.env`; la línea de destino enmascara el servidor; `apply-seeds` se niega con `DB_SSL=true` sobre una base que no termine en `_test`; `--hasta=NNN` limita los seeds (FR-009)
- [ ] T015 [P] [US1] Prueba de integración en `server/tests/integration/check-schema.test.js` sobre `motorix_test`: 23 migraciones registradas, firma de esquema estable entre dos corridas, `--conteos` por tabla, `--probar-restricciones` no deja filas y se rechaza en bases sin sufijo `_test`; funciona sobre una base vacía (FR-010). Además: en `server/tests/unit/schema-signature.test.js`, la normalización y `--comparar` según «Comparación de esquemas» de `contracts/scripts.md` (igualan formato, aceptan solo las 2 diferencias declaradas y fallan ante una llave foránea o columna distinta); en `check-schema.test.js`, `--huellas` es estable sin cambios y varía al actualizar una fila sin variar los conteos; y en `server/tests/integration/backup-data.test.js`, exportar, restaurar en una base `_test` migrada y vacía deja las mismas huellas, se rechazan rutas dentro del repositorio, sobrescribir y restaurar sobre una base con filas o sin `--confirmar` (FR-007)

### Implementación de US1: migraciones y TLS (tramo 1)

- [ ] T016 [US1] Crear `server/config/db-options.js`, sin dependencias, que arme desde el entorno las opciones de conexión (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y TLS con `DB_SSL`) (R-04)
- [ ] T017 [US1] Usar `db-options.js` en `server/config/db.js` sin cambiar el comportamiento local
- [ ] T018 [US1] Crear `server/config/migration-files.js`: lista las migraciones `.sql`, detecta TiDB y devuelve para cada una el nombre original y la ruta a ejecutar (R-02)
- [ ] T019 [P] [US1] Crear `database/migrations/tidb/016_add_part_prices.sql` con una operación por sentencia, equivalente al original
- [ ] T020 [P] [US1] Crear `database/migrations/tidb/017_part_purchase_price_stale.sql` con una operación por sentencia, equivalente al original, incluido el valor `STALE` de `payments.status`
- [ ] T021 [P] [US1] Crear `database/migrations/tidb/020_create_service_types.sql`: tabla, columna, índice y llave foránea en sentencias separadas
- [ ] T022 [US1] Crear `database/scripts/cli.mjs`: lectura de argumentos, carga de `server/.env` salvo `--sin-env`, importación de dependencias por ruta desde `server/node_modules` y primera línea con base, servidor enmascarado, TLS y desfase horario (R-03, contrato `contracts/scripts.md`)
- [ ] T023 [US1] Adaptar `database/scripts/apply-migrations.mjs`: usar `cli.mjs` y `migration-files.js`, indicar qué migraciones usaron variante y cuántas aplicó; al fallar, nombrar la migración y no registrarla
- [ ] T024 [US1] Adaptar `database/scripts/apply-seeds.mjs`: usar `cli.mjs`, agregar `--hasta=NNN` y la negativa con `DB_SSL=true` fuera de bases `_test`
- [ ] T025 [US1] Crear `database/scripts/check-schema.mjs` y `database/scripts/backup-data.mjs` según `contracts/scripts.md`: versión del servidor, migraciones, firma normalizada de tablas, columnas, índices y restricciones, llaves foráneas y `CHECK`, `--conteos`, `--huellas`, `--probar-restricciones`, `--salida` y `--comparar`/`--con`; exportación y restauración comprobadas
- [ ] T026 [US1] Adaptar `server/tests/helpers/db-test.js`: usar `db-options.js` y `migration-files.js`, y negarse a operar si el nombre de la base no termina en `_test`; cubrir la negativa en `server/tests/unit/db-test-guard.test.js`
- [ ] T027 [US1] Ejecutar `npm.cmd test` en `server` contra `motorix_test` local y guardar la salida en `docs/evidencias/sprint-9-despliegue/02-suite-tramo1.txt`
- [ ] T028 [US1] USUARIO: en local, ejecutar los pasos 1.2 a 1.4 de `quickstart.md` y generar `docs/evidencias/sprint-9-despliegue/esquema-local.json`
- [ ] T029 [US1] USUARIO: ejecutar los pasos 1.5 a 1.9 sobre TiDB `motorix_test` (TLS, intento de activar `CHECK`, 23 migraciones, segunda corrida con 0) y guardar `docs/evidencias/sprint-9-despliegue/03-migraciones-tidb.txt` y `esquema-tidb.json`
- [ ] T030 [US1] USUARIO: ejecutar los pasos 1.10 a 1.12 (comparación normalizada de esquemas con `--comparar`, que debe terminar sin error, y las 11 suites de R-07, una por vez); ante una migración a medias, seguir «Si una migración falla a la mitad» de `quickstart.md` y guardar `docs/evidencias/sprint-9-despliegue/04-pruebas-tidb.txt`
- [ ] T031 [US1] Resolver lo que fallara en T029 o T030 (nueva variante en `database/migrations/tidb/` o consulta en `server/models/report.js` o `server/models/part.js`, sin cambiar resultados en local) y documentar qué llaves foráneas y `CHECK` se cumplen en `docs/evidencias/sprint-9-despliegue/05-restricciones-tidb.md` (FR-010)

**Compuerta del sábado 13:00**: si las 23 migraciones no pasan en TiDB, detenerse; la decisión es del usuario.

### Zona horaria y pool (inicio del tramo 2)

- [ ] T032 [P] [US1] Ampliar `server/tests/unit/db-options.test.js`: desfase derivado de la zona del proceso (`-06:00` para `America/Mexico_City`), `maxIdle: 2` e `idleTimeout: 240000` (FR-005, FR-006)
- [ ] T033 [P] [US1] Prueba de integración en `server/tests/integration/timezone.test.js`: `@@session.time_zone` coincide con el desfase del proceso en conexiones nuevas del pool, y la fecha de `NOW()` coincide con la local, incluido un caso a las 19:00 de Ciudad de México que no cambie de día (FR-005)
- [ ] T034 [US1] Implementar en `server/config/db-options.js` y `server/config/db.js` el `SET time_zone` por conexión y los valores del pool (R-05, R-06)
- [ ] T035 [US1] Aplicar la misma zona horaria en `database/scripts/cli.mjs` y `server/tests/helpers/db-test.js`

**Punto de control**: US1 funciona y se prueba por sí sola.

- [ ] T036 [US1] USUARIO: revisar `git status` (sin archivos `.env`), hacer commit del tramo 1 y confirmar la compuerta en `docs/evidencias/sprint-9-despliegue/README.md`

---

## Fase 4: Historia de usuario 2 - API preparada para internet (Prioridad: P2, tramo 2)

**Objetivo**: CORS, proxy, límite de intentos, salud, validación de arranque y versión de Node, según `contracts/api-cambios.md`.

**Prueba independiente**: pruebas del servidor con la configuración de producción simulada contra `motorix_test`.

### Pruebas de US2 (escribirlas primero)

- [ ] T037 [P] [US2] Prueba unitaria en `server/tests/unit/env-check.test.js`: rechaza `JWT_SECRET` ausente, de menos de 32 caracteres o igual al valor de ejemplo; `TRUST_PROXY` entero de 0 a 5; ningún mensaje muestra valores (FR-016)
- [ ] T038 [P] [US2] Prueba de contrato en `server/tests/contract/cors.contract.test.js`: origen permitido con `Access-Control-Allow-Origin`, `Vary: Origin` y exposición de `Content-Disposition`; preflight 204 con métodos `GET, POST, PUT, PATCH, DELETE, OPTIONS`, cabeceras `Authorization, Content-Type` y `Max-Age` 600; origen ajeno o sin configurar sin cabeceras CORS; peticiones sin `Origin` sin cambios (FR-011)
- [ ] T039 [P] [US2] Prueba de contrato en `server/tests/contract/rate-limit.contract.test.js`: tras 10 respuestas 4xx en 15 minutos la siguiente da 429 `DEMASIADOS_INTENTOS`; contador compartido entre `login` y `change-password`; los correctos no cuentan; otro origen entra; con `TRUST_PROXY=0` una cabecera `X-Forwarded-For` falsa no cambia el origen; los rechazos no escriben en `audit_log` ni revelan si la cuenta existe (FR-012, FR-013, FR-014)
- [ ] T040 [P] [US2] Prueba de contrato en `server/tests/contract/health.contract.test.js`: 200 con `estado: "ok"`; 503 con `estado: "degradado"` y `baseDatos: "error"` si la base falla o tarda más de 3 s; `LOG_CLIENT_IP=true` registra la IP sin cambiar la respuesta (FR-015)
- [ ] T041 [P] [US2] Prueba de integración en `server/tests/integration/startup-validation.test.js`: `server.js` termina con código distinto de 0 ante un secreto débil; ajustar `server/tests/integration/audit-login-servidor-real.test.js` para entregar al proceso un secreto de prueba válido generado al ejecutarse (FR-016)

### Implementación de US2

- [ ] T042 [US2] Instalar `express-rate-limit@^8.7.5` y declarar `"engines": { "node": ">=24.0.0 <26.0.0" }` en `server/package.json` y `server/package-lock.json` (FR-003, FR-017)
- [ ] T043 [P] [US2] Crear `server/utils/env-check.js` con las reglas de `JWT_SECRET` y `TRUST_PROXY`
- [ ] T044 [P] [US2] Crear `server/middlewares/cors.js` propio, con orígenes exactos de `CORS_ORIGIN` separados por coma y sin `/` final (R-08)
- [ ] T045 [P] [US2] Crear `server/middlewares/rate-limit.js` (fábrica: 10 fallos, 15 minutos, cuentan solo 4xx) y agregar `demasiadosIntentos` en `server/utils/errors.js` con el mensaje «Demasiados intentos fallidos. Espere 15 minutos y vuelva a intentar.»
- [ ] T046 [US2] Integrar en `server/app.js`: `trust proxy` desde `TRUST_PROXY`, CORS antes de las rutas, un limitador por instancia en `/api/auth/login` y `/api/auth/change-password`, opciones de `crearApp()` solo para pruebas, salud 503 con límite de 3 s y registro temporal de IP (R-10, R-11)
- [ ] T047 [US2] Validar el entorno antes de escuchar y ampliar el diagnóstico (base, TLS, desfase) en `server/server.js`
- [ ] T048 [P] [US2] Documentar en `server/.env.example` `DB_SSL`, `TZ`, `CORS_ORIGIN`, `TRUST_PROXY`, `LOG_CLIENT_IP` y las tres `DEMO_*` sin valores secretos
- [ ] T049 [US2] Ejecutar `npm.cmd test` completo; si una suite supera el límite de intentos, ajustar solo su `crearApp()`; guardar `docs/evidencias/sprint-9-despliegue/06-suite-tramo2.txt`
- [ ] T050 [US2] USUARIO: ejecutar los pasos 2.2 a 2.6 de `quickstart.md` (uno por vez), guardar `docs/evidencias/sprint-9-despliegue/07-api-local.txt` y hacer commit del tramo 2

**Punto de control**: US1 y US2 funcionan.

---

## Fase 5: Historia de usuario 4 - Textos legales propios (Prioridad: P4, tramo 3)

**Objetivo**: términos y aviso (integral y simplificado) propios, publicados como versión 2, y página pública del aviso.

**Prueba independiente**: publicar en `motorix_test`, abrir la página sin sesión y revisar la lista de elementos y la tabla de afirmaciones.

### Pruebas de US4 (escribirlas primero)

- [ ] T051 [P] [US4] Prueba unitaria en `server/tests/unit/legal-texts.test.js`: cada archivo «entre 20 y 20,000 caracteres» con saltos de línea normalizados; nota de ejemplo académico; «Secretaría Anticorrupción y Buen Gobierno»; apartados para las fracciones I a VI del artículo 15; aviso simplificado con las fracciones I a IV y el sitio del integral; plazos de 20 días hábiles, 15 días y una ampliación; solicitud ante la Secretaría en 15 días; requisitos de la solicitud del artículo 28 (nombre y domicilio o medio para notificaciones; documentos de identidad o representación; descripción clara de los datos, salvo en el derecho de acceso; derecho que se ejerce; elementos que faciliten localizar los datos); persona o área designada para el trámite (artículo 29); gratuidad, con cobro solo por costos de reproducción, copias o envío (artículo 34); política de 8 caracteres con mayúscula, minúscula y número; nube fuera de México; HTTPS; límite de intentos (FR-023 a FR-028)
- [ ] T052 [P] [US4] Prueba unitaria en `server/tests/unit/privacy-page.test.js`: el texto de `client/web/aviso-privacidad.html` coincide con `database/legal/aviso-privacidad-v2.txt` e indica la diferencia si no; muestra «Versión 2», sin guiones ni recursos externos y con el texto escapado; los colores se leen de `client/lib/config/theme.dart` al ejecutar la prueba (`acento` `#2E7D32`, `fondo`, `superficie`, `borde`, `textoPrincipal`, `textoSecundario`) y la página no usa ningún otro, en particular ninguno de la paleta de `docs/design-system.md`; los espaciados y el radio coinciden con `MotorixEspaciados` (4, 8, 16, 24, 32 y radio 8); la fuente es Roboto con respaldo del sistema y los tamaños y pesos son 28/400, 22/400, 16/500, 14/400 y 12/400; todo se declara una vez como variables, sin sombras ni degradados (FR-029)
- [ ] T053 [P] [US4] Prueba de integración en `server/tests/integration/publish-terms.test.js`: sin versión 2 ni posterior inserta `version = 2` y `TERMS_PUBLISHED`; mismo texto no hace nada; versión 2 distinta, o posterior sin la 2, se detiene sin escribir; nunca inserta aceptaciones ni modifica versiones; exige `--confirmar=<base>`; las cuentas quedan obligadas a aceptar (FR-027)

### Implementación de US4

- [ ] T054 [P] [US4] Redactar con palabras propias `database/legal/terminos-v2.txt` para un taller ficticio con contacto `@ejemplo.com`, describiendo solo lo que el sistema hace y declarando los pagos digitales como simulados (FR-023, FR-026, FR-039)
- [ ] T055 [P] [US4] Redactar `database/legal/aviso-privacidad-v2.txt` (integral y simplificado) según R-13 y R-14: datos realmente tratados, sin datos sensibles solicitados, bitácora sin purga, sin datos de tarjeta, atención ARCO manual sin prometer borrado automático, con los requisitos de la solicitud (artículo 28), la persona o área designada (artículo 29) y la gratuidad salvo costos de reproducción, copias o envío (artículo 34), personas encargadas en la nube fuera de México, revocación y comunicación de cambios; no presentar como función del sistema el consentimiento de clientes (FR-024, FR-025, FR-026)
- [ ] T056 [US4] Crear `docs/evidencias/sprint-9-despliegue/afirmaciones-textos.md`: cada afirmación técnica con su comprobación en código o prueba, lista de elementos legales con su apartado, incluidos los de los artículos 15, 28, 29 y 34, y artículo, fuente oficial y fecha de consulta 2026-11-27 de cada plazo (FR-024, FR-025, FR-026, SC-008)
- [ ] T057 [US4] Crear `database/scripts/build-privacy-page.mjs` y generar `client/web/aviso-privacidad.html` (legible, sin guiones ni recursos externos) con los colores, la tipografía y los espaciados reales de la aplicación (`client/lib/config/theme.dart`), según la tabla «Página pública del aviso» de `contracts/cliente-web.md`; no usar la paleta de `docs/design-system.md` (FR-029, deuda D1)
- [ ] T058 [US4] Crear `database/scripts/publish-terms.mjs`: función reutilizable y línea de órdenes según `contracts/scripts.md` y la tabla de estados de `data-model.md`
- [ ] T059 [US4] Ejecutar las pruebas T051 a T053 y `server/tests/integration/seed-terms.test.js`; guardar `docs/evidencias/sprint-9-despliegue/08-textos.txt`
- [ ] T060 [US4] USUARIO: leer y aprobar los textos y ejecutar los pasos 3.1 a 3.7 de `quickstart.md`; hacer commit del tramo 3 (`database/legal/`)

**Punto de control**: textos aprobados y publicables.

---

## Fase 6: Historia de usuario 3 - Cliente en el navegador (Prioridad: P3, tramo 4)

**Objetivo**: exportar CSV, imprimir ticket y enlazar el aviso en web sin cambiar el escritorio, según `contracts/cliente-web.md`.

**Prueba independiente**: compilar para web contra una API de prueba, exportar los 5 reportes e imprimir un ticket.

### Pruebas de US3 (escribirlas primero)

- [ ] T061 [P] [US3] Prueba en `client/test/platform_actions_test.dart`: en escritorio se conserva «Archivo guardado en {ruta}.»; el mensaje de descarga es el que entrega la plataforma; un bloqueo de ventana muestra «El navegador bloqueó la ventana. Permita las ventanas emergentes e intente de nuevo.» (FR-019, FR-020, FR-022)
- [ ] T062 [P] [US3] Prueba en `client/test/login_privacy_link_test.dart`: el enlace «Aviso de privacidad» aparece en modo web y no en escritorio (FR-029, FR-022)
- [ ] T063 [P] [US3] Prueba de navegador en `client/test/web/platform_actions_web_test.dart` (`@TestOn('browser')`): la descarga usa el nombre saneado y conserva los bytes con BOM; el ticket se abre con el mismo HTML; la ventana nula produce el aviso; si `flutter test` intentara compilarla fuera del navegador, moverla a `client/test_web/` y ajustar `quickstart.md` (FR-019, FR-020)

### Implementación de US3

- [ ] T064 [US3] Agregar `web: ^1.1.0` en `client/pubspec.yaml` y actualizar `client/pubspec.lock` (FR-003)
- [ ] T065 [US3] Crear `client/lib/services/platform/platform_actions.dart` (exportación condicional `dart.library.io` / `dart.library.js_interop`) y `platform_actions_stub.dart`
- [ ] T066 [P] [US3] Crear `client/lib/services/platform/platform_actions_io.dart` con el comportamiento actual de guardado y apertura, sin cambios
- [ ] T067 [P] [US3] Crear `client/lib/services/platform/platform_actions_web.dart` con `package:web`: descarga por `Blob`, ticket en pestaña nueva en el mismo gesto y apertura de `aviso-privacidad.html`
- [ ] T068 [US3] Quitar `dart:io` de `client/lib/services/csv_export.dart` (se conserva `sanearNombreCsv`) y usar el mensaje de plataforma en `client/lib/providers/reports_provider.dart`
- [ ] T069 [US3] Quitar `dart:io` de `client/lib/services/ticket_print.dart` (se conservan las funciones de HTML y texto) y mostrar los mensajes de plataforma en `client/lib/screens/ticket_screen.dart`
- [ ] T070 [US3] Agregar el enlace al aviso en `client/lib/screens/login_screen.dart` con los tokens del tema de la aplicación (`MotorixColores`, `MotorixEspaciados`)
- [ ] T071 [P] [US3] Crear `client/tool/build_web.ps1` (parámetro `-ApiUrl`; se invoca con `powershell -ExecutionPolicy Bypass -File client\tool\build_web.ps1 -ApiUrl <url>`, funciona desde la raíz y sale con código distinto de 0 al fallar): rechaza direcciones sin HTTPS, sin `/api` o con `/` final; compila con `--release --no-web-resources-cdn --dart-define=API_BASE_URL`; comprueba que la salida contenga la dirección, no contenga `localhost:3000` e incluya `aviso-privacidad.html` (FR-018, R-16)
- [ ] T072 [US3] Probar `build_web.ps1`, invocado con `powershell -ExecutionPolicy Bypass -File` desde la raíz, con una dirección válida de ejemplo y tres inválidas, y ejecutar `flutter analyze`, `flutter test` y `flutter test --platform chrome test/web`; guardar `docs/evidencias/sprint-9-despliegue/09-suite-web.txt`
- [ ] T073 [US3] USUARIO: ejecutar los pasos 4.5 a 4.10 de `quickstart.md` y anotar en `docs/evidencias/sprint-9-despliegue/10-web-local.md` el resultado de los 5 reportes, el ticket, los dominios de terceros y el escritorio
- [ ] T074 [US3] Si los dominios observados difieren de lo que dice el aviso, corregir `database/legal/aviso-privacidad-v2.txt`, regenerar `client/web/aviso-privacidad.html` y repetir T051 y T052. Solo cuando el aviso sea definitivo, avisar al usuario de que puede hacer los pasos opcionales 4.11 y 4.12 (respaldo y publicación en su `motorix` local)
- [ ] T075 [US3] **Corte del domingo 12:00**: deshabilitar en web, con «No disponible en la versión web; use la aplicación de escritorio.», solo lo que no pasara en T073, con su prueba en `client/test/platform_actions_test.dart`, y anotarlo como deuda; si todo pasó, registrar «no aplica» en `10-web-local.md` (FR-021)
- [ ] T076 [US3] USUARIO: hacer commit del tramo 4 (`client/`)

**Punto de control**: el cliente web funciona o avisa con claridad.

---

## Fase 7: Historia de usuario 6 - Datos de demostración (Prioridad: P6, tramo 5)

**Objetivo**: carga ficticia, coherente y repetible con tres cuentas de contraseñas propias.

**Prueba independiente**: dos ejecuciones sobre `motorix_test` con los mismos conteos y contenido.

### Pruebas de US6 (escribirlas primero)

- [ ] T077 [P] [US6] Prueba unitaria en `server/tests/unit/demo-passwords.test.js` (contraseñas generadas al ejecutarse): rechaza ausentes, de menos de 12 caracteres, sin mayúscula, minúscula o número, repetidas entre cuentas y publicadas (hashes de `database/seeds/001_initial_accounts.sql` o presentes en `README.md`, `database/README.md` o `docs/project-context.md`); ningún mensaje las muestra (FR-031)
- [ ] T078 [P] [US6] Prueba de integración en `server/tests/integration/seed-demo.test.js`, parte de contenido: 3 cuentas (`admin`, `recepcion`, `mecanico`), 7 ajustes, 4 tipos de servicio, 10 clientes con `@ejemplo.com`, 12 vehículos, 12 refacciones (2 bajo mínimo, 1 agotada, 1 sin precio de venta, 1 sin precio de compra, 1 inactiva), 14 órdenes en los 7 estados con cierres del mes anterior y actual y 1 detenida, 12 cobros o más, 2 tickets, 10 citas y 6 mantenimientos; los cinco avisos y datos en los cinco reportes; `stock` = suma de movimientos y nunca negativo; cobros completados sin exceder el total; hechos históricos nunca en el futuro; versión 2 publicada sin aceptaciones (FR-032, FR-033)
- [ ] T079 [P] [US6] Prueba de integración en `server/tests/integration/seed-demo-repeat.test.js`: segunda corrida con los mismos conteos; no deshace cambios hechos desde el sistema ni reactiva cuentas; actualiza solo los tres hashes; sin `--confirmar` igual a `DB_NAME` no escribe; una contraseña inválida no escribe nada; no carga `server/.env`; no inserta identificadores explícitos (FR-034, FR-035)

### Implementación de US6

- [ ] T080 [P] [US6] Crear `database/demo/passwords.mjs` con la validación de las tres variables `DEMO_ADMIN_PASSWORD`, `DEMO_RECEPCION_PASSWORD` y `DEMO_MECANICO_PASSWORD`
- [ ] T081 [P] [US6] Crear `database/demo/data.mjs` con datos evidentemente ficticios, cantidades, variedad y claves naturales de la tabla de `data-model.md`
- [ ] T082 [US6] Crear `database/demo/seed-demo.mjs`: valida contraseñas antes de conectar, muestra destino, exige `--confirmar`, acepta `--fecha=AAAA-MM-DD` (por omisión hoy), crea cada agregado en una transacción sin identificadores fijos, reutiliza `publish-terms.mjs`, registra `USER_CREATED` e informa creados y existentes (FR-030, FR-031, FR-033, FR-034, FR-035)
- [ ] T083 [US6] Ejecutar las pruebas T077 a T079 y comprobar que `database/scripts/apply-seeds.mjs` no incluye la demostración (FR-030)
- [ ] T084 [US6] USUARIO: ejecutar los pasos 5.1 a 5.6 de `quickstart.md` (doble corrida local y rechazo) y guardar `docs/evidencias/sprint-9-despliegue/11-demo-doble-corrida.txt`
- [ ] T085 [US6] USUARIO: ejecutar el paso 5.7 sobre TiDB `motorix_test` y agregar su salida a `docs/evidencias/sprint-9-despliegue/11-demo-doble-corrida.txt`
- [ ] T086 [US6] Ejecutar `npm.cmd test` y `flutter test` completos y guardar `docs/evidencias/sprint-9-despliegue/12-suites-finales.txt` (FR-041, SC-009)
- [ ] T087 [US6] USUARIO: hacer commit del tramo 5 (`database/demo/`)

**Punto de control**: la carga es repetible y las suites están en verde.

---

## Fase 8: Historia de usuario 5 - Sistema publicado y comprobado (Prioridad: P5, tramo 6)

**Objetivo**: base, API y cliente publicados sin costo y comprobados sin modificar datos.

**Prueba independiente**: escenarios locales en verde, guía seguida desde cero y comprobaciones de lectura en la dirección pública.

### Pruebas de US5 (escribirlas primero)

- [ ] T088 [P] [US5] Prueba en `server/tests/integration/smoke-readonly.test.js` contra una API local sobre `motorix_test`: solo emite las 8 peticiones de `contracts/scripts.md`; no consulta panel, pagos ni tickets ni acepta términos; se detiene ante el primer acceso fallido; respeta `--terminos-aceptados`; las filas y las huellas de todas las tablas (`check-schema --conteos --huellas`) son idénticas antes y después; no muestra contraseñas ni tokens (FR-037, SC-005)

### Implementación de US5

- [ ] T089 [US5] Crear `server/scripts/smoke-readonly.js` con lista cerrada de peticiones y contraseñas leídas de las variables `DEMO_*`
- [ ] T090 [P] [US5] Completar la guía en `specs/009-despliegue-cumplimiento/quickstart.md` con cualquier diferencia real de los tramos 1 a 5 y enlazarla desde `README.md`, declarando que los pagos digitales son simulados y no registran dinero; comprobar que la guía conserva y refleja lo implementado en «Si una migración falla a la mitad», el respaldo y la restauración, y las advertencias sobre la salud 503 en Render y la publicación de una versión posterior de los términos (FR-036, FR-039)
- [ ] T091 [US5] USUARIO: ejecutar los escenarios locales, pasos 6.1 a 6.5, y guardar `docs/evidencias/sprint-9-despliegue/13-escenarios-locales.txt`; si alguno choca con una regla nueva, ajustar la corrida sin editar los guiones ni debilitar producción y anotar la causa (FR-037)
- [ ] T092 [US5] USUARIO: commit, push, pull request y merge a `main`, comprobando que no viaje ningún `.env` (paso 6.6, `specs/009-despliegue-cumplimiento/quickstart.md`)
- [ ] T093 [US5] USUARIO: crear `$HOME\motorix-nube.env`, comprobar que `motorix` de la nube está vacía (respaldo) y aplicar las migraciones, pasos 6.7 a 6.9; evidencia `docs/evidencias/sprint-9-despliegue/14-migraciones-nube.txt`
- [ ] T094 [US5] USUARIO: crear el Web Service y comprobar salud, pasos 6.10 y 6.11; evidencia `docs/evidencias/sprint-9-despliegue/15-api-publica.txt`
- [ ] T095 [US5] USUARIO: ajustar `TRUST_PROXY`, comprobar que una cabecera falsa no cambia la IP y quitar `LOG_CLIENT_IP`, pasos 6.12 y 6.13; anotar el número en `15-api-publica.txt` sin direcciones IP (FR-012)
- [ ] T096 [US5] USUARIO: compilar con `powershell -ExecutionPolicy Bypass -File client\tool\build_web.ps1 -ApiUrl <url>` y publicar la rama `despliegue-web`, pasos 6.14 a 6.19
- [ ] T097 [US5] USUARIO: crear el Static Site y definir `CORS_ORIGIN`, pasos 6.20 y 6.21; anotar las direcciones públicas en `docs/evidencias/sprint-9-despliegue/README.md`
- [ ] T098 [US5] USUARIO: carga de ensayo con fecha 2026-11-30, paso 6.22; evidencia `docs/evidencias/sprint-9-despliegue/16-carga-ensayo.txt`
- [ ] T099 [US5] USUARIO: comprobaciones de lectura con conteos y huellas antes y después, pasos 6.23 a 6.25; evidencia `docs/evidencias/sprint-9-despliegue/17-lectura-publica.txt`
- [ ] T100 [US5] Corregir lo que fallara en T094 a T099 (en `server/`, `client/` o `specs/009-despliegue-cumplimiento/quickstart.md`) con su prueba; el usuario republica y repite T099; si todo pasó, registrar «sin correcciones» en `17-lectura-publica.txt`

**Punto de control**: el sistema publicado pasa las comprobaciones.

---

## Fase 9: Evidencia, carga final y cierre (tramo 7)

- [ ] T101 [P] Redactar `docs/evidencias/sprint-9-despliegue/deuda-tecnica.md` con riesgo de cada punto: Helmet, pagos simultáneos, pantalla de cambio de contraseña, textos de plantilla de `index.html` y `manifest.json`, cobro digital simulado y su modo de pruebas sin corregir, sesión al recargar y acceso directo por dirección, contadores que se pierden al reiniciar, página del aviso manual, escenarios no ejecutados en la dirección pública, la discrepancia entre `docs/design-system.md` y el tema de la aplicación (D1) y lo desactivado en T075 (FR-040, FR-039)
- [ ] T102 USUARIO: en el sitio publicado, entrar con `recepcion`, capturar la pantalla de aceptación, pulsar **Rechazar** y capturar el acceso y el aviso, pasos 7.1 y 7.2; guardar en `docs/evidencias/sprint-9-despliegue/capturas/`
- [ ] T103 USUARIO: confirmar que `motorix` de la nube solo tiene la demostración, exportarla con `database/scripts/backup-data.mjs` a un archivo fuera del repositorio y comprobarlo (**sin exportación correcta no se borra**), recrearla y hacer la **carga final**, pasos 7.3 a 7.5; evidencia sin datos en `docs/evidencias/sprint-9-despliegue/18-carga-final.txt`
- [ ] T104 USUARIO: repetir las comprobaciones de lectura con las tres cuentas pendientes, paso 7.6; evidencia `docs/evidencias/sprint-9-despliegue/19-lectura-final.txt`
- [ ] T105 USUARIO: entrar solo como `admin`, aceptar y capturar las secciones sin verificar el cobro digital pendiente, paso 7.7; guardar en `docs/evidencias/sprint-9-despliegue/capturas/`
- [ ] T106 Revisar `docs/evidencias/sprint-9-despliegue/` y el resto de archivos nuevos en busca de contraseñas, tokens, cadenas de conexión, nombres completos de servidor y direcciones IP, incluidas las capturas (SC-004)
- [ ] T107 Crear `docs/evidencias/sprint-9-despliegue/criterios-exito.md` con SC-001 a SC-012, su evidencia y estado real (lo no cumplido se declara), y actualizar el índice `README.md` de esa carpeta (FR-038)
- [ ] T108 USUARIO: commit, push y merge de la evidencia, paso 7.9 (`docs/evidencias/sprint-9-despliegue/`)
- [ ] T109 USUARIO: **lunes 30**, pasos 7.10 a 7.13 en ese orden: tras al menos 20 minutos de inactividad, cronometrar el primer acceso en frío (menos de 2 minutos); repetir las comprobaciones con `--terminos-aceptados=admin`; consultar la salud cada 10 minutos hasta terminar la revisión; y entregar direcciones y contraseñas por un canal privado. Anotar el resultado en `docs/evidencias/sprint-9-despliegue/criterios-exito.md` (SC-001)

---

## Dependencias y orden de ejecución

### Entre fases

```text
Fase 1 ─► Fase 2 (enmienda aprobada) ─► US1 ─► US2 ─► US4 ─► US3 ─► US6 ─► US5 ─► Fase 9
                                         │             │             ▲
                                         │             └─ publish-terms ─┘
                                         └─ compuerta del sábado 13:00
```

| Historia | Depende de | Motivo |
|---|---|---|
| US1 | Fase 2 | La constitución prohíbe hoy la base en la nube |
| US2 | US1 | Comparte `server/config/` y se prueba sobre el helper adaptado |
| US4 | US1 | `publish-terms` usa `cli.mjs`; el texto del límite de intentos exige US2 |
| US3 | US4 | El enlace abre la página generada del aviso |
| US6 | US1, US4 | Esquema y publicación de la versión 2 |
| US5 | US1, US2, US3, US4, US6 | Integra todo |

Dentro de cada historia: pruebas en rojo → módulos → integración → verificación → commit del usuario.

### Camino crítico

T001 → T006 → T010 → T016 → T018 → T023 → T029 → T030 → T046 → T058 → T082 → T093 → T094 → T097 → T103 → T109.

Adelantar lo antes posible: **T001 a T003** (viernes) y **T010** (aprobación).

## Ejemplos de trabajo en paralelo

| Historia | En paralelo |
|---|---|
| US1 | Pruebas T011–T015; variantes T019, T020 y T021; pruebas T032 y T033 |
| US2 | Pruebas T037–T041; módulos T043, T044 y T045; T048 |
| US4 | Pruebas T051–T053; textos T054 y T055 |
| US3 | Pruebas T061–T063; implementaciones T066 y T067; script T071 |
| US6 | Pruebas T077–T079; T080 y T081 |
| US5 | T090 junto a T088 y T089 |

Las suites contra `motorix_test` **no** se ejecutan en paralelo: comparten la base (`--runInBand`).

## Estrategia de implementación

- **Primer incremento (MVP)**: Fases 1 a 3. Responde al mayor riesgo: ¿el esquema funciona en TiDB? Validar antes de seguir.
- **Entrega incremental**: cada fase cierra con pruebas y commit del usuario, de modo que siempre hay una versión que funciona.
- **Para la revisión se necesitan las seis historias.** El único recorte permitido es T075.
- **Si falta tiempo el domingo**: asegurar acceso y términos publicados, nunca dejar a medias la carga final; las capturas pueden pasar al lunes temprano.

## Notas

- Los pasos citados (0.x a 7.x) están en `quickstart.md`, con su verificación.
- Marcar `[x]` solo cuando la verificación pasó; una tarea de usuario se marca cuando la persona confirma el resultado.

## Pendientes anotados del análisis (no ejecutar todavía)

Hallazgos de `/speckit.analyze` (2026-11-27) que quedan sin corregir por decisión del usuario. **No son tareas**: ninguno se ejecuta sin que lo pida. Ninguno es requisito de las correcciones ya aplicadas.

| ID | Severidad | Pendiente | Dónde se resolvería |
|---|---|---|---|
| M4 | Media | Nadie ejecuta las migraciones desde un clon limpio (prueba independiente de US1, FR-009); T014 solo lo comprueba de forma estática | `quickstart.md` tramo 1; T029 |
| M6 | Media | El origen falsificado solo se prueba con `TRUST_PROXY=0`, no con proxy de confianza (FR-012) | T039 |
| M7 | Media | Exportar e imprimir no se comprueban en el sitio publicado (SC-007) | Paso 7.7; T105 |
| M8 | Media | Ninguna tarea hace que otra persona reproduzca el despliegue (SC-011); si no se hace, declararlo no cumplido en T107 | Tarea nueva o T107 |
| L1 | Baja | El caso límite de la spec permite ajustar el límite en una corrida y `api-cambios.md` no. Los guiones actuales hacen como máximo 6 intentos rechazados | `spec.md`, T091 |
| L2 | Baja | T097 guarda direcciones públicas y T106 pide quitar nombres de servidor; se refiere al de la base de datos | T106 |
| L3 | Baja | El plan omite `cli.mjs` y `passwords.mjs`; `data-model.md` omite el registro `USER_CREATED` | `plan.md`, `data-model.md` |
| L4 | Baja | Falta precisar qué API usa el escritorio en 4.10 (debe seguir en `motorix_test`), qué tareas contiene `main` en 6.6 y en qué respuesta se revisa la cabecera expuesta | `quickstart.md`, `contracts/scripts.md` |

N1 (`research.md` desactualizado en R-01 y R-19) se resolvió el 2026-11-27.

## Deuda registrada

| ID | Deuda | Riesgo | Decisión |
|---|---|---|---|
| D1 | `docs/design-system.md` no coincide con la aplicación: define primario `#9B4F55`, fondo `#F5F2F1`, IBM Plex Sans vía `google_fonts` y tamaños 12, 14, 18 y 28; `client/lib/config/theme.dart` usa verde `#2E7D32`, fondo `#F7F8F7` y la tipografía por omisión de Material 3 | El Principio VIII exige seguir el documento: la aplicación y la página del aviso se desvían de él | Usuario, 2026-11-27: la página pública del aviso usa los valores reales de la aplicación. Alinear el documento o la aplicación queda pendiente del equipo (antes N2) |
