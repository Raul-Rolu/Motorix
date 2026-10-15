# Quickstart de Validación — Sprint 1: Base de Clientes y Vehículos

**Fecha**: 2026-10-11 | **Plan**: [plan.md](./plan.md) | **Contrato**: [contracts/api-rest.md](./contracts/api-rest.md)

Guía de arranque y validación de extremo a extremo. No incluye código de
implementación: los detalles viven en el contrato y el modelo de datos, y las tareas
concretas en `tasks.md` (Fase 2).

## Prerrequisitos

- Node.js LTS (20+) instalado.
- Flutter stable instalado (canal stable, con soporte de escritorio).
- MySQL instalado de forma **local** (instalación nativa) con un usuario dedicado
  `motorix_app` (NUNCA `root` para la aplicación) y permisos sobre las bases
  `motorix` (desarrollo) y `motorix_test` (pruebas).
- Copiar `server/.env.example` a `server/.env` y completar `DB_HOST`, `DB_PORT`,
  `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `JWT_SECRET` (valores locales, sin secretos en
  el repositorio).

## Puesta en marcha

```text
1. Crear la base de datos y el usuario dedicado en MySQL local.
2. Aplicar migraciones: ejecutar el script de aplicación en database/scripts/
   (aplica database/migrations/ en orden y registra en schema_migrations; es
   idempotente, puede re-ejecutarse).
3. Cargar seeds: ejecutar el script de seeds (cuentas iniciales admin, recepcion y
   mecanico + clientes y vehículos de ejemplo; idempotente, no duplica registros).
4. Backend: en server/, instalar dependencias e iniciar (npm install / npm start).
   Verificar GET /api/health responde 200.
5. Frontend: en client/, obtener dependencias e iniciar (flutter pub get / flutter run
   en escritorio).
```

## Escenarios de validación (mapeados al spec)

### V1 — Inicio de sesión con usuario o correo (US1, FR-001)

1. Con la cuenta `admin`, iniciar sesión con el **usuario** → acceso concedido; se ve
   la pantalla de inicio y el menú con Inicio, Clientes, Vehículos y Usuarios.
2. Cerrar sesión; iniciar sesión con el **correo** de la misma cuenta en el mismo campo
   → mismo resultado.
3. Intentar con contraseña incorrecta → mensaje genérico "credenciales inválidas", sin
   acceso.
4. Volver a la app con la sesión cerrada y abrir una pantalla protegida → redirige al
   login.

### V2 — Menú por rol (US1 esc. 6, FR-016)

1. `recepcion` → inicio con Inicio, Clientes y Vehículos; sin sección Usuarios.
2. `mecanico` → solo la pantalla de Inicio.
3. Accediendo de forma directa (no por menú) a gestión de usuarios con sesión de
   recepcionista → denegado en el servidor (403), no solo oculto en la interfaz.

### V3 — Gestión de usuarios (US2, FR-004, FR-015)

1. Como `admin`, crear un usuario nuevo con rol → aparece en la lista y puede iniciar
   sesión.
2. Intentar crear otro usuario con el mismo username o correo → rechazo con conflicto.
3. Desactivar un usuario → no puede iniciar sesión; si tiene sesión abierta, pierde
   acceso; reactivarlo restaura el acceso.
4. Intentar desactivar al único admin activo → rechazo.

### V4 — Clientes (US3/US4, FR-005, FR-006, FR-007)

1. Como `recepcion`, registrar cliente con nombre y teléfono → guardado y visible en la
   consulta.
2. Intentar guardar sin teléfono → validación explica el dato faltante, no se guarda.
3. Editar el teléfono del cliente → consulta muestra el valor nuevo y conserva sus
   vehículos.
4. Como `mecanico`, intentar registrar un cliente → denegado en el servidor.

### V5 — Vehículos y asociación (US5/US6, FR-008, FR-009, RN-1)

1. Registrar vehículo con placas, marca, modelo, año y un cliente propietario →
   guardado y asociado.
2. Intentar guardar vehículo sin propietario → rechazado (RN-1).
3. Registrar otro vehículo con las placas anteriores → rechazo por duplicado.
4. Abrir la ficha del cliente → lista sus vehículos; abrir el vehículo → muestra a su
   propietario.
5. Reasociar un vehículo a otro cliente → la relación se actualiza en ambos sentidos.

### V6 — Persistencia, seeds y seguridad (FR-010, FR-012, CA-6 a CA-8)

1. Reiniciar backend y base → todos los registros creados siguen intactos y sin
   duplicados.
2. Re-ejecutar las migraciones y los seeds → sin errores ni registros duplicados; la
   base nunca queda vacía tras la instalación inicial.
3. Revisar el repositorio → sin secretos; `.env` ignorado; `.env.example` con las
   variables sin valores sensibles; `server/package.json` declara `"type": "module"`.

### V7 — Sesión y cambio de contraseña (FR-002, FR-011)

1. Con una sesión abierta sin actividad, esperar 30 minutos → el sistema pide iniciar
   sesión de nuevo.
2. Cambiar la contraseña de la cuenta propia con la actual correcta y una nueva que
   cumpla la política (8+, mayúscula, minúscula, número) → cambio exitoso; la contraseña
   vieja deja de funcionar.
3. Intentar con una nueva que no cumple la política o con la actual incorrecta →
   rechazo con mensaje claro.

## Pruebas automatizadas

```text
Backend (server/):
- npm test  →  Jest: unitarias (services, validators)
- Suite de integración y contrato (Jest + supertest) corriendo contra motorix_test,
  nunca contra la base principal; la base de prueba se recrea con las migraciones.

Frontend (client/):
- flutter test  →  pruebas de widgets/lógica propias del frontend.
```

Criterio de terminado del sprint (Principio VII): todo el flujo demostrable
(iniciar sesión → registrar cliente → registrar vehículo → asociarlo → consultar)
funciona de extremo a extremo con persistencia real y pasan las suites automatizadas.
