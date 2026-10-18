// 005-precio-venta-refacciones, T017 (US2): total de la orden con
// refacciones (FR-004, FR-006, FR-007, CA-3, CA-4, CA-5, CA-6).
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
    .send({ fullName: 'Totales Cliente', phone: '5511112222' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'tot-001-a',
      brand: 'Nissan',
      model: 'Versa',
      year: 2021,
    });
  return { tokens, mecanicoId: mecanico.id, vehiculoId: vehiculo.body.id };
}

async function crearOrden(token, vehiculoId, mecanicoId, extra = {}) {
  const respuesta = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vehicleId: vehiculoId,
      mechanicId: mecanicoId,
      mileageEntry: 40000,
      reason: 'Trabajo con refacciones',
      ...extra,
    });
  return respuesta.body;
}

async function crearParteConPrecio(token, precio, code = 'TOT-001') {
  const respuesta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Refacción ${code}`, code, stock: 10, salePrice: precio });
  return respuesta.body;
}

/** Servicios y mano de obra de prueba (preparación directa en BD). */
async function prepararPartidas(orderId, { services = 600, labor = 500 } = {}) {
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Servicio de prueba', services]
  );
  await getPool().query(
    'INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Mano de obra de prueba', labor]
  );
}

test('agregar una refacción con precio refleja unitPrice, amount y el total (CA-3, CA-6)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParteConPrecio(tokens.admin, 100);
  const orden = await crearOrden(tokens.admin, vehiculoId, mecanicoId);
  await prepararPartidas(orden.id);

  const alta = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 2 });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({
    partId: parte.id,
    quantity: 2,
    unitPrice: 100,
    amount: 200,
    stockResult: 8,
  });

  const detalle = await request(app)
    .get(`/api/orders/${orden.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);

  expect(detalle.body.totals).toMatchObject({
    services: 600,
    labor: 500,
    parts: 200,
    grand: 1300,
    totalCompleto: true,
    refaccionesSinPrecio: 0,
  });
  expect(detalle.body.refacciones[0]).toMatchObject({
    partId: parte.id,
    quantity: 2,
    unitPrice: 100,
    amount: 200,
  });
});

test('cambiar el precio no altera el total ya registrado (CA-4)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParteConPrecio(tokens.admin, 100, 'TOT-002');
  const orden = await crearOrden(tokens.admin, vehiculoId, mecanicoId);
  await prepararPartidas(orden.id);

  await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 2 });

  const cambio = await request(app)
    .put(`/api/parts/${parte.id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ salePrice: 150 });
  expect(cambio.status).toBe(200);

  const detalle = await request(app)
    .get(`/api/orders/${orden.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(detalle.body.totals.parts).toBe(200); // precio congelado
  expect(detalle.body.totals.grand).toBe(1300);
  expect(detalle.body.refacciones[0].unitPrice).toBe(100);
});

test('el mismo cambio de precio sí eleva el importe al agregar la refacción a una orden nueva (CA-5)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParteConPrecio(tokens.admin, 100, 'TOT-003');

  const ordenVieja = await crearOrden(tokens.admin, vehiculoId, mecanicoId);
  await request(app)
    .post(`/api/orders/${ordenVieja.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 2 });

  await request(app)
    .put(`/api/parts/${parte.id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ salePrice: 200 });

  const ordenNueva = await crearOrden(tokens.admin, vehiculoId, mecanicoId, {
    mileageEntry: 41000,
  });
  const altaNueva = await request(app)
    .post(`/api/orders/${ordenNueva.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 1 });

  expect(altaNueva.body).toMatchObject({ unitPrice: 200, amount: 200 });

  const detalleNueva = await request(app)
    .get(`/api/orders/${ordenNueva.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(detalleNueva.body.totals.parts).toBe(200);
  expect(detalleNueva.body.totals.grand).toBe(200); // sin partidas de servicio
});
