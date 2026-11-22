// 007-notificaciones-internas, T013 (US1; FR-004, CA-4): contrato por rol de
// `GET /api/notifications`. Este bloque inicial cubre la autenticación, la forma
// por rol y que el rol se toma SOLO del token. Las historias siguientes agregan
// bloques para recepción, órdenes detenidas, mecánico y clientes por avisar.
// Corre contra `motorix_test`.
import { jest } from '@jest/globals';
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

// --- US2 (T024): recepción recibe mantenimientos y citas, nunca stock -------

/** Un vencido, un próximo, una cita de hoy y una refacción en alerta de stock. */
async function sembrarAvisosDeRecepcion() {
  const pool = getPool();
  const fecha = new Date();
  const local = (dias) => {
    const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  };
  const [[cliente]] = await pool.query('SELECT id FROM clients LIMIT 1');
  const [[vehiculo]] = await pool.query('SELECT id FROM vehicles LIMIT 1');
  const [proximo] = await pool.query(
    "INSERT INTO maintenance_plans (vehicle_id, description, target_date, status) VALUES (?, 'Mantenimiento próximo', ?, 'PENDING')",
    [vehiculo.id, local(10)]
  );
  const [cita] = await pool.query(
    "INSERT INTO appointments (client_id, vehicle_id, appointment_date, appointment_time, reason) VALUES (?, ?, ?, '11:00:00', 'Revisión')",
    [cliente.id, vehiculo.id, local(0)]
  );
  // Refacción activa con stock por debajo del mínimo: solo ADMIN debe enterarse.
  await pool.query(
    "INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES ('Pastillas', 'ROL-PAS-001', 1, 5, 1)"
  );
  return { proximoId: proximo.insertId, citaId: cita.insertId };
}

describe('recepción: mantenimientos y citas, nunca stock (CA-4)', () => {
  test('RECEPTIONIST recibe vencido, próximo y cita del día', async () => {
    const { tokens, mantenimientoId } = await prepararEntorno();
    const { proximoId, citaId } = await sembrarAvisosDeRecepcion();

    const respuesta = await consultar(tokens.recepcion);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.map((aviso) => aviso.clave)).toEqual([
      `MANTENIMIENTO:${mantenimientoId}:VENCIDO`,
      `MANTENIMIENTO:${proximoId}:PROXIMO`,
      `CITA:${citaId}:HOY`,
    ]);
  });

  test('RECEPTIONIST no recibe ninguna clave STOCK: aunque existan refacciones en alerta', async () => {
    const { tokens } = await prepararEntorno();
    await sembrarAvisosDeRecepcion();

    const respuesta = await consultar(tokens.recepcion);

    expect(respuesta.body.datos.some((aviso) => aviso.grupo === 'STOCK')).toBe(false);
    expect(JSON.stringify(respuesta.body)).not.toContain('STOCK:');
  });

  test('ADMIN recibe los mismos mantenimientos y citas que recepción', async () => {
    const { tokens, mantenimientoId } = await prepararEntorno();
    const { proximoId, citaId } = await sembrarAvisosDeRecepcion();

    const respuesta = await consultar(tokens.admin);
    const claves = respuesta.body.datos.map((aviso) => aviso.clave);

    expect(claves).toEqual(
      expect.arrayContaining([
        `MANTENIMIENTO:${mantenimientoId}:VENCIDO`,
        `MANTENIMIENTO:${proximoId}:PROXIMO`,
        `CITA:${citaId}:HOY`,
      ])
    );
  });

  test('el mecánico no recibe mantenimientos ni citas', async () => {
    const { tokens } = await prepararEntorno();
    await sembrarAvisosDeRecepcion();

    const respuesta = await consultar(tokens.mecanico);

    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });
});

// --- US3 (T030): el stock es solo de administración (CA-4) ------------------

describe('stock: ADMIN lo ve; RECEPTIONIST y MECHANIC no lo reciben ni se calcula para ellos (CA-4)', () => {
  /** Refacciones en alerta: una baja y una agotada, más una con stock suficiente. */
  async function sembrarStock() {
    const pool = getPool();
    const [baja] = await pool.query(
      "INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES ('Pastillas', 'STK-BAJA', 1, 5, 1)"
    );
    const [agotada] = await pool.query(
      "INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES ('Batería', 'STK-AGOT', 0, 2, 1)"
    );
    await pool.query(
      "INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES ('Filtro', 'STK-OK', 30, 5, 1)"
    );
    return { bajaId: baja.insertId, agotadaId: agotada.insertId };
  }

  test('ADMIN recibe los avisos de stock bajo y agotado', async () => {
    const { tokens } = await prepararEntorno();
    const { bajaId, agotadaId } = await sembrarStock();

    const respuesta = await consultar(tokens.admin);

    expect(respuesta.status).toBe(200);
    const stock = respuesta.body.datos.filter((aviso) => aviso.grupo === 'STOCK').map((aviso) => aviso.clave);
    expect(stock).toEqual([`STOCK:${agotadaId}:AGOTADO`, `STOCK:${bajaId}:BAJO`]);
  });

  test.each(['recepcion', 'mecanico'])('%s no recibe ningún aviso de stock', async (usuario) => {
    const { tokens } = await prepararEntorno();
    await sembrarStock();

    const respuesta = await consultar(tokens[usuario]);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.some((aviso) => aviso.grupo === 'STOCK')).toBe(false);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/STOCK:|Stock bajo|Stock agotado|STK-/);
  });

  test('para RECEPTIONIST y MECHANIC ni siquiera se consulta la tabla de refacciones', async () => {
    const { tokens } = await prepararEntorno();
    await sembrarStock();
    const pool = getPool();
    const espia = jest.spyOn(pool, 'query');
    const consultasAParts = () =>
      espia.mock.calls.filter(([sql]) => /\bFROM\s+parts\b/i.test(String(sql?.sql ?? sql))).length;

    try {
      await consultar(tokens.recepcion);
      await consultar(tokens.mecanico);
      expect(consultasAParts()).toBe(0);

      await consultar(tokens.admin);
      expect(consultasAParts()).toBeGreaterThan(0);
    } finally {
      espia.mockRestore();
    }
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
