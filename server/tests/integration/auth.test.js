// T019: pruebas de integración del login y cambio de contraseña (US1).
// Corren contra la base `motorix_test`, nunca contra la base principal.
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

async function crearUsuarioDePrueba(overrides = {}) {
  const usuario = {
    username: 'prueba',
    email: 'prueba@motorix.local',
    password_hash: await bcrypt.hash('Prueba123', 10),
    full_name: 'Usuario de Prueba',
    role: 'RECEPTIONIST',
    active: 1,
    ...overrides,
  };
  const [resultado] = await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role, active) VALUES (?, ?, ?, ?, ?, ?)',
    [usuario.username, usuario.email, usuario.password_hash, usuario.full_name, usuario.role, usuario.active]
  );
  return { ...usuario, id: resultado.insertId };
}

test('el login funciona con el nombre de usuario', async () => {
  await crearUsuarioDePrueba();
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'prueba', contrasena: 'Prueba123' });

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.token).toEqual(expect.any(String));
  expect(respuesta.body.usuario.username).toBe('prueba');
  expect(respuesta.body.usuario).not.toHaveProperty('passwordHash');
});

test('el login funciona con el correo electrónico en el mismo campo (RN-16)', async () => {
  await crearUsuarioDePrueba();
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'prueba@motorix.local', contrasena: 'Prueba123' });

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.usuario.email).toBe('prueba@motorix.local');
});

test('una contraseña incorrecta responde 401 con mensaje genérico', async () => {
  await crearUsuarioDePrueba();
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'prueba', contrasena: 'Incorrecta999' });

  expect(respuesta.status).toBe(401);
  expect(respuesta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  expect(respuesta.body.error.mensaje).toBe('Credenciales inválidas.');
});

test('un usuario inexistente responde igual que una contraseña incorrecta', async () => {
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'nadie@noexiste.local', contrasena: 'Incorrecta999' });

  expect(respuesta.status).toBe(401);
  expect(respuesta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
});

test('un usuario desactivado no puede iniciar sesión', async () => {
  await crearUsuarioDePrueba({ active: 0 });
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'prueba', contrasena: 'Prueba123' });

  expect(respuesta.status).toBe(401);
  expect(respuesta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
});

test('el cambio de contraseña exige sesión, contraseña actual y política (FR-011)', async () => {
  const usuario = await crearUsuarioDePrueba();

  // Sin token: 401.
  const sinSesion = await request(app)
    .post('/api/auth/change-password')
    .send({ contrasenaActual: 'Prueba123', contrasenaNueva: 'Nueva1234' });
  expect(sinSesion.status).toBe(401);

  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'prueba', contrasena: 'Prueba123' });
  const token = login.body.token;

  // Política mínima incumplida: 400.
  const politica = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${token}`)
    .send({ contrasenaActual: 'Prueba123', contrasenaNueva: 'corta1A' });
  expect(politica.status).toBe(400);
  expect(politica.body.error.codigo).toBe('CONTRASENA_INVALIDA');

  // Contraseña actual incorrecta: 401.
  const actualIncorrecta = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${token}`)
    .send({ contrasenaActual: 'Otra9999', contrasenaNueva: 'Nueva1234' });
  expect(actualIncorrecta.status).toBe(401);

  // Cambio válido y nuevo login con la contraseña nueva.
  const valido = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${token}`)
    .send({ contrasenaActual: 'Prueba123', contrasenaNueva: 'Nueva1234' });
  expect(valido.status).toBe(204);

  const loginNuevo = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: usuario.username, contrasena: 'Nueva1234' });
  expect(loginNuevo.status).toBe(200);
});

test('un token expirado o inválido responde 401 SESION_EXPIRADA', async () => {
  const respuesta = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', 'Bearer token-falso')
    .send({ contrasenaActual: 'Prueba123', contrasenaNueva: 'Nueva1234' });

  expect(respuesta.status).toBe(401);
  expect(respuesta.body.error.codigo).toBe('SESION_EXPIRADA');
});
