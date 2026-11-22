// 006-complemento-precios-compra, T032 y T033 (US4, FR-008, FR-009, CA-6):
// cobro digital desfasado (STALE). Un cobro Mercado Pago PENDING pasa a STALE
// cuando su importe deja de coincidir con el SALDO PENDIENTE (total menos pagos
// COMPLETED). El desfase se marca solo al listar y al verificar, nunca al crear.
// Corre contra `motorix_test` con el simulador (MP_MODE=simulated).
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
  process.env.MP_MODE = 'simulated';
});

afterEach(async () => {
  process.env.MP_MODE = 'simulated';
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

async function prepararEntorno({ servicios = 1500 } = {}) {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción del Taller', 'RECEPTIONIST']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const token = login.body.token;

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Cliente Desfase', phone: '5557776666' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'stl-001-a',
      brand: 'Mazda',
      model: 'Mazda 3',
      year: 2020,
    });
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculo.body.id, mileageEntry: 22000, reason: 'Cobro desfasado' });
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orden.body.id, 'Servicio base', servicios]
  );
  return { token, orderId: orden.body.id };
}

/** Cambia el total de la orden agregando un servicio (importe informativo). */
async function agregarServicio(orderId, importe) {
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Servicio adicional', importe]
  );
}

/** Cambia el total de la orden agregando una refacción usada con precio congelado. */
async function agregarRefaccion(orderId, precio, cantidad = 1) {
  const [parte] = await getPool().query(
    'INSERT INTO parts (name, code, stock, min_stock, sale_price) VALUES (?, ?, 10, 1, ?)',
    ['Filtro de aceite', `STL-${Date.now()}`, precio]
  );
  await getPool().query(
    'INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
    [orderId, parte.insertId, cantidad, precio]
  );
}

const cobrar = (token, orderId, monto) =>
  request(app)
    .post(`/api/orders/${orderId}/payments/digital`)
    .set('Authorization', `Bearer ${token}`)
    .send({ monto });

const pagarManual = (token, orderId, monto) =>
  request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto });

const listar = (token, orderId) =>
  request(app).get(`/api/orders/${orderId}/payments`).set('Authorization', `Bearer ${token}`);

const verificar = (token, pagoId) =>
  request(app).post(`/api/payments/${pagoId}/verify`).set('Authorization', `Bearer ${token}`);

const pagoDe = (listado, id) => listado.body.datos.find((p) => p.id === id);

