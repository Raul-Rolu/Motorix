// 008-configuracion-seguridad-reportes, T077 (bloque P2, US6; FR-016, CA-23): la
// vigencia del token es el ajuste de inactividad (30 minutos por omisión; el
// administrador la cambia de 5 a 120), el login informa `inactividadMinutos`,
// `POST /api/auth/renew` entrega un token nuevo de esa vigencia y NINGUNA otra
// ruta renueva ni emite token (la consulta periódica de avisos no extiende la
// sesión). El backend sigue rechazando tokens vencidos, de otro secreto o de
// usuarios desactivados. Corre contra `motorix_test`.
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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

const CLAVE = 'Usuario123';

async function crearUsuarios() {
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
  return ids;
}

const iniciarSesion = (username) =>
  request(app).post('/api/auth/login').send({ identificacion: username, contrasena: CLAVE });

const renovar = (token) => request(app).post('/api/auth/renew').set('Authorization', `Bearer ${token}`);

/** Vigencia en segundos del token (exp − iat). */
const vigencia = (token) => {
  const { exp, iat } = jwt.decode(token);
  return exp - iat;
};

async function guardarInactividad(token, minutos) {
  return request(app)
    .put('/api/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({ seguridad: { minutosInactividad: minutos } });
}

describe('vigencia del token en el inicio de sesión', () => {
  test('sin ajuste guardado el token dura 30 minutos y el login informa inactividadMinutos: 30', async () => {
    await crearUsuarios();

    const login = await iniciarSesion('admin');

    expect(login.status).toBe(200);
    expect(login.body.inactividadMinutos).toBe(30);
    expect(vigencia(login.body.token)).toBe(30 * 60);
  });

  test('con el ajuste en 10 minutos el token dura 10 minutos', async () => {
    await crearUsuarios();
    await getPool().query("INSERT INTO settings (setting_key, setting_value) VALUES ('session.inactivity_minutes', '10')");

    const login = await iniciarSesion('recepcion');

    expect(login.body.inactividadMinutos).toBe(10);
    expect(vigencia(login.body.token)).toBe(10 * 60);
  });

  test('un valor guardado inválido en la base cae al respaldo de 30 minutos (el login no falla)', async () => {
    await crearUsuarios();
    await getPool().query("INSERT INTO settings (setting_key, setting_value) VALUES ('session.inactivity_minutes', '4')");

    const login = await iniciarSesion('admin');

    expect(login.status).toBe(200);
    expect(login.body.inactividadMinutos).toBe(30);
  });

  test('el payload del token conserva solo sub, username y role', async () => {
    const ids = await crearUsuarios();

    const { token } = (await iniciarSesion('mecanico')).body;

    const { sub, username, role, iat, exp, ...otros } = jwt.decode(token);
    expect({ sub, username, role }).toEqual({ sub: ids.mecanico, username: 'mecanico', role: 'MECHANIC' });
    expect(Object.keys(otros)).toEqual([]);
    expect(iat).toBeLessThan(exp);
  });
});

describe('el administrador cambia la inactividad (grupo seguridad de /api/settings)', () => {
  test('GET /api/settings ya expone el grupo seguridad y su límite', async () => {
    await crearUsuarios();
    const { token } = (await iniciarSesion('admin')).body;

    const respuesta = await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.seguridad).toEqual({ minutosInactividad: 30 });
    expect(respuesta.body.limites.minutosInactividad).toEqual([5, 120]);
  });

  test('PUT guarda el valor y los inicios de sesión posteriores usan esa vigencia', async () => {
    await crearUsuarios();
    const { token } = (await iniciarSesion('admin')).body;

    const guardado = await guardarInactividad(token, 15);
    const siguiente = await iniciarSesion('recepcion');

    expect(guardado.status).toBe(200);
    expect(guardado.body.seguridad).toEqual({ minutosInactividad: 15 });
    expect(siguiente.body.inactividadMinutos).toBe(15);
    expect(vigencia(siguiente.body.token)).toBe(15 * 60);
  });

  test('los tokens ya emitidos conservan su vencimiento original', async () => {
    await crearUsuarios();
    const { token } = (await iniciarSesion('admin')).body;
    const antes = jwt.decode(token).exp;

    await guardarInactividad(token, 5);

    expect(jwt.decode(token).exp).toBe(antes);
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });

  test.each([[4], [121], [0], [-5], [30.5], ['30']])('un valor fuera de límites o inválido (%p) responde 400 y no se guarda', async (minutos) => {
    await crearUsuarios();
    const { token } = (await iniciarSesion('admin')).body;

    const respuesta = await guardarInactividad(token, minutos);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    const [[{ total }]] = await getPool().query("SELECT COUNT(*) AS total FROM settings WHERE setting_key = 'session.inactivity_minutes'");
    expect(Number(total)).toBe(0);
  });

  test.each([[5], [120]])('los límites inclusivos (%i) se aceptan', async (minutos) => {
    await crearUsuarios();
    const { token } = (await iniciarSesion('admin')).body;

    expect((await guardarInactividad(token, minutos)).status).toBe(200);
  });

  test('un rol sin permiso no puede cambiar la inactividad (403)', async () => {
    await crearUsuarios();
    const { token } = (await iniciarSesion('recepcion')).body;

    const respuesta = await guardarInactividad(token, 10);

    expect(respuesta.status).toBe(403);
  });
});

