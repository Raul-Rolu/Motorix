// T034: pruebas de integración de citas (US1, FR-001 a FR-003, CA-1).
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

function fechaFutura(dias = 3) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

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

  const loginRecepcion = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const loginMecanico = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({ fullName: 'Cita Cliente', phone: '5544445555' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'ci-001-a',
      brand: 'Chevrolet', model: 'Aveo', year: 2015,
    });

  return {
    token: loginRecepcion.body.token,
    tokenMecanico: loginMecanico.body.token,
    clienteId: cliente.body.id,
    vehiculoId: vehiculo.body.id,
  };
}

test('la recepción crea una cita PROGRAMADA (FR-001, CA-1)', async () => {
  const { token, clienteId, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoId,
      appointmentDate: fechaFutura(),
      appointmentTime: '10:30',
      reason: 'Revisión de frenos',
    });

  expect(creacion.status).toBe(201);
  expect(creacion.body.status).toBe('PROGRAMADA');
  expect(creacion.body.clientId).toBe(clienteId);
  expect(creacion.body.vehicleId).toBe(vehiculoId);

  const lista = await request(app)
    .get('/api/appointments')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.body.datos).toHaveLength(1);
  expect(lista.body.datos[0].clientName).toBe('Cita Cliente');
  expect(lista.body.datos[0].plates).toBe('CI-001-A');
});

test('rechaza una cita con fecha anterior a hoy (FR-002)', async () => {
  const { token, clienteId, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoId,
      appointmentDate: '2020-01-01',
      appointmentTime: '10:00',
      reason: 'Revisión',
    });

  expect(creacion.status).toBe(400);
  expect(creacion.body.error.codigo).toBe('DATOS_INVALIDOS');
});

test('rechaza una cita duplicada del vehículo en la misma fecha y hora (CA-1)', async () => {
  const { token, clienteId, vehiculoId } = await prepararEntorno();

  const payload = {
    clientId: clienteId,
    vehicleId: vehiculoId,
    appointmentDate: fechaFutura(),
    appointmentTime: '11:00',
    reason: 'Mantenimiento',
  };
  const primera = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  expect(primera.status).toBe(201);

  const duplicada = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  expect(duplicada.status).toBe(409);
  expect(duplicada.body.error.codigo).toBe('CITA_DUPLICADA');
});

test('el mecánico no tiene acceso a las citas (RN-15)', async () => {
  const { tokenMecanico } = await prepararEntorno();

  const lista = await request(app)
    .get('/api/appointments')
    .set('Authorization', `Bearer ${tokenMecanico}`);
  expect(lista.status).toBe(403);
  expect(lista.body.error.codigo).toBe('NO_AUTORIZADO');
});

test('editar funciona solo con citas PROGRAMADA (FR-002)', async () => {
  const { token, clienteId, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoId,
      appointmentDate: fechaFutura(),
      appointmentTime: '09:00',
      reason: 'Revisión',
    });

  const editada = await request(app)
    .put(`/api/appointments/${creacion.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoId,
      appointmentDate: fechaFutura(4),
      appointmentTime: '09:30',
      reason: 'Revisión de llantas',
    });
  expect(editada.status).toBe(200);
  expect(editada.body.reason).toBe('Revisión de llantas');

  await request(app)
    .patch(`/api/appointments/${creacion.body.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'COMPLETADA' });

  const trasCompletar = await request(app)
    .put(`/api/appointments/${creacion.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoId,
      appointmentDate: fechaFutura(5),
      appointmentTime: '10:00',
      reason: 'Intento posterior',
    });
  expect(trasCompletar.status).toBe(409);
  expect(trasCompletar.body.error.codigo).toBe('CITA_NO_MODIFICABLE');
});

test('completar y cancelar con motivo; cancelar sin motivo se rechaza (FR-003)', async () => {
  const { token, clienteId, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoId,
      appointmentDate: fechaFutura(),
      appointmentTime: '12:00',
      reason: 'Diagnóstico',
    });
  const id = creacion.body.id;

  const sinMotivo = await request(app)
    .patch(`/api/appointments/${id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'CANCELADA' });
  expect(sinMotivo.status).toBe(400);
  expect(sinMotivo.body.error.codigo).toBe('DATOS_INVALIDOS');

  const cancelada = await request(app)
    .patch(`/api/appointments/${id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'CANCELADA', cancellationReason: 'El cliente reprogramó.' });
  expect(cancelada.status).toBe(200);
  expect(cancelada.body.status).toBe('CANCELADA');
  expect(cancelada.body.cancellationReason).toBe('El cliente reprogramó.');

  const otra = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoId,
      appointmentDate: fechaFutura(2),
      appointmentTime: '15:00',
      reason: 'Cambio de aceite',
    });
  const completada = await request(app)
    .patch(`/api/appointments/${otra.body.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'COMPLETADA' });
  expect(completada.status).toBe(200);
  expect(completada.body.status).toBe('COMPLETADA');

  const sobreFinalizada = await request(app)
    .patch(`/api/appointments/${otra.body.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'CANCELADA', cancellationReason: 'Otro motivo' });
  expect(sobreFinalizada.status).toBe(409);
  expect(sobreFinalizada.body.error.codigo).toBe('CITA_NO_MODIFICABLE');
});

test('no se agenda una cita para un vehículo que no pertenezca al cliente (RN-2)', async () => {
  const { token, clienteId } = await prepararEntorno();

  const otroCliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Otro Cliente', phone: '5566667777' });
  const vehiculoAjeno = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: otroCliente.body.id,
      plates: 'aj-001-a',
      brand: 'Hyundai', model: 'i10', year: 2019,
    });

  const creacion = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoAjeno.body.id,
      appointmentDate: fechaFutura(),
      appointmentTime: '16:00',
      reason: 'Revisión',
    });

  expect(creacion.status).toBe(404);
  expect(creacion.body.error.codigo).toBe('VEHICULO_NO_DISPONIBLE');
});

test('el listado acepta los filtros de fecha y texto', async () => {
  const { token, clienteId, vehiculoId } = await prepararEntorno();
  const fecha = fechaFutura();

  await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      vehicleId: vehiculoId,
      appointmentDate: fecha,
      appointmentTime: '08:00',
      reason: 'Filtro',
    });

  const porFecha = await request(app)
    .get(`/api/appointments?fecha=${fecha}`)
    .set('Authorization', `Bearer ${token}`);
  expect(porFecha.body.datos).toHaveLength(1);

  const porTexto = await request(app)
    .get('/api/appointments?texto=Cita Cliente')
    .set('Authorization', `Bearer ${token}`);
  expect(porTexto.body.datos).toHaveLength(1);

  const sinCoincidencias = await request(app)
    .get('/api/appointments?texto=no-existe-esta-placa')
    .set('Authorization', `Bearer ${token}`);
  expect(sinCoincidencias.body.datos).toHaveLength(0);
});
