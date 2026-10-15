// T050: pruebas de integración de edición de clientes (US4).
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

async function prepararClienteConVehiculo() {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción', 'RECEPTIONIST']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ fullName: 'Cliente Con Vehículo', phone: '5599998888' });

  await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'EDIT-001-A',
      brand: 'Kia',
      model: 'Rio',
      year: 2018,
    });

  return { token: login.body.token, clienteId: cliente.body.id };
}

test('editar el teléfono del cliente conserva el dato nuevo y sus vehículos (FR-006)', async () => {
  const { token, clienteId } = await prepararClienteConVehiculo();

  const edicion = await request(app)
    .put(`/api/clients/${clienteId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Cliente Con Vehículo', phone: '5500001111' });
  expect(edicion.status).toBe(200);
  expect(edicion.body.phone).toBe('5500001111');

  const detalle = await request(app)
    .get(`/api/clients/${clienteId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(detalle.body.phone).toBe('5500001111');
  expect(detalle.body.vehiculos).toHaveLength(1);
  expect(detalle.body.vehiculos[0].plates).toBe('EDIT-001-A');
});

test('una edición con datos inválidos se rechaza y conserva el registro original', async () => {
  const { token, clienteId } = await prepararClienteConVehiculo();

  const edicion = await request(app)
    .put(`/api/clients/${clienteId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: '', phone: '' });
  expect(edicion.status).toBe(400);

  const detalle = await request(app)
    .get(`/api/clients/${clienteId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(detalle.body.fullName).toBe('Cliente Con Vehículo');
  expect(detalle.body.phone).toBe('5599998888');
});
