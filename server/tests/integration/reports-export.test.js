// 008-configuracion-seguridad-reportes, T136 (bloque P3, US11; FR-027, CA-9):
// `GET /api/reports/:reporte/export`. Cada reporte (`income`, `services`,
// `productivity`, `parts`, `rotation`) se exporta como CSV UTF-8 con BOM, con
// `Content-Disposition` `motorix-<reporte>-<desde>-<hasta>.csv`, y su contenido
// coincide fila por fila con la consulta JSON del mismo rango (más una fila de
// totales cuando la pantalla la muestra). Las celdas de texto que empiezan con
// `=`, `+`, `-`, `@`, tabulador o retorno de carro salen neutralizadas
// (inyección de fórmulas); los importes negativos NO. `parts` incluye el precio de
// compra (reporte exclusivo de ADMIN). Se ignoran `pagina` y `limite`; un nombre
// de reporte inexistente da `404 REPORT_NOT_FOUND` y más de 10,000 filas, `400
// RANGO_INVALIDO`. Exportar NO se audita (decisión de la spec). Corre contra
// `motorix_test`.
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
const REPORTES = ['income', 'services', 'productivity', 'parts', 'rotation'];
const METODOS = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', MERCADO_PAGO: 'Mercado Pago' };

let entorno;

/** Descarga cruda: estado, cabeceras, bytes y texto (conserva el BOM). */
async function descargar(reporte, token, consulta = RANGO) {
  const respuesta = await request(app)
    .get(`/api/reports/${reporte}/export?${new URLSearchParams(consulta).toString()}`)
    .set(con(token))
    .buffer(true)
    .parse((res, terminar) => {
      const trozos = [];
      res.on('data', (trozo) => trozos.push(trozo));
      res.on('end', () => terminar(null, Buffer.concat(trozos)));
    });
  const bytes = Buffer.isBuffer(respuesta.body) ? respuesta.body : Buffer.alloc(0);
  const texto = bytes.toString('utf8');
  let json = null;
  if (/json/.test(respuesta.headers['content-type'] ?? '')) json = JSON.parse(texto);
  return { status: respuesta.status, headers: respuesta.headers, bytes, texto, json };
}

const consultarJson = async (reporte, token, consulta = RANGO) =>
  (await request(app).get(`/api/reports/${reporte}?${new URLSearchParams(consulta).toString()}`).set(con(token))).body;

/** Lector mínimo de CSV (RFC 4180): quita el BOM y devuelve filas de celdas. */
function parsearCsv(texto) {
  const contenido = texto.startsWith('﻿') ? texto.slice(1) : texto;
  const filas = [];
  let fila = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < contenido.length; i += 1) {
    const c = contenido[i];
    if (entreComillas) {
      if (c === '"' && contenido[i + 1] === '"') {
        celda += '"';
        i += 1;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        celda += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      fila.push(celda);
      celda = '';
    } else if (c === '\r' && contenido[i + 1] === '\n') {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
      i += 1;
    } else {
      celda += c;
    }
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

const pesos = (centavos) => (centavos === null || centavos === undefined ? '' : (centavos / 100).toFixed(2));
const neutral = (texto) => (/^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto);

async function prepararEntorno() {
  const hash = await bcrypt.hash(CLAVE, 4);
  const ids = {};
  const tokens = {};
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', '@Mecánico Peña', 'MECHANIC'],
    ['mecanico2', 'Mecánico Dos', 'MECHANIC'],
  ]) {
    const [usuario] = await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
    ids[username] = usuario.insertId;
  }
  for (const username of ['admin', 'recepcion', 'mecanico']) {
    const login = await request(app).post('/api/auth/login').send({ identificacion: username, contrasena: CLAVE });
    tokens[username] = login.body.token;
  }
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', ['Cliente Reportes', '5550001111']);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, 'EXP-001-A', 'Nissan', 'Versa', 2020]
  );
  return { ids, tokens, clienteId: cliente.insertId, vehiculoId: vehiculo.insertId };
}

