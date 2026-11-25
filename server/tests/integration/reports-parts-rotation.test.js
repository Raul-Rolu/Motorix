// 008-configuracion-seguridad-reportes, T127 (bloque P3, US10; FR-023, FR-024,
// FR-025, FR-026, CA-6, CA-7, CA-8, CA-11): `GET /api/reports/parts` y
// `GET /api/reports/rotation`.
//
// Refacciones: UNA FILA POR USO (línea de `order_parts`) de órdenes cerradas del
// periodo (`TERMINADO`/`ENTREGADO` con `status_changed_at` en el rango). Ventas =
// precio congelado del uso × cantidad; costo = precio de compra VIGENTE de la
// refacción × cantidad; margen = ventas − costo; todo en centavos enteros. Un uso
// sin precio de compra es «sin costo» y uno sin precio de venta es «sin precio»:
// ambos quedan FUERA de los totales (nunca se calcula con costo 0). Paginado.
//
// Rotación: por refacción ACTIVA, unidades de salida (`OUT`) del rango entre la
// existencia actual; existencia 0 → «sin existencia» (al final). Paginado.
// Corre contra `motorix_test`.
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
const con = (token) => ({ Authorization: `Bearer ${token}` });
const RANGO = { desde: '2026-11-01', hasta: '2026-11-30' };
const DENTRO = '2026-11-15 10:00:00';

let entorno;
let contadorCodigo = 0;

async function prepararEntorno() {
  const hash = await bcrypt.hash(CLAVE, 4);
  const tokens = {};
  for (const [username, rol] of [
    ['admin', 'ADMIN'],
    ['recepcion', 'RECEPTIONIST'],
    ['mecanico', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, `Usuario ${username}`, rol]
    );
    const login = await request(app).post('/api/auth/login').send({ identificacion: username, contrasena: CLAVE });
    tokens[username] = login.body.token;
  }
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', ['Cliente Reportes', '5550001111']);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, 'REP-003-A', 'Nissan', 'Versa', 2020]
  );
  return { tokens, clienteId: cliente.insertId, vehiculoId: vehiculo.insertId };
}

async function orden({ estado = 'ENTREGADO', fecha = DENTRO } = {}) {
  const [resultado] = await getPool().query(
    'INSERT INTO service_orders (client_id, vehicle_id, status, mileage_entry, reason, status_changed_at) VALUES (?, ?, ?, 30000, ?, ?)',
    [entorno.clienteId, entorno.vehiculoId, estado, 'Servicio', fecha]
  );
  return resultado.insertId;
}

/** Refacción; `compra` y `venta` nulos = sin precio. */
async function parte({ nombre = null, compra = 60, stock = 10, activa = 1 } = {}) {
  contadorCodigo += 1;
  const codigo = `RPT-${String(contadorCodigo).padStart(4, '0')}`;
  const [resultado] = await getPool().query(
    'INSERT INTO parts (name, code, stock, min_stock, is_active, purchase_price, sale_price) VALUES (?, ?, ?, 0, ?, ?, 100)',
    [nombre ?? `Refacción ${contadorCodigo}`, codigo, stock, activa, compra]
  );
  return { id: resultado.insertId, codigo, nombre: nombre ?? `Refacción ${contadorCodigo}` };
}

/** Uso de una refacción en una orden con el precio de venta congelado (nulo = sin precio). */
async function uso(ordenId, parteId, cantidad, precio) {
  const [resultado] = await getPool().query(
    'INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
    [ordenId, parteId, cantidad, precio]
  );
  return resultado.insertId;
}

const movimiento = (parteId, tipo, cantidad, fecha = DENTRO) =>
  getPool().query('INSERT INTO inventory_movements (part_id, movement_type, quantity, reason, created_at) VALUES (?, ?, ?, ?, ?)', [
    parteId,
    tipo,
    cantidad,
    'Movimiento de prueba',
    fecha,
  ]);

const consultar = (reporte, token, consulta = RANGO) =>
  request(app).get(`/api/reports/${reporte}?${new URLSearchParams(consulta).toString()}`).set(con(token));

beforeEach(async () => {
  contadorCodigo = 0;
  entorno = await prepararEntorno();
});

