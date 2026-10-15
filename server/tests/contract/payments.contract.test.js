// T012: pruebas de contrato de pagos de una orden (US1; contracts/api-rest.md).
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
    .send({ fullName: 'Cliente Contrato', phone: '5557778888' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'ctr-001-a',
      brand: 'Kia',
      model: 'Rio',
      year: 2021,
    });

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ vehicleId: vehiculo.body.id, mileageEntry: 12000, reason: 'Cobro de contrato' });
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [creacion.body.id, 'Servicio de contrato', 1500]
  );

  return { token: login.body.token, orderId: creacion.body.id };
}

test('GET /api/orders/:id/payments sigue la forma del contrato', async () => {
  const { token, orderId } = await prepararEntorno();

  const listado = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);

  expect(listado.status).toBe(200);
  expect(listado.body).toMatchObject({
    total: expect.any(Number),
    cobrado: expect.any(Number),
    saldoPendiente: expect.any(Number),
    estadoCobro: expect.any(String),
    datos: expect.any(Array),
  });
  expect(['PENDIENTE', 'PARCIAL', 'LIQUIDADA']).toContain(listado.body.estadoCobro);

  await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'TRANSFER', monto: 800 });

  const conPago = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);

  const [pago] = conPago.body.datos;
  expect(pago).toMatchObject({
    id: expect.any(Number),
    metodo: 'TRANSFER',
    monto: 800,
    estado: 'COMPLETED',
    registradoPor: {
      id: expect.any(Number),
      nombreCompleto: expect.any(String),
    },
    fecha: expect.anything(),
  });
});

test('POST /api/orders/:id/payments devuelve el pago creado en 201 (payload directo)', async () => {
  const { token, orderId } = await prepararEntorno();

  const alta = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 1500 });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({
    id: expect.any(Number),
    metodo: 'CASH',
    monto: 1500,
    estado: 'COMPLETED',
  });
  // Sin datos sensibles (Principio IV, RN-14).
  const cuerpo = JSON.stringify(alta.body);
  expect(cuerpo).not.toContain('tarjeta');
  expect(cuerpo).not.toContain('cardNumber');
});

test('los errores siguen el envoltorio { error: { codigo, mensaje } }', async () => {
  const { token } = await prepararEntorno();

  const inexistente = await request(app)
    .get('/api/orders/4242/payments')
    .set('Authorization', `Bearer ${token}`);

  expect(inexistente.status).toBe(404);
  expect(inexistente.body).toEqual({
    error: {
      codigo: expect.any(String),
      mensaje: expect.any(String),
    },
  });
});
