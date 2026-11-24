// 008-configuracion-seguridad-reportes, T087 (bloque P2, US7; FR-019 a FR-022,
// CA-16 a CA-19): términos y condiciones con aviso de privacidad. Sin versión
// publicada no hay compuerta; con una vigente, quien no la aceptó recibe
// 403 TERMS_NOT_ACCEPTED en las rutas de los módulos y NO en las exentas
// (consultar la vigente, aceptar, cerrar sesión y renovar). Aceptar es
// idempotente, una versión anterior se rechaza con 409, publicar numera con
// máximo + 1 y exige aceptar a todos (incluido el autor), las aceptaciones se
// paginan de 50 y publicar queda en la bitácora. Corre contra `motorix_test`.
//
// El texto del seed `011_demo_terms.sql` se verifica en el tramo del seed (T096).
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

const CLAVE = 'Usuario123';
const TEXTO_TERMINOS = 'Uso permitido del sistema: solo para fines del taller.';
const TEXTO_PRIVACIDAD = 'Aviso de privacidad: los datos se usan solo para la operación.';

async function prepararEntorno() {
  const hash = await bcrypt.hash(CLAVE, 10);
  const ids = {};
  const tokens = {};
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
    const login = await request(app).post('/api/auth/login').send({ identificacion: username, contrasena: CLAVE });
    tokens[username] = login.body.token;
  }
  return { ids, tokens };
}

const con = (token) => ({ Authorization: `Bearer ${token}` });

/** Inserta una versión directamente (la numeración la fija el llamador). */
async function insertarVersion(version, autor = null) {
  const [resultado] = await getPool().query(
    'INSERT INTO terms_versions (version, terms_text, privacy_text, published_by) VALUES (?, ?, ?, ?)',
    [version, `${TEXTO_TERMINOS} v${version}`, `${TEXTO_PRIVACIDAD} v${version}`, autor]
  );
  return resultado.insertId;
}

const aceptarEnBase = (usuarioId, versionId) =>
  getPool().query('INSERT INTO terms_acceptances (user_id, terms_version_id) VALUES (?, ?)', [usuarioId, versionId]);

const aceptar = (token, termsVersionId) =>
  request(app).post('/api/terms/accept').set(con(token)).send({ termsVersionId });

const publicar = (token, cuerpo) => request(app).post('/api/terms').set(con(token)).send(cuerpo);

describe('sin versión publicada', () => {
  test('no hay compuerta: la vigente es null y las rutas de los módulos responden como antes', async () => {
    const { tokens } = await prepararEntorno();

    const vigente = await request(app).get('/api/terms/current').set(con(tokens.recepcion));
    expect(vigente.status).toBe(200);
    expect(vigente.body).toEqual({ vigente: null, aceptada: true });

    for (const ruta of ['/api/clients', '/api/notifications', '/api/orders', '/api/me']) {
      const respuesta = await request(app).get(ruta).set(con(tokens.recepcion));
      expect(respuesta.status).toBe(200);
    }
  });
});

