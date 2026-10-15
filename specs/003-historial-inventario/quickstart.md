# Guía de validación rápida: Historial, mantenimiento e inventario

**Fecha**: 2026-10-11 | **Feature**: `003-historial-inventario` | **Plan**: [plan.md](./plan.md)

Guía de recorrido extremo a extremo para verificar el Sprint 3. No incluye implementación: solo preparación, comandos y resultados esperados (contratos en [contracts/api-rest.md](./contracts/api-rest.md), modelo en [data-model.md](./data-model.md)).

## Previos

1. **MySQL local activo** (servicio `MySQL96`, puerto 3306) y `server/.env` copiado desde `server/.env.example` con las credenciales locales.
2. **Migraciones y semillas** (idempotentes; se pueden ejecutar sobre base vacía o poblada):

   ```powershell
   node database/scripts/apply-migrations.mjs
   node database/scripts/apply-seeds.mjs
   ```

   Resultado esperado: migraciones 010–013 aplicadas y seeds 005–006 registrados sin duplicados.
3. **Pruebas automatizadas** (CA-8):

   ```powershell
   cd server; npm.cmd test      # Jest contra motorix_test: unit + integration + contract
   cd client; & "C:\Users\rulam\Downloads\SDK Flutter\flutter\bin\flutter.bat" test
   ```

   Resultado esperado: suites en verde; ninguna deja stock negativo (CA-6).
4. **Backend y cliente en ejecución**:

   ```powershell
   cd server; npm.cmd start     # API en http://localhost:3000
   cd client; & "C:\Users\rulam\Downloads\SDK Flutter\flutter\bin\flutter.bat" run
   ```

5. **Cuentas de los seeds**: `admin`, `recepcion`, `mecanico` (Sprint 1).

## Escenarios de recorrido

### V1 — Historial del vehículo (US1, CA-1)

1. Iniciar sesión como `mecanico`, abrir **Vehículos** y entrar al historial de un vehículo con órdenes terminadas (seed 004).
2. **Esperado**: lista en orden cronológico con fecha, kilometraje, motivo y resumen de cada servicio; solo estados terminado/entregado; vehículo nuevo sin órdenes muestra mensaje vacío sin error (SC-001, SC-002).

### V2 — Kilometraje en cada servicio (US2, RN-3)

1. En el historial, comparar el kilometraje mostrado con el de la orden original; intentar crear una orden con kilometraje menor al último sin marcar corrección.
2. **Esperado**: el historial refleja el kilometraje registrado en su momento; la orden con kilometraje menor se rechaza salvo corrección explícita.

### V3 — Registro de mantenimiento (US3, CA-2, RN-11/RN-12)

1. Como `mecanico`, registrar un mantenimiento con motivo, fecha objetivo y kilometraje objetivo (y otro con solo un umbral).
2. **Esperado**: ambos quedan `PENDING`; el registro sin ningún umbral se rechaza con `MAINTENANCE_INVALID_THRESHOLD` (422).

### V4 — Lista de vencidos y próximos (US4, SC-003)

1. Como `recepcion`, abrir **Mantenimientos**.
2. **Esperado**: vencidos primero (rojo) y después pendientes por umbral más cercano (advertencia), con datos de cliente y vehículo; sin ventana de tiempo fija; cancelados no aparecen.

### V5 — Registro y consulta de refacciones (US5, CA-4)

1. Como `admin`, abrir **Inventario**, registrar una refacción (nombre, código, stock inicial, stock mínimo) y repetir con el mismo código.
2. **Esperado**: la refacción aparece en el listado; el código duplicado se rechaza con `PART_DUPLICATE` (409); un rol sin permiso recibe `FORBIDDEN` (403) validado en servidor (RN-15).

### V6 — Agregar refacciones a una orden (US7, CA-5, RN-6/RN-7)

1. Como `mecanico`, abrir una orden en curso propia → sección **Refacciones**, agregar una refacción con stock suficiente.
2. **Esperado**: la línea aparece en la orden, el stock baja y en Inventario (movimientos) queda una salida `OUT` con la referencia a la orden.

### V7 — Stock insuficiente rechazado (US7, CA-6, RN-8)

1. Intentar agregar la misma refacción con una cantidad mayor al stock disponible.
2. **Esperado**: rechazo con `PART_SIN_STOCK` (409) y mensaje con el stock disponible; el stock no cambia; una cantidad igual al stock exacto SÍ se permite (stock resultante 0).

### V8 — Retiro de refacción con devolución (US7, escenario 4)

1. Retirar la línea agregada en V6 desde la orden aún abierta.
2. **Esperado**: la línea desaparece, el stock vuelve al nivel anterior y queda un movimiento `IN` de devolución; la salida original permanece en el historial.

### V9 — Orden cerrada y orden ajena (US7, casos límite)

1. Intentar agregar refacciones a una orden `ENTREGADO` o `CANCELADA`, y desde otro mecánico intentarlo en una orden que no es suya.
2. **Esperado**: `ORDER_CLOSED` (409) y `FORBIDDEN_ORDER` (403) respectivamente; la orden en pausa `ESPERANDO_REFACCION` SÍ permite agregar.

### V10 — Entradas y ajustes de stock (US5/FR-013/FR-014, Q3)

1. Como `admin`, registrar una entrada (`IN`) y un ajuste con signo negativo que dejaría el stock en negativo.
2. **Esperado**: la entrada suma y queda registrada con motivo; el ajuste negativo se rechaza con `MOVEMENT_INVALID` (422) y el stock no cambia.

### V11 — Alertas de stock bajo (US8, CA-7, SC-005)

1. Como `admin`, llevar una refacción hasta su stock mínimo con salidas o ajustes y abrir Inventario.
2. **Esperado**: la refacción aparece destacada como stock bajo en la primera consulta posterior al movimiento; sin alertas cuando todo está por encima del mínimo.

### V12 — Cumplir y cancelar mantenimientos (US3/US4, aclaraciones Q1/Q4)

1. Completar un mantenimiento pendiente (cualquier rol autorizado) y, como `admin`, cancelar otro con motivo; intentar cancelarlo después como `recepcion` o completar uno ya cancelado.
2. **Esperado**: cumplimiento solo manual (entregar una orden no completa nada automáticamente); cancelación registrada con motivo y autor; acciones sobre estados no `PENDING` devuelven `MAINTENANCE_NOT_MODIFIABLE` (409).

## Criterios de cierre

- Todas las pruebas de Jest y Flutter en verde (CA-8, SC-006).
- Ningún escenario produce stock negativo ni rompe la igualdad stock = acumulado de movimientos (SC-004).
- Los recorridos V1–V12 ejecutados con backend y cliente en funcionamiento y anotados en el informe de cierre del sprint.
