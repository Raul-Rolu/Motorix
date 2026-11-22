# Contrato API REST: Notificaciones internas y clientes por avisar

**Fecha**: 2026-11-22 | **Feature**: `007-notificaciones-internas` | **Plan**: [plan.md](../plan.md)

Extiende el contrato base y los previos (`specs/003-historial-inventario/contracts/api-rest.md`, `specs/004-pagos-tickets-dashboard/contracts/api-rest.md`, `specs/005-precio-venta-refacciones/contracts/api-rest.md`, `specs/006-complemento-precios-compra/contracts/api-rest.md`): misma autenticación por JWT con rol (`Authorization: Bearer <token>`, sesión de 30 minutos), mismo envoltorio (`ok` con payload directo o colecciones bajo `datos`; `created` = 201; error como `{ "error": { "codigo": "...", "mensaje": "...", "details": { } } }`). **Se agregan 4 rutas nuevas; ninguna ruta existente cambia y no hay dependencias nuevas.**

## Cambios transversales

- **Aviso**: objeto derivado al consultar (no se almacena). Se identifica por `clave` con el formato `TIPO:ID:ESTADO` (ver `data-model.md`, sección 4).
- **Grupos** (`grupo`): `MANTENIMIENTO_VENCIDO | ORDEN_DETENIDA | STOCK | MANTENIMIENTO_PROXIMO | CITA_DEL_DIA`, en el orden de presentación del panel.
- **Destino** (`destino`): `{ "pantalla": "ORDEN" | "VEHICULO" | "INVENTARIO" | "CITAS", "id": number | null }`; el cliente lo usa para abrir la pantalla relacionada (orden, vehículo, inventario o citas).
- **Textos en español** (`titulo`, `detalle`) los arma el servidor, de modo que cliente y pruebas comparten una sola redacción. El nombre del estado de una orden en el detalle del aviso («Recibido», «Diagnóstico», «En reparación», «Esperando refacción») también lo mapea el servidor (`utils/notification-text.js`); no depende del mapeo del cliente.
- **Redacción del `detalle` por tipo** (la arma el servidor): mantenimiento vencido `«descripción · placas · vencido hace N día(s)»`, `«… · vence hoy»` o `«… · kilometraje superado en N km»`; mantenimiento próximo `«descripción · placas · faltan N día(s)»`, `«… · faltan N km»` o `«… · faltan N día(s) o N km»` (solo los umbrales dentro del margen); cita del día `«HH:MM · cliente · placas · motivo»`; stock bajo `«nombre (código) · quedan N, mínimo M»`; stock agotado `«nombre (código) · sin existencias»`.
- **Montaje**: dos routers independientes, `/api/notifications` y `/api/client-notices` (un router por recurso, como el resto de la API).
- **Constantes del servidor** (no configurables en este sprint): orden detenida = más de **3 días** sin cambio de estado; mantenimiento próximo = umbral más cercano a **30 días** o **1,000 km** o menos.
- **Códigos de error nuevos**: `NOTIFICATION_NOT_FOUND` (404), `CLIENT_NOTICE_NOT_PENDING` (409), `CLIENT_NOTICE_DUPLICATE` (409). Se reutilizan `NO_AUTORIZADO` (403), `DATOS_INVALIDOS` (400) y los errores de sesión existentes.

## Endpoints nuevos

### `GET /api/notifications` (FR-001 a FR-007, FR-013; CA-1 a CA-7)

- **Roles**: ADMIN, RECEPTIONIST, MECHANIC. Cada rol recibe **solo** lo que le corresponde (CA-4):
  - ADMIN: todos los grupos; RECEPTIONIST: mantenimientos, citas y órdenes detenidas (el stock no se calcula ni se devuelve); MECHANIC: solo órdenes detenidas asignadas a él.
- **Uso**: se consulta al iniciar sesión, al navegar entre pantallas y cada 60 s (la misma ruta alimenta el contador y el panel).
- **Respuesta 200**:

