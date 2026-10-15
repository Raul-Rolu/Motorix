// T031: pruebas de integración del ticket de servicio (US3, FR-011 a FR-013).
//
// El ticket se emite bajo demanda con folio único por orden (research D4) y
// su contenido se deriva al vuelo: reutiliza el folio y siempre muestra el
// estado de cobro más reciente (CA-4).
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
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción del Taller', 'RECEPTIONIST'],
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
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ fullName: 'Laura Ticket Ramos', phone: '5551234567' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({
      clientId: cliente.body.id,
      plates: 'tkt-001-a',
      brand: 'Honda',
      model: 'Fit',
      year: 2017,
    });

  return { tokens, vehiculoId: vehiculo.body.id };
}

async function crearOrdenConTotal(token, vehiculoId, { servicios = 650, labor = 200 } = {}) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 78000, reason: 'Ticket de prueba' });
  const orderId = creacion.body.id;
  if (servicios > 0) {
    await getPool().query(
      'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
      [orderId, 'Cambio de aceite', servicios]
    );
  }
  if (labor > 0) {
    await getPool().query(
      'INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)',
      [orderId, 'Mano de obra', labor]
    );
  }
  return orderId;
}

test('el primer acceso emite el ticket con folio, datos y estado de cobro (escenario 1)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(tokens.recepcion, vehiculoId);

  const ticket = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${tokens.recepcion}`);

  expect(ticket.status).toBe(200);
  expect(ticket.body.folio).toBe('TCK-2026-0001');
  expect(ticket.body).toMatchObject({
    taller: { nombre: 'Motorix' },
    cliente: { nombreCompleto: 'Laura Ticket Ramos' },
    vehiculo: {
      marca: 'Honda',
      modelo: 'Fit',
      anio: 2017,
      placas: 'TKT-001-A',
      kilometraje: 78000,
    },
    servicios: [{ nombre: 'Cambio de aceite', precio: 650 }],
    manoObra: 200,
    subtotal: 850,
    total: 850,
    metodosDePago: [],
    estadoPago: 'PENDIENTE',
    saldoPendiente: 850,
  });

  // El ticket existe como registro único de la orden (folio reutilizable).
  const [[enBase]] = await getPool().query(
    'SELECT COUNT(*) AS total FROM tickets WHERE order_id = ?',
    [orderId]
  );
  expect(Number(enBase.total)).toBe(1);
});

test('el ticket reutiliza su folio y refleja el cobro más reciente (escenarios 2 y 3)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(tokens.recepcion, vehiculoId, {
    servicios: 400,
    labor: 0,
  });

  const primero = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(primero.body.estadoPago).toBe('PENDIENTE');

  const cobro = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ metodo: 'CASH', monto: 400 });
  expect(cobro.status).toBe(201);

  const segundo = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${tokens.recepcion}`);

  // Mismo folio (nunca se duplican comprobantes) y contenido vivo (CA-4).
  expect(segundo.body.folio).toBe(primero.body.folio);
  expect(segundo.body.estadoPago).toBe('LIQUIDADA');
  expect(segundo.body.saldoPendiente).toBe(0);
  expect(segundo.body.metodosDePago).toEqual([
    { metodo: 'CASH', monto: 400, estado: 'COMPLETED' },
  ]);

  const [[enBase]] = await getPool().query(
    'SELECT COUNT(*) AS total FROM tickets WHERE order_id = ?',
    [orderId]
  );
  expect(Number(enBase.total)).toBe(1);
});

test('una orden cancelada no admite ticket y la inexistente responde 404', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(tokens.recepcion, vehiculoId);
  await getPool().query('UPDATE service_orders SET status = ? WHERE id = ?', [
    'CANCELADA',
    orderId,
  ]);

  const cancelada = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(cancelada.status).toBe(409);
  expect(cancelada.body.error.codigo).toBe('ORDER_CANCELLED');

  const inexistente = await request(app)
    .get('/api/tickets/9999')
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(inexistente.status).toBe(404);
});

test('el rol mecánico no puede emitir tickets (403, RN-15) y sin token 401', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(tokens.recepcion, vehiculoId);

  const mecanico = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(mecanico.status).toBe(403);

  const sinToken = await request(app).get(`/api/tickets/${orderId}`);
  expect(sinToken.status).toBe(401);

  // Administración sí puede emitirlo.
  const admin = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(admin.status).toBe(200);
});
