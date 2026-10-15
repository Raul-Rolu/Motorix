// T017: pruebas de integración de mantenimientos (US3, FR-004 a FR-006, CA-2).
import request from 'supertest';
import bcrypt from 'bcrypt';
import { crearApp } from '../../app.js';
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

const app = crearApp();

beforeAll(async () => {
  await prepararBaseDePruebas();
});

afterEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

/** Fecha futura fiable para las altas de prueba. */
function fechaFutura(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  // Fecha local (no UTC): la API exige que no sea anterior a hoy local.
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }

  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ fullName: 'Mantenimiento Cliente', phone: '5566667777' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'mt-001-a',
      brand: 'Honda',
      model: 'Civic',
      year: 2020,
    });

  return { tokens, vehiculoId: vehiculo.body.id };
}

test('el mecánico registra un mantenimiento con ambos umbrales', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const respuesta = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({
      vehicleId: vehiculoId,
      descripcion: 'Cambio de aceite y filtro',
      targetDate: fechaFutura(60),
      targetMileage: 95000,
    });

  expect(respuesta.status).toBe(201);
  expect(respuesta.body).toMatchObject({
    vehicleId: vehiculoId,
    description: 'Cambio de aceite y filtro',
    status: 'PENDING',
  });
});

test('el registro acepta un solo umbral (solo fecha o solo kilometraje)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const soloFecha = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Revisión anual', targetDate: fechaFutura(30) });
  expect(soloFecha.status).toBe(201);

  const soloKilometraje = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Cambio de balatas', targetMileage: 100000 });
  expect(soloKilometraje.status).toBe(201);
});

test('el registro sin ningún umbral responde MAINTENANCE_INVALID_THRESHOLD (422)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const respuesta = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Sin umbrales' });

  expect(respuesta.status).toBe(422);
  expect(respuesta.body.error.codigo).toBe('MAINTENANCE_INVALID_THRESHOLD');
});

test('un vehículo admite varios mantenimientos pendientes simultáneos', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  for (const descripcion of ['Aceite', 'Frenos', 'Correa de distribución']) {
    const respuesta = await request(app)
      .post('/api/maintenances')
      .set('Authorization', `Bearer ${tokens.mecanico}`)
      .send({ vehicleId: vehiculoId, descripcion, targetMileage: 99000 });
    expect(respuesta.status).toBe(201);
  }

  const listado = await request(app)
    .get('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(listado.status).toBe(200);
  expect(listado.body.datos).toHaveLength(3);
});

test('un mantenimiento se completa manualmente y deja de estar PENDING', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Aceite', targetMileage: 90000 });

  const completado = await request(app)
    .patch(`/api/maintenances/${alta.body.id}/complete`)
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(completado.status).toBe(200);
  expect(completado.body.status).toBe('COMPLETED');
  expect(completado.body.completedAt).toBeTruthy();

  // Cumplido manualmente: no admite nuevas acciones.
  const repetir = await request(app)
    .patch(`/api/maintenances/${alta.body.id}/complete`)
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(repetir.status).toBe(409);
  expect(repetir.body.error.codigo).toBe('MAINTENANCE_NOT_MODIFIABLE');
});

test('entregar una orden del vehículo NO completa automáticamente los mantenimientos (Q1)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Aceite', targetMileage: 90000 });

  // Orden completa del ciclo hasta ENTREGADO.
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 88000, reason: 'Mantenimiento completo' });
  await request(app)
    .patch(`/api/orders/${orden.body.id}/status`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ status: 'DIAGNOSTICO' });
  await request(app)
    .patch(`/api/orders/${orden.body.id}/status`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ status: 'EN_REPARACION' });
  await request(app)
    .patch(`/api/orders/${orden.body.id}/status`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ status: 'TERMINADO' });
  await request(app)
    .patch(`/api/orders/${orden.body.id}/status`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ status: 'ENTREGADO' });

  const verificacion = await request(app)
    .get(`/api/maintenances?vehicleId=${vehiculoId}`)
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(verificacion.status).toBe(200);
  const mant = verificacion.body.datos.find((m) => m.id === alta.body.id);
  expect(mant.status).toBe('PENDING'); // cumplimiento solo manual
});

test('la cancelación es exclusiva de administración y exige motivo', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Revisión', targetDate: fechaFutura(15) });

  // Sin motivo: rechazo de validación.
  const sinMotivo = await request(app)
    .patch(`/api/maintenances/${alta.body.id}/cancel`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({});
  expect(sinMotivo.status).toBe(400);

  // Recepción no puede cancelar.
  const recepcionIntenta = await request(app)
    .patch(`/api/maintenances/${alta.body.id}/cancel`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ reason: 'No aplica' });
  expect(recepcionIntenta.status).toBe(403);

  // Administración cancela con motivo.
  const adminCancela = await request(app)
    .patch(`/api/maintenances/${alta.body.id}/cancel`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ reason: 'El cliente vendió el vehículo' });
  expect(adminCancela.status).toBe(200);
  expect(adminCancela.body.status).toBe('CANCELLED');
  expect(adminCancela.body.cancellationReason).toBe('El cliente vendió el vehículo');
});

test('un mantenimiento inexistente responde MAINTENANCE_NOT_FOUND (404)', async () => {
  const { tokens } = await prepararEntorno();

  const respuesta = await request(app)
    .patch('/api/maintenances/999999/complete')
    .set('Authorization', `Bearer ${tokens.admin}`);

  expect(respuesta.status).toBe(404);
  expect(respuesta.body.error.codigo).toBe('MAINTENANCE_NOT_FOUND');
});

test('el registro de mantenimientos restringe el rol en el servidor (RN-15)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const recepcionIntenta = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ vehicleId: vehiculoId, descripcion: 'No debería', targetDate: fechaFutura(10) });
  expect(recepcionIntenta.status).toBe(403);
});
