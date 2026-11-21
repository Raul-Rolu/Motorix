# Implementation Plan: Categoría, marca, precio de compra y cobro consistente

**Branch**: `006-complemento-precios-compra` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-complemento-precios-compra/spec.md`

## Summary

Completar la brecha del Sprint 5 que la spec 005 no cubrió: la refacción gana `category` (lista fija), `brand` (texto libre opcional) y `purchase_price` (dato financiero exclusivo de ADMIN); los precios y los totales se validan con límites y se calculan en centavos enteros; un cobro de Mercado Pago `PENDING` cuyo importe deja de coincidir con el saldo pendiente de la orden (total menos pagos confirmados) pasa al nuevo estado `STALE` (no confirmable, no cuenta como pago vigente), lo que habilita generar un cobro nuevo; los seeds 004, 005 y 008 quedan idempotentes (cierra el hallazgo H-14); y la documentación obsoleta se actualiza. Enfoque: una única migración aditiva `017_...sql`, validación y filtrado por rol en backend, cálculo en centavos en la capa de servicios, detección perezosa del desfase (misma técnica ya usada para la caducidad de 24 h) y UI conforme a `docs/design-system.md`.

## Technical Context

**Language/Version**: JavaScript (ES Modules, `"type": "module"`) con Node.js LTS en el backend; Dart/Flutter 3.47 en el cliente.

**Primary Dependencies**: Express, `mysql2`, `zod` (validadores), JWT + `bcryptjs`; Flutter con Material 3, `provider`, `google_fonts`, `data_table_2`, `lucide_icons_flutter`. Sin dependencias nuevas.

**Storage**: MySQL local (InnoDB, `utf8mb4`, llaves foráneas). Migración aditiva `017_part_purchase_price_stale.sql` (no se editan 001–016). Importes `DECIMAL(10,2)`.

**Testing**: Jest + supertest en `server/tests/` (unit/contract/integration) contra la base `motorix_test`; `flutter test` en `client/test/`. Sin cambios de herramienta.

**Target Platform**: Servidor local (Windows) + cliente de escritorio (prioridad del MVP).

**Project Type**: Aplicación web/mobile con API REST (frontend Flutter + backend Express).

**Performance Goals**: Sin metas nuevas; la detección de desfase es perezosa (al consultar/confirmar), como la expiración existente, sin cron.

**Constraints**: Permisos solo en backend (RN-15); sin secretos en el repo; español en docs, comentarios y pruebas; pantallas según `docs/design-system.md`; seeds idempotentes; precios ≤ 999,999.99 y total de orden ≤ 99,999,999.99; cálculo en centavos enteros.

**Scale/Scope**: Base de datos local de demostración (decenas de refacciones, órdenes y pagos); ~8 CAs, 1 migración, 3 seeds, ~5 suites backend nuevas, ~2 suites Flutter nuevas, 4 documentos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (docs/reglas.md / .specify/memory/constitution.md) | Estado | Evidencia en este plan |
|---|---|---|
| I. Alcance y fuente de verdad | ✅ | Solo la diferencia de la spec 006; nada de lo cubierto por la 005 se rehace; docs se actualizan al cierre |
| II. Responsabilidades separadas | ✅ | Lógica en `server/services`, acceso en `server/models`, validación en `server/validators`, UI en `client/lib/screens`; Mercado Pago aislado en `payment-gateway.js` (sin cambios de contrato) |
| III. Stack y base local | ✅ | ES Modules, MySQL local, migración aditiva numerada `017_...sql`, seeds con `ON DUPLICATE KEY UPDATE`, sin dependencias nuevas |
| IV. Seguridad | ✅ | `purchasePrice` filtrado por rol en backend con prueba por rol; escrituras de categoría/marca/precio de compra ya protegidas por `requireRole('ADMIN')`; sin secretos nuevos ni datos de tarjeta |
| V. Integridad de reglas de negocio | ✅ | RN-13 (todo pago con su orden) intacto; pagos inmutables (STALE es transición de estado, no edición de importe); RN-8 sin cambios |
| VI. API consistente | ✅ | Sin rutas nuevas; mismos envoltorios `ok/created/error`; nuevos códigos de negocio documentados en `contracts/api-rest.md` |
| VII. Pruebas | ✅ | Pruebas por CA contra `motorix_test` + `flutter test`; suites previas en verde |
| VIII. UX/UI profesional | ✅ | Chip `Desfasado` con tokens de color existentes; columnas de categoría y marca en el listado de inventario según `docs/design-system.md` (8.2) |
| Flujo de desarrollo / idioma | ✅ | Plan y artefactos en español; ramas `NNN-<nombre>` ya existentes |

**Resultado**: sin violaciones; `Complexity Tracking` queda vacío. Re-chequeo post-diseño (Fase 1): sin cambios.

## Project Structure

### Documentation (this feature)

```text
specs/006-complemento-precios-compra/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas D1–D10
├── data-model.md        # Fase 1: cambios de esquema, entidades y transiciones
├── quickstart.md        # Fase 1: guía de validación de extremo a extremo
├── contracts/
│   └── api-rest.md      # Fase 1: ajustes de contrato REST (sin rutas nuevas)
├── checklists/
│   └── requirements.md  # Checklist de calidad (de /speckit.specify)
└── tasks.md             # Fase 2: /speckit.tasks (NO creado por este comando)
```

### Source Code (repository root)

```text
database/
├── migrations/
│   └── 017_part_purchase_price_stale.sql   # category, brand, purchase_price + CHECK de límites (parts) y ENUM STALE (payments); no toca líneas de orden
├── seeds/
│   ├── 004_demo_service_orders.sql         # IDs fijos en order_services, order_labor y order_entries (idempotencia, H-14)
│   ├── 005_demo_parts.sql                  # category, brand, purchase_price en refacciones
│   └── 008_demo_part_prices.sql            # categorías, marcas y precios de compra de ejemplo
└── scripts/
    ├── apply-migrations.mjs                # sin cambios (detecta 017 automáticamente)
    └── apply-seeds.mjs                     # sin cambios

