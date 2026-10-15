// T040: pruebas de integración de clientes (US3).
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

async function tokenDe(role, username) {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    [username, `${username}@motorix.local`, hash, 'Usuario', role]
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: username, contrasena: 'Usuario123' });
  return login.body.token;
}

test('el recepcionista registra y consulta clientes (nombre y teléfono obligatorios)', async () => {
  const token = await tokenDe('RECEPTIONIST', 'recepcion');

  const creacion = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fullName: 'María López',
      phone: '5512345678',
      // El correo es opcional (clarificación 1): aquí no se envía.
    });
  expect(creacion.status).toBe(201);
  expect(creacion.body.fullName).toBe('María López');
  expect(creacion.body.active).toBe(true);

  const lista = await request(app)
    .get('/api/clients')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.status).toBe(200);
  expect(lista.body.datos.some((c) => c.phone === '5512345678')).toBe(true);
});

test('sin nombre o sin teléfono el registro se rechaza con DATOS_INVALIDOS', async () => {
  const token = await tokenDe('RECEPTIONIST', 'recepcion');

  const sinNombre = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ phone: '5512345678' });
  expect(sinNombre.status).toBe(400);
  expect(sinNombre.body.error.codigo).toBe('DATOS_INVALIDOS');

  const sinTelefono = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Sin Teléfono' });
  expect(sinTelefono.status).toBe(400);
  expect(sinTelefono.body.error.codigo).toBe('DATOS_INVALIDOS');
});

test('un correo con formato inválido se rechaza; un correo correcto es válido', async () => {
  const token = await tokenDe('RECEPTIONIST', 'recepcion');

  const correoMalo = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Cliente', phone: '5511112222', email: 'no-es-correo' });
  expect(correoMalo.status).toBe(400);

  const correoBueno = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Cliente', phone: '5511112222', email: 'cliente@ejemplo.com' });
  expect(correoBueno.status).toBe(201);
});

test('el rol mecánico no puede gestionar clientes (403)', async () => {
  const token = await tokenDe('MECHANIC', 'mecanico');

  const respuesta = await request(app)
    .get('/api/clients')
    .set('Authorization', `Bearer ${token}`);
  expect(respuesta.status).toBe(403);
  expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
});