async function orden({ estado = 'ENTREGADO', mecanico = null, fecha = DENTRO } = {}) {
  const [resultado] = await getPool().query(
    'INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason, status_changed_at) VALUES (?, ?, ?, ?, 30000, ?, ?)',
    [entorno.clienteId, entorno.vehiculoId, mecanico, estado, 'Servicio', fecha]
  );
  return resultado.insertId;
}

let contador = 0;
async function parte({ nombre, compra = 60, stock = 10, activa = 1 }) {
  contador += 1;
  const [resultado] = await getPool().query(
    'INSERT INTO parts (name, code, stock, min_stock, is_active, purchase_price, sale_price) VALUES (?, ?, ?, 0, ?, ?, 100)',
    [nombre, `EXP-${String(contador).padStart(4, '0')}`, stock, activa, compra]
  );
  return resultado.insertId;
}

/** Datos con los que los cinco reportes tienen filas, incluidos textos peligrosos. */
async function sembrarDatos() {
  const tipos = {};
  for (const nombre of ['Cambio de aceite', '+Afinación', 'Rotación de niños']) {
    const [tipo] = await getPool().query('INSERT INTO service_types (name, interval_days) VALUES (?, 180)', [nombre]);
    tipos[nombre] = tipo.insertId;
  }
  const a = await orden({ mecanico: entorno.ids.mecanico });
  const b = await orden({ mecanico: entorno.ids.mecanico2, estado: 'TERMINADO' });
  const c = await orden();
  for (const [ordenId, importe, tipo] of [
    [a, 650, 'Cambio de aceite'],
    [b, 700, 'Cambio de aceite'],
    [a, 400, '+Afinación'],
    [c, 120.5, 'Rotación de niños'],
    [c, 80, null],
  ]) {
    await getPool().query('INSERT INTO order_services (order_id, description, amount, service_type_id) VALUES (?, ?, ?, ?)', [
      ordenId,
      'Línea',
      importe,
      tipo ? tipos[tipo] : null,
    ]);
  }
  for (const [ordenId, importe] of [[a, 300], [b, 450.25], [c, 100]]) {
    await getPool().query('INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)', [ordenId, 'Mano de obra', importe]);
  }
  const peligrosa = await parte({ nombre: '=HYPERLINK("http://x","clic")', compra: 30, stock: 4 });
  const sinCosto = await parte({ nombre: 'Batería, 12V "premium"', compra: null, stock: 0 });
  const obsequio = await parte({ nombre: 'Filtro de niño ñandú', compra: 78.5, stock: 11 });
  await parte({ nombre: 'Inactiva', compra: 10, activa: 0 });
  for (const [ordenId, parteId, cantidad, precio] of [
    [a, peligrosa, 4, 450],
    [b, sinCosto, 1, 900],
    [c, obsequio, 2, 0],
    [c, peligrosa, 1, null],
  ]) {
    await getPool().query('INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES (?, ?, ?, ?)', [ordenId, parteId, cantidad, precio]);
  }
  for (const [parteId, cantidad] of [[peligrosa, 6], [sinCosto, 9], [obsequio, 2]]) {
    await getPool().query(
      "INSERT INTO inventory_movements (part_id, movement_type, quantity, reason, created_at) VALUES (?, 'OUT', ?, 'Uso', ?)",
      [parteId, cantidad, DENTRO]
    );
  }
  for (const [monto, metodo, fecha] of [
    [100, 'CASH', '2026-11-03 10:00:00'],
    [250.75, 'CARD', '2026-11-03 12:00:00'],
    [80, 'MERCADO_PAGO', '2026-11-20 09:00:00'],
    [40, 'TRANSFER', '2026-11-20 11:00:00'],
  ]) {
    await getPool().query('INSERT INTO payments (order_id, method, amount, status, created_at) VALUES (?, ?, ?, ?, ?)', [a, metodo, monto, 'COMPLETED', fecha]);
  }
}

beforeEach(async () => {
  contador = 0;
  entorno = await prepararEntorno();
});

