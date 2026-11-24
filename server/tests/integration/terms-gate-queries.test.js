// 008-configuracion-seguridad-reportes, T088 (bloque P2, US7; FR-021, CA-19): la
// compuerta de términos no agrega consultas. La autenticación y la evaluación
// de la aceptación salen en UNA sola consulta (la versión vigente y la
// aceptación viajan como subconsultas de la del usuario), y la consulta de
// avisos del ADMIN —la más pesada y la que se repite cada 60 s— se mantiene en
// 8 consultas o menos con la compuerta activa. Corre contra `motorix_test`.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';
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
  jest.restoreAllMocks();
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

async function prepararAdminConTerminos({ aceptados }) {
  const hash = await bcrypt.hash('Usuario123', 10);
  const [usuario] = await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['admin', 'admin@motorix.local', hash, 'Administrador', 'ADMIN']
  );
  const login = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: 'Usuario123' });
  const [version] = await getPool().query(
    'INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (1, ?, ?)',
    ['Términos de prueba para la compuerta.', 'Aviso de privacidad de prueba.']
  );
  if (aceptados) {
    await getPool().query('INSERT INTO terms_acceptances (user_id, terms_version_id) VALUES (?, ?)', [
      usuario.insertId,
      version.insertId,
    ]);
  }
  return login.body.token;
}

/** Cuenta las consultas que pasan por `pool.query` durante `accion`. */
async function contarConsultas(accion) {
  const consultas = [];
  const original = getPool().query.bind(getPool());
  jest.spyOn(getPool(), 'query').mockImplementation((sql, ...resto) => {
    consultas.push(typeof sql === 'string' ? sql : sql?.sql ?? '');
    return original(sql, ...resto);
  });
  const resultado = await accion();
  jest.restoreAllMocks();
  return { consultas, resultado };
}

describe('una sola consulta para autenticar y evaluar los términos', () => {
  test('GET /api/me con la compuerta activa y aceptada emite una consulta', async () => {
    const token = await prepararAdminConTerminos({ aceptados: true });

    const { consultas, resultado } = await contarConsultas(() =>
      request(app).get('/api/me').set('Authorization', `Bearer ${token}`)
    );

    expect(resultado.status).toBe(200);
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toContain('FROM users');
    expect(consultas[0]).toContain('terms_versions');
    expect(consultas[0]).toContain('terms_acceptances');
  });

  test('con la compuerta activa y sin aceptar también es una sola consulta (403)', async () => {
    const token = await prepararAdminConTerminos({ aceptados: false });

    const { consultas, resultado } = await contarConsultas(() =>
      request(app).get('/api/me').set('Authorization', `Bearer ${token}`)
    );

    expect(resultado.status).toBe(403);
    expect(consultas).toHaveLength(1);
  });

  test('una ruta exenta (authBase) no consulta los términos al autenticar', async () => {
    const token = await prepararAdminConTerminos({ aceptados: false });

    const { consultas, resultado } = await contarConsultas(() =>
      request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)
    );

    expect(resultado.status).toBe(204);
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).not.toContain('terms_');
  });
});

describe('presupuesto de consultas de los avisos', () => {
  test('GET /api/notifications de ADMIN con compuerta activa usa 8 consultas o menos', async () => {
    const token = await prepararAdminConTerminos({ aceptados: true });

    const { consultas, resultado } = await contarConsultas(() =>
      request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`)
    );

    expect(resultado.status).toBe(200);
    expect(consultas.length).toBeLessThanOrEqual(8);
  });
});
