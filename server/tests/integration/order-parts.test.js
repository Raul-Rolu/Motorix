// T043: pruebas de integración de refacciones en orden (US7, RN-6/RN-7/RN-8, FR-011/FR-012).
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
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
    ['mecanico2', 'Segundo Mecánico', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico', 'mecanico2']) {
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
    .send({ fullName: 'Refacciones Cliente', phone: '5577778888' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'rf-001-a',
      brand: 'Kia',
      model: 'Rio',
      year: 2019,
    });

  return { tokens, mecanicoId: mecanico.id, vehiculoId: vehiculo.body.id };
}

async function crearOrden(token, vehiculoId, extra = {}) {
  const respuesta = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vehicleId: vehiculoId,
      mileageEntry: 70000,
      reason: 'Trabajo en curso',
      ...extra,
    });
  return respuesta.body;
}

async function crearParte(token, stock = 10) {
  const respuesta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción orden', code: `ORD-${Math.floor(Math.random() * 100000)}`, stock });
  // Preparación (005-precio-venta-refacciones): registrar un precio de
  // venta antes de usar la refacción en una orden; ninguna aserción cambia.
  await getPool().query('UPDATE parts SET sale_price = ? WHERE id = ?', [
    150.0,
    respuesta.body.id,
  ]);
  return respuesta.body;
}

async function stockDe(token, partId) {
  const listado = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${token}`);
  return listado.body.datos.find((p) => p.id === partId).stock;
}

test('agregar una refacción descuenta el stock y registra el OUT con la orden (RN-6)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParte(tokens.admin, 10);
  const orden = await crearOrden(tokens.admin, vehiculoId, { mechanicId: mecanicoId });

  const alta = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 3 });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({ partId: parte.id, quantity: 3, stockResult: 7 });
  expect(await stockDe(tokens.admin, parte.id)).toBe(7);

  const [[movimiento]] = await getPool().query(
    'SELECT movement_type, quantity, order_id FROM inventory_movements WHERE part_id = ? AND movement_type = ?',
    [parte.id, 'OUT']
  );
  expect(movimiento).toMatchObject({ quantity: 3, order_id: orden.id });
});

test('stock insuficiente se rechaza con PART_SIN_STOCK sin modificar el stock (RN-7)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParte(tokens.admin, 2);
  const orden = await crearOrden(tokens.admin, vehiculoId, { mechanicId: mecanicoId });

  const rechazo = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 5 });

  expect(rechazo.status).toBe(409);
  expect(rechazo.body.error.codigo).toBe('PART_SIN_STOCK');
  expect(rechazo.body.error.details).toMatchObject({ stockDisponible: 2 });
  expect(await stockDe(tokens.admin, parte.id)).toBe(2);

  const [[movimientos]] = await getPool().query(
    'SELECT COUNT(*) AS total FROM inventory_movements WHERE part_id = ?',
    [parte.id]
  );
  expect(Number(movimientos.total)).toBe(1); // solo el IN inicial
});

test('una orden ENTREGADO o CANCELADA rechaza refacciones con ORDER_CLOSED', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const parte = await crearParte(tokens.admin, 10);

  const entregada = await crearOrden(tokens.admin, vehiculoId);
  await getPool().query("UPDATE service_orders SET status = 'ENTREGADO' WHERE id = ?", [
    entregada.id,
  ]);
  const rechazoEntregada = await request(app)
    .post(`/api/orders/${entregada.id}/parts`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ partId: parte.id, quantity: 1 });
  expect(rechazoEntregada.status).toBe(409);
  expect(rechazoEntregada.body.error.codigo).toBe('ORDER_CLOSED');

  const cancelada = await crearOrden(tokens.admin, vehiculoId);
  await getPool().query("UPDATE service_orders SET status = 'CANCELADA' WHERE id = ?", [
    cancelada.id,
  ]);
  const rechazoCancelada = await request(app)
    .post(`/api/orders/${cancelada.id}/parts`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ partId: parte.id, quantity: 1 });
  expect(rechazoCancelada.status).toBe(409);
  expect(rechazoCancelada.body.error.codigo).toBe('ORDER_CLOSED');
});

test('una orden en pausa ESPERANDO_REFACCION sí permite agregar refacciones', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParte(tokens.admin, 10);
  const orden = await crearOrden(tokens.admin, vehiculoId, { mechanicId: mecanicoId });
  await getPool().query(
    "UPDATE service_orders SET status = 'ESPERANDO_REFACCION' WHERE id = ?",
    [orden.id]
  );

  const alta = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 2 });

  expect(alta.status).toBe(201);
});

test('un mecánico no puede usar refacciones en la orden de otro mecánico (FORBIDDEN_ORDER)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParte(tokens.admin, 10);
  const orden = await crearOrden(tokens.admin, vehiculoId, { mechanicId: mecanicoId });

  const rechazo = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico2}`)
    .send({ partId: parte.id, quantity: 1 });

  expect(rechazo.status).toBe(403);
  expect(rechazo.body.error.codigo).toBe('FORBIDDEN_ORDER');
});

test('retirar una refacción genera la devolución IN y restaura el stock (RN-8)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParte(tokens.admin, 10);
  const orden = await crearOrden(tokens.admin, vehiculoId, { mechanicId: mecanicoId });

  const alta = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 4 });

  const retiro = await request(app)
    .delete(`/api/orders/${orden.id}/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);

  expect(retiro.status).toBe(204);
  expect(await stockDe(tokens.admin, parte.id)).toBe(10);

  // El OUT original se conserva y la devolución es un IN nuevo (research D5).
  const [movimientos] = await getPool().query(
    'SELECT movement_type, quantity FROM inventory_movements WHERE part_id = ? ORDER BY id',
    [parte.id]
  );
  expect(movimientos.map((m) => m.movement_type)).toEqual(['IN', 'OUT', 'IN']);
  expect(movimientos.map((m) => m.quantity)).toEqual([10, 4, 4]);

  // La línea ya no aparece en la orden.
  const verificacion = await request(app)
    .get(`/api/orders/${orden.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(verificacion.body.refacciones).toEqual([]);
});

test('retirar una refacción que no está en la orden responde ORDER_PART_NOT_FOUND', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const orden = await crearOrden(tokens.admin, vehiculoId, { mechanicId: mecanicoId });

  const retiro = await request(app)
    .delete(`/api/orders/${orden.id}/parts/999999`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);

  expect(retiro.status).toBe(404);
  expect(retiro.body.error.codigo).toBe('ORDER_PART_NOT_FOUND');
});

test('recepción no gestiona refacciones de órdenes (solo ADMIN y el mecánico dueño)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParte(tokens.admin, 10);
  const orden = await crearOrden(tokens.admin, vehiculoId, { mechanicId: mecanicoId });

  const rechazo = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ partId: parte.id, quantity: 1 });

  expect(rechazo.status).toBe(403);
});

test('una refacción inactiva no puede agregarse a una orden (PART_INACTIVE)', async () => {
  const { tokens, mecanicoId, vehiculoId } = await prepararEntorno();
  const parte = await crearParte(tokens.admin, 10);
  await request(app)
    .put(`/api/parts/${parte.id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ isActive: false });
  const orden = await crearOrden(tokens.admin, vehiculoId, { mechanicId: mecanicoId });

  const rechazo = await request(app)
    .post(`/api/orders/${orden.id}/parts`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ partId: parte.id, quantity: 1 });

  expect(rechazo.status).toBe(409);
  expect(rechazo.body.error.codigo).toBe('PART_INACTIVE');
});