describe('compuerta con una versión vigente', () => {
  test('sin aceptación: 403 TERMS_NOT_ACCEPTED en una ruta de cada módulo', async () => {
    const { tokens } = await prepararEntorno();
    await insertarVersion(1);

    for (const ruta of ['/api/clients', '/api/notifications', '/api/orders', '/api/me']) {
      const respuesta = await request(app).get(ruta).set(con(tokens.recepcion));
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');
      expect(respuesta.body.error.mensaje).toBe('No ha aceptado la versión vigente de los términos y condiciones.');
    }
  });

  test('la compuerta también protege las rutas de escritura y las de ADMIN', async () => {
    const { tokens } = await prepararEntorno();
    await insertarVersion(1);

    const escritura = await request(app).post('/api/clients').set(con(tokens.recepcion)).send({});
    expect(escritura.status).toBe(403);
    expect(escritura.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');

    const ajustes = await request(app).get('/api/settings').set(con(tokens.admin));
    expect(ajustes.status).toBe(403);
    expect(ajustes.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');
  });

  test('las rutas exentas no exigen la aceptación', async () => {
    const { tokens } = await prepararEntorno();
    const id = await insertarVersion(1);

    const vigente = await request(app).get('/api/terms/current').set(con(tokens.mecanico));
    expect(vigente.status).toBe(200);
    expect(vigente.body.aceptada).toBe(false);

    const renovada = await request(app).post('/api/auth/renew').set(con(tokens.mecanico));
    expect(renovada.status).toBe(200);
    expect(typeof renovada.body.token).toBe('string');

    const salida = await request(app).post('/api/auth/logout').set(con(tokens.mecanico));
    expect(salida.status).toBe(204);

    const aceptada = await aceptar(tokens.mecanico, id);
    expect(aceptada.status).toBe(200);
  });

  test('tras aceptar, las rutas responden normalmente y la compuerta es por usuario', async () => {
    const { tokens } = await prepararEntorno();
    const id = await insertarVersion(1);

    expect((await aceptar(tokens.recepcion, id)).status).toBe(200);

    expect((await request(app).get('/api/clients').set(con(tokens.recepcion))).status).toBe(200);
    // Otro usuario que no aceptó sigue bloqueado.
    const otro = await request(app).get('/api/clients').set(con(tokens.mecanico));
    expect(otro.status).toBe(403);
    expect(otro.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');
  });

  test('sin token sigue siendo 401 y con token inválido también', async () => {
    await prepararEntorno();
    await insertarVersion(1);

    expect((await request(app).get('/api/clients')).status).toBe(401);
    expect((await request(app).get('/api/clients').set(con('no-es-un-token'))).status).toBe(401);
  });
});

describe('GET /api/terms/current', () => {
  test('devuelve la versión vigente con sus textos y si el usuario la aceptó', async () => {
    const { tokens, ids } = await prepararEntorno();
    await insertarVersion(1);
    const vigenteId = await insertarVersion(2);

    const antes = await request(app).get('/api/terms/current').set(con(tokens.recepcion));
    expect(antes.status).toBe(200);
    expect(antes.body.aceptada).toBe(false);
    expect(antes.body.vigente).toEqual({
      id: vigenteId,
      version: 2,
      terminos: `${TEXTO_TERMINOS} v2`,
      avisoPrivacidad: `${TEXTO_PRIVACIDAD} v2`,
      publicadaEn: expect.any(String),
    });

    await aceptarEnBase(ids.recepcion, vigenteId);
    const despues = await request(app).get('/api/terms/current').set(con(tokens.recepcion));
    expect(despues.body.aceptada).toBe(true);
  });

  test('haber aceptado una versión anterior no cuenta para la vigente', async () => {
    const { tokens, ids } = await prepararEntorno();
    const primera = await insertarVersion(1);
    await aceptarEnBase(ids.recepcion, primera);
    await insertarVersion(2);

    const respuesta = await request(app).get('/api/terms/current').set(con(tokens.recepcion));
    expect(respuesta.body.aceptada).toBe(false);
    expect((await request(app).get('/api/clients').set(con(tokens.recepcion))).status).toBe(403);
  });
});

describe('POST /api/terms/accept', () => {
  test('guarda usuario, versión y fecha', async () => {
    const { tokens, ids } = await prepararEntorno();
    const id = await insertarVersion(3);

    const respuesta = await aceptar(tokens.recepcion, id);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ aceptada: true, version: 3 });
    const [filas] = await getPool().query('SELECT user_id, terms_version_id, accepted_at FROM terms_acceptances');
    expect(filas).toHaveLength(1);
    expect(filas[0].user_id).toBe(ids.recepcion);
    expect(filas[0].terms_version_id).toBe(id);
    expect(filas[0].accepted_at).toBeInstanceOf(Date);
  });

  test('es idempotente: aceptar dos veces deja una sola aceptación', async () => {
    const { tokens } = await prepararEntorno();
    const id = await insertarVersion(1);

    expect((await aceptar(tokens.recepcion, id)).status).toBe(200);
    expect((await aceptar(tokens.recepcion, id)).status).toBe(200);

    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM terms_acceptances');
    expect(total).toBe(1);
  });

  test('una versión anterior a la vigente responde 409 TERMS_VERSION_OUTDATED', async () => {
    const { tokens } = await prepararEntorno();
    const anterior = await insertarVersion(1);
    await insertarVersion(2);

    const respuesta = await aceptar(tokens.recepcion, anterior);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe('TERMS_VERSION_OUTDATED');
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM terms_acceptances');
    expect(total).toBe(0);
  });

  test('una versión inexistente responde 404 RECURSO_NO_ENCONTRADO', async () => {
    const { tokens } = await prepararEntorno();
    await insertarVersion(1);

    const respuesta = await aceptar(tokens.recepcion, 987654);

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('RECURSO_NO_ENCONTRADO');
  });

  test.each([[undefined], [null], [0], [-1], [1.5], ['1'], ['abc'], [true]])(
    'el identificador %p responde 400 DATOS_INVALIDOS',
    async (valor) => {
      const { tokens } = await prepararEntorno();
      await insertarVersion(1);

      const respuesta = await aceptar(tokens.recepcion, valor);

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    }
  );

  test('sin cuerpo responde 400 DATOS_INVALIDOS', async () => {
    const { tokens } = await prepararEntorno();
    await insertarVersion(1);

    const respuesta = await request(app).post('/api/terms/accept').set(con(tokens.recepcion));

    expect(respuesta.status).toBe(400);
  });

  test('sin versión publicada no hay nada que aceptar (404)', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await aceptar(tokens.recepcion, 1);

    expect(respuesta.status).toBe(404);
  });
});

