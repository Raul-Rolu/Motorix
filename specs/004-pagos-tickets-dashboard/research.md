# Investigación: Pagos, Tickets y Dashboard

**Fecha**: 2026-10-11 | **Feature**: `004-pagos-tickets-dashboard` | **Plan**: [plan.md](./plan.md)

Investigación y decisiones de diseño previo a la implementación del Sprint 4. Todas las decisiones del spec ya fueron resueltas con el usuario (ver [spec.md](./spec.md), sección *Clarifications*); aquí se traducen a decisiones técnicas verificables.

## D1 — Máquina de estados del pago

- **Decisión**: `payments.status` con tres estados: `PENDING` (solo cobros digitales creados), `COMPLETED` (pagos manuales al registrarse y digitales tras confirmación) y `EXPIRED` (digitales no confirmados tras 24 h). Transiciones permitidas: `PENDING → COMPLETED` y `PENDING → EXPIRED`. Ninguna otra; los pagos son inmutables en importe, método y orden (FR-006).
- **Justificación**: modela exactamente lo decidido en Q2 del clarify (caducidad automática) y evita estados intermedios sin uso en el MVP. La inmutabilidad protege la auditoría (SC-002, RN-13).
- **Alternativas consideradas**: estados `CANCELLED`/`REFUNDED` (descartados: sin reembolsos en el MVP, FR-019); recalcular el estado como propiedad derivada en cada consulta (descartado: la confirmación real del proveedor es un hecho que debe registrarse una vez, no deducirse).

## D2 — Total de la orden sin duplicar datos

- **Decisión**: el total de la orden se calcula al vuelo como suma de servicios + mano de obra + refacciones de la orden (mismo cálculo que ya usa el historial del Sprint 3); no se almacena una copia del total en `payments`. El monto de cada pago sí se almacena (es el hecho cobrado). El saldo pendiente = total calculado − suma de pagos `COMPLETED`.
- **Justificación**: cumple RN/historial derivado sin duplicación (FR-003, CA-6) y garantiza que un cambio legítimo posterior (corrección) no deje importes obsoletos.
- **Alternativas consideradas**: columna `total` materializada en la orden (descartado: duplica información y se desincroniza); trigger de base de datos (descartado: lógica invisible al equipo y difícil de probar en Jest).

## D3 — Expiración perezosa del cobro digital (sin cron

- **Decisión**: la caducidad a los 24 h se aplica de forma perezosa (lazy): al consultar los pagos de la orden, al verificar un cobro o al generar el ticket/panel, todo `PENDING` con más de 24 h pasa a `EXPIRED` en la misma operación. No hay proceso programado.
- **Justificación**: el MVP corre en un taller con la aplicación abierta por periodos cortos; un cron añadiría infraestructura sin valor demostrable. El resultado visible para el usuario es idéntico al de FR-009 y se prueba con control de reloj en las pruebas.
- **Alternativas consideradas**: tarea programada del sistema (descartada: complejidad operativa innecesaria); exponer solo la marca de tiempo y calcular "expirado" en la interfaz (descartado: dejaría estados inconsistentes entre panel, ticket y orden).

## D4 — Folio y unicidad del ticket

- **Decisión**: `tickets` guarda `order_id` (único: un ticket por orden, reutilizado al regenerar) y `folio` con formato `TCK-AAAA-NNNN` (año + secuencial), único en la tabla. El contenido del ticket NO se persiste: se deriva al consultarlo desde la orden y sus pagos (FR-011, FR-012).
- **Justificación**: el folio estable permite reimpresiones sin duplicar comprobantes (caso límite del spec) y la no persistencia del contenido evita duplicar importes; el estado de pago mostrado siempre es el más reciente.
- **Alternativas consideradas**: folio aleatorio (descartado: el taller necesita numeración ordenada para control); almacenar el comprobante como archivo (descartado: Q2 eligió vista imprimible y no requiere almacenamiento).

## D5 — Impresión del ticket en Flutter escritorio

