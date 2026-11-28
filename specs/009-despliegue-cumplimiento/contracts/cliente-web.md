# Contrato: cliente web

## Acciones de plataforma

Una sola exportación condicional (`dart.library.io` / `dart.library.js_interop`) en `lib/services/platform/`.

| Acción | Escritorio (sin cambios) | Web |
|---|---|---|
| Guardar CSV | Carpeta Descargas sin sobrescribir; «Archivo guardado en {ruta}.» | Descarga del navegador con el nombre saneado, mismos bytes con BOM; «Archivo descargado.» |
| Imprimir ticket | Archivo temporal y programa del sistema | Pestaña nueva con el mismo HTML, abierta en el mismo gesto; si el navegador la bloquea, «El navegador bloqueó la ventana. Permita las ventanas emergentes e intente de nuevo.» |
| Aviso de privacidad | No se muestra el enlace | Enlace «Aviso de privacidad» en la pantalla de acceso; abre `aviso-privacidad.html` en pestaña nueva |

`sanearNombreCsv`, `construirHtmlTicket` y `construirTextoTicket` siguen siendo comunes.

## Página pública del aviso

Usa los colores, la tipografía y los espaciados **reales de la aplicación**: el tema de Flutter de `client/lib/config/theme.dart` (decisión del usuario del 2026-11-27). No usa la paleta de `docs/design-system.md`; esa diferencia es la deuda D1 de `tasks.md`. Los valores se declaran una sola vez como variables de estilo y el resto de la página solo usa esas variables.

| Elemento | Valor de la aplicación | Origen |
|---|---|---|
| Enlaces y acento | `#2E7D32` | `MotorixColores.acento` |
| Fondo y panel | `#F7F8F7` y `#FFFFFF` | `fondo`, `superficie` |
| Borde | `#DADCE0` | `borde` |
| Texto principal y secundario | `#1B1B1B` y `#5F6368` | `textoPrincipal`, `textoSecundario` |
| Tipografía | Roboto si está disponible, con respaldo del sistema; no se descarga | Tipografía por omisión de Material 3 (el tema no define otra) |
| Tamaños y pesos | 28/400 título, 22/400 apartados, 16/500 subapartados, 14/400 cuerpo, 12/400 notas | `headlineMedium`, `titleLarge`, `titleMedium`, `bodyMedium`, `bodySmall` |
| Espaciado | Solo 4, 8, 16, 24 y 32 px | `MotorixEspaciados` (`xs` a `xl`) |
| Forma | Panel con borde y radio de 8 px, sin sombra ni degradados | `MotorixEspaciados.radio`, `cardTheme` |

## Desactivación (solo si se activa el corte)

El botón afectado queda deshabilitado en web con el texto «No disponible en la versión web; use la aplicación de escritorio.» y se anota como deuda.

## Pruebas

| Prueba | Dónde |
|---|---|
| Mensajes y comportamiento de escritorio | `flutter test` |
| Enlace visible u oculto según plataforma | `flutter test` |
| Descarga y apertura en navegador | `flutter test --platform chrome test/web` |
| Los 5 reportes, ticket y recursos de terceros | Manual, tramo 4 |
