// T019-bis: pruebas de contrato del detalle de órdenes (US3).
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

test('el detalle de la orden cumple la forma del contrato', async () => {
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
    .send({ fullName: 'Contrato Detalle', phone: '5577778888' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'cd-001-a',
      brand: 'Honda',
      model: 'Fit',
      year: 2019,
    });
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculo.body.id, mileageEntry: 20000, reason: 'Revisión general' });

  const detalle = await request(app)
    .get(`/api/orders/${creacion.body.id}`)
    .set('Authorization', `Bearer ${token}`);

  expect(detalle.status).toBe(200);
  expect(detalle.body).toMatchObject({
    id: expect.any(Number),
    status: 'RECIBIDO',
    mileageEntry: 20000,
    reason: 'Revisión general',
    clientId: cliente.body.id,
    vehicle: { id: vehiculo.body.id, plates: 'CD-001-A', brand: 'Honda', model: 'Fit', year: 2019 },
    client: { id: cliente.body.id, fullName: 'Contrato Detalle', phone: '5577778888' },
    entries: [],
    services: [],
    labor: [],
    refacciones: [],
    totals: { services: 0, labor: 0, grand: 0 },
  });
  // 005-precio-venta-refacciones (T017): el bloque totals incluye las
  // refacciones y la marca de total completo (FR-007, FR-008, CA-6).
  expect(detalle.body.totals).toMatchObject({
    parts: 0,
    totalCompleto: true,
    refaccionesSinPrecio: 0,
  });
  expect(Array.isArray(detalle.body.refacciones)).toBe(true);
  expect(JSON.stringify(detalle.body)).not.toContain('$2b$');
});