describe('POST /api/terms (publicar)', () => {
  test('numera con máximo + 1, responde 201 y deja la nueva como vigente', async () => {
    const { tokens, ids } = await prepararEntorno();
    await insertarVersion(1);
    const vigenteAntes = await insertarVersion(4);
    await aceptarEnBase(ids.admin, vigenteAntes); // con compuerta, el ADMIN debe haber aceptado

    const respuesta = await publicar(tokens.admin, {
      terminos: 'Texto nuevo de los términos y condiciones.',
      avisoPrivacidad: 'Texto nuevo del aviso de privacidad.',
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({
      id: expect.any(Number),
      version: 5,
      terminos: 'Texto nuevo de los términos y condiciones.',
      avisoPrivacidad: 'Texto nuevo del aviso de privacidad.',
      publicadaEn: expect.any(String),
    });
    const [filas] = await getPool().query('SELECT version, published_by FROM terms_versions WHERE version = 5');
    expect(filas[0].published_by).toBe(ids.admin);
    const vigente = await request(app).get('/api/terms/current').set(con(tokens.recepcion));
    expect(vigente.body.vigente.version).toBe(5);
  });

  test('la primera versión es la 1', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await publicar(tokens.admin, { terminos: TEXTO_TERMINOS, avisoPrivacidad: TEXTO_PRIVACIDAD });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.version).toBe(1);
  });

  test('exige aceptarla a todos, incluido el autor', async () => {
    const { tokens } = await prepararEntorno();
    const primera = await insertarVersion(1);
    for (const usuario of ['admin', 'recepcion', 'mecanico']) {
      expect((await aceptar(tokens[usuario], primera)).status).toBe(200);
    }
    expect((await request(app).get('/api/clients').set(con(tokens.recepcion))).status).toBe(200);

    const nueva = await publicar(tokens.admin, { terminos: TEXTO_TERMINOS, avisoPrivacidad: TEXTO_PRIVACIDAD });
    expect(nueva.status).toBe(201);

    for (const usuario of ['admin', 'recepcion', 'mecanico']) {
      const respuesta = await request(app).get('/api/clients').set(con(tokens[usuario]));
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');
    }
    // Y aceptarla de nuevo los habilita.
    expect((await aceptar(tokens.admin, nueva.body.id)).status).toBe(200);
    expect((await request(app).get('/api/clients').set(con(tokens.admin))).status).toBe(200);
  });

  test('con la compuerta activa, publicar exige que el ADMIN haya aceptado la vigente', async () => {
    const { tokens } = await prepararEntorno();
    await insertarVersion(1);

    // `POST /api/terms` usa `auth` (con compuerta): el ADMIN debe aceptar primero.
    const respuesta = await publicar(tokens.admin, { terminos: TEXTO_TERMINOS, avisoPrivacidad: TEXTO_PRIVACIDAD });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');
  });

  test('registra TERMS_PUBLISHED en la bitácora con la versión y el autor', async () => {
    const { tokens, ids } = await prepararEntorno();
    await getPool().query('DELETE FROM audit_log');

    const respuesta = await publicar(tokens.admin, { terminos: TEXTO_TERMINOS, avisoPrivacidad: TEXTO_PRIVACIDAD });

    expect(respuesta.status).toBe(201);
    const [filas] = await getPool().query("SELECT * FROM audit_log WHERE action = 'TERMS_PUBLISHED'");
    expect(filas).toHaveLength(1);
    expect(filas[0].user_id).toBe(ids.admin);
    expect(filas[0].entity_type).toBe('TERMS');
    expect(filas[0].entity_id).toBe(respuesta.body.id);
    expect(filas[0].detail).toBe('Versión 1');
    // La bitácora no guarda el texto de los términos.
    expect(filas[0].detail).not.toContain('Uso permitido');
  });

  test('límites de longitud: 20 y 20,000 se aceptan', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await publicar(tokens.admin, {
      terminos: 'a'.repeat(20),
      avisoPrivacidad: 'b'.repeat(20000),
    });

    expect(respuesta.status).toBe(201);
  });

  test.each([
    ['términos con 19 caracteres', { terminos: 'a'.repeat(19), avisoPrivacidad: TEXTO_PRIVACIDAD }],
    ['aviso con 19 caracteres', { terminos: TEXTO_TERMINOS, avisoPrivacidad: 'b'.repeat(19) }],
    ['términos con 20,001 caracteres', { terminos: 'a'.repeat(20001), avisoPrivacidad: TEXTO_PRIVACIDAD }],
    ['aviso con 20,001 caracteres', { terminos: TEXTO_TERMINOS, avisoPrivacidad: 'b'.repeat(20001) }],
    ['términos solo con espacios', { terminos: ' '.repeat(40), avisoPrivacidad: TEXTO_PRIVACIDAD }],
    ['sin términos', { avisoPrivacidad: TEXTO_PRIVACIDAD }],
    ['sin aviso', { terminos: TEXTO_TERMINOS }],
    ['términos que no son texto', { terminos: 12345678901234567890, avisoPrivacidad: TEXTO_PRIVACIDAD }],
    ['cuerpo vacío', {}],
  ])('%s → 400 DATOS_INVALIDOS y no se guarda nada', async (_nombre, cuerpo) => {
    const { tokens } = await prepararEntorno();

    const respuesta = await publicar(tokens.admin, cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM terms_versions');
    expect(total).toBe(0);
  });
});

