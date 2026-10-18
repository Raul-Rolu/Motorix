# Plan de implementación: Precio de venta de refacciones y total de la orden

**Rama**: `005-precio-venta-refacciones` | **Fecha**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Especificación de la feature desde `/specs/005-precio-venta-refacciones/spec.md`

## Resumen

Cada refacción gana un **precio de venta** (dato de su ficha) y cada **uso de refacción en una orden** conserva el precio vigente al momento de agregarse; el total de la orden —hoy calculado al vuelo solo con servicios y mano de obra— pasa a sumar también los importes de las refacciones (precio registrado × cantidad), y ese total completo alimenta al cobro y al ticket. Las refacciones existentes quedan "pendientes de precio" (detectables en el inventario) y no pueden agregarse a una orden sin precio; las órdenes de ejemplo se cargan con precios ya definidos. El cambio se apoya en una migración numerada `016` (columnas `parts.sale_price` y `order_parts.unit_price`) y en un nuevo seed `008`, sin editar migraciones ni seeds anteriores.

## Contexto técnico

**Language/Version**: JavaScript (ES Modules, `import`/`export`) con Node.js LTS en el backend; Dart/Flutter en el frontend.

**Primary Dependencies**: Express, `mysql2` (driver directo, sin ORM), JWT + bcrypt; Flutter con Material Design 3 y Provider. **Sin dependencias nuevas** (regla del usuario y de la constitución).

**Storage**: MySQL local (InnoDB, `utf8mb4`), esquema en `database/migrations/` y datos de ejemplo en `database/seeds/`, aplicados por los scripts idempotentes `database/scripts/apply-migrations.mjs` y `apply-seeds.mjs`.

**Testing**: Jest (unitarias) y Jest + supertest (integración/contrato) contra la base `motorix_test` en el backend; `flutter test` en el frontend.

**Target Platform**: Aplicación web/escritorio de taller (prioridad escritorio), backend local.

**Project Type**: Aplicación con frontend móvil/desktop + API REST (estructura `client/`, `server/`, `database/`).

**Performance Goals**: Totales y saldos calculados al vuelo como hasta ahora; sin degradación perceptible (respuestas en < 1 s en entorno local).

**Constraints**: No romper flujos de los sprints 1–4 ni modificar sus specs, migraciones ni seeds; no agregar librerías; alcance mínimo del spec (solo precio de venta, sin precio de compra ni reportes de utilidad).

**Scale/Scope**: 6 tablas afectadas o consultadas, ~8 endpoints con contrato actualizado, 3 pantallas del frontend con ajustes, datos de ejemplo existentes (5 órdenes, 6 refacciones).

## Comprobación de la constitución

*GATE: debe pasar antes de la investigación de la Fase 0. Se re-verifica después del diseño de la Fase 1.*

| Principio | Cumplimiento |
|-----------|--------------|
| I. Alcance, MVP y fuente de verdad | ✔ El cambio cierra una brecha declarada en `docs/project-context.md` (inventario con precio de venta) y en el FR-003 del spec 004; specs 1–4 intactos; trazabilidad FR → historia → implementación. |
| II. Arquitectura separada | ✔ Cambios en `server/models`, `server/services`, `server/validators`, `server/routes`, `server/controllers`; lógica de negocio (recálculo, adopción, bloqueos) en `services/`; `client/` y `database/` separados. |
| III. Stack y base de datos | ✔ ES Modules, `mysql2` sin ORM, MySQL local, migraciones numeradas inmutables en `database/migrations/` (nueva `016`, sin editar 001–015), seeds idempotentes con IDs fijos + `ON DUPLICATE KEY UPDATE`, sin dependencias nuevas. |
| IV. Seguridad | ✔ Permisos por rol validados en el servidor (precio de venta: solo ADMIN, CA-16); entradas validadas (`salePrice` no negativo); sin secretos nuevos. |
| V. Integridad de reglas de negocio | ✔ Uso de refacción = salida de inventario (comportamiento existente conservado); stock no negativo intacto; total deriva de datos registrados, sin duplicar importes; pagos siempre sobre una orden. |
| VI. API consistente | ✔ Contratos ampliados en `contracts/api-rest.md` con los mismos patrones de respuesta (`ok`/`created`/`error`) y códigos HTTP existentes; errores claros (`PART_SIN_PRECIO`, `TOTAL_INCOMPLETO`). |
| VII. Pruebas | ✔ Toda lógica nueva (recálculo con refacciones, bloqueos, adopción de precios, filtro de pendientes) cubierta con Jest + supertest contra `motorix_test` y `flutter test` para el frontend. |
| VIII. UX/UI | ✔ Ajustes en pantallas existentes siguiendo `docs/design-system.md` (tokens, estados verde/ámbar/rojo); mensajes de éxito/error en operaciones. |

**Resultado**: sin violaciones; no se requiere registro en la tabla de complejidad. Re-verificación post-diseño: también sin violaciones (los artefactos de la Fase 1 confirman separación de capas, stack y alcance mínimo).

## Estructura del proyecto

### Documentación (esta feature)

```text
specs/005-precio-venta-refacciones/
├── plan.md                  # Este archivo (salida de /speckit.plan)
├── research.md              # Salida de la Fase 0
├── data-model.md            # Salida de la Fase 1
├── quickstart.md            # Salida de la Fase 1
├── contracts/
│   └── api-rest.md          # Salida de la Fase 1 (contratos que cambian)
├── checklists/
│   └── requirements.md      # Checklist de calidad del spec
└── tasks.md                 # Salida de /speckit.tasks (no creado por /speckit.plan)
```

### Código fuente (raíz del repositorio)

```text
database/
├── migrations/
│   └── 016_add_part_prices.sql      # NUEVA (no se editan 001–015)
├── seeds/
│   └── 008_demo_part_prices.sql     # NUEVA (no se editan 001–007)
└── scripts/                          # apply-migrations.mjs / apply-seeds.mjs (sin cambios)

server/
├── models/
│   ├── part.js                       # salePrice en mapeo; filtro de pendientes; adopción
│   └── order.js                      # findTotals suma refacciones (unit_price × quantity)
├── services/
│   ├── part-service.js               # validar salePrice; adopción de precio en usos abiertos
│   ├── order-service.js              # rechazar uso sin precio; registrar unit_price congelado; total con refacciones
│   ├── payment-service.js            # total con refacciones; bloqueo por total incompleto
│   └── ticket-service.js             # desglose de refacciones con precio; bloqueo por total incompleto
├── validators/
│   └── part-validator.js             # salePrice: decimal no negativo o ausente
├── controllers/                      # ajustes mínimos de propagación
└── routes/                           # sin cambios de rutas; solo validaciones nuevas

client/
├── models/part.dart, order_part.dart # salePrice / unitPrice
├── providers/parts_provider.dart, orders_provider.dart, payments_provider.dart, ticket_provider.dart
└── screens/parts_screen.dart, part_form_screen.dart, order_detail_screen.dart,
    payment_form_screen.dart, ticket_screen.dart   # precio en ficha, desglose y avisos
```

**Decisión de estructura**: se conserva la estructura existente (frontend + backend + persistencia separados, capas del backend en `server/` sin carpeta `src/` intermedia); los archivos afectados son los listados arriba, sin crear carpetas nuevas más allá de los artefactos de esta feature.

## Registro de complejidad

Sin violaciones de la constitución que justificar.