- **Decisión**: la vista del ticket es una pantalla Flutter con formato de hoja estándar y botón "Imprimir" que genera el comprobante como documento HTML temporal y lo abre con el navegador/impresora del sistema mediante el lanzador nativo del escritorio. Sin librerías nuevas.
- **Justificación**: Q2 definió vista imprimible dentro de la app; el navegador del sistema aporta el diálogo de impresión maduro sin agregar dependencias (constitución: no agregar librerías para lo que se resuelve con pocas líneas). El HTML del ticket se construye con los mismos datos del modelo ya cargado.
- **Alternativas consideradas**: librería de generación de PDF para Dart (descartada: dependencia nueva y justificación pendiente); usar el paquete de impresión de Flutter (descartado: misma razón); exportar imagen del widget (descartado: pérdida de calidad y más código).

## D6 — Integración con Mercado Pago (sandbox) sin SDK

- **Decisión**: cliente HTTP propio contra la API del proveedor usando el `fetch` nativo de Node (sin SDK oficial): creación de preferencia de pago (monto en moneda local, referencia interna = `paymentId`) y consulta de su estado. El modo se configura por variable de entorno (`MP_MODE=sandbox|simulated`); en modo `simulado` un reemplazo interno del cliente responde sin red, con la misma interfaz (el proveedor real solo se usa en la demostración manual, decisión Q3 del clarify). Credenciales exclusivamente en `MP_ACCESS_TOKEN` (CA-7).
- **Justificación**: la integración se reduce a dos operaciones puntuales; añadir el SDK oficial es una dependencia grande que la constitución exige justificar y su superficie completa no se usa. El simulador hace la suite determinista y sin secretos (SC-008).
- **Alternativas consideradas**: SDK oficial del proveedor (descartado: dependencia grande para dos llamadas); notificaciones entrantes del proveedor (descartados por decisión Q1: verificación bajo demanda); checkout embebido (descartado por decisión Q1: enlace de pago).

## D7 — Agregados del panel sin tablas de resumen

- **Decisión**: el panel consulta agregados al vuelo (conteos y sumas) sobre las tablas existentes: órdenes por estado, citas de hoy/próximas, mantenimientos vencidos/próximos (reusando el cálculo de vencimiento del Sprint 3), stock bajo (reusando `lowStock`) y dinero cobrado del día y acumulado (sumas de pagos `COMPLETED`). Sin tablas de resumen ni copias; el refresco es manual (abrir o pulsar refrescar, decisión Q3 del clarify).
- **Justificación**: escala de un taller local (decenas de registros) sin duplicar información (CA-6, FR-015) y con cero infraestructura adicional.
- **Alternativas consideradas**: tablas materializadas con refresco (descartado: sobreingeniería para la escala); métricas en tiempo real por websocket (descartado: fuera del alcance decidido).

## D8 — Seguridad de credenciales y datos sensibles

- **Decisión**: `MP_ACCESS_TOKEN` y `MP_MODE` se agregan a `.env.example` sin valores y a `.env` local; ningún dato del proveedor se persiste: en `payments` solo vive `external_reference` (identificador de la preferencia creada), nunca tarjetas ni tokens (RN-14, FR-007). Los errores del proveedor se traducen al catálogo central sin filtrar respuestas crudas.
- **Justificación**: cumple Principio IV, CA-7 y SC-006; el historial de pagos queda apto para auditoría sin información sensible.
- **Alternativas consideradas**: almacenar la respuesta completa de la preferencia (descartada: expone datos innecesarios y aumenta la superficie de auditoría).

## Riesgos identificados

| Riesgo | Mitigación |
|--------|------------|
| El sandbox real cambia o no está disponible durante la demo | El modo simulado permite demostrar el flujo completo sin red; el sandbox es optativo y se prueba una sola vez |
| Doble registro de pago por clic repetido | Confirmación en la interfaz + unicidad de la transición de estado en el servidor (solo `PENDING → COMPLETED` una vez) |
| Reintentos del proveedor que dupliquen importes | La confirmación aplica la transición una sola vez; un cobro ya `COMPLETED` no admite segunda confirmación |
| La impresión varía según el equipo | HTML con estilos mínimos de hoja estándar, validado en la demo del sprint |