describe('cabeceras y formato', () => {
  test.each(REPORTES)('%s: 200 con text/csv UTF-8, BOM, CRLF y el nombre de archivo del contrato', async (reporte) => {
    await sembrarDatos();

    const r = await descargar(reporte, entorno.tokens.admin);

    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toBe(`attachment; filename="motorix-${reporte}-2026-11-01-2026-11-30.csv"`);
    expect([...r.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(r.texto.startsWith('﻿')).toBe(true);
    expect(r.texto.indexOf('﻿', 1)).toBe(-1);
    expect(r.texto.endsWith('\r\n')).toBe(true);
    expect(r.texto.split('\r\n').length).toBeGreaterThan(1);
  });

  test('el nombre de archivo usa el rango resuelto cuando se pide un periodo', async () => {
    const r = await descargar('income', entorno.tokens.admin, { periodo: 'MES_ANTERIOR' });

    const hoy = new Date();
    const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(r.headers['content-disposition']).toBe(`attachment; filename="motorix-income-${f(anterior)}-${f(ultimo)}.csv"`);
  });

  test('conserva acentos y eñes (UTF-8)', async () => {
    await sembrarDatos();

    const r = await descargar('services', entorno.tokens.admin);

    expect(r.texto).toContain('Rotación de niños');
    expect(r.texto).toContain('Tipo de servicio');
  });
});

describe('coincide con la consulta JSON del mismo rango', () => {
  test('income: total, periodos y métodos', async () => {
    await sembrarDatos();
    const json = await consultarJson('income', entorno.tokens.admin);

    const filas = parsearCsv((await descargar('income', entorno.tokens.admin)).texto);

    expect(filas[0]).toEqual(['Sección', 'Concepto', 'Importe']);
    expect(filas.slice(1)).toEqual([
      ['Total', 'Total cobrado', pesos(json.totalCentavos)],
      ...json.porPeriodo.map((p) => ['Por periodo', p.periodo, pesos(p.totalCentavos)]),
      ...json.porMetodo.map((m) => ['Por método', METODOS[m.metodo], pesos(m.totalCentavos)]),
    ]);
    expect(json.totalCentavos).toBe(47075);
  });

  test('services: una fila por tipo y la fila «Total» de la pantalla', async () => {
    await sembrarDatos();
    const json = await consultarJson('services', entorno.tokens.admin);

    const filas = parsearCsv((await descargar('services', entorno.tokens.admin)).texto);

    expect(filas[0]).toEqual(['Tipo de servicio', 'Cantidad', 'Importe']);
    expect(filas.slice(1, -1)).toEqual(json.datos.map((d) => [neutral(d.tipo), String(d.cantidad), pesos(d.importeCentavos)]));
    expect(filas.at(-1)).toEqual([
      'Total',
      String(json.datos.reduce((s, d) => s + d.cantidad, 0)),
      pesos(json.datos.reduce((s, d) => s + d.importeCentavos, 0)),
    ]);
  });

  test('productivity: una fila por mecánico («Sin asignar») y «Total»', async () => {
    await sembrarDatos();
    const json = await consultarJson('productivity', entorno.tokens.admin);

    const filas = parsearCsv((await descargar('productivity', entorno.tokens.admin)).texto);

    expect(filas[0]).toEqual(['Mecánico', 'Órdenes', 'Mano de obra']);
    expect(filas.slice(1, -1)).toEqual(
      json.datos.map((d) => [neutral(d.mecanico?.nombre ?? 'Sin asignar'), String(d.ordenes), pesos(d.manoObraCentavos)])
    );
    expect(filas.at(-1)).toEqual([
      'Total',
      String(json.datos.reduce((s, d) => s + d.ordenes, 0)),
      pesos(json.datos.reduce((s, d) => s + d.manoObraCentavos, 0)),
    ]);
  });

  test('parts: una fila por uso con el precio de compra, la observación y los totales', async () => {
    await sembrarDatos();
    const json = await consultarJson('parts', entorno.tokens.admin);

    const filas = parsearCsv((await descargar('parts', entorno.tokens.admin)).texto);

    expect(filas[0]).toEqual([
      'Orden',
      'Código',
      'Refacción',
      'Cantidad',
      'Precio de venta unitario',
      'Precio de compra unitario',
      'Ventas',
      'Costo',
      'Margen',
      'Observación',
    ]);
    const observacion = (d) => (d.sinCosto && d.sinPrecio ? 'sin costo y sin precio' : d.sinCosto ? 'sin costo' : d.sinPrecio ? 'sin precio' : '');
    expect(filas.slice(1, -1)).toEqual(
      json.datos.map((d) => [
        String(d.ordenId),
        d.codigo,
        neutral(d.nombre),
        String(d.cantidad),
        pesos(d.precioVentaCentavos),
        pesos(d.precioCompraCentavos),
        pesos(d.ventasCentavos),
        pesos(d.costoCentavos),
        pesos(d.margenCentavos),
        observacion(d),
      ])
    );
    const totales = filas.at(-1);
    expect(totales[0]).toBe('Total (líneas completas)');
    expect(totales.slice(6, 9)).toEqual([pesos(json.totales.ventasCentavos), pesos(json.totales.costoCentavos), pesos(json.totales.margenCentavos)]);
    expect(totales[9]).toBe('1 línea sin costo y 1 sin precio no se incluyen en estos totales.');
  });

  test('parts incluye el precio de compra de la refacción (solo ADMIN llega aquí)', async () => {
    await sembrarDatos();

    const r = await descargar('parts', entorno.tokens.admin);

    expect(r.texto).toContain('Precio de compra unitario');
    expect(r.texto).toContain('78.50');
  });

  test('rotation: una fila por refacción activa con «sin existencia»', async () => {
    await sembrarDatos();
    const json = await consultarJson('rotation', entorno.tokens.admin);

    const filas = parsearCsv((await descargar('rotation', entorno.tokens.admin)).texto);

    expect(filas[0]).toEqual(['Código', 'Refacción', 'Salidas', 'Existencia', 'Rotación']);
    expect(filas.slice(1)).toEqual(
      json.datos.map((d) => [d.codigo, neutral(d.nombre), String(d.unidadesSalidas), String(d.existencia), d.rotacion === null ? 'sin existencia' : d.rotacion.toFixed(2)])
    );
    expect(filas.some((f) => f[4] === 'sin existencia')).toBe(true);
  });
});

describe('inyección de fórmulas', () => {
  test('las celdas de texto peligrosas salen con una comilla simple delante', async () => {
    await sembrarDatos();

    const refacciones = parsearCsv((await descargar('parts', entorno.tokens.admin)).texto);
    const servicios = parsearCsv((await descargar('services', entorno.tokens.admin)).texto);
    const productividad = parsearCsv((await descargar('productivity', entorno.tokens.admin)).texto);
    const rotacion = parsearCsv((await descargar('rotation', entorno.tokens.admin)).texto);

    expect(refacciones.some((f) => f[2] === '\'=HYPERLINK("http://x","clic")')).toBe(true);
    expect(servicios.some((f) => f[0] === "'+Afinación")).toBe(true);
    expect(productividad.some((f) => f[0] === "'@Mecánico Peña")).toBe(true);
    expect(rotacion.some((f) => f[1] === '\'=HYPERLINK("http://x","clic")')).toBe(true);
    for (const filas of [refacciones, servicios, productividad, rotacion]) {
      for (const fila of filas) {
        for (const celda of fila) expect(/^[=+@\t\r]/.test(celda)).toBe(false);
      }
    }
  });

  test('los importes negativos (margen) NO se neutralizan: siguen siendo números', async () => {
    await sembrarDatos();

    const filas = parsearCsv((await descargar('parts', entorno.tokens.admin)).texto);

    const obsequio = filas.find((f) => f[2] === 'Filtro de niño ñandú');
    expect(obsequio[8]).toBe('-157.00');
    expect(obsequio[8].startsWith("'")).toBe(false);
  });

  test('comas, comillas y saltos de línea dentro de una celda se escapan', async () => {
    await sembrarDatos();

    const r = await descargar('parts', entorno.tokens.admin);

    expect(r.texto).toContain('"Batería, 12V ""premium"""');
    const filas = parsearCsv(r.texto);
    expect(filas.some((f) => f[2] === 'Batería, 12V "premium"')).toBe(true);
    for (const fila of filas) expect(fila).toHaveLength(10);
  });
});

describe('rango, paginación y errores', () => {
  test('ignora pagina y limite (incluso inválidos) y exporta todo el rango', async () => {
    await sembrarDatos();
    const normal = await descargar('parts', entorno.tokens.admin);

    const conParametros = await descargar('parts', entorno.tokens.admin, { ...RANGO, pagina: '9', limite: '1' });
    const invalidos = await descargar('parts', entorno.tokens.admin, { ...RANGO, pagina: 'abc', limite: '0' });

    expect(conParametros.status).toBe(200);
    expect(conParametros.texto).toBe(normal.texto);
    expect(invalidos.status).toBe(200);
    expect(invalidos.texto).toBe(normal.texto);
  });

  test.each(['users', 'INCOME', 'ingresos', 'constructor', '__proto__', 'toString', 'income;'])('«%s» no es un reporte → 404 REPORT_NOT_FOUND', async (nombre) => {
    const r = await descargar(encodeURIComponent(nombre), entorno.tokens.admin);

    expect(r.status).toBe(404);
    expect(r.json.error.codigo).toBe('REPORT_NOT_FOUND');
    expect(r.headers['content-disposition']).toBeUndefined();
  });

  test.each(REPORTES)('%s: sin rango o con rango inválido → 400 RANGO_INVALIDO', async (reporte) => {
    const sin = await descargar(reporte, entorno.tokens.admin, {});
    const largo = await descargar(reporte, entorno.tokens.admin, { desde: '2025-11-23', hasta: '2026-11-24' });
    const inyeccion = await descargar(reporte, entorno.tokens.admin, { desde: "2026-11-01'; DROP TABLE parts; --", hasta: '2026-11-30' });

    for (const r of [sin, largo, inyeccion]) {
      expect(r.status).toBe(400);
      expect(r.json.error.codigo).toBe('RANGO_INVALIDO');
    }
  });

  test('un rango sin datos exporta solo los encabezados (sin fila de totales)', async () => {
    for (const reporte of REPORTES) {
      const r = await descargar(reporte, entorno.tokens.admin);

      const filas = parsearCsv(r.texto);
      expect(r.status).toBe(200);
      // `rotation` lista las refacciones activas aunque no tengan salidas: aquí no hay ninguna.
      expect(filas).toHaveLength(1);
    }
  });

  test('con 10,000 filas exporta; con 10,001 responde 400 RANGO_INVALIDO', async () => {
    const p = await parte({ nombre: 'Refacción masiva', compra: 10 });
    const ordenId = await orden();
    const lote = async (n) => {
      const filas = Array.from({ length: n }, () => [ordenId, p, 1, 20]);
      for (let i = 0; i < filas.length; i += 2000) {
        await getPool().query('INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES ?', [filas.slice(i, i + 2000)]);
      }
    };
    await lote(10000);

    const justo = await descargar('parts', entorno.tokens.admin);
    expect(justo.status).toBe(200);
    expect(parsearCsv(justo.texto)).toHaveLength(1 + 10000 + 1);

    await lote(1);
    const exceso = await descargar('parts', entorno.tokens.admin);
    expect(exceso.status).toBe(400);
    expect(exceso.json.error.codigo).toBe('RANGO_INVALIDO');
    expect(exceso.json.error.mensaje).toMatch(/10,000/);
  });
});

describe('seguridad', () => {
  test('exportar no escribe en la bitácora', async () => {
    await sembrarDatos();
    await getPool().query('DELETE FROM audit_log');

    for (const reporte of REPORTES) await descargar(reporte, entorno.tokens.admin);

    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM audit_log');
    expect(Number(total)).toBe(0);
  });

  test('con una versión de términos sin aceptar responde 403 TERMS_NOT_ACCEPTED', async () => {
    await getPool().query('INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (1, ?, ?)', [
      'Términos de prueba de los reportes.',
      'Aviso de privacidad de prueba.',
    ]);

    const r = await descargar('income', entorno.tokens.admin);

    expect(r.status).toBe(403);
    expect(r.json.error.codigo).toBe('TERMS_NOT_ACCEPTED');
  });
});
