// T023: pruebas de integración de asignación y visibilidad (US4, FR-008/FR-009, CA-3).
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
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
    ['mecanico2', 'Segundo Mecánico', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }

  const loginRecepcion = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const loginMecanico = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico', contrasena: 'Usuario123' });
  const loginMecanico2 = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico2', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({ fullName: 'Asignación Cliente', phone: '5599990000' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'as-001-a',
      brand: 'Volkswagen',
      model: 'Gol',
      year: 2017,
    });

  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );
  const [[mecanico2]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico2'"
  );

  return {
    tokenRecepcion: loginRecepcion.body.token,
    tokenMecanico: loginMecanico.body.token,
    tokenMecanico2: loginMecanico2.body.token,
    clienteId: cliente.body.id,
    vehiculoId: vehiculo.body.id,
    mecanicoId: mecanico.id,
    mecanico2Id: mecanico2.id,
  };
}

async function crearOrden(token, vehiculoId, mileageEntry = 45120, reason = 'Ruido al frenar') {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry, reason });
  expect(creacion.status).toBe(201);
  return creacion.body.id;
}

test('la recepción asigna, reasigna y libera mecánicos (FR-009)', async () => {
  const { tokenRecepcion, vehiculoId, mecanicoId, mecanico2Id } =
    await prepararEntorno();
  const ordenId = await crearOrden(tokenRecepcion, vehiculoId);

  const asignada = await request(app)
    .patch(`/api/orders/${ordenId}/assignment`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ mechanicId: mecanicoId });
  expect(asignada.status).toBe(200);
  expect(asignada.body.mechanicId).toBe(mecanicoId);

  const reasignada = await request(app)
    .patch(`/api/orders/${ordenId}/assignment`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ mechanicId: mecanico2Id });
  expect(reasignada.status).toBe(200);
  expect(reasignada.body.mechanicId).toBe(mecanico2Id);

  const liberada = await request(app)
    .patch(`/api/orders/${ordenId}/assignment`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ mechanicId: null });
  expect(liberada.status).toBe(200);
  expect(liberada.body.mechanicId).toBeNull();
});

test('rechaza mecánicos inexistentes, inactivos o de otro rol (FR-008)', async () => {
  const { tokenRecepcion, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrden(tokenRecepcion, vehiculoId);

  const inexistente = await request(app)
    .patch(`/api/orders/${ordenId}/assignment`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ mechanicId: 99999 });
  expect(inexistente.status).toBe(400);
  expect(inexistente.body.error.codigo).toBe('MECANICO_INVALIDO');

  // La recepción no es mecánico: rol inválido.
  const [[recepcion]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'recepcion'"
  );
  const rolInvalido = await request(app)
    .patch(`/api/orders/${ordenId}/assignment`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ mechanicId: recepcion.id });
  expect(rolInvalido.status).toBe(400);
  expect(rolInvalido.body.error.codigo).toBe('MECANICO_INVALIDO');

  // Usuario inactivo con rol mecánico.
  await getPool().query('UPDATE users SET active = 0 WHERE id = ?', [mecanicoId]);
  const inactivo = await request(app)
    .patch(`/api/orders/${ordenId}/assignment`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ mechanicId: mecanicoId });
  expect(inactivo.status).toBe(400);
  expect(inactivo.body.error.codigo).toBe('MECANICO_INVALIDO');
});

test('el mecánico no puede asignar ni liberar (RN-15)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId, mecanicoId } =
    await prepararEntorno();
  const ordenId = await crearOrden(tokenRecepcion, vehiculoId);

  const intento = await request(app)
    .patch(`/api/orders/${ordenId}/assignment`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ mechanicId: mecanicoId });

  expect(intento.status).toBe(403);
  expect(intento.body.error.codigo).toBe('NO_AUTORIZADO');
});

test('la reasignación está prohibida en órdenes ENTREGADO (RN-9)', async () => {
  const { tokenRecepcion, clienteId, vehiculoId, mecanicoId } =
    await prepararEntorno();
  const [resultado] = await getPool().query(
    `INSERT INTO service_orders (client_id, vehicle_id, status, mileage_entry, reason, created_by)
     VALUES (?, ?, 'ENTREGADO', 30000, 'Orden cerrada', NULL)`,
    [clienteId, vehiculoId]
  );

  const intento = await request(app)
    .patch(`/api/orders/${resultado.insertId}/assignment`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ mechanicId: mecanicoId });

  expect(intento.status).toBe(409);
  expect(intento.body.error.codigo).toBe('ORDEN_BLOQUEADA');
});

test('el mecánico solo ve y accede a sus propias órdenes (CA-3, RN-15)', async () => {
  const { tokenRecepcion, tokenMecanico, tokenMecanico2, vehiculoId, mecanicoId, mecanico2Id } =
    await prepararEntorno();

  const orden1 = await crearOrden(tokenRecepcion, vehiculoId, 45120, 'Frenos');
  const orden2 = await crearOrden(tokenRecepcion, vehiculoId, 46000, 'Aceite');

  await request(app)
    .patch(`/api/orders/${orden1}/assignment`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ mechanicId: mecanicoId });

  const listaMecanico = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${tokenMecanico}`);
  expect(listaMecanico.body.datos).toHaveLength(1);
  expect(listaMecanico.body.datos[0].reason).toBe('Frenos');

  // El primer mecánico no puede ver la orden del segundo.
  const listaMecanico2 = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${tokenMecanico2}`);
  expect(listaMecanico2.body.datos).toHaveLength(0);

  const ajena = await request(app)
    .get(`/api/orders/${orden2}`)
    .set('Authorization', `Bearer ${tokenMecanico}`);
  expect(ajena.status).toBe(403);
  expect(ajena.body.error.codigo).toBe('NO_AUTORIZADO');

  // La recepción ve todas.
  const listaRecepcion = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`);
  expect(listaRecepcion.body.datos).toHaveLength(2);
});
