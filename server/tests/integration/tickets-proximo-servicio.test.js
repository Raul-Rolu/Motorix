// 008-configuracion-seguridad-reportes, T043 (bloque P1, US4; FR-009, CA-14): el
// ticket nuevo muestra «Próximo servicio» (`proximoServicio`) cuando la orden
// tiene líneas de servicio con tipo e intervalo: fecha = fecha de emisión del
// ticket + el menor intervalo en días; kilometraje = kilometraje de entrada de la
// orden + el menor intervalo en km. Sin tipos el campo NO aparece, y los tickets
// anteriores al sprint (sin instantánea) no cambian: nunca lo muestran.
// Corre contra `motorix_test`.
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

/** Fecha local `YYYY-MM-DD` a N días de hoy, igual que la fecha de emisión del ticket. */
function fechaLocal(diasDesdeHoy) {
  const fecha = new Date();
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() + diasDesdeHoy);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

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
    .send({ fullName: 'Laura Próximo Servicio', phone: '5551234567' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ clientId: cliente.body.id, plates: 'prx-001-a', brand: 'Honda', model: 'Fit', year: 2017 });
  return { tokens, vehiculoId: vehiculo.body.id };
}

let consecutivo = 0;

/** Orden con un servicio sin tipo ($650) y mano de obra ($200); devuelve su id. */
async function crearOrden(token, vehiculoId, kilometraje = 78000) {
  consecutivo += 1;
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: kilometraje + consecutivo, reason: 'Próximo servicio de prueba' });
  const orderId = creacion.body.id;
  await getPool().query('INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)', [
    orderId,
    'Servicio sin tipo',
    650,
  ]);
  await getPool().query('INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)', [
    orderId,
    'Mano de obra',
    200,
  ]);
  return { orderId, kilometraje: kilometraje + consecutivo };
}

async function crearTipo(nombre, dias, km, activo = 1) {
  const [tipo] = await getPool().query(
    'INSERT INTO service_types (name, interval_days, interval_km, active) VALUES (?, ?, ?, ?)',
    [nombre, dias, km, activo]
  );
  return tipo.insertId;
}

async function agregarLineaConTipo(orderId, tipoId) {
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount, service_type_id) VALUES (?, ?, 100, ?)',
    [orderId, 'Servicio con tipo', tipoId]
  );
}

const verTicket = (token, orderId) =>
  request(app).get(`/api/tickets/${orderId}`).set('Authorization', `Bearer ${token}`);

const CLAVES_DEL_TICKET = [
  'cliente',
  'estadoPago',
  'fecha',
  'folio',
  'manoObra',
  'metodosDePago',
  'refacciones',
  'saldoPendiente',
  'servicios',
  'subtotal',
  'taller',
  'total',
  'totalCompleto',
  'vehiculo',
];

test('una orden con «Cambio de aceite» (180 días y 5,000 km) muestra fecha y kilometraje del próximo servicio', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const { orderId, kilometraje } = await crearOrden(tokens.recepcion, vehiculoId);
  await agregarLineaConTipo(orderId, await crearTipo('Cambio de aceite', 180, 5000));

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.status).toBe(200);
  expect(ticket.body.proximoServicio).toEqual({
    fecha: fechaLocal(180),
    kilometraje: kilometraje + 5000,
  });
});

test('un tipo solo con días muestra solo la fecha y uno solo con km muestra solo el kilometraje', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const soloDias = await crearOrden(tokens.recepcion, vehiculoId, 10000);
  await agregarLineaConTipo(soloDias.orderId, await crearTipo('Revisión de frenos', 90, null));
  const soloKm = await crearOrden(tokens.recepcion, vehiculoId, 20000);
  await agregarLineaConTipo(soloKm.orderId, await crearTipo('Rotación de neumáticos', null, 10000));

  const conDias = await verTicket(tokens.recepcion, soloDias.orderId);
  const conKm = await verTicket(tokens.recepcion, soloKm.orderId);

  expect(conDias.body.proximoServicio).toEqual({ fecha: fechaLocal(90), kilometraje: null });
  expect(conKm.body.proximoServicio).toEqual({ fecha: null, kilometraje: soloKm.kilometraje + 10000 });
});

