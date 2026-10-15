# Plan de implementación: Pagos, Tickets y Dashboard

**Rama**: `004-pagos-tickets-dashboard` | **Fecha**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Input**: Especificación de la feature en `/specs/004-pagos-tickets-dashboard/spec.md`

## Resumen

Cierre del MVP de Motorix: registro de pagos asociados a una orden (efectivo, tarjeta, transferencia y Mercado Pago en sandbox mediante enlace de pago verificado bajo demanda), generación del ticket de servicio como vista imprimible dentro de la aplicación, y panel de control administrativo con agregados reales de órdenes, citas, mantenimientos, inventario y dinero cobrado. Se apoya en las órdenes del Sprint 2 y el inventario del Sprint 3; la información de pagos y tickets se deriva sin duplicar importes (RN-13, RN-14).

## Contexto técnico

**Lenguaje/versión**: JavaScript (ES Modules) en Node.js LTS para backend; Dart/Flutter para el frontend.

**Dependencias principales**: Express, mysql2 (driver directo, sin ORM), JWT + bcrypt (existentes); integración con Mercado Pago vía HTTP usando el `fetch` nativo de Node (sin SDK del proveedor); Flutter con Material Design 3, tema propio y Provider (existentes).

**Almacenamiento**: MySQL local InnoDB/utf8mb4; tablas nuevas `payments` y `tickets` (migraciones 014–015, inmutables); seeds idempotentes 007 con datos de ejemplo de cobros, un ticket y cifras visibles para el panel.

**Pruebas**: Jest + supertest contra `motorix_test` (unitarias de lógica de pagos/totales/folios, integración y contrato); `flutter test` en el cliente. Los cobros digitales se prueban con un simulador interno del proveedor (sin red ni credenciales); el sandbox real solo en la demostración manual.

**Plataforma objetivo**: escritorio del taller (prioridad), API REST en localhost; navegador del sistema para la impresión del ticket.

**Tipo de proyecto**: aplicación web con backend separado + cliente Flutter (estructura existente `server/`, `client/`, `database/`).

**Metas de rendimiento**: el panel y el ticket se muestran en menos de 3 s y 5 s respectivamente; la API responde como en los sprints anteriores (operaciones simples sobre una sola base local).

**Restricciones**: sin datos de tarjeta ni credenciales del proveedor en la base (RN-14); secretos solo en variables de entorno (CA-7); permisos validados en backend (RN-15); sin librerías nuevas sin justificar.

**Alcance/escala**: 4 roles existentes, ~10 pantallas nuevas o extendidas, 6 endpoints nuevos; sin reembolsos, sin facturación electrónica, sin envíos automáticos, sin analítica histórica avanzada.

## Constitution Check

*GATE: debe pasar antes de la investigación de la Fase 0. Se re-verifica tras el diseño de la Fase 1.*

| Principio | Verificación del Sprint 4 | Estado |
|-----------|--------------------------|--------|
| I. Alcance y fuente de verdad | Sprint 4 en orden (1→4); fuera de alcance respetado (sin WhatsApp, facturación electrónica, envíos automáticos ni analítica histórica; el panel son agregados simples) | PASS |
| II. Arquitectura por capas | Backend existente en capas (`config`, `models`, `services`, `controllers`, `routes`, `validators`); la integración de Mercado Pago vive aislada en su propio módulo de servicio, separada del dominio | PASS |
| III. Stack y base local | ES Modules obligatorios; mysql2 sin ORM; MySQL InnoDB/utf8mb4; migraciones 014–015 inmutables; seeds idempotentes con datos de ejemplo para que el panel nunca arranque vacío (CA-8/FR-021) | PASS |
| IV. Seguridad | Sin datos de tarjeta ni credenciales almacenadas (RN-14, FR-007); `MP_ACCESS_TOKEN` y modo del proveedor solo en variables de entorno con `.env.example` sin secretos; permisos de pagos/tickets/panel validados en servidor (RN-15) | PASS |
| V. Integridad de reglas de negocio | Todo pago ligado a una orden existente (RN-13); pagos inmutables (historial, sin edición/borrado); orden entregada conservada (RN-9); total, ticket y panel derivados, sin duplicar importes | PASS |
| VI. API consistente | Mismo envoltorio de respuestas y catálogo de errores de los sprints previos; validación de payloads y roles en el servidor | PASS |
| VII. Pruebas | Jest unitario de lógica de pagos y folios; Jest + supertest integración/contrato contra `motorix_test` con `--runInBand`; `flutter test`; simulador interno del proveedor para que la suite no dependa de red | PASS |
| VIII. UX/UI | Panel, formulario de cobro y vista del ticket siguen `docs/design-system.md` (Material 3, tokens, verde/ámbar/rojo); operaciones con confirmación y mensajes de éxito/error | PASS |

**Resultado del gate**: PASS — sin violaciones que justificar (tabla de *Complexity Tracking* vacía).

**Re-verificación tras la Fase 1** (2026-10-11): el diseño (`research.md`, `data-model.md`, `contracts/api-rest.md`, `quickstart.md`) mantiene los ocho principios en PASS: migraciones inmutables, seeds idempotentes, contenido de ticket y panel derivados sin duplicar datos, integración de Mercado Pago aislada en su módulo y sin datos de tarjeta, permisos en servidor y pruebas deterministas sin red. Sin nuevas violaciones.

## Estructura del proyecto

### Documentación de esta feature

```text
specs/004-pagos-tickets-dashboard/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/           # Fase 1 (api-rest.md)
└── tasks.md             # Fase 2 (/speckit.tasks, aún no creado)
```

### Código fuente (raíz del repositorio)

```text
server/
├── config/              # db.js (existente)
├── models/              # payment.js, ticket.js (nuevos); order.js, part.js (existentes)
├── services/            # payment-service.js, ticket-service.js, dashboard-service.js,
│                        # mercadopago-client.js + simulador (nuevos)
├── controllers/         # payment-controller.js, ticket-controller.js, dashboard-controller.js
├── routes/              # payment-routes.js, ticket-routes.js, dashboard-routes.js
├── validators/          # payment-validator.js
├── utils/               # errors.js (catálogo ampliado)
└── tests/               # unit/ integration/ contract/ (suites de pagos, tickets, dashboard)

client/lib/
├── models/              # payment.dart, ticket.dart, dashboard.dart
├── providers/           # payments.dart, ticket.dart, dashboard.dart
├── screens/             # payment_form, payments_list, ticket_view, dashboard
└── widgets/             # indicadores del panel, bloque de cobro en detalle de orden

database/
├── migrations/          # 014_create_payments.sql, 015_create_tickets.sql
└── seeds/               # 007_demo_payments_tickets.sql (idempotente)
```

**Decisión de estructura**: se conserva la estructura real existente (backend en capas sin `src/`, cliente Flutter en `client/lib`, scripts SQL numerados en `database/`), idéntica a la de los sprints 1–3.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
