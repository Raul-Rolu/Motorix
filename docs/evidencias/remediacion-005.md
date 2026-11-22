# Remediación del análisis pre-implementación — 005-precio-venta-refacciones

Fecha: 2026-10-18
Estado: **aplicada** (ediciones aprobadas por el usuario; `docs/evidencias/analisis-005.md` no se modifica)

Este documento registra la remediación de los hallazgos del análisis pre-implementación (`docs/evidencias/analisis-005.md`) de la feature `specs/005-precio-venta-refacciones`.

## Tabla hallazgo → archivos cambiados → resolución

| Hallazgo | Sev. | Archivos cambiados | Resolución |
|----------|------|--------------------|------------|
| **INC-01** — Las órdenes ya liquidadas con usos sin precio quedarían bloqueadas de por vida del ticket (la adopción D4 no las alcanza y recalcularlas está fuera de alcance) | HIGH | `specs/005-precio-venta-refacciones/spec.md`; `specs/005-precio-venta-refacciones/contracts/api-rest.md`; `specs/005-precio-venta-refacciones/research.md` (D8); `specs/005-precio-venta-refacciones/data-model.md`; `specs/005-precio-venta-refacciones/tasks.md` (T025, T029, T030) | El bloqueo de cobro/ticket por total incompleto se acota a órdenes **no liquidadas**. La orden ya liquidada conserva su total histórico y emite su ticket con las líneas sin precio marcadas como "sin precio" (nuevos **FR-016** y **CA-21** en el spec; `TOTAL_INCOMPLETO` acotado en el contrato; D8 y tabla de estados actualizados; tareas T025/T029/T030 cubren el nuevo comportamiento). Decisión registrada en el spec (Clarifications, "Sesión posterior al análisis"). |
| **INC-03** — El stock del seed 008 se calculaba relativamente (`stock ajustado`), por lo que no era idempotente ante reejecución | HIGH | `specs/005-precio-venta-refacciones/tasks.md` (T002); `specs/005-precio-venta-refacciones/data-model.md` | El seed 008 fija el `stock` de las refacciones afectadas en **valores absolutos** que satisfagan `stock = IN + OUT + ajustes` (≥ 0), sin depender del stock previo; reejecutarlo deja la base en el mismo estado. |
| **AMB-01** — El predicado de adopción (pagos < total) era circular si el total se calculaba con los usos que van a adoptarse | MEDIUM | `specs/005-precio-venta-refacciones/spec.md` (Clarifications); `specs/005-precio-venta-refacciones/research.md` (D4); `specs/005-precio-venta-refacciones/data-model.md` (SQL de adopción) | La condición de "no liquidada" se evalúa contra el **total previo a la adopción** (calculado sin los usos que van a adoptarse); así una orden ya pagada nunca adopta y no hay circularidad. Además se aclara que la adopción solo ajusta el saldo pendiente y nunca deja liquidada a una orden, porque el precio adoptado no reduce el total. Decisión registrada en el spec (Clarifications, "Sesión posterior al análisis"). |
| **INC-02** — El filtro de pendientes de precio incluía también refacciones inactivas, sin decirlo en el spec | MEDIUM | `specs/005-precio-venta-refacciones/spec.md` (FR-003, CA-17); `specs/005-precio-venta-refacciones/contracts/api-rest.md` (parts) | El filtro `?pending-price=true` queda explícitamente limitado a refacciones **activas** (`is_active = 1`) con `salePrice` nulo. |
| **COV-01** — Faltaba actualizar `server/tests/contract/orders-detail.contract.test.js`, cuya respuesta del detalle cambia (nuevos `refacciones` y `totalCompleto`) | MEDIUM | `specs/005-precio-venta-refacciones/tasks.md` (T017) | T017 ahora incluye actualizar ese contrato de detalle y citar CA-5 (el cambio de precio eleva el importe al agregar la refacción a una orden nueva). |

## Alineaciones adicionales (ajustes solicitados junto con la remediación)

- `specs/005-precio-venta-refacciones/spec.md`:
  - **CA-9**, **CA-10**, **SC-003**, el escenario 4 de la US3, el caso límite del cobro/ticket y el Supuesto de bloqueo quedan redactados con la misma regla (bloqueo solo en órdenes **no liquidadas**), de modo que no contradicen a FR-016/CA-21.
  - **FR-009** también se acota a órdenes no liquidadas por coherencia con FR-010.
  - Nuevo caso límite: orden ya liquidada con usos sin precio → no adopta precio, total intacto, ticket con líneas marcadas "sin precio", sin pagos adicionales.
  - Nueva subsección en Clarifications: **"Sesión posterior al análisis (2026-10-18)"** con las decisiones de INC-01 y AMB-01.
- `specs/005-precio-venta-refacciones/research.md` (D4): se redacta que "la adopción solo ajusta el saldo pendiente y nunca deja liquidada a una orden, porque el precio adoptado no reduce el total" (en lugar de insinuar que podría liquidarla).
- `specs/005-precio-venta-refacciones/tasks.md`: **T030** también pide mostrar las líneas con `sinPrecio` como "sin precio" en `ticket_screen.dart`; nota de trazabilidad sobre la numeración de FR-016/CA-21.

## Archivos no modificados

- `docs/evidencias/analisis-005.md` — se conserva tal cual, como informe original del análisis.
- No se ejecutó ningún comando de git ni se hizo ningún commit.

## Estado

Todos los hallazgos de esta tabla quedan **resueltos**. Los hallazgos LOW del análisis (AMT-01, AMT-02, COV-02, TST-01) no requieren cambios de especificación y se atienden en la implementación.
