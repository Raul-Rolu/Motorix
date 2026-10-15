# Contrato REST: Citas y Órdenes de Servicio (Sprint 2)

Extiende el contrato del Sprint 1 (`contracts/api-rest.md` de `specs/001-base-clientes-vehiculos`).
Convenciones heredadas:

- Prefijo `/api`; JSON en las dos direcciones; codificación `application/json`.
- Autenticación: `Authorization: Bearer <token>` (JWT de 30 minutos).
- Colecciones: `{ "datos": [...] }`; recursos sueltos: el objeto en raíz; creación: `201`; sin cuerpo: `204`.
- Errores: `{ "error": { "codigo": "...", "mensaje": "..." } }` (nunca trazas internas).
- Autorización SIEMPRE validada en el servidor por rol y, para el mecánico, por pertenencia de la orden (research D6).

## Catálogo de errores nuevo

| Código | HTTP | Cuándo |
|---|---|---|
| CITA_NO_ENCONTRADA | 404 | La cita indicada no existe. |
| CITA_DUPLICADA | 409 | Ya existe una cita para ese vehículo en la misma fecha y hora. |
| CITA_NO_MODIFICABLE | 409 | La cita no está PROGRAMADA (ya fue completada o cancelada). |
| ORDEN_NO_ENCONTRADA | 404 | La orden indicada no existe. |
| ORDEN_BLOQUEADA | 409 | La orden está ENTREGADO o CANCELADA y no admite cambios (RN-9). |
| TRANSICION_INVALIDA | 400 | El cambio de estado no está permitido desde el estado actual o por el rol (FR-012). |
| KILOMETRAJE_INVALIDO | 400 | El kilometraje es menor al previo sin corrección explícita (RN-4). |
| MECANICO_INVALIDO | 400 | El usuario indicado no existe, no está activo o no es MECHANIC. |
| VEHICULO_NO_DISPONIBLE | 404 | El vehículo no existe, está inactivo o no pertenece al cliente indicado. |
| VEHICULO_DUPLICADO | 409 | (heredado) placas repetidas. |
| CLIENTE_NO_ENCONTRADO | 404 | (heredado) cliente inexistente o inactivo. |
| DATOS_INVALIDOS | 400 | (heredado) payload inválido. |
| NO_AUTORIZADO | 403 | (heredado) rol no autorizado para la acción. |

## Citas (`/api/appointments`) — ADMIN y RECEPTIONIST (US1)

| Método y ruta | Acción | Rol |
|---|---|---|
| GET /api/appointments | Listado con filtros `?fecha=YYYY-MM-DD&texto=<cliente o placas>&incluirInactivas=true` | ADMIN, RECEPTIONIST |
| POST /api/appointments | Crear cita (PROGRAMADA) | ADMIN, RECEPTIONIST |
| GET /api/appointments/:id | Detalle de la cita | ADMIN, RECEPTIONIST |
| PUT /api/appointments/:id | Editar fecha, hora, motivo o vehículo (solo PROGRAMADA) | ADMIN, RECEPTIONIST |
| PATCH /api/appointments/:id/status | COMPLETADA `{ status: "COMPLETADA" }` o CANCELADA `{ status: "CANCELADA", cancellationReason: "..." }` | ADMIN, RECEPTIONIST |

**POST /api/appointments** — petición:

```json
{
  "clientId": 1,
  "vehicleId": 1,
  "appointmentDate": "2026-10-15",
  "appointmentTime": "10:30",
  "reason": "Revisión de frenos"
}
```

Respuesta `201`: objeto de la cita con `id`, `status: "PROGRAMADA"` y los datos enviados. Errores: 400 DATOS_INVALIDOS (fecha anterior a hoy, campos faltantes), 404 CLIENTE_NO_ENCONTRADO / VEHICULO_NO_DISPONIBLE, 409 CITA_DUPLICADA.

**PATCH /api/appointments/:id/status** — al cancelar es obligatorio `cancellationReason`; una cita que no está PROGRAMADA responde 409 (no admite cambios).

## Órdenes (`/api/orders`)

