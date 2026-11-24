// 008-configuracion-seguridad-reportes, T059 (bloque P2; FR-011, FR-019, CA-20):
// las migraciones 022 y 023 crean la bitácora `audit_log` y las tablas de
// términos `terms_versions` y `terms_acceptances`. Corre contra `motorix_test`,
// nunca contra la base principal.
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

beforeAll(async () => {
  await prepararBaseDePruebas();
});

afterEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

async function columnaDe(tabla, columna) {
  const [filas] = await getPool().query(
    `SELECT DATA_TYPE AS tipo, IS_NULLABLE AS nulo, COLUMN_DEFAULT AS valorPorDefecto,
            COLUMN_TYPE AS tipoCompleto, COLUMN_KEY AS llave
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna]
  );
  return filas[0];
}

async function indicesDe(tabla) {
  const [filas] = await getPool().query(
    `SELECT INDEX_NAME AS nombre, NON_UNIQUE AS noUnico, COLUMN_NAME AS columna
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [tabla]
  );
  const mapa = new Map();
  for (const fila of filas) {
    if (!mapa.has(fila.nombre)) {
      mapa.set(fila.nombre, { unico: Number(fila.noUnico) === 0, columnas: [] });
    }
    mapa.get(fila.nombre).columnas.push(fila.columna);
  }
  return mapa;
}

