// 008-configuracion-seguridad-reportes, T004 (bloque P1; FR-001, FR-003, FR-006,
// FR-007, CA-4): las migraciones 019 a 021 crean `settings` y `service_types`,
// agregan `order_services.service_type_id` y las columnas de instantánea del
// taller en `tickets`. Las filas existentes quedan en NULL (sin relleno).
// Corre contra `motorix_test`, nunca contra la base principal.
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

/** Crea cliente, vehículo y orden mínimos y devuelve sus ids. */
async function crearOrden(sufijo) {
  const pool = getPool();
  const [cliente] = await pool.query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', [
    `Cliente migración ${sufijo}`,
    '5550000000',
  ]);
  const [vehiculo] = await pool.query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, `M19-${sufijo}`, 'Nissan', 'Versa', 2020]
  );
  const [orden] = await pool.query(
    'INSERT INTO service_orders (client_id, vehicle_id, mileage_entry, reason) VALUES (?, ?, ?, ?)',
    [cliente.insertId, vehiculo.insertId, 10000, 'Prueba de migración']
  );
  return { ordenId: orden.insertId };
}

describe('migración 019: settings', () => {
  test('tiene clave primaria setting_key, valor obligatorio y updated_by con FK a users', async () => {
    const clave = await columnaDe('settings', 'setting_key');
    expect(clave).toBeDefined();
    expect(clave.tipoCompleto).toBe('varchar(50)');
    expect(clave.llave).toBe('PRI');

    const valor = await columnaDe('settings', 'setting_value');
    expect(valor.tipoCompleto).toBe('varchar(255)');
    expect(valor.nulo).toBe('NO');

    const autor = await columnaDe('settings', 'updated_by');
    expect(autor.nulo).toBe('YES');
    expect((await columnaDe('settings', 'updated_at')).nulo).toBe('NO');
    expect(await llavesForaneasDe('settings')).toEqual({ updated_by: 'users' });
  });

  test('una clave no se puede repetir', async () => {
    const pool = getPool();
    const sql = 'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)';
    await pool.query(sql, ['shop.name', 'Taller A']);
    await expect(pool.query(sql, ['shop.name', 'Taller B'])).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
  });
});

describe('migración 020: service_types y order_services.service_type_id', () => {
  test('service_types: nombre único sin distinguir mayúsculas y activo por omisión', async () => {
    const activo = await columnaDe('service_types', 'active');
    expect(activo).toBeDefined();
    expect(String(activo.valorPorDefecto)).toBe('1');

    const pool = getPool();
    const sql = 'INSERT INTO service_types (name, interval_days, interval_km) VALUES (?, ?, ?)';
    await pool.query(sql, ['Cambio de aceite', 180, 5000]);
    await expect(pool.query(sql, ['CAMBIO DE ACEITE', 90, null])).rejects.toMatchObject({
      code: 'ER_DUP_ENTRY',
    });
  });

  test('exige al menos un intervalo y valores positivos (CHECK)', async () => {
    const pool = getPool();
    const sql = 'INSERT INTO service_types (name, interval_days, interval_km) VALUES (?, ?, ?)';

    await expect(pool.query(sql, ['Sin intervalos', null, null])).rejects.toBeDefined();
    await expect(pool.query(sql, ['Días en cero', 0, null])).rejects.toBeDefined();
    await expect(pool.query(sql, ['Km en cero', null, 0])).rejects.toBeDefined();

    await pool.query(sql, ['Solo días', 180, null]);
    await pool.query(sql, ['Solo km', null, 10000]);
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM service_types');
    expect(Number(total)).toBe(2);
  });

  test('order_services.service_type_id es opcional, tiene FK a service_types e índice', async () => {
    const columna = await columnaDe('order_services', 'service_type_id');
    expect(columna).toBeDefined();
    expect(columna.nulo).toBe('YES');
    expect(await llavesForaneasDe('order_services')).toMatchObject({
      service_type_id: 'service_types',
    });
    const indices = await indicesDe('order_services');
    expect(indices.get('idx_order_services_type')).toEqual({
      unico: false,
      columnas: ['service_type_id'],
    });
  });

  test('una línea de servicio existente (sin tipo) queda con service_type_id en NULL', async () => {
    const pool = getPool();
    const { ordenId } = await crearOrden('S1');
    await pool.query(
      'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
      [ordenId, 'Servicio heredado', 100]
    );

    const [[fila]] = await pool.query(
      'SELECT service_type_id FROM order_services WHERE order_id = ?',
      [ordenId]
    );
    expect(fila.service_type_id).toBeNull();
  });

  test('una línea no puede apuntar a un tipo inexistente', async () => {
    const pool = getPool();
    const { ordenId } = await crearOrden('S2');
    await expect(
      pool.query(
        'INSERT INTO order_services (order_id, description, amount, service_type_id) VALUES (?, ?, ?, ?)',
        [ordenId, 'Servicio con tipo falso', 100, 999999]
      )
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
});

describe('migración 021: instantánea del taller en tickets', () => {
  test('tickets tiene shop_name, shop_address y shop_phone nulos', async () => {
    const nombre = await columnaDe('tickets', 'shop_name');
    expect(nombre).toBeDefined();
    expect(nombre.tipoCompleto).toBe('varchar(100)');
    expect(nombre.nulo).toBe('YES');

    const direccion = await columnaDe('tickets', 'shop_address');
    expect(direccion.tipoCompleto).toBe('varchar(150)');
    expect(direccion.nulo).toBe('YES');

    const telefono = await columnaDe('tickets', 'shop_phone');
    expect(telefono.tipoCompleto).toBe('varchar(30)');
    expect(telefono.nulo).toBe('YES');
  });

  test('un ticket creado sin instantánea (como los existentes) queda con las tres columnas en NULL, sin relleno', async () => {
    const pool = getPool();
    const { ordenId } = await crearOrden('T1');
    await pool.query('INSERT INTO tickets (order_id, folio) VALUES (?, ?)', [
      ordenId,
      'TCK-2026-0900',
    ]);

    const [[fila]] = await pool.query(
      'SELECT shop_name, shop_address, shop_phone FROM tickets WHERE order_id = ?',
      [ordenId]
    );
    expect(fila).toEqual({ shop_name: null, shop_address: null, shop_phone: null });
  });
});
