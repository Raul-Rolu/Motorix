# Modelo de Datos: Citas y Órdenes de Servicio (Sprint 2)

Extiende el esquema del Sprint 1 (`users`, `clients`, `vehicles`, `schema_migrations`).
Convenciones heredadas: InnoDB, `utf8mb4`, llaves foráneas activas, identificadores en
inglés, documentación en español, migraciones numeradas inmutables.

## appointments (cita)

| Campo | Tipo | Reglas |
|---|---|---|
| id | INT UNSIGNED PK | autoincremental |
| client_id | INT UNSIGNED | NOT NULL, FK → clients(id) |
| vehicle_id | INT UNSIGNED | NOT NULL, FK → vehicles(id); vehículo del cliente seleccionado |
| appointment_date | DATE | NOT NULL; igual o posterior a hoy al crear |
| appointment_time | TIME | NOT NULL |
| reason | VARCHAR(255) | NOT NULL, motivo de la visita |
| status | ENUM('PROGRAMADA','COMPLETADA','CANCELADA') | NOT NULL, DEFAULT 'PROGRAMADA' |
| cancellation_reason | VARCHAR(255) | NULL; obligatorio al cancelar |
| created_by | INT UNSIGNED | FK → users(id); quién registró la cita |
| created_at / updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

- **Únicidad**: UNIQUE (vehicle_id, appointment_date, appointment_time) — un vehículo no puede tener dos citas en el mismo instante (D14).
- **Índices**: idx_appointments_date (appointment_date), idx_appointments_client (client_id).
- **Transiciones**: PROGRAMADA → COMPLETADA o CANCELADA; CANCELADA y COMPLETADA son finales (D8).

## service_orders (orden de servicio)

| Campo | Tipo | Reglas |
|---|---|---|
| id | INT UNSIGNED PK | autoincremental |
| client_id | INT UNSIGNED | NOT NULL, FK → clients(id); derivado del vehículo (RN-2) |
| vehicle_id | INT UNSIGNED | NOT NULL, FK → vehicles(id); vehículo activo obligatorio |
| mechanic_id | INT UNSIGNED | NULL, FK → users(id); asignación manual (D5); solo usuarios activos con rol MECHANIC |
| status | ENUM('RECIBIDO','DIAGNOSTICO','EN_REPARACION','ESPERANDO_REFACCION','TERMINADO','ENTREGADO','CANCELADA') | NOT NULL, DEFAULT 'RECIBIDO' |
| previous_state | VARCHAR(20) | NULL; estado desde el que se entró a ESPERANDO_REFACCION (D3) |
| mileage_entry | INT UNSIGNED | NOT NULL; kilometraje de entrada (RN-3) |
| mileage_correction | TINYINT(1) | NOT NULL, DEFAULT 0; constancia de corrección explícita (RN-4, D4) |
| reason | VARCHAR(255) | NOT NULL, motivo de ingreso |
| notes | VARCHAR(255) | NULL |
| cancellation_reason | VARCHAR(255) | NULL; usado en estado CANCELADA |
| created_by | INT UNSIGNED | FK → users(id); recepción/administración que creó la orden |
| created_at / updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

- **Índices**: idx_orders_vehicle (vehicle_id), idx_orders_mechanic (mechanic_id, status), idx_orders_status (status).
- **Kilometraje previo**: último `mileage_entry` de las órdenes del vehículo (cualquier estado); la validación se hace en el servicio contra la base (D4).
- **Solo lectura**: estados ENTREGADO y CANCELADA no admiten transiciones ni ediciones (RN-9).

## order_services (servicios realizados)

| Campo | Tipo | Reglas |
|---|---|---|
| id | INT UNSIGNED PK | autoincremental |
| order_id | INT UNSIGNED | NOT NULL, FK → service_orders(id); cascade en borrado de orden (no ordinario) |
| description | VARCHAR(255) | NOT NULL |
| amount | DECIMAL(10,2) | NOT NULL, ≥ 0 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

## order_labor (mano de obra)

| Campo | Tipo | Reglas |
|---|---|---|
| id | INT UNSIGNED PK | autoincremental |
| order_id | INT UNSIGNED | NOT NULL, FK → service_orders(id) |
| description | VARCHAR(255) | NOT NULL |
| amount | DECIMAL(10,2) | NOT NULL, ≥ 0 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

## order_entries (entradas fechadas de la orden)

| Campo | Tipo | Reglas |
|---|---|---|
| id | INT UNSIGNED PK | autoincremental |
| order_id | INT UNSIGNED | NOT NULL, FK → service_orders(id) |
| entry_type | ENUM('DIAGNOSTIC','OBSERVATION','RECOMMENDATION') | NOT NULL |
| content | TEXT | NOT NULL |
| created_by | INT UNSIGNED | FK → users(id); el mecánico que registró la entrada |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP; fecha de la entrada |

- **Historial inmutable**: sin UPDATE ni DELETE de entradas (FR-011b/FR-014, Clarificación 5).
- **Índice**: idx_entries_order (order_id, created_at).

## Relaciones

- clients 1—N vehicles (Sprint 1) y clients 1—N service_orders y 1—N appointments.
- vehicles 1—N service_orders y 1—N appointments.
- users 1—N service_orders (como mechanic_id) y 1—N order_entries (autor) y 1—N appointments (created_by).
- service_orders 1—N order_services, order_labor y order_entries.

## Máquina de estados (resumen; detalle en research.md D2)

```text
RECIBIDO → DIAGNOSTICO → EN_REPARACION → TERMINADO → ENTREGADO (final)
              ↓    ↑          ↓    ↑
        ESPERANDO_REFACCION (pausa; retorno al estado de origen)
Cualquier estado previo a ENTREGADO → CANCELADA (final)
Retrocesos: TERMINADO → EN_REPARACION; EN_REPARACION → DIAGNOSTICO (mecánico dueño, recepción, admin)
Solo admin: DIAGNOSTICO → RECIBIDO y saltos de secuencia; salto a ENTREGADO
Entrega (TERMINADO → ENTREGADO): recepción y administrador
```

## Migraciones y seeds del sprint

- `005_create_appointments.sql`, `006_create_service_orders.sql`, `007_create_order_services.sql`, `008_create_order_labor.sql`, `009_create_order_entries.sql`.
- `003_demo_appointments.sql` y `004_demo_service_orders.sql`: datos idempotentes con IDs fijos y `ON DUPLICATE KEY UPDATE` sobre los vehículos de ejemplo del Sprint 1 (D13).
