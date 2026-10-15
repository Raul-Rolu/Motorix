// T050: pruebas de integración de estados de órdenes (US6, FR-012, CA-5).
// Recorren la secuencia completa, la pausa con retorno, los retrocesos,
// los saltos solo-administrador, la entrega y la cancelación.
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
    .send({ fullName: 'Estados Cliente', phone: '5577889900' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({
      clientId: cliente.body.id,
      plates: 'es-001-a',
      brand: 'Kia', model: 'Sportage', year: 2020,
    });
  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );

  return {
    tokens,
    vehiculoId: vehiculo.body.id,
    mecanicoId: mecanico.id,
  };
}

async function crearOrdenAsignada({ token, vehiculoId, mecanicoId }) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vehicleId: vehiculoId,
      mileageEntry: 45120,
      reason: 'Estados',
      mechanicId: mecanicoId,
    });
  expect(creacion.status).toBe(201);
  return creacion.body.id;
}

function transicionar(token, ordenId, status, cuerpoExtra = {}) {
  return request(app)
    .patch(`/api/orders/${ordenId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status, ...cuerpoExtra });
}

test('la secuencia completa RECIBIDO a ENTREGADO funciona (CA-5)', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });

  for (const estado of ['DIAGNOSTICO', 'EN_REPARACION', 'TERMINADO']) {
    const respuesta = await transicionar(tokens.mecanico, ordenId, estado);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.status).toBe(estado);
  }

  const entregada = await transicionar(tokens.recepcion, ordenId, 'ENTREGADO');
  expect(entregada.status).toBe(200);
  expect(entregada.body.status).toBe('ENTREGADO');
});

test('la pausa ESPERANDO_REFACCION regresa al estado de origen', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();

  // Pausa desde DIAGNOSTICO.
  const orden1 = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  await transicionar(tokens.mecanico, orden1, 'DIAGNOSTICO');
  const pausa1 = await transicionar(tokens.mecanico, orden1, 'ESPERANDO_REFACCION');
  expect(pausa1.status).toBe(200);
  expect(pausa1.body.status).toBe('ESPERANDO_REFACCION');
  expect(pausa1.body.previousState).toBe('DIAGNOSTICO');

  const reanudada1 = await transicionar(tokens.mecanico, orden1, 'DIAGNOSTICO');
  expect(reanudada1.status).toBe(200);
  expect(reanudada1.body.status).toBe('DIAGNOSTICO');
  expect(reanudada1.body.previousState).toBeNull();

  // Pausa desde EN_REPARACION y retorno allí.
  const orden2 = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  await transicionar(tokens.mecanico, orden2, 'DIAGNOSTICO');
  await transicionar(tokens.mecanico, orden2, 'EN_REPARACION');
  const pausa2 = await transicionar(tokens.mecanico, orden2, 'ESPERANDO_REFACCION');
  expect(pausa2.body.previousState).toBe('EN_REPARACION');

  // Desde la pausa no se puede saltar a TERMINADO.
  const salto = await transicionar(tokens.mecanico, orden2, 'TERMINADO');
  expect(salto.status).toBe(400);
  expect(salto.body.error.codigo).toBe('TRANSICION_INVALIDA');

  // La reanudación regresa al estado desde el que se pausó.
  const retorno = await transicionar(tokens.mecanico, orden2, 'EN_REPARACION');
  expect(retorno.status).toBe(200);
  expect(retorno.body.status).toBe('EN_REPARACION');
});

test('los retrocesos permitidos funcionan para el mecánico dueño', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  await transicionar(tokens.mecanico, ordenId, 'DIAGNOSTICO');
  await transicionar(tokens.mecanico, ordenId, 'EN_REPARACION');
  await transicionar(tokens.mecanico, ordenId, 'TERMINADO');

  const retroceso1 = await transicionar(tokens.mecanico, ordenId, 'EN_REPARACION');
  expect(retroceso1.status).toBe(200);

  const retroceso2 = await transicionar(tokens.mecanico, ordenId, 'DIAGNOSTICO');
  expect(retroceso2.status).toBe(200);
});

test('los saltos de secuencia son solo del administrador', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();

  const ordenMecanico = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  const saltoMecanico = await transicionar(tokens.mecanico, ordenMecanico, 'TERMINADO');
  expect(saltoMecanico.status).toBe(400);
  expect(saltoMecanico.body.error.codigo).toBe('TRANSICION_INVALIDA');

  const ordenRecepcion = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  const saltoRecepcion = await transicionar(tokens.recepcion, ordenRecepcion, 'TERMINADO');
  expect(saltoRecepcion.status).toBe(400);

  const ordenAdmin = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  const saltoAdmin = await transicionar(tokens.admin, ordenAdmin, 'TERMINADO');
  expect(saltoAdmin.status).toBe(200);
  expect(saltoAdmin.body.status).toBe('TERMINADO');
});

test('DIAGNOSTICO a RECIBIDO solo lo hace el administrador', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  await transicionar(tokens.mecanico, ordenId, 'DIAGNOSTICO');

  const recepcion = await transicionar(tokens.recepcion, ordenId, 'RECIBIDO');
  expect(recepcion.status).toBe(400);
  expect(recepcion.body.error.codigo).toBe('TRANSICION_INVALIDA');

  const admin = await transicionar(tokens.admin, ordenId, 'RECIBIDO');
  expect(admin.status).toBe(200);
  expect(admin.body.status).toBe('RECIBIDO');
});

test('la entrega es de recepción/administración, nunca del mecánico', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  await transicionar(tokens.mecanico, ordenId, 'DIAGNOSTICO');
  await transicionar(tokens.mecanico, ordenId, 'EN_REPARACION');
  await transicionar(tokens.mecanico, ordenId, 'TERMINADO');

  const mecanico = await transicionar(tokens.mecanico, ordenId, 'ENTREGADO');
  expect(mecanico.status).toBe(400);
  expect(mecanico.body.error.codigo).toBe('TRANSICION_INVALIDA');

  const recepcion = await transicionar(tokens.recepcion, ordenId, 'ENTREGADO');
  expect(recepcion.status).toBe(200);
});

test('la cancelación es de recepción/administración y bloquea en ENTREGADO', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();

  const ordenId = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  const cancelada = await transicionar(tokens.recepcion, ordenId, 'CANCELADA', {
    cancellationReason: 'El cliente reprogramó.',
  });
  expect(cancelada.status).toBe(200);
  expect(cancelada.body.status).toBe('CANCELADA');
  expect(cancelada.body.cancellationReason).toBe('El cliente reprogramó.');

  // Cerrar otra orden y comprobar que no admite cambios (RN-9).
  const cerradaId = await crearOrdenAsignada({
    token: tokens.recepcion,
    vehiculoId,
    mecanicoId,
  });
  await transicionar(tokens.admin, cerradaId, 'ENTREGADO');

  const sobreEntregada = await transicionar(tokens.recepcion, cerradaId, 'CANCELADA');
  expect(sobreEntregada.status).toBe(409);
  expect(sobreEntregada.body.error.codigo).toBe('ORDEN_BLOQUEADA');

  const posterior = await transicionar(tokens.admin, cerradaId, 'EN_REPARACION');
  expect(posterior.status).toBe(409);
  expect(posterior.body.error.codigo).toBe('ORDEN_BLOQUEADA');

  const canceladaPosterior = await transicionar(tokens.admin, ordenId, 'RECIBIDO');
  expect(canceladaPosterior.status).toBe(409);
});

test('el mecánico no cambia estados de órdenes ajenas (RN-15)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const libre = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 100, reason: 'Sin asignar' });
  expect(libre.status).toBe(201);

  const intento = await transicionar(tokens.mecanico, libre.body.id, 'DIAGNOSTICO');
  expect(intento.status).toBe(403);
  expect(intento.body.error.codigo).toBe('NO_AUTORIZADO');
});
