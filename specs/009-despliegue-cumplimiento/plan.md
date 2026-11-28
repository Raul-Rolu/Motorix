# Plan de implementación: Despliegue y cumplimiento

**Rama**: `009-despliegue-cumplimiento` | **Fecha**: 2026-11-27 | **Spec**: [spec.md](./spec.md)

**Input**: especificación de `specs/009-despliegue-cumplimiento/spec.md` y argumentos de `/speckit.plan` (orden por riesgo, Static Site desde una rama con solo el build, compilación local del cliente, evidencia de términos con `recepcion` y `mecanico` sin aceptar).

## Resumen

Publicar Motorix en TiDB Cloud Starter (base), Render Web Service (API) y Render Static Site (cliente web), sin costo, antes del lunes 30 de noviembre de 2026. El trabajo se ordena en un tramo de preparación (0) y siete tramos por riesgo. La guía ejecutable, con un comando y una verificación por paso, está en [quickstart.md](./quickstart.md).

Enfoque técnico (decisiones en [research.md](./research.md)):

- Variantes de las migraciones 016, 017 y 020 en `database/migrations/tidb/`, elegidas según el servidor y registradas con el nombre original.
- Opciones de conexión (TLS, zona horaria, pool) en un solo módulo compartido por el servidor, los scripts y las pruebas.
- CORS propio, `express-rate-limit` para el límite de intentos, health 503 y validación de entorno al arrancar.
- Textos legales como archivos fuente; de ellos salen la versión 2 en la base y la página pública.
- Acciones de plataforma del cliente (CSV, ticket, enlace) con importación condicional.
- Script de demostración propio, sin identificadores fijos y con contraseñas por variable de entorno.

## Contexto técnico

**Lenguaje y versión**: Node.js (ES Modules); local 25.1.0, Render fijado en 24.22.1. Dart 3.13.2 con Flutter 3.47.2.

**Dependencias principales**: Express 4.22, mysql2 3.24, bcrypt 6, jsonwebtoken 9; Flutter con `provider` y `http`. **Nuevas**: `express-rate-limit` ^8.7.5 (servidor) y `web` ^1.1 (cliente).

**Almacenamiento**: MySQL local y TiDB Cloud Starter (AWS `us-west-2`). Sin migraciones nuevas: el esquema no cambia.

**Pruebas**: Jest + supertest contra `motorix_test` (base: 109 suites, 1329 pruebas); `flutter test` (base: 351) y `flutter test --platform chrome` para lo propio de web.

**Plataforma objetivo**: Render (Linux) para la API; navegador de escritorio para el cliente; Windows sigue funcionando.

**Tipo de proyecto**: aplicación web y de escritorio con API REST.

**Metas de rendimiento**: primer acceso en menos de 2 minutos tras la suspensión del servicio (SC-001).

**Restricciones**: costo cero; sin secretos en el repositorio ni en la conversación; git solo lo ejecuta el usuario; pruebas solo contra `motorix_test`, salvo las comprobaciones de lectura en la dirección pública; `motorix` solo lo toca el usuario con respaldo previo.

**Escala**: una revisión académica; un puñado de usuarios simultáneos.