describe('T032: un cobro digital se desfasa cuando cambia el saldo', () => {
  test('cambio de total por agregar una refacción: el cobro se devuelve STALE al listar', async () => {
    const { token, orderId } = await prepararEntorno();
    const cobro = await cobrar(token, orderId, 1500);
    expect(cobro.status).toBe(201);
    expect(cobro.body.estado).toBe('PENDING');

    await agregarRefaccion(orderId, 200, 2); // total 1900

    const listado = await listar(token, orderId);
    expect(listado.status).toBe(200);
    const pago = pagoDe(listado, cobro.body.id);
    expect(pago.estado).toBe('STALE');
    // El importe original nunca se modifica.
    expect(pago.monto).toBe(1500);
  });

  test('un cobro desfasado no cuenta como cobrado ni descuenta del saldo', async () => {
    const { token, orderId } = await prepararEntorno();
    const cobro = await cobrar(token, orderId, 1500);
    await agregarServicio(orderId, 300); // total 1800

    const listado = await listar(token, orderId);
    expect(pagoDe(listado, cobro.body.id).estado).toBe('STALE');
    expect(listado.body).toMatchObject({
      total: 1800,
      cobrado: 0,
      saldoPendiente: 1800,
      estadoCobro: 'PENDIENTE',
    });
  });

  test('verificar un cobro cuyo importe ya no coincide lo deja STALE sin confirmarlo', async () => {
    const { token, orderId } = await prepararEntorno();
    const cobro = await cobrar(token, orderId, 1500);
    await agregarServicio(orderId, 300);

    const verificacion = await verificar(token, cobro.body.id);
    expect(verificacion.status).toBe(200);
    expect(verificacion.body.estado).toBe('STALE');
    expect(verificacion.body.monto).toBe(1500);

    const listado = await listar(token, orderId);
    expect(listado.body.cobrado).toBe(0);
  });

  test('verificar o confirmar un cobro que ya es STALE responde 409 PAYMENT_NOT_MODIFIABLE', async () => {
    const { token, orderId } = await prepararEntorno();
    const cobro = await cobrar(token, orderId, 1500);
    await agregarServicio(orderId, 300);
    await listar(token, orderId); // marca STALE

    const respuesta = await verificar(token, cobro.body.id);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe('PAYMENT_NOT_MODIFIABLE');
    expect(respuesta.body.error.mensaje).toMatch(/desfasad/i);

    const [[fila]] = await getPool().query('SELECT status FROM payments WHERE id = ?', [
      cobro.body.id,
    ]);
    expect(fila.status).toBe('STALE');
  });

  test('con un cobro STALE se puede crear uno nuevo por el saldo (sin PAYMENT_DUPLICATE_PENDING)', async () => {
    const { token, orderId } = await prepararEntorno();
    const viejo = await cobrar(token, orderId, 1500);
    await agregarServicio(orderId, 300); // saldo 1800
    await listar(token, orderId);

    const nuevo = await cobrar(token, orderId, 1800);
    expect(nuevo.status).toBe(201);
    expect(nuevo.body.estado).toBe('PENDING');

    const confirmado = await verificar(token, nuevo.body.id);
    expect(confirmado.body.estado).toBe('COMPLETED');

    const listado = await listar(token, orderId);
    expect(pagoDe(listado, viejo.body.id).estado).toBe('STALE');
    expect(listado.body).toMatchObject({ cobrado: 1800, saldoPendiente: 0, estadoCobro: 'LIQUIDADA' });
  });

  test('con el total sin cambio el cobro permanece PENDING', async () => {
    const { token, orderId } = await prepararEntorno();
    const cobro = await cobrar(token, orderId, 1500);

    const listado = await listar(token, orderId);
    expect(pagoDe(listado, cobro.body.id).estado).toBe('PENDING');
    const otraVez = await listar(token, orderId);
    expect(pagoDe(otraVez, cobro.body.id).estado).toBe('PENDING');
  });

  test('los pagos manuales y COMPLETED nunca pasan a STALE', async () => {
    const { token, orderId } = await prepararEntorno();
    const manual = await pagarManual(token, orderId, 500);
    expect(manual.status).toBe(201);
    const digital = await cobrar(token, orderId, 1000);
    await verificar(token, digital.body.id); // COMPLETED

    await agregarServicio(orderId, 700); // cambia el total y el saldo
    const listado = await listar(token, orderId);
    expect(pagoDe(listado, manual.body.id).estado).toBe('COMPLETED');
    expect(pagoDe(listado, digital.body.id).estado).toBe('COMPLETED');
    expect(listado.body.cobrado).toBe(1500);
  });

  test('si el total vuelve a coincidir, un cobro ya STALE sigue STALE (terminal)', async () => {
    const { token, orderId } = await prepararEntorno();
    const cobro = await cobrar(token, orderId, 1500);
    await agregarServicio(orderId, 300);
    await listar(token, orderId); // STALE

    await getPool().query("DELETE FROM order_services WHERE description = 'Servicio adicional'");
    const listado = await listar(token, orderId);
    expect(listado.body.total).toBe(1500);
    expect(pagoDe(listado, cobro.body.id).estado).toBe('STALE');

    const verificacion = await verificar(token, cobro.body.id);
    expect(verificacion.status).toBe(409);
  });

  test('un cobro digital parcial creado por la API queda STALE en la siguiente consulta (D6) y crear no lo marca', async () => {
    const { token, orderId } = await prepararEntorno();
    const cobro = await cobrar(token, orderId, 500); // menor al saldo de 1500
    expect(cobro.status).toBe(201);
    expect(cobro.body.estado).toBe('PENDING');

    // Crear no marca STALE por sí mismo: el estado en base sigue PENDING.
    const [[antes]] = await getPool().query('SELECT status FROM payments WHERE id = ?', [
      cobro.body.id,
    ]);
    expect(antes.status).toBe('PENDING');

    const listado = await listar(token, orderId);
    expect(pagoDe(listado, cobro.body.id).estado).toBe('STALE');
  });

  test('el marcado ocurre una sola vez: listar varias veces no cambia nada', async () => {
    const { token, orderId } = await prepararEntorno();
    const cobro = await cobrar(token, orderId, 1500);
    await agregarServicio(orderId, 300);

    const primero = await listar(token, orderId);
    const segundo = await listar(token, orderId);
    expect(pagoDe(primero, cobro.body.id)).toEqual(pagoDe(segundo, cobro.body.id));
    const [[{ total }]] = await getPool().query(
      "SELECT COUNT(*) AS total FROM payments WHERE order_id = ? AND status = 'STALE'",
      [orderId]
    );
    expect(Number(total)).toBe(1);
  });
});

describe('T033 (E6b): el desfase se compara contra el saldo pendiente, no contra el total', () => {
  test('pago parcial previo con cobro por el saldo: NO se marca STALE y se confirma', async () => {
    const { token, orderId } = await prepararEntorno({ servicios: 2000 });
    const manual = await pagarManual(token, orderId, 800);
    expect(manual.status).toBe(201);
    const cobro = await cobrar(token, orderId, 1200); // = saldo

    const listado = await listar(token, orderId);
    expect(pagoDe(listado, cobro.body.id).estado).toBe('PENDING');

    const verificacion = await verificar(token, cobro.body.id);
    expect(verificacion.status).toBe(200);
    expect(verificacion.body.estado).toBe('COMPLETED');

    const final = await listar(token, orderId);
    expect(final.body).toMatchObject({ cobrado: 2000, saldoPendiente: 0, estadoCobro: 'LIQUIDADA' });
  });

  test('caso contrario: otro pago manual de $100 desfasa el cobro de $1,200', async () => {
    const { token, orderId } = await prepararEntorno({ servicios: 2000 });
    await pagarManual(token, orderId, 800);
    const cobro = await cobrar(token, orderId, 1200);

    const otro = await pagarManual(token, orderId, 100); // saldo 1100
    expect(otro.status).toBe(201);

    const listado = await listar(token, orderId);
    expect(pagoDe(listado, cobro.body.id).estado).toBe('STALE');
    expect(listado.body).toMatchObject({ cobrado: 900, saldoPendiente: 1100 });

    const verificacion = await verificar(token, cobro.body.id);
    expect(verificacion.status).toBe(409);
    expect(verificacion.body.error.codigo).toBe('PAYMENT_NOT_MODIFIABLE');
  });
});
