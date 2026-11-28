# Contrato: configuración por entorno

Solo nombres y reglas. **Ningún valor secreto se escribe en el repositorio.**

## Servidor y scripts

| Variable | Local | Render | Regla |
|---|---|---|---|
| `PORT` | 3000 | la define Render | — |
| `DB_HOST`, `DB_PORT` | `localhost`, 3306 | datos de TiDB, 4000 | — |
| `DB_USER`, `DB_PASSWORD` | propios | usuario dedicado con prefijo | Nunca `root` ni la cuenta administradora, sin excepciones. Si no se puede crear el usuario dedicado, el paso se detiene |
| `DB_NAME` | `motorix` | `motorix` | — |
| `DB_TEST_NAME` | `motorix_test` | no se usa | Debe terminar en `_test` |
| `DB_SSL` | ausente | `true` | Solo `true` activa TLS verificado |
| `TZ` | recomendada | `America/Mexico_City` | La sesión de la base toma el mismo desfase |
| `JWT_SECRET` | obligatoria | obligatoria, distinta de la local | 32 caracteres o más; no el valor de ejemplo |
| `CORS_ORIGIN` | opcional | URL del Static Site | Orígenes exactos separados por coma, sin `/` final |
| `TRUST_PROXY` | ausente (0) | número comprobado | Entero de 0 a 5 |
| `LOG_CLIENT_IP` | ausente | temporal | Se quita tras ajustar `TRUST_PROXY` |
| `NODE_VERSION` | — | `24.22.1` | — |
| `MP_MODE` | `simulated` | `simulated` | Demostración |
| `MP_ACCESS_TOKEN` | opcional | no se define | — |

## Script de demostración y comprobaciones

| Variable | Regla |
|---|---|
| `DEMO_ADMIN_PASSWORD`, `DEMO_RECEPCION_PASSWORD`, `DEMO_MECANICO_PASSWORD` | 12 caracteres o más con mayúscula, minúscula y número; distintas entre sí; no publicadas |

## Archivos de variables fuera del repositorio

| Archivo (carpeta personal, no OneDrive) | Contenido |
|---|---|
| `$HOME\motorix-nube-test.env` | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=motorix_test`, `DB_TEST_NAME=motorix_test`, `DB_SSL=true`, `TZ`, las tres `DEMO_*` de prueba |
| `$HOME\motorix-nube.env` | Lo mismo con `DB_NAME=motorix`, sin `DB_TEST_NAME` y con las contraseñas definitivas |

Un valor con `#` o espacios va entre comillas simples. Los dos archivos usan el **usuario dedicado**. La cuenta administradora solo se usa a mano, en el editor SQL del proveedor, para tareas de administración (crear bases y usuario, activar `CHECK`, recrear la base de demostración); sus credenciales no se escriben en ningún archivo.

## Cliente

| Parámetro de compilación | Regla |
|---|---|
| `API_BASE_URL` | `https://…/api`, sin `/` final |
