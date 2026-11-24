// 008-configuracion-seguridad-reportes, T066 (bloque P2, US5; FR-011 a FR-014,
// CA-20, CA-21): bitácora de acciones sensibles. Cada acción auditada genera su
// entrada; el administrador consulta paginado (50) con filtros por fecha,
// usuario y acción; nadie la edita ni la borra; ninguna entrada guarda
// contraseñas, hashes, tokens ni el importe del precio de compra; y una falla al
// escribir la bitácora no interrumpe la operación. Corre contra `motorix_test`.
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
import { registrar } from '../../services/audit-service.js';

const app = crearApp();

beforeAll(async () => {
  await prepararBaseDePruebas();
});

afterEach(async () => {
  await limpiarTablas();
  jest.restoreAllMocks();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

const CLAVE = 'Usuario123';

async function prepararEntorno() {
  const hash = await bcrypt.hash(CLAVE, 10);
  const ids = {};
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico', 'MECHANIC'],
  ]) {
    const [usuario] = await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
    ids[username] = usuario.insertId;
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico']) {
    const login = await request(app).post('/api/auth/login').send({ identificacion: username, contrasena: CLAVE });
    tokens[username] = login.body.token;
  }
  // Los inicios de sesión correctos no generan entradas: se parte de una bitácora vacía.
  await getPool().query('DELETE FROM audit_log');
  return { tokens, ids };
}

const con = (token) => ({ Authorization: `Bearer ${token}` });

async function entradas(filtro = '') {
  const [filas] = await getPool().query(`SELECT * FROM audit_log ${filtro} ORDER BY id ASC`);
  return filas;
}

const consultar = (token, consulta = '') => request(app).get(`/api/audit-log${consulta}`).set(con(token));

describe('inicios de sesión fallidos (LOGIN_FAILED)', () => {
  test('cuenta inexistente: usuario nulo y el identificador tecleado; la respuesta no cambia', async () => {
    await prepararEntorno();

    const respuesta = await request(app).post('/api/auth/login').send({ identificacion: 'nadie', contrasena: 'ClaveSecreta999' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      user_id: null,
      action: 'LOGIN_FAILED',
      entity_type: 'SESSION',
      entity_id: null,
      detail: 'Identificador: nadie',
    });
  });

  test('cuenta existente con contraseña incorrecta: queda el usuario de la cuenta', async () => {
    const { ids } = await prepararEntorno();

    const respuesta = await request(app).post('/api/auth/login').send({ identificacion: 'recepcion', contrasena: 'ClaveSecreta999' });

    expect(respuesta.status).toBe(401);
    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ user_id: ids.recepcion, action: 'LOGIN_FAILED', detail: 'Identificador: recepcion' });
  });

  test('cuenta inactiva: también se registra, con el usuario de la cuenta', async () => {
    const { ids } = await prepararEntorno();
    await getPool().query('UPDATE users SET active = 0 WHERE id = ?', [ids.mecanico]);

    const respuesta = await request(app).post('/api/auth/login').send({ identificacion: 'mecanico@motorix.local', contrasena: CLAVE });

    expect(respuesta.status).toBe(401);
    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ user_id: ids.mecanico, detail: 'Identificador: mecanico@motorix.local' });
  });

  test('un inicio de sesión correcto NO genera entrada', async () => {
    await prepararEntorno();

    const respuesta = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: CLAVE });

    expect(respuesta.status).toBe(200);
    expect(await entradas()).toHaveLength(0);
  });

  test('un identificador de 100 caracteres se registra completo y la contraseña nunca se guarda', async () => {
    await prepararEntorno();

    await request(app).post('/api/auth/login').send({ identificacion: 'x'.repeat(100), contrasena: 'ClaveSecreta999' });

    const filas = await entradas();
    expect(filas[0].detail).toBe(`Identificador: ${'x'.repeat(100)}`);
    expect(JSON.stringify(filas)).not.toContain('ClaveSecreta999');
  });

  test('un identificador de más de 100 caracteres ya lo rechaza la validación del login (400) y no es un fallo de credenciales', async () => {
    await prepararEntorno();

    const respuesta = await request(app).post('/api/auth/login').send({ identificacion: 'x'.repeat(150), contrasena: 'ClaveSecreta999' });

    // El truncado a 100 caracteres de la bitácora es una defensa adicional (ver audit-detail.test.js).
    expect(respuesta.status).toBe(400);
    expect(await entradas()).toHaveLength(0);
  });
});

