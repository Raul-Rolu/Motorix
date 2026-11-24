// 008-configuracion-seguridad-reportes, T078 (bloque P2, US6; FR-017, CA-24):
// ninguna respuesta de la API incluye el hash de contraseña, un token (salvo en el
// inicio de sesión y la renovación) ni, para RECEPTIONIST y MECHANIC, el precio de
// compra. Recorre los endpoints de usuarios, refacciones, órdenes, pagos y
// tickets (y otros de lectura) con cada rol, sin importar el código de estado
// (un 403 tampoco debe filtrar nada). Con datos reales que SÍ contienen esos
// valores en la base, de modo que la prueba no es vacía. Corre contra `motorix_test`.
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

const CLAVE = 'Usuario123';
const PRECIO_COMPRA = 73.25;
const ROLES = ['admin', 'recepcion', 'mecanico'];

/** Prepara usuarios, una refacción con precio de compra, una orden con refacción, pago y ticket. */
async function prepararEntorno() {
  const hash = await bcrypt.hash(CLAVE, 10);
  const ids = {};
  for (const [username, rol] of [
    ['admin', 'ADMIN'],
    ['recepcion', 'RECEPTIONIST'],
    ['mecanico', 'MECHANIC'],
  ]) {
    const [usuario] = await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, `Usuario ${username}`, rol]
    );
    ids[username] = usuario.insertId;
  }
  const tokens = {};
  for (const username of ROLES) {
    tokens[username] = (await request(app).post('/api/auth/login').send({ identificacion: username, contrasena: CLAVE })).body.token;
  }
  const auth = (rol) => ({ Authorization: `Bearer ${tokens[rol]}` });

  const parte = await request(app)
    .post('/api/parts')
    .set(auth('admin'))
    .send({ name: 'Pastillas de freno', code: 'PAS-220', stock: 10, minStock: 2, salePrice: 150, purchasePrice: PRECIO_COMPRA });

  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', ['Cliente Exposición', '5550001111']);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, 'EXP-001-A', 'Nissan', 'Versa', 2020]
  );
  const [orden] = await getPool().query(
    `INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason)
     VALUES (?, ?, ?, 'DIAGNOSTICO', 50000, 'Prueba de exposición')`,
    [cliente.insertId, vehiculo.insertId, ids.mecanico]
  );
  await getPool().query("INSERT INTO order_services (order_id, description, amount) VALUES (?, 'Cambio de pastillas', 400)", [orden.insertId]);
  await request(app).post(`/api/orders/${orden.insertId}/parts`).set(auth('admin')).send({ partId: parte.body.id, quantity: 1 });
  const [pago] = await getPool().query(
    "INSERT INTO payments (order_id, method, amount, status) VALUES (?, 'CASH', 100, 'COMPLETED')",
    [orden.insertId]
  );
  await request(app).get(`/api/tickets/${orden.insertId}`).set(auth('admin'));

  return { tokens, ids, auth, parteId: parte.body.id, ordenId: orden.insertId, vehiculoId: vehiculo.insertId, pagoId: pago.insertId };
}

/** Todas las claves de un valor JSON, en cualquier nivel. */
function claves(valor, acumulado = new Set()) {
  if (Array.isArray(valor)) {
    valor.forEach((elemento) => claves(elemento, acumulado));
  } else if (valor && typeof valor === 'object') {
    for (const [clave, interno] of Object.entries(valor)) {
      acumulado.add(clave);
      claves(interno, acumulado);
    }
  }
  return acumulado;
}

const FORMA_DE_TOKEN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/;
const CLAVES_PROHIBIDAS = /^(password|passwordhash|password_hash|contrasena|contrasenaactual|contrasenanueva|hash|secret|jwt_secret)$/i;

/**
 * Comprueba que un cuerpo de respuesta no exponga datos reservados.
 * `permiteToken`: solo el inicio de sesión y la renovación devuelven `token`.
 */
function sinDatosReservados(cuerpo, { rol, tokens, permiteToken = false, ruta = '' }) {
  const texto = JSON.stringify(cuerpo ?? {});
  const donde = `${rol} ${ruta}`;

  expect({ donde, filtraHash: /passwordHash|password_hash/i.test(texto) }).toEqual({ donde, filtraHash: false });
  expect(texto).not.toMatch(/\$2[aby]\$\d{2}\$/);
  expect(texto).not.toMatch(/ER_[A-Z_]+|SQL syntax|at .*\.js:\d+/);
  for (const clave of claves(cuerpo)) {
    expect({ donde, clave, prohibida: CLAVES_PROHIBIDAS.test(clave) }).toEqual({ donde, clave, prohibida: false });
    if (!permiteToken) {
      expect({ donde, clave, token: /^token$/i.test(clave) }).toEqual({ donde, clave, token: false });
    }
  }
  if (!permiteToken) {
    expect(texto).not.toMatch(FORMA_DE_TOKEN);
  }
  for (const token of Object.values(tokens)) {
    if (!permiteToken) {
      expect(texto).not.toContain(token);
    }
  }
  if (rol !== 'admin') {
    // El precio de compra es exclusivo de ADMIN (CA-24, RN-14).
    expect(texto).not.toMatch(/purchase_?price/i);
    expect(texto).not.toContain(String(PRECIO_COMPRA));
  }
}

