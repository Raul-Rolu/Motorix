// 008-configuracion-seguridad-reportes, T096 (bloque P2; FR-029, CA-12, CA-16,
// CA-18): el seed `011_demo_terms.sql` siembra la versión 1 de los términos y
// del aviso de privacidad (plantilla en español con la advertencia de que el
// taller debe revisarla) y cuatro entradas de bitácora de ejemplo con fechas
// relativas, SIN ninguna aceptación. Es idempotente y nunca pisa lo que el
// usuario ya hizo: si ya hay una versión publicada no siembra otra, y las
// entradas de ejemplo no se repiten ni se mezclan con las reales. Corre contra
// `motorix_test` (las cuentas de demostración salen del seed 001).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { crearApp } from '../../app.js';
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

const app = crearApp();
const semillas = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'database', 'seeds');

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

/** Aplica un archivo de seed tal cual (el pool de pruebas permite varias sentencias). */
async function sembrar(archivo) {
  await getPool().query(readFileSync(path.join(semillas, archivo), 'utf8'));
}

const sembrarCuentas = () => sembrar('001_initial_accounts.sql');
const sembrarTerminos = () => sembrar('011_demo_terms.sql');

const CUENTAS = [
  ['admin', 'Admin123'],
  ['recepcion', 'Recepcion123'],
  ['mecanico', 'Mecanico123'],
];

const iniciarSesion = async (usuario, clave) => {
  const respuesta = await request(app).post('/api/auth/login').send({ identificacion: usuario, contrasena: clave });
  return respuesta.body.token;
};

const con = (token) => ({ Authorization: `Bearer ${token}` });

