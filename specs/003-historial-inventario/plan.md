# Plan de implementación: Historial, mantenimiento e inventario

**Rama**: `003-historial-inventario` | **Fecha**: 2026-10-11 | **Spec**: [spec.md](./spec.md)

**Entrada**: Especificación de la funcionalidad desde `/specs/003-historial-inventario/spec.md`

## Resumen

El Sprint 3 convierte el registro de órdenes del Sprint 2 en seguimiento activo del vehículo y control de inventario: historial de servicios derivado de las órdenes terminadas (RN-10), programación de próximos mantenimientos con vencimiento por fecha o kilometraje (RN-11, RN-12), y módulo de refacciones con movimientos de inventario atómicos y sin stock negativo (RN-6, RN-7, RN-8). La aproximación técnica reutiliza la arquitectura ya consolidada: API Node.js (ES Modules, Express, mysql2 sin ORM) sobre MySQL local, y cliente Flutter por roles, con nuevas tablas (`maintenance_plans`, `parts`, `inventory_movements`, `order_parts`), servicios transaccionales en el servidor y validación de rol siempre en backend (RN-15).

## Contexto técnico

**Lenguaje/versión**: JavaScript (ES Modules) en Node.js 20+; Dart 3 / Flutter en el cliente

**Dependencias primarias**: Express, mysql2, bcrypt, JWT (backend existente); HTTP nativo de Dart (cliente existente); Jest + supertest (pruebas)

**Almacenamiento**: MySQL 8 local, InnoDB, utf8mb4_unicode_ci, sin ORM; migraciones SQL numeradas en `database/migrations/` (las del sprint serán 010–013) y seeds idempotentes en `database/seeds/` (005–006)

**Pruebas**: Jest + supertest contra la base `motorix_test` (unit/, integration/, contract/) y `flutter test` en `client/`

**Plataforma de destino**: Desarrollo local Windows; API en `localhost:3000`; app Flutter para escritorio/móvil según perfil de ejecución

**Tipo de proyecto**: Aplicación móvil + API (estructura existente `server/` + `client/`)

**Metas de rendimiento**: Escala de taller local (cientos de órdenes, decenas de refacciones); consultas de historial y stock deben sentirse instantáneas (<1 s p95 local), sin objetivos de carga concurrente en el MVP

**Restricciones**: Sin secretos en el repositorio (`.env` local, verificado en T057); permisos validados en servidor (RN-15); textos de interfaz en español, identificadores en inglés; pantallas según `docs/design-system.md`; ES Modules obligatorios

**Alcance/escala**: 4 tablas nuevas, ~14 endpoints nuevos, ~5 pantallas/parteles Flutter nuevos; fuera de alcance: pagos, Mercado Pago, tickets, dashboard, notificaciones externas, inventario multi-sucursal

## Verificación de la constitución

*PURGATE: Debe pasar antes de la investigación de la Fase 0. Re-verificar después del diseño de la Fase 1.*

| Principio / Regla | Estado | Evidencia en el diseño |
|-------------------|--------|------------------------|
| I. MySQL local sin ORM, esquema en `database/` | ✅ | Migraciones SQL 010–013, consultas con mysql2, sin dependencias nuevas |
| II. Usuario final en español, identificadores en inglés | ✅ | Mensajes de API y textos Flutter en español; tablas/campos/códigos en inglés (`maintenance_plans`, `PART_SIN_STOCK`) |
| III. ES Modules (`import`/`export`), `type: "module"` | ✅ | Nuevos módulos siguen el patrón ESM de services/models/controllers existentes |
| IV. Seguridad: bcrypt, JWT, sesión 30 min, sin secretos | ✅ | Se reutiliza el middleware `auth.js` existente; sin credenciales nuevas |
| V. Validación de datos y de rol en el servidor | ✅ | Validadores nuevos (`part-validator.js`, `maintenance-validator.js`) y `require-role` en cada ruta |
| VI. Roles ADMIN / RECEPTIONIST / MECHANIC | ✅ | Matriz de permisos por endpoint definida en `contracts/api-rest.md` (FR-016) |
| VII. Jest + supertest contra `motorix_test`; `flutter test` | ✅ | Suites unit/, integration/ y contract/ nuevas; limpieza ampliada en `db-test.js` |
| VIII. Pantallas según `docs/design-system.md` | ✅ | Colores de estado (advertencia/rojo) y componentes del design system en las pantallas nuevas |
| RN-8. Sin stock negativo salvo política explícita | ✅ | Política explícita (Q3 de aclaración): ninguna operación, incluido AJUSTE, puede dejar stock negativo; control atómico con `SELECT ... FOR UPDATE` |
| RN-10. Historial sin duplicar datos | ✅ | Historial derivado por consulta a `service_orders`; sin tabla de copia (research D1) |
| RN-11/RN-12. Umbrales de mantenimiento configurables | ✅ | `target_date` y/o `target_mileage` por registro; sin valores universales por defecto |
| RN-15. Validación de permisos en backend | ✅ | Ningún endpoint nuevo depende de la UI para autorizar |