describe('usuarios', () => {
  test('el alta registra USER_CREATED con quién y el rol, sin la contraseña ni el hash', async () => {
    const { tokens, ids } = await prepararEntorno();

    const alta = await request(app)
      .post('/api/users')
      .set(con(tokens.admin))
      .send({ username: 'nuevo', email: 'nuevo@motorix.local', fullName: 'Usuario Nuevo', role: 'RECEPTIONIST', password: 'Secreto123x' });

    expect(alta.status).toBe(201);
    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      user_id: ids.admin,
      action: 'USER_CREATED',
      entity_type: 'USER',
      entity_id: alta.body.id,
      detail: 'Rol: RECEPTIONIST',
    });
    expect(JSON.stringify(filas)).not.toContain('Secreto123x');
    expect(JSON.stringify(filas)).not.toContain('$2b$');
  });

  test('una alta rechazada (contraseña inválida o duplicado) no genera entrada', async () => {
    const { tokens } = await prepararEntorno();

    await request(app)
      .post('/api/users')
      .set(con(tokens.admin))
      .send({ username: 'debil', email: 'debil@motorix.local', fullName: 'Débil', role: 'MECHANIC', password: 'corta' });
    await request(app)
      .post('/api/users')
      .set(con(tokens.admin))
      .send({ username: 'recepcion', email: 'otro@motorix.local', fullName: 'Duplicado', role: 'MECHANIC', password: 'Secreto123x' });

    expect(await entradas()).toHaveLength(0);
  });

  test('baja y reactivación registran USER_DEACTIVATED y USER_REACTIVATED; repetir el mismo estado no registra', async () => {
    const { tokens, ids } = await prepararEntorno();
    const estado = (active) =>
      request(app).patch(`/api/users/${ids.mecanico}/status`).set(con(tokens.admin)).send({ active });

    expect((await estado(false)).status).toBe(204);
    expect((await estado(false)).status).toBe(204);
    expect((await estado(true)).status).toBe(204);
    expect((await estado(true)).status).toBe(204);

    const filas = await entradas();
    expect(filas.map((f) => f.action)).toEqual(['USER_DEACTIVATED', 'USER_REACTIVATED']);
    expect(filas[0]).toMatchObject({ user_id: ids.admin, entity_type: 'USER', entity_id: ids.mecanico, detail: null });
  });

  test('un cambio de rol registra USER_ROLE_CHANGED; editar sin cambiar el rol no registra', async () => {
    const { tokens, ids } = await prepararEntorno();
    const editar = (cuerpo) =>
      request(app)
        .put(`/api/users/${ids.mecanico}`)
        .set(con(tokens.admin))
        .send({ username: 'mecanico', email: 'mecanico@motorix.local', fullName: 'Mecánico', role: 'MECHANIC', ...cuerpo });

    expect((await editar({ fullName: 'Mecánico Renombrado' })).status).toBe(200);
    expect(await entradas()).toHaveLength(0);

    expect((await editar({ role: 'RECEPTIONIST' })).status).toBe(200);

    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      user_id: ids.admin,
      action: 'USER_ROLE_CHANGED',
      entity_id: ids.mecanico,
      detail: 'Rol: MECHANIC → RECEPTIONIST',
    });
  });
});

describe('configuración', () => {
  const guardar = (token, cuerpo) => request(app).put('/api/settings').set(con(token)).send(cuerpo);

  test('registra SETTINGS_UPDATED con las claves modificadas', async () => {
    const { tokens, ids } = await prepararEntorno();

    await guardar(tokens.admin, { taller: { nombre: 'Taller El Pistón', telefono: '555-123-4567' } });

    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      user_id: ids.admin,
      action: 'SETTINGS_UPDATED',
      entity_type: 'SETTINGS',
      entity_id: null,
      detail: 'Claves: shop.name, shop.phone',
    });
  });

  test('guardar valores que no cambian (incluido el respaldo) no registra nada; solo cuentan las claves que sí cambiaron', async () => {
    const { tokens } = await prepararEntorno();

    // Mismo valor que el de respaldo: no es un cambio.
    await guardar(tokens.admin, { taller: { nombre: 'Motorix' }, operacion: { margenProximoDias: 30 } });
    expect(await entradas()).toHaveLength(0);

    await guardar(tokens.admin, { taller: { nombre: 'Otro Nombre', direccion: 'Av. Taller 123, Col. Centro' } });
    await guardar(tokens.admin, { taller: { nombre: 'Otro Nombre' } });

    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0].detail).toBe('Claves: shop.name');
  });

  test('un guardado rechazado (400) no registra nada', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await guardar(tokens.admin, { operacion: { margenProximoDias: 0 } });

    expect(respuesta.status).toBe(400);
    expect(await entradas()).toHaveLength(0);
  });
});

