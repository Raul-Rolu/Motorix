// 006-complemento-precios-compra, T017 (US2): límites de precios (999,999.99)
// y de total de orden (99,999,999.99) (FR-003, CA-2). Corre contra
// `motorix_test`.
//
// Nota: el contrato habla de `POST .../services` y `POST .../labor`, pero el
// sistema expone una sola ruta (`POST /api/orders/:id/services`) y distingue
// servicio o mano de obra con `kind` (SERVICE | LABOR).
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
    ['admin', 'admin@motorix.local', hash, 'Administrador', 'ADMIN']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'admin', contrasena: 'Usuario123' });
  const token = login.body.token;
  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Cliente de Límites', phone: '5511112222' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'lim-001-a',
      brand: 'Nissan',
      model: 'Versa',
      year: 2021,
    });
  return { token, vehiculoId: vehiculo.body.id };
}

/** Orden en DIAGNOSTICO (estado desde el que se registran partidas). */
async function crearOrden(token, vehiculoId) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 40000, reason: 'Prueba de límites' });
  await getPool().query("UPDATE service_orders SET status = 'DIAGNOSTICO' WHERE id = ?", [
    creacion.body.id,
  ]);
  return creacion.body.id;
}

/** Deja la orden con total 99,999,999.00 (a 0.99 del tope). */
async function llenarOrdenCasiAlTope(orderId) {
  // 100 × 999,999.99 = 99,999,999.00; faltan 0.99 para el tope.
  for (let i = 0; i < 100; i += 1) {
    await getPool().query(
      'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
      [orderId, `Servicio de relleno ${i}`, 999999.99]
    );
  }
}

function agregarPartida(token, orderId, cuerpo) {
  return request(app)
    .post(`/api/orders/${orderId}/services`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'Partida de prueba', kind: 'SERVICE', ...cuerpo });
}

async function totalesDe(token, orderId) {
  const detalle = await request(app)
    .get(`/api/orders/${orderId}`)
    .set('Authorization', `Bearer ${token}`);
  return detalle.body.totals;
}

function crearParte(token, cuerpo) {
  return request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción de límites', code: 'LIM-001', stock: 10, ...cuerpo });
}

test('el precio de venta y el de compra rechazan negativos, no numéricos y 3 decimales (CA-2)', async () => {
  const { token } = await prepararEntorno();

  for (const campo of ['salePrice', 'purchasePrice']) {
    for (const [i, valor] of [-1, 'abc', 10.123].entries()) {
      const respuesta = await crearParte(token, { code: `LIM-${campo}-${i}`, [campo]: valor });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    }
  }
  const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM parts');
  expect(Number(total)).toBe(0);
});

