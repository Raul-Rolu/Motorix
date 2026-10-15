// T046: pruebas de contrato de entradas y partidas (US5).
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

test('las respuestas de entradas y partidas siguen el contrato', async () => {
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
  const tokenRecepcion = loginRecepcion.body.token;
  const loginMecanico = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico', contrasena: 'Usuario123' });
  const tokenMecanico = loginMecanico.body.token;

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ fullName: 'Contrato Trabajo', phone: '5533221100' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({
      clientId: cliente.body.id,
      plates: 'ct-009-a',
      brand: 'Mazda', model: 'CX-5', year: 2021,
    });
  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({
      vehicleId: vehiculo.body.id,
      mileageEntry: 15000,
      reason: 'Contrato trabajo',
      mechanicId: mecanico.id,
    });
  const ordenId = creacion.body.id;
  await getPool().query(
    "UPDATE service_orders SET status = 'DIAGNOSTICO' WHERE id = ?",
    [ordenId]
  );

  const entrada = await request(app)
    .post(`/api/orders/${ordenId}/entries`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ entryType: 'RECOMMENDATION', content: 'Revisar alineación.' });
  expect(entrada.status).toBe(201);
  expect(entrada.body).toMatchObject({
    id: expect.any(Number),
    entryType: 'RECOMMENDATION',
    content: 'Revisar alineación.',
    createdBy: mecanico.id,
    createdAt: expect.anything(),
  });

  const partida = await request(app)
    .post(`/api/orders/${ordenId}/services`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ description: 'Alineación', amount: 350.5, kind: 'SERVICE' });
  expect(partida.status).toBe(201);
  expect(partida.body).toMatchObject({
    id: expect.any(Number),
    kind: 'SERVICE',
    description: 'Alineación',
    amount: 350.5,
  });

  const invalida = await request(app)
    .post(`/api/orders/${ordenId}/services`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ description: '', amount: -1, kind: 'SERVICE' });
  expect(invalida.status).toBe(400);
  expect(invalida.body).toEqual({
    error: { codigo: 'DATOS_INVALIDOS', mensaje: expect.any(String) },
  });

  const borrada = await request(app)
    .delete(`/api/orders/${ordenId}/services/${partida.body.id}`)
    .set('Authorization', `Bearer ${tokenMecanico}`);
  expect(borrada.status).toBe(204);
  expect(borrada.body).toEqual({});
});
