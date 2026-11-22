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

// --- US4 (T039): administración y recepción reciben TODAS las órdenes detenidas ---

describe('órdenes detenidas: ADMIN y RECEPTIONIST reciben todas (CA-4)', () => {
  /** Tres órdenes detenidas: de un mecánico, de otro y sin mecánico asignado. */
  async function sembrarOrdenesDetenidas() {
    const pool = getPool();
    const hash = await bcrypt.hash('Usuario123', 10);
    const [segundo] = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('mecanico2', 'mecanico2@motorix.local', ?, 'Segundo Mecánico', 'MECHANIC')",
      [hash]
    );
    const [[primero]] = await pool.query("SELECT id FROM users WHERE username = 'mecanico'");
    const [[cliente]] = await pool.query('SELECT id FROM clients LIMIT 1');
    const [[vehiculo]] = await pool.query('SELECT id FROM vehicles LIMIT 1');
    const insertar = async (mecanicoId) => {
      const [orden] = await pool.query(
        "INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason, status_changed_at) VALUES (?, ?, ?, 'DIAGNOSTICO', 40000, 'Ruido', DATE_SUB(NOW(), INTERVAL 5 DAY))",
        [cliente.id, vehiculo.id, mecanicoId]
      );
      return orden.insertId;
    };
    return {
      deMecanico1: await insertar(primero.id),
      deMecanico2: await insertar(segundo.insertId),
      sinMecanico: await insertar(null),
    };
  }

  test.each(['admin', 'recepcion'])('%s recibe las órdenes detenidas de cualquier mecánico y las no asignadas', async (usuario) => {
    const { tokens } = await prepararEntorno();
    const ids = await sembrarOrdenesDetenidas();

    const respuesta = await consultar(tokens[usuario]);

    const ordenes = respuesta.body.datos.filter((aviso) => aviso.grupo === 'ORDEN_DETENIDA');
    expect(ordenes.map((aviso) => aviso.clave).sort()).toEqual(
      [ids.deMecanico1, ids.deMecanico2, ids.sinMecanico].map((id) => `ORDEN:${id}:DETENIDA`).sort()
    );
  });

  test('una orden reciente (3 días o menos) no se envía a nadie', async () => {
    const { tokens } = await prepararEntorno();
    const [[cliente]] = await getPool().query('SELECT id FROM clients LIMIT 1');
    const [[vehiculo]] = await getPool().query('SELECT id FROM vehicles LIMIT 1');
    await getPool().query(
      "INSERT INTO service_orders (client_id, vehicle_id, status, mileage_entry, reason, status_changed_at) VALUES (?, ?, 'DIAGNOSTICO', 40000, 'Ruido', DATE_SUB(NOW(), INTERVAL 2 DAY))",
      [cliente.id, vehiculo.id]
    );

    for (const usuario of ['admin', 'recepcion']) {
      const respuesta = await consultar(tokens[usuario]);
      expect(respuesta.body.datos.some((aviso) => aviso.grupo === 'ORDEN_DETENIDA')).toBe(false);
    }
  });
});

// --- US5 (T046): el mecánico solo recibe avisos de SUS órdenes asignadas ------

