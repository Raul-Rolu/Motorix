// 008-configuracion-seguridad-reportes, T067 (bloque P2, US5; FR-014, CA-20):
// permisos por rol de `GET /api/audit-log`, validados en el servidor. Solo ADMIN
// la consulta; RECEPTIONIST y MECHANIC reciben 403 y sin token es 401.
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

async function crearTokens() {
  const hash = await bcrypt.hash('Usuario123', 10);
  const tokens = {};
  for (const [username, rol] of [
    ['admin', 'ADMIN'],
    ['recepcion', 'RECEPTIONIST'],
    ['mecanico', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, `Usuario ${username}`, rol]
    );
    const login = await request(app).post('/api/auth/login').send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  return tokens;
}

const con = (token) => ({ Authorization: `Bearer ${token}` });

test('sin token responde 401', async () => {
  const respuesta = await request(app).get('/api/audit-log');

  expect(respuesta.status).toBe(401);
});

test('un token inválido responde 401', async () => {
  const respuesta = await request(app).get('/api/audit-log').set(con('no-es-un-token'));

  expect(respuesta.status).toBe(401);
});

test('ADMIN consulta la bitácora (200) con la forma del contrato', async () => {
  const tokens = await crearTokens();

  const respuesta = await request(app).get('/api/audit-log').set(con(tokens.admin));

  expect(respuesta.status).toBe(200);
  expect(respuesta.body).toEqual({
    pagina: 1,
    totalPaginas: expect.any(Number),
    total: expect.any(Number),
    datos: expect.any(Array),
  });
});

test.each(['recepcion', 'mecanico'])('%s recibe 403 NO_AUTORIZADO, también con filtros', async (usuario) => {
  const tokens = await crearTokens();
  await getPool().query("INSERT INTO audit_log (action, entity_type) VALUES ('LOGIN_FAILED', 'SESSION')");

  for (const consulta of ['', '?accion=LOGIN_FAILED', '?pagina=1&desde=2026-01-01']) {
    const respuesta = await request(app).get(`/api/audit-log${consulta}`).set(con(tokens[usuario]));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
    // El rechazo no filtra datos de la bitácora.
    expect(JSON.stringify(respuesta.body)).not.toContain('LOGIN_FAILED');
  }
});

test('con un rol no autorizado el 403 se responde antes de validar los filtros (no se revela nada)', async () => {
  const tokens = await crearTokens();

  const respuesta = await request(app).get('/api/audit-log?pagina=abc').set(con(tokens.recepcion));

  expect(respuesta.status).toBe(403);
});

test('ADMIN con un filtro inválido recibe 400 (no 500)', async () => {
  const tokens = await crearTokens();

  const respuesta = await request(app).get('/api/audit-log?accion=NO_EXISTE').set(con(tokens.admin));

  expect(respuesta.status).toBe(400);
  expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
});
