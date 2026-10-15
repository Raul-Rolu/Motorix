// T024: pruebas de contrato de asignación y listado (US4).
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

test('la asignación y el listado siguen la forma del contrato', async () => {
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
  const token = loginRecepcion.body.token;

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Contrato Asignación', phone: '5512123434' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'ca-001-a',
      brand: 'Ford', model: 'Fiesta', year: 2016,
    });
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculo.body.id, mileageEntry: 80000, reason: 'Embrague' });
  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );

  const asignada = await request(app)
    .patch(`/api/orders/${creacion.body.id}/assignment`)
    .set('Authorization', `Bearer ${token}`)
    .send({ mechanicId: mecanico.id });
  expect(asignada.status).toBe(200);
  expect(asignada.body).toMatchObject({
    id: expect.any(Number),
    status: 'RECIBIDO',
    mechanicId: mecanico.id,
  });

  const lista = await request(app)
    .get('/api/orders?estado=RECIBIDO')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.status).toBe(200);
  expect(lista.body).toEqual({
    datos: expect.arrayContaining([
      expect.objectContaining({ id: expect.any(Number), mechanicId: mecanico.id }),
    ]),
  });

  const invalido = await request(app)
    .patch(`/api/orders/${creacion.body.id}/assignment`)
    .set('Authorization', `Bearer ${token}`)
    .send({ mechanicId: 99999 });
  expect(invalido.status).toBe(400);
  expect(invalido.body).toEqual({
    error: { codigo: 'MECANICO_INVALIDO', mensaje: expect.any(String) },
  });
});
