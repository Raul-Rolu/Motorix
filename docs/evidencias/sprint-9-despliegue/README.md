# Evidencias del mini-sprint 009: despliegue y cumplimiento

Especificación, plan y tareas en `specs/009-despliegue-cumplimiento/`.

## Reglas

- **Nunca** se incluyen contraseñas, secretos, tokens ni cadenas de conexión, tampoco en capturas.
- No se incluyen nombres completos del servidor de la base de datos ni direcciones IP.
- No se guardan aquí respaldos de bases ni archivos de variables de entorno.
- Los archivos de texto van en UTF-8. Antes de versionarlos se revisan.
- Lo que no se pudo comprobar se declara como no comprobado.

Para guardar una salida desde PowerShell:

```powershell
<comando> | Out-File -Encoding utf8 docs\evidencias\sprint-9-despliegue\<archivo>.txt
```

## Índice

Estado: **Pendiente** hasta que el archivo exista y su verificación haya pasado.

| Archivo | Contenido | Tarea | Estado |
|---|---|---|---|
| `00-linea-base.txt` | Pruebas del servidor y del cliente antes de cambiar código | T005 | Verificado: 109 suites y 1329 pruebas; cliente 351 |
| `01-enmienda.md` | Aprobación de la enmienda de la constitución | T010 | Registrada: filas 1 a 12, 2026-11-28 |
| `02-suite-tramo1.txt` | Suite del servidor tras el tramo 1 | T027 | Pendiente |
| `esquema-local.json` | Firma del esquema en MySQL local | T028 | Pendiente |
| `03-migraciones-tidb.txt`, `esquema-tidb.json` | Migraciones y firma del esquema en TiDB | T029 | Pendiente |
| `04-pruebas-tidb.txt` | Comparación de esquemas y suites en TiDB | T030 | Pendiente |
| `05-restricciones-tidb.md` | Llaves foráneas y `CHECK` que se cumplen | T031 | Pendiente |
| `06-suite-tramo2.txt` | Suite del servidor tras el tramo 2 | T049 | Pendiente |
| `07-api-local.txt` | Arranque, CORS, límite de intentos y salud, en local | T050 | Pendiente |
| `afirmaciones-textos.md` | Cada afirmación de los textos legales con su comprobación | T056 | Pendiente |
| `08-textos.txt` | Pruebas de los textos y de la página del aviso | T059 | Pendiente |
| `09-suite-web.txt` | Análisis y pruebas del cliente, incluidas las de navegador | T072 | Pendiente |
| `10-web-local.md` | Reportes, ticket, terceros y escritorio, probados a mano | T073 | Pendiente |
| `11-demo-doble-corrida.txt` | Doble carga de demostración, local y en TiDB | T084, T085 | Pendiente |
| `12-suites-finales.txt` | Suites completas finales | T086 | Pendiente |
| `13-escenarios-locales.txt` | Guiones de escenarios contra `motorix_test` local | T091 | Pendiente |
| `14-migraciones-nube.txt` | Migraciones sobre `motorix` en la nube | T093 | Pendiente |
| `15-api-publica.txt` | Salud pública y ajuste del proxy | T094, T095 | Pendiente |
| `16-carga-ensayo.txt` | Carga de ensayo | T098 | Pendiente |
| `17-lectura-publica.txt` | Comprobaciones de solo lectura, con filas y huellas | T099 | Pendiente |
| `capturas/` | Capturas del sistema publicado | T102, T105 | Pendiente |
| `18-carga-final.txt` | Respaldo comprobado y carga final, sin datos | T103 | Pendiente |
| `19-lectura-final.txt` | Comprobaciones de lectura tras la carga final | T104 | Pendiente |
| `deuda-tecnica.md` | Deuda con su riesgo; pagos digitales simulados | T101 | Pendiente |
| `criterios-exito.md` | SC-001 a SC-012 con su evidencia y estado real | T107 | Pendiente |

## Direcciones públicas

Se anotan al publicar (T097). Pendiente.

## Avance de la preparación

| Paso | Estado |
|---|---|
| 0.1 Rama `009-despliegue-cumplimiento` | Verificado el 2026-11-27 |
| 0.2 Instancia TiDB Cloud Starter | Confirmado por el usuario el 2026-11-27 |
| 0.3 Bases y usuario dedicado | Confirmado por el usuario el 2026-11-28: bases `motorix` y `motorix_test`, y usuario `motorix_app` (con prefijo) con permisos solo sobre ellas. Falta comprobar la conexión |
| 0.4 Archivo de variables fuera del repositorio | Confirmado por el usuario el 2026-11-28: creado fuera del repositorio con 11 variables |
| 0.5 Terminal sin variables que sustituyan al archivo | Confirmado por el usuario el 2026-11-28 |
| Conexión del usuario dedicado (verificación de 0.3) | Correcta según el usuario, 2026-11-28: comprobación de solo lectura con `RESULTADO: correcto` (TLS, `motorix_app`, no `root`, permisos solo sobre las dos bases) |
| 0.6 Cuenta de Render conectada al repositorio | Confirmado por el usuario el 2026-11-28 |
| 0.7 Longitud del `JWT_SECRET` local | Confirmado por el usuario el 2026-11-28: mide 96 (mínimo 32) |
| 0.8 y 0.9 Línea base de pruebas | Verificado el 2026-11-28 (`00-linea-base.txt`) |