**Resultado**: sin violaciones; no se requiere sección de seguimiento de complejidad.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/003-historial-inventario/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/
│   └── api-rest.md      # Fase 1
└── tasks.md             # Fase 2 (/speckit.tasks; aún no creado)
```

### Código fuente (raíz del repositorio)

```text
database/
├── migrations/
│   ├── 010_create_parts.sql             # Refacciones (nombre, código único, stock, mínimo, activa)
│   ├── 011_create_inventory_movements.sql # Movimientos IN/OUT/ADJUSTMENT con referencia a orden
│   ├── 012_create_maintenances.sql      # Mantenimientos con motivo y umbrales fecha/km
│   └── 013_create_order_parts.sql        # Refacciones usadas en una orden
└── seeds/
    ├── 005_demo_parts.sql               # Refacciones + movimientos de ejemplo (idempotente)
    └── 006_demo_maintenances.sql        # Mantenimientos de ejemplo (idempotente)

server/
├── models/
│   ├── part.js                          # CRUD de refacciones + stock
│   ├── inventory.js                     # Movimientos y stock atómico (FOR UPDATE)
│   ├── maintenance.js                   # Mantenimientos + consulta vencidos/próximos
│   └── order.js                         # Extensión: historial por vehículo y partidas de refacciones
├── services/
│   ├── part-service.js                  # Reglas de negocio de inventario (RN-6/7/8)
│   ├── maintenance-service.js           # Alta, cumplimiento manual, cancelación (solo admin)
│   ├── maintenance-state.js             # Cálculo de vencimiento (primero de los umbrales)
│   └── order-service.js                 # Extensión: agregar/retirar refacciones de una orden
├── controllers/
│   ├── part-controller.js
│   ├── maintenance-controller.js
│   └── order-controller.js              # Extensión: acciones de historial y refacciones
├── routes/
│   ├── part-routes.js
│   ├── maintenance-routes.js
│   └── order-routes.js                  # Extensión: /history y /:id/parts
├── validators/
│   ├── part-validator.js
│   └── maintenance-validator.js
├── utils/errors.js                      # Extensión: códigos nuevos del catálogo
└── tests/
    ├── unit/                            # maintenance-state, cálculo de stock, validadores
    ├── integration/                     # history, maintenances, parts, order-parts
    └── contract/                        # Contratos de respuestas nuevas

client/
└── lib/
    ├── models/
    │   ├── part.dart                    # Refacción con bandera de stock bajo
    │   ├── maintenance.dart             # Mantenimiento con estado y vencimiento derivado
    │   └── order_part.dart              # Línea de refacción usada en orden
    ├── providers/
    │   ├── parts_provider.dart
    │   └── maintenances_provider.dart
    ├── services/
    │   └── maintenance_state.dart       # Espejo Dart del cálculo de vencimiento
    ├── screens/
    │   ├── vehicle_history_screen.dart  # Historial de servicios del vehículo (US1)
    │   ├── maintenances_screen.dart     # Lista vencidos/próximos con colores (US4)
    │   ├── maintenance_form_screen.dart # Registro y acciones de mantenimiento (US3)
    │   ├── parts_screen.dart            # Inventario con alerta de stock bajo (US6/US8)
    │   ├── part_form_screen.dart        # Alta/edición de refacciones y entradas (US5/FR-013)
    │   ├── vehicles_screen.dart         # Extensión: acceso al historial desde el vehículo
    │   └── order_detail_screen.dart     # Extensión: sección de refacciones usadas (US7)
    └── widgets/app_shell.dart           # Extensión: secciones Inventario y Mantenimientos
```

**Decisión de estructura**: se mantiene la estructura ya entregada en los sprints 1 y 2 (API en `server/`, app en `client/`, esquema en `database/`); este sprint solo añade módulos siguiendo los patrones existentes de orden de capas modelo → servicio → controlador → rutas y de pantallas Flutter con provider por módulo.
