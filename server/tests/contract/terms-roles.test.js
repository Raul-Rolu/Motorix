// 008-configuracion-seguridad-reportes, T089 (bloque P2, US7; FR-022, CA-18):
// permisos por rol de las rutas de términos, validados en el servidor. Los tres
// roles consultan la versión vigente y la aceptan; solo ADMIN publica y consulta
// las aceptaciones (RECEPTIONIST y MECHANIC → 403); sin token es 401.
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

async function publicarVersionEnBase() {
  const [version] = await getPool().query(
    'INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (1, ?, ?)',
    ['Términos de prueba de los roles.', 'Aviso de privacidad de prueba.']
  );
  return version.insertId;
}

const CUERPO_PUBLICAR = {
  terminos: 'Términos nuevos de prueba para publicar.',
  avisoPrivacidad: 'Aviso de privacidad nuevo para publicar.',
};

describe('sin token → 401', () => {
  test.each([
    ['get', '/api/terms/current'],
    ['post', '/api/terms/accept'],
    ['post', '/api/terms'],
    ['get', '/api/terms/acceptances'],
  ])('%s %s', async (metodo, ruta) => {
    const respuesta = await request(app)[metodo](ruta).send({});

    expect(respuesta.status).toBe(401);
  });
});

describe('RECEPTIONIST y MECHANIC', () => {
  test.each(['recepcion', 'mecanico'])('%s no publica ni consulta aceptaciones (403 NO_AUTORIZADO)', async (usuario) => {
    const tokens = await crearTokens();

    const publicar = await request(app).post('/api/terms').set(con(tokens[usuario])).send(CUERPO_PUBLICAR);
    const aceptaciones = await request(app).get('/api/terms/acceptances').set(con(tokens[usuario]));

    expect(publicar.status).toBe(403);
    expect(publicar.body.error.codigo).toBe('NO_AUTORIZADO');
    expect(aceptaciones.status).toBe(403);
    expect(aceptaciones.body.error.codigo).toBe('NO_AUTORIZADO');
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM terms_versions');
    expect(total).toBe(0);
  });

  test.each(['recepcion', 'mecanico'])('%s sí consulta la vigente y la acepta', async (usuario) => {
    const tokens = await crearTokens();
    const id = await publicarVersionEnBase();

    const vigente = await request(app).get('/api/terms/current').set(con(tokens[usuario]));
    const aceptada = await request(app).post('/api/terms/accept').set(con(tokens[usuario])).send({ termsVersionId: id });

    expect(vigente.status).toBe(200);
    expect(aceptada.status).toBe(200);
  });
});

describe('ADMIN', () => {
  test('consulta la vigente, la acepta, publica y consulta las aceptaciones', async () => {
    const tokens = await crearTokens();
    const id = await publicarVersionEnBase();

    expect((await request(app).get('/api/terms/current').set(con(tokens.admin))).status).toBe(200);
    expect(
      (await request(app).post('/api/terms/accept').set(con(tokens.admin)).send({ termsVersionId: id })).status
    ).toBe(200);
    expect((await request(app).get('/api/terms/acceptances').set(con(tokens.admin))).status).toBe(200);
    expect((await request(app).post('/api/terms').set(con(tokens.admin)).send(CUERPO_PUBLICAR)).status).toBe(201);
  });
});

describe('no hay rutas de edición ni borrado', () => {
  test.each([
    ['put', '/api/terms'],
    ['patch', '/api/terms/1'],
    ['delete', '/api/terms/1'],
    ['delete', '/api/terms/acceptances'],
  ])('%s %s no existe (404)', async (metodo, ruta) => {
    const tokens = await crearTokens();

    const respuesta = await request(app)[metodo](ruta).set(con(tokens.admin)).send({});

    expect(respuesta.status).toBe(404);
  });
});
