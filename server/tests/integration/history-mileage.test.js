// T013: pruebas de integración del kilometraje en el historial (US2, FR-003, RN-3/RN-4).
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

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción', 'RECEPTIONIST']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const token = login.body.token;

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Kilometraje Cliente', phone: '5544445555' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'km-001-a',
      brand: 'Toyota',
      model: 'Yaris',
      year: 2021,
    });

  return { token, vehiculoId: vehiculo.body.id };
}

test('cada servicio del historial muestra el kilometraje registrado en su momento', async () => {
  const entorno = await prepararEntorno();

  const primera = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${entorno.token}`)
    .send({ vehicleId: entorno.vehiculoId, mileageEntry: 60000, reason: 'Servicio uno' });
  await getPool().query("UPDATE service_orders SET status = 'TERMINADO' WHERE id = ?", [
    primera.body.id,
  ]);
  const segunda = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${entorno.token}`)
    .send({ vehicleId: entorno.vehiculoId, mileageEntry: 70000, reason: 'Servicio dos' });
  await getPool().query("UPDATE service_orders SET status = 'ENTREGADO' WHERE id = ?", [
    segunda.body.id,
  ]);

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history?order=asc`)
    .set('Authorization', `Bearer ${entorno.token}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.historial[0]).toMatchObject({
    orderId: primera.body.id,
    kilometraje: 60000,
    correccionKilometraje: false,
  });
  expect(respuesta.body.historial[1]).toMatchObject({
    orderId: segunda.body.id,
    kilometraje: 70000,
  });
  // El kilometraje actual del vehículo es el último registrado (RN-3).
  expect(respuesta.body.vehiculo.kilometrajeActual).toBe(70000);
});

test('el historial conserva la constancia de la corrección explícita de kilometraje', async () => {
  const entorno = await prepararEntorno();

  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${entorno.token}`)
    .send({
      vehicleId: entorno.vehiculoId,
      mileageEntry: 30000,
      reason: 'Corrección de odómetro',
      mileageCorrection: true,
    });
  await getPool().query("UPDATE service_orders SET status = 'TERMINADO' WHERE id = ?", [
    orden.body.id,
  ]);

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history`)
    .set('Authorization', `Bearer ${entorno.token}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.historial[0]).toMatchObject({
    orderId: orden.body.id,
    kilometraje: 30000,
    correccionKilometraje: true,
  });
});

test('dos servicios del mismo vehículo permiten comparar sus kilometrajes en orden', async () => {
  const entorno = await prepararEntorno();

  for (const kilometraje of [50000, 55000, 58000]) {
    const orden = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${entorno.token}`)
      .send({ vehicleId: entorno.vehiculoId, mileageEntry: kilometraje, reason: 'Revisión' });
    await getPool().query("UPDATE service_orders SET status = 'TERMINADO' WHERE id = ?", [
      orden.body.id,
    ]);
  }

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history?order=asc`)
    .set('Authorization', `Bearer ${entorno.token}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.historial.map((s) => s.kilometraje)).toEqual([
    50000, 55000, 58000,
  ]);
});
