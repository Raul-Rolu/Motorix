// T051: pruebas de contrato de cambios de estado (US6, FR-012).
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

test('las respuestas de estado siguen el contrato y el error sugiere opciones válidas', async () => {
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
    .send({ fullName: 'Contrato Estado', phone: '5511001100' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({
      clientId: cliente.body.id,
      plates: 'ce-001-a',
      brand: 'Toyota', model: 'Rav4', year: 2022,
    });
  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({
      vehicleId: vehiculo.body.id,
      mileageEntry: 9000,
      reason: 'Contrato estado',
      mechanicId: mecanico.id,
    });
  const ordenId = creacion.body.id;

  const avanzada = await request(app)
    .patch(`/api/orders/${ordenId}/status`)
    .set('Authorization', `Bearer ${tokenMecanico}`)
    .send({ status: 'DIAGNOSTICO' });
  expect(avanzada.status).toBe(200);
  expect(avanzada.body).toMatchObject({
    id: expect.any(Number),
    status: 'DIAGNOSTICO',
    previousState: null,
    cancellationReason: null,
  });

  // Salto inválido: el error indica las opciones válidas del estado actual.
  const invalida = await request(app)
    .patch(`/api/orders/${ordenId}/status`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({ status: 'TERMINADO' });
  expect(invalida.status).toBe(400);
  expect(invalida.body).toEqual({
    error: {
      codigo: 'TRANSICION_INVALIDA',
      mensaje: expect.stringContaining('EN_REPARACION'),
    },
  });

  const sinEstado = await request(app)
    .patch(`/api/orders/${ordenId}/status`)
    .set('Authorization', `Bearer ${tokenRecepcion}`)
    .send({});
  expect(sinEstado.status).toBe(400);
  expect(sinEstado.body.error.codigo).toBe('DATOS_INVALIDOS');
});
