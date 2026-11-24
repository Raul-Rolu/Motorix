# T112 — Verificación de la base del bloque P3 (reportes)

Fecha: 2026-11-24. Solo lectura: se revisó el código del cliente y, con una consulta a `information_schema` de `motorix_test`, los índices reales. No se tocó `motorix`.

## (a) Cómo escribe y abre archivos `ticket_print.dart`

`client/lib/services/ticket_print.dart` usa solo `dart:io` (sin dependencias nuevas):

1. Construye el contenido (HTML) con una función pura, testeable.
2. Lo escribe con `File(...)` en `Directory.systemTemp` con un nombre de archivo.
3. Lo abre con el programa predeterminado del sistema: `Process.run('cmd', ['/c', 'start', '', ruta])` en Windows, `open` en macOS y `xdg-open` en Linux.

**Para la exportación CSV (T140) se reutilizará el mismo mecanismo**, con estas diferencias a resolver en ese tramo:

- El CSV no debe quedar en la carpeta temporal: se guardará en la carpeta **Descargas** del usuario (`%USERPROFILE%\Downloads`, con la carpeta temporal solo como respaldo si no existe), con el nombre que dicta el servidor (`motorix-<reporte>-<desde>-<hasta>.csv`), y se mostrará la ruta guardada. Opcionalmente se abre con el programa predeterminado (Excel), igual que el ticket.
- El nombre de archivo se sanea antes de escribirlo (solo letras, números, guion y punto), para no confiar en la cabecera `Content-Disposition` del servidor como ruta.
- `ApiClient` hoy solo entiende JSON (`_enviar` decodifica `jsonDecode`): hará falta un método que devuelva el cuerpo como texto (UTF-8 con BOM) y que conserve el manejo de 401 y de `403 TERMS_NOT_ACCEPTED`. Es una adición al cliente HTTP, no un cambio de lo existente.

## (b) Índices que usarán los reportes (tabla real en `motorix_test`)

| Tabla | Índice | Columnas | Lo usa |
|---|---|---|---|
| `payments` | `idx_payments_status` | `(status, created_at)` | Ingresos: `status = 'COMPLETED'` y rango de `created_at` |
| `payments` | `idx_payments_order` | `(order_id, created_at)` | — |
| `service_orders` | `idx_orders_status_changed` | `(status, status_changed_at)` | Población «órdenes cerradas del periodo» (`TERMINADO` / `ENTREGADO` por rango) |
| `service_orders` | `idx_orders_mechanic` | `(mechanic_id, status)` | Productividad |
| `order_services` | `idx_order_services_order` / `idx_order_services_type` | `(order_id)` / `(service_type_id)` | Servicios por tipo |
| `order_labor` | `idx_order_labor_order` | `(order_id)` | Productividad (mano de obra) |
| `order_parts` | `idx_op_order` | `(order_id, part_id)` | Refacciones de las órdenes cerradas |
| `inventory_movements` | `idx_mov_part` | `(part_id, created_at)` | Rotación |
| `parts` | `PRIMARY`, `uq_part_code` | `(id)`, `(code)` | Unión por id |

Los cuatro índices que pedía la tarea existen: `idx_payments_status`, `idx_op_order`, `idx_mov_part` e `idx_order_labor_order`.

**Observación para T134 (no se crea nada ahora):** la rotación filtra `movement_type = 'OUT'` y un rango de `created_at` sobre todas las refacciones, y `idx_mov_part` empieza por `part_id`; no hay un índice `(movement_type, created_at)`. Con el volumen de la medición (5,000 movimientos) se espera que baste con `idx_mov_part`; si la medición de T133 supera 2 s en `rotation`, esa sería la migración `024_reports_indexes.sql` (que se aplicaría solo con autorización).

## Decisiones tomadas al implementar la base (tramo 1)

- `periodo` junto con `desde` o `hasta` se rechaza como ambiguo (el contrato dice «o»).
- Un parámetro presente pero vacío (`?desde=`) es inválido; solo la ausencia (`undefined`) cuenta como «no indicado».
- `MES_ACTUAL` y `MES_ANTERIOR` son siempre el mes **completo** (del día 1 al último), como en el ejemplo del contrato, no «hasta hoy».
- Los importes del CSV son centavos enteros con punto y dos decimales y **no** se neutralizan (un margen negativo es un número); todo texto que empiece con `=`, `+`, `-`, `@`, tabulador o retorno de carro sí.
