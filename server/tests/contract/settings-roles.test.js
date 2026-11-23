// 008-configuracion-seguridad-reportes, T016 (bloque P1, US1; FR-010, CA-10):
// permisos por rol de `/api/settings`, validados en el servidor. Solo ADMIN
// consulta y edita; RECEPTIONIST y MECHANIC reciben 403 y sin token es 401.
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
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  return tokens;
}

test('sin token GET y PUT responden 401', async () => {
  const lectura = await request(app).get('/api/settings');
  const escritura = await request(app).put('/api/settings').send({ taller: { nombre: 'X' } });

  expect(lectura.status).toBe(401);
  expect(escritura.status).toBe(401);
});

test('ADMIN consulta y edita (200)', async () => {
  const tokens = await crearTokens();

  const lectura = await request(app).get('/api/settings').set('Authorization', `Bearer ${tokens.admin}`);
  const escritura = await request(app)
    .put('/api/settings')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ taller: { nombre: 'Taller de contrato' } });

  expect(lectura.status).toBe(200);
  expect(escritura.status).toBe(200);
});

test.each(['recepcion', 'mecanico'])('%s recibe 403 NO_AUTORIZADO en GET y PUT', async (usuario) => {
  const tokens = await crearTokens();

  const lectura = await request(app).get('/api/settings').set('Authorization', `Bearer ${tokens[usuario]}`);
  const escritura = await request(app)
    .put('/api/settings')
    .set('Authorization', `Bearer ${tokens[usuario]}`)
    .send({ taller: { nombre: 'Intento no autorizado' } });

  expect(lectura.status).toBe(403);
  expect(lectura.body.error.codigo).toBe('NO_AUTORIZADO');
  expect(escritura.status).toBe(403);
  expect(escritura.body.error.codigo).toBe('NO_AUTORIZADO');

  // El intento rechazado no guardó nada.
  const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM settings');
  expect(Number(total)).toBe(0);
});
