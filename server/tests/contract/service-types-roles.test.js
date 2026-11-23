// 008-configuracion-seguridad-reportes, T032 (bloque P1, US3; FR-010, CA-10):
// permisos por rol de `/api/service-types`, validados en el servidor. La
// administración (alta, edición y desactivación) es solo de ADMIN; los tres
// roles consultan los tipos activos; `incluirInactivos` es solo de ADMIN.
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

const con = (token) => ({ Authorization: `Bearer ${token}` });

async function crearTipoComoAdmin(tokens) {
  const respuesta = await request(app)
    .post('/api/service-types')
    .set(con(tokens.admin))
    .send({ nombre: 'Cambio de aceite', intervaloDias: 180, intervaloKm: 5000 });
  return respuesta.body.id;
}

test('sin token todas las rutas responden 401', async () => {
  const lectura = await request(app).get('/api/service-types');
  const alta = await request(app).post('/api/service-types').send({ nombre: 'X', intervaloDias: 1 });
  const edicion = await request(app).put('/api/service-types/1').send({ nombre: 'X', intervaloDias: 1 });
  const estado = await request(app).patch('/api/service-types/1/status').send({ activo: false });

  expect(lectura.status).toBe(401);
  expect(alta.status).toBe(401);
  expect(edicion.status).toBe(401);
  expect(estado.status).toBe(401);
});

test.each(['recepcion', 'mecanico'])('%s consulta los tipos activos (200)', async (usuario) => {
  const tokens = await crearTokens();
  await crearTipoComoAdmin(tokens);

  const respuesta = await request(app).get('/api/service-types').set(con(tokens[usuario]));

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.datos).toHaveLength(1);
});

test.each(['recepcion', 'mecanico'])(
  '%s recibe 403 NO_AUTORIZADO al administrar el catálogo y no cambia nada',
  async (usuario) => {
    const tokens = await crearTokens();
    const id = await crearTipoComoAdmin(tokens);
    const cuerpo = { nombre: 'Intento', intervaloDias: 10 };

    const alta = await request(app).post('/api/service-types').set(con(tokens[usuario])).send(cuerpo);
    const edicion = await request(app).put(`/api/service-types/${id}`).set(con(tokens[usuario])).send(cuerpo);
    const estado = await request(app)
      .patch(`/api/service-types/${id}/status`)
      .set(con(tokens[usuario]))
      .send({ activo: false });

    for (const respuesta of [alta, edicion, estado]) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
    }
    const [[fila]] = await getPool().query('SELECT name, active FROM service_types WHERE id = ?', [id]);
    expect(fila).toEqual({ name: 'Cambio de aceite', active: 1 });
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM service_types');
    expect(Number(total)).toBe(1);
  }
);

test.each(['recepcion', 'mecanico'])('%s recibe 403 con ?incluirInactivos=true', async (usuario) => {
  const tokens = await crearTokens();

  const respuesta = await request(app)
    .get('/api/service-types?incluirInactivos=true')
    .set(con(tokens[usuario]));

  expect(respuesta.status).toBe(403);
  expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
});

test('ADMIN administra y consulta con inactivos (200 y 201)', async () => {
  const tokens = await crearTokens();

  const alta = await request(app)
    .post('/api/service-types')
    .set(con(tokens.admin))
    .send({ nombre: 'Afinación', intervaloDias: 365 });
  const lista = await request(app).get('/api/service-types?incluirInactivos=true').set(con(tokens.admin));

  expect(alta.status).toBe(201);
  expect(lista.status).toBe(200);
});