async function llavesForaneasDe(tabla) {
  const [filas] = await getPool().query(
    `SELECT COLUMN_NAME AS columna, REFERENCED_TABLE_NAME AS tabla
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [tabla]
  );
  return Object.fromEntries(filas.map((fila) => [fila.columna, fila.tabla]));
}

async function crearUsuario(username) {
  const [usuario] = await getPool().query(
    "INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, 'x', 'Usuario', 'ADMIN')",
    [username, `${username}@motorix.local`]
  );
  return usuario.insertId;
}

describe('migración 022: audit_log', () => {
  test('columnas: usuario nulo, acción y entidad obligatorias, detalle de hasta 255', async () => {
    const usuario = await columnaDe('audit_log', 'user_id');
    expect(usuario).toBeDefined();
    expect(usuario.nulo).toBe('YES');

    const accion = await columnaDe('audit_log', 'action');
    expect(accion.tipoCompleto).toBe('varchar(40)');
    expect(accion.nulo).toBe('NO');

    const entidad = await columnaDe('audit_log', 'entity_type');
    expect(entidad.tipoCompleto).toBe('varchar(30)');
    expect(entidad.nulo).toBe('NO');

    expect((await columnaDe('audit_log', 'entity_id')).nulo).toBe('YES');

    const detalle = await columnaDe('audit_log', 'detail');
    expect(detalle.tipoCompleto).toBe('varchar(255)');
    expect(detalle.nulo).toBe('YES');

    const fecha = await columnaDe('audit_log', 'created_at');
    expect(fecha.nulo).toBe('NO');
    expect(String(fecha.valorPorDefecto)).toMatch(/CURRENT_TIMESTAMP/i);
  });

  test('índices por fecha, por usuario y fecha y por acción y fecha', async () => {
    const indices = await indicesDe('audit_log');

    expect(indices.get('idx_audit_created')).toEqual({ unico: false, columnas: ['created_at'] });
    expect(indices.get('idx_audit_user')).toEqual({ unico: false, columnas: ['user_id', 'created_at'] });
    expect(indices.get('idx_audit_action')).toEqual({ unico: false, columnas: ['action', 'created_at'] });
  });

  test('llave foránea solo hacia users', async () => {
    expect(await llavesForaneasDe('audit_log')).toEqual({ user_id: 'users' });
  });

  test('una entrada sin usuario (inicio de sesión fallido de una cuenta inexistente) es válida', async () => {
    const [resultado] = await getPool().query(
      "INSERT INTO audit_log (user_id, action, entity_type, detail) VALUES (NULL, 'LOGIN_FAILED', 'SESSION', 'Identificador: nadie')"
    );

    const [[fila]] = await getPool().query('SELECT user_id, created_at FROM audit_log WHERE id = ?', [
      resultado.insertId,
    ]);
    expect(fila.user_id).toBeNull();
    expect(fila.created_at).not.toBeNull();
  });

  test('una entrada no puede apuntar a un usuario inexistente', async () => {
    await expect(
      getPool().query("INSERT INTO audit_log (user_id, action, entity_type) VALUES (999999, 'USER_CREATED', 'USER')")
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
});

describe('migración 023: terms_versions', () => {
  test('columnas: versión única, textos obligatorios y publicador opcional', async () => {
    const version = await columnaDe('terms_versions', 'version');
    expect(version).toBeDefined();
    expect(version.nulo).toBe('NO');

    for (const columna of ['terms_text', 'privacy_text']) {
      const texto = await columnaDe('terms_versions', columna);
      expect(texto.tipo).toBe('text');
      expect(texto.nulo).toBe('NO');
    }

    expect((await columnaDe('terms_versions', 'published_by')).nulo).toBe('YES');
    const fecha = await columnaDe('terms_versions', 'published_at');
    expect(fecha.nulo).toBe('NO');
    expect(String(fecha.valorPorDefecto)).toMatch(/CURRENT_TIMESTAMP/i);
  });

  test('el número de versión es único y published_by apunta a users', async () => {
    const indices = await indicesDe('terms_versions');
    expect(indices.get('uq_terms_version')).toEqual({ unico: true, columnas: ['version'] });
    expect(await llavesForaneasDe('terms_versions')).toEqual({ published_by: 'users' });

    const sql = 'INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (?, ?, ?)';
    await getPool().query(sql, [1, 'Términos', 'Privacidad']);
    await expect(getPool().query(sql, [1, 'Otros', 'Otros'])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await getPool().query(sql, [2, 'Términos 2', 'Privacidad 2']);
  });

  test('la versión sembrada puede no tener publicador (published_by nulo)', async () => {
    const [resultado] = await getPool().query(
      "INSERT INTO terms_versions (version, terms_text, privacy_text, published_by) VALUES (1, 'T', 'P', NULL)"
    );
    const [[fila]] = await getPool().query('SELECT published_by FROM terms_versions WHERE id = ?', [
      resultado.insertId,
    ]);
    expect(fila.published_by).toBeNull();
  });
});

describe('migración 023: terms_acceptances', () => {
  test('columnas obligatorias y llaves foráneas hacia users y terms_versions', async () => {
    expect((await columnaDe('terms_acceptances', 'user_id')).nulo).toBe('NO');
    expect((await columnaDe('terms_acceptances', 'terms_version_id')).nulo).toBe('NO');
    const fecha = await columnaDe('terms_acceptances', 'accepted_at');
    expect(fecha.nulo).toBe('NO');
    expect(String(fecha.valorPorDefecto)).toMatch(/CURRENT_TIMESTAMP/i);

    expect(await llavesForaneasDe('terms_acceptances')).toEqual({
      user_id: 'users',
      terms_version_id: 'terms_versions',
    });
  });

  test('una sola aceptación por usuario y versión (UNIQUE)', async () => {
    const indices = await indicesDe('terms_acceptances');
    expect(indices.get('uq_terms_acceptance')).toEqual({
      unico: true,
      columnas: ['user_id', 'terms_version_id'],
    });

    const usuarioId = await crearUsuario('acepta');
    const [version] = await getPool().query(
      "INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (1, 'T', 'P')"
    );
    const sql = 'INSERT INTO terms_acceptances (user_id, terms_version_id) VALUES (?, ?)';
    await getPool().query(sql, [usuarioId, version.insertId]);
    await expect(getPool().query(sql, [usuarioId, version.insertId])).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });

    // El mismo usuario sí puede aceptar una versión nueva.
    const [version2] = await getPool().query(
      "INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (2, 'T2', 'P2')"
    );
    await getPool().query(sql, [usuarioId, version2.insertId]);
  });

  test('no se puede aceptar una versión inexistente ni por un usuario inexistente', async () => {
    const usuarioId = await crearUsuario('sin-version');
    await expect(
      getPool().query('INSERT INTO terms_acceptances (user_id, terms_version_id) VALUES (?, 999999)', [usuarioId])
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
    await expect(
      getPool().query('INSERT INTO terms_acceptances (user_id, terms_version_id) VALUES (999999, 1)')
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
});

describe('limpieza entre suites', () => {
  test('limpiarTablas() vacía audit_log, terms_acceptances y terms_versions', async () => {
    const usuarioId = await crearUsuario('limpieza');
    const [version] = await getPool().query(
      "INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (1, 'T', 'P')"
    );
    await getPool().query('INSERT INTO terms_acceptances (user_id, terms_version_id) VALUES (?, ?)', [
      usuarioId,
      version.insertId,
    ]);
    await getPool().query("INSERT INTO audit_log (user_id, action, entity_type) VALUES (?, 'USER_CREATED', 'USER')", [
      usuarioId,
    ]);

    await limpiarTablas();

    for (const tabla of ['audit_log', 'terms_acceptances', 'terms_versions', 'users']) {
      const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM ${tabla}`);
      expect(Number(total)).toBe(0);
    }
  });
});
