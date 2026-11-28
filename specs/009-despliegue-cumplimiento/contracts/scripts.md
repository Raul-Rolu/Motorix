# Contrato: scripts de línea de órdenes

Salidas y errores en español. Código de salida 0 solo si todo fue correcto. Ninguno muestra contraseñas, secretos ni el nombre completo del servidor.

Común a los scripts de base: `--sin-env` (no carga `server/.env`) y primera línea con base, servidor enmascarado, TLS y desfase horario.

| Script | Argumentos | Comportamiento |
|---|---|---|
| `database/scripts/apply-migrations.mjs` | `--sin-env` | Aplica pendientes, con variante TiDB si corresponde; indica cuáles usaron variante y cuántas aplicó |
| `database/scripts/apply-seeds.mjs` | `--sin-env`, `--hasta=NNN` | Carga estándar local; **se niega a correr con `DB_SSL=true` salvo sobre una base `_test`** |
| `database/scripts/check-schema.mjs` | `--sin-env`, `--conteos`, `--huellas`, `--probar-restricciones`, `--salida=<archivo>`; o bien `--comparar=<a> --con=<b>` | Versión del servidor, migraciones registradas, firma normalizada del esquema, llaves foráneas, `CHECK`; con `--conteos`, filas por tabla; con `--huellas`, SHA-256 del contenido de cada tabla ordenado por su llave primaria (nunca el contenido). `--probar-restricciones` solo en bases `_test`, dentro de una transacción que se revierte. `--comparar` no se conecta a ninguna base (ver abajo) |
| `database/scripts/backup-data.mjs` | `--sin-env`, `--salida=<archivo.sql>`; o bien `--restaurar=<archivo.sql> --confirmar=<base>` | Exporta las filas de todas las tablas (menos `schema_migrations`) como sentencias SQL, con las fechas como texto. Rechaza una ruta dentro del repositorio y no sobrescribe. Al terminar relee el archivo y compara las filas por tabla con la base; si no coinciden, falla. Restaura solo en una base migrada y sin filas. El archivo contiene datos y hashes: no se versiona ni se comparte |
| `database/scripts/publish-terms.mjs` | `--sin-env`, `--confirmar=<base>` | Publica la versión 2 según [data-model.md](../data-model.md) |
| `database/scripts/build-privacy-page.mjs` | — | Genera `client/web/aviso-privacidad.html` con los valores del tema de la aplicación ([cliente-web.md](./cliente-web.md)) |
| `database/demo/seed-demo.mjs` | `--confirmar=<base>`, `--fecha=AAAA-MM-DD` | Nunca carga `server/.env` por su cuenta; el entorno llega de la terminal o de `node --env-file`. Valida contraseñas antes de conectar. Sin `--confirmar` igual a `DB_NAME`, muestra el destino y no escribe. Informa creados y existentes por entidad |
| `server/scripts/smoke-readonly.js` | `--api=<url>`, `--web=<url>`, `--terminos-aceptados=<cuentas>` | Solo las peticiones de la tabla siguiente |
| `client/tool/build_web.ps1` | `-ApiUrl <url>` | Se invoca con `powershell -ExecutionPolicy Bypass -File client\tool\build_web.ps1 -ApiUrl <url>` (la política por omisión de Windows bloquea los `.ps1`; la excepción vale solo para ese proceso). Funciona desde la raíz del repositorio. Rechaza direcciones sin HTTPS, sin `/api` o con `/` final; compila; comprueba que la salida contenga la dirección, no contenga `localhost:3000` e incluya la página del aviso; código de salida distinto de 0 si algo falla |

## Comparación de esquemas

La firma se normaliza para que MySQL y TiDB sean comparables:

| Elemento | Qué se compara | Qué se ignora o iguala |
|---|---|---|
| Tablas | Nombre, juego de caracteres y collation | Motor y siguiente valor automático |
| Columnas | Nombre, tipo, signo, nulabilidad, valor por omisión, actualización automática y collation | Ancho de presentación de enteros; mayúsculas y comillas de los valores por omisión; mayúsculas de `CURRENT_TIMESTAMP` |
| Índices | Unicidad y columnas en orden | El nombre de los índices creados automáticamente |
| Llaves foráneas | Tabla, columnas, referencia y regla de borrado y actualización | `NO ACTION` y `RESTRICT` se igualan |
| `CHECK` | Nombre y tabla | Redacción de la expresión |

**Diferencias aceptadas** (se listan en la salida, pero no fallan):

1. `CHECK` ausentes en TiDB cuando no se hacen cumplir.
2. Índices que existen en un lado solo para sostener una llave foránea.

Cualquier otra diferencia, incluida una llave foránea ausente, termina con código distinto de 0. Aceptar una diferencia nueva exige anotarla aquí y en `05-restricciones-tidb.md`.

## Comprobaciones de lectura permitidas

| # | Petición | Esperado |
|---|---|---|
| 1 | `GET {api}/health` | 200 y base correcta |
| 2 | `GET {web}/` y su `main.dart.js` | 200; contiene la dirección de la API |
| 3 | `GET {web}/aviso-privacidad.html` | 200; «Versión 2» |
| 4 | `OPTIONS {api}/auth/login` con el origen del cliente | Permitido y con exposición correcta |
| 5 | La misma con un origen ajeno | Sin permiso |
| 6 | `GET {api}/users` sin sesión | 401 |
| 7 | `POST {api}/auth/login` correcto, tres cuentas | 200 con el rol esperado |
| 8 | `GET {api}/terms/current` por cuenta | Versión 2; pendiente salvo las indicadas en `--terminos-aceptados` |

Si un acceso falla, el guion se detiene de inmediato (no reintenta) porque cada fallo escribe en la bitácora. Está prohibido consultar panel, pagos o tickets y aceptar términos. Que no cambiaron datos se demuestra ejecutando `check-schema --conteos --huellas` antes y después: filas y huellas de todas las tablas deben ser idénticas.
