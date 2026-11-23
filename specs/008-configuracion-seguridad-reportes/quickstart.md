# Quickstart: Configuración, seguridad y reportes

**Feature**: `008-configuracion-seguridad-reportes` | **Fecha**: 2026-11-23 | **Plan**: [plan.md](./plan.md) | **Contrato**: [contracts/api-rest.md](./contracts/api-rest.md)

Guía de validación de extremo a extremo, **agrupada por bloque**: cada bloque se puede validar y cerrar por separado. No incluye código de implementación; los escenarios prueban los criterios de aceptación de [spec.md](./spec.md) sobre una base local.

## 1. Prerrequisitos

- MySQL local con usuario dedicado (no `root`) y `server/.env` configurado (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=motorix`; ver `server/.env.example`).
- Dependencias instaladas (`npm install` en `server/`, `flutter pub get` en `client/`).
- Cuentas de los seeds: `admin / Admin123`, `recepcion / Recepcion123`, `mecanico / Mecanico123` (no las de `Admin2026!` que citaba `docs/project-context.md` antes de este sprint).

## 2. Puesta en marcha

> **Orden obligatorio: migraciones → seeds → servidor.** El servidor del bloque P1 emite tickets con las columnas de instantánea (migración 021) y lee `settings` (019): si arranca antes de aplicar las migraciones, la emisión de tickets y el inicio de sesión fallan; `apply-seeds` se detiene en el seed 010 si faltan las migraciones 019–021.

```powershell
# 1. Migraciones (019–021 en P1, 022–023 en P2)
node database/scripts/apply-migrations.mjs

# 2. Datos de ejemplo (010 en P1, 011 en P2, 012 en P3)
node database/scripts/apply-seeds.mjs

# 3. Backend (otra terminal)
cd server; npm start

# 4. Cliente
cd client; flutter run
```

> **IDs de los seeds**: las tablas nuevas del sprint usan IDs desde 1; solo donde se inserta en tablas que ya existían (órdenes, pagos, tickets…) se usan IDs desde 9001, por lo que sus registros nuevos continúan desde 9002.
> **Tras sembrar la versión 1 de los términos (P2)**, los scripts de evidencia anteriores que inician sesión (`quickstart-005.mjs`, `verificar-avisos-api.mjs`) reciben `403 TERMS_NOT_ACCEPTED` hasta que cada cuenta acepte: `POST /api/terms/accept` con `{ "termsVersionId": 1 }`.

## 3. Comandos de prueba

```powershell
# Backend completo (unit + contract + integration) contra motorix_test
cd server; npm test

# Por bloque
npx jest migrations-019-021 settings tickets-taller-snapshot notifications-margenes service-types maintenance-proposal tickets-proximo-servicio next-service settings-rules maintenance-proximo-margenes
npx jest migrations-022-023 audit-log audit-detail password-policy session-renewal no-exposure injection-search terms terms-gate-queries
npx jest report-range csv reports-income reports-services-productivity reports-parts-rotation reports-performance reports-export reports-roles

# Frontend
cd client; flutter test; flutter analyze
```

> Las pruebas de integración corren **solo** contra `motorix_test` (migraciones 001–023, sin seeds), nunca contra la base principal. Recrearla exige autorización explícita del usuario.

## 4. Escenarios de validación

### BLOQUE P1 — Configuración y catálogo

#### E1 — Migraciones y seeds idempotentes del bloque (CA-12, CA-3)

1. Base limpia: migraciones 001–021 y `apply-seeds.mjs` **dos** veces.
2. **Esperado**: conteos idénticos entre corridas; `settings` con 7 filas; `service_types` con 4 (ids 1–4); orden 9001 `ENTREGADO` con un ticket que tiene instantánea; si el administrador cambió un ajuste antes de la segunda corrida, **conserva su valor** (los seeds no lo pisan).
3. **Base con datos**: los tickets existentes tienen `shop_name` en `NULL` (sin relleno) y las líneas de servicio existentes `service_type_id` en `NULL`.

#### E2 — Datos del taller en el ticket (CA-1)

1. Como `admin`, abrir **Configuración**, cambiar nombre y teléfono y guardar.
2. Abrir el ticket de una orden que aún no tenga ticket: muestra los datos nuevos.
3. Cambiar de nuevo los datos: el ticket recién emitido **no cambia**; un ticket anterior al sprint (sin instantánea) muestra los datos vigentes.
4. Entrar como `recepcion` o `mecanico`: no ven Configuración y la API responde `403`.

#### E3 — Márgenes y orden detenida (CA-2, CA-3)

1. Con los seeds, anotar los avisos del centro (E2 del quickstart de la 007).
2. En **Configuración → Operación**, cambiar el margen a 15 días y 500 km y los días de orden detenida a 5. El centro de avisos refleja el cambio; la lista de Mantenimientos y el panel de control **no cambian**.
3. Borrar las filas de `settings` en una base desechable: el centro vuelve a 30 días, 1,000 km y 3 días (resultados del Sprint 6).
4. Probar valores fuera de límites (0, 366, texto): mensaje claro y nada se guarda.

#### E4 — Catálogo, línea con tipo y próximo servicio (CA-4, CA-5, CA-14)

1. Como `admin`, crear «Cambio de aceite» (180 días y 5,000 km) en **Catálogo de servicios**; probar un nombre repetido y un tipo sin intervalos.
2. En una orden abierta, agregar una línea de servicio y elegir el tipo; recepción también puede elegir tipos activos pero no administrarlos.
3. Desactivar el tipo: deja de ofrecerse y la línea conserva su tipo; no existe opción de borrar.
4. Abrir el ticket de la orden (emisión nueva): muestra «Próximo servicio» con fecha (emisión + 180 días) y kilometraje (entrada + 5,000). Una orden sin tipos no muestra la línea.
5. En **Mantenimientos → Nuevo**, elegir un vehículo y **Proponer desde una orden**: se rellenan fecha y kilometraje y se pueden corregir antes de guardar.

### BLOQUE P2 — Seguridad y términos

#### E5 — Términos y condiciones (CA-16 a CA-19)

1. Tras sembrar la versión 1, iniciar sesión con cada cuenta de demostración: aparece la pantalla de aceptación; **Rechazar** (con confirmación) cierra la sesión; **Aceptar** entra y no se vuelve a pedir.
2. Sin pasar por la pantalla, con el token de un usuario que no aceptó, llamar a `GET /api/clients`: `403 TERMS_NOT_ACCEPTED`; `GET /api/terms/current`, `POST /api/terms/accept`, `POST /api/auth/renew` y `POST /api/auth/logout` responden normal.
3. Como `admin`, **Términos → Publicar versión nueva**: todos los usuarios deben aceptar la 2 al siguiente acceso. El administrador ve la versión vigente y las aceptaciones.
4. Leer la versión 1: cubre uso permitido, confidencialidad, cuentas personales y aviso de privacidad, y advierte que es una plantilla.

#### E6 — Bitácora (CA-20, CA-21)

1. Provocar: un inicio de sesión fallido, el alta y la baja de un usuario, un cambio de rol, un cambio de ajustes, un cambio de precio de venta y de compra de una refacción y la publicación de una versión.
2. Como `admin`, abrir **Bitácora**: aparecen todas las acciones con quién y cuándo, 50 por página, con filtros de fecha, usuario y acción. El cambio del precio de compra aparece **sin importes**.
3. No existen botones ni rutas para editar, borrar o exportar. `recepcion` y `mecanico` reciben `403`.
4. Revisar a mano algunas entradas: sin contraseñas, hashes ni tokens.

#### E7 — Contraseñas y sesión por inactividad (CA-22, CA-23)

1. Cambiar la contraseña a una de 7 caracteres, o sin mayúscula, minúscula o número: se rechaza con el mensaje de la regla; con una válida se acepta (en base solo existe el hash).
2. **Configuración → Seguridad**: poner 5 minutos; cerrar sesión y volver a entrar. Dejar la aplicación sin tocarla más de 5 minutos: se cierra la sesión y el login muestra «Tu sesión se cerró por inactividad.».
3. Repetir usando la aplicación cada 2 minutos: la sesión **no** se cierra (el cliente renueva el token). Con la aplicación quieta, la consulta cada 60 s de avisos **no** la mantiene abierta.
4. Con un token vencido o de un usuario desactivado, cualquier ruta responde `401`.

#### E8 — No exposición e inyección (CA-24, CA-25)

1. `npx jest no-exposure injection-search`: ninguna respuesta de usuarios, refacciones, órdenes, pagos y tickets contiene hash, token ni precios reservados; las cargas de inyección en búsquedas se tratan como texto.

#### E9 — Datos de ejemplo del bloque (CA-12)

1. Seeds 010 y 011 dos veces: la versión 1 de los términos y las 4 entradas de bitácora (ids 1–4) no se duplican; la bitácora muestra datos al arrancar.

### BLOQUE P3 — Reportes (solo si se entrega)

#### E10 — Ingresos, servicios y productividad (CA-6, CA-7, CA-10)

1. Como `admin`, **Reportes**: elegir «Mes anterior» y «Mes actual» y un rango libre. Ingresos por día o mes y por método; cuadrar contra los pagos del seed 012 (centavos exactos). Un rango sin pagos muestra el estado vacío.
2. Servicios más frecuentes (con «Sin tipo») y productividad por mecánico (con «Sin asignar»).
3. `recepcion` y `mecanico`: sin sección y `403` en toda la API de reportes.

#### E11 — Refacciones y rotación (CA-8, CA-11)

1. Reporte de refacciones: costo, precio de venta y margen; las líneas sin precio de compra salen «sin costo» y no entran al margen. Rotación: «sin existencia» cuando el stock es 0.
2. `npx jest reports-performance`: cada reporte < 2 s con el volumen ampliado.

#### E12 — Exportación (CA-9)

1. Exportar cada reporte: el CSV abre bien en Excel (acentos, UTF-8 con BOM) y coincide con la pantalla. Una descripción que empiece con `=` se exporta neutralizada.

#### E13 — Cierre

1. Seed 012 dos veces sin duplicados; `npm test`, `flutter test`, `flutter analyze`; revisión de documentos del bloque (project-context, design-system, database/README) y de las capturas `s7-NN` en `docs/evidencias/sprint-7-configuracion/`.
