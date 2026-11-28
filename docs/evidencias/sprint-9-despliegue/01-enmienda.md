# Aprobación de la enmienda a la constitución (T010)

| Dato | Registro |
|---|---|
| Documento aprobado | `specs/009-despliegue-cumplimiento/contracts/enmienda-constitucion.md` (versión 2.0.0) |
| Filas aprobadas | 1 a 12 (todas) |
| Aprobó | El equipo (consultado por Raul Francisco Amador) |
| Fecha | 2026-11-28 |
| Registrado a partir de | Confirmación del usuario en la sesión de implementación |

La fila 1 («MySQL local» → «MySQL o TiDB compatible») ya estaba aprobada antes de redactar el texto único; las filas 2 a 12 eran nuevas.

## Filas

| # | Cambio aprobado |
|---|---|
| 1 | MySQL o una base compatible, como TiDB |
| 2 | Base alojada permitida para el despliegue |
| 3 | Pruebas en una base alojada `_test`; las comprobaciones sobre el sistema publicado no modifican datos |
| 4 | InnoDB en MySQL; en una base compatible, comprobar y documentar lo que hace cumplir |
| 5 | Variantes SQL de migraciones para una base compatible |
| 6 | Carga de demostración y textos legales con JavaScript y archivos de texto |
| 7 | `DB_SSL` y TLS verificado hacia una base alojada |
| 8 | Nunca `root` ni la cuenta administradora en aplicación, scripts ni pruebas |
| 9 | La carga de demostración aporta los datos del despliegue |
| 10 | Dependencias `express-rate-limit` y `web` |
| 11 | Hosting: TiDB Cloud Starter y Render, planes gratuitos |
| 12 | Versión 2.0.0, ratificación pendiente |

## Comprobación

El texto de la sección 2 del documento aprobado está copiado literalmente en `.specify/memory/constitution.md` y en `docs/reglas.md` (verificado el 2026-11-28).

## Notas

- La **ratificación** de la constitución sigue pendiente.
- La sección «Gobernanza» indica que las enmiendas las coordina el director del proyecto; este registro no incluye su participación porque no se indicó.
- Esta aprobación no cubre la desviación del Principio VIII en la página del aviso (deuda D1 de `tasks.md`).
