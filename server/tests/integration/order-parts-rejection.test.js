// 005-precio-venta-refacciones, T018 (US2): rechazo al agregar una
// refacción sin precio (FR-005, CA-8) y comportamiento del total con usos
// heredados sin precio y con retiro de líneas (FR-007, CA-15).
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
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'mecanico']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );
  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ fullName: 'Rechazo Cliente', phone: '5533334444' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'rej-001-a',
      brand: 'Chevrolet',
      model: 'Beat',
      year: 2020,
    });
  return { tokens, mecanicoId: mecanico.id, vehiculoId: vehiculo.body.id };
}

async function crearOrden(token, vehiculoId, mecanicoId) {
  const respuesta = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vehicleId: vehiculoId,
      mechanicId: mecanicoId,
      mileageEntry: 15000,
      reason: 'Orden para rechazo',
    });
  return respuesta.body;
}

test('agregar una refacción sin precio se rechaza con PART_SIN_PRECIO sin tocar nada (CA-8)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const altaParte = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Refacción sin precio', code: 'SIN-PREC', stock: 10 });
  expect(altaParte.body.salePrice).toBeNull();

  const orden = await crearOrden(tokens.admin, vehiculoId, mecanicoId);
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orden.id, 'Servicio base', 800]
  );

  const rechazo = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: altaParte.body.id, quantity: 2 });

  expect(rechazo.status).toBe(409);
  expect(rechazo.body.error.codigo).toBe('PART_SIN_PRECIO');

  // Sin línea en la orden, sin movimiento y sin cambio de stock ni de total.
  const [[lineas]] = await getPool().query(
    'SELECT COUNT(*) AS total FROM order_parts WHERE order_id = ?',
    [orden.id]
  );
  expect(Number(lineas.total)).toBe(0);
  const [[movimientos]] = await getPool().query(
    'SELECT COUNT(*) AS total FROM inventory_movements WHERE part_id = ? AND movement_type = ?',
    [altaParte.body.id, 'OUT']
  );
  expect(Number(movimientos.total)).toBe(0);

  const detalle = await request(app)
    .get(`/api/orders/${orden.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(detalle.body.totals).toMatchObject({
    services: 800,
    parts: 0,
    grand: 800,
    totalCompleto: true,
  });
});

test('un uso heredado sin precio deja el total incompleto sumando solo las líneas con precio (FR-008)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const conPrecio = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Refacción con precio', code: 'CON-PREC', stock: 10, salePrice: 150 });
  const orden = await crearOrden(tokens.admin, vehiculoId, mecanicoId);
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orden.id, 'Servicio base', 900]
  );

  await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: conPrecio.body.id, quantity: 1 });

  // Uso heredado sin precio (pre-migración) insertado directamente.
  await getPool().query(
    'INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES (?, ?, ?, NULL)',
    [orden.id, conPrecio.body.id, 1]
  );

  const detalle = await request(app)
    .get(`/api/orders/${orden.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);

  expect(detalle.body.totals).toMatchObject({
    services: 900,
    parts: 150, // solo la línea con precio
    grand: 1050,
    totalCompleto: false,
    refaccionesSinPrecio: 1,
  });
});

test('retirar una refacción baja el total por su importe (CA-15)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Refacción a retirar', code: 'RET-001', stock: 10, salePrice: 150 });
  const orden = await crearOrden(tokens.admin, vehiculoId, mecanicoId);
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orden.id, 'Servicio base', 1800]
  );

  const alta = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.body.id, quantity: 1 });

  const conRefaccion = await request(app)
    .get(`/api/orders/${orden.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(conRefaccion.body.totals.grand).toBe(1950);

  const retiro = await request(app)
    .delete(`/api/orders/${orden.id}/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(retiro.status).toBe(204);

  const sinRefaccion = await request(app)
    .get(`/api/orders/${orden.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(sinRefaccion.body.totals).toMatchObject({
    parts: 0,
    grand: 1800,
    totalCompleto: true,
  });
});