| Método y ruta | Acción | Rol |
|---|---|---|
| GET /api/orders | Listado: ADMIN/RECEPTIONIST todas (filtros `?estado=&texto=`); MECHANIC solo las suyas | los tres |
| GET /api/orders/mechanics | Mecánicos activos `[{ id, username, fullName }]` para la asignación manual (FR-008) | ADMIN, RECEPTIONIST |
| POST /api/orders | Crear orden (RECIBIDO) | ADMIN, RECEPTIONIST |
| GET /api/orders/:id | Detalle con cliente, vehículo, mecánico, servicios, mano de obra, entradas y totales | los tres (mecánico: solo suyas) |
| PUT /api/orders/:id | Editar motivo, notas o kilometraje con corrección (solo estados de trabajo) | ADMIN, RECEPTIONIST |
| PATCH /api/orders/:id/status | Cambio de estado `{ status, correction? }` según máquina de estados | ver FR-012 |
| PATCH /api/orders/:id/assignment | Asignar/reasignar `{ mechanicId }` (o `{ mechanicId: null }` para liberar) | ADMIN, RECEPTIONIST |
| POST /api/orders/:id/entries | Agregar entrada `{ entryType: "DIAGNOSTIC" \| "OBSERVATION" \| "RECOMMENDATION", content }` | los tres (mecánico: solo suyas) |
| POST /api/orders/:id/services | Agregar partida `{ description, amount, kind: "SERVICE" \| "LABOR" }` | los tres (mecánico: solo suyas) |
| DELETE /api/orders/:id/services/:serviceId | Corregir una partida agregada por error (antes de ENTREGADO/CANCELADA) | los tres (mecánico: solo suyas) |

**POST /api/orders** — petición:

```json
{
  "vehicleId": 1,
  "mileageEntry": 45120,
  "reason": "Ruido al frenar",
  "notes": "Cliente reporta vibración",
  "mileageCorrection": false,
  "mechanicId": 3
}
```

- `mechanicId` es opcional (orden sin asignar). El `clientId` se deriva del vehículo; se rechazan vehículos inexistentes o inactivos (RN-2).
- El kilometraje se valida contra el último registrado del vehículo; si es menor, se responde 400 KILOMETRAJE_INVALIDO salvo que `mileageCorrection: true` (RN-4).
- Respuesta `201`: orden con `status: "RECIBIDO"`, `clientId`, `vehicleId` y `mechanicId`.

**PATCH /api/orders/:id/status** — petición `{ "status": "EN_REPARACION" }`. Respuesta `200` con la orden actualizada y `previousState` gestionado en la pausa. Errores: 400 TRANSICION_INVALIDA (mensaje que indica el estado válido al que puede avanzar), 409 ORDEN_BLOQUEADA, 403 NO_AUTORIZADO (mecánico con orden ajena o rol sin permiso para la transición).

**GET /api/orders/:id** — respuesta de detalle (forma resumida):

```json
{
  "id": 5,
  "status": "EN_REPARACION",
  "mileageEntry": 45120,
  "reason": "Ruido al frenar",
  "clientId": 1,
  "vehicle": { "id": 1, "plates": "ABC-123-A", "brand": "Nissan", "model": "Versa", "year": 2019 },
  "client": { "id": 1, "fullName": "María López Hernández", "phone": "5512345678" },
  "mechanic": { "id": 3, "username": "mecanico", "fullName": "Mecánico del Taller" },
  "entries": [
    { "id": 9, "entryType": "DIAGNOSTIC", "content": "Pastillas de freno delanteras gastadas", "createdBy": 3, "createdAt": "2026-10-11T10:00:00" }
  ],
  "services": [ { "id": 4, "kind": "SERVICE", "description": "Cambio de pastillas delanteras", "amount": 650.00 } ],
  "labor": [ { "id": 2, "kind": "LABOR", "description": "Mano de obra frenos delanteros", "amount": 400.00 } ],
  "totals": { "services": 650.00, "labor": 400.00, "grand": 1050.00 }
}
```

## Salud y sesión (heredados del Sprint 1)

- `GET /api/health`, `GET /api/me`, `POST /api/auth/login`, `POST /api/auth/change-password`, `POST /api/auth/logout`: sin cambios.