describe('precios de refacciones', () => {
  async function crearRefaccion(token, extra = {}) {
    const respuesta = await request(app)
      .post('/api/parts')
      .set(con(token))
      .send({ name: 'Pastillas de freno', code: 'PAS-220', stock: 4, salePrice: 100, purchasePrice: 60, ...extra });
    return respuesta.body.id;
  }
  const editar = (token, id, cuerpo) => request(app).put(`/api/parts/${id}`).set(con(token)).send(cuerpo);

  test('un cambio del precio de venta registra anterior → nuevo', async () => {
    const { tokens, ids } = await prepararEntorno();
    const id = await crearRefaccion(tokens.admin);

    expect((await editar(tokens.admin, id, { salePrice: 120.5 })).status).toBe(200);

    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      user_id: ids.admin,
      action: 'PART_SALE_PRICE_CHANGED',
      entity_type: 'PART',
      entity_id: id,
      detail: 'Precio de venta: 100.00 → 120.50',
    });
  });

  test('un cambio del precio de compra registra que cambió SIN importes', async () => {
    const { tokens } = await prepararEntorno();
    const id = await crearRefaccion(tokens.admin);

    expect((await editar(tokens.admin, id, { purchasePrice: 73.25 })).status).toBe(200);

    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ action: 'PART_PURCHASE_PRICE_CHANGED', entity_id: id, detail: 'Precio de compra modificado' });
    const texto = JSON.stringify(filas);
    expect(texto).not.toContain('73.25');
    expect(texto).not.toContain('60.00');
  });

  test('cambiar ambos precios registra dos entradas; guardar los mismos valores o editar otros campos no registra', async () => {
    const { tokens } = await prepararEntorno();
    const id = await crearRefaccion(tokens.admin);

    await editar(tokens.admin, id, { salePrice: 100, purchasePrice: 60 });
    await editar(tokens.admin, id, { name: 'Pastillas delanteras', minStock: 3 });
    expect(await entradas()).toHaveLength(0);

    await editar(tokens.admin, id, { salePrice: 130, purchasePrice: 80 });
    const acciones = (await entradas()).map((f) => f.action).sort();
    expect(acciones).toEqual(['PART_PURCHASE_PRICE_CHANGED', 'PART_SALE_PRICE_CHANGED']);
  });

  test('dejar el precio de venta pendiente (null) se registra como «sin precio»', async () => {
    const { tokens } = await prepararEntorno();
    const id = await crearRefaccion(tokens.admin);

    await editar(tokens.admin, id, { salePrice: null });

    const filas = await entradas();
    expect(filas).toHaveLength(1);
    expect(filas[0].detail).toBe('Precio de venta: 100.00 → sin precio');
  });

  test('el alta de una refacción con precios no genera entrada', async () => {
    const { tokens } = await prepararEntorno();

    await crearRefaccion(tokens.admin);

    expect(await entradas()).toHaveLength(0);
  });
});

