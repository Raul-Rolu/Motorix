# Guía de capturas del bloque P2 (Sprint 7)

Tarea T103 de `specs/008-configuracion-seguridad-reportes/tasks.md`. **Las capturas las toma el usuario con la aplicación.** Esta guía registra qué evidencia pide la tarea, con qué archivo se cubre y qué falta.

## Qué pedía T103 y qué archivo lo cubre

La lista original de T103 usaba otros nombres y otro orden que los de los archivos que se tomaron. Se conservan **los nombres reales** de los archivos (no se renombraron) y se registra la equivalencia:

| Evidencia que pide T103 | Criterio | Archivo real | Estado |
|---|---|---|---|
| Pantalla de aceptación de términos (`s7-06-terminos-aceptacion.png`) | CA-16 | `s7-10-aceptacion-terminos.png` | Cubierta |
| Administración de términos (`s7-07-terminos-admin.png`) | CA-18 | `s7-11-terminos-admin.png` | Cubierta |
| Bitácora (`s7-08-bitacora.png`) | CA-20 | `s7-08-bitacora.png` | Cubierta |
| Bitácora con filtros (`s7-09-bitacora-filtros.png`) | CA-20 | `s7-09-bitacora-filtros.png` | Cubierta |
| Contraseña rechazada por la política (`s7-10-contrasena-rechazada.png`) | CA-22 | `s7-12-contrasena-rechazada.png` | Cubierta |
| Sesión cerrada por inactividad (`s7-11-sesion-inactividad.png`) | CA-23 | `s7-07-inactividad-login.png` | Cubierta |
| (adicional) Tarjeta «Seguridad» de Configuración | CA-23 | `s7-06-seguridad-ajustes.png` | Cubierta |

## Estado

Las seis evidencias de T103 existen. La de la contraseña rechazada (CA-22) se tomó en **Usuarios → Nuevo usuario** con una contraseña que incumple la política: el formulario muestra «La contraseña no cumple la política mínima.» bajo el campo y no se crea el usuario. La aplicación no tiene pantalla de cambio de contraseña propia, por eso la captura sale del alta de usuarios.

## Verificación por la API de lo que no se ve en pantalla

Los escenarios E5 a E7 se ejecutaron por la API sobre `motorix_test` (71 verificaciones en verde): `escenarios-p2-api.mjs`, con su salida en `escenarios-p2-api-corrida.txt`. Incluyen el rechazo de contraseñas de 7 caracteres y sin mayúscula, minúscula o número (`400 CONTRASENA_INVALIDA`), y la captura `s7-12-contrasena-rechazada.png` es su evidencia visual.
