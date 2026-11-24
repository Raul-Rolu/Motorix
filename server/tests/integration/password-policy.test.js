// 008-configuracion-seguridad-reportes, T076 (bloque P2, US6; FR-015, CA-22): la
// política de contraseñas (8 caracteres como mínimo, con mayúscula, minúscula y
// número; RN-17) se aplica al crear un usuario y al cambiar la contraseña, con un
// mensaje que nombra la regla; la contraseña se guarda solo como hash bcrypt; y
// las cuentas sembradas la cumplen. La regla YA existía: aquí solo se verifica.
// Corre contra `motorix_test`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { crearApp } from '../../app.js';
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';
import { cumplePoliticaContrasena } from '../../validators/validation-helpers.js';

const app = crearApp();
const directorioSeeds = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'database', 'seeds');

beforeAll(async () => {
  await prepararBaseDePruebas();
});

afterEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

const CLAVE_ADMIN = 'Admin12345';

async function iniciarSesionAdmin() {
  const hash = await bcrypt.hash(CLAVE_ADMIN, 10);
  await getPool().query(
    "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('admin', 'admin@motorix.local', ?, 'Administrador', 'ADMIN')",
    [hash]
  );
  const login = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: CLAVE_ADMIN });
  return login.body.token;
}

const altaUsuario = (token, password, extra = {}) =>
  request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'nuevo', email: 'nuevo@motorix.local', fullName: 'Usuario Nuevo', role: 'MECHANIC', password, ...extra });