```json
{
  "total": 6,
  "noLeidos": 5,
  "datos": [
    {
      "clave": "MANTENIMIENTO:1:VENCIDO",
      "grupo": "MANTENIMIENTO_VENCIDO",
      "estado": "VENCIDO",
      "titulo": "Mantenimiento vencido",
      "detalle": "Cambio de aceite y filtros · GHI-789-C · vencido hace 160 día(s)",
      "leido": false,
      "destino": { "pantalla": "VEHICULO", "id": 3 }
    },
    {
      "clave": "ORDEN:3:DETENIDA",
      "grupo": "ORDEN_DETENIDA",
      "estado": "DETENIDA",
      "titulo": "Orden detenida",
      "detalle": "Orden #3 · DEF-456-B · Esperando refacción, sin cambios hace 5 día(s)",
      "leido": true,
      "destino": { "pantalla": "ORDEN", "id": 3 }
    },
    {
      "clave": "STOCK:2:BAJO",
      "grupo": "STOCK",
      "estado": "BAJO",
      "titulo": "Stock bajo",
      "detalle": "Pastillas de freno delanteras (FRN-PAS-220) · quedan 2, mínimo 5",
      "leido": false,
      "destino": { "pantalla": "INVENTARIO", "id": 2 }
    },
    {
      "clave": "CITA:1:HOY",
      "grupo": "CITA_DEL_DIA",
      "estado": "HOY",
      "titulo": "Cita de hoy",
      "detalle": "10:00 · María López Hernández · ABC-123-A · Revisión de frenos delanteros",
      "leido": false,
      "destino": { "pantalla": "CITAS", "id": 1 }
    }
  ]
}
```

- **Orden y contadores**: `datos` viene ordenado por grupo (el orden de arriba) y, dentro de cada grupo, por urgencia (el más vencido o antiguo primero). `total` = `datos.length`; `noLeidos` = los de `leido: false` (el valor de la campana). Sin avisos: `{ "total": 0, "noLeidos": 0, "datos": [] }`.
- **Coincidencia de cifras (CA-5)**: los avisos de mantenimiento **vencido** y de stock coinciden con el panel de control (`GET /api/dashboard`: `mantenimientos.vencidos` y `inventario.stockBajo`), con la lista de Mantenimientos y con las alertas de stock. Los **próximos** del centro son un subconjunto de `mantenimientos.proximos` del panel, definido por los márgenes de 30 días o 1,000 km (el panel no aplica margen; los vencidos coinciden al 100 %). Las citas del día excluyen las `COMPLETADA` (el panel solo excluye las canceladas).
- **Errores**: `401` sesión inválida o expirada.

### `POST /api/notifications/reads` (FR-006; CA-6)

- **Roles**: ADMIN, RECEPTIONIST, MECHANIC.
- **Cuerpo**: `{ "clave": "MANTENIMIENTO:1:VENCIDO" }` (obligatoria, ≤ 80 caracteres, formato `TIPO:ID:ESTADO`).
- **Efecto**: guarda la lectura **para el usuario autenticado** (idempotente: marcar dos veces no duplica ni falla). Otro usuario sigue viendo el aviso como no leído.
- **Respuesta 200**: `{ "clave": "MANTENIMIENTO:1:VENCIDO", "leido": true, "noLeidos": 4 }`.
- **Errores**:
  - `400 DATOS_INVALIDOS`: clave ausente, vacía o con formato inválido.
  - `404 NOTIFICATION_NOT_FOUND`: la clave no corresponde a ningún aviso **vigente del propio usuario** (no existe, ya no aplica o su rol no puede verlo); no se guarda nada.
  - `401` sesión inválida o expirada.

### `GET /api/client-notices/pending` (FR-014; CA-10)

- **Roles**: ADMIN, RECEPTIONIST. Con MECHANIC → `403 NO_AUTORIZADO` (validado en servidor).
- **Respuesta 200**:

