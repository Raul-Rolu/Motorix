// T013: pruebas de contrato de creación de órdenes (US2).
// Verifican la forma exacta de las respuestas 201 y de los errores,
// y que nunca se expongan datos internos (hashes, contraseñas, trazas).
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
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const token = login.body.token;

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Contrato Cliente', phone: '5533334444' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'ct-001-a',
      brand: 'Mazda',
      model: '3',
      year: 2021,
    });

  return { token, clienteId: cliente.body.id, vehiculoId: vehiculo.body.id };
}

test('la creación de órdenes sigue la forma del contrato y no expone datos internos', async () => {
  const { token, clienteId, vehiculoId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      vehicleId: vehiculoId,
      mileageEntry: 12000,
      reason: 'Ruido al arrancar',
      notes: 'Solo en frío',
      mechanicId: null,
    });

  expect(creacion.status).toBe(201);
  expect(creacion.body).toMatchObject({
    id: expect.any(Number),
    status: 'RECIBIDO',
    clientId: clienteId,
    vehicleId: vehiculoId,
    mechanicId: null,
    mileageEntry: 12000,
    reason: 'Ruido al arrancar',
    notes: 'Solo en frío',
    mileageCorrection: false,
  });
  const serializado = JSON.stringify(creacion.body);
  expect(serializado).not.toContain('$2b$');
  expect(serializado).not.toContain('password');

  const invalido = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: -1, reason: '' });
  expect(invalido.status).toBe(400);
  expect(invalido.body).toEqual({
    error: { codigo: 'DATOS_INVALIDOS', mensaje: expect.any(String) },
  });

  const inexistente = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: 99999, mileageEntry: 10, reason: 'X' });
  expect(inexistente.status).toBe(404);
  expect(inexistente.body).toEqual({
    error: { codigo: 'VEHICULO_NO_DISPONIBLE', mensaje: expect.any(String) },
  });

  const lista = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.status).toBe(200);
  expect(lista.body).toEqual({
    datos: expect.arrayContaining([
      expect.objectContaining({ id: expect.any(Number), status: 'RECIBIDO' }),
    ]),
  });
});
