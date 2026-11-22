// T045: pruebas de integración de trabajo de órdenes (US5, FR-011, RN-9, CA-4).
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

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({ fullName: 'Trabajo Cliente', phone: '5500112233' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'tr-001-a',
      brand: 'Toyota', model: 'Corolla', year: 2018,
    });

  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );

  return {
    tokenRecepcion: loginRecepcion.body.token,
    tokenMecanico: loginMecanico.body.token,
    clienteId: cliente.body.id,
    vehiculoId: vehiculo.body.id,
    mecanicoId: mecanico.id,
  };
}

/** Crea una orden asignada al mecánico y la lleva al estado indicado. */
async function crearOrdenEn(tokenRecepcion, vehiculoId, mecanicoId, estado) {
  return crearOrdenCon(tokenRecepcion, vehiculoId, mecanicoId, 45120, estado);
}

/** Crea una orden asignada con kilometraje explícito y la deja en el estado indicado. */
async function crearOrdenCon(
  tokenRecepcion,
  vehiculoId,
  mecanicoId,
  mileageEntry,
  estado = 'RECIBIDO'
) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({
      vehicleId: vehiculoId,
      mileageEntry,
      reason: 'Trabajo',
      mechanicId: mecanicoId,
    });
  expect(creacion.status).toBe(201);
  const id = creacion.body.id;

  if (estado !== 'RECIBIDO') {
    await getPool().query('UPDATE service_orders SET status = ? WHERE id = ?', [
      estado,
      id,
    ]);
  }
  return id;
}

test('el mecánico dueño agrega diagnósticos y partidas con sus totales (FR-011, CA-4)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId, mecanicoId } =
    await prepararEntorno();
  const ordenId = await crearOrdenEn(
    tokenRecepcion,
    vehiculoId,
    mecanicoId,
    'DIAGNOSTICO'
  );

  const entrada = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ entryType: 'DIAGNOSTIC', content: 'Pastillas de freno gastadas.' });
  expect(entrada.status).toBe(201);
  expect(entrada.body).toMatchObject({
    id: expect.any(Number),
    entryType: 'DIAGNOSTIC',
    content: 'Pastillas de freno gastadas.',
    createdBy: mecanicoId,
    createdAt: expect.anything(),
  });

  const servicio = await request(app)
    .post(`/api/orders/${ordenId}/services`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ description: 'Cambio de pastillas', amount: 650, kind: 'SERVICE' });
  expect(servicio.status).toBe(201);

  const manoDeObra = await request(app)
    .post(`/api/orders/${ordenId}/services`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ description: 'Mano de obra frenos', amount: 400, kind: 'LABOR' });
  expect(manoDeObra.status).toBe(201);

  const detalle = await request(app)
    .get(`/api/orders/${ordenId}`)
    .set('Authorization', `Bearer ${tokenRecepcion}`);
  expect(detalle.body.entries).toHaveLength(1);
  expect(detalle.body.services).toHaveLength(1);
  expect(detalle.body.labor).toHaveLength(1);
  expect(detalle.body.totals).toEqual({
    services: 650,
    labor: 400,
    parts: 0,
    grand: 1050,
    totalCompleto: true,
    refaccionesSinPrecio: 0,
  });
});

test('no se agregan partidas antes de avanzar a diagnóstico (FR-011)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId, mecanicoId } =
    await prepararEntorno();
  const ordenId = await crearOrdenEn(tokenRecepcion, vehiculoId, mecanicoId, 'RECIBIDO');

  const servicio = await request(app)
    .post(`/api/orders/${ordenId}/services`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ description: 'Servicio prematuro', amount: 100, kind: 'SERVICE' });

  expect(servicio.status).toBe(400);
  expect(servicio.body.error.codigo).toBe('DATOS_INVALIDOS');
});

test('las órdenes cerradas no admiten partidas ni entradas (RN-9)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId, mecanicoId } =
    await prepararEntorno();
  const ordenId = await crearOrdenEn(tokenRecepcion, vehiculoId, mecanicoId, 'ENTREGADO');

  const partida = await request(app)
    .post(`/api/orders/${ordenId}/services`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ description: 'Tarde', amount: 10, kind: 'SERVICE' });
  expect(partida.status).toBe(409);
  expect(partida.body.error.codigo).toBe('ORDEN_BLOQUEADA');

  const entrada = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ entryType: 'OBSERVATION', content: 'Tarde.' });
  expect(entrada.status).toBe(409);
  expect(entrada.body.error.codigo).toBe('ORDEN_BLOQUEADA');
});