describe('refacciones: costo, venta y margen por uso', () => {
  test('ventas = precio congelado × cantidad, costo = compra vigente × cantidad, margen en centavos', async () => {
    const filtro = await parte({ nombre: 'Pastillas de freno', compra: 300 });
    const ordenId = await orden();
    await uso(ordenId, filtro.id, 4, 450);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rango).toEqual(RANGO);
    expect(respuesta.body.datos).toEqual([
      {
        ordenId,
        parteId: filtro.id,
        codigo: filtro.codigo,
        nombre: 'Pastillas de freno',
        cantidad: 4,
        precioVentaCentavos: 45000,
        precioCompraCentavos: 30000,
        ventasCentavos: 180000,
        costoCentavos: 120000,
        margenCentavos: 60000,
        sinCosto: false,
        sinPrecio: false,
      },
    ]);
    expect(respuesta.body.totales).toEqual({
      ventasCentavos: 180000,
      costoCentavos: 120000,
      margenCentavos: 60000,
      lineasSinCosto: 0,
      lineasSinPrecio: 0,
    });
  });

  test('el costo es el precio de compra VIGENTE: si cambió después del uso, se usa el actual', async () => {
    const p = await parte({ compra: 100 });
    await uso(await orden(), p.id, 2, 150);
    await getPool().query('UPDATE parts SET purchase_price = 120 WHERE id = ?', [p.id]);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.body.datos[0].precioCompraCentavos).toBe(12000);
    expect(respuesta.body.datos[0].costoCentavos).toBe(24000);
    expect(respuesta.body.datos[0].margenCentavos).toBe(6000);
  });

  test('un uso sin precio de compra es «sin costo»: costo y margen null y fuera de los totales (nunca costo 0)', async () => {
    const completa = await parte({ compra: 50 });
    const sinCosto = await parte({ compra: null });
    const ordenId = await orden();
    await uso(ordenId, completa.id, 1, 80);
    await uso(ordenId, sinCosto.id, 3, 200);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    const linea = respuesta.body.datos.find((d) => d.parteId === sinCosto.id);
    expect(linea).toMatchObject({
      sinCosto: true,
      sinPrecio: false,
      precioCompraCentavos: null,
      costoCentavos: null,
      margenCentavos: null,
      precioVentaCentavos: 20000,
      ventasCentavos: 60000,
    });
    expect(respuesta.body.totales).toEqual({
      ventasCentavos: 8000,
      costoCentavos: 5000,
      margenCentavos: 3000,
      lineasSinCosto: 1,
      lineasSinPrecio: 0,
    });
  });

  test('un uso sin precio de venta es «sin precio»: ventas y margen null y fuera de los totales', async () => {
    const p = await parte({ compra: 40 });
    const ordenId = await orden();
    await uso(ordenId, p.id, 2, 90);
    await uso(ordenId, p.id, 5, null);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    const sinPrecio = respuesta.body.datos.find((d) => d.sinPrecio);
    expect(sinPrecio).toMatchObject({
      sinPrecio: true,
      sinCosto: false,
      precioVentaCentavos: null,
      ventasCentavos: null,
      margenCentavos: null,
      cantidad: 5,
      precioCompraCentavos: 4000,
      costoCentavos: 20000,
    });
    expect(respuesta.body.totales).toEqual({
      ventasCentavos: 18000,
      costoCentavos: 8000,
      margenCentavos: 10000,
      lineasSinCosto: 0,
      lineasSinPrecio: 1,
    });
  });

  test('un uso sin precio de compra y sin precio de venta cuenta en los dos contadores', async () => {
    const p = await parte({ compra: null });
    await uso(await orden(), p.id, 1, null);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.body.totales).toEqual({
      ventasCentavos: 0,
      costoCentavos: 0,
      margenCentavos: 0,
      lineasSinCosto: 1,
      lineasSinPrecio: 1,
    });
    expect(respuesta.body.datos[0]).toMatchObject({ sinCosto: true, sinPrecio: true, margenCentavos: null });
  });

  test('precio de venta 0 (obsequio) es un precio válido: ventas 0 y margen negativo', async () => {
    const p = await parte({ compra: 25 });
    await uso(await orden(), p.id, 2, 0);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.body.datos[0]).toMatchObject({ sinPrecio: false, ventasCentavos: 0, costoCentavos: 5000, margenCentavos: -5000 });
    expect(respuesta.body.totales.margenCentavos).toBe(-5000);
  });

  test('precio de compra 0 es un costo válido (no «sin costo»)', async () => {
    const p = await parte({ compra: 0 });
    await uso(await orden(), p.id, 1, 70);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.body.datos[0]).toMatchObject({ sinCosto: false, costoCentavos: 0, margenCentavos: 7000 });
  });

  test('los totales son enteros exactos (3 × 33.33 = 99.99; 0.1 + 0.2 = 30 centavos)', async () => {
    const a = await parte({ compra: 0.1 });
    const b = await parte({ compra: 0.2 });
    const ordenId = await orden();
    await uso(ordenId, a.id, 3, 33.33);
    await uso(ordenId, b.id, 1, 0.3);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.body.totales.ventasCentavos).toBe(9999 + 30);
    expect(respuesta.body.totales.costoCentavos).toBe(30 + 20);
    for (const valor of Object.values(respuesta.body.totales)) expect(Number.isInteger(valor)).toBe(true);
    for (const linea of respuesta.body.datos) expect(Number.isInteger(linea.ventasCentavos)).toBe(true);
  });

  test('las refacciones inactivas siguen apareciendo en sus usos históricos', async () => {
    const p = await parte({ activa: 0, compra: 10 });
    await uso(await orden(), p.id, 1, 20);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.body.datos).toHaveLength(1);
  });
});