const cambiarContrasena = (token, contrasenaActual, contrasenaNueva) =>
  request(app)
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${token}`)
    .send({ contrasenaActual, contrasenaNueva });

/** Contraseñas que incumplen exactamente una condición de la política. */
const INVALIDAS = [
  ['menos de 8 caracteres', 'Abc1234'],
  ['sin mayúscula', 'abcdefg123'],
  ['sin minúscula', 'ABCDEFG123'],
  ['sin número', 'Abcdefghij'],
  ['solo números', '12345678'],
  ['solo espacios y letras minúsculas', 'sin numeros aqui'],
];

describe('al crear un usuario', () => {
  test.each(INVALIDAS)('rechaza una contraseña %s con 400 y el mensaje de la regla; no crea al usuario', async (_nombre, clave) => {
    const token = await iniciarSesionAdmin();

    const respuesta = await altaUsuario(token, clave);

    expect(respuesta.status).toBe(400);
    // El alta de usuarios responde con DATOS_INVALIDOS y el mensaje de la política
    // (este sprint no cambia los códigos; ver la nota del contrato).
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    const mensaje = respuesta.body.error.mensaje;
    expect(mensaje).toMatch(/8 caracteres/);
    expect(mensaje).toMatch(/may[uú]scula/);
    expect(mensaje).toMatch(/min[uú]scula/);
    expect(mensaje).toMatch(/n[uú]mero/);
    const [[{ total }]] = await getPool().query("SELECT COUNT(*) AS total FROM users WHERE username = 'nuevo'");
    expect(Number(total)).toBe(0);
  });

  test.each([[undefined], [null], [''], [12345678], [['Abcdefg123']]])('rechaza una contraseña ausente o que no es texto (%p)', async (clave) => {
    const token = await iniciarSesionAdmin();

    const respuesta = await altaUsuario(token, clave);

    expect(respuesta.status).toBe(400);
  });

  test('acepta una contraseña válida y en la base queda solo su hash bcrypt, distinto del texto', async () => {
    const token = await iniciarSesionAdmin();

    const respuesta = await altaUsuario(token, 'Valida123x');

    expect(respuesta.status).toBe(201);
    expect(JSON.stringify(respuesta.body)).not.toContain('Valida123x');
    const [[fila]] = await getPool().query("SELECT password_hash FROM users WHERE username = 'nuevo'");
    expect(fila.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(fila.password_hash).not.toBe('Valida123x');
    expect(await bcrypt.compare('Valida123x', fila.password_hash)).toBe(true);
    // Y la cuenta nueva puede iniciar sesión con esa contraseña.
    const login = await request(app).post('/api/auth/login').send({ identificacion: 'nuevo', contrasena: 'Valida123x' });
    expect(login.status).toBe(200);
  });

  test('el límite exacto: 8 caracteres con las tres clases es válido', async () => {
    const token = await iniciarSesionAdmin();

    const respuesta = await altaUsuario(token, 'Abcdef12');

    expect(respuesta.status).toBe(201);
  });
});

describe('al cambiar la contraseña propia', () => {
  test.each(INVALIDAS)('rechaza una contraseña nueva %s con 400 CONTRASENA_INVALIDA y el mensaje de la regla', async (_nombre, clave) => {
    const token = await iniciarSesionAdmin();

    const respuesta = await cambiarContrasena(token, CLAVE_ADMIN, clave);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('CONTRASENA_INVALIDA');
    const mensaje = respuesta.body.error.mensaje;
    expect(mensaje).toMatch(/8 caracteres/);
    expect(mensaje).toMatch(/may[uú]scula/);
    expect(mensaje).toMatch(/min[uú]scula/);
    expect(mensaje).toMatch(/n[uú]mero/);
    // No cambió: la contraseña anterior sigue funcionando.
    const login = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: CLAVE_ADMIN });
    expect(login.status).toBe(200);
  });

  test('con una contraseña válida responde 204, guarda solo el hash y la anterior deja de servir', async () => {
    const token = await iniciarSesionAdmin();

    const respuesta = await cambiarContrasena(token, CLAVE_ADMIN, 'NuevaClave456');

    expect(respuesta.status).toBe(204);
    const [[fila]] = await getPool().query("SELECT password_hash FROM users WHERE username = 'admin'");
    expect(fila.password_hash).toMatch(/^\$2[aby]\$/);
    expect(fila.password_hash).not.toBe('NuevaClave456');
    const nueva = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: 'NuevaClave456' });
    const vieja = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: CLAVE_ADMIN });
    expect(nueva.status).toBe(200);
    expect(vieja.status).toBe(401);
  });

  test('con la contraseña actual incorrecta responde 401 y no cambia nada', async () => {
    const token = await iniciarSesionAdmin();

    const respuesta = await cambiarContrasena(token, 'Incorrecta123', 'NuevaClave456');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    const login = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: CLAVE_ADMIN });
    expect(login.status).toBe(200);
  });
});

describe('cuentas sembradas', () => {
  const sembradas = { admin: 'Admin123', recepcion: 'Recepcion123', mecanico: 'Mecanico123' };

  test('las contraseñas documentadas cumplen la política (no se obliga a cambiarlas)', () => {
    for (const clave of Object.values(sembradas)) {
      expect(cumplePoliticaContrasena(clave)).toBe(true);
    }
  });

  test('el seed 001 guarda hashes bcrypt que corresponden a esas contraseñas', async () => {
    const sql = readFileSync(path.join(directorioSeeds, '001_initial_accounts.sql'), 'utf8');
    for (const [usuario, clave] of Object.entries(sembradas)) {
      const fila = sql.split('\n').find((linea) => linea.includes(`('${usuario}'`));
      expect(fila).toBeDefined();
      const hash = fila.match(/'(\$2[aby]\$[^']+)'/)?.[1];
      expect(hash).toBeDefined();
      expect(await bcrypt.compare(clave, hash)).toBe(true);
    }
    // El texto plano nunca está en el seed como dato (solo en el comentario del encabezado).
    const lineasDeDatos = sql.split('\n').filter((linea) => linea.trim().startsWith('('));
    for (const clave of Object.values(sembradas)) {
      expect(lineasDeDatos.join('\n')).not.toContain(clave);
    }
  });
});