test('el inicio de sesión devuelve un token pero nunca el hash ni la contraseña', async () => {
  const { tokens } = await prepararEntorno();

  for (const username of ROLES) {
    const respuesta = await request(app).post('/api/auth/login').send({ identificacion: username, contrasena: CLAVE });

    expect(respuesta.status).toBe(200);
    expect(Object.keys(respuesta.body).sort()).toEqual(['inactividadMinutos', 'token', 'usuario']);
    sinDatosReservados(respuesta.body.usuario, { rol: username, tokens, ruta: 'login.usuario' });
    expect(JSON.stringify(respuesta.body)).not.toContain(CLAVE);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/\$2[aby]\$/);
  }
});

test('la renovación devuelve solo el token nuevo y la vigencia', async () => {
  const { tokens } = await prepararEntorno();

  const respuesta = await request(app).post('/api/auth/renew').set({ Authorization: `Bearer ${tokens.admin}` });

  expect(respuesta.status).toBe(200);
  expect(Object.keys(respuesta.body).sort()).toEqual(['inactividadMinutos', 'token']);
});

describe('lecturas con cada rol', () => {
  test.each(ROLES)('%s: ninguna respuesta expone hashes, tokens ni (salvo ADMIN) el precio de compra', async (rol) => {
    const contexto = await prepararEntorno();
    const { tokens, auth, ids, parteId, ordenId, vehiculoId, pagoId } = contexto;
    const rutas = [
      '/api/me',
      '/api/users',
      `/api/users/${ids.admin}`,
      `/api/users/${ids.mecanico}`,
      '/api/parts',
      `/api/parts/${parteId}/movements`,
      '/api/orders',
      `/api/orders/${ordenId}`,
      `/api/orders/${ordenId}/payments`,
      `/api/payments/${pagoId}`,
      `/api/tickets/${ordenId}`,
      `/api/vehicles/${vehiculoId}/history`,
      '/api/maintenances',
      '/api/dashboard',
      '/api/notifications',
      '/api/service-types',
    ];

    for (const ruta of rutas) {
      const respuesta = await request(app).get(ruta).set(auth(rol));

      expect(respuesta.status).toBeLessThan(500);
      sinDatosReservados(respuesta.body, { rol, tokens, ruta });
    }
  });

  test('prueba no vacía: ADMIN sí ve el precio de compra y los demás roles lo reciben sin él', async () => {
    const { auth, parteId } = await prepararEntorno();

    const admin = await request(app).get('/api/parts').set(auth('admin'));
    const recepcion = await request(app).get('/api/parts').set(auth('recepcion'));
    const mecanico = await request(app).get('/api/parts').set(auth('mecanico'));

    expect(admin.body.datos.find((p) => p.id === parteId).purchasePrice).toBe(PRECIO_COMPRA);
    for (const respuesta of [recepcion, mecanico]) {
      const parte = respuesta.body.datos.find((p) => p.id === parteId);
      expect(parte).toBeDefined();
      expect(parte).not.toHaveProperty('purchasePrice');
    }
  });

  test('los permisos: usuarios solo ADMIN; tickets solo ADMIN y RECEPTIONIST', async () => {
    const { auth, ids, ordenId } = await prepararEntorno();

    expect((await request(app).get('/api/users').set(auth('admin'))).status).toBe(200);
    for (const rol of ['recepcion', 'mecanico']) {
      expect((await request(app).get('/api/users').set(auth(rol))).status).toBe(403);
      expect((await request(app).get(`/api/users/${ids.admin}`).set(auth(rol))).status).toBe(403);
    }
    expect((await request(app).get(`/api/tickets/${ordenId}`).set(auth('recepcion'))).status).toBe(200);
    expect((await request(app).get(`/api/tickets/${ordenId}`).set(auth('mecanico'))).status).toBe(403);
  });

  test('el mecánico asignado ve su orden con las refacciones y sus precios de venta, pero no el de compra', async () => {
    const { auth, ordenId } = await prepararEntorno();

    const respuesta = await request(app).get(`/api/orders/${ordenId}`).set(auth('mecanico'));

    expect(respuesta.status).toBe(200);
    expect(JSON.stringify(respuesta.body)).toContain('Pastillas de freno');
    expect(JSON.stringify(respuesta.body)).not.toMatch(/purchase_?price/i);
  });
});

