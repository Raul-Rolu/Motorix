// T005: pruebas de integración del historial de servicios (US1, FR-001/FR-002, CA-1, SC-002).
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

async function crearOrden(vehiculoId, mileageEntry, reason, estado, token) {
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry, reason });
  await getPool().query('UPDATE service_orders SET status = ? WHERE id = ?', [
    estado,
    orden.body.id,
  ]);
  return orden.body.id;
}

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  for (const [username, nombre, rol] of [
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const loginRecepcion = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const loginMecanico = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({ fullName: 'Historial Integración', phone: '5533334444' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'hi-001-a',
      brand: 'Nissan',
      model: 'Versa',
      year: 2019,
    });

  return {
    token: loginRecepcion.body.token,
    tokenMecanico: loginMecanico.body.token,
    vehiculoId: vehiculo.body.id,
  };
}

test('el historial lista solo terminadas y entregadas en orden cronológico', async () => {
  const entorno = await prepararEntorno();

  const idTerminada = await crearOrden(
    entorno.vehiculoId, 80000, 'Aceite y filtros', 'TERMINADO', entorno.token
  );
  const idEntregada = await crearOrden(
    entorno.vehiculoId, 82000, 'Cambio de balatas', 'ENTREGADO', entorno.token
  );
  await crearOrden(
    entorno.vehiculoId, 83000, 'Ruido al frenar', 'RECIBIDO', entorno.token
  );

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history`)
    .set('Authorization', `Bearer ${entorno.token}`);

  expect(respuesta.status).toBe(200);
  const ids = respuesta.body.historial.map((s) => s.orderId);
  expect(ids).toContain(idTerminada);
  expect(ids).toContain(idEntregada);
  expect(ids).toHaveLength(2); // RN-10: sin duplicados ni órdenes en curso

  // Orden cronológico descendente por defecto: la más reciente primero.
  expect(respuesta.body.historial[0].orderId).toBe(idEntregada);
  expect(respuesta.body.historial[0].kilometraje).toBe(82000);
});

test('el parámetro orden=asc invierte el orden del historial', async () => {
  const entorno = await prepararEntorno();
  await crearOrden(entorno.vehiculoId, 80000, 'Primero', 'TERMINADO', entorno.token);
  await crearOrden(entorno.vehiculoId, 82000, 'Segundo', 'TERMINADO', entorno.token);

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history?order=asc`)
    .set('Authorization', `Bearer ${entorno.token}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.historial[0].kilometraje).toBe(80000);
  expect(respuesta.body.historial[1].kilometraje).toBe(82000);
});

test('un vehículo sin órdenes terminadas devuelve historial vacío sin error', async () => {
  const entorno = await prepararEntorno();
  await crearOrden(entorno.vehiculoId, 50000, 'Solo en curso', 'RECIBIDO', entorno.token);

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history`)
    .set('Authorization', `Bearer ${entorno.token}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.historial).toEqual([]);
  expect(respuesta.body.vehiculo.kilometrajeActual).toBe(50000);
});

test('un vehículo inexistente responde VEHICULO_NO_DISPONIBLE (404)', async () => {
  const entorno = await prepararEntorno();

  const respuesta = await request(app)
    .get('/api/vehicles/999999/history')
    .set('Authorization', `Bearer ${entorno.token}`);

  expect(respuesta.status).toBe(404);
  expect(respuesta.body.error.codigo).toBe('VEHICULO_NO_DISPONIBLE');
});

test('el historial está disponible para los tres roles del taller', async () => {
  const entorno = await prepararEntorno();
  await crearOrden(entorno.vehiculoId, 61000, 'Servicio de taller', 'TERMINADO', entorno.token);

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history`)
    .set('Authorization', `Bearer ${entorno.tokenMecanico}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.historial).toHaveLength(1);
});

test('sin token el historial responde NO_AUTENTICADO', async () => {
  const entorno = await prepararEntorno();

  const respuesta = await request(app).get(
    `/api/vehicles/${entorno.vehiculoId}/history`
  );

  expect(respuesta.status).toBe(401);
});
