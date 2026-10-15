// T012: pruebas de integración de creación y listado de órdenes (US2, RN-2/RN-3/RN-4).
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
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción', 'RECEPTIONIST']
  );
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['mecanico', 'mecanico@motorix.local', hash, 'Mecánico del Taller', 'MECHANIC']
  );
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['mecanico2', 'mecanico2@motorix.local', hash, 'Segundo Mecánico', 'MECHANIC']
  );

  const loginRecepcion = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const loginMecanico = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({ fullName: 'Propietario Sprint 2', phone: '5511112222' });

  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 's2-001-a',
      brand: 'Nissan',
      model: 'Versa',
      year: 2019,
    });

  return {
    tokenRecepcion: loginRecepcion.body.token,
    tokenMecanico: loginMecanico.body.token,
    clienteId: cliente.body.id,
    vehiculoId: vehiculo.body.id,
  };
}

test('la recepción crea una orden en RECIBIDO con el cliente derivado (RN-2, CA-2)', async () => {
  const { tokenRecepcion, vehiculoId, clienteId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({
      vehicleId: vehiculoId,
      mileageEntry: 45120,
      reason: 'Ruido al frenar',
      notes: 'Vibración a alta velocidad',
    });

  expect(creacion.status).toBe(201);
  expect(creacion.body.status).toBe('RECIBIDO');
  expect(creacion.body.clientId).toBe(clienteId);
  expect(creacion.body.vehicleId).toBe(vehiculoId);
  expect(creacion.body.mechanicId).toBeNull();
  expect(creacion.body.mileageEntry).toBe(45120);

  const lista = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`);
  expect(lista.status).toBe(200);
  expect(lista.body.datos).toHaveLength(1);
  expect(lista.body.datos[0].clientName).toBe('Propietario Sprint 2');
  expect(lista.body.datos[0].plates).toBe('S2-001-A');
});

test('el mecánico no puede crear órdenes (RN-15)', async () => {
  const { tokenMecanico, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 100, reason: 'Ruido' });

  expect(creacion.status).toBe(403);
  expect(creacion.body).toEqual({
    error: { codigo: 'NO_AUTORIZADO', mensaje: expect.any(String) },
  });
});

test('rechaza un vehículo inexistente con VEHICULO_NO_DISPONIBLE (RN-2)', async () => {
  const { tokenRecepcion } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ vehicleId: 99999, mileageEntry: 100, reason: 'Ruido' });

  expect(creacion.status).toBe(404);
  expect(creacion.body.error.codigo).toBe('VEHICULO_NO_DISPONIBLE');
});

test('rechaza el kilometraje menor al previo sin corrección (RN-4)', async () => {
  const { tokenRecepcion, vehiculoId } = await prepararEntorno();

  const primera = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 45120, reason: 'Ruido al frenar' });
  expect(primera.status).toBe(201);

  const segunda = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 40000, reason: 'Revisión menor' });
  expect(segunda.status).toBe(400);
  expect(segunda.body.error.codigo).toBe('KILOMETRAJE_INVALIDO');
});

test('acepta el kilometraje menor con corrección explícita y la constancia (RN-4)', async () => {
  const { tokenRecepcion, vehiculoId } = await prepararEntorno();

  await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 45120, reason: 'Ruido al frenar' });

  const corregida = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({
      vehicleId: vehiculoId,
      mileageEntry: 40000,
      reason: 'El odómetro fue reparado',
      mileageCorrection: true,
    });
  expect(corregida.status).toBe(201);
  expect(corregida.body.mileageCorrection).toBe(true);
});

test('el mecánico solo ve en el listado las órdenes que le pertenecen (CA-3)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId, clienteId } =
    await prepararEntorno();

  // Orden sin asignar creada por la recepción.
  const libre = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 45120, reason: 'Ruido al frenar' });

  // Orden asignada al mecánico, insertada directamente con su asignación.
  await getPool().query(
    'INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason, created_by) SELECT ?, ?, id, \'RECIBIDO\', ?, ?, id FROM users WHERE username = ?',
    [clienteId, vehiculoId, 46000, 'Frenos', 'mecanico']
  );

  const listaMecanico = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${tokenMecanico}`);
  expect(listaMecanico.status).toBe(200);
  expect(listaMecanico.body.datos).toHaveLength(1);
  expect(listaMecanico.body.datos[0].id).not.toBe(libre.body.id);
  expect(listaMecanico.body.datos[0].reason).toBe('Frenos');

  const listaRecepcion = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`);
  expect(listaRecepcion.body.datos).toHaveLength(2);
});

test('el listado acepta filtro de estado y texto', async () => {
  const { tokenRecepcion, vehiculoId } = await prepararEntorno();

  await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 45120, reason: 'Ruido al frenar' });

  const porEstado = await request(app)
    .get('/api/orders?estado=RECIBIDO')
    .set('Authorization', `Bearer ${tokenRecepcion}`);
  expect(porEstado.body.datos).toHaveLength(1);

  const sinCoincidencias = await request(app)
    .get('/api/orders?texto=no-existe-placa')
    .set('Authorization', `Bearer ${tokenRecepcion}`);
  expect(sinCoincidencias.body.datos).toHaveLength(0);
});