```json
{
  "total": 3,
  "datos": [
    {
      "tipo": "ORDEN_TERMINADA",
      "hechoId": 6,
      "motivo": "Vehículo listo (orden #6)",
      "cliente": { "id": 3, "nombreCompleto": "Ana Sofía Mendoza", "telefono": "5534567890" },
      "vehiculo": { "id": 4, "placas": "JKL-012-D", "marca": "Toyota", "modelo": "Corolla" },
      "fechaReferencia": "2026-11-21T10:00:00"
    },
    {
      "tipo": "CITA_MANANA",
      "hechoId": 3,
      "motivo": "Cita mañana a las 09:00",
      "cliente": { "id": 1, "nombreCompleto": "María López Hernández", "telefono": "5512345678" },
      "vehiculo": { "id": 2, "placas": "DEF-456-B", "marca": "Mazda", "modelo": "CX-5" },
      "fechaReferencia": "2026-11-23"
    },
    {
      "tipo": "MANTENIMIENTO",
      "hechoId": 6,
      "motivo": "Mantenimiento próximo: Cambio de filtros y revisión de frenos",
      "cliente": { "id": 1, "nombreCompleto": "María López Hernández", "telefono": "5512345678" },
      "vehiculo": { "id": 1, "placas": "ABC-123-A", "marca": "Nissan", "modelo": "Versa" },
      "fechaReferencia": "2026-12-02"
    }
  ]
}
```

- **Contenido de la lista**: hechos `ORDEN_TERMINADA` (orden `TERMINADO` sin entregar), `CITA_MANANA` (cita `PROGRAMADA` de mañana) y `MANTENIMIENTO` (plan `PENDING` vencido o próximo) que **no** estén ya registrados en `client_notices`. Un mantenimiento avisado como próximo que pasa a vencido **no** vuelve a la lista; uno nuevo sí.
- **Errores**: `403 NO_AUTORIZADO` (MECHANIC), `401`.

### `POST /api/client-notices` (FR-015; CA-10, CA-11)

- **Roles**: ADMIN, RECEPTIONIST. Con MECHANIC → `403 NO_AUTORIZADO`.
- **Cuerpo**: `{ "tipo": "ORDEN_TERMINADA" | "CITA_MANANA" | "MANTENIMIENTO", "hechoId": 6, "nota": "No contestó" }` (`tipo` y `hechoId` obligatorios; `nota` opcional, ≤ 255 caracteres).
- **Efecto**: guarda quién avisó, cuándo y la nota; el hecho sale de la lista y no vuelve por el mismo `(tipo, hechoId)`.
- **Respuesta 201**:

```json
{
  "id": 1,
  "tipo": "ORDEN_TERMINADA",
  "hechoId": 6,
  "nota": "No contestó",
  "avisadoPor": { "id": 2, "nombreCompleto": "Recepción del Taller" },
  "fecha": "2026-11-22T11:30:00"
}
```

- **Errores**:
  - `400 DATOS_INVALIDOS`: `tipo` fuera del catálogo, `hechoId` no numérico o `nota` de más de 255 caracteres (no se registra nada).
  - `409 CLIENT_NOTICE_NOT_PENDING`: el hecho no está pendiente (la orden ya se entregó, la cita ya no está programada, el mantenimiento ya no es próximo ni vencido, o no existe).
  - `409 CLIENT_NOTICE_DUPLICATE`: el hecho ya fue avisado (otro usuario lo marcó antes); no se duplica el registro. `details` incluye `avisadoPor` y `fecha` del registro existente.
  - `403 NO_AUTORIZADO`, `401`.

## Endpoints sin cambio (compatibilidad)

- `GET /api/dashboard` (solo ADMIN), `GET /api/maintenances`, `GET /api/parts`, `GET /api/appointments`, `GET /api/orders` y todas las demás rutas conservan su forma, permisos y respuestas.
- `PATCH /api/orders/:id/status` conserva su comportamiento: internamente actualiza la fecha de último cambio de estado de la orden (que **no** aparece en ninguna respuesta).
- La tarjeta de alertas del panel de control de ADMIN (`alertasPanel` en el cliente) y sus cifras no cambian.
