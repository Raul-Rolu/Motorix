// T063: pruebas de integración de la asociación cliente↔vehículo (US6).
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

async function prepararEscenario() {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción', 'RECEPTIONIST']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const token = login.body.token;

  const clienteA = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Cliente A', phone: '5511110000' });
  const clienteB = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Cliente B', phone: '5522220000' });

  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({ clientId: clienteA.body.id, plates: 'ASOC-001-A', brand: 'Ford', model: 'Fiesta', year: 2016 });

  return {
    token,
    clienteAId: clienteA.body.id,
    clienteBId: clienteB.body.id,
    vehiculoId: vehiculo.body.id,
  };
}

test('la ficha del cliente muestra sus vehículos (FR-007)', async () => {
  const { token, clienteAId } = await prepararEscenario();

  const detalle = await request(app)
    .get(`/api/clients/${clienteAId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(detalle.status).toBe(200);
  expect(detalle.body.fullName).toBe('Cliente A');
  expect(detalle.body.vehiculos).toHaveLength(1);
  expect(detalle.body.vehiculos[0]).toMatchObject({ plates: 'ASOC-001-A', brand: 'Ford' });
});

test('el vehículo muestra a su propietario y la reasociación actualiza ambos lados', async () => {
  const { token, clienteAId, clienteBId, vehiculoId } = await prepararEscenario();

  // El detalle del vehículo muestra al dueño.
  const antes = await request(app)
    .get(`/api/vehicles/${vehiculoId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(antes.body.duenio.fullName).toBe('Cliente A');

  // Reasociar al cliente B (FR-009, escenario 2 de la US6).
  const reasignacion = await request(app)
    .put(`/api/vehicles/${vehiculoId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteBId,
      plates: 'ASOC-001-A',
      brand: 'Ford',
      model: 'Fiesta',
      year: 2016,
    });
  expect(reasignacion.status).toBe(200);
  expect(reasignacion.body.clientId).toBe(clienteBId);

  // El cliente A ya no tiene vehículos; el cliente B ahora lo tiene.
  const clienteA = await request(app)
    .get(`/api/clients/${clienteAId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(clienteA.body.vehiculos).toHaveLength(0);

  const clienteB = await request(app)
    .get(`/api/clients/${clienteBId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(clienteB.body.vehiculos).toHaveLength(1);
  expect(clienteB.body.vehiculos[0].plates).toBe('ASOC-001-A');
});

test('la reasociación rechaza un propietario inexistente o inactivo', async () => {
  const { token, vehiculoId } = await prepararEscenario();

  const respuesta = await request(app)
    .put(`/api/vehicles/${vehiculoId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ clientId: 999999, plates: 'ASOC-001-A', brand: 'Ford', model: 'Fiesta', year: 2016 });
  expect(respuesta.status).toBe(404);
  expect(respuesta.body.error.codigo).toBe('CLIENTE_NO_ENCONTRADO');
});

test('un cliente desactivado no aparece en la consulta de clientes activos (FR-015)', async () => {
  const { token, clienteBId } = await prepararEscenario();

  await request(app)
    .patch(`/api/clients/${clienteBId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ active: false });

  const lista = await request(app)
    .get('/api/clients')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.body.datos.some((c) => c.id === clienteBId)).toBe(false);

  // Pero su ficha sigue consultable (historial conservado).
  const detalle = await request(app)
    .get(`/api/clients/${clienteBId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(detalle.status).toBe(200);
  expect(detalle.body.active).toBe(false);
});
