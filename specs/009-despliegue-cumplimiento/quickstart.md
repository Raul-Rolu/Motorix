# Guía de ejecución y verificación: Despliegue y cumplimiento

Un paso a la vez: ejecute, verifique y solo entonces continúe. Todo en **PowerShell**, desde la raíz del repositorio salvo que se indique otra carpeta. Los scripts marcados como nuevos existen después de implementar su tramo.

**Reglas**: no pegue contraseñas, secretos ni cadenas de conexión en el chat ni en archivos del repositorio. Git lo ejecuta solo usted. Antes de tocar cualquier base `motorix`, haga el paso de respaldo: una **exportación comprobada** (contar filas no basta); una base recién creada y vacía no la necesita. La aplicación, los scripts y las pruebas **nunca** usan `root` ni la cuenta administradora; esa cuenta solo se usa a mano en el editor SQL del proveedor (pasos 0.3, 1.6, 7.4 y recuperación).

Evidencia: guarde salidas con `| Out-File -Encoding utf8 docs\evidencias\sprint-9-despliegue\<archivo>.txt` y revíselas antes de versionarlas.

---

## Tramo 0. Preparación (viernes noche)

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 0.1 | `git branch --show-current` | `009-despliegue-cumplimiento` |
| 0.2 | En TiDB Cloud: crear instancia **Starter**, AWS `us-west-2`, límite de gasto 0 | Estado disponible; no pide pago |
| 0.3 | En su editor SQL: crear `motorix_test` y `motorix` (`utf8mb4`, `utf8mb4_unicode_ci`) y un usuario dedicado con el prefijo, con los permisos que lista `database/README.md` sobre ambas | `SHOW DATABASES;` muestra las dos; el usuario dedicado entra y `SELECT CURRENT_USER();` no muestra `root`. **Si no se puede crear el usuario dedicado, deténgase aquí**: no se continúa con la cuenta administradora |
| 0.4 | `notepad $HOME\motorix-nube-test.env` con las variables de [configuración](./contracts/configuracion.md) | El archivo está fuera del repositorio y de OneDrive |
| 0.5 | `Get-ChildItem Env:DB_*` | No devuelve nada |
| 0.6 | Crear cuenta de Render y conectar el repositorio de GitHub | Render ve el repositorio; sin método de pago |
| 0.7 | En `server`: `node --env-file=.env -e "console.log((process.env.JWT_SECRET || '').length)"` | 32 o más. Si no, cámbielo en `server\.env` |
| 0.8 | En `server`: `npm.cmd test` | 109 suites y 1329 pruebas pasan |
| 0.9 | En `client`: `flutter test` | 351 pruebas pasan |

**Compuerta**: 0.3, 0.8 y 0.9 correctos.

---

