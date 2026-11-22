// 005-precio-venta-refacciones, T024 (US3): pagos con total que incluye
// refacciones (FR-009, FR-012, CA-10, CA-12) y bloqueo TOTAL_INCOMPLETO solo
// en órdenes no liquidadas (FR-016, CA-21).
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
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['admin', 'Administrador', 'ADMIN'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ fullName: 'Pagos Cliente', phone: '5566667777' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'pag-001-a',
      brand: 'Toyota',
      model: 'Corolla',
      year: 2019,
    });
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ vehicleId: vehiculo.body.id, mileageEntry: 30000, reason: 'Cobro con refacciones' });
  return { token: login.body.token, orderId: orden.body.id };
}

/** Prepara la orden: partidas de servicio y un uso de refacción directo. */
async function prepararOrden(orderId, { services = 1000, labor = 0 } = {}) {
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Servicio de prueba', services]
  );
  if (labor > 0) {
    await getPool().query(
      'INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)',
      [orderId, 'Mano de obra de prueba', labor]
    );
  }
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

test('el resumen de pagos suma las refacciones y el saldo parte del total completo (CA-12)', async () => {
  const { token, orderId } = await prepararEntorno();
  await prepararOrden(orderId, { services: 1000, labor: 200 });
  const partId = await crearParte(150, 'PAG-001');
  await usoDeOrden(orderId, partId, { quantity: 2, unitPrice: 150 });

  const resumen = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(resumen.status).toBe(200);
  expect(resumen.body).toMatchObject({
    total: 1500, // 1000 + 200 + 2 × 150
    cobrado: 0,
    saldoPendiente: 1500,
    estadoCobro: 'PENDIENTE',
    totalCompleto: true,
    refaccionesSinPrecio: 0,
  });

  const parcial = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 900 });
  expect(parcial.status).toBe(201);

  const conPago = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(conPago.body).toMatchObject({
    total: 1500,
    cobrado: 900,
    saldoPendiente: 600,
    estadoCobro: 'PARCIAL',
  });

  const liquidacion = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 600 });
  expect(liquidacion.status).toBe(201);

  const liquidada = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(liquidada.body).toMatchObject({
    cobrado: 1500,
    saldoPendiente: 0,
    estadoCobro: 'LIQUIDADA',
  });
});

test('un pago en orden con total incompleto se rechaza con TOTAL_INCOMPLETO antes que PAYMENT_EXCEEDS_BALANCE (CA-10)', async () => {
  const { token, orderId } = await prepararEntorno();
  await prepararOrden(orderId, { services: 1000 });
  const partId = await crearParte(null, 'PAG-002');
  await usoDeOrden(orderId, partId, { quantity: 1, unitPrice: null });

  // Monto que excedería cualquier saldo: prevalece el bloqueo del total incompleto.
  const rechazo = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 5000 });

  expect(rechazo.status).toBe(409);
  expect(rechazo.body.error.codigo).toBe('TOTAL_INCOMPLETO');
  expect(rechazo.body.error.details.refaccionesSinPrecio).toHaveLength(1);
  expect(rechazo.body.error.details.refaccionesSinPrecio[0]).toMatchObject({
    partId,
    nombre: expect.any(String),
  });

  const [pagos] = await getPool().query(
    'SELECT COUNT(*) AS total FROM payments WHERE order_id = ?',
    [orderId]
  );
  expect(Number(pagos[0].total)).toBe(0);

  // El resumen sigue siendo informativo (CA-12): total y saldo disponibles.
  const resumen = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(resumen.body).toMatchObject({
    total: 1000,
    saldoPendiente: 1000,
    totalCompleto: false,
    refaccionesSinPrecio: 1,
  });
});

test('el cobro digital también se bloquea con TOTAL_INCOMPLETO sin crear el cobro (CA-10)', async () => {
  const { token, orderId } = await prepararEntorno();
  await prepararOrden(orderId, { services: 1000 });
  const partId = await crearParte(null, 'PAG-003');
  await usoDeOrden(orderId, partId, { quantity: 1, unitPrice: null });

  const rechazo = await request(app)
    .post(`/api/orders/${orderId}/payments/digital`)
    .set('Authorization', `Bearer ${token}`)
    .send({ monto: 500 });

  expect(rechazo.status).toBe(409);
  expect(rechazo.body.error.codigo).toBe('TOTAL_INCOMPLETO');

  const [pagos] = await getPool().query(
    'SELECT COUNT(*) AS total FROM payments WHERE order_id = ?',
    [orderId]
  );
  expect(Number(pagos[0].total)).toBe(0);
});

test('una orden liquidada con usos sin precio conserva su total histórico y deja ver el resumen (FR-016)', async () => {
  const { token, orderId } = await prepararEntorno();
  await prepararOrden(orderId, { services: 1000 });
  const partId = await crearParte(100, 'PAG-004');
  await usoDeOrden(orderId, partId, { quantity: 1, unitPrice: 100 });

  // Liquidación del total previo (1100) y después aparece un uso sin precio.
  const liquidacion = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 1100 });
  expect(liquidacion.status).toBe(201);
  await usoDeOrden(orderId, partId, { quantity: 1, unitPrice: null });

  const resumen = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(resumen.status).toBe(200);
  expect(resumen.body).toMatchObject({
    total: 1100, // histórico: el uso sin precio nunca sumó
    cobrado: 1100,
    saldoPendiente: 0,
    estadoCobro: 'LIQUIDADA',
    totalCompleto: false,
    refaccionesSinPrecio: 1,
  });

  // El bloqueo TOTAL_INCOMPLETO NO aplica a órdenes ya liquidadas (FR-016):
  // un nuevo pago cae en su validación de saldo normal.
  const nuevoPago = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 1 });
  expect(nuevoPago.status).toBe(409);
  expect(nuevoPago.body.error.codigo).not.toBe('TOTAL_INCOMPLETO');
  expect(nuevoPago.body.error.codigo).toBe('PAYMENT_EXCEEDS_BALANCE');
});