describe('altas y cambios (respuestas de escritura)', () => {
  test('ADMIN: crear, editar y desactivar usuarios no devuelve hash ni contraseña', async () => {
    const { tokens, auth, ids } = await prepararEntorno();

    const alta = await request(app)
      .post('/api/users')
      .set(auth('admin'))
      .send({ username: 'nuevo', email: 'nuevo@motorix.local', fullName: 'Nuevo', role: 'MECHANIC', password: 'Secreto123x' });
    const edicion = await request(app)
      .put(`/api/users/${ids.recepcion}`)
      .set(auth('admin'))
      .send({ username: 'recepcion', email: 'recepcion@motorix.local', fullName: 'Recepción Editada', role: 'RECEPTIONIST' });
    const estado = await request(app).patch(`/api/users/${alta.body.id}/status`).set(auth('admin')).send({ active: false });

    expect(alta.status).toBe(201);
    expect(edicion.status).toBe(200);
    expect(estado.status).toBe(204);
    for (const [nombre, respuesta] of [['alta', alta], ['edición', edicion]]) {
      sinDatosReservados(respuesta.body, { rol: 'admin', tokens, ruta: `users ${nombre}` });
      expect(JSON.stringify(respuesta.body)).not.toContain('Secreto123x');
    }
  });

  test('ADMIN: crear y editar refacciones responde con el precio de compra solo a ADMIN (y nunca hashes ni tokens)', async () => {
    const { tokens, auth, parteId } = await prepararEntorno();

    const alta = await request(app)
      .post('/api/parts')
      .set(auth('admin'))
      .send({ name: 'Filtro', code: 'FLT-1', stock: 3, salePrice: 90, purchasePrice: 40 });
    const edicion = await request(app).put(`/api/parts/${parteId}`).set(auth('admin')).send({ purchasePrice: 80 });

    expect(alta.status).toBe(201);
    expect(edicion.status).toBe(200);
    for (const respuesta of [alta, edicion]) {
      sinDatosReservados(respuesta.body, { rol: 'admin', tokens, ruta: 'parts escritura' });
    }
  });

  test.each(['recepcion', 'mecanico'])('%s no puede crear ni editar refacciones ni usuarios (403) y el rechazo no filtra datos', async (rol) => {
    const { tokens, auth, parteId, ids } = await prepararEntorno();

    const respuestas = [
      await request(app).post('/api/parts').set(auth(rol)).send({ name: 'X', code: 'X-1', stock: 1, salePrice: 1, purchasePrice: 1 }),
      await request(app).put(`/api/parts/${parteId}`).set(auth(rol)).send({ purchasePrice: 1 }),
      await request(app).post('/api/users').set(auth(rol)).send({ username: 'x', email: 'x@x.com', fullName: 'X', role: 'ADMIN', password: 'Secreto123x' }),
      await request(app).put(`/api/users/${ids.admin}`).set(auth(rol)).send({ username: 'admin', email: 'admin@motorix.local', fullName: 'X', role: 'MECHANIC' }),
    ];

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(403);
      sinDatosReservados(respuesta.body, { rol, tokens, ruta: 'escritura prohibida' });
    }
  });

  test('cambiar la contraseña responde sin cuerpo (204) y no devuelve la nueva ni el hash', async () => {
    const { auth } = await prepararEntorno();

    const respuesta = await request(app)
      .post('/api/auth/change-password')
      .set(auth('recepcion'))
      .send({ contrasenaActual: CLAVE, contrasenaNueva: 'NuevaClave456' });

    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe('');
  });
});

describe('errores', () => {
  test('un error de autenticación o de datos no expone trazas, hashes ni tokens', async () => {
    await prepararEntorno();

    const respuestas = [
      await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: 'Incorrecta999' }),
      await request(app).post('/api/auth/login').send({}),
      await request(app).get('/api/users'),
      await request(app).get('/api/users').set({ Authorization: 'Bearer token-falso' }),
    ];

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBeGreaterThanOrEqual(400);
      expect(respuesta.status).toBeLessThan(500);
      expect(Object.keys(respuesta.body)).toEqual(['error']);
      expect(JSON.stringify(respuesta.body)).not.toMatch(/\$2[aby]\$|passwordHash|stack|ER_/);
    }
  });
});
