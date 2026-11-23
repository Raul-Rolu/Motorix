# Motorix — Sistema de diseño (UI)

> **Documento complementario de `project-context.md`**
> Guía visual para el desarrollo asistido por IA (OpenCode) del frontend en Flutter.
> Si una decisión de este documento cambia, actualizarlo antes de modificar la interfaz.

---

## 1. Propósito y reglas para el agente

Este documento define cómo debe verse y comportarse la interfaz de Motorix. El objetivo es una UI profesional, sobria y con identidad propia, que no parezca generada por IA.

### Reglas para el agente de IA

- Usar **Material Design 3** como base obligatoria (`useMaterial3: true`).
- **No** usar el tema por defecto de Material: definir un tema propio ([sección 4](#4-tema-de-material-3)).
- Se permite una librería complementaria de diseño además de Material 3 ([sección 3](#3-stack-de-diseño-en-flutter)), sin reemplazar el tema M3.
- No introducir dependencias nuevas sin justificarlas y proponerlas antes.
- Todos los colores, tamaños de letra, radios y espacios salen de los tokens de este documento. **No escribir valores sueltos en las pantallas.**
- Respetar la lista de "qué evitar" ([sección 9](#9-qué-evitar-señales-de-hecho-por-ia)).
- **Prioridad: escritorio.** La interfaz debe ser responsive, pero se diseña primero para pantallas anchas.
- Mostrar en la navegación solo los módulos que existan en el sprint actual y que correspondan al rol del usuario.
- Toda transición y cambio de estado visual **DEBE** ser suave ([sección 6.4](#64-movimiento-y-transiciones)). No se permiten cambios bruscos de color, tamaño, posición ni opacidad.
- Toda acción destructiva o de salida **DEBE** pedir confirmación ([sección 8.5](#85-confirmaciones-obligatorias)). Esto incluye cerrar sesión, cancelar una cita, eliminar o anular registros, y cerrar formularios con cambios sin guardar.

---

## 2. Referencia visual

La referencia es un dashboard de taller mecánico con:

- Sidebar oscuro con ítem activo resaltado, ícono + etiqueta, usuario y "Cerrar sesión" al fondo.
- Tarjetas de resumen arriba con un número grande y un indicador de cambio.
- Una gráfica principal clara (tipo dona) en lugar de muchas gráficas pequeñas.
- Mucho espacio en blanco y poca decoración.

**Diferencias obligatorias respecto a la referencia:**

- La paleta **no** es azul índigo; es el rojo grisáceo definido en la [sección 5](#5-paleta-de-color).
- El contenido es el de Motorix (órdenes, citas, mantenimientos, stock), no módulos de otro sistema.

---

## 3. Stack de diseño en Flutter

### Base obligatoria

- Flutter + Dart, estado con **Provider**.
- Material Design 3 (`useMaterial3: true`) con `ThemeData` propio.

### Librerías complementarias permitidas

Material 3 es la base. Además, la app puede usar librerías de apoyo para el diseño, siempre que no reemplacen el tema M3 y se justifique su uso.

| Necesidad | Opción sugerida | Nota |
|---|---|---|
| Tipografía | `google_fonts` | Para IBM Plex Sans |
| Gráficas (dona, barras) | `fl_chart` | Para el dashboard |
| Tablas avanzadas | `data_table_2` | Alternativa: `PaginatedDataTable` nativo |
| Íconos | Un único set consistente (p. ej. `phosphor_flutter` o `lucide_icons_flutter`) | No mezclar sets |
| Componentes de UI complementarios | `shadcn_ui` (puede convivir con widgets Material) | Opcional; decidir en equipo |

**Reglas:**

- Máximo **una** librería de componentes de UI complementaria, y solo si aporta algo que Material 3 no cubre bien.
- Si se agrega una librería de componentes, debe configurarse con la misma paleta y tipografía de este documento.
- Antes de agregarla, OpenCode propone opciones (con ventajas y desventajas) y espera decisión del equipo.
- Verificar compatibilidad con la versión de Flutter del proyecto antes de instalar.

---

## 4. Tema de Material 3

El tema vive en `client/lib/utils/` (por ejemplo `app_theme.dart`) y es la **única fuente de estilos**.

```dart
final ColorScheme motorixScheme = ColorScheme.fromSeed(
  seedColor: const Color(0xFF9B4F55),
  brightness: Brightness.light,
).copyWith(
  primary: const Color(0xFF9B4F55),
  surface: const Color(0xFFFFFFFF),
  surfaceContainerLowest: const Color(0xFFF5F2F1),
  outlineVariant: const Color(0xFFDDD5D4),
  onSurface: const Color(0xFF231F20),
  error: const Color(0xFFC0392B),
);
```

Componentes que se configuran **en el tema** (no pantalla por pantalla):

- `NavigationRailThemeData` (sidebar)
- `DataTableThemeData`
- `ChipThemeData`
- `InputDecorationTheme`
- `FilledButtonThemeData`, `OutlinedButtonThemeData`, `TextButtonThemeData`
- `CardTheme` / `CardThemeData` (según la versión de Flutter)
- `DividerThemeData`
- `TooltipThemeData`
- `PageTransitionsTheme` (transiciones suaves entre pantallas, ver [6.4](#64-movimiento-y-transiciones))

---

## 5. Paleta de color

Color de marca: **rojo grisáceo (apagado)**. El rojo de alerta es distinto: más vivo, para que no se confunda con la marca.

| Token | Uso | Hex |
|---|---|---|
| `primary` | Marca, botones principales, ítem activo, enlaces | `#9B4F55` |
| `sidebar` | Fondo del sidebar | `#2B2325` |
| `sidebarActive` | Fondo del ítem activo del sidebar | `#43353A` |
| `background` | Fondo de la aplicación | `#F5F2F1` |
| `surface` | Paneles y formularios | `#FFFFFF` |
| `outline` | Bordes y divisores | `#DDD5D4` |
| `textPrimary` | Texto principal | `#231F20` |
| `textSecondary` | Texto secundario | `#6F6566` |
| `warning` | Advertencia / "próximo" | `#C9892B` |
| `success` | Éxito / "completado" | `#4F7A5A` |
| `danger` | Error / "vencido" / stock crítico | `#C0392B` |

> **Variantes alternativas del primario** (solo si el equipo decide cambiar): terracota apagada `#A0554A`, vino grisáceo `#7D4A53`.

### Reglas de uso del color

- El rojo grisáceo se usa en acciones principales, ítem activo y enlaces. **No en fondos grandes.**
- Los estados usan únicamente `warning`, `success` y `danger`.
- Colores planos. **Sin degradados.**
- Verificar contraste suficiente entre texto y fondo.

### Colores de estado de órdenes y citas

| Estado | Color |
|---|---|
| Pendiente / Recibido | Gris (`textSecondary`) |
| Diagnóstico / En proceso | `warning` |
| En reparación | `primary` |
| Esperando refacción | `warning` |
| Terminado / Completada / Entregado | `success` |
| Cancelada | `danger` |
| Mantenimiento próximo | `warning` |
| Mantenimiento vencido / Stock crítico | `danger` |

---

## 6. Tipografía, espacio, forma y movimiento

### 6.1 Tipografía

**Fuente:** IBM Plex Sans (vía `google_fonts`), con fuente de respaldo del sistema.

Escala fija de **4 tamaños**:

| Rol | Tamaño | Peso |
|---|---|---|
| Caption / etiquetas | 12 | Regular |
| Cuerpo | 14 | Regular / Medium |
| Título de sección | 18 | SemiBold |
| Indicador grande (KPI) / título de página | 28 | SemiBold |

### 6.2 Espaciado

Escala base de 4 px: **4, 8, 12, 16, 24, 32**. No usar otros valores.

### 6.3 Forma (bordes redondeados)

- Radio de botones e inputs: **6 px**.
- Radio de paneles: **8 px**.
- Radio de tarjetas, chips, avisos (snackbars, dialogs) y contenedores en general: **8 px**.
- Radio de barras de progreso y elementos tipo "pill": **12 px** o completamente redondeado.
- Nada de esquinas rectas salvo en separadores finos y líneas de tabla.
- Bordes finos (1 px) con `outline`. Sombras mínimas o ninguna.

### 6.4 Movimiento y transiciones

Toda transición **DEBE** ser suave. No se permiten cambios bruscos de color, tamaño, posición ni opacidad.

**Duraciones de referencia:**

| Tipo de cambio | Duración |
|---|---|
| Cambios de estado (hover, focus, selección) | 150 ms |
| Aparición o desaparición de elementos (snackbars, dialogs, tooltips) | 200 ms |
| Navegación entre pantallas | 250 ms |
| Cambio de ancho del sidebar (expandido/colapsado) | 200 ms |

**Reglas:**

- **Curva estándar:** `Curves.easeInOut` o `Curves.easeOutCubic`. No usar rebotes ni curvas exageradas.
- **Transiciones entre pantallas:** usar `PageTransitionsTheme` con una transición discreta (fade + slide leve). Nada de zooms, giros ni efectos vistosos.
- Los elementos interactivos (botones, ítems de menú, filas) **DEBEN** reaccionar visualmente a hover y focus con un cambio suave de color de fondo (por ejemplo, usando `InkWell`, `MouseRegion` o `AnimatedContainer`).
- Los indicadores numéricos del dashboard (KPI) pueden animar la aparición del número (contador) si el equipo lo decide; si se anima, debe ser discreto y durar **máximo 400 ms**.
- **No animar por animar:** cada transición debe tener una función (indicar cambio de estado, guiar la atención, dar retroalimentación).

---

## 7. Layout y navegación

### Estructura general

```text
┌──────────┬───────────────────────────────────────────┐
│          │ Header: título de sección · buscador ·    │
│ Sidebar  │ notificaciones · usuario · rol            │
│          ├───────────────────────────────────────────┤
│          │                                           │
│          │ Contenido                                 │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

### Sidebar colapsable

- Botón en la parte superior para expandir / contraer.
- **Expandido:** ~260 px, ícono + etiqueta.
- **Colapsado:** ~72 px, solo íconos con `Tooltip` al pasar el cursor.
- Si el ancho de la ventana es menor a ~1000 px, arranca colapsado.
- El estado (expandido/colapsado) se guarda en un `Provider` y se conserva al navegar.
- Animar el cambio de ancho (~200 ms).
- **Implementación base:** `NavigationRail` con la propiedad `extended`, `leading` para el botón y `trailing` para "Cerrar sesión".
- Fondo `sidebar`, ítem activo con `sidebarActive`, texto e íconos claros.
- Usuario actual y "Cerrar sesión" al fondo.

### Elementos del menú

```text
Dashboard
Clientes
Vehículos
Citas
Órdenes de servicio
Mantenimientos
Inventario
Pagos
Tickets
Usuarios
Configuración
Cerrar sesión
```

**Reglas:**

- Mostrar solo los módulos implementados en el sprint actual.
- Mostrar solo los módulos permitidos para el rol del usuario.
- Ocultar un botón **no es seguridad**: los permisos se validan también en backend.

### Header

Nombre de sección, buscador cuando sea útil, notificaciones, usuario actual y rol.
Las notificaciones son la **campana de avisos** (ver 8.7), a la izquierda del
nombre del usuario y del botón de cerrar sesión.

---

## 8. Componentes y patrones

### 8.1 Dashboard

- Fila de indicadores arriba (**máximo 4**): órdenes en reparación, citas de hoy, mantenimientos vencidos, refacciones con stock bajo. Número grande y, si aplica, indicador de cambio.
- Al menos una gráfica principal (por ejemplo, dona de órdenes por estado). Puede acompañarse de una o dos gráficas secundarias sencillas (por ejemplo, barras de servicios por mes, línea de ingresos), siempre que aporten información real.
- Una lista o tabla de actividad reciente (últimas órdenes, últimas citas).
- Los datos vienen de los módulos reales; no duplicar información solo para estadísticas.
- Las gráficas **DEBEN** usar la paleta de la [sección 5](#5-paleta-de-color) y animarse suavemente al aparecer ([sección 6.4](#64-movimiento-y-transiciones)).

### 8.2 Tablas (clientes, vehículos, órdenes, inventario, pagos)

- Tabla densa con filtros y búsqueda arriba.
- Estado como chip de color discreto.
- Estados de pago: Completado (`success`), Pendiente de confirmación (texto secundario), Expirado (`danger`) y **Desfasado** (`warning`, ámbar: fondo `advertenciaSuave` y borde `advertencia`). Un cobro Desfasado no ofrece confirmar y sí "Generar cobro nuevo".
- Inventario: cada fila muestra la línea `Categoría · Marca` (omite lo que falte), el precio de venta y, **solo para ADMIN**, `Compra: $X` (o `Compra: pendiente`). Los demás roles no ven el precio de compra.
- Columna de acciones al final.
- Stock por debajo del mínimo se marca en `danger`.
- Paginación cuando haya volumen.
- Hover de fila con un cambio de fondo suave ([sección 6.4](#64-movimiento-y-transiciones)).

### 8.3 Formularios

- Etiquetas claras, validación visible, mensajes de error en español.
- Botón principal a la derecha, secundario a su izquierda.
- Confirmación antes de operaciones destructivas.

### 8.4 Estados de la interfaz

| Estado | Comportamiento |
|---|---|
| Vacío | Mensaje útil y acción sugerida, sin ilustraciones genéricas. |
| Cargando | Indicador de progreso discreto. |
| Error | Mensaje claro en español, sin trazas internas. |
| Éxito | Confirmación breve (snackbar). |

### 8.5 Confirmaciones obligatorias

Antes de ejecutar cualquiera de las siguientes acciones, el sistema **DEBE** mostrar un diálogo de confirmación (con las palabras **"Confirmar"** y **"Cancelar"**) y esperar la decisión del usuario:

- Cerrar sesión.
- Cancelar una cita.
- Cancelar, anular o marcar como entregada una orden de servicio.
- Eliminar o desactivar cualquier registro (clientes, vehículos, usuarios, refacciones).
- Registrar un pago de forma definitiva.
- Salir de un formulario con cambios sin guardar (por ejemplo, al pulsar "atrás" o cerrar la ventana).
- Cualquier otra operación que el equipo considere destructiva o irreversible.

El diálogo debe ser breve, claro y en español. Texto sugerido:

> "¿Seguro que quieres [acción]? Esta acción no se puede deshacer." *(cuando aplique)*

### 8.6 Tarjetas

Usar `Card` solo para agrupar contenido que lo necesite (indicadores del dashboard, resúmenes). **Por defecto, no usar tarjetas:** preferir tablas, listas y divisores.

### 8.7 Avisos internos y «Clientes por avisar» (Sprint 6)

**Campana.** `IconButton` con `Icons.notifications_outlined` y el `Badge` de
Material con el número de avisos no leídos, en el encabezado (`AppBar`) del
`AppShell`. El contador se oculta en 0 y muestra «99+» como máximo. Abre el panel
de avisos. Sin dependencias nuevas: es el `Badge` de Material 3.

**Panel de avisos.** `endDrawer` del `Scaffold` con el encabezado «Avisos» y una
lista con desplazamiento, **sin tarjetas**: filas con divisores y un subtítulo
por grupo (mayúscula pequeña y contador). Orden y color de los grupos:

| Grupo | Color | Ícono |
|---|---|---|
| Mantenimientos vencidos | `danger` | `Icons.build_circle_outlined` |
| Órdenes detenidas | `warning` | `Icons.assignment_late_outlined` |
| Stock bajo o agotado | `warning` si bajo, `danger` si agotado | `Icons.inventory_2_outlined` |
| Mantenimientos próximos | `warning` | `Icons.build_circle_outlined` |
| Citas de hoy | `textSecondary` | `Icons.event_available_outlined` |

Solo se usan `warning`, `success` y `danger` para estados (sección 5). Un aviso
**no leído** va en peso 600 con un punto de color; uno **leído** va atenuado en
`textSecondary` y ya no muestra el botón. La acción «Marcar como leído» es un
`Icons.done` con tooltip; tocar la fila abre el destino (orden, historial del
vehículo, Inventario o Citas) y lo marca como leído.

Estados (8.4): **cargando**, indicador de progreso discreto que no bloquea la
campana; **vacío**, «No tienes avisos pendientes.»; **error**, «No se pudieron
cargar los avisos.» en `danger` con el botón «Reintentar», sin trazas.

**Pantalla «Clientes por avisar».** Sección del menú lateral (`Icons.phone_in_talk_outlined`),
visible solo para ADMIN y RECEPTIONIST. Lista densa con divisores (sin tarjetas):
nombre del cliente en peso 600, teléfono con `Icons.phone_outlined`, vehículo
(«PLACAS · Marca Modelo») en `textSecondary` y el motivo; a la derecha el botón
`OutlinedButton` «Marcar como avisado». El botón abre un diálogo (8.5) con los
datos del cliente, un campo «Nota (opcional)» de 255 caracteres como máximo con
contador, y los botones «Cancelar» y «Confirmar». Al confirmar se muestra el
snackbar de éxito «Cliente marcado como avisado.» y la fila sale de la lista.
Estados: cargando, vacío («No hay clientes por avisar.») y error («No se pudo
cargar la lista de clientes por avisar.» con «Reintentar»).

### 8.8 Configuración, catálogo de servicios y «Próximo servicio» (Sprint 7, bloque P1)

**Configuración.** Sección del menú lateral (`Icons.settings_outlined`), visible solo
para ADMIN. Una sola pantalla con **secciones separadas por título y divisor, sin
tarjetas** (8.6), cada una con su propio botón «Guardar» a la derecha y su propio
mensaje de éxito en snackbar (8.4):

- **Datos del taller**: «Nombre del taller», «Dirección» y «Teléfono» con contador
  de caracteres (100, 150 y 30). El nombre es obligatorio («El nombre del taller es
  obligatorio.»). Texto de ayuda: «Aparecen en el encabezado de los tickets nuevos.
  Los tickets ya emitidos no cambian.». Éxito: «Datos del taller guardados.».
- **Operación**: «Mantenimiento próximo: días de margen», «…kilómetros de margen» y
  «Orden detenida: días sin cambio de estado», con el rango válido como texto de
  ayuda («Entre 1 y 365 días.») y la validación «Debe ser un número entero entre X y
  Y.». Éxito: «Ajustes de operación guardados.».

Estados: **cargando**, indicador discreto; **error**, «No se pudo cargar la
configuración.» en `error` con «Reintentar»; **sin permiso**, «No tiene permisos
para ver la configuración.» sin botón de reintento. Un error del servidor al guardar
se muestra en español en un snackbar `error`, sin trazas, y conserva lo escrito.

**Catálogo de servicios.** Sección del menú (`Icons.list_alt_outlined`), solo ADMIN.
Lista densa con divisores: nombre en peso 600, intervalo en `textSecondary`
(«180 días · 5,000 km», «90 días» o «10,000 km»), la etiqueta «Activo» (`success`) o
«Inactivo» (`textSecondary`) y los botones de ícono «Editar» (`Icons.edit_outlined`) y
«Desactivar» / «Reactivar». **No hay botón de borrar**: un tipo usado nunca se
elimina. «Nuevo tipo» y «Editar» abren un diálogo con «Nombre», «Intervalo en días» e
«Intervalo en kilómetros» (solo dígitos) y los botones «Cancelar» y «Guardar»; sin
ningún intervalo se muestra «Indique al menos un intervalo: días, kilómetros o
ambos.» y un error del servidor (p. ej. nombre repetido) aparece dentro del diálogo.
**Desactivar** exige confirmación con «Cancelar» y «Confirmar» (8.5); reactivar no.
Estados: cargando, vacío («No hay tipos de servicio registrados.») y error («No se
pudo cargar el catálogo de servicios.» con «Reintentar»).

**Agregar servicio a una orden.** En «Servicios y mano de obra» del detalle de la
orden, el botón de texto «Agregar servicio» (`Icons.add`) aparece mientras la orden
no esté cerrada. Abre un diálogo con «Descripción del servicio», «Importe ($)» y el
selector opcional «Tipo de servicio (opcional)» (solo tipos activos; «Sin tipo» por
omisión) y los botones «Cancelar» y «Agregar». La línea muestra «Servicio · Nombre
del tipo» en su subtítulo cuando tiene tipo.

**Propuesta de mantenimiento.** En el formulario de Mantenimientos, el
`OutlinedButton` «Proponer desde una orden» (`Icons.auto_fix_high_outlined`) se
habilita al elegir un vehículo, lista las órdenes de ese vehículo en un diálogo
(«Orden #N · Estado» con el motivo debajo) y rellena la fecha objetivo y el
kilometraje, que se pueden corregir antes de guardar. Mensajes: éxito «Se
propusieron la fecha y el kilometraje; puede corregirlos antes de guardar.»; sin
propuesta, «La orden no tiene servicios con tipo e intervalo; capture los umbrales
manualmente.»; vehículo sin órdenes, «Este vehículo no tiene órdenes.».

**Ticket: «Próximo servicio».** Fila adicional en el bloque de cliente y vehículo
(`_fila`, mismo estilo que «Fecha») con el texto «2027-05-22 o 83,000 km» (solo la
fecha o solo los kilómetros si el tipo tiene un único intervalo). **No se muestra**
cuando el ticket no la trae (tickets anteriores al Sprint 7 o sin servicios con
tipo). La versión imprimible agrega la misma fila a la tabla de cliente y vehículo.

---

## 9. Qué evitar (señales de "hecho por IA")

- Degradados morados, azul-morado o cian sobre fondo oscuro.
- Glassmorphism, brillos neón y texto con degradado.
- Todo dentro de tarjetas y tarjetas dentro de tarjetas.
- Filas de tarjetas idénticas con ícono + título + texto repetidas.
- Esquinas muy redondeadas y sombras difusas grandes.
- Emojis como íconos.
- Mezclar varios sets de íconos o usar íconos decorativos sin función.
- Más de 4 tamaños de letra o más de un color de acento.
- Gráficas diminutas que no aportan información.
- Textos genéricos de marketing ("potencia", "optimiza", "soluciones inteligentes").
- Fuente por defecto sin decisión explícita.
- Animaciones vistosas, rebotes o efectos que distraigan del contenido.
- Cambios de estado bruscos (sin transición) en botones, filas o menús.

---

## 10. Accesibilidad y escritorio

- Contraste adecuado entre texto y fondo.
- Áreas de clic suficientes y foco visible con teclado.
- `Tooltip` en botones que solo tienen ícono.
- Scrollbars visibles y texto seleccionable donde tenga sentido.
- Atajos y menús contextuales solo si aportan valor real.
- Las animaciones y transiciones **DEBEN** respetar la preferencia del sistema de reducir movimiento cuando sea posible.

---

## 11. Criterios de "terminado" para UI

Una pantalla se considera terminada cuando:

- [ ] Usa únicamente tokens de este documento.
- [ ] Respeta la lista de "qué evitar".
- [ ] Funciona con el sidebar expandido y colapsado.
- [ ] Muestra estados vacío, cargando y error.
- [ ] Tiene transiciones suaves en cambios de estado, navegación y aparición de elementos.
- [ ] Pide confirmación en todas las acciones listadas en [8.5](#85-confirmaciones-obligatorias).
- [ ] Es consistente con el resto de la aplicación.
- [ ] Se verificó visualmente en escritorio y en una ventana angosta.

---

## 12. Decisiones pendientes

- [ ] Librería complementaria de componentes (`shadcn_ui` u otra, o ninguna).
- [ ] Set de íconos definitivo.
- [ ] Si habrá modo oscuro después del MVP (por ahora, solo tema claro).
- [ ] Logotipo e identidad de Motorix.
- [ ] Tipos exactos de gráficas del dashboard (dona, barras, línea) y qué indicadores se muestran en cada sprint.
- [ ] Si los indicadores numéricos del dashboard animan el contador al aparecer.

> OpenCode puede proponer opciones para estas decisiones, pero **no debe asumir una solución irreversible**.