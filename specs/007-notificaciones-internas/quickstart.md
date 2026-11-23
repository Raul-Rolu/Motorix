# Quickstart: Notificaciones internas y clientes por avisar

**Feature**: `007-notificaciones-internas` | **Fecha**: 2026-11-22 | **Plan**: [plan.md](./plan.md) | **Contrato**: [contracts/api-rest.md](./contracts/api-rest.md)

Guía de validación de extremo a extremo. No incluye código de implementación; los escenarios prueban los criterios de aceptación de [spec.md](./spec.md) sobre una base local.

## 1. Prerrequisitos

- MySQL local con usuario dedicado (no `root`) y `server/.env` configurado (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=motorix`; ver `server/.env.example`).
- Dependencias del backend instaladas (`npm install` en `server/`) y de Flutter (`flutter pub get` en `client/`).
- El backend usa `MP_MODE=simulated` por defecto (no interviene en esta feature).

## 2. Puesta en marcha

> **Orden obligatorio: migraciones → seeds → servidor.** El servidor nuevo escribe `status_changed_at` en cada cambio de estado de una orden: si arranca antes de aplicar la migración 018, todo cambio de estado de órdenes falla (columna inexistente). Los seeds ajustados (004) y el nuevo (009) también necesitan la columna: si se corren antes de la migración, `apply-seeds` se detiene en el seed 004 y no aplica los siguientes.

```powershell
# 1. Aplicar migraciones (incluye la nueva 018)
node database/scripts/apply-migrations.mjs

# 2. Cargar datos de ejemplo (incluye el ajuste del seed 004 y el nuevo 009)
node database/scripts/apply-seeds.mjs

# 3. Backend (en otra terminal)
cd server; npm start

# 4. Cliente
cd client; flutter run
```

Cuentas de los seeds: `admin / Admin123`, `recepcion / Recepcion123`, `mecanico / Mecanico123`.

## 3. Comandos de prueba

```powershell
# Backend completo (unit + contract + integration) contra motorix_test
cd server; npm test

# Solo las suites nuevas
npx jest maintenance-proximo notification-keys order-status-changed migration-018 notifications-calculo notifications-lectura client-notices notifications-roles notifications-performance

# Frontend
cd client; flutter test
```

> Las pruebas de integración corren **solo** contra `motorix_test` (recreada con migraciones 001–018 y seeds 001–009), nunca contra la base principal.

## 4. Escenarios de validación

### E1 — Migración y seeds idempotentes (CA-12, CA-15)

1. Sobre una base limpia: aplicar migraciones 001–018 y `apply-seeds.mjs` **una** vez; anotar los conteos de `service_orders` (6), `maintenance_plans` (6), `notification_reads` (0) y `client_notices` (0).
2. Correr `apply-seeds.mjs` una **segunda** vez.
3. **Esperado**: conteos idénticos; la orden 3 conserva `status_changed_at` de hace ~5 días (no se reinicia); la orden 6 está `TERMINADO`; el mantenimiento 6 vence en ~10 días.
4. **Migración sobre una base con datos**: en una copia con órdenes ya creadas, comprobar que `status_changed_at` = `updated_at` de cada orden **y que `updated_at` no cambió** por el relleno.

### E2 — Campana y contador del administrador (CA-1, CA-3, CA-5)

1. Iniciar sesión como `admin`.
2. **Esperado**: el encabezado muestra la campana con el total de avisos no leídos. Con los datos de ejemplo: 2 mantenimientos vencidos, 1 próximo, citas de hoy, refacciones con stock bajo (2, 4 y 5) y 1 orden detenida (la 3).
3. Abrir el panel: avisos agrupados en este orden: Mantenimientos vencidos, Órdenes detenidas, Stock bajo o agotado, Mantenimientos próximos, Citas de hoy.
4. Comparar con el panel de control: los `mantenimientos vencidos` y el `stock bajo` coinciden al 100 % con los del centro; los mantenimientos **próximos** del centro (1 con los datos de ejemplo) son un subconjunto de los `proximos` del panel (que cuenta todo pendiente no vencido), definido por los márgenes de 30 días o 1,000 km.

### E3 — Navegar desde un aviso y marcar como leído (CA-6, CA-7)

1. Abrir el aviso de stock → llega a Inventario; abrir uno de mantenimiento → llega al historial del vehículo; uno de orden → detalle de la orden; uno de cita → Citas.
2. Marcar un aviso como leído (o abrirlo): el contador baja en 1 y el aviso queda en gris.
3. Cerrar sesión y volver a entrar como `admin`: el aviso sigue leído. Entrar como `recepcion`: ese aviso (si le corresponde) sigue **no leído** (la lectura es por usuario).
4. **Estado nuevo**: reducir el stock de una refacción de «bajo» a «agotado» (movimiento de salida) → el aviso reaparece como **no leído** (clave distinta). Reponer stock por encima del mínimo → el aviso desaparece.

### E4 — Permisos por rol (CA-4)

1. Iniciar sesión como `recepcion`: ve mantenimientos, citas y órdenes detenidas; **no** ve avisos de stock. `GET /api/notifications` con su token no contiene ninguna clave `STOCK:`.
2. Iniciar sesión como `mecanico`: ve solo avisos de órdenes detenidas **asignadas a él**; no ve mantenimientos, citas ni stock. Reasignar la orden 3 a otro mecánico (o dejarla sin mecánico, ya que los seeds solo traen uno) → desaparece de su lista.
3. Con el token del mecánico: `GET /api/client-notices/pending` y `POST /api/client-notices` → `403 NO_AUTORIZADO`.

### E5 — Orden detenida y `status_changed_at` (CA-3, CA-15)

1. La orden 3 (`ESPERANDO_REFACCION`, hace ~5 días) aparece como detenida.
2. Editar su motivo, sus notas o el mecánico asignado → **sigue detenida** (el plazo no se reinicia).
3. Cambiar su estado (por ejemplo, reanudarla a `EN_REPARACION`) → el aviso **desaparece**; la orden vuelve a aparecer solo si pasan más de 3 días sin otro cambio de estado.
4. Una orden `TERMINADO`, `ENTREGADO` o `CANCELADA` nunca genera aviso de orden detenida.

### E6 — Clientes por avisar (CA-10, CA-11)

1. Como `recepcion`, abrir «Clientes por avisar».
2. **Esperado** (datos de ejemplo): la orden 6 terminada (cliente 3), la cita de mañana (cliente 1) y los mantenimientos vencidos/próximo (clientes 1 y 2), cada uno con teléfono, vehículo y motivo.
3. Marcar al cliente de la orden 6 como avisado con la nota «No contestó» → sale de la lista; en la base queda quién y cuándo.
4. Reintentar marcar el mismo hecho (o hacerlo desde otro usuario) → `409 CLIENT_NOTICE_DUPLICATE`.
5. Marcar el mantenimiento próximo como avisado; después adelantar su fecha para que pase a **vencido** → **no** vuelve a la lista (mismo hecho). Registrar un mantenimiento **nuevo** para el mismo vehículo que entre en próximo/vencido → aparece de nuevo.
6. Una nota de más de 255 caracteres se rechaza con `400 DATOS_INVALIDOS`.

### E7 — Actualización automática del contador (CA-1)

1. Con la app abierta como `admin`, crear desde otra sesión un hecho nuevo (por ejemplo, una salida de stock que deje una refacción agotada).
2. **Esperado**: el contador se actualiza solo en ≤ 60 segundos, sin recargar; también se actualiza al cambiar de sección.
3. Con el servidor detenido, el panel muestra el mensaje de error «No se pudieron cargar los avisos.» con «Reintentar»; con una base sin avisos muestra «No tienes avisos pendientes.».
4. **Cambio de usuario**: cerrar sesión como `admin` e iniciar como `mecanico` en el mismo equipo: el panel del mecánico no muestra ni por un instante avisos de stock, mantenimientos ni marcas de leído del administrador.
5. **Sesión vencida**: con el token expirado, la siguiente consulta periódica cierra la sesión (401) sin mostrar el error de carga ni dejar avisos visibles.

### E8 — Compatibilidad con el panel de control (CA-8)

1. Como `admin`, abrir Inicio/Panel: la tarjeta «Alertas que requieren atención» sigue mostrando mantenimientos vencidos, stock bajo y cobros digitales pendientes.
2. **Esperado**: las cifras de esa tarjeta (mantenimientos vencidos y stock bajo) coinciden con las del centro de notificaciones y ninguna se contradice. (El insumo describía una insignia en el ícono de Inventario y un `StockAlertsProvider` que **no existen** en este repositorio; no se agregan.)

### E9 — Rendimiento (CA-13)

1. `cd server; npx jest notifications-performance`.
2. **Esperado**: con 1,000 órdenes, 600 citas, 400 refacciones y 500 mantenimientos pendientes, el máximo de 5 mediciones de `GET /api/notifications` es **< 1,000 ms** para cada rol y la petición ejecuta **≤ 10** consultas SQL (incluida la autenticación).

### E10 — Suites previas y nuevas en verde (CA-13) y documentación (CA-14)

1. `cd server; npm test` y `cd client; flutter test`.
2. **Esperado**: todas las suites pasan (las previas siguen verdes sin editarse); las nuevas (cálculo, roles, lectura, clientes por avisar, rendimiento, `status_changed_at` y migración) incluidas; `quickstart-005.mjs` y los escenarios de la 006 siguen válidos.
3. Revisar `docs/project-context.md` (6.12) y `docs/design-system.md`: reflejan los tipos de aviso, los roles, la campana, el panel y «Clientes por avisar»; 0 afirmaciones desactualizadas.

### Hallazgos de la ejecución real (registrados con honestidad)

Al ejecutar el quickstart en una base `motorix` con datos propios y en
`motorix_test` se encontró lo siguiente. Nada de esto cambia el código de la
feature; son limitaciones de los datos de ejemplo y de las pruebas.

1. **Seeds con IDs fijos (deuda técnica).** Los seeds 004 y 009 usan IDs fijos
   (orden 6, mantenimiento 6). En la base `motorix` de quien probó ya existían
   una orden #6 y una #7 y un mantenimiento con ID 6, propios de pruebas
   anteriores. Como el `ON DUPLICATE KEY UPDATE` solo cambia descripciones, las
   filas «Vehículo listo (orden #6)» y «Mantenimiento próximo (cambio de filtros)»
   **no aparecieron** en Clientes por avisar con esos datos, y los contadores de
   las capturas (administrador 13, recepción 10) difieren de los de la guía
   (9 y 6) por esa razón. Los mismos seeds sobre una base limpia sí producen las
   cifras de la guía: se verificó en `motorix_test` recreada (migraciones 001–018 y
   seeds 001–009 dos veces con conteos idénticos; la API devuelve un aviso de cada
   tipo y Clientes por avisar lista la orden 6, la cita de mañana y los
   mantenimientos). **Pendiente**: usar IDs de demostración en un rango alto o
   claves naturales para no chocar con datos del usuario.
2. **Prueba intermitente sin diagnosticar.** Una corrida de `npm test` falló una
   vez en `tests/integration/notifications-calculo.test.js` (1 prueba de 527) y
   no se reprodujo en tres corridas posteriores (la suite aislada y dos corridas
   completas en verde). No se guardó el detalle del fallo; la causa es
   desconocida (posible dependencia de la hora o de la base recién sembrada). Si
   reaparece, conservar el nombre de la prueba y el mensaje.
3. **Validaciones sin `zod`.** Los documentos de la spec decían que las
   validaciones usaban `zod`; el proyecto usa funciones puras de validación que
   devuelven los mensajes en español (`server/validators/`) y `zod` no es una
   dependencia. Se corrigió la mención en `plan.md`, `research.md`, `tasks.md` y
   `docs/project-context.md`.
4. **T005 parcial.** La comprobación del runner `apply-migrations.mjs` en una base
   desechable no se hizo como tarea aislada; en la práctica el runner aplicó las
   migraciones 001–018 sobre `motorix_test` recreada y registró la 018, y el
   ayudante de pruebas la aplica en cada suite.

## 5. Resultado esperado global

Flujo demostrable de cierre (insumo, sección 4): existen un mantenimiento vencido, una cita para hoy, una refacción con stock bajo y una orden detenida → el administrador inicia sesión y la campana muestra el total → abre el centro y ve los avisos agrupados por tipo → abre el aviso de stock y llega a Inventario → marca uno como leído y el contador baja → la recepcionista solo ve mantenimientos, citas y órdenes detenidas → el mecánico solo ve avisos de sus órdenes → recepción abre «Clientes por avisar», ve al cliente de la orden terminada con su teléfono, lo marca como avisado y el cliente sale de la lista con quién y cuándo quedaron registrados.