## Tramo 1. Constitución y TiDB (sábado, antes de las 13:00)

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 1.1 | Enviar al equipo [contracts/enmienda-constitucion.md](./contracts/enmienda-constitucion.md), señalando las filas **nuevas**, y obtener la aprobación | Aprobación anotada; `.specify/memory/constitution.md` coincide con el texto aprobado |
| 1.2 | `mysql -u <usuario> -p -e "DROP DATABASE IF EXISTS motorix_test; CREATE DATABASE motorix_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"` (**local**; confirme que dice `_test`) | Sin errores |
| 1.3 | `$env:DB_NAME='motorix_test'; node database\scripts\apply-migrations.mjs` | Destino local `motorix_test`; 23 aplicadas, ninguna variante |
| 1.4 | `node database\scripts\check-schema.mjs --salida=docs\evidencias\sprint-9-despliegue\esquema-local.json` y después `Remove-Item Env:DB_NAME` | 23 registradas; archivo creado |
| 1.5 | `node --env-file="$HOME\motorix-nube-test.env" database\scripts\check-schema.mjs --sin-env` | Servidor TiDB, versión anotada, TLS activo, 0 migraciones |
| 1.6 | En el editor SQL de TiDB: `SET GLOBAL tidb_enable_check_constraint = ON;` | Anote si se acepta o se rechaza |
| 1.7 | `node --env-file="$HOME\motorix-nube-test.env" database\scripts\apply-migrations.mjs --sin-env` | 23 aplicadas; 016, 017 y 020 con variante. Si falla otra, deténgase y reporte el nombre y el mensaje |
| 1.8 | Repetir 1.7 | 0 aplicadas, sin errores |
| 1.9 | `node --env-file="$HOME\motorix-nube-test.env" database\scripts\check-schema.mjs --sin-env --probar-restricciones --salida=docs\evidencias\sprint-9-despliegue\esquema-tidb.json` | Informa qué llaves foráneas y `CHECK` se cumplen |
| 1.10 | `node database\scripts\check-schema.mjs --comparar=docs\evidencias\sprint-9-despliegue\esquema-local.json --con=docs\evidencias\sprint-9-despliegue\esquema-tidb.json` | Termina sin error: solo lista [diferencias aceptadas](./contracts/scripts.md#comparación-de-esquemas) |
| 1.11 | En `server`: `node --env-file="$HOME\motorix-nube-test.env" --experimental-vm-modules node_modules\jest\bin\jest.js --runInBand --testTimeout=60000 tests/integration/auth.test.js` | Pasa |
| 1.12 | El mismo comando, **un archivo por vez**: `terms`, `settings`, `inventory`, `order-parts`, `part-price-adoption`, `payments`, `reports-income`, `reports-services-productivity`, `reports-parts-rotation`, `notifications-calculo` | Cada uno pasa |

**Compuerta**: 1.8, 1.10 y 1.12 correctos. Después, commit.

### Si una migración falla a la mitad

Los cambios de esquema no se deshacen solos: la migración queda **sin registrar**, pero parte de sus sentencias puede haberse aplicado. No la repita sobre la misma base.

1. Anote el nombre del archivo y el mensaje.
2. Confirme que la base es de pruebas (`_test`) o nueva y sin datos. Si tiene datos que conservar, deténgase: primero se exporta (paso 7.3).
3. Recréela: en local, el paso 1.2; en TiDB, desde el editor SQL, `DROP DATABASE <base>;` y `CREATE DATABASE <base> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`.
4. Corrija la causa (una variante en `database/migrations/tidb/`; nunca el script original).
5. Aplique de nuevo todas las migraciones y verifique 23 registradas.

---

## Tramo 2. Código de servidor (sábado tarde)

Pasos 2.2 a 2.6: use una segunda terminal para el servidor, siempre con `$env:DB_NAME='motorix_test'`; deténgalo con Ctrl+C.

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 2.1 | En `server`: `npm.cmd ci` y `npm.cmd test` | Todas las suites anteriores y las nuevas pasan |
| 2.2 | `$env:JWT_SECRET='corto'; npm.cmd start` y luego `Remove-Item Env:JWT_SECRET` | No arranca; explica la regla sin mostrar el valor |
| 2.3 | `$env:DB_NAME='motorix_test'; $env:CORS_ORIGIN='http://localhost:5000'; npm.cmd start` y en otra terminal `curl.exe -i http://localhost:3000/api/health` | 200; el arranque muestra desfase `-06:00` |
| 2.4 | `curl.exe -i -X OPTIONS -H "Origin: http://localhost:5000" http://localhost:3000/api/auth/login` | 204 con permiso para ese origen |
| 2.5 | `1..11 \| ForEach-Object { curl.exe -s -o NUL -w "%{http_code}\n" -H "Content-Type: application/json" -d "{}" http://localhost:3000/api/auth/login }` (antes, reinicie el servidor como en 2.3) | Diez 400 y después 429 |
| 2.6 | Reiniciar el servidor con `$env:DB_PORT='1'` y repetir health; luego `Remove-Item Env:DB_PORT, Env:DB_NAME, Env:CORS_ORIGIN` | 503 |

**Compuerta**: 2.1 a 2.6. Commit.

---

## Tramo 3. Textos legales (sábado noche)

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 3.1 | Leer `database\legal\terminos-v2.txt` y `aviso-privacidad-v2.txt` | Taller ficticio, nota académica, nada que el sistema no haga |
| 3.2 | Revisar `docs\evidencias\sprint-9-despliegue\afirmaciones-textos.md` | Cada afirmación técnica tiene comprobación; plazos con artículo y fecha |
| 3.3 | `node database\scripts\build-privacy-page.mjs` | Genera la página |
| 3.4 | `Start-Process client\web\aviso-privacidad.html` | Se lee completa; «Versión 2» |
| 3.5 | En `server`: `npm.cmd test -- tests/unit/privacy-page` | Pasa |
| 3.6 | `$env:DB_NAME='motorix_test'; node database\scripts\publish-terms.mjs --confirmar=motorix_test` | Publica la versión 2 |
| 3.7 | Repetir 3.6 y después `Remove-Item Env:DB_NAME` | Informa que ya existe; no escribe |

**Compuerta**: textos aprobados por usted. Commit. No publique todavía en su `motorix` local: el aviso puede cambiar en el paso 4.9.

---

## Tramo 4. Cliente web (domingo, antes de las 12:00)

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 4.1 | En `client`: `flutter pub get` | Sin errores |
| 4.2 | `flutter analyze` | Sin problemas |
| 4.3 | `flutter test` | Todas pasan |
| 4.4 | `flutter test --platform chrome test/web` | Pasan |
| 4.5 | Preparar `motorix_test` local: paso 1.2, 1.3, `node database\scripts\apply-seeds.mjs` con `DB_NAME=motorix_test` y arrancar la API como en 2.3 | API en 200 |
| 4.6 | En `client`: `flutter run -d chrome --web-port 5000 --dart-define=API_BASE_URL=http://localhost:3000/api` | Pantalla de acceso con el enlace al aviso |
| 4.7 | Entrar como administrador de ejemplo, aceptar términos y exportar los 5 reportes | 5 descargas, acentos correctos en Excel, «Archivo descargado.» |
| 4.8 | Abrir un ticket e imprimir | Vista imprimible igual a la de escritorio |
| 4.9 | Con las herramientas del navegador (F12, Red), recargar y anotar dominios ajenos | Coinciden con lo que dice el aviso; si no, ajustar el texto y repetir 3.3 a 3.5 |
| 4.10 | `flutter run -d windows`, exportar un reporte e imprimir un ticket | Igual que antes |

**Corte 12:00**: lo que no pase en 4.7 o 4.8 se desactiva con aviso. Commit.

**Opcional, solo usted y solo cuando el aviso ya sea definitivo** (después de 4.9 y de cualquier ajuste), para publicar la versión 2 en su `motorix` local:

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 4.11 | `mysqldump -u <usuario> -p --result-file="$HOME\motorix-respaldo.sql" motorix` | El archivo existe, no está vacío y termina con la línea `Dump completed` |
| 4.12 | `node database\scripts\publish-terms.mjs --confirmar=motorix` | Publica la versión 2 |

---

## Tramo 5. Datos de demostración (domingo, 12:00–15:00)

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 5.1 | Recrear y migrar `motorix_test` local (1.2 y 1.3) | 23 migraciones |
| 5.2 | `node --env-file="$HOME\motorix-nube-test.env" database\demo\seed-demo.mjs` (sin `--confirmar`) | Muestra destino y no escribe |
| 5.3 | Definir las tres `DEMO_*` de prueba en la terminal con `Read-Host`, `$env:DB_NAME='motorix_test'` y `node --env-file=server\.env database\demo\seed-demo.mjs --confirmar=motorix_test --fecha=2026-11-30` (local) | Informa destino local `motorix_test` y creados; sin contraseñas en pantalla |
| 5.4 | `node database\scripts\check-schema.mjs --conteos --salida=$env:TEMP\demo-1.json` | Cantidades de [data-model](./data-model.md) |
| 5.5 | Repetir 5.3 y 5.4 con `demo-2.json`; `git diff --no-index $env:TEMP\demo-1.json $env:TEMP\demo-2.json` | Sin diferencias de conteos |
| 5.6 | Ejecutar 5.3 con una contraseña corta | Se detiene sin escribir |
| 5.7 | `Remove-Item Env:DB_NAME, Env:DEMO_*`; luego el comando de 5.2 con `--confirmar=motorix_test --fecha=2026-11-30` | Carga completa en TiDB `motorix_test` |
| 5.8 | En `server`: `npm.cmd test` | Todo verde; guardar salida |
| 5.9 | En `client`: `flutter test` | Todo verde; guardar salida |

**Compuerta**: 5.5, 5.8 y 5.9. Commit.

---

## Tramo 6. Despliegue y comprobaciones de lectura (domingo, 15:00–19:00)

### Escenarios locales (contra `motorix_test`)

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 6.1 | 1.2, 1.3 y `node database\scripts\apply-seeds.mjs --hasta=010` con `DB_NAME=motorix_test`; servidor con `$env:PORT='3055'` | API arriba |
| 6.2 | `node docs\evidencias\sprint-7-configuracion\escenarios-p1-api.mjs http://localhost:3055` | Todas las verificaciones pasan |
| 6.3 | Detener; repetir 6.1 con `--hasta=011` y puerto 3056 | API arriba |
| 6.4 | `node docs\evidencias\sprint-7-configuracion\escenarios-p2-api.mjs http://localhost:3056` | Pasan |
| 6.5 | Detener; `Remove-Item Env:PORT, Env:DB_NAME`; `node docs\evidencias\sprint-7-configuracion\escenarios-p3-api.mjs --recrear-motorix-test` | Pasan |

### Publicación

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 6.6 | `git status`, commit, push, pull request y merge a `main` | `main` contiene el tramo 5; ningún `.env` incluido |
| 6.7 | `notepad $HOME\motorix-nube.env` (`DB_NAME=motorix`, contraseñas definitivas) | Fuera del repositorio |
| 6.8 | `node --env-file="$HOME\motorix-nube.env" database\scripts\check-schema.mjs --sin-env --conteos` | Base `motorix` vacía: no hay nada que exportar. Si tiene datos, deténgase y exporte como en 7.3 |
| 6.9 | `node --env-file="$HOME\motorix-nube.env" database\scripts\apply-migrations.mjs --sin-env` | 23 aplicadas |
| 6.10 | Render, **Web Service** gratuito: rama `main`, Root Directory `server`, Build `npm ci --omit=dev`, Start `npm start`, Health Check Path `/api/health`; variables de [configuración](./contracts/configuracion.md) con `TRUST_PROXY=1` y `LOG_CLIENT_IP=true` | Despliegue en vivo; el registro muestra TLS y `-06:00` |
| 6.11 | `curl.exe -i https://<api>.onrender.com/api/health` | 200 |
| 6.12 | Abrir health desde su navegador y revisar el registro | La IP resuelta es la suya. Si no, subir `TRUST_PROXY` y repetir |
| 6.13 | `curl.exe -H "X-Forwarded-For: 1.2.3.4" https://<api>.onrender.com/api/health` | La IP resuelta no es `1.2.3.4`. Quitar `LOG_CLIENT_IP` |
| 6.14 | `powershell -ExecutionPolicy Bypass -File client\tool\build_web.ps1 -ApiUrl https://<api>.onrender.com/api` | Compila y pasa sus comprobaciones |
| 6.15 | `git worktree add --detach ..\motorix-web` | Carpeta creada |
| 6.16 | `git -C ..\motorix-web switch --orphan despliegue-web` | Carpeta sin archivos del proyecto |
| 6.17 | `Copy-Item client\build\web\* ..\motorix-web -Recurse -Force; Set-Content ..\motorix-web\.gitattributes '* -text' -Encoding ascii` | `index.html` y `aviso-privacidad.html` en la raíz |
| 6.18 | `git -C ..\motorix-web add -A` y `git -C ..\motorix-web status` | **Solo** archivos del build |
| 6.19 | `git -C ..\motorix-web commit -m "chore(deploy): publicar el cliente web"` y `git -C ..\motorix-web push -u origin despliegue-web` | Rama en GitHub |
| 6.20 | Render, **Static Site**: rama `despliegue-web`, Build `echo listo`, Publish directory `.` | Sitio publicado |
| 6.21 | En el Web Service: `CORS_ORIGIN=https://<sitio>.onrender.com` y esperar el redespliegue | Health 200 |

Para republicar el cliente: 6.14, `git -C ..\motorix-web rm -r -q .`, 6.17, 6.18, un commit y `git -C ..\motorix-web push`.

### Carga de ensayo y lectura pública

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 6.22 | `node --env-file="$HOME\motorix-nube.env" database\demo\seed-demo.mjs --confirmar=motorix --fecha=2026-11-30` | Destino en la nube; carga completa |
| 6.23 | `node --env-file="$HOME\motorix-nube.env" database\scripts\check-schema.mjs --sin-env --conteos --huellas --salida=$env:TEMP\antes.json` | Archivo creado con filas y huella por tabla |
| 6.24 | `node --env-file="$HOME\motorix-nube.env" server\scripts\smoke-readonly.js --api=https://<api>.onrender.com/api --web=https://<sitio>.onrender.com` | Las 8 comprobaciones pasan |
| 6.25 | Repetir 6.23 con `despues.json` y `git diff --no-index $env:TEMP\antes.json $env:TEMP\despues.json` | Sin diferencias de filas ni de huellas (nadie usa el sitio entre 6.23 y 6.25) |

**Volver atrás**: en Render, redesplegar la versión anterior; para el cliente, revertir el commit en `despliegue-web`; para la base de demostración, exportarla y recrearla (7.3 a 7.5) o, para recuperar lo exportado, migrar una base vacía y ejecutar `node --env-file="$HOME\motorix-nube.env" database\scripts\backup-data.mjs --sin-env --restaurar="$HOME\motorix-nube-respaldo.sql" --confirmar=motorix`.

### Advertencias de operación

- **Salud 503**: si la base no responde (caída o cuota agotada), Render deja de enviar tráfico a la API tras 15 segundos de fallos y la reinicia tras 60; un despliegue nuevo que no pase la salud en 15 minutos se cancela. Revise el estado y la cuota de TiDB antes de redesplegar.
- **Versión posterior de los términos**: la página pública **no** se actualiza sola. No publique versiones durante la revisión. Si publica una, actualice el texto fuente, la página y su prueba, y republique el cliente; hasta entonces la página sigue indicando «Versión 2».

---

## Tramo 7. Evidencia y carga final (domingo noche y lunes)

| Paso | Usted ejecuta | Verifique |
|---|---|---|
| 7.1 | En el sitio publicado, entrar como `recepcion`, capturar la pantalla de aceptación y pulsar **Rechazar** | Vuelve al acceso. **No pulse Aceptar** |
| 7.2 | Capturar la pantalla de acceso y la página del aviso | Capturas guardadas |
| 7.3 | **Respaldo**: confirmar que `motorix` de la nube solo tiene la demostración y ejecutar `node --env-file="$HOME\motorix-nube.env" database\scripts\backup-data.mjs --sin-env --salida="$HOME\motorix-nube-respaldo.sql"` | Termina sin error, informa filas por tabla coincidentes y el archivo existe fuera del repositorio. **Si falla, no continúe a 7.4** |
| 7.4 | En el editor SQL de TiDB (**solo la de la nube**): `DROP DATABASE motorix;` y `CREATE DATABASE motorix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` | Base vacía |
| 7.5 | Repetir 6.9 y 6.22 (**carga final**) | 23 migraciones y carga completa |
| 7.6 | Repetir 6.23 a 6.25 | Verde, sin cambios; las tres cuentas pendientes |
| 7.7 | Entrar **solo como `admin`**, aceptar y capturar las secciones. No verifique el cobro digital pendiente. No entre con las otras cuentas más allá de la pantalla de aceptación | Capturas completas |
| 7.8 | Revisar `docs\evidencias\sprint-9-despliegue\` | Sin contraseñas, secretos ni cadenas de conexión; deuda y pagos simulados declarados |
| 7.9 | Commit, push y merge de la evidencia | En `main` |
| 7.10 | **Lunes**, antes de la revisión y tras al menos 20 minutos sin abrir el sitio ni consultar la API: abrir el sitio y cronometrar hasta entrar como `admin` (arranque en frío) | Menos de 2 minutos; anote el tiempo |
| 7.11 | Inmediatamente después, repetir 6.24 agregando `--terminos-aceptados=admin` | Verde |
| 7.12 | En una terminal aparte: `while ($true) { curl.exe -s -o NUL -w "%{http_code}\n" https://<api>.onrender.com/api/health; Start-Sleep -Seconds 600 }` y dejarla hasta que termine la revisión, sin que el equipo se suspenda | `200` cada 10 minutos; Ctrl+C al terminar |
| 7.13 | Entregar al evaluador las direcciones y las contraseñas **por un canal privado** | Recibido |

**Si el evaluador acepta los términos con `recepcion` o `mecanico`**, es el uso esperado.
