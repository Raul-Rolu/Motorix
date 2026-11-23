// 007-notificaciones-internas, T003 (Fase 2, FR-020, CA-15): la migración 018
// agrega `status_changed_at` a las órdenes y crea `notification_reads` y
// `client_notices`. El relleno de las órdenes existentes debe copiar
// `updated_at` SIN alterarlo. Corre contra `motorix_test`.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const directorioMigraciones = path.join(__dirname, '..', '..', '..', 'database', 'migrations');

beforeAll(async () => {
  await prepararBaseDePruebas();
});

afterEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

/** Texto de la migración 018 (el archivo debe existir con ese prefijo numérico). */
function leerMigracion018() {
  const archivo = readdirSync(directorioMigraciones).find((nombre) => nombre.startsWith('018_'));
  expect(archivo).toBeDefined();
  return readFileSync(path.join(directorioMigraciones, archivo), 'utf8');
}

async function indicesDe(tabla) {
  const [filas] = await getPool().query(
    `SELECT INDEX_NAME AS nombre, NON_UNIQUE AS noUnico, SEQ_IN_INDEX AS posicion,
            COLUMN_NAME AS columna
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

async function columnaDe(tabla, columna) {
  const [filas] = await getPool().query(
    `SELECT DATA_TYPE AS tipo, IS_NULLABLE AS nulo, COLUMN_DEFAULT AS valorPorDefecto,
            CHARACTER_MAXIMUM_LENGTH AS largo, COLUMN_TYPE AS tipoCompleto
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna]
  );
  return filas[0];
}

/** Crea un cliente, un vehículo y una orden mínimos y devuelve el id de la orden. */
async function crearOrden(sufijo) {
  const pool = getPool();
  const [cliente] = await pool.query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', [
    `Cliente migración ${sufijo}`,
    '5550000000',
  ]);
  const [vehiculo] = await pool.query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, `MIG-${sufijo}`, 'Nissan', 'Versa', 2020]
  );
  const [orden] = await pool.query(
    'INSERT INTO service_orders (client_id, vehicle_id, mileage_entry, reason) VALUES (?, ?, ?, ?)',
    [cliente.insertId, vehiculo.insertId, 10000, 'Prueba de migración']
  );
  return { ordenId: orden.insertId, clienteId: cliente.insertId };
}