No quedan puntos `NEEDS CLARIFICATION`. Lo que solo puede saberse ejecutando contra los proveedores está en [Riesgos por comprobar](#riesgos-por-comprobar) con su alternativa.

## Revisión contra la constitución

*Compuerta previa a la fase 0 y revisada tras la fase 1.*

| Principio | Antes del diseño | Después del diseño |
|---|---|---|
| I. Alcance y fuente de verdad | Mini-sprint pedido por el usuario; no agrega funciones de negocio | Cumple si se actualiza `docs/project-context.md` (tramo 1) |
| II. Responsabilidades separadas | Cumple | Cumple: middlewares nuevos en `middlewares/`, configuración en `config/` |
| III. Stack y base local | **Violación**: prohíbe la base en la nube, exige datos iniciales en SQL e InnoDB | Se resuelve con el texto único de [contracts/enmienda-constitucion.md](./contracts/enmienda-constitucion.md) (tramo 1, paso 1.1), **antes de tocar código**. «Nunca `root`» se mantiene sin excepciones |
| IV. Seguridad | Cumple | Cumple: secretos por entorno, archivo de variables fuera del repositorio, TLS verificado |
| V. Reglas de negocio | Cumple | Cumple: el script de demostración respeta stock, saldos y estados |
| VI. API consistente | Cumple | Cumple: el 429 usa el formato de error central |
| VII. Pruebas | Cumple | Cumple: la excepción de lectura pública está acordada en la spec |
| VIII. UX/UI | **Desviación previa**: el tema de la aplicación no coincide con `docs/design-system.md` | Desviación justificada: enlace, avisos y página pública usan el tema real de la aplicación (ver «Seguimiento de complejidad» y deuda D1) |
| Dependencias | Requiere justificación | Justificadas en R-09 y R-15 |
| Flujo: ramas y commits | Cumple en la rama `009-…` | Desviación justificada: rama de publicación `despliegue-web` |

**Resultado**: pasa, condicionado a la enmienda. La aprobación del equipo según la sección de gobernanza la gestiona el usuario.

## Tramos de ejecución

Cada tramo termina con una compuerta. No se avanza si la compuerta falla. «Agente» escribe código y documentos durante `/speckit.implement`; «Usuario» ejecuta contra proveedores, `motorix` y git.

| Tramo | Cuándo (objetivo) | Entrega del agente | Ejecuta el usuario | Compuerta | Requisitos |
|---|---|---|---|---|---|
| 0. Preparación | Vie 27 noche | — | Cuentas, TiDB, archivos de variables, línea base | Línea base verde y TiDB creado | — |
| 1. Constitución y TiDB | Sáb 28, antes de 13:00 | Enmienda, módulo de conexión (TLS), variantes 016/017/020, `check-schema` | Migraciones y pruebas en `motorix_test` local y TiDB | 23 migraciones en ambas y esquema equivalente | FR-001 a FR-004, FR-007 a FR-010 |
| 2. Código de servidor | Sáb 28, tarde | Zona horaria, pool, CORS, límite, health, validación, Node | Pruebas y comprobaciones locales | Suite completa verde | FR-005, FR-006, FR-011 a FR-017 |
| 3. Textos legales | Sáb 28, noche | Textos v2, `publish-terms`, página del aviso, tabla de afirmaciones | Lee y aprueba los textos | Prueba de coincidencia verde y textos aprobados | FR-023 a FR-029 |
| 4. Cliente web | Dom 29, antes de 12:00 | Acciones de plataforma, enlace al aviso, `build_web.ps1` | Prueba en navegador | **Corte 12:00**: lo que no funcione se desactiva (FR-021) | FR-018 a FR-022 |
| 5. Datos de demostración | Dom 29, 12:00–15:00 | `seed-demo` y pruebas | Doble corrida local y en TiDB `motorix_test` | Conteos iguales y suites completas verdes | FR-030 a FR-035, FR-041 |
| 6. Despliegue y lectura pública | Dom 29, 15:00–19:00 | Guía, comprobaciones de lectura | Escenarios locales, git, Render, carga de ensayo | Comprobaciones verdes con conteos intactos | FR-036, FR-037, FR-039 |
| 7. Evidencia y carga final | Dom 29 noche; Lun 30 mañana | Índice de evidencia y deuda | Capturas, carga final, verificación del lunes | Entrega completa | FR-038, FR-040 |

### Puntos de corte

- **Sábado 13:00**: si TiDB no aplica las 23 migraciones, detenerse y decidir con el usuario. Cambiar de proveedor de base contradice las restricciones acordadas, así que es decisión suya.
- **Domingo 12:00**: exportar o imprimir en web que no funcione queda desactivado con aviso y anotado como deuda. Es el único recorte permitido.
- **Domingo 19:00**: si Render no queda estable, se prioriza que el acceso y los términos funcionen; las capturas pueden esperar al lunes, la carga final no debe hacerse a medias.

## Diseño por tramo

### 1. Constitución y TiDB

- Enmienda a 2.0.0 con el texto único de [contracts/enmienda-constitucion.md](./contracts/enmienda-constitucion.md), que separa lo ya aprobado (motor compatible) de lo nuevo.
- `server/config/db-options.js`: opciones de conexión desde el entorno (R-04).
- `server/config/migration-files.js`: lista de migraciones y elección de variante según `SELECT VERSION()` (R-02).
- `database/migrations/tidb/{016,017,020}_*.sql`: una operación por sentencia.
- Los scripts importan las dependencias de `server/node_modules`, aceptan `--sin-env` y muestran el destino (R-03). `apply-seeds` acepta `--hasta=NNN`.
- `database/scripts/check-schema.mjs`: versión, migraciones, firma normalizada del esquema y su comparación, llaves foráneas, restricciones, conteos y huellas de contenido.
- `database/scripts/backup-data.mjs`: exportación comprobada del contenido a un archivo fuera del repositorio y su restauración.
- `tests/helpers/db-test.js`: mismas opciones y variantes, y negativa a operar sobre una base cuyo nombre no termine en `_test`.

### 2. Código de servidor

Contrato en [contracts/api-cambios.md](./contracts/api-cambios.md). La zona horaria de cada conexión se deriva de la del proceso, de modo que ambas coinciden sin tablas de zonas (R-05). `crearApp()` crea un limitador por instancia, lo que aísla las pruebas.

### 3. Textos legales

Fuentes en `database/legal/`. El aviso contiene los elementos del artículo 15, el procedimiento de los artículos 28, 29 y 34 y los plazos de los artículos 31 y 40, verificados en R-13. `build-privacy-page.mjs` genera `client/web/aviso-privacidad.html` con los colores, tipografía y espaciados del tema de la aplicación, y una prueba compara ambos. Una tabla en `docs/evidencias/sprint-9-despliegue/afirmaciones-textos.md` relaciona cada afirmación técnica con su comprobación; las que dependen del navegador se confirman en el tramo 4 y, si cambian, se regeneran texto y página antes de la carga final.

### 4. Cliente web

Contrato en [contracts/cliente-web.md](./contracts/cliente-web.md).

### 5 a 7. Datos, despliegue y evidencia

Contratos en [contracts/scripts.md](./contracts/scripts.md) y [contracts/configuracion.md](./contracts/configuracion.md); datos en [data-model.md](./data-model.md).

**Secuencia de términos para la evidencia**:

1. Carga de ensayo en `motorix` de la nube.
2. Captura de la pantalla de aceptación con `recepcion` y «Rechazar» (no escribe en la base).
3. El usuario exporta `motorix`, comprueba el archivo, la recrea vacía y hace la **carga final** con fecha de referencia 2026-11-30.
4. Comprobaciones de lectura: las tres cuentas pendientes.
5. Solo `admin` acepta y se toman las demás capturas.
6. `recepcion` y `mecanico` quedan sin aceptar. El lunes se repiten las comprobaciones indicando que `admin` ya aceptó.

## Estructura del proyecto

### Documentación

```text
specs/009-despliegue-cumplimiento/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── enmienda-constitucion.md
│   ├── api-cambios.md
│   ├── cliente-web.md
│   ├── configuracion.md
│   └── scripts.md
├── checklists/requirements.md
└── tasks.md              # lo crea /speckit.tasks
```

### Código

```text
server/
├── app.js                          # CORS, trust proxy, límite, health
├── server.js                       # validación de entorno y diagnóstico
├── .env.example                    # variables nuevas sin valores secretos
├── config/{db.js, db-options.js, migration-files.js}
├── middlewares/{cors.js, rate-limit.js}
├── utils/env-check.js
├── scripts/smoke-readonly.js
└── tests/{unit, integration, contract, helpers}

database/
├── migrations/tidb/                # variantes 016, 017, 020
├── legal/{terminos-v2.txt, aviso-privacidad-v2.txt}
├── demo/{seed-demo.mjs, data.mjs}
└── scripts/{apply-migrations, apply-seeds, check-schema, backup-data, publish-terms, build-privacy-page}.mjs

client/
├── pubspec.yaml                    # web
├── web/aviso-privacidad.html       # generado
├── tool/build_web.ps1
├── lib/services/platform/{platform_actions, _io, _web, _stub}.dart
├── lib/services/{csv_export, ticket_print}.dart
├── lib/screens/{login_screen, ticket_screen, reports_screen}.dart
└── test/ y test/web/

docs/evidencias/sprint-9-despliegue/
```

**Decisión de estructura**: se conserva la existente; lo nuevo se agrega en las carpetas que ya fija la constitución.

## Riesgos por comprobar

| Riesgo | Cómo se comprueba | Si ocurre |
|---|---|---|
| Fallan otras migraciones además de 016, 017 y 020 | Paso de migraciones en TiDB | Nueva variante con el mismo mecanismo |
| TiDB no hace cumplir llaves foráneas (versión anterior a 8.5) o `CHECK` | `check-schema --probar-restricciones` | Se documenta; las validaciones de la API siguen vigentes |
| Starter no permite crear el usuario dedicado | Paso 0.3 | **El paso se detiene.** No se usa `root` ni la cuenta administradora en la aplicación, los scripts ni las pruebas |
| Starter no permite activar `CHECK` | Paso 1.6 | Se documenta; las validaciones de la API siguen vigentes |
| Consultas de productividad o adopción de precios difieren | Subconjunto de pruebas en TiDB | Reescribir la consulta sin cambiar el resultado local |
| Número de proxies de Render | Registro temporal de IP | Ajustar `TRUST_PROXY` |
| Pruebas lentas o cuota agotada en TiDB | Se corre solo el subconjunto | Reducir el subconjunto y anotarlo |
| `express-rate-limit` rompe suites con muchos intentos | Suite completa en el tramo 2 | Límite mayor solo en la aplicación de esa prueba |
| El `JWT_SECRET` local tiene menos de 32 caracteres | Paso 0.7 | El usuario lo cambia antes del tramo 2 |

## Seguimiento de complejidad

| Desviación | Por qué hace falta | Alternativa simple descartada |
|---|---|---|
| Principio III antes de la enmienda | El despliegue exige base en la nube | Revisar en local no cumple el objetivo |
| Rama `despliegue-web` fuera del formato `NNN-…`, con artefactos compilados | El Static Site publica el build y Render no compila el cliente; decisión del usuario | Versionar `client/build` en `main` ensucia el historial |
| Dos juegos de sentencias para 016, 017 y 020 | No se pueden editar migraciones aplicadas | Editar los originales viola el Principio III |
| El aviso vive en dos lugares | Debe leerse sin cuenta y sin API | Una consulta pública nueva se descartó en la spec |
| La página del aviso sigue el tema de la aplicación y no `docs/design-system.md` (Principio VIII) | Decisión del usuario del 2026-11-27: la página debe verse igual que la aplicación que se revisa. El documento y la aplicación ya diferían antes de este mini-sprint | Seguir el documento haría que la página se viera distinta; alinear el documento o la aplicación queda como deuda D1, fuera del plazo |
