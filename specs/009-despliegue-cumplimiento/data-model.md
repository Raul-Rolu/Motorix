# Modelo de datos: Despliegue y cumplimiento

**El esquema no cambia**: no hay migraciones nuevas. Las variantes TiDB producen el mismo esquema que las originales.

## Migración

| Atributo | Regla |
|---|---|
| Nombre | `NNN_descripcion.sql`; identifica la migración en `schema_migrations` |
| Original | `database/migrations/`; no se edita |
| Variante | `database/migrations/tidb/`, mismo nombre; solo 016, 017 y 020 |
| Selección | Variante si el servidor es TiDB y existe; en otro caso, original |
| Registro | Una fila por nombre, al terminar sin error |

**Equivalencia**: misma lista de tablas, columnas (nombre, tipo, nulabilidad, valor por omisión), índices y restricciones. Las diferencias de cumplimiento de la base se reportan aparte.

## Versión de los términos (`terms_versions`)

| Campo | Regla para la versión 2 |
|---|---|
| `version` | 2, asignada explícitamente |
| `terms_text` | `database/legal/terminos-v2.txt`, entre 20 y 20,000 caracteres |
| `privacy_text` | `database/legal/aviso-privacidad-v2.txt` (integral y simplificado), mismo límite |
| `published_by` | Cuenta `admin`; nulo si no existe |

| Estado de la base | Resultado de publicar |
|---|---|
| Sin versión 2 ni posterior | Se inserta la 2 y una entrada `TERMS_PUBLISHED` en la bitácora |
| Versión 2 con el mismo texto | No hace nada |
| Versión 2 distinta, o existe una posterior sin la 2 | Se detiene sin escribir |

La publicación nunca modifica versiones ni inserta aceptaciones.

## Aceptación (`terms_acceptances`)

La crea solo la persona usuaria. Estado final de la entrega: `admin` aceptó la versión 2; `recepcion` y `mecanico`, no.

## Conjunto de demostración

Todo es ficticio: correos `@ejemplo.com`, teléfonos evidentemente inventados, placas y domicilios de ejemplo.

| Entidad | Cantidad | Clave natural para no duplicar | Variedad obligatoria |
|---|---|---|---|
| Cuentas | 3 | `username` | `admin`, `recepcion`, `mecanico` |
| Ajustes | 7 | `setting_key` | Datos del taller ficticio y operación |
| Tipos de servicio | 4 | `name` | Con intervalo en días y en km |
| Clientes | 10 | `email` | — |
| Vehículos | 12 | `plates` | Clientes con más de un vehículo |
| Refacciones | 12 | `code` | 2 bajo mínimo, 1 agotada, 1 sin precio de venta, 1 sin precio de compra, 1 inactiva |
| Órdenes | 14 | vehículo + motivo | Los 7 estados; cerradas el mes anterior y el actual; 1 detenida; asignadas a `mecanico` |
| Cobros | 12 o más | se crean con su orden | Efectivo, tarjeta, transferencia y digital simulado; completos y parciales |
| Tickets | 2 | orden | Con instantánea del taller y «Próximo servicio» |
| Citas | 10 | vehículo + motivo | Día anterior, día de referencia, día siguiente, completadas y canceladas |
| Mantenimientos | 6 | vehículo + descripción | Vencido, próximo, completado |

### Reglas de coherencia

- Cada orden se crea con líneas, mano de obra, entradas, usos de refacciones, movimientos, cobros y ticket **en una transacción**; si ya existe, no se toca.
- Cada refacción nace con su movimiento de entrada; `stock` = suma de sus movimientos, nunca negativo.
- La suma de cobros completados no excede el total de la orden.
- Todo uso de refacción lleva precio congelado, salvo el caso demostrativo sin precio.
- Folios de ticket correlativos según los existentes en el año.
- No se insertan identificadores explícitos.

### Fechas

- **Fecha de referencia** (`--fecha`, por omisión hoy; carga final 2026-11-30): rige citas y mantenimientos.
- Los hechos históricos (órdenes, cobros, movimientos) nunca quedan en el futuro: se toman respecto del menor entre ahora y la referencia.
- Repetir la carga no mueve las fechas de registros existentes.

### Avisos esperados

Mantenimiento vencido, mantenimiento próximo, cita del día, orden detenida y existencia baja; además, hechos pendientes de avisar al cliente.

### Repetición

La segunda ejecución produce los mismos conteos, no deshace cambios hechos desde el sistema y no reactiva cuentas. **Única excepción**: actualiza el hash de las tres contraseñas con las variables de esa ejecución.

## Intentos fallidos

En memoria, por origen, con ventana de 15 minutos. No se persiste.

## Página pública del aviso

Archivo generado desde `aviso-privacidad-v2.txt`; muestra «Versión 2», no ejecuta guiones y no carga recursos externos.
