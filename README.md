# Motorix — Sistema de gestión para talleres mecánicos

Motorix es una aplicación de escritorio para administrar un taller mecánico: base de clientes y vehículos, citas, órdenes de servicio con historial e inventario, y —desde el **Sprint 4**— **pagos, tickets imprimibles y panel de control**.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Backend | Node.js + Express (ES Modules), sin ORM — `mysql2` directo |
| Base de datos | MySQL local, InnoDB y `utf8mb4` |
| Frontend | Flutter (escritorio, Windows) con `provider` |
| Pruebas backend | Jest + supertest contra la base `motorix_test` (`--runInBand`) |
| Pruebas frontend | `flutter test` (sin red: clientes HTTP falsos) |

## Estructura del proyecto

```
motorix/
├── client/          # Aplicación Flutter (escritorio)
├── server/          # API REST (Express + MySQL)
├── database/        # Migraciones y seeds idempotentes
├── docs/            # Contexto, reglas y sistema de diseño
└── specs/           # Documentación Spec Kit por sprint
```

## Puesta en marcha

### 1. Base de datos

Requiere MySQL local con un usuario con permisos de creación (por ejemplo `motorix_app`). Las credenciales y los secretos viven **solo** en `server/.env` (nunca se versionan); use `server/.env.example` como plantilla.

```powershell
# Desde la raíz del proyecto
node .\database\scripts\apply-migrations.mjs
node .\database\scripts\apply-seeds.mjs
```

Ambos scripts son idempotentes: pueden ejecutarse de nuevo sin dañar los datos.

### 2. Backend

```powershell
cd server
npm.cmd install
npm.cmd start         # http://localhost:3000/api/health
```

### 3. Cliente Flutter

```powershell
cd client
flutter pub get
flutter run -d windows
```

### Cuentas de ejemplo (semillas)

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `admin` | `Admin123` | ADMIN |
| `recepcion` | `Recepcion123` | RECEPTIONIST |
| `mecanico` | `Mecanico123` | MECHANIC |

## Pruebas

```powershell
# Backend (desde server/) — siempre con --runInBand
node --experimental-vm-modules .\node_modules\jest\bin\jest.js --runInBand

# Frontend (desde client/)
flutter test
flutter analyze
```

## Funcionalidad por sprint

- **Sprint 1**: clientes, vehículos, autenticación JWT y gestión de usuarios por rol.
- **Sprint 2**: citas con detección de huecos, órdenes de servicio con máquina de estados e historial inmutable de entradas.
- **Sprint 3**: historial por vehículo y refacciones (inventario con movimientos, stock mínimo y planes de mantenimiento con umbrales de fecha/kilometraje).
- **Sprint 4** (`specs/004-pagos-tickets-dashboard/`):
  - **Pagos** ligados a la orden: efectivo, tarjeta y transferencia; importes validados contra el saldo; historial inmutable; la orden queda `LIQUIDADA` al cubrir el total (RN-13).
  - **Cobro digital con Mercado Pago** en modo sandbox o simulado: la app solo recibe y comparte un **enlace de pago**; nunca maneja datos de tarjeta (RN-14). Verificación bajo demanda y caducidad perezosa a las 24 h.
  - **Tickets de servicio** con folio único `TCK-AAAA-NNNN` por orden, contenido derivado al vuelo (nunca persistido), vista imprimible con documento HTML temporal y copia al portapapeles.
  - **Panel de control** exclusivo de `ADMIN` con agregados al vuelo: órdenes por estado, citas, mantenimientos, stock bajo y dinero cobrado (solo pagos `COMPLETED`).
  - Los permisos se validan **siempre en el servidor** (RN-15).

## Documentación

- Reglas del proyecto: `docs/reglas.md`
- Sistema de diseño: `docs/design-system.md`
- Contratos y planes por sprint: `specs/` (por ejemplo `specs/004-pagos-tickets-dashboard/`)
- Historial de sprints: `docs/sprints/`
