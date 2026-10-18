// 005-precio-venta-refacciones, T019 (US2): adopción de precio al asignar
// salePrice (FR-011, CA-11, CA-19; research D4, Clarifications AMB-01).
//
// La adopción solo alcanza usos sin precio de órdenes ABiertas NO liquidadas
// (evaluadas contra el total previo, sin los usos que van a adoptarse); las
// órdenes ya pagadas o cerradas quedan intactas.
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
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'admin', contrasena: 'Usuario123' });
  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ fullName: 'Adopción Cliente', phone: '5555556666' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'ado-001-a',
      brand: 'Mazda',
      model: '2',
      year: 2022,
    });
  return { token: login.body.token, vehiculoId: vehiculo.body.id };
}

async function crearOrden(token, vehiculoId) {
  const respuesta = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vehicleId: vehiculoId,
      mileageEntry: 10000,
      reason: 'Orden de adopción',
    });
  return respuesta.body;
}

/** Uso heredado sin precio + partidas de servicio (preparación directa). */
async function prepararUsoSinPrecio(orderId, partId, { services = 1000, quantity = 1 } = {}) {
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Servicio de adopción', services]
  );
  await getPool().query(
    'INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES (?, ?, ?, NULL)',
    [orderId, partId, quantity]
  );
}

async function pago(orderId, amount, token) {
  const respuesta = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: amount });
  return respuesta;
}

test('una orden abierta parcialmente pagada adopta el precio y ajusta el saldo (CA-11)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const parte = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción de adopción', code: 'ADO-001', stock: 10 });
  const orden = await crearOrden(token, vehiculoId);
  await prepararUsoSinPrecio(orden.id, parte.body.id, { services: 1000 });

  // Pago parcial: 800 de un total previo de 1000 (sin el uso sin precio).
  const pagoParcial = await pago(orden.id, 800, token);
  expect(pagoParcial.status).toBe(201);

  const asignacion = await request(app)
    .put(`/api/parts/${parte.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ salePrice: 150 });
  expect(asignacion.status).toBe(200);

  const [[uso]] = await getPool().query(
    'SELECT unit_price FROM order_parts WHERE order_id = ? AND part_id = ?',
    [orden.id, parte.body.id]
  );
  expect(Number(uso.unit_price)).toBe(150);

  // Los pagos se conservan y el saldo pendiente se ajusta al nuevo total.
  const detalle = await request(app)
    .get(`/api/orders/${orden.id}`)
    .set('Authorization', `Bearer ${token}`);
  expect(detalle.body.totals).toMatchObject({
    services: 1000,
    parts: 150,
    grand: 1150,
    totalCompleto: true,
  });
});

test('una orden ya pagada por completo no adopta el precio (total previo, AMB-01)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const parte = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción pagada', code: 'ADO-002', stock: 10 });
  const orden = await crearOrden(token, vehiculoId);
  await prepararUsoSinPrecio(orden.id, parte.body.id, { services: 500 });

  // Pago igual al total previo (500): la orden queda liquidada.
  const pagoTotal = await pago(orden.id, 500, token);
  expect(pagoTotal.status).toBe(201);

  await request(app)
    .put(`/api/parts/${parte.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ salePrice: 200 });

  const [[uso]] = await getPool().query(
    'SELECT unit_price FROM order_parts WHERE order_id = ? AND part_id = ?',
    [orden.id, parte.body.id]
  );
  expect(uso.unit_price).toBeNull();
});

test('una orden entregada o cancelada no adopta el precio', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const parte = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción cerrada', code: 'ADO-003', stock: 10 });

  const entregada = await crearOrden(token, vehiculoId);
  await prepararUsoSinPrecio(entregada.id, parte.body.id, { services: 700 });
  await getPool().query("UPDATE service_orders SET status = 'ENTREGADO' WHERE id = ?", [
    entregada.id,
  ]);

  const cancelada = await crearOrden(token, vehiculoId);
  await getPool().query(
    'UPDATE service_orders SET vehicle_id = ?, mileage_entry = ?, status = ? WHERE id = ?',
    [vehiculoId, 12000, 'CANCELADA', cancelada.id]
  );
  await prepararUsoSinPrecio(cancelada.id, parte.body.id, { services: 300 });

  await request(app)
    .put(`/api/parts/${parte.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ salePrice: 90 });

  const [usos] = await getPool().query(
    'SELECT order_id, unit_price FROM order_parts WHERE part_id = ? ORDER BY order_id',
    [parte.body.id]
  );
  expect(usos).toHaveLength(2);
  for (const uso of usos) {
    expect(uso.unit_price).toBeNull();
  }
});
