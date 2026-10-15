// T055: pruebas de integración de entradas fechadas (US7, FR-014).
// Diagnósticos, observaciones y recomendaciones son historial inmutable:
// existen para crearlas (201), pero no para borrarlas (sin endpoint).
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
    .send({ fullName: 'Entradas Cliente', phone: '5522334455' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({
      clientId: cliente.body.id,
      plates: 'en-001-a',
      brand: 'Honda', model: 'Civic', year: 2021,
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

/** Crea una orden asignada y la lleva al estado indicado. */
async function crearOrdenEn(token, vehiculoId, mecanicoId, estado) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vehicleId: vehiculoId,
      mileageEntry: 45120,
      reason: 'Entradas',
      mechanicId: mecanicoId,
    });
  expect(creacion.status).toBe(201);
  if (estado !== 'RECIBIDO') {
    await getPool().query('UPDATE service_orders SET status = ? WHERE id = ?', [
      estado,
      creacion.body.id,
    ]);
  }
  return creacion.body.id;
}

test('el dueño registra observaciones y recomendaciones con autor y fecha (FR-014)', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenEn(
    tokens.recepcion,
    vehiculoId,
    mecanicoId,
    'DIAGNOSTICO'
  );

  const observacion = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ entryType: 'OBSERVATION', content: 'Se detectó fuga en la manguera superior.' });
  expect(observacion.status).toBe(201);
  expect(observacion.body).toMatchObject({
    entryType: 'OBSERVATION',
    content: 'Se detectó fuga en la manguera superior.',
    createdBy: mecanicoId,
    createdAt: expect.anything(),
  });

  const recomendacion = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ entryType: 'RECOMMENDATION', content: 'Reemplazar ambas mangueras.' });
  expect(recomendacion.status).toBe(201);
  expect(recomendacion.body.entryType).toBe('RECOMMENDATION');
});

test('las entradas del dueño son visibles para recepción y administración en el detalle', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenEn(
    tokens.recepcion,
    vehiculoId,
    mecanicoId,
    'DIAGNOSTICO'
  );

  await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ entryType: 'DIAGNOSTIC', content: 'Balatas delanteras en 20%.' });

  for (const rol of ['recepcion', 'admin']) {
    const detalle = await request(app)
      .get(`/api/orders/${ordenId}`)
      .set('Authorization', `Bearer ${tokens[rol]}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.entries).toHaveLength(1);
    expect(detalle.body.entries[0]).toMatchObject({
      entryType: 'DIAGNOSTIC',
      content: 'Balatas delanteras en 20%.',
      authorName: 'Mecánico del Taller',
      createdAt: expect.anything(),
    });
  }
});

test('se rechazan entradas sin contenido o con tipo inválido (FR-014)', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenEn(
    tokens.recepcion,
    vehiculoId,
    mecanicoId,
    'DIAGNOSTICO'
  );

  const sinContenido = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ entryType: 'DIAGNOSTIC', content: '   ' });
  expect(sinContenido.status).toBe(400);
  expect(sinContenido.body.error.codigo).toBe('DATOS_INVALIDOS');

  const tipoInvalido = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ entryType: 'REMATE', content: 'Contenido válido' });
  expect(tipoInvalido.status).toBe(400);
  expect(tipoInvalido.body.error.codigo).toBe('DATOS_INVALIDOS');
});

test('no existe endpoint para borrar entradas: el historial es inmutable (FR-014)', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenEn(
    tokens.recepcion,
    vehiculoId,
    mecanicoId,
    'DIAGNOSTICO'
  );

  const entrada = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ entryType: 'OBSERVATION', content: 'Entrada que no debe borrarse.' });
  expect(entrada.status).toBe(201);

  const borrado = await request(app)
    .delete(`/api/orders/${ordenId}/entries/${entrada.body.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect([404, 405]).toContain(borrado.status);

  const borradoColeccion = await request(app)
    .delete(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect([404, 405]).toContain(borradoColeccion.status);

  // La entrada sigue existiendo.
  const detalle = await request(app)
    .get(`/api/orders/${ordenId}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(detalle.body.entries).toHaveLength(1);
});

test('las órdenes ENTREGADO no admiten nuevas entradas (RN-9)', async () => {
  const { tokens, vehiculoId, mecanicoId } = await prepararEntorno();
  const ordenId = await crearOrdenEn(
    tokens.recepcion,
    vehiculoId,
    mecanicoId,
    'ENTREGADO'
  );

  const entrada = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ entryType: 'OBSERVATION', content: 'Tarde.' });

  expect(entrada.status).toBe(409);
  expect(entrada.body.error.codigo).toBe('ORDEN_BLOQUEADA');
});