describe('mecánico: solo órdenes detenidas asignadas a él (CA-4)', () => {
  /**
   * Órdenes detenidas de los dos mecánicos y una sin asignar, más una orden
   * reciente del primero, y todos los demás tipos de aviso (mantenimiento
   * vencido, próximo, cita de hoy y stock) que el mecánico nunca debe recibir.
   */
  async function sembrarEscenarioDeMecanicos(tokens, mantenimientoId) {
    const pool = getPool();
    const hash = await bcrypt.hash('Usuario123', 10);
    await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('mecanico2', 'mecanico2@motorix.local', ?, 'Segundo Mecánico', 'MECHANIC')",
      [hash]
    );
    const login2 = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: 'mecanico2', contrasena: 'Usuario123' });
    const [[primero]] = await pool.query("SELECT id FROM users WHERE username = 'mecanico'");
    const [[segundo]] = await pool.query("SELECT id FROM users WHERE username = 'mecanico2'");
    const [[cliente]] = await pool.query('SELECT id FROM clients LIMIT 1');
    const [[vehiculo]] = await pool.query('SELECT id FROM vehicles LIMIT 1');

    const insertar = async (mecanicoId, intervalo) => {
      const [orden] = await pool.query(
        `INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason, status_changed_at)
         VALUES (?, ?, ?, 'DIAGNOSTICO', 40000, 'Ruido', DATE_SUB(NOW(), INTERVAL ${intervalo}))`,
        [cliente.id, vehiculo.id, mecanicoId]
      );
      return orden.insertId;
    };
    const ordenes = {
      detenidaDe1: await insertar(primero.id, '5 DAY'),
      detenidaDe2: await insertar(segundo.id, '6 DAY'),
      detenidaSinMecanico: await insertar(null, '7 DAY'),
      recienteDe1: await insertar(primero.id, '1 DAY'),
    };

    // Los demás tipos de aviso, que el mecánico nunca debe recibir.
    const dia = new Date();
    const hoy = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
    await pool.query(
      "INSERT INTO maintenance_plans (vehicle_id, description, target_date, status) VALUES (?, 'Próximo', DATE_ADD(CURDATE(), INTERVAL 10 DAY), 'PENDING')",
      [vehiculo.id]
    );
    await pool.query(
      "INSERT INTO appointments (client_id, vehicle_id, appointment_date, appointment_time, reason) VALUES (?, ?, ?, '09:00:00', 'Revisión')",
      [cliente.id, vehiculo.id, hoy]
    );
    await pool.query("INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES ('Pastillas', 'MEC-PAS', 0, 5, 1)");

    return { ...ordenes, mantenimientoId, token2: login2.body.token, tokens };
  }

  const clave = (id) => `ORDEN:${id}:DETENIDA`;

  test('recibe solo las órdenes detenidas asignadas a él y ningún otro tipo de aviso', async () => {
    const { tokens, mantenimientoId } = await prepararEntorno();
    const escenario = await sembrarEscenarioDeMecanicos(tokens, mantenimientoId);

    const respuesta = await consultar(tokens.mecanico);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.map((aviso) => aviso.clave)).toEqual([clave(escenario.detenidaDe1)]);
    expect(respuesta.body.total).toBe(1);
    expect(respuesta.body.noLeidos).toBe(1);
    // Ni mantenimientos, ni citas, ni stock aunque existan.
    expect(JSON.stringify(respuesta.body)).not.toMatch(/MANTENIMIENTO:|CITA:|STOCK:/);
  });

  test('cada mecánico recibe solo las suyas', async () => {
    const { tokens, mantenimientoId } = await prepararEntorno();
    const escenario = await sembrarEscenarioDeMecanicos(tokens, mantenimientoId);

    const primero = await consultar(tokens.mecanico);
    const segundo = await consultar(escenario.token2);

    expect(primero.body.datos.map((aviso) => aviso.clave)).toEqual([clave(escenario.detenidaDe1)]);
    expect(segundo.body.datos.map((aviso) => aviso.clave)).toEqual([clave(escenario.detenidaDe2)]);
  });

  test('una orden detenida sin mecánico no se devuelve a ningún mecánico', async () => {
    const { tokens, mantenimientoId } = await prepararEntorno();
    const escenario = await sembrarEscenarioDeMecanicos(tokens, mantenimientoId);

    for (const token of [tokens.mecanico, escenario.token2]) {
      const respuesta = await consultar(token);
      expect(JSON.stringify(respuesta.body)).not.toContain(clave(escenario.detenidaSinMecanico));
    }
    // Administración y recepción sí la reciben.
    const admin = await consultar(tokens.admin);
    expect(admin.body.datos.map((aviso) => aviso.clave)).toContain(clave(escenario.detenidaSinMecanico));
  });

  test('reasignar la orden cambia el destinatario del aviso', async () => {
    const { tokens, mantenimientoId } = await prepararEntorno();
    const escenario = await sembrarEscenarioDeMecanicos(tokens, mantenimientoId);
    const [[segundo]] = await getPool().query("SELECT id FROM users WHERE username = 'mecanico2'");

    const asignacion = await request(app)
      .patch(`/api/orders/${escenario.detenidaDe1}/assignment`)
      .set('Authorization', `Bearer ${tokens.recepcion}`)
      .send({ mechanicId: segundo.id });
    expect(asignacion.status).toBe(200);

    const primero = await consultar(tokens.mecanico);
    const segundoMecanico = await consultar(escenario.token2);
    expect(primero.body.datos).toEqual([]);
    expect(segundoMecanico.body.datos.map((aviso) => aviso.clave).sort()).toEqual(
      [clave(escenario.detenidaDe1), clave(escenario.detenidaDe2)].sort()
    );
  });

  test('sin órdenes propias detenidas recibe una lista vacía', async () => {
    const { tokens } = await prepararEntorno();
    await getPool().query('SELECT 1');

    const respuesta = await consultar(tokens.mecanico);

    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('para el mecánico no se ejecutan las consultas de otros tipos de aviso', async () => {
    const { tokens, mantenimientoId } = await prepararEntorno();
    await sembrarEscenarioDeMecanicos(tokens, mantenimientoId);
    const espia = jest.spyOn(getPool(), 'query');
    const sqlEjecutado = () => espia.mock.calls.map(([sql]) => String(sql?.sql ?? sql)).join('\n');

    try {
      await consultar(tokens.mecanico);
      const consultas = sqlEjecutado();
      // Solo se consultan sus órdenes (más la autenticación); nada de mantenimientos, citas ni refacciones.
      expect(consultas).toMatch(/service_orders/);
      expect(consultas).not.toMatch(/maintenance_plans/);
      expect(consultas).not.toMatch(/appointments/);
      expect(consultas).not.toMatch(/\bparts\b/);
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