server/
├── validators/
│   ├── part-validator.js                   # category (lista fija), brand ≤50, purchasePrice y límites
│   ├── order-validator.js                  # límite de importe por partida
│   └── payment-validator.js                # sin cambios estructurales
├── utils/
│   ├── errors.js                           # nuevo código: ORDER_TOTAL_LIMIT_EXCEEDED
│   └── money.js                            # NUEVO: aCentavos()/deCentavos() y topes (999,999.99 / 99,999,999.99)
├── models/
│   ├── part.js                             # columnas nuevas en aObjeto/create/update; opción sin purchasePrice
│   ├── payment.js                          # transición PENDING → STALE; marcado perezoso del desfase
│   └── order.js                            # totales y líneas en centavos enteros
├── services/
│   ├── part-service.js                     # filtrado de purchasePrice por rol; validación de catálogo
│   ├── order-service.js                    # topes de total en centavos
│   └── payment-service.js                  # flujo STALE al listar/crear/verificar cobro
└── tests/
    ├── unit/money-cents.test.js            # NUEVO (CA-5)
    ├── contract/parts-role-visibility.test.js  # NUEVO (CA-3, CA-4)
    └── integration/
        ├── parts-purchase-price.test.js    # NUEVO (CA-1, CA-2)
        ├── parts-price-limits.test.js      # NUEVO (CA-2 límites de precio y total)
        ├── payments-stale.test.js          # NUEVO (CA-6)
        └── payments-compat.test.js         # NUEVO (CA-7)