test('con varios tipos muestra la fecha menor y el kilometraje menor', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const { orderId, kilometraje } = await crearOrden(tokens.recepcion, vehiculoId, 1000);
  await agregarLineaConTipo(orderId, await crearTipo('Afinación', 365, 10000));
  await agregarLineaConTipo(orderId, await crearTipo('Revisión de frenos', 90, 20000));
  await agregarLineaConTipo(orderId, await crearTipo('Rotación de neumáticos', null, 5000));

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.body.proximoServicio).toEqual({ fecha: fechaLocal(90), kilometraje: kilometraje + 5000 });
});

test('un tipo ya desactivado sigue contando (es el tipo de la línea)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const { orderId } = await crearOrden(tokens.recepcion, vehiculoId);
  await agregarLineaConTipo(orderId, await crearTipo('Cambio de aceite', 180, 5000, 0));

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.body.proximoServicio).toBeDefined();
});

test('sin líneas con tipo el campo proximoServicio NO aparece y el cuerpo conserva sus claves de siempre', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const { orderId } = await crearOrden(tokens.recepcion, vehiculoId);

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.status).toBe(200);
  expect(ticket.body).not.toHaveProperty('proximoServicio');
  expect(Object.keys(ticket.body).sort()).toEqual(CLAVES_DEL_TICKET);
});

test('un ticket anterior al sprint (sin instantánea) no muestra el próximo servicio aunque la orden tenga tipos', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const { orderId } = await crearOrden(tokens.recepcion, vehiculoId);
  await agregarLineaConTipo(orderId, await crearTipo('Cambio de aceite', 180, 5000));
  // Ticket «heredado»: se inserta sin las columnas de instantánea, como los existentes.
  await getPool().query('INSERT INTO tickets (order_id, folio) VALUES (?, ?)', [orderId, 'TCK-2026-0900']);

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.status).toBe(200);
  expect(ticket.body.folio).toBe('TCK-2026-0900');
  expect(ticket.body).not.toHaveProperty('proximoServicio');
  expect(Object.keys(ticket.body).sort()).toEqual(CLAVES_DEL_TICKET);
});

test('el resto del contenido del ticket (folio, importes y pagos) no cambia', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const { orderId } = await crearOrden(tokens.recepcion, vehiculoId);
  await agregarLineaConTipo(orderId, await crearTipo('Cambio de aceite', 180, 5000));

  const ticket = await verTicket(tokens.recepcion, orderId);

  expect(ticket.body).toMatchObject({
    folio: 'TCK-2026-0001',
    taller: { nombre: 'Motorix' },
    cliente: { nombreCompleto: 'Laura Próximo Servicio' },
    manoObra: 200,
    // Servicios 650 + 100 (la línea con tipo) + mano de obra 200.
    subtotal: 950,
    total: 950,
    metodosDePago: [],
    estadoPago: 'PENDIENTE',
    saldoPendiente: 950,
  });
  expect(ticket.body.servicios).toHaveLength(2);
});

test('la fecha base es la de emisión del ticket: no se mueve al volver a consultarlo', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const { orderId } = await crearOrden(tokens.recepcion, vehiculoId);
  await agregarLineaConTipo(orderId, await crearTipo('Cambio de aceite', 180, 5000));
  const primero = await verTicket(tokens.recepcion, orderId);

  // Se simula que el ticket se emitió hace 10 días: la fecha base es esa, no hoy.
  await getPool().query('UPDATE tickets SET issued_at = DATE_SUB(NOW(), INTERVAL 10 DAY) WHERE order_id = ?', [
    orderId,
  ]);
  const segundo = await verTicket(tokens.recepcion, orderId);

  expect(primero.body.proximoServicio.fecha).toBe(fechaLocal(180));
  expect(segundo.body.proximoServicio.fecha).toBe(fechaLocal(170));
  expect(segundo.body.folio).toBe(primero.body.folio);
});

test('si se agrega una línea con tipo después de emitir, el ticket con instantánea la refleja al consultarlo', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const { orderId } = await crearOrden(tokens.recepcion, vehiculoId);
  const antes = await verTicket(tokens.recepcion, orderId);
  expect(antes.body).not.toHaveProperty('proximoServicio');

  await agregarLineaConTipo(orderId, await crearTipo('Afinación', 365, null));
  const despues = await verTicket(tokens.recepcion, orderId);

  expect(despues.body.proximoServicio).toEqual({ fecha: fechaLocal(365), kilometraje: null });
});
