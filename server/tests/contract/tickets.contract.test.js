// T032: pruebas de contrato del ticket de servicio (US3; contracts/api-rest.md).
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
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción del Taller', 'RECEPTIONIST']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ fullName: 'Contrato Cliente', phone: '5558889999' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'ctk-001-a',
      brand: 'Ford',
      model: 'Fiesta',
      year: 2015,
    });

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ vehicleId: vehiculo.body.id, mileageEntry: 95000, reason: 'Contrato de ticket' });
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [creacion.body.id, 'Servicio de contrato', 300]
  );
  // 005-precio-venta-refacciones (T026): uso con precio para validar el
  // desglose de refacciones del contrato (CA-13).
  const [parte] = await getPool().query(
    'INSERT INTO parts (name, code, stock, sale_price) VALUES (?, ?, ?, ?)',
    ['Refacción de contrato', 'CTK-001', 5, 100]
  );
  await getPool().query(
    'INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
    [creacion.body.id, parte.insertId, 1, 100]
  );

  return { token: login.body.token, orderId: creacion.body.id, partId: parte.insertId };
}

test('GET /api/tickets/:orderId sigue la forma del contrato', async () => {
  const { token, orderId } = await prepararEntorno();

  const ticket = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${token}`);

  expect(ticket.status).toBe(200);
  expect(ticket.body).toMatchObject({
    folio: expect.stringMatching(/^TCK-\d{4}-\d{4}$/),
    fecha: expect.anything(),
    taller: {
      nombre: expect.any(String),
      direccion: expect.any(String),
      telefono: expect.any(String),
    },
    cliente: {
      id: expect.any(Number),
      nombreCompleto: expect.any(String),
    },
    vehiculo: {
      id: expect.any(Number),
      marca: expect.any(String),
      modelo: expect.any(String),
      anio: expect.any(Number),
      placas: expect.any(String),
      kilometraje: expect.any(Number),
    },
    servicios: expect.any(Array),
    manoObra: expect.any(Number),
    subtotal: expect.any(Number),
    total: expect.any(Number),
    // 005-precio-venta-refacciones (T026): marca de total completo (FR-010).
    totalCompleto: true,
    metodosDePago: expect.any(Array),
    estadoPago: expect.any(String),
    saldoPendiente: expect.any(Number),
  });

  // 005-precio-venta-refacciones (T026): desglose de refacciones con precio
  // e importe por línea (CA-13).
  expect(ticket.body.refacciones).toHaveLength(1);
  expect(ticket.body.refacciones[0]).toMatchObject({
    nombre: expect.any(String),
    codigo: 'CTK-001',
    cantidad: 1,
    unitPrice: 100,
    amount: 100,
    sinPrecio: false,
  });

  expect(['PENDIENTE', 'PARCIAL', 'LIQUIDADA']).toContain(ticket.body.estadoPago);
  // Total con la refacción incluida: 300 de servicio + 100 de refacción (CA-14).
  expect(ticket.body.total).toBe(400);
});

test('los errores del ticket siguen el envoltorio centralizado', async () => {
  const { token } = await prepararEntorno();

  const inexistente = await request(app)
    .get('/api/tickets/4343')
    .set('Authorization', `Bearer ${token}`);

  expect(inexistente.status).toBe(404);
  expect(inexistente.body).toEqual({
    error: {
      codigo: expect.any(String),
      mensaje: expect.any(String),
    },
  });
});
