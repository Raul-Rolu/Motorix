// T019: pruebas de integración del detalle de órdenes (US3, FR-015).
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
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['mecanico', 'mecanico@motorix.local', hash, 'Mecánico del Taller', 'MECHANIC']
  );

  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ fullName: 'Detalle Cliente', phone: '5555556666' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'dt-001-a',
      brand: 'Toyota',
      model: 'Yaris',
      year: 2020,
    });

  return {
    token: login.body.token,
    clienteId: cliente.body.id,
    vehiculoId: vehiculo.body.id,
  };
}

test('el detalle muestra cliente, vehículo, kilometraje y estado (FR-015)', async () => {
  const { token, clienteId, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 45120, reason: 'Ruido al frenar' });

  const detalle = await request(app)
    .get(`/api/orders/${creacion.body.id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(detalle.status).toBe(200);
  expect(detalle.body.status).toBe('RECIBIDO');
  expect(detalle.body.mileageEntry).toBe(45120);
  expect(detalle.body.client).toEqual({
    id: clienteId,
    fullName: 'Detalle Cliente',
    phone: '5555556666',
  });
  expect(detalle.body.vehicle).toMatchObject({
    id: vehiculoId,
    plates: 'DT-001-A',
    brand: 'Toyota',
    model: 'Yaris',
    year: 2020,
  });
  expect(detalle.body.mechanic).toBeNull();
  expect(detalle.body.entries).toEqual([]);
  expect(detalle.body.services).toEqual([]);
  expect(detalle.body.labor).toEqual([]);
  // Forma ampliada por 005 (T020): el bloque totals incluye las refacciones.
  expect(detalle.body.totals).toEqual({
    services: 0,
    labor: 0,
    parts: 0,
    grand: 0,
    totalCompleto: true,
    refaccionesSinPrecio: 0,
  });
});

test('las partidas y entradas del detalle cuadran con los totales', async () => {
  const { token, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 100, reason: 'Mantenimiento' });
  const ordenId = creacion.body.id;

  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [ordenId, 'Cambio de aceite', 450]
  );
  await getPool().query(
    'INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)',
    [ordenId, 'Mano de obra', 300]
  );
  await getPool().query(
    "INSERT INTO order_entries (order_id, entry_type, content, created_by) VALUES (?, 'DIAGNOSTIC', ?, NULL)",
    [ordenId, 'Nivel de aceite bajo']
  );

  const detalle = await request(app)
    .get(`/api/orders/${ordenId}`)
    .set('Authorization', `Bearer ${token}`);

  expect(detalle.status).toBe(200);
  expect(detalle.body.services).toHaveLength(1);
  expect(detalle.body.labor).toHaveLength(1);
  expect(detalle.body.entries).toHaveLength(1);
  expect(detalle.body.entries[0].entryType).toBe('DIAGNOSTIC');
  expect(detalle.body.totals).toEqual({
    services: 450,
    labor: 300,
    parts: 0,
    grand: 750,
    totalCompleto: true,
    refaccionesSinPrecio: 0,
  });
});

test('una orden inexistente responde 404 ORDEN_NO_ENCONTRADA', async () => {
  const { token } = await prepararEntorno();

  const detalle = await request(app)
    .get('/api/orders/99999')
    .set('Authorization', `Bearer ${token}`);

  expect(detalle.status).toBe(404);
  expect(detalle.body.error.codigo).toBe('ORDEN_NO_ENCONTRADA');
});

test('no se pueden crear órdenes para vehículos de clientes desactivados (RN-2)', async () => {
  const { token } = await prepararEntorno();

  await getPool().query(
    "INSERT INTO clients (full_name, phone, active) VALUES ('Cliente Baja', '5500001111', 0)"
  );
  const [[cliente]] = await getPool().query(
    "SELECT id FROM clients WHERE full_name = 'Cliente Baja'"
  );
  await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.id, 'baja-001-a', 'Kia', 'Rio', 2018]
  );
  const [[vehiculo]] = await getPool().query(
    "SELECT id FROM vehicles WHERE plates = 'BAJA-001-A'"
  );

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculo.id, mileageEntry: 10, reason: 'Ruido' });

  expect(creacion.status).toBe(404);
  expect(creacion.body.error.codigo).toBe('VEHICULO_NO_DISPONIBLE');
});

test('el mecánico no puede ver el detalle de una orden ajena (RN-15)', async () => {
  const { token, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 100, reason: 'Ruido' });

  const loginMecanico = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico', contrasena: 'Usuario123' });

  const detalle = await request(app)
    .get(`/api/orders/${creacion.body.id}`)
    .set('Authorization', `Bearer ${loginMecanico.body.token}`);

  expect(detalle.status).toBe(403);
  expect(detalle.body.error.codigo).toBe('NO_AUTORIZADO');
});
