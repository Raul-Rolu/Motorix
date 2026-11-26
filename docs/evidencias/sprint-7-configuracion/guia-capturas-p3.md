# Guía de capturas del bloque P3 (Sprint 7): reportes

Tarea T149 de `specs/008-configuracion-seguridad-reportes/tasks.md`. **Las capturas las toma el usuario con la aplicación**; esta guía dice qué abrir, qué filtro usar y qué cifras deben verse. Se guardan en `docs\evidencias\sprint-7-configuracion\` con **estos nombres exactos**:

| # | Archivo | Pestaña | Filtro |
|---|---|---|---|
| 1 | `s7-13-reporte-ingresos.png` | Ingresos | Mes anterior |
| 2 | `s7-14-servicios-productividad.png` | Servicios y Productividad (una sola imagen) | Mes actual |
| 3 | `s7-15-refacciones-margen.png` | Refacciones | Mes anterior |
| 4 | `s7-16-rotacion.png` | Rotación | Mes actual |
| 5 | `s7-17-exportacion-csv.png` | CSV de Refacciones abierto en Excel | Mes anterior |
| 2b | `s7-14b-productividad.png` | Productividad (adicional) | Mes actual |

## Antes de empezar

1. **Base `motorix`:** con el seed 012 aplicado (ya lo está). No la modifiques ni repitas seeds. Si en esta base falta `BAT-12V-60`, el seed omitió ese uso de la orden 9103 y eso cambia lo que verás en Refacciones y Rotación (indicado abajo).
2. **Confirma las cifras exactas de tu base** con la consulta de solo lectura (no modifica nada):
   `mysql -u root -p -D motorix -t < docs\evidencias\sprint-7-configuracion\verificar-cifras-capturas-p3.sql`
   Cada sección de su salida (1 a 5) corresponde a una captura y trae los **dos meses**. Si una cifra de pantalla no coincide con la consulta, no tomes la captura todavía.
3. **Servidor y app:** el código del servidor no cambió desde el tramo 5 (solo comentarios y documentos), así que **no es obligatorio reiniciarlos**. Sí conviene una **sesión nueva de la app** para no ver datos en caché de antes de aplicar el seed: cierra sesión y entra de nuevo como `admin`, o abre «Reportes» y pulsa «Actualizar» en cada pestaña. Si el servidor se arrancó antes de la ruta de exportación (tramo 5), reinícialo; si ya probaste «Exportar CSV», ya la tiene.
4. **Cuenta y datos:** entra con `admin` (cuenta de ejemplo). Los reportes solo muestran nombres de mecánicos de ejemplo, códigos y nombres de refacciones, números de orden e importes: no hay clientes ni placas. Revisa que el recuadro no incluya nada personal (ver la nota de privacidad al final).
5. **Tamaño:** usa la misma ventana (barra lateral expandida) que en las capturas anteriores. Atajo de Windows: `Win + Shift + S`.
6. **Fechas:** los meses se calculan con el día de hoy (el seed 012 se sembró con fechas relativas). Si sembraste el mes pasado y ya cambió el mes, usa la sección 0 de la consulta para ver qué rango es cada filtro.

## s7-13 — `s7-13-reporte-ingresos.png`

- **Ruta:** Reportes → pestaña **Ingresos** → chip **Mes anterior**.
- **Debe verse** (rango «Del 01/10/2026 al 31/10/2026», si el mes anterior es octubre de 2026):
  - **Total cobrado: `$7070.50`** (suma de los pagos del seed 012 `$4920.50` y los del seed 007 `$2150.00`; si tienes pagos propios en ese mes, la consulta sección 1 da tu total).
  - **Ingresos por día:** `05/10/2026 $3350.00`, `06/10/2026 $1040.50`, `09/10/2026 $800.00`, `12/10/2026 $1480.00` y `20/10/2026 $400.00`.
  - **Por método de pago**, del mayor al menor: Efectivo `$3350.00`, Transferencia `$1540.50`, Tarjeta `$1480.00` y Mercado Pago `$700.00`.
- **Qué confirma:** los cuatro métodos, y que el pago vencido (EXPIRED) de `$300.00` de la orden 9103 **no** se suma.

## s7-14 — `s7-14-servicios-productividad.png`

La tarea pide **una sola imagen**, pero son dos pestañas. Toma una captura de **Servicios** y otra de **Productividad** (mismo filtro, **Mes actual**) y únelas una junto a la otra o una sobre otra en Paint o en la Galería de Fotos, guardando el resultado con este nombre. Si prefieres no unirlas, guarda `s7-14-servicios-productividad.png` con Servicios y avísame para registrar `s7-14b-productividad.png` como archivo adicional.

- **Servicios (Mes actual).** Cifras que **pone el seed 012**: Cambio de aceite `2 servicios $1300.00`, Afinación `1 servicio $950.00`, Rotación de neumáticos `1 servicio $300.00` y Sin tipo `1 servicio $220.00`. Si la orden 9001 del seed 010 también cayó en este mes, Cambio de aceite sale con `3 servicios $1950.00` y la fila «Total» suma `6 servicios $3420.00`; sin ella, el Total es `5 servicios $2770.00`.
- **Productividad (Mes actual).** El seed 012 pone: Mecánico de Apoyo (ejemplo) `1 orden $400.00`, Mecánico del Taller `1 orden $280.00` y **Sin asignar al final** con `1 orden $150.00`. Si las órdenes 9001 (mano de obra `$300.00`) y 6 (sin mano de obra) también cayeron en este mes, Mecánico del Taller sale con `3 órdenes $580.00` y pasa al primer lugar.
- **Qué confirma:** servicios con y sin tipo («Sin tipo»), dos mecánicos y «Sin asignar», fila «Total» en ambas, y que la orden cancelada 9107 no aparece.

## s7-15 — `s7-15-refacciones-margen.png`

- **Ruta:** Reportes → pestaña **Refacciones** → chip **Mes anterior**.
- **Debe verse** (con `BAT-12V-60` ausente de tu base: **4 líneas**, la más reciente primero):

| Refacción (código · orden) | Cant. | Precio unitario | Costo total | Margen total |
|---|---|---|---|---|
| Refacción de ejemplo sin precio de compra (DEM-SIN-COSTO · Orden #9103) | 2 | `$95.00` | **sin costo** | **—** |
| Pastillas de freno delanteras (FRN-PAS-220 · Orden #9102) | 1 | `$450.00` | `$310.00` | `$140.00` |
| Aceite sintético 5W30 (litro) (LUB-0530-1L · Orden #9101) | 4 | `$180.00` | `$520.00` | `$200.00` |
| Filtro de aceite (FLT-OIL-010 · Orden #9101) | 1 | `$120.00` | `$78.50` | `$41.50` |

  - **Resumen:** Ventas `$1290.00`, Costo `$908.50`, Margen `$381.50`.
  - **Aviso:** «1 línea sin costo no se incluye en estos totales.»
  - **Pie:** «Página 1 de 1 · 4 líneas».
- **Nota:** en una base completa (con la batería) saldría una 5.ª línea «sin precio» y el aviso hablaría de «1 línea sin costo y 1 sin precio»; los totales serían los mismos. En tu base no aparece.
- **Qué confirma:** costo y margen por línea, la marca «sin costo» (nunca con costo 0) y que la línea incompleta queda fuera de los totales.

## s7-16 — `s7-16-rotacion.png`

- **Ruta:** Reportes → pestaña **Rotación** → chip **Mes actual**.
- **Debe verse:** salidas, existencia y rotación (salidas ÷ existencia, dos decimales), de mayor a menor rotación y a igualdad por nombre; **solo refacciones activas**. Sin `BAT-12V-60` y sin la refacción inactiva FLT-AIR-000, son **6 refacciones** («Página 1 de 1 · 6 refacciones»).
- **Salidas que pone el seed 012 este mes:** COR-DIS-004 `1`, BUJ-IR-001 `4`, FLT-OIL-010 `2` y LUB-0530-1L `5`. Si el seed 005 se sembró este mes, suma además 1 salida de FLT-OIL-010 (`3`) y 4 de LUB-0530-1L (`9`). Rotación esperada: COR-DIS-004 `1/1 = 1.00`, BUJ-IR-001 `4/8 = 0.50`, FLT-OIL-010 `0.18` o `0.27` y LUB-0530-1L `0.15` o `0.26`; después, con `0.00`, FRN-PAS-220 y DEM-SIN-COSTO. La existencia no cambió (11, 34, 8, 1, 2 y 3). La sección 5 de la consulta da los valores exactos.
- **Qué no se verá:** «sin existencia» (ninguna refacción está en 0); está probado en las pruebas automáticas.

## s7-17 — `s7-17-exportacion-csv.png`

- **Ruta:** Reportes → pestaña **Refacciones** → **Mes anterior** → botón **Exportar CSV**. El archivo queda en Descargas: `motorix-parts-2026-10-01-2026-10-31.csv`. Ábrelo en Excel.
- **Debe verse en la hoja** (6 filas):
  - **Encabezado:** Orden, Código, Refacción, Cantidad, Precio de venta unitario, Precio de compra unitario, Ventas, Costo, Margen, Observación.
  - **9103, DEM-SIN-COSTO**, «Refacción de ejemplo sin precio de compra», 2, 95.00, *(vacío)*, 190.00, *(vacío)*, *(vacío)*, «sin costo».
  - **9102, FRN-PAS-220**, «Pastillas de freno delanteras», 1, 450.00, 310.00, 450.00, 310.00, 140.00.
  - **9101, LUB-0530-1L**, «Aceite sintético 5W30 (litro)», 4, 180.00, 130.00, 720.00, 520.00, 200.00.
  - **9101, FLT-OIL-010**, «Filtro de aceite», 1, 120.00, 78.50, 120.00, 78.50, 41.50.
  - **Total (líneas completas):** Ventas 1290.00, Costo 908.50, Margen 381.50 y la observación «1 línea sin costo no se incluye en estos totales.»
- **Qué confirma:** acentos y eñes correctos (UTF-8 con BOM), columnas separadas, importes numéricos y los mismos números que la pantalla. Si Excel muestra todo en una sola columna (separador de lista de tu configuración regional), usa **Datos → Obtener datos → Desde texto/CSV**, con origen «UTF-8».
- Si quieres evidencia de la neutralización de fórmulas, no la fuerces con datos reales: está cubierta por `reports-export.test.js`.

## Privacidad: qué recortar

- **No incluyas** la barra de título del explorador ni la ruta completa de Descargas: contienen tu usuario de Windows (`C:\Users\<tu nombre>\...`). El mensaje verde «Archivo guardado en …» de la app trae esa ruta: **toma la captura sin el aviso** (espera a que desaparezca) o recórtalo.
- En **Excel**, recorta el nombre y la foto de tu cuenta de Microsoft (esquina superior derecha) y la pestaña «Archivo → Información», que muestra la ruta.
- En la app, la barra lateral muestra el usuario de ejemplo `admin`; no hay clientes, teléfonos, placas ni correos en los reportes.

## Capturas tomadas y diferencias observadas (2026-11-25)

Las seis imágenes existen en esta carpeta, son PNG válidos y no están vacías (`s7-13` 51 KB, `s7-14` 39 KB, `s7-14b` 37 KB, `s7-15` 66 KB, `s7-16` 63 KB y `s7-17` 106 KB). Se revisó su contenido: solo muestran la cuenta de ejemplo («Administrador del Taller»), códigos, nombres de refacciones, números de orden e importes; la de Excel muestra únicamente el nombre del archivo, sin ruta, cuenta de Microsoft ni usuario de Windows.

`s7-14-servicios-productividad.png` contiene solo la pestaña **Servicios**; Productividad quedó en el archivo adicional `s7-14b-productividad.png` (la alternativa que ofrecía esta guía en lugar de unirlas).

| Captura | Coincide con la guía | Diferencia (datos propios de la base `motorix`) |
|---|---|---|
| `s7-13` Ingresos, Mes anterior | Días 05/10, 06/10, 09/10 y 20/10 y el pago por transferencia de `$1540.50`. | **Total cobrado `$9120.50`** (la guía decía `$7070.50`): hay **`$2050.00` más** el 12/10/2026, que sale como `$3530.00` (en lugar de `$1480.00`). Por método: Efectivo `$3750.00` (+`$400.00`), Tarjeta `$2430.00` (+`$950.00`) y Mercado Pago `$1400.00` (+`$700.00`); Transferencia coincide. Son pagos propios de la base, no del seed 012; la diferencia sale de restar las pantallas a la guía. |
| `s7-14` Servicios, Mes actual | Coincide con el caso en que la orden 9001 cayó este mes: Cambio de aceite 3 por `$1950.00`, Afinación `$950.00`, Rotación de neumáticos `$300.00`, Sin tipo `$220.00`; Total 6 servicios, `$3420.00`. | Ninguna. |
| `s7-14b` Productividad, Mes actual | Coincide con el caso de las órdenes 9001 y 6: Mecánico del Taller 3 órdenes `$580.00`, Mecánico de Apoyo (ejemplo) 1 orden `$400.00`, Sin asignar 1 orden `$150.00`; Total 5 órdenes, `$1130.00`. | Ninguna. |
| `s7-15` Refacciones, Mes anterior | Las 4 líneas, Ventas `$1290.00`, Costo `$908.50`, Margen `$381.50`, el aviso de 1 línea sin costo y «Página 1 de 1 · 4 líneas». | Ninguna. |
| `s7-16` Rotación, Mes actual | COR-DIS-004 `1/1 = 1.00`, FLT-OIL-010 `2/11 = 0.18`, LUB-0530-1L `5/34 = 0.15`, FRN-PAS-220 y DEM-SIN-COSTO en `0.00`. | **8 refacciones** (la guía decía 6): hay dos refacciones propias de la base, «Batería 12V 60Ah» (`V-001`, 5 en existencia) y «Faros» (`F-001`, 20 en existencia), ambas con 0 salidas. Además **BUJ-IR-001 sale `6/10 = 0.60`** (la guía decía `4/8 = 0.50`): en esa base la bujía tiene 6 salidas este mes y 10 en existencia por movimientos propios. El pie dice «Página 1 de 1 · 8 refacciones». |
| `s7-17` CSV en Excel, Mes anterior | Encabezado, las 4 filas y la fila «Total (líneas completas)» con 1290, 908.5 y 381.5; «sin costo» en DEM-SIN-COSTO; acentos correctos. | Ninguna (Excel muestra los importes como números sin ceros finales: `78.5`, `908.5`). |

Estas diferencias no son errores de los reportes ni del seed 012: la pantalla de Ingresos y la de Rotación suman todo lo que hay en la base, y la guía solo conocía los datos de los seeds. Las cifras de las capturas son las de la base del autor en esa fecha.

## Al terminar

T149 se cerró el 2026-11-25 con las seis imágenes anteriores (las cinco previstas y la adicional `s7-14b`).