test('un precio de 999,999.99 se acepta y de 1,000,000.00 se rechaza en venta y compra (CA-2)', async () => {
  const { token } = await prepararEntorno();

  const valida = await crearParte(token, {
    code: 'LIM-OK',
    salePrice: 999999.99,
    purchasePrice: 999999.99,
  });
  expect(valida.status).toBe(201);
  expect(valida.body.salePrice).toBe(999999.99);
  expect(valida.body.purchasePrice).toBe(999999.99);

  for (const campo of ['salePrice', 'purchasePrice']) {
    const alta = await crearParte(token, { code: `LIM-${campo}`, [campo]: 1000000 });
    expect(alta.status).toBe(400);
    expect(alta.body.error.codigo).toBe('DATOS_INVALIDOS');

    const edicion = await request(app)
      .put(`/api/parts/${valida.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ [campo]: 1000000 });
    expect(edicion.status).toBe(400);
  }
  const [[fila]] = await getPool().query('SELECT sale_price FROM parts WHERE id = ?', [
    valida.body.id,
  ]);
  expect(Number(fila.sale_price)).toBe(999999.99);
});

test('el importe de una partida rechaza inválidos y más de 999,999.99 (CA-2)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(token, vehiculoId);

  for (const kind of ['SERVICE', 'LABOR']) {
    for (const monto of [-1, 'abc', 10.123, 1000000]) {
      const respuesta = await agregarPartida(token, orderId, { kind, amount: monto });
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    }
    const valida = await agregarPartida(token, orderId, { kind, amount: 999999.99 });
    expect(valida.status).toBe(201);
  }
});

test('un total de 99,999,999.99 se acepta y uno mayor responde 422 sin cambiar la orden (CA-2)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(token, vehiculoId);
  await llenarOrdenCasiAlTope(orderId);
  expect((await totalesDe(token, orderId)).grand).toBe(99999999);

  // Exactamente en el tope: se acepta.
  const enElTope = await agregarPartida(token, orderId, { kind: 'LABOR', amount: 0.99 });
  expect(enElTope.status).toBe(201);
  expect((await totalesDe(token, orderId)).grand).toBe(99999999.99);

  // Un centavo más: se rechaza y la orden queda igual.
  const rebasa = await agregarPartida(token, orderId, { kind: 'SERVICE', amount: 0.01 });
  expect(rebasa.status).toBe(422);
  expect(rebasa.body.error.codigo).toBe('ORDER_TOTAL_LIMIT_EXCEEDED');
  expect((await totalesDe(token, orderId)).grand).toBe(99999999.99);
  const [[{ total }]] = await getPool().query(
    'SELECT COUNT(*) AS total FROM order_services WHERE order_id = ?',
    [orderId]
  );
  expect(Number(total)).toBe(100);
});

test('agregar una refacción que rebasa el total responde 422 sin tocar stock ni orden (CA-2)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(token, vehiculoId);
  await llenarOrdenCasiAlTope(orderId);

  const cara = await crearParte(token, { code: 'LIM-CARA', salePrice: 1 });
  const rechazada = await request(app)
    .post(`/api/orders/${orderId}/parts`)
    .set('Authorization', `Bearer ${token}`)
    .send({ partId: cara.body.id, quantity: 1 });
  expect(rechazada.status).toBe(422);
  expect(rechazada.body.error.codigo).toBe('ORDER_TOTAL_LIMIT_EXCEEDED');

  const [[parte]] = await getPool().query('SELECT stock FROM parts WHERE id = ?', [cara.body.id]);
  expect(Number(parte.stock)).toBe(10);
  const [[{ lineas }]] = await getPool().query(
    'SELECT COUNT(*) AS lineas FROM order_parts WHERE order_id = ?',
    [orderId]
  );
  expect(Number(lineas)).toBe(0);
  const [[{ salidas }]] = await getPool().query(
    "SELECT COUNT(*) AS salidas FROM inventory_movements WHERE movement_type = 'OUT'"
  );
  expect(Number(salidas)).toBe(0);

  // Una refacción que deja el total exactamente en 99,999,999.99 se acepta.
  const justa = await crearParte(token, { code: 'LIM-JUSTA', salePrice: 0.99 });
  const aceptada = await request(app)
    .post(`/api/orders/${orderId}/parts`)
    .set('Authorization', `Bearer ${token}`)
    .send({ partId: justa.body.id, quantity: 1 });
  expect(aceptada.status).toBe(201);
  expect((await totalesDe(token, orderId)).grand).toBe(99999999.99);
});

test('dos líneas idénticas de servicio o mano de obra pueden coexistir, sin 409 (decisión H-14)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(token, vehiculoId);

  for (const kind of ['SERVICE', 'LABOR']) {
    const primera = await agregarPartida(token, orderId, {
      kind,
      description: 'Misma descripción',
      amount: 450,
    });
    const segunda = await agregarPartida(token, orderId, {
      kind,
      description: 'Misma descripción',
      amount: 450,
    });
    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body.id).not.toBe(primera.body.id);
  }
  expect((await totalesDe(token, orderId)).grand).toBe(1800);
});