describe('migración 018: esquema', () => {
  test('service_orders tiene status_changed_at NOT NULL con valor por defecto de la hora actual', async () => {
    const columna = await columnaDe('service_orders', 'status_changed_at');

    expect(columna).toBeDefined();
    expect(columna.tipo).toBe('datetime');
    expect(columna.nulo).toBe('NO');
    expect(String(columna.valorPorDefecto)).toMatch(/CURRENT_TIMESTAMP/i);
  });

  test('existe el índice idx_orders_status_changed sobre (status, status_changed_at)', async () => {
    const indices = await indicesDe('service_orders');

    expect(indices.get('idx_orders_status_changed')).toEqual({
      unico: false,
      columnas: ['status', 'status_changed_at'],
    });
  });

  test('una orden nueva recibe status_changed_at con la hora de su creación', async () => {
    const { ordenId } = await crearOrden('A1');

    const [[fila]] = await getPool().query(
      'SELECT status_changed_at, created_at, TIMESTAMPDIFF(SECOND, status_changed_at, NOW()) AS segundos FROM service_orders WHERE id = ?',
      [ordenId]
    );
    expect(fila.status_changed_at).not.toBeNull();
    expect(Math.abs(fila.segundos)).toBeLessThan(5);
  });

  test('notification_reads: columnas, único (user_id, notification_key) y FK a users', async () => {
    const clave = await columnaDe('notification_reads', 'notification_key');
    expect(clave).toBeDefined();
    expect(clave.tipoCompleto).toBe('varchar(80)');
    expect(clave.nulo).toBe('NO');
    expect((await columnaDe('notification_reads', 'read_at')).nulo).toBe('NO');

    const indices = await indicesDe('notification_reads');
    expect(indices.get('uq_notification_read')).toEqual({
      unico: true,
      columnas: ['user_id', 'notification_key'],
    });
    expect(await llavesForaneasDe('notification_reads')).toEqual({ user_id: 'users' });
  });

  test('client_notices: columnas, único (notice_type, fact_id), índice por cliente y FK a clients y users', async () => {
    const tipo = await columnaDe('client_notices', 'notice_type');
    expect(tipo.tipoCompleto).toBe("enum('ORDEN_TERMINADA','CITA_MANANA','MANTENIMIENTO')");
    const nota = await columnaDe('client_notices', 'note');
    expect(nota.tipoCompleto).toBe('varchar(255)');
    expect(nota.nulo).toBe('YES');
    expect((await columnaDe('client_notices', 'fact_id')).nulo).toBe('NO');
    expect((await columnaDe('client_notices', 'notified_by')).nulo).toBe('NO');

    const indices = await indicesDe('client_notices');
    expect(indices.get('uq_client_notice_fact')).toEqual({
      unico: true,
      columnas: ['notice_type', 'fact_id'],
    });
    expect(indices.get('idx_client_notices_client')).toEqual({
      unico: false,
      columnas: ['client_id'],
    });
    expect(await llavesForaneasDe('client_notices')).toEqual({
      client_id: 'clients',
      notified_by: 'users',
    });
  });

  test('un mismo hecho no puede avisarse dos veces (restricción única)', async () => {
    const pool = getPool();
    const { clienteId } = await crearOrden('B2');
    const [usuario] = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('mig', 'mig@motorix.local', 'x', 'Migración', 'RECEPTIONIST')"
    );
    const sql =
      'INSERT INTO client_notices (client_id, notice_type, fact_id, notified_by) VALUES (?, ?, ?, ?)';

    await pool.query(sql, [clienteId, 'ORDEN_TERMINADA', 7, usuario.insertId]);
    await expect(pool.query(sql, [clienteId, 'ORDEN_TERMINADA', 7, usuario.insertId])).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
    // Otro tipo con el mismo identificador es otro hecho.
    await pool.query(sql, [clienteId, 'CITA_MANANA', 7, usuario.insertId]);
  });
});

describe('migración 018: relleno de las órdenes existentes', () => {
  test('el relleno copia updated_at a status_changed_at y NO altera updated_at', async () => {
    const pool = getPool();
    const sql = leerMigracion018();
    const sentencia = sql.match(/UPDATE\s+service_orders\s+SET[^;]*status_changed_at[^;]*;/i);
    expect(sentencia).not.toBeNull();

    const { ordenId } = await crearOrden('C3');
    // Orden «antigua»: última modificación de hace un mes y una fecha de estado distinta.
    await pool.query(
      "UPDATE service_orders SET updated_at = '2026-10-01 09:30:00', status_changed_at = '2026-11-20 08:00:00' WHERE id = ?",
      [ordenId]
    );

    await pool.query(sentencia[0]);

    const [[fila]] = await pool.query(
      "SELECT DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS actualizado, DATE_FORMAT(status_changed_at, '%Y-%m-%d %H:%i:%s') AS estado FROM service_orders WHERE id = ?",
      [ordenId]
    );
    expect(fila.estado).toBe('2026-10-01 09:30:00');
    // Sin la asignación explícita `updated_at = updated_at`, ON UPDATE CURRENT_TIMESTAMP lo movería a «ahora».
    expect(fila.actualizado).toBe('2026-10-01 09:30:00');
  });

  test('el relleno asigna explícitamente updated_at = updated_at (evita ON UPDATE CURRENT_TIMESTAMP)', () => {
    const sql = leerMigracion018();
    expect(sql).toMatch(/updated_at\s*=\s*updated_at/i);
  });
});
