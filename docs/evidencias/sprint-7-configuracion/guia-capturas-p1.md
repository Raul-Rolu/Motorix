# Guía de capturas del bloque P1 (Sprint 7)

Tarea T056 de `specs/008-configuracion-seguridad-reportes/tasks.md`. **Las capturas las toma el usuario con la aplicación**; esta tarea sigue sin marcar hasta que existan los seis archivos en esta carpeta.

## Preparación (una sola vez)

1. Base `motorix` con las migraciones 001–021 y los seeds 001–010 aplicados (ver `database/README.md`, «Orden obligatorio: migraciones → seeds → servidor»).
2. Servidor: `cd server; npm start`. Cliente: `cd client; flutter run -d windows`.
3. **Una sola sesión basta**: todas las capturas se toman como administrador (`admin` / `Admin123`). Hazlas en este orden: cada paso deja la base lista para el siguiente.

## Capturas (en orden)

| # | Archivo | Pantalla y pasos | Qué debe verse |
|---|---|---|---|
| 1 | `s7-00-configuracion-taller.png` | Menú **Configuración** → sección «Datos del taller». Cambia «Nombre del taller» a `Taller El Pistón` y «Teléfono» a `555-123-4567` y pulsa **Guardar**. Captura de inmediato. | Los campos con los valores nuevos y el snackbar verde «Datos del taller guardados.». |
| 2 | `s7-01-configuracion-operacion.png` | En la misma pantalla, baja a la sección «Operación». Pon 15 (días), 500 (km) y 5 (días de orden detenida) y pulsa **Guardar** de esa sección. | Los tres valores, los textos de ayuda «Entre 1 y 365 días.», «Entre 100 y 50000 km.», «Entre 1 y 90 días.» y el snackbar «Ajustes de operación guardados.». |
| 3 | `s7-02-catalogo-servicios.png` | Menú **Catálogo de servicios**. Opcional: desactiva «Rotación de neumáticos» (pide **Confirmar**) para que se vea un «Inactivo». | Los 4 tipos con su intervalo («180 días · 5,000 km», «365 días · 10,000 km», «180 días», «10,000 km»), las etiquetas «Activo»/«Inactivo» y los botones de editar y desactivar, **sin botón de borrar**. |
| 4 | `s7-03-linea-con-tipo.png` | Menú **Órdenes** → abre la orden **#2** (En reparación). En «Servicios y mano de obra» pulsa **Agregar servicio**: descripción `Alineación y balanceo`, importe `400`, tipo **Cambio de aceite** (o el que quieras) → **Agregar**. Captura la orden ya con la línea. | La línea nueva con el subtítulo «Servicio · Cambio de aceite» y el snackbar «Servicio agregado a la orden.». (Si prefieres, toma antes una captura del diálogo abierto.) |
| 5 | `s7-04-ticket-proximo-servicio.png` | **Órdenes** → orden **#9001** (Entregado) → **Ver ticket**. | Folio `TCK-AAAA-9001`, el taller **«Motorix»** (instantánea: no cambió aunque editaste el nombre en la captura 1) y la fila **«Próximo servicio»** con una fecha (emisión + 180 días) y `36,200 km`. |
| 6 | `s7-05-propuesta-mantenimiento.png` | Menú **Mantenimientos** → **Nuevo mantenimiento**. Elige el vehículo `JKL-012-D — Toyota Corolla`, pulsa **Proponer desde una orden** y elige **Orden #9001**. Captura antes de guardar. | La «Fecha objetivo» y el «Kilometraje objetivo» (36200) rellenados, editables, y el snackbar «Se propusieron la fecha y el kilometraje; puede corregirlos antes de guardar.». |

Guarda los archivos en `docs/evidencias/sprint-7-configuracion/` con **exactamente** esos nombres.

## Qué NO debe pasar (si lo ves, avísame)

- El ticket #9001 muestra «Taller El Pistón» (debería conservar «Motorix»).
- El ticket de un sprint anterior (por ejemplo, el de la orden 4) muestra «Próximo servicio» (no debe).
- Aparece un botón para borrar un tipo de servicio.
- Con `recepcion` o `mecanico` aparecen «Configuración» o «Catálogo de servicios» en el menú.

## Para dejar la base como estaba tras las capturas (opcional)

En **Configuración** restaura 30 / 1000 / 3 y el nombre `Motorix` / teléfono `555-000-0000`; los cambios de las capturas 1 y 2 son datos reales de tu base, no de los seeds.