describe('POST /api/auth/renew', () => {
  test('con un token vigente entrega un token nuevo del mismo usuario y la vigencia del ajuste', async () => {
    const ids = await crearUsuarios();
    const { token } = (await iniciarSesion('recepcion')).body;

    const respuesta = await renovar(token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ token: expect.any(String), inactividadMinutos: 30 });
    const nuevo = jwt.decode(respuesta.body.token);
    expect(nuevo).toMatchObject({ sub: ids.recepcion, username: 'recepcion', role: 'RECEPTIONIST' });
    expect(nuevo.exp - nuevo.iat).toBe(30 * 60);
    // El token nuevo sirve.
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${respuesta.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('recepcion');
  });

  test('la vigencia del token renovado sigue el ajuste vigente, no el del token anterior', async () => {
    await crearUsuarios();
    const admin = (await iniciarSesion('admin')).body.token;
    const mecanico = (await iniciarSesion('mecanico')).body.token;
    await guardarInactividad(admin, 12);

    const respuesta = await renovar(mecanico);

    expect(respuesta.body.inactividadMinutos).toBe(12);
    expect(vigencia(respuesta.body.token)).toBe(12 * 60);
  });

  test('la renovación vale para los tres roles', async () => {
    await crearUsuarios();

    for (const username of ['admin', 'recepcion', 'mecanico']) {
      const { token } = (await iniciarSesion(username)).body;
      expect((await renovar(token)).status).toBe(200);
    }
  });

  test('sin token responde 401 NO_AUTENTICADO', async () => {
    const respuesta = await request(app).post('/api/auth/renew');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  test('un token vencido responde 401 SESION_EXPIRADA y no entrega token', async () => {
    const ids = await crearUsuarios();
    const vencido = jwt.sign({ sub: ids.admin, username: 'admin', role: 'ADMIN' }, process.env.JWT_SECRET, {
      expiresIn: -10,
    });

    const respuesta = await renovar(vencido);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SESION_EXPIRADA');
    expect(respuesta.body).not.toHaveProperty('token');
  });

  test('un token firmado con otro secreto responde 401', async () => {
    const ids = await crearUsuarios();
    const ajeno = jwt.sign({ sub: ids.admin, username: 'admin', role: 'ADMIN' }, 'otro-secreto-distinto', { expiresIn: '5m' });

    const respuesta = await renovar(ajeno);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SESION_EXPIRADA');
  });

  test('un usuario desactivado ya no puede renovar aunque su token no haya vencido', async () => {
    const ids = await crearUsuarios();
    const { token } = (await iniciarSesion('mecanico')).body;
    await getPool().query('UPDATE users SET active = 0 WHERE id = ?', [ids.mecanico]);

    const respuesta = await renovar(token);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SESION_EXPIRADA');
  });

  test('una renovación no cambia el rol del token: el rol sale de la base, no del token anterior', async () => {
    const ids = await crearUsuarios();
    const { token } = (await iniciarSesion('mecanico')).body;
    await getPool().query("UPDATE users SET role = 'RECEPTIONIST' WHERE id = ?", [ids.mecanico]);

    const respuesta = await renovar(token);

    expect(respuesta.status).toBe(200);
    expect(jwt.decode(respuesta.body.token).role).toBe('RECEPTIONIST');
  });
});

describe('ninguna otra ruta renueva ni emite token (CA-23)', () => {
  test('la consulta periódica de avisos y las demás rutas no devuelven token ni cabeceras de sesión', async () => {
    await crearUsuarios();
    const { token } = (await iniciarSesion('admin')).body;

    for (const ruta of ['/api/notifications', '/api/me', '/api/settings', '/api/clients', '/api/service-types']) {
      const respuesta = await request(app).get(ruta).set('Authorization', `Bearer ${token}`);

      expect(respuesta.status).toBe(200);
      expect(JSON.stringify(respuesta.body)).not.toMatch(/"token"/);
      expect(JSON.stringify(respuesta.body)).not.toContain(token);
      for (const cabecera of Object.keys(respuesta.headers)) {
        expect(cabecera.toLowerCase()).not.toMatch(/token|authorization|set-cookie|renew/);
      }
    }
  });

  test('el backend sigue rechazando un token vencido en cualquier ruta (401 SESION_EXPIRADA)', async () => {
    const ids = await crearUsuarios();
    const vencido = jwt.sign({ sub: ids.admin, username: 'admin', role: 'ADMIN' }, process.env.JWT_SECRET, {
      expiresIn: -10,
    });

    for (const ruta of ['/api/me', '/api/notifications', '/api/settings']) {
      const respuesta = await request(app).get(ruta).set('Authorization', `Bearer ${vencido}`);

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.codigo).toBe('SESION_EXPIRADA');
    }
  });

  test('un token recién emitido con vigencia mínima (5 minutos) sigue siendo válido', async () => {
    await crearUsuarios();
    const admin = (await iniciarSesion('admin')).body.token;
    await guardarInactividad(admin, 5);

    const corto = (await iniciarSesion('recepcion')).body.token;

    expect(vigencia(corto)).toBe(300);
    expect((await request(app).get('/api/me').set('Authorization', `Bearer ${corto}`)).status).toBe(200);
  });
});
