# Quickstart: Categoría, marca, precio de compra y cobro consistente

**Feature**: `006-complemento-precios-compra` | **Fecha**: 2026-11-21 | **Plan**: [plan.md](./plan.md) | **Contrato**: [contracts/api-rest.md](./contracts/api-rest.md)

Guía de validación de extremo a extremo. No incluye código de implementación; los escenarios prueban los criterios de aceptación de [spec.md](./spec.md) sobre una base local.

## 1. Prerrequisitos

- MySQL local con usuario dedicado (no `root`) y `server/.env` configurado (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=motorix`; ver `server/.env.example`).
- Dependencias del backend instaladas (`npm install` en `server/`) y de Flutter (`flutter pub get` en `client/`).
- El backend usa `MP_MODE=simulado` por defecto (sin credenciales de Mercado Pago).

## 2. Puesta en marcha

```powershell
# 1. Aplicar migraciones (incluye la nueva 017)
node database/scripts/apply-migrations.mjs

# 2. Cargar datos de ejemplo
node database/scripts/apply-seeds.mjs

# 3. Backend (en otra terminal)
cd server; npm start

# 4. Cliente
cd client; flutter run
```

Cuentas del MVP: `admin / Admin2026!`, `recepcion / Recepcion2026!`, `mecanico / Mecanico2026!`.

## 3. Comandos de prueba

```powershell
# Backend completo (unit + contract + integration) contra motorix_test
cd server; npm test

# Solo las suites nuevas
npx jest money-cents parts-purchase-price parts-price-limits parts-role-visibility payments-stale payments-compat

# Frontend
cd client; flutter test
```

> Las pruebas de integración corren **solo** contra `motorix_test` (recreada con migraciones 001–017 y seeds 001–008), nunca contra la base principal.

## 4. Escenarios de validación

### E1 — Seeds idempotentes y datos completos (CA-8, CA-9)

1. Recrear `motorix_test`, aplicar migraciones 001–017 y correr `apply-seeds.mjs` **una** vez; anotar conteos: refacciones, servicios y mano de obra de las órdenes 2 y 4, entradas de orden, movimientos, pagos, tickets.
2. Correr `apply-seeds.mjs` una **segunda** vez.
3. **Esperado**: todos los conteos idénticos (orden 2: 2 servicios = $600 y 1 mano de obra = $500; orden 4: 2 servicios = $950 y 1 mano de obra = $400), sin filas nuevas en `order_entries`, sin duplicar clientes, vehículos, citas, refacciones, movimientos, pagos ni tickets (en `order_services`, `order_labor` y `order_entries` los IDs son fijos: 1–4, 1–2 y 1–5); los datos de trabajo existentes (precios capturados, órdenes en curso) no se reinician.
4. **Esperado (CA-9)**: las 7 refacciones de ejemplo traen categoría, marca, precio de compra y precio de venta (la refacción 7 conserva `salePrice = NULL` como demo de pendiente de precio).

### E2 — Categoría, marca y precio de compra (CA-1)

1. Como `admin`, crear una refacción con categoría `FRENOS`, marca `Brembo` y precio de compra; editarlos; volver a consultar.
2. **Esperado**: los tres datos persisten y se muestran en la ficha.
3. Como `admin`, intentar guardar una categoría fuera del catálogo y una marca de 51 caracteres.
4. **Esperado**: `400 DATOS_INVALIDOS` con mensaje claro y sin cambios.

### E3 — Límites de precios y de total (CA-2)

1. Intentar guardar precio de compra/venta: `-1`, `"abc"`, `10.999` (3 decimales), `1000000.00`.
2. **Esperado**: los cuatro rechazados; `999999.99` aceptado.
3. En una orden, agregar partidas hasta un total de `99999999.99`; intentar una más.
4. **Esperado**: el tope se acepta; excederlo devuelve `422 ORDER_TOTAL_LIMIT_EXCEEDED` y la orden no cambia.

### E4 — Precio de compra visible solo para ADMIN (CA-3, CA-4)

1. `GET /api/parts` con token de `admin`, `recepcion` y `mecanico`.
2. **Esperado**: solo la respuesta de `admin` incluye `purchasePrice`; las otras dos no contienen la clave (ni en pantalla ni en JSON).
3. Con token de `recepcion`/`mecanico`, `POST /api/parts` y `PUT /api/parts/:id` con `category`/`brand`/`purchasePrice`.
4. **Esperado**: `403 NO_AUTORIZADO` desde el backend (probar también con la interfaz ocultando el campo).

### E5 — Cálculo en centavos enteros (CA-5)

1. Suite `money-cents` + escenarios de totales: importes que generan fracciones de centavo (p. ej. 3 × 0.10) en líneas, pagos y saldos.
2. **Esperado**: totales, saldos y montos idénticos al cálculo en centavos enteros (diferencia $0), persistidos con 2 decimales.

### E6 — Cobro de Mercado Pago desfasado (CA-6)

1. Como `recepcion`, crear un cobro digital pendiente de $1,800 sobre una orden (modo simulado).
2. Como `admin`, asignar precio a una refacción usada en esa orden para que el total pase a $2,000.
3. `GET /api/orders/:id/payments`.
4. **Esperado**: el cobro aparece en estado `STALE` ("Desfasado" en la interfaz, chip ámbar); `saldoPendiente` no lo descuenta; el `monto` original sigue en $1,800.
5. Intentar verificar/confirmarlo.
6. **Esperado**: no pasa a `COMPLETED`; se devuelve `STALE` (o `409 PAYMENT_NOT_MODIFIABLE`).
7. Crear un nuevo cobro digital.
8. **Esperado**: no hay `PAYMENT_DUPLICATE_PENDING`; el nuevo nace `PENDING` por el importe vigente ($2,000) y la orden puede liquidarse con él.
9. **Caso control**: con un cobro pendiente y un total **sin** cambio, el cobro permanece `PENDING`.

### E6b — Cobro de Mercado Pago correcto tras un pago parcial no se marca `STALE` (CA-6)

1. Sobre una orden con total de $2,000, como `recepcion` registrar un pago manual (efectivo) de $800 → `saldoPendiente` = $1,200.
2. Crear un cobro digital de Mercado Pago por $1,200 (modo simulado); queda `PENDING`.
3. `GET /api/orders/:id/payments` y luego `POST /api/payments/:id/verify`.
4. **Esperado**: el cobro **no** pasa a `STALE` (su importe coincide con el saldo pendiente: total − pagos `COMPLETED`, no con el total a secas); al verificarse se confirma `COMPLETED` y la orden queda liquidada.
5. **Caso contrario**: si tras crear un cobro de $1,200 se registra otro pago manual de $100, el saldo pasa a $1,100 y el cobro de $1,200 se devuelve `STALE`.

### E7 — Compatibilidad con pagos y tickets anteriores (CA-7)

1. Sobre los pagos y el ticket del seed 007 (órdenes 2 y 4), consultar `GET /api/orders/:id/payments`, `GET /api/payments/:id` y el ticket de la orden 4.
2. **Esperado**: mismos importes, estados, folio `TCK-2026-0001` y contenido que antes de este cambio; ninguna fila alterada por la migración 017.

### E8 — Suites previas y nuevas en verde (CA-10)

1. `cd server; npm test` y `cd client; flutter test`.
2. **Esperado**: todas las suites pasan (las previas siguen verdes); las nuevas (límites, permisos por rol, centavos, `STALE`, compatibilidad) incluidas.

### E9 — Documentación actualizada (CA-11)

1. Revisar `docs/project-context.md`: estados de pago incluyen **Desfasado (`STALE`)**; entidad `Part` con `category`, `brand`, `purchasePrice`; ningún texto diga que las refacciones no suman al total.
2. Revisar `docs/design-system.md`: chip de estado "Desfasado" (ámbar) y columnas de categoría/marca en el inventario.
3. Búsqueda en el código: ningún comentario vigente afirme que "las refacciones no suman importe".
4. **Esperado**: 0 afirmaciones desactualizadas.

## 5. Resultado esperado global

Flujo demostrable de cierre (spec, sección 4): el admin registra una refacción con categoría, marca y ambos precios → mecánico y recepción la consultan sin recibir el precio de compra → se genera un cobro de Mercado Pago pendiente → el admin asigna precio a una refacción usada en la orden y el total cambia → el cobro queda `STALE`, no es confirmable y se genera uno nuevo por el importe vigente → los seeds corren dos veces sin duplicar registros.