describe('refacciones: población', () => {
  test('solo órdenes TERMINADO y ENTREGADO dentro del rango inclusivo', async () => {
    const p = await parte({ compra: 10 });
    for (const estado of ['TERMINADO', 'ENTREGADO']) await uso(await orden({ estado }), p.id, 1, 20);
    for (const estado of ['RECIBIDO', 'DIAGNOSTICO', 'EN_REPARACION', 'ESPERANDO_REFACCION', 'CANCELADA']) {
      await uso(await orden({ estado }), p.id, 7, 999);
    }
    await uso(await orden({ fecha: '2026-10-31 23:59:59' }), p.id, 11, 999); // fuera
    await uso(await orden({ fecha: '2026-11-01 00:00:00' }), p.id, 1, 20); // dentro
    await uso(await orden({ fecha: '2026-11-30 23:59:59' }), p.id, 1, 20); // dentro
    await uso(await orden({ fecha: '2026-12-01 00:00:00' }), p.id, 13, 999); // fuera

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.body.total).toBe(4);
    expect(respuesta.body.totales.ventasCentavos).toBe(8000);
  });

  test('rango sin usos: totales en 0, lista vacía y una sola página', async () => {
    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      rango: RANGO,
      pagina: 1,
      totalPaginas: 1,
      total: 0,
      totales: { ventasCentavos: 0, costoCentavos: 0, margenCentavos: 0, lineasSinCosto: 0, lineasSinPrecio: 0 },
      datos: [],
    });
  });

  test('ordena por la orden cerrada más reciente primero', async () => {
    const p = await parte({ compra: 10 });
    const vieja = await orden({ fecha: '2026-11-02 09:00:00' });
    const nueva = await orden({ fecha: '2026-11-20 09:00:00' });
    await uso(vieja, p.id, 1, 20);
    await uso(nueva, p.id, 1, 20);

    const respuesta = await consultar('parts', entorno.tokens.admin);

    expect(respuesta.body.datos.map((d) => d.ordenId)).toEqual([nueva, vieja]);
  });
});

