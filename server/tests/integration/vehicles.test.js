// T053: pruebas de integración de vehículos (US5, RN-1).
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
    .send({ fullName: 'Propietario', phone: '5512340000' });

  const [inactivo] = await getPool().query(
    'INSERT INTO clients (full_name, phone, active) VALUES (?, ?, 0)',
    ['Cliente Inactivo', '5500000000']
  );

  return { token, clienteId: cliente.body.id, clienteInactivoId: inactivo.insertId };
}

test('registrar un vehículo con propietario funciona de extremo a extremo (CA-3)', async () => {
  const { token, clienteId } = await prepararEntorno();

  const creacion = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: clienteId,
      plates: 'nvo-001-a',
      brand: 'Nissan',
      model: 'Versa',
      year: 2019,
      color: 'Plata',
    });
  expect(creacion.status).toBe(201);
  expect(creacion.body.plates).toBe('NVO-001-A'); // normalizado a mayúsculas
  expect(creacion.body.clientId).toBe(clienteId);

  const lista = await request(app)
    .get('/api/vehicles')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.status).toBe(200);
  expect(lista.body.datos).toHaveLength(1);
  expect(lista.body.datos[0].duenio.fullName).toBe('Propietario');
});

test('los datos obligatorios son placas, marca, modelo y año (clarificación 2)', async () => {
  const { token, clienteId } = await prepararEntorno();

  const incompleto = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({ clientId: clienteId, plates: 'FALTA-1', brand: 'Mazda' });
  expect(incompleto.status).toBe(400);
  expect(incompleto.body.error.codigo).toBe('DATOS_INVALIDOS');

  const anioMalo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({ clientId: clienteId, plates: 'FALTA-2', brand: 'Mazda', model: '3', year: 1800 });
  expect(anioMalo.status).toBe(400);
});

test('no se permite guardar un vehículo sin propietario (RN-1)', async () => {
  const { token, clienteInactivoId } = await prepararEntorno();

  // Sin clientId: la validación lo rechaza.
  const sinPropietario = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({ plates: 'SIN-DUE-1', brand: 'Toyota', model: 'Corolla', year: 2020 });
  expect(sinPropietario.status).toBe(400);
  expect(sinPropietario.body.error.mensaje).toContain('propietario');

  // Con un cliente inexistente: 404 CLIENTE_NO_ENCONTRADO.
  const inexistente = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({ clientId: 999999, plates: 'SIN-DUE-2', brand: 'Toyota', model: 'Corolla', year: 2020 });
  expect(inexistente.status).toBe(404);
  expect(inexistente.body.error.codigo).toBe('CLIENTE_NO_ENCONTRADO');

  // Con un cliente inactivo: también se rechaza (no aparece en operaciones nuevas).
  const inactivo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({ clientId: clienteInactivoId, plates: 'SIN-DUE-3', brand: 'Toyota', model: 'Corolla', year: 2020 });
  expect(inactivo.status).toBe(404);
  expect(inactivo.body.error.codigo).toBe('CLIENTE_NO_ENCONTRADO');
});

test('dos vehículos no pueden compartir placas (VEHICULO_DUPLICADO)', async () => {
  const { token, clienteId } = await prepararEntorno();
  const payload = {
    clientId: clienteId,
    plates: 'DUP-001-A',
    brand: 'Chevrolet',
    model: 'Aveo',
    year: 2017,
  };

  const primero = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  expect(primero.status).toBe(201);

  const segundo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...payload, brand: 'otra' });
  expect(segundo.status).toBe(409);
  expect(segundo.body.error.codigo).toBe('VEHICULO_DUPLICADO');
});

test('el rol mecánico no puede gestionar vehículos (403)', async () => {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['mecanico', 'mecanico@motorix.local', hash, 'Mecánico', 'MECHANIC']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico', contrasena: 'Usuario123' });

  const respuesta = await request(app)
    .get('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`);
  expect(respuesta.status).toBe(403);
});
