// 008-configuracion-seguridad-reportes, T114 (bloque P3, US8; FR-028, CA-10):
// permisos por rol de los reportes, validados en el servidor. Solo ADMIN los
// consulta; RECEPTIONIST y MECHANIC reciben `403 NO_AUTORIZADO` (incluso con un
// rango inválido: primero se valida el rol y no se revela nada) y sin token es
// 401. Este archivo crece con cada reporte (ingresos aquí; servicios,
// productividad, refacciones, rotación y exportación en sus tramos).
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
  process.env.JWT_SECRET ??= 'secreto-de-pruebas';
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
const RANGO = 'desde=2026-11-01&hasta=2026-11-30';

describe('GET /api/reports/income', () => {
  test('sin token responde 401', async () => {
    const respuesta = await request(app).get(`/api/reports/income?${RANGO}`);

    expect(respuesta.status).toBe(401);
  });

  test('un token inválido responde 401', async () => {
    const respuesta = await request(app).get(`/api/reports/income?${RANGO}`).set(con('no-es-un-token'));

    expect(respuesta.status).toBe(401);
  });

  test('ADMIN responde 200 con la forma del contrato', async () => {
    const tokens = await crearTokens();

    const respuesta = await request(app).get(`/api/reports/income?${RANGO}`).set(con(tokens.admin));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      rango: { desde: '2026-11-01', hasta: '2026-11-30' },
      agrupacion: 'DIA',
      totalCentavos: expect.any(Number),
      total: expect.any(Number),
      porPeriodo: expect.any(Array),
      porMetodo: expect.any(Array),
    });
  });

  test.each(['recepcion', 'mecanico'])('%s recibe 403 NO_AUTORIZADO', async (usuario) => {
    const tokens = await crearTokens();

    const respuesta = await request(app).get(`/api/reports/income?${RANGO}`).set(con(tokens[usuario]));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
    expect(Object.keys(respuesta.body)).toEqual(['error']);
  });

  test.each(['recepcion', 'mecanico'])('%s recibe 403 (no 400) aunque el rango sea inválido', async (usuario) => {
    const tokens = await crearTokens();

    const respuesta = await request(app).get('/api/reports/income?desde=basura').set(con(tokens[usuario]));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
  });
});

describe.each([
  ['services', 'servicios más frecuentes'],
  ['productivity', 'productividad por mecánico'],
])('GET /api/reports/%s (%s)', (reporte) => {
  const ruta = `/api/reports/${reporte}?${RANGO}`;

  test('sin token responde 401', async () => {
    const respuesta = await request(app).get(ruta);

    expect(respuesta.status).toBe(401);
  });

  test('un token inválido responde 401', async () => {
    const respuesta = await request(app).get(ruta).set(con('no-es-un-token'));

    expect(respuesta.status).toBe(401);
  });

  test('ADMIN responde 200 con rango y lista de datos', async () => {
    const tokens = await crearTokens();

    const respuesta = await request(app).get(ruta).set(con(tokens.admin));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ rango: { desde: '2026-11-01', hasta: '2026-11-30' }, datos: [] });
  });

  test.each(['recepcion', 'mecanico'])('%s recibe 403 NO_AUTORIZADO', async (usuario) => {
    const tokens = await crearTokens();

    const respuesta = await request(app).get(ruta).set(con(tokens[usuario]));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
    expect(Object.keys(respuesta.body)).toEqual(['error']);
  });

  test.each(['recepcion', 'mecanico'])('%s recibe 403 (no 400) aunque el rango sea inválido', async (usuario) => {
    const tokens = await crearTokens();

    const respuesta = await request(app).get(`/api/reports/${reporte}?desde=basura`).set(con(tokens[usuario]));

    expect(respuesta.status).toBe(403);
  });

  test('no existen rutas de escritura', async () => {
    const tokens = await crearTokens();

    for (const metodo of ['post', 'put', 'patch', 'delete']) {
      const respuesta = await request(app)[metodo](`/api/reports/${reporte}`).set(con(tokens.admin)).send({});

      expect(respuesta.status).toBe(404);
    }
  });
});

describe('no hay rutas de escritura de reportes', () => {
  test.each([
    ['post', '/api/reports/income'],
    ['put', '/api/reports/income'],
    ['patch', '/api/reports/income'],
    ['delete', '/api/reports/income'],
  ])('%s %s no existe (404)', async (metodo, ruta) => {
    const tokens = await crearTokens();

    const respuesta = await request(app)[metodo](ruta).set(con(tokens.admin)).send({});

    expect(respuesta.status).toBe(404);
  });
});
