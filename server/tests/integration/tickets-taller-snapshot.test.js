// 008-configuracion-seguridad-reportes, T017 (bloque P1, US1; FR-002, FR-003,
// FR-005, CA-1, CA-3): el ticket guarda una instantánea de los datos del taller
// al emitirse. Los tickets con instantánea no cambian al editar la configuración;
// los anteriores al sprint (sin instantánea) usan los datos vigentes; sin
// configuración guardada se usan los valores de respaldo (los de la constante
// `TALLER` de antes). Corre contra `motorix_test`.
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
  for (const [username, rol] of [
    ['admin', 'ADMIN'],
    ['recepcion', 'RECEPTIONIST'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, `Usuario ${username}`, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ fullName: 'Laura Instantánea Ramos', phone: '5551234567' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ clientId: cliente.body.id, plates: 'snp-001-a', brand: 'Honda', model: 'Fit', year: 2017 });
  return { tokens, vehiculoId: vehiculo.body.id };
}

/** Crea una orden con un servicio de $650 y mano de obra de $200 (total completo). */
async function crearOrden(token, vehiculoId, kilometraje = 78000) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: kilometraje, reason: 'Instantánea de prueba' });
  const orderId = creacion.body.id;
  await getPool().query('INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)', [
    orderId,
    'Cambio de aceite',
    650,
  ]);
  await getPool().query('INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)', [
    orderId,
    'Mano de obra',
    200,
  ]);
  return orderId;
}

const verTicket = (token, orderId) =>
  request(app).get(`/api/tickets/${orderId}`).set('Authorization', `Bearer ${token}`);

const configurarTaller = (token, taller) =>
  request(app).put('/api/settings').set('Authorization', `Bearer ${token}`).send({ taller });

const NUEVO_TALLER = {
  nombre: 'Taller El Pistón',
  direccion: 'Calle Real 45, Col. Norte',
  telefono: '555-123-4567',
};

test('el ticket nuevo guarda y muestra los datos vigentes del taller (CA-1)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  await configurarTaller(tokens.admin, NUEVO_TALLER);
  const orderId = await crearOrden(tokens.recepcion, vehiculoId);

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.status).toBe(200);
  expect(ticket.body.taller).toEqual(NUEVO_TALLER);
  const [[fila]] = await getPool().query(
    'SELECT shop_name, shop_address, shop_phone FROM tickets WHERE order_id = ?',
    [orderId]
  );
  expect(fila).toEqual({
    shop_name: NUEVO_TALLER.nombre,
    shop_address: NUEVO_TALLER.direccion,
    shop_phone: NUEVO_TALLER.telefono,
  });
});

test('cambiar la configuración después NO cambia un ticket ya emitido con instantánea (CA-1)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  await configurarTaller(tokens.admin, NUEVO_TALLER);
  const orderId = await crearOrden(tokens.recepcion, vehiculoId);
  const primero = await verTicket(tokens.recepcion, orderId);

  await configurarTaller(tokens.admin, { nombre: 'Otro Nombre', telefono: '555-999-9999' });
  const segundo = await verTicket(tokens.recepcion, orderId);

  expect(segundo.body.taller).toEqual(NUEVO_TALLER);
  expect(segundo.body.folio).toBe(primero.body.folio);
});

test('un ticket emitido después del cambio usa los datos nuevos mientras el anterior conserva los suyos', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const ordenA = await crearOrden(tokens.recepcion, vehiculoId, 78000);
  const ticketA = await verTicket(tokens.recepcion, ordenA);
  expect(ticketA.body.taller.nombre).toBe('Motorix');

  await configurarTaller(tokens.admin, NUEVO_TALLER);
  const ordenB = await crearOrden(tokens.recepcion, vehiculoId, 79000);
  const ticketB = await verTicket(tokens.recepcion, ordenB);

  expect(ticketB.body.taller).toEqual(NUEVO_TALLER);
  expect((await verTicket(tokens.recepcion, ordenA)).body.taller.nombre).toBe('Motorix');
});

test('un ticket anterior al sprint (sin instantánea) muestra los datos vigentes', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(tokens.recepcion, vehiculoId);
  // Ticket «heredado»: se inserta sin las columnas de instantánea, como los existentes.
  await getPool().query('INSERT INTO tickets (order_id, folio) VALUES (?, ?)', [orderId, 'TCK-2026-0900']);

  await configurarTaller(tokens.admin, NUEVO_TALLER);
  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.status).toBe(200);
  expect(ticket.body.folio).toBe('TCK-2026-0900');
  expect(ticket.body.taller).toEqual(NUEVO_TALLER);
  // Consultarlo no le agrega instantánea: sigue sin ella.
  const [[fila]] = await getPool().query('SELECT shop_name FROM tickets WHERE order_id = ?', [orderId]);
  expect(fila.shop_name).toBeNull();
});

test('sin configuración guardada el ticket usa los valores de respaldo de antes (CA-3)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(tokens.recepcion, vehiculoId);

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.body.taller).toEqual({
    nombre: 'Motorix',
    direccion: 'Av. Taller 123, Col. Centro',
    telefono: '555-000-0000',
  });
  const [[fila]] = await getPool().query('SELECT shop_name FROM tickets WHERE order_id = ?', [orderId]);
  expect(fila.shop_name).toBe('Motorix');
});

test('el resto del contenido del ticket no cambia (folio, importes y pagos)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(tokens.recepcion, vehiculoId);

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.body).toMatchObject({
    folio: 'TCK-2026-0001',
    cliente: { nombreCompleto: 'Laura Instantánea Ramos' },
    servicios: [{ nombre: 'Cambio de aceite', precio: 650 }],
    manoObra: 200,
    total: 850,
    estadoPago: 'PENDIENTE',
  });
});
