# Quickstart de validación: Pagos, Tickets y Dashboard

**Fecha**: 2026-10-11 | **Feature**: `004-pagos-tickets-dashboard` | **Plan**: [plan.md](./plan.md)

Guía de verificación extremo a extremo del Sprint 4. Cada escenario indica el comando o la ruta manual, el resultado esperado y los artefactos de referencia: [contrato API](./contracts/api-rest.md) y [modelo de datos](./data-model.md).

## Prerrequisitos

- MySQL local corriendo; usuario `motorix_app` y credenciales en `server/.env` (incluidos `MP_ACCESS_TOKEN` y `MP_MODE`, ver [research.md D6](./research.md)).
- **Instalación limpia** para el Sprint 4 (los seeds anteriores usan IDs fijos de vehículos):

```powershell
node .\database\scripts\apply-migrations.mjs
node .\database\scripts\apply-seeds.mjs
```

- Backend: `npm.cmd start` en `server/` (esperar `http://localhost:3000/api/health`).
- Cliente: `flutter run -d windows` en `client/`.
- Cuentas seed: `admin/Admin123`, `recepcion/Recepcion123`, `mecanico/Mecanico123`.
- Datos de ejemplo del Sprint 4: la semilla `007_demo_payments_tickets.sql` crea pagos manuales, un cobro digital, un ticket y estados variados para que el panel nunca arranque vacío (FR-021).

## Escenarios de validación

| # | Escenario | Acción | Resultado esperado |
|---|-----------|--------|--------------------|
| V1 | Pago manual | Entrar como `recepcion` → detalle de una orden → registrar pago en efectivo por un importe menor al total | Pago listado como `COMPLETED`; saldos `cobrado` y `saldoPendiente` correctos (FR-001/FR-003) |
| V2 | Pago que liquida la orden | Registrar el resto del saldo | `estadoCobro` pasa a `LIQUIDADA` y la orden aparece como pagada (FR-004) |
| V3 | Pago inválido | Intentar importe 0 o mayor al saldo | Error `DATOS_INVALIDOS` (400) o `PAYMENT_EXCEEDS_BALANCE` (409) con saldo en `details` (casos límite) |
| V4 | Cobro digital (modo simulado) | Con `MP_MODE=simulated`: crear cobro digital → copiar el `enlace` → botón "verificar pago" | Pago `PENDING` con enlace; tras verificar, `COMPLETED` y la orden liquidada si cubre el total (FR-008/FR-010) |
| V5 | Caducidad del cobro | Usar el cobro digital `PENDING` antiguo de la semilla (creado hace más de 24 h) y consultar la orden | El pago aparece `EXPIRED`, no cuenta para el cobrado ni liquida la orden (FR-009, SC-007) |
| V6 | Cobro digital duplicado | Intentar crear un segundo cobro mientras haya uno vigente | Error `PAYMENT_DUPLICATE_PENDING` (409) (caso límite) |
| V7 | Ticket | Desde el detalle de la orden, generar el ticket e imprimirlo | Folio `TCK-AAAA-NNNN`; vista con taller, cliente, vehículo, servicios, refacciones, mano de obra, totales, pagos y estado de pago; el diálogo de impresión del sistema abre desde "Imprimir" (FR-011, CA-4) |
| V8 | Reimpresión estable | Reabrir el mismo ticket | Mismo folio y contenido actualizado; sin folios duplicados (FR-004 de la historia de tickets) |
| V9 | Panel | Entrar como `admin` → Panel de control → abrir/refrescar | Órdenes por estado, citas, mantenimientos, stock bajo y dinero cobrado (hoy/acumulado) con cifras reales (FR-014/FR-015) |
| V10 | Panel restringido | Entrar como `recepcion` o `mecanico` e intentar abrir el panel | Acceso denegado en el servidor (`FORBIDDEN`, 403) y opción no visible (FR-016, RN-15) |
| V11 | Mecánico sin cobros | Entrar como `mecanico` | Sin acceso a pagos ni tickets (403 en API, secciones no visibles) (FR-005/FR-013) |
| V12 | Sin datos sensibles | Revisar `payments` en la base y el repositorio | Solo método, monto, estado y `external_reference`; cero números de tarjeta; `.env` sin secretos versionados (RN-14, SC-006) |

## Pruebas automatizadas

```powershell
# Backend (desde server/): suite completa con motorix_test y --runInBand
node --experimental-vm-modules .\node_modules\jest\bin\jest.js --runInBand

# Frontend (desde client/)
flutter test
```

- Los cobros digitales se prueban con el simulador interno: la suite no requiere red ni credenciales (SC-008).
- La suite completa debe seguir en verde al 100 % (SC-008: ningún sprint anterior roto).

## Demostración manual (sandbox real)

1. Configurar `MP_MODE=sandbox` y `MP_ACCESS_TOKEN` de pruebas en `server/.env`.
2. Repetir V4 con el enlace real de Mercado Pago y confirmar el pago desde la cuenta de comprador de pruebas.
3. Volver a V4 con `MP_MODE=simulated` antes de dejar el entorno de pruebas automáticas.

## Criterios de aceptación cubiertos

| Criterio | Escenarios |
|----------|-----------|
| SC-001 | V1, V2, V3 |
| SC-002 | V1, V12 (pagos inmutables y auditables) |
| SC-003 | V7, V8 |
| SC-004 | V9, V10 |
| SC-005 | V10, V11 (permisos verificados en servidor) |
| SC-006 | V12 |
| SC-007 | V4, V5 |
| SC-008 | Pruebas automatizadas (ambas suites en verde) |
| SC-009 | V9 con la semilla 007 (panel con cifras visibles) |