describe('consulta de la bitácora', () => {
  async function sembrar(cantidad, base = {}) {
    const valores = [];
    for (let i = 0; i < cantidad; i += 1) {
      valores.push([base.userId ?? null, base.accion ?? 'USER_CREATED', 'USER', i + 1, `Rol: ADMIN #${i + 1}`, base.fecha ?? '2026-11-10 10:00:00']);
    }
    await getPool().query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, created_at) VALUES ?',
      [valores]
    );
  }

  test('forma de la respuesta: página, total, usuario con nombre y entidad', async () => {
    const { tokens, ids } = await prepararEntorno();
    await getPool().query(
      "INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, created_at) VALUES (?, 'USER_ROLE_CHANGED', 'USER', 3, 'Rol: MECHANIC → RECEPTIONIST', '2026-11-20 10:15:00')",
      [ids.admin]
    );
    await getPool().query(
      "INSERT INTO audit_log (user_id, action, entity_type, detail, created_at) VALUES (NULL, 'LOGIN_FAILED', 'SESSION', 'Identificador: nadie', '2026-11-21 09:00:00')"
    );

    const respuesta = await consultar(tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ pagina: 1, totalPaginas: 1, total: 2 });
    expect(respuesta.body.datos).toHaveLength(2);
    // Más reciente primero.
    expect(respuesta.body.datos[0]).toMatchObject({
      accion: 'LOGIN_FAILED',
      usuario: null,
      entidad: 'SESSION',
      entidadId: null,
      detalle: 'Identificador: nadie',
    });
    expect(respuesta.body.datos[1]).toMatchObject({
      id: expect.any(Number),
      usuario: { id: ids.admin, nombre: 'Administrador' },
      accion: 'USER_ROLE_CHANGED',
      entidad: 'USER',
      entidadId: 3,
      detalle: 'Rol: MECHANIC → RECEPTIONIST',
    });
    expect(new Date(respuesta.body.datos[1].fecha).toString()).not.toBe('Invalid Date');
  });

  test('sin entradas: lista vacía y una sola página', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await consultar(tokens.admin);

    expect(respuesta.body).toEqual({ pagina: 1, totalPaginas: 1, total: 0, datos: [] });
  });

  test('pagina de 50 en 50 con el orden de más reciente a más antiguo', async () => {
    const { tokens } = await prepararEntorno();
    await sembrar(120);

    const uno = await consultar(tokens.admin);
    const tres = await consultar(tokens.admin, '?pagina=3');
    const cuatro = await consultar(tokens.admin, '?pagina=4');

    expect(uno.body).toMatchObject({ pagina: 1, totalPaginas: 3, total: 120 });
    expect(uno.body.datos).toHaveLength(50);
    expect(tres.body.datos).toHaveLength(20);
    expect(cuatro.body.datos).toHaveLength(0);
    // Mismo instante: el desempate es el id descendente.
    expect(uno.body.datos[0].id).toBeGreaterThan(uno.body.datos[49].id);
  });

  test('filtra por rango de fechas inclusivo (hora local)', async () => {
    const { tokens } = await prepararEntorno();
    await sembrar(1, { fecha: '2026-11-09 23:59:59' });
    await sembrar(1, { fecha: '2026-11-10 00:00:00' });
    await sembrar(1, { fecha: '2026-11-12 23:59:59' });
    await sembrar(1, { fecha: '2026-11-13 00:00:00' });

    const rango = await consultar(tokens.admin, '?desde=2026-11-10&hasta=2026-11-12');
    const soloDesde = await consultar(tokens.admin, '?desde=2026-11-12');
    const soloHasta = await consultar(tokens.admin, '?hasta=2026-11-09');

    expect(rango.body.total).toBe(2);
    expect(soloDesde.body.total).toBe(2);
    expect(soloHasta.body.total).toBe(1);
  });

  test('filtra por usuario y por acción', async () => {
    const { tokens, ids } = await prepararEntorno();
    await sembrar(2, { userId: ids.admin, accion: 'USER_CREATED' });
    await sembrar(3, { userId: ids.recepcion, accion: 'SETTINGS_UPDATED' });
    await sembrar(1, { userId: null, accion: 'LOGIN_FAILED' });

    const porUsuario = await consultar(tokens.admin, `?usuarioId=${ids.recepcion}`);
    const porAccion = await consultar(tokens.admin, '?accion=LOGIN_FAILED');
    const combinado = await consultar(tokens.admin, `?usuarioId=${ids.admin}&accion=SETTINGS_UPDATED`);

    expect(porUsuario.body.total).toBe(3);
    expect(porAccion.body.total).toBe(1);
    expect(combinado.body.total).toBe(0);
  });

  test.each([
    ['?desde=ayer'],
    ['?hasta=2026-13-45'],
    ['?desde=2026-11-20&hasta=2026-11-01'],
    ['?usuarioId=abc'],
    ['?usuarioId=0'],
    ['?accion=BORRAR_TODO'],
    ['?pagina=0'],
    ['?pagina=-1'],
    ['?pagina=uno'],
  ])('un filtro inválido %s responde 400 DATOS_INVALIDOS', async (consulta) => {
    const { tokens } = await prepararEntorno();

    const respuesta = await consultar(tokens.admin, consulta);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('la bitácora no se edita, borra ni exporta', () => {
  test.each([
    ['post', '/api/audit-log'],
    ['put', '/api/audit-log/1'],
    ['patch', '/api/audit-log/1'],
    ['delete', '/api/audit-log/1'],
    ['delete', '/api/audit-log'],
    ['get', '/api/audit-log/export'],
    ['get', '/api/audit-log/1'],
  ])('%s %s no existe (404)', async (metodo, ruta) => {
    const { tokens } = await prepararEntorno();
    await getPool().query("INSERT INTO audit_log (action, entity_type) VALUES ('LOGIN_FAILED', 'SESSION')");

    const respuesta = await request(app)[metodo](ruta).set(con(tokens.admin)).send({});

    expect(respuesta.status).toBe(404);
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM audit_log');
    expect(Number(total)).toBe(1);
  });
});

describe('ningún secreto llega a la bitácora (CA-21)', () => {
  test('tras recorrer todas las acciones, ninguna entrada contiene contraseñas, hashes ni tokens', async () => {
    const { tokens, ids } = await prepararEntorno();
    await request(app).post('/api/auth/login').send({ identificacion: 'recepcion', contrasena: 'ClaveSecreta999' });
    await request(app)
      .post('/api/users')
      .set(con(tokens.admin))
      .send({ username: 'otro', email: 'otro@motorix.local', fullName: 'Otro', role: 'MECHANIC', password: 'Secreto123x' });
    await request(app).put(`/api/users/${ids.mecanico}`).set(con(tokens.admin)).send({ username: 'mecanico', email: 'mecanico@motorix.local', fullName: 'Mec', role: 'RECEPTIONIST' });
    await request(app).put('/api/settings').set(con(tokens.admin)).send({ taller: { nombre: 'Nuevo' } });
    const parte = await request(app).post('/api/parts').set(con(tokens.admin)).send({ name: 'P', code: 'P-1', stock: 1, salePrice: 10, purchasePrice: 5 });
    await request(app).put(`/api/parts/${parte.body.id}`).set(con(tokens.admin)).send({ salePrice: 11, purchasePrice: 6.5 });

    const texto = JSON.stringify(await entradas()) + JSON.stringify((await consultar(tokens.admin)).body);

    for (const secreto of ['ClaveSecreta999', 'Secreto123x', CLAVE, '$2b$', 'eyJ', tokens.admin, '6.50']) {
      expect(texto).not.toContain(secreto);
    }
    expect((await entradas()).length).toBeGreaterThanOrEqual(6);
  });
});

describe('fallas al escribir la bitácora', () => {
  test('registrar nunca lanza: ante un error de base de datos lo registra en el log del servidor', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Un usuario inexistente viola la llave foránea de audit_log.
    await expect(registrar('USER_CREATED', { usuarioId: 999999, entidadId: 1, datos: { rol: 'ADMIN' } })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    const [[mensaje]] = error.mock.calls;
    expect(String(mensaje)).toMatch(/bit[aá]cora/i);
  });

  test('si la bitácora falla, la operación principal sigue funcionando', async () => {
    const { tokens } = await prepararEntorno();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Se quita la tabla de la bitácora temporalmente: escribirla fallará.
    await getPool().query('RENAME TABLE audit_log TO audit_log_oculta');
    try {
      const alta = await request(app)
        .post('/api/users')
        .set(con(tokens.admin))
        .send({ username: 'resiste', email: 'resiste@motorix.local', fullName: 'Resiste', role: 'MECHANIC', password: 'Secreto123x' });
      const login = await request(app).post('/api/auth/login').send({ identificacion: 'nadie', contrasena: 'Mala12345' });

      expect(alta.status).toBe(201);
      expect(login.status).toBe(401);
      expect(login.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    } finally {
      await getPool().query('RENAME TABLE audit_log_oculta TO audit_log');
    }
  });
});
