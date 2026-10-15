// T042: pruebas de integración del panel de control (US4, FR-014 a FR-016).
//
// El panel es solo lectura de ADMIN (FR-016, RN-15) y sus cifras se derivan
// al vuelo de los datos existentes (research D7); el dinero cobrado solo suma
// pagos COMPLETED (FR-007 del spec, SC-007).
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

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ fullName: 'Cliente Panel', phone: '5550001111' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({
      clientId: cliente.body.id,
      plates: 'pnl-001-a',
      brand: 'Volkswagen',
      model: 'Gol',
      year: 2016,
    });

  return {
    tokens,
    clientId: cliente.body.id,
    vehiculoId: vehiculo.body.id,
  };
}

/** Crea una orden con servicios (fija su total) y la deja en el estado indicado. */
async function crearOrden(token, vehiculoId, km, servicios, estado = 'RECIBIDO') {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: km, reason: 'Panel de control' });
  if (servicios > 0) {
    await getPool().query(
      'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
      [creacion.body.id, 'Servicio del panel', servicios]
    );
  }
  if (estado !== 'RECIBIDO') {
    await getPool().query('UPDATE service_orders SET status = ? WHERE id = ?', [
      estado,
      creacion.body.id,
    ]);
  }
  return creacion.body.id;
}

test('el panel de administración resume órdenes, citas, mantenimientos, stock y cobros', async () => {
  const { tokens, clientId, vehiculoId } = await prepararEntorno();

  // Órdenes en tres estados distintos.
  const enReparacion = await crearOrden(tokens.recepcion, vehiculoId, 30000, 1500, 'EN_REPARACION');
  await crearOrden(tokens.recepcion, vehiculoId, 30100, 800, 'RECIBIDO');
  await crearOrden(tokens.recepcion, vehiculoId, 30200, 0, 'CANCELADA');

  // Citas: dos hoy (una cancelada no cuenta), una próxima y una vencida.
  await getPool().query(
    `INSERT INTO appointments (client_id, vehicle_id, appointment_date, appointment_time, reason, status) VALUES
     (?, ?, CURDATE(), '09:00', 'Cita de la mañana', 'PROGRAMADA'),
     (?, ?, CURDATE(), '16:00', 'Cita de la tarde', 'PROGRAMADA'),
     (?, ?, CURDATE(), '18:00', 'Cita cancelada', 'CANCELADA'),
     (?, ?, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '10:00', 'Cita próxima', 'PROGRAMADA'),
     (?, ?, DATE_SUB(CURDATE(), INTERVAL 3 DAY), '11:00', 'Cita vencida', 'PROGRAMADA')`,
    [clientId, vehiculoId, clientId, vehiculoId, clientId, vehiculoId, clientId, vehiculoId, clientId, vehiculoId]
  );

  // Mantenimientos: uno pendiente vencido por fecha y uno futuro.
  await getPool().query(
    `INSERT INTO maintenance_plans (vehicle_id, description, target_date, target_mileage, status) VALUES
     (?, 'Mantenimiento vencido', DATE_SUB(CURDATE(), INTERVAL 10 DAY), NULL, 'PENDING'),
     (?, 'Mantenimiento futuro', DATE_ADD(CURDATE(), INTERVAL 60 DAY), NULL, 'PENDING')`,
    [vehiculoId, vehiculoId]
  );

  // Inventario: una refacción con stock bajo y una normal.
  await getPool().query(
    `INSERT INTO parts (name, code, stock, min_stock) VALUES
     ('Pastillas de freno', 'PAS-001', 1, 3),
     ('Filtro de aire', 'FLT-010', 10, 2)`
  );

  // Cobros: uno manual de hoy, un digital vigente y un digital viejo (expira).
  const efectivo = await request(app)
    .post(`/api/orders/${enReparacion}/payments`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ metodo: 'CASH', monto: 500 });
  expect(efectivo.status).toBe(201);

  const ordenDigital = await crearOrden(tokens.recepcion, vehiculoId, 30300, 800, 'RECIBIDO');
  const digital = await request(app)
    .post(`/api/orders/${ordenDigital}/payments/digital`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ monto: 300 });
  expect(digital.status).toBe(201);

  // Un segundo cobro digital no se admite mientras exista el vigente; el
  // viejo se crea en otra orden y se envejece a propósito (FR-009).
  const ordenVieja = await crearOrden(tokens.recepcion, vehiculoId, 30400, 900, 'RECIBIDO');
  const viejo = await request(app)
    .post(`/api/orders/${ordenVieja}/payments/digital`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ monto: 200 });
  expect(viejo.status).toBe(201);
  await getPool().query(
    'UPDATE payments SET created_at = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE id = ?',
    [viejo.body.id]
  );

  const panel = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${tokens.admin}`);

  expect(panel.status).toBe(200);
  expect(panel.body.ordenes).toMatchObject({
    RECIBIDO: 3,
    EN_REPARACION: 1,
    CANCELADA: 1,
    DIAGNOSTICO: 0,
    TERMINADO: 0,
    ENTREGADO: 0,
  });
  // La cita cancelada de hoy no cuenta; la vencida tampoco es "próxima".
  expect(panel.body.citas).toMatchObject({ hoy: 2, proximas: 1 });
  expect(panel.body.mantenimientos).toMatchObject({ vencidos: 1, proximos: 1 });
  expect(panel.body.inventario).toMatchObject({ stockBajo: 1 });
  // Solo el efectivo COMPLETED cuenta: el digital vigente y el expirado no (SC-007).
  expect(panel.body.cobros).toMatchObject({
    hoy: 500,
    total: 500,
    pendientesDigitales: 1,
  });

  // El digital viejo caducó de forma perezosa al consultar el panel (FR-009).
  const [[enBase]] = await getPool().query('SELECT status FROM payments WHERE id = ?', [
    viejo.body.id,
  ]);
  expect(enBase.status).toBe('EXPIRED');
});

test('el panel rechaza a recepción, al mecánico y a las sesiones sin token (RN-15)', async () => {
  const { tokens } = await prepararEntorno();

  const recepcion = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(recepcion.status).toBe(403);

  const mecanico = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(mecanico.status).toBe(403);

  const sinToken = await request(app).get('/api/dashboard');
  expect(sinToken.status).toBe(401);
});