async function contar(tabla, condicion = '1 = 1') {
  const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM ${tabla} WHERE ${condicion}`);
  return Number(total);
}

describe('contenido de la versión 1', () => {
  test('es la versión 1 con id 1 y sus textos tienen una longitud válida', async () => {
    await sembrarCuentas();
    await sembrarTerminos();

    const [filas] = await getPool().query('SELECT id, version, terms_text, privacy_text, published_by FROM terms_versions');
    expect(filas).toHaveLength(1);
    expect(filas[0].id).toBe(1);
    expect(filas[0].version).toBe(1);
    for (const texto of [filas[0].terms_text, filas[0].privacy_text]) {
      expect(texto.length).toBeGreaterThanOrEqual(20);
      expect(texto.length).toBeLessThanOrEqual(20000);
    }
    const [[admin]] = await getPool().query("SELECT id FROM users WHERE username = 'admin'");
    expect(filas[0].published_by).toBe(admin.id);
  });

  test('los términos nombran el uso permitido, la confidencialidad y las cuentas personales', async () => {
    await sembrarCuentas();
    await sembrarTerminos();

    const [[{ terms_text: terminos }]] = await getPool().query('SELECT terms_text FROM terms_versions WHERE id = 1');
    expect(terminos).toMatch(/uso permitido/i);
    expect(terminos).toMatch(/confidencialidad/i);
    expect(terminos).toMatch(/clientes/i);
    expect(terminos).toMatch(/veh[ií]culos/i);
    expect(terminos).toMatch(/cuentas personales/i);
  });

  test('el aviso de privacidad existe y ambos textos advierten que es una plantilla a revisar', async () => {
    await sembrarCuentas();
    await sembrarTerminos();

    const [[fila]] = await getPool().query('SELECT terms_text, privacy_text FROM terms_versions WHERE id = 1');
    expect(fila.privacy_text).toMatch(/aviso de privacidad/i);
    for (const texto of [fila.terms_text, fila.privacy_text]) {
      expect(texto).toMatch(/plantilla/i);
      expect(texto).toMatch(/revis/i);
    }
  });

  test('NO siembra ninguna aceptación', async () => {
    await sembrarCuentas();
    await sembrarTerminos();

    expect(await contar('terms_acceptances')).toBe(0);
  });
});

describe('bitácora de ejemplo', () => {
  test('siembra cuatro entradas de ejemplo con fechas relativas y sin datos sensibles', async () => {
    await sembrarCuentas();
    await sembrarTerminos();

    const [filas] = await getPool().query('SELECT * FROM audit_log ORDER BY created_at ASC, id ASC');
    expect(filas).toHaveLength(4);
    expect(filas.map((f) => f.action).sort()).toEqual(
      ['LOGIN_FAILED', 'PART_SALE_PRICE_CHANGED', 'SETTINGS_UPDATED', 'USER_CREATED'].sort()
    );
    const ahora = Date.now();
    for (const fila of filas) {
      const antiguedadDias = (ahora - new Date(fila.created_at).getTime()) / 86400000;
      expect(antiguedadDias).toBeGreaterThan(-0.01);
      expect(antiguedadDias).toBeLessThan(7);
      expect(fila.detail).not.toMatch(/\$2[abxy]\$|token|contrase/i);
    }
    // El inicio de sesión fallido de ejemplo no corresponde a una cuenta.
    expect(filas.find((f) => f.action === 'LOGIN_FAILED').user_id).toBeNull();
  });

  test('el administrador (tras aceptar) ve las cuatro entradas por la API', async () => {
    await sembrarCuentas();
    await sembrarTerminos();
    const token = await iniciarSesion('admin', 'Admin123');
    const vigente = await request(app).get('/api/terms/current').set(con(token));
    await request(app).post('/api/terms/accept').set(con(token)).send({ termsVersionId: vigente.body.vigente.id });

    const respuesta = await request(app).get('/api/audit-log').set(con(token));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(4);
    expect(respuesta.body.datos.map((d) => d.accion).sort()).toEqual(
      ['LOGIN_FAILED', 'PART_SALE_PRICE_CHANGED', 'SETTINGS_UPDATED', 'USER_CREATED'].sort()
    );
  });
});

describe('idempotencia', () => {
  test('aplicarlo dos veces no duplica versiones ni entradas de bitácora', async () => {
    await sembrarCuentas();
    await sembrarTerminos();
    const primera = { versiones: await contar('terms_versions'), bitacora: await contar('audit_log') };

    await sembrarTerminos();

    expect({ versiones: await contar('terms_versions'), bitacora: await contar('audit_log') }).toEqual(primera);
    expect(primera).toEqual({ versiones: 1, bitacora: 4 });
  });

  test('si el usuario ya publicó su propia versión, no se siembra otra ni se modifica la suya', async () => {
    await sembrarCuentas();
    const [[admin]] = await getPool().query("SELECT id FROM users WHERE username = 'admin'");
    await getPool().query(
      'INSERT INTO terms_versions (version, terms_text, privacy_text, published_by) VALUES (1, ?, ?, ?)',
      ['Términos propios del taller, publicados por el administrador.', 'Aviso de privacidad propio del taller.', admin.id]
    );

    await sembrarTerminos();

    const [filas] = await getPool().query('SELECT version, terms_text FROM terms_versions');
    expect(filas).toHaveLength(1);
    expect(filas[0].terms_text).toBe('Términos propios del taller, publicados por el administrador.');
  });

  test('si ya hay versiones publicadas con otros números, la vigente sigue siendo la del usuario', async () => {
    await sembrarCuentas();
    await getPool().query(
      'INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (3, ?, ?), (4, ?, ?)',
      ['Términos versión tres del taller.', 'Aviso versión tres.', 'Términos versión cuatro del taller.', 'Aviso versión cuatro.']
    );

    await sembrarTerminos();

    expect(await contar('terms_versions')).toBe(2);
    expect(await contar('terms_versions', 'version = 1')).toBe(0);
    const token = await iniciarSesion('recepcion', 'Recepcion123');
    const vigente = await request(app).get('/api/terms/current').set(con(token));
    expect(vigente.body.vigente.version).toBe(4);
  });

  test('conserva las aceptaciones ya hechas', async () => {
    await sembrarCuentas();
    await sembrarTerminos();
    const token = await iniciarSesion('recepcion', 'Recepcion123');
    await request(app).post('/api/terms/accept').set(con(token)).send({ termsVersionId: 1 });
    expect(await contar('terms_acceptances')).toBe(1);

    await sembrarTerminos();

    expect(await contar('terms_acceptances')).toBe(1);
    expect((await request(app).get('/api/me').set(con(token))).status).toBe(200);
  });

  test('no se mezcla con la bitácora real: las entradas reales con los ids 1 a 4 no impiden las de ejemplo', async () => {
    await sembrarCuentas();
    const [[admin]] = await getPool().query("SELECT id FROM users WHERE username = 'admin'");
    for (let i = 1; i <= 4; i += 1) {
      await getPool().query(
        "INSERT INTO audit_log (id, user_id, action, entity_type, detail) VALUES (?, ?, 'LOGIN_FAILED', 'SESSION', ?)",
        [i, admin.id, `Identificador: real${i}`]
      );
    }

    await sembrarTerminos();
    await sembrarTerminos();

    expect(await contar('audit_log')).toBe(8);
    expect(await contar('audit_log', "detail LIKE 'Identificador: real%'")).toBe(4);
  });
});

describe('compuerta con las cuentas de demostración', () => {
  test.each(CUENTAS)('%s ve la pantalla de aceptación en su primer inicio de sesión y no se repite tras aceptar', async (usuario, clave) => {
    await sembrarCuentas();
    await sembrarTerminos();

    const primero = await iniciarSesion(usuario, clave);
    const bloqueado = await request(app).get('/api/me').set(con(primero));
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');

    const vigente = await request(app).get('/api/terms/current').set(con(primero));
    expect(vigente.body.aceptada).toBe(false);
    const aceptada = await request(app).post('/api/terms/accept').set(con(primero)).send({ termsVersionId: vigente.body.vigente.id });
    expect(aceptada.status).toBe(200);

    // Un inicio de sesión posterior ya no vuelve a pedirlo.
    const segundo = await iniciarSesion(usuario, clave);
    const libre = await request(app).get('/api/me').set(con(segundo));
    expect(libre.status).toBe(200);
    expect((await request(app).get('/api/terms/current').set(con(segundo))).body.aceptada).toBe(true);
  });
});
