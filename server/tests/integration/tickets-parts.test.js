// 005-precio-venta-refacciones, T025 (US3): ticket con desglose de
// refacciones (FR-010, FR-013, FR-014, CA-13, CA-14), bloqueo
// TOTAL_INCOMPLETO en órdenes no liquidadas (CA-10) y emisión sin bloqueo en
// órdenes ya liquidadas con líneas marcadas `sinPrecio` (FR-016, CA-21).
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
  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ fullName: 'Ticket Cliente', phone: '5588889999' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'tpr-001-a',
      brand: 'Hyundai',
      model: 'Accent',
      year: 2018,
    });
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ vehicleId: vehiculo.body.id, mileageEntry: 60000, reason: 'Ticket con refacciones' });
  return { token: login.body.token, orderId: orden.body.id };
}

async function prepararOrden(orderId, { services = 1000 } = {}) {
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Servicio del ticket', services]
  );
}

async function crearParte(salePrice, code) {
  const [resultado] = await getPool().query(
    'INSERT INTO parts (name, code, stock, sale_price) VALUES (?, ?, ?, ?)',
    [`Refacción ${code}`, code, 10, salePrice]
  );
  return resultado.insertId;
}

async function usoDeOrden(orderId, partId, { quantity = 1, unitPrice = null } = {}) {
  const [resultado] = await getPool().query(
    'INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
    [orderId, partId, quantity, unitPrice]
  );
  return resultado.insertId;
}

test('el ticket desglosea las refacciones con precio e importe y su total es idéntico al de la orden (CA-13, CA-14)', async () => {
  const { token, orderId } = await prepararEntorno();
  await prepararOrden(orderId, { services: 1000 });
  const partId = await crearParte(150, 'TKP-001');
  await usoDeOrden(orderId, partId, { quantity: 2, unitPrice: 150 });

  const ticket = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${token}`);

  expect(ticket.status).toBe(200);
  expect(ticket.body.totalCompleto).toBe(true);
  expect(ticket.body.refacciones).toHaveLength(1);
  expect(ticket.body.refacciones[0]).toMatchObject({
    nombre: expect.stringContaining('TKP-001'),
    codigo: 'TKP-001',
    cantidad: 2,
    unitPrice: 150,
    amount: 300,
  });
  expect(ticket.body.refacciones[0].sinPrecio).toBeFalsy();

  // Total idéntico al de la orden (CA-14).
  const detalle = await request(app)
    .get(`/api/orders/${orderId}`)
    .set('Authorization', `Bearer ${token}`);
  expect(ticket.body.total).toBe(1300);
  expect(ticket.body.total).toBe(detalle.body.totals.grand);
});

test('una orden no liquidada con uso sin precio no emite ticket: TOTAL_INCOMPLETO con la lista de refacciones (CA-10)', async () => {
  const { token, orderId } = await prepararEntorno();
  await prepararOrden(orderId, { services: 1000 });
  const partId = await crearParte(null, 'TKP-002');
  await usoDeOrden(orderId, partId, { quantity: 1, unitPrice: null });

  const rechazo = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${token}`);

  expect(rechazo.status).toBe(409);
  expect(rechazo.body.error.codigo).toBe('TOTAL_INCOMPLETO');
  expect(rechazo.body.error.details.refaccionesSinPrecio).toHaveLength(1);
  expect(rechazo.body.error.details.refaccionesSinPrecio[0]).toMatchObject({
    orderPartId: expect.any(Number),
    partId,
    nombre: expect.any(String),
  });

  // La emisión se omitió: no se creó ningún ticket.
  const [tickets] = await getPool().query(
    'SELECT COUNT(*) AS total FROM tickets WHERE order_id = ?',
    [orderId]
  );
  expect(Number(tickets[0].total)).toBe(0);
});

test('una orden liquidada emite el ticket con total histórico y las líneas sin precio marcadas (FR-016, CA-21)', async () => {
  const { token, orderId } = await prepararEntorno();
  await prepararOrden(orderId, { services: 1000 });
  const partId = await crearParte(100, 'TKP-003');
  await usoDeOrden(orderId, partId, { quantity: 1, unitPrice: 100 });

  const liquidacion = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 1100 });
  expect(liquidacion.status).toBe(201);
  await usoDeOrden(orderId, partId, { quantity: 1, unitPrice: null });

  const ticket = await request(app)
    .get(`/api/tickets/${orderId}`)
    .set('Authorization', `Bearer ${token}`);

  expect(ticket.status).toBe(200);
  expect(ticket.body.estadoPago).toBe('LIQUIDADA');
  expect(ticket.body.totalCompleto).toBe(false);
  // Total histórico: servicios + mano de obra + usos con precio (CA-14).
  expect(ticket.body.total).toBe(1100);

  expect(ticket.body.refacciones).toHaveLength(2);
  const [conPrecio, sinPrecio] = ticket.body.refacciones;
  expect(conPrecio).toMatchObject({ cantidad: 1, unitPrice: 100, amount: 100 });
  expect(conPrecio.sinPrecio).toBeFalsy();
  expect(sinPrecio).toMatchObject({
    cantidad: 1,
    unitPrice: null,
    amount: null,
    sinPrecio: true,
  });
});