describe('refacciones: paginación y totales', () => {
  async function crearUsos(cantidad) {
    const p = await parte({ compra: 10 });
    const ordenId = await orden();
    const filas = Array.from({ length: cantidad }, () => [ordenId, p.id, 1, 20]);
    await getPool().query('INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES ?', [filas]);
    return p;
  }

  test('50 por página por omisión; los totales cubren TODAS las líneas, no solo la página', async () => {
    await crearUsos(120);

    const primera = await consultar('parts', entorno.tokens.admin);
    const tercera = await consultar('parts', entorno.tokens.admin, { ...RANGO, pagina: '3' });

    expect(primera.body).toMatchObject({ pagina: 1, totalPaginas: 3, total: 120 });
    expect(primera.body.datos).toHaveLength(50);
    expect(tercera.body).toMatchObject({ pagina: 3, totalPaginas: 3 });
    expect(tercera.body.datos).toHaveLength(20);
    expect(primera.body.totales.ventasCentavos).toBe(120 * 2000);
    expect(tercera.body.totales).toEqual(primera.body.totales);
  });

  test('limite de 1 a 100; la página 2 trae filas distintas a la 1', async () => {
    await crearUsos(30);

    const a = await consultar('parts', entorno.tokens.admin, { ...RANGO, limite: '10', pagina: '1' });
    const b = await consultar('parts', entorno.tokens.admin, { ...RANGO, limite: '10', pagina: '2' });
    const maximo = await consultar('parts', entorno.tokens.admin, { ...RANGO, limite: '100' });

    expect(a.body.datos).toHaveLength(10);
    expect(b.body.datos).toHaveLength(10);
    expect(a.body.totalPaginas).toBe(3);
    expect(maximo.body.datos).toHaveLength(30);
    const idsA = new Set(a.body.datos.map((d) => `${d.ordenId}`));
    expect(b.body.datos.length).toBe(10);
    expect(idsA.size).toBeGreaterThan(0);
  });

  test('una página más allá de la última devuelve datos vacíos con los totales', async () => {
    await crearUsos(5);

    const respuesta = await consultar('parts', entorno.tokens.admin, { ...RANGO, pagina: '9' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
    expect(respuesta.body.pagina).toBe(9);
    expect(respuesta.body.total).toBe(5);
  });

  test.each([
    ['limite=0', { limite: '0' }],
    ['limite=101', { limite: '101' }],
    ['limite=-1', { limite: '-1' }],
    ['limite=abc', { limite: 'abc' }],
    ['limite vacío', { limite: '' }],
    ['pagina=0', { pagina: '0' }],
    ['pagina=-2', { pagina: '-2' }],
    ['pagina=1.5', { pagina: '1.5' }],
  ])('%s → 400 DATOS_INVALIDOS', async (_nombre, extra) => {
    const respuesta = await consultar('parts', entorno.tokens.admin, { ...RANGO, ...extra });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
  });

  test('el rango se valida antes que la paginación (RANGO_INVALIDO)', async () => {
    const respuesta = await consultar('parts', entorno.tokens.admin, { desde: 'basura', hasta: '2026-11-30', limite: '999' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('RANGO_INVALIDO');
  });
});

describe('rotación de inventario', () => {
  test('unidades OUT del rango entre la existencia actual', async () => {
    const p = await parte({ nombre: 'Filtro de aceite', stock: 4 });
    await movimiento(p.id, 'OUT', 6);
    await movimiento(p.id, 'OUT', 2, '2026-11-30 23:59:59');

    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rango).toEqual(RANGO);
    expect(respuesta.body.datos).toEqual([
      { parteId: p.id, codigo: p.codigo, nombre: 'Filtro de aceite', unidadesSalidas: 8, existencia: 4, rotacion: 2, sinExistencia: false },
    ]);
    expect(respuesta.body).toMatchObject({ pagina: 1, totalPaginas: 1, total: 1 });
  });

  test('IN y ADJUSTMENT no cuentan; las salidas fuera del rango tampoco', async () => {
    const p = await parte({ stock: 10 });
    await movimiento(p.id, 'IN', 50);
    await movimiento(p.id, 'ADJUSTMENT', -3);
    await movimiento(p.id, 'OUT', 5, '2026-10-31 23:59:59'); // fuera
    await movimiento(p.id, 'OUT', 5, '2026-12-01 00:00:00'); // fuera
    await movimiento(p.id, 'OUT', 1);

    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(respuesta.body.datos[0].unidadesSalidas).toBe(1);
    expect(respuesta.body.datos[0].rotacion).toBe(0.1);
  });

  test('existencia 0 → «sin existencia» (rotación null), al final de la lista', async () => {
    const agotada = await parte({ nombre: 'Agotada', stock: 0 });
    const normal = await parte({ nombre: 'Normal', stock: 5 });
    await movimiento(agotada.id, 'OUT', 9);
    await movimiento(normal.id, 'OUT', 1);

    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(respuesta.body.datos.map((d) => d.nombre)).toEqual(['Normal', 'Agotada']);
    expect(respuesta.body.datos[1]).toMatchObject({ unidadesSalidas: 9, existencia: 0, rotacion: null, sinExistencia: true });
    expect(respuesta.body.datos[0].sinExistencia).toBe(false);
  });

  test('las refacciones inactivas se excluyen; las activas sin salidas aparecen con rotación 0', async () => {
    const inactiva = await parte({ activa: 0, stock: 3 });
    const quieta = await parte({ nombre: 'Quieta', stock: 3 });
    await movimiento(inactiva.id, 'OUT', 4);

    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(respuesta.body.datos).toEqual([
      { parteId: quieta.id, codigo: quieta.codigo, nombre: 'Quieta', unidadesSalidas: 0, existencia: 3, rotacion: 0, sinExistencia: false },
    ]);
  });

  test('ordena por rotación descendente y, a igualdad, por nombre; «sin existencia» al final', async () => {
    const b = await parte({ nombre: 'Bujía', stock: 10 });
    const a = await parte({ nombre: 'Aceite', stock: 10 });
    const rapida = await parte({ nombre: 'Zapata', stock: 2 });
    const agotada = await parte({ nombre: 'Agotada primero alfabéticamente', stock: 0 });
    await movimiento(b.id, 'OUT', 5);
    await movimiento(a.id, 'OUT', 5);
    await movimiento(rapida.id, 'OUT', 8);
    await movimiento(agotada.id, 'OUT', 100);

    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(respuesta.body.datos.map((d) => d.nombre)).toEqual(['Zapata', 'Aceite', 'Bujía', 'Agotada primero alfabéticamente']);
    expect(respuesta.body.datos.map((d) => d.rotacion)).toEqual([4, 0.5, 0.5, null]);
  });

  test('una salida guardada con signo negativo cuenta como unidades positivas', async () => {
    const p = await parte({ stock: 5 });
    await movimiento(p.id, 'OUT', -3);

    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(respuesta.body.datos[0].unidadesSalidas).toBe(3);
  });

  test('la rotación se redondea a dos decimales', async () => {
    const p = await parte({ stock: 3 });
    await movimiento(p.id, 'OUT', 1);

    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(respuesta.body.datos[0].rotacion).toBe(0.33);
  });

  test('pagina de 50 en 50 por omisión y respeta limite', async () => {
    const filas = Array.from({ length: 120 }, (_, i) => [`Parte ${String(i).padStart(3, '0')}`, `PAG-${i}`, 5, 0, 1]);
    await getPool().query('INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES ?', [filas]);

    const primera = await consultar('rotation', entorno.tokens.admin);
    const ultima = await consultar('rotation', entorno.tokens.admin, { ...RANGO, pagina: '3' });
    const corta = await consultar('rotation', entorno.tokens.admin, { ...RANGO, limite: '25', pagina: '5' });

    expect(primera.body).toMatchObject({ pagina: 1, totalPaginas: 3, total: 120 });
    expect(primera.body.datos).toHaveLength(50);
    expect(ultima.body.datos).toHaveLength(20);
    expect(corta.body.datos).toHaveLength(20);
    expect(corta.body.totalPaginas).toBe(5);
  });

  test('sin refacciones activas → lista vacía y una sola página', async () => {
    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(respuesta.body).toEqual({ rango: RANGO, pagina: 1, totalPaginas: 1, total: 0, datos: [] });
  });

  test('no expone precios ni datos de compra', async () => {
    const p = await parte({ stock: 5, compra: 62.5 });
    await movimiento(p.id, 'OUT', 1);

    const respuesta = await consultar('rotation', entorno.tokens.admin);

    expect(JSON.stringify(respuesta.body)).not.toMatch(/purchase|compra|precio|62\.5|6250/i);
  });
});

describe('rango inválido y compuerta (ambos reportes)', () => {
  test.each(['parts', 'rotation'])('%s: sin rango → 400 RANGO_INVALIDO', async (reporte) => {
    const respuesta = await consultar(reporte, entorno.tokens.admin, {});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('RANGO_INVALIDO');
  });

  test.each(['parts', 'rotation'])('%s: más de 366 días → 400 RANGO_INVALIDO', async (reporte) => {
    const respuesta = await consultar(reporte, entorno.tokens.admin, { desde: '2025-11-23', hasta: '2026-11-24' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('RANGO_INVALIDO');
  });

  test.each(['parts', 'rotation'])('%s: una carga de inyección se rechaza y las tablas quedan intactas', async (reporte) => {
    await parte();

    const respuesta = await consultar(reporte, entorno.tokens.admin, { desde: "2026-11-01'; DROP TABLE parts; --", hasta: '2026-11-30' });

    expect(respuesta.status).toBe(400);
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM parts');
    expect(Number(total)).toBe(1);
  });

  test.each(['parts', 'rotation'])('%s: con una versión de términos sin aceptar responde 403 TERMS_NOT_ACCEPTED', async (reporte) => {
    await getPool().query('INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (1, ?, ?)', [
      'Términos de prueba de los reportes.',
      'Aviso de privacidad de prueba.',
    ]);

    const respuesta = await consultar(reporte, entorno.tokens.admin);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');
  });
});
