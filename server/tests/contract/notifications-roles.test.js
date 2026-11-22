// 007-notificaciones-internas, T013 (US1; FR-004, CA-4): contrato por rol de
// `GET /api/notifications`. Este bloque inicial cubre la autenticación, la forma
// por rol y que el rol se toma SOLO del token. Las historias siguientes agregan
// bloques para recepción, órdenes detenidas, mecánico y clientes por avisar.
// Corre contra `motorix_test`.
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

const ROLES = ['admin', 'recepcion', 'mecanico'];

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ROLES) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }

  // Un mantenimiento vencido que debe llegar a administración y recepción, no al mecánico.
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', [
    'Cliente de roles',
    '5552223333',
  ]);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, 'ROL-001-A', 'Mazda', 'CX-5', 2021]
  );
  const [mantenimiento] = await getPool().query(
    "INSERT INTO maintenance_plans (vehicle_id, description, target_date, status) VALUES (?, 'Mantenimiento vencido', '2025-06-15', 'PENDING')",
    [vehiculo.insertId]
  );
  return { tokens, mantenimientoId: mantenimiento.insertId };
}

const consultar = (token) =>
  request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);

describe('autenticación', () => {
  test('sin token responde 401', async () => {
    const respuesta = await request(app).get('/api/notifications');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  test('con un token inválido responde 401', async () => {
    const respuesta = await consultar('token-que-no-es-valido');

    expect(respuesta.status).toBe(401);
  });
});

describe('forma de la respuesta por rol', () => {
  test.each(ROLES)('%s recibe 200 con { total, noLeidos, datos }', async (usuario) => {
    const { tokens } = await prepararEntorno();

    const respuesta = await consultar(tokens[usuario]);

    expect(respuesta.status).toBe(200);
    expect(Object.keys(respuesta.body).sort()).toEqual(['datos', 'noLeidos', 'total']);
    expect(Array.isArray(respuesta.body.datos)).toBe(true);
    expect(respuesta.body.total).toBe(respuesta.body.datos.length);
    expect(respuesta.body.noLeidos).toBe(respuesta.body.datos.filter((aviso) => !aviso.leido).length);
  });

  test.each(['admin', 'recepcion'])('%s recibe el mantenimiento vencido', async (usuario) => {
    const { tokens, mantenimientoId } = await prepararEntorno();

    const respuesta = await consultar(tokens[usuario]);

    expect(respuesta.body.datos.map((aviso) => aviso.clave)).toEqual([
      `MANTENIMIENTO:${mantenimientoId}:VENCIDO`,
    ]);
  });

  test('el mecánico no recibe avisos de mantenimiento (solo los de sus órdenes)', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await consultar(tokens.mecanico);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });
});

describe('el rol y el usuario se toman solo del token (nada de la petición los cambia)', () => {
  test.each(ROLES)('%s recibe lo mismo con parámetros, cabeceras o cuerpo que pretenden otro rol', async (usuario) => {
    const { tokens } = await prepararEntorno();
    const base = await consultar(tokens[usuario]);
    expect(base.status).toBe(200);

    const variantes = [
      request(app).get('/api/notifications?rol=ADMIN&role=ADMIN&userId=1&usuario=admin'),
      request(app).get('/api/notifications?rol=MECHANIC&role=MECHANIC&mechanicId=999'),
      request(app).get('/api/notifications').set('X-Role', 'ADMIN').set('X-User-Id', '1'),
      request(app).get('/api/notifications').set('X-Role', 'MECHANIC'),
      request(app).get('/api/notifications').send({ role: 'ADMIN', userId: 1, rol: 'ADMIN' }),
    ];
    for (const variante of variantes) {
      const respuesta = await variante.set('Authorization', `Bearer ${tokens[usuario]}`);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual(base.body);
    }
  });

  test('el mecánico no obtiene avisos de administración aunque lo pida de varias formas', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await request(app)
      .get('/api/notifications?rol=ADMIN&role=ADMIN&userId=1')
      .set('Authorization', `Bearer ${tokens.mecanico}`)
      .set('X-Role', 'ADMIN');

    expect(respuesta.body.datos).toEqual([]);
    expect(JSON.stringify(respuesta.body)).not.toContain('MANTENIMIENTO:');
  });
});
