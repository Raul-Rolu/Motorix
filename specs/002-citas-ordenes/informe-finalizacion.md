# Informe de finalización — Sprint 2: citas y órdenes de servicio

Fecha: 2026-10-11
Feature: `specs/002-citas-ordenes` (rama lógica `002-citas-ordenes`)

## Resumen del estado

- **60 de 63 tareas completadas** (`tasks.md`).
- **MVP (P1) entregado**: US2 (crear/listar órdenes), US3 (detalle) y US4 (asignación y
  visibilidad) implementados en backend y Flutter, más las historias US1 (citas), US5
  (diagnósticos y partidas), US6 (máquina de estados) y US7 (historial inmutable).
- **3 tareas pendientes por bloqueo de infraestructura** (servicio MySQL96 detenido y sin
  permisos de administrador para iniciarlo): T059, T060 y T062.

## Verificaciones en verde

| Verificación | Resultado |
|---|---|
| `node server/tests` unitarias (order-state, order-validator, appointment-validator) | 28/28 pruebas en verde |
| `cd client && flutter analyze` | Sin issues |
| `cd client && flutter test` | 3/3 pruebas en verde |
| Sintaxis de todo el código backend nuevo (`node --check`) | Correcta |
| Revisión de seguridad T057: sin secretos en el repositorio (`.gitignore` cubre `.env`), errores sin trazas, `password_hash` nunca en respuestas, autorización por rol y pertenencia validada en el servidor (RN-15) | Verificado |
| Revisión de idioma T058: comentarios, mensajes y pruebas en español; identificadores en inglés | Verificado |

## Lo implementado en el Sprint 2

- **Base de datos**: migraciones `005`–`009` (`appointments`, `service_orders`,
  `order_services`, `order_labor`, `order_entries`) y seeds idempotentes `003` y `004`.
- **Backend (14 + 1 endpoints nuevos)**: citas (listar, detalle, crear, editar, cambiar
  estado), órdenes (listar, mecánicos activos, detalle, crear, editar, asignar, cambiar
  estado, entradas, partidas y borrado de partidas), con máquina de estados pura en
  `server/services/order-state.js` (CA-8), catálogo de errores ampliado (T010) y
  kilometraje previo por vehículo con corrección explícita (RN-4).
- **Frontend Flutter**: modelos `appointment.dart` y `service_order.dart`, providers de
  citas y órdenes, pantallas de citas (lista y formulario), órdenes (lista con filtros,
  formulario con corrección de kilometraje y detalle con acciones de estado por rol,
  totales e historial inmutable), navegación y rutas `/citas`, `/citas/nueva`, `/ordenes`
  y `/ordenes/nueva`.
- **Pruebas nuevas escritas**: unitarias (2 suites), de integración (6 suites) y de
  contrato (5 suites) para citas y órdenes.

## Pendientes (bloqueados por MySQL)

| Tarea | Motivo |
|---|---|
| T059 — re-ejecutar migraciones y seeds (V1) | Requiere servidor MySQL en ejecución |
| T060 — `npm test` completo contra `motorix_test` | Las suites de integración y contrato requieren MySQL |
| T062 — escenarios manuales V1–V8 del quickstart | Requieren servidor, base poblada y aplicación en ejecución |

## Cómo desbloquear

1. Iniciar el servicio `MySQL96` (consola elevada: `net start MySQL96`).
2. Copiar `server/.env.example` a `server/.env` con las credenciales locales (ya hecho).
3. `node database/scripts/apply-migrations.mjs` y `node database/scripts/apply-seeds.mjs`.
4. `cd server && npm test` (suites de integración y contrato) y `npm start`.
5. Levantar el cliente (`cd client && flutter run`) y recorrer V1–V8 del quickstart.