client/
├── lib/
│   ├── models/part.dart                    # category, brand, purchasePrice (solo ADMIN)
│   ├── models/payment.dart                 # nombre/estado STALE → "Desfasado"
│   ├── screens/parts_screen.dart           # columnas fijas de categoría y marca
│   ├── screens/part_form_screen.dart       # selector de categoría, marca y precio de compra (ADMIN)
│   └── screens/… (detalle de orden/pago)   # chip "Desfasado" con tokens del tema
└── test/
    ├── parts_category_brand_test.dart      # NUEVO (CA-1, CA-9 de UI)
    └── stale_payment_chip_test.dart        # NUEVO (CA-6 de UI)

docs/
├── project-context.md                      # estados de pago con STALE; entidad Part completa; totales en centavos
└── design-system.md                        # chip de estado "Desfasado" y columnas del inventario
```

**Structure Decision**: se conserva la estructura existente del repositorio (opción "Mobile + API": `server/` por capas + `client/` Flutter). No se crean carpetas ni dependencias nuevas; `server/utils/money.js` es el único archivo nuevo fuera de pruebas.

## Plan de fases

### Fase 0 → `research.md`

Resuelve las 10 decisiones técnicas (D1–D10), incluidas todas las NEEDS CLARIFICATION del contexto técnico (ninguna: el stack es heredado). Cubre los 9 puntos pedidos:

1. Migración 017 (columnas y `CHECK` de límites en `parts`, `ENUM STALE` en `payments`; sin tocar líneas de orden) → D1, D2.
2. Lista fija de categorías con valores concretos → D3.
3. Filtrado de `purchasePrice` por rol en API con validación en backend → D4.
4. Centavos enteros y límites 999,999.99 / 99,999,999.99 → D5.
5. Flujo de detección de `STALE` al consultar o confirmar y generación de un cobro nuevo → D6.
6. Chip `STALE` y columnas de categoría/marca en el cliente → D7.
7. Idempotencia de seeds 004, 005 y 008 → D8.
8. Pruebas por criterio de aceptación → D9.
9. Documentos a actualizar → D10.

### Fase 1 → `data-model.md`, `contracts/api-rest.md`, `quickstart.md`

- `data-model.md`: alteraciones de `parts` y `payments`, e idempotencia por IDs fijos en `order_services`, `order_labor` y `order_entries` (sin cambio de esquema); catálogo de categorías; máquina de estados de pagos con `STALE`; reglas de validación y topes.
- `contracts/api-rest.md`: campos nuevos y visibles por rol, estados del pago, códigos de error nuevos/nuevas condiciones, sin rutas nuevas.
- `quickstart.md`: escenarios E1–E9 (más E6b) ejecutables que prueban los CA de extremo a extremo (incluidas la doble corrida de seeds y el cobro correcto tras un pago parcial sin marcarse `STALE`).

**Nota**: `tasks.md` lo genera `/speckit.tasks`; este comando no lo crea.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *Sin violaciones de constitución* | — | — |

## Riesgos y mitigaciones (no son violaciones)

- **Dos líneas idénticas pueden coexistir** (misma orden, descripción e importe): la idempotencia del seed 004 (H-14) se logra con IDs fijos en `order_services`, `order_labor` y `order_entries`, sin llaves únicas, sin borrado y sin error `ORDER_LINE_DUPLICATE`; se acepta como decisión vigente (D2/D8).
- **Bases locales ya contaminadas por el H-14**: la migración 017 no limpia ni borra duplicados; las duplicaciones previas se conservan (a criterio del taller) y el seed corregido no agrega nuevas (D1/D2).
- **La regla de `STALE` compara contra el saldo pendiente** (total menos pagos `COMPLETED`), no contra el total a secas, para no marcar como desfasado un cobro correcto tras un pago parcial (D6).
- **`order_entries` también duplica al re-ejecutar el seed 004** (mismo defecto que H-14, no reportado): se corrige con IDs fijos en el seed, sin tocar la tabla de historial inmutable (D8).