describe('GET /api/terms/acceptances', () => {
  test('lista las aceptaciones con usuario, versión y fecha, y la vigente', async () => {
    const { tokens, ids } = await prepararEntorno();
    const id = await insertarVersion(1);
    await aceptarEnBase(ids.recepcion, id);
    await aceptarEnBase(ids.admin, id);

    const respuesta = await request(app).get('/api/terms/acceptances').set(con(tokens.admin));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.vigente).toEqual({ id, version: 1 });
    expect(respuesta.body).toMatchObject({ pagina: 1, totalPaginas: 1, total: 2 });
    expect(respuesta.body.datos).toHaveLength(2);
    expect(respuesta.body.datos[0]).toEqual({
      usuario: { id: expect.any(Number), nombre: expect.any(String) },
      version: 1,
      aceptadaEn: expect.any(String),
    });
  });

  test('sin aceptaciones ni versiones: lista vacía y vigente null', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await request(app).get('/api/terms/acceptances').set(con(tokens.admin));

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ pagina: 1, totalPaginas: 1, total: 0, vigente: null, datos: [] });
  });

  test('pagina de 50 en 50', async () => {
    const { tokens, ids } = await prepararEntorno();
    const id = await insertarVersion(1);
    await aceptarEnBase(ids.admin, id); // con compuerta, el ADMIN debe haber aceptado
    const hash = await bcrypt.hash(CLAVE, 4);
    const valores = [];
    for (let i = 0; i < 50; i += 1) {
      const [usuario] = await getPool().query(
        'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
        [`extra${i}`, `extra${i}@motorix.local`, hash, `Extra ${i}`, 'MECHANIC']
      );
      valores.push([usuario.insertId, id]);
    }
    await getPool().query('INSERT INTO terms_acceptances (user_id, terms_version_id) VALUES ?', [valores]);

    const primera = await request(app).get('/api/terms/acceptances').set(con(tokens.admin));
    const segunda = await request(app).get('/api/terms/acceptances?pagina=2').set(con(tokens.admin));

    expect(primera.body).toMatchObject({ pagina: 1, totalPaginas: 2, total: 51 });
    expect(primera.body.datos).toHaveLength(50);
    expect(segunda.body.pagina).toBe(2);
    expect(segunda.body.datos).toHaveLength(1);
  });

  test.each(['0', '-1', 'abc', '1.5'])('la página %p responde 400 DATOS_INVALIDOS', async (pagina) => {
    const { tokens } = await prepararEntorno();

    const respuesta = await request(app).get(`/api/terms/acceptances?pagina=${pagina}`).set(con(tokens.admin));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('seguridad del cierre de sesión y de la renovación', () => {
  test('un usuario desactivado sigue recibiendo 401 en las rutas exentas', async () => {
    const { tokens, ids } = await prepararEntorno();
    await insertarVersion(1);
    await getPool().query('UPDATE users SET active = 0 WHERE id = ?', [ids.recepcion]);

    expect((await request(app).get('/api/terms/current').set(con(tokens.recepcion))).status).toBe(401);
    expect((await request(app).post('/api/auth/renew').set(con(tokens.recepcion))).status).toBe(401);
  });
});