test('el mecánico no trabaja órdenes ajenas (RN-15)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId } = await prepararEntorno();

  const libre = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 100, reason: 'Sin asignar' });
  expect(libre.status).toBe(201);

  const entrada = await request(app)
    .post(`/api/orders/${libre.body.id}/entries`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ entryType: 'DIAGNOSTIC', content: 'Ajena.' });
  expect(entrada.status).toBe(403);
  expect(entrada.body.error.codigo).toBe('NO_AUTORIZADO');
});

test('una partida se puede borrar antes de entregar y ya no después (FR-011)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId, mecanicoId } =
    await prepararEntorno();
  const ordenId = await crearOrdenEn(tokenRecepcion, vehiculoId, mecanicoId, 'DIAGNOSTICO');

  const partida = await request(app)
    .post(`/api/orders/${ordenId}/services`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ description: 'Agregada por error', amount: 100, kind: 'SERVICE' });
  expect(partida.status).toBe(201);

  const borrada = await request(app)
    .delete(`/api/orders/${ordenId}/services/${partida.body.id}`)
    .set('Authorization', `Bearer ${tokenMecanico}`);
  expect(borrada.status).toBe(204);

  const detalle = await request(app)
    .get(`/api/orders/${ordenId}`)
    .set('Authorization', `Bearer ${tokenMecanico}`);
  expect(detalle.body.services).toHaveLength(0);

  // En orden ENTREGADO la corrección ya no está permitida.
  const cerradaId = await crearOrdenEn(
    tokenRecepcion,
    vehiculoId,
    mecanicoId,
    'ENTREGADO'
  );
  const otra = await request(app)
    .post(`/api/orders/${cerradaId}/services`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ description: 'Imposible', amount: 1, kind: 'SERVICE' });
  expect(otra.status).toBe(409);
});

test('las entradas rechazan tipo o contenido inválidos (FR-011)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId, mecanicoId } =
    await prepararEntorno();
  const ordenId = await crearOrdenEn(tokenRecepcion, vehiculoId, mecanicoId, 'DIAGNOSTICO');

  const sinContenido = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ entryType: 'DIAGNOSTIC', content: '   ' });
  expect(sinContenido.status).toBe(400);

  const tipoInvalido = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ entryType: 'OTRO', content: 'Contenido' });
  expect(tipoInvalido.status).toBe(400);
});

test('la recepción edita motivo, notas y kilometraje en estados de trabajo (PUT del contrato)', async () => {
  const { tokenRecepcion, tokenMecanico, vehiculoId, mecanicoId } =
    await prepararEntorno();

  // Orden previa con kilometraje mayor, para ejercer la RN-4 en la edición.
  const previa = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 50000, reason: 'Orden previa' });
  expect(previa.status).toBe(201);

  const ordenId = await crearOrdenCon(tokenRecepcion, vehiculoId, mecanicoId, 51000);

  const editada = await request(app)
    .put(`/api/orders/${ordenId}`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ reason: 'Frenos y suspensión', notes: 'Cliente autoriza refacciones.' });
  expect(editada.status).toBe(200);
  expect(editada.body.reason).toBe('Frenos y suspensión');
  expect(editada.body.mileageEntry).toBe(51000);
  expect(editada.body.notes).toBe('Cliente autoriza refacciones.');

  // La orden previa (50000 km) sigue siendo el mínimo: bajarlo exige corrección.
  const kilometrajeMenor = await request(app)
    .put(`/api/orders/${ordenId}`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ reason: 'Frenos y suspensión', mileageEntry: 40000 });
  expect(kilometrajeMenor.status).toBe(400);
  expect(kilometrajeMenor.body.error.codigo).toBe('KILOMETRAJE_INVALIDO');

  const corregida = await request(app)
    .put(`/api/orders/${ordenId}`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({
      reason: 'Frenos y suspensión',
      mileageEntry: 40000,
      mileageCorrection: true,
    });
  expect(corregida.status).toBe(200);
  expect(corregida.body.mileageEntry).toBe(40000);
  expect(corregida.body.mileageCorrection).toBe(true);

  // El mecánico no tiene acceso a esta operación (RN-15).
  const mecanico = await request(app)
    .put(`/api/orders/${ordenId}`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ reason: 'Intento del mecánico' });
  expect(mecanico.status).toBe(403);

  // Una orden ENTREGADO no admite ediciones (RN-9).
  const cerradaId = await crearOrdenCon(
    tokenRecepcion,
    vehiculoId,
    mecanicoId,
    52000,
    'ENTREGADO'
  );
  const cerrada = await request(app)
    .put(`/api/orders/${cerradaId}`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ reason: 'Tarde' });
  expect(cerrada.status).toBe(409);
  expect(cerrada.body.error.codigo).toBe('ORDEN_BLOQUEADA');
});
