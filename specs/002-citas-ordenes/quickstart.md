# Guía de Validación Rápida: Citas y Órdenes de Servicio (Sprint 2)

Guía de ejecución manual y automatizada para comprobar el sprint de extremo a extremo.
Los detalles de endpoints y datos están en [contracts/api-rest.md](contracts/api-rest.md)
y [data-model.md](data-model.md); los pasos de implementación, en `tasks.md`.

## Prerrequisitos

- MySQL local en ejecución con las bases `motorix` y `motorix_test` y el usuario
  dedicado `motorix_app` (pasos en `database/README.md`).
- `server/.env` completo (DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, PORT).
- Dependencias del backend instaladas (`cd server && npm install`).
- Flutter SDK disponible para el cliente (`cd client && flutter pub get`).

## Preparación

1. Aplicar migraciones y seeds (idempotentes):

   ```text
   node database/scripts/apply-migrations.mjs
   node database/scripts/apply-seeds.mjs
   ```

2. Arrancar el backend: `cd server && npm start` (esperar "API de Motorix escuchando...").
3. Arrancar el cliente: `cd client && flutter run -d windows`.
4. Ejecutar pruebas automatizadas: `cd server && npm test` y `cd client && flutter test`.

## Escenarios de validación

### V1 — Semillas visibles al arrancar (FR-017, SC-006)

1. Iniciar sesión como `recepcion` / `Recepcion123`.
2. **Verificar**: la sección Citas muestra citas de ejemplo y la sección Órdenes muestra órdenes en distintos estados; ninguna lista vacía.

### V2 — Ciclo de citas (CA-1, US1)

1. Como recepción, crear una cita con cliente y vehículo de ejemplo, fecha futura y motivo.
2. Verificar que aparece en el listado del día con estado programada.
3. Editar su hora y confirmar el cambio.
4. Cancelarla con motivo; verificar que sale de las citas pendientes y sigue consultable como cancelada.
5. Intentar cancelar una cita ya cancelada: se rechaza con mensaje claro.

### V3 — Creación de orden con kilometraje (CA-2, CA-6, US2/US3)

1. Como recepción, crear una orden para el vehículo ABC-123-A con kilometraje de entrada 45120.
2. Verificar que la orden queda en estado recibido con cliente propietario derivado correctamente.
3. Crear otra orden para el mismo vehículo con kilometraje 44000 (menor al previo): debe rechazarse con KILOMETRAJE_INVALIDO.
4. Repetir marcando corrección explícita y confirmando: la orden se crea con la constancia guardada.

### V4 — Asignación de mecánico (CA-7, US4)

1. Como recepción, asignar la orden al usuario `mecanico` y reasignarla a otro; verificar el cambio en el detalle.
2. Intentar asignarla a un usuario que no es mecánico o inactivo: se rechaza con MECANICO_INVALIDO.
3. Como mecánico, abrir Órdenes: solo aparecen las suyas; intentar abrir una orden ajena (por identificador) debe denegarse en el servidor.

### V5 — Trabajo del mecánico (CA-4, US5/US7)

1. Como `mecanico`, en su orden: agregar una entrada de diagnóstico, una observación y una recomendación; verificar que las tres quedan fechadas con autor en el detalle.
2. Registrar un servicio (descripción e importe) y una partida de mano de obra; verificar el detalle y los totales informativos.
3. Intentar borrar una entrada registrada: no existe acción de borrado (historial inmutable).

### V6 — Máquina de estados (CA-5, CA-8, US6)

1. Sobre una orden asignada, avanzar RECIBIDO → DIAGNOSTICO → EN_REPARACION → TERMINADO; cada cambio queda reflejado en listados.
2. Probar la pausa ESPERANDO_REFACCION desde EN_REPARACION y el retorno al estado anterior.
3. Intentar saltar RECIBIDO → TERMINADO como mecánico: TRANSICION_INVALIDA con mensaje del estado válido.
4. Probar los retrocesos permitidos (TERMINADO → EN_REPARACION y EN_REPARACION → DIAGNOSTICO) como mecánico.
5. Como mecánico, intentar DIAGNOSTICO → RECIBIDO: denegado; como administrador (`admin` / `Admin123`): permitido.

### V7 — Entrega y cancelación de orden (RN-9)

1. Como mecánico, intentar pasar TERMINADO → ENTREGADO: denegado (403/TRANSICION_INVALIDA).
2. Como recepción, entregar la orden; verificar que queda como historial: sin acciones de edición, transición o borrado.
3. Crear una orden y cancelarla como recepción en estado recibido; verificar que sale del trabajo activo, queda como historial y que un rol no autorizado no puede cancelar.

### V8 — Pruebas automatizadas (CA-8)

1. `cd server && npm test`: deben pasar las suites unitarias (máquina de estados y validadores), de integración (citas, órdenes, flujo de trabajo, kilometraje, permisos) y contrato contra `motorix_test`.
2. `cd client && flutter test`: deben pasar las pruebas de widget de las pantallas nuevas.
3. Verificar que ninguna prueba tocó la base principal `motorix`.

## Criterios de aceptación cubiertos

| CA | Escenario |
|----|-----------|
| CA-1 | V2 |
| CA-2 | V3 |
| CA-3 | V4 |
| CA-4 | V5 |
| CA-5 | V6 |
| CA-6 | V3 |
| CA-7 | V4, V6, V7 |
| CA-8 | V8 |
