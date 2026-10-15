// T020: pruebas de contrato de los endpoints de autenticación (US1).
// Validan la forma de las respuestas documentada en contracts/api-rest.md.
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

test('POST /api/auth/login devuelve token y usuario sin passwordHash (contrato)', async () => {
  const hash = await bcrypt.hash('Contrato123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['contrato', 'contrato@motorix.local', hash, 'Usuario Contrato', 'ADMIN']
  );

  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'contrato', contrasena: 'Contrato123' });

  expect(respuesta.status).toBe(200);
  expect(typeof respuesta.body.token).toBe('string');
  expect(respuesta.body.usuario).toEqual({
    id: expect.any(Number),
    username: 'contrato',
    email: 'contrato@motorix.local',
    fullName: 'Usuario Contrato',
    role: 'ADMIN',
  });
  // El contrato prohíbe exponer el hash de la contraseña.
  expect(JSON.stringify(respuesta.body)).not.toContain('passwordHash');
  expect(JSON.stringify(respuesta.body)).not.toContain('$2b$');
});

test('los errores siguen el formato centralizado { error: { codigo, mensaje } } (contrato)', async () => {
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'otra', contrasena: 'Mala99999' });

  expect(respuesta.status).toBe(401);
  expect(respuesta.body).toEqual({
    error: {
      codigo: expect.any(String),
      mensaje: expect.any(String),
    },
  });
  // Nunca se exponen trazas internas (Principio IV).
  expect(JSON.stringify(respuesta.body)).not.toMatch(/at .*\.js:/);
});

test('POST /api/auth/change-password responde 204 sin cuerpo (contrato)', async () => {
  const hash = await bcrypt.hash('Contrato123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['contrato2', 'contrato2@motorix.local', hash, 'Usuario Contrato 2', 'MECHANIC']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'contrato2', contrasena: 'Contrato123' });

  const respuesta = await request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ contrasenaActual: 'Contrato123', contrasenaNueva: 'Nueva1234' });

  expect(respuesta.status).toBe(204);
  expect(respuesta.text).toBe('');
});
