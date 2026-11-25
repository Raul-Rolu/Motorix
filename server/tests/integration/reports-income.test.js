// 008-configuracion-seguridad-reportes, T113 (bloque P3, US8; FR-023, FR-024, CA-6,
// CA-7): `GET /api/reports/income`. Solo suma pagos COMPLETED (nunca PENDING,
// EXPIRED ni STALE), con el rango inclusivo en hora local, atajos de mes,
// agrupación por día (hasta 62 días) o por mes, desglose por método y TODO en
// centavos enteros. Coincide con el criterio del panel de control. Un rango sin
// pagos da totales en 0 y listas vacías; un rango inválido, `400 RANGO_INVALIDO`.
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

async function prepararEntorno() {
  const hash = await bcrypt.hash(CLAVE, 4);
  const tokens = {};
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
    const login = await request(app).post('/api/auth/login').send({ identificacion: username, contrasena: CLAVE });
    tokens[username] = login.body.token;
  }
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', ['Cliente Reportes', '5550001111']);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, 'REP-001-A', 'Nissan', 'Versa', 2020]
  );
  const [orden] = await getPool().query(
    "INSERT INTO service_orders (client_id, vehicle_id, status, mileage_entry, reason) VALUES (?, ?, 'ENTREGADO', 30000, 'Servicio')",
    [cliente.insertId, vehiculo.insertId]
  );
  return { tokens, ids, ordenId: orden.insertId };
}

/** Inserta un pago con fecha explícita (hora local de la base). */
async function pago(ordenId, monto, metodo, fecha, estado = 'COMPLETED') {
  await getPool().query(
    'INSERT INTO payments (order_id, method, amount, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [ordenId, metodo, monto, estado, fecha]
  );
}

const ingresos = (token, consulta) =>
  request(app).get(`/api/reports/income?${new URLSearchParams(consulta).toString()}`).set(con(token));

const dosDig = (n) => String(n).padStart(2, '0');
const fechaLocal = (f) => `${f.getFullYear()}-${dosDig(f.getMonth() + 1)}-${dosDig(f.getDate())}`;

describe('solo pagos COMPLETED', () => {
  test('PENDING, EXPIRED y STALE no cuentan', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 100, 'CASH', '2026-11-10 10:00:00', 'COMPLETED');
    await pago(ordenId, 50, 'MERCADO_PAGO', '2026-11-10 11:00:00', 'PENDING');
    await pago(ordenId, 70, 'MERCADO_PAGO', '2026-11-10 12:00:00', 'EXPIRED');
    await pago(ordenId, 30, 'MERCADO_PAGO', '2026-11-10 13:00:00', 'STALE');

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-01', hasta: '2026-11-30' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.totalCentavos).toBe(10000);
    expect(respuesta.body.porMetodo).toEqual([{ metodo: 'CASH', totalCentavos: 10000, total: 100 }]);
  });
});

describe('rango inclusivo en hora local', () => {
  test('incluye el primer instante del primer día y el último del último; excluye lo de fuera', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 1, 'CASH', '2026-10-31 23:59:59'); // fuera
    await pago(ordenId, 2, 'CASH', '2026-11-01 00:00:00'); // dentro (primer instante)
    await pago(ordenId, 4, 'CASH', '2026-11-30 23:59:59'); // dentro (último instante)
    await pago(ordenId, 8, 'CASH', '2026-12-01 00:00:00'); // fuera

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-01', hasta: '2026-11-30' });

    expect(respuesta.body.totalCentavos).toBe(600);
  });

  test('un solo día (desde = hasta) incluye todo ese día', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 10, 'CASH', '2026-11-15 00:00:00');
    await pago(ordenId, 20, 'CASH', '2026-11-15 23:59:59');
    await pago(ordenId, 40, 'CASH', '2026-11-16 00:00:00');

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-15', hasta: '2026-11-15' });

    expect(respuesta.body.totalCentavos).toBe(3000);
    expect(respuesta.body.rango).toEqual({ desde: '2026-11-15', hasta: '2026-11-15' });
  });
});

describe('atajos de mes', () => {
  test('MES_ACTUAL y MES_ANTERIOR devuelven el mes completo con su rango', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    const hoy = new Date();
    const primeroActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ultimoActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    const primeroAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const ultimoAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    await pago(ordenId, 5, 'CASH', `${fechaLocal(primeroActual)} 00:00:00`);
    await pago(ordenId, 7, 'CARD', `${fechaLocal(ultimoActual)} 23:59:59`);
    await pago(ordenId, 11, 'CASH', `${fechaLocal(primeroAnterior)} 08:00:00`);
    await pago(ordenId, 13, 'TRANSFER', `${fechaLocal(ultimoAnterior)} 20:00:00`);

    const actual = await ingresos(tokens.admin, { periodo: 'MES_ACTUAL' });
    const anterior = await ingresos(tokens.admin, { periodo: 'MES_ANTERIOR' });

    expect(actual.body.rango).toEqual({ desde: fechaLocal(primeroActual), hasta: fechaLocal(ultimoActual) });
    expect(actual.body.totalCentavos).toBe(1200);
    expect(anterior.body.rango).toEqual({ desde: fechaLocal(primeroAnterior), hasta: fechaLocal(ultimoAnterior) });
    expect(anterior.body.totalCentavos).toBe(2400);
  });
});

describe('agrupación', () => {
  test('hasta 62 días agrupa por día (AAAA-MM-DD, ascendente, solo días con pagos)', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 100, 'CASH', '2026-11-05 09:00:00');
    await pago(ordenId, 50.5, 'CARD', '2026-11-05 17:30:00');
    await pago(ordenId, 20, 'CASH', '2026-11-02 08:00:00');

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-01', hasta: '2026-11-30' });

    expect(respuesta.body.agrupacion).toBe('DIA');
    expect(respuesta.body.porPeriodo).toEqual([
      { periodo: '2026-11-02', totalCentavos: 2000, total: 20 },
      { periodo: '2026-11-05', totalCentavos: 15050, total: 150.5 },
    ]);
  });

  test('62 días agrupa por día y 63 por mes (AAAA-MM)', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 100, 'CASH', '2026-09-10 10:00:00');
    await pago(ordenId, 200, 'CASH', '2026-10-10 10:00:00');
    await pago(ordenId, 300, 'CARD', '2026-10-20 10:00:00');
    await pago(ordenId, 400, 'CASH', '2026-11-05 10:00:00');

    const dia62 = await ingresos(tokens.admin, { desde: '2026-10-01', hasta: '2026-12-01' });
    const dia63 = await ingresos(tokens.admin, { desde: '2026-10-01', hasta: '2026-12-02' });
    const trimestre = await ingresos(tokens.admin, { desde: '2026-09-01', hasta: '2026-11-30' });

    expect(dia62.body.agrupacion).toBe('DIA');
    expect(dia63.body.agrupacion).toBe('MES');
    expect(trimestre.body.agrupacion).toBe('MES');
    expect(trimestre.body.porPeriodo).toEqual([
      { periodo: '2026-09', totalCentavos: 10000, total: 100 },
      { periodo: '2026-10', totalCentavos: 50000, total: 500 },
      { periodo: '2026-11', totalCentavos: 40000, total: 400 },
    ]);
    expect(trimestre.body.totalCentavos).toBe(100000);
  });
});

describe('desglose por método', () => {
  test('suma por método, del mayor al menor, y la suma de métodos es el total', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 100, 'CASH', '2026-11-03 10:00:00');
    await pago(ordenId, 200, 'CARD', '2026-11-04 10:00:00');
    await pago(ordenId, 50, 'CASH', '2026-11-05 10:00:00');
    await pago(ordenId, 80, 'MERCADO_PAGO', '2026-11-06 10:00:00');
    await pago(ordenId, 10, 'TRANSFER', '2026-11-07 10:00:00');

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-01', hasta: '2026-11-30' });

    expect(respuesta.body.porMetodo).toEqual([
      { metodo: 'CARD', totalCentavos: 20000, total: 200 },
      { metodo: 'CASH', totalCentavos: 15000, total: 150 },
      { metodo: 'MERCADO_PAGO', totalCentavos: 8000, total: 80 },
      { metodo: 'TRANSFER', totalCentavos: 1000, total: 10 },
    ]);
    const suma = respuesta.body.porMetodo.reduce((acumulado, fila) => acumulado + fila.totalCentavos, 0);
    expect(suma).toBe(respuesta.body.totalCentavos);
    expect(respuesta.body.totalCentavos).toBe(44000);
  });
});

describe('centavos enteros', () => {
  test('0.10 + 0.20 son exactamente 30 centavos y los totales coinciden con la suma de los pagos', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 0.1, 'CASH', '2026-11-03 10:00:00');
    await pago(ordenId, 0.2, 'CASH', '2026-11-03 11:00:00');
    await pago(ordenId, 1234.56, 'CARD', '2026-11-03 12:00:00');
    await pago(ordenId, 99999999.99, 'TRANSFER', '2026-11-04 12:00:00');

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-01', hasta: '2026-11-30' });

    expect(respuesta.body.totalCentavos).toBe(30 + 123456 + 9999999999);
    expect(Number.isInteger(respuesta.body.totalCentavos)).toBe(true);
    expect(respuesta.body.total).toBe(respuesta.body.totalCentavos / 100);
    const dia = respuesta.body.porPeriodo.find((p) => p.periodo === '2026-11-03');
    expect(dia.totalCentavos).toBe(123486);
    expect(Number.isInteger(dia.totalCentavos)).toBe(true);
  });

  test('coincide con la suma de los pagos COMPLETED de la base', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    for (let i = 1; i <= 25; i += 1) {
      await pago(ordenId, i * 3.37, i % 2 ? 'CASH' : 'CARD', `2026-11-${dosDig((i % 28) + 1)} 10:00:00`);
    }
    const [[{ centavos }]] = await getPool().query(
      "SELECT CAST(ROUND(SUM(amount) * 100) AS SIGNED) AS centavos FROM payments WHERE status = 'COMPLETED'"
    );

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-01', hasta: '2026-11-30' });

    expect(respuesta.body.totalCentavos).toBe(Number(centavos));
  });
});

describe('criterio del panel de control', () => {
  test('el total y el de hoy coinciden con los cobros del panel (solo COMPLETED)', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    const hoy = fechaLocal(new Date());
    await pago(ordenId, 120.5, 'CASH', `${hoy} 08:00:00`);
    await pago(ordenId, 80, 'CARD', `${hoy} 09:00:00`);
    await pago(ordenId, 40, 'MERCADO_PAGO', `${hoy} 10:00:00`, 'PENDING');
    await pago(ordenId, 300, 'CASH', '2026-01-15 10:00:00');

    const panel = await request(app).get('/api/dashboard').set(con(tokens.admin));
    const delDia = await ingresos(tokens.admin, { desde: hoy, hasta: hoy });
    const todo = await ingresos(tokens.admin, { desde: '2026-01-01', hasta: hoy });

    expect(panel.status).toBe(200);
    expect(delDia.body.total).toBe(panel.body.cobros.hoy);
    expect(todo.body.total).toBe(panel.body.cobros.total);
  });
});

describe('rango sin pagos', () => {
  test('totales en 0 y listas vacías (no es un error)', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-01', hasta: '2026-11-30' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      rango: { desde: '2026-11-01', hasta: '2026-11-30' },
      agrupacion: 'DIA',
      totalCentavos: 0,
      total: 0,
      porPeriodo: [],
      porMetodo: [],
    });
  });

  test('un rango futuro tampoco es un error', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await ingresos(tokens.admin, { desde: '2035-01-01', hasta: '2035-01-31' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.totalCentavos).toBe(0);
  });
});

describe('rango inválido', () => {
  test.each([
    ['sin rango', {}],
    ['solo desde', { desde: '2026-11-01' }],
    ['solo hasta', { hasta: '2026-11-30' }],
    ['formato de fecha', { desde: '01/11/2026', hasta: '2026-11-30' }],
    ['fecha inexistente', { desde: '2026-02-30', hasta: '2026-03-30' }],
    ['hasta anterior a desde', { desde: '2026-11-30', hasta: '2026-11-01' }],
    ['más de 366 días', { desde: '2025-11-23', hasta: '2026-11-24' }],
    ['periodo inexistente', { periodo: 'SEMANA' }],
    ['periodo junto con fechas', { periodo: 'MES_ACTUAL', desde: '2026-11-01', hasta: '2026-11-30' }],
    ['parámetro vacío', { desde: '', hasta: '2026-11-30' }],
  ])('%s → 400 RANGO_INVALIDO', async (_nombre, consulta) => {
    const { tokens } = await prepararEntorno();

    const respuesta = await ingresos(tokens.admin, consulta);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('RANGO_INVALIDO');
    expect(typeof respuesta.body.error.mensaje).toBe('string');
    expect(respuesta.body.error.mensaje.length).toBeGreaterThan(5);
  });

  test('una carga de inyección en el rango se rechaza y la tabla queda intacta', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 10, 'CASH', '2026-11-03 10:00:00');

    const respuesta = await ingresos(tokens.admin, { desde: "2026-11-01'; DROP TABLE payments; --", hasta: '2026-11-30' });

    expect(respuesta.status).toBe(400);
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM payments');
    expect(Number(total)).toBe(1);
  });

  test('un parámetro repetido (arreglo) se rechaza sin error interno', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await request(app)
      .get('/api/reports/income?desde=2026-11-01&desde=2026-11-02&hasta=2026-11-30')
      .set(con(tokens.admin));

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('RANGO_INVALIDO');
  });
});

describe('forma de la respuesta y no exposición', () => {
  test('solo trae rango, agrupación, totales y desgloses (sin ids, usuarios ni órdenes)', async () => {
    const { tokens, ordenId } = await prepararEntorno();
    await pago(ordenId, 10, 'CASH', '2026-11-03 10:00:00');

    const respuesta = await ingresos(tokens.admin, { desde: '2026-11-01', hasta: '2026-11-30' });

    expect(Object.keys(respuesta.body).sort()).toEqual(['agrupacion', 'porMetodo', 'porPeriodo', 'rango', 'total', 'totalCentavos']);
    expect(Object.keys(respuesta.body.porPeriodo[0]).sort()).toEqual(['periodo', 'total', 'totalCentavos']);
    expect(Object.keys(respuesta.body.porMetodo[0]).sort()).toEqual(['metodo', 'total', 'totalCentavos']);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/created_by|order_id|external_reference|password|hash|token/i);
  });
});

describe('compuerta de términos', () => {
  test('con una versión vigente sin aceptar responde 403 TERMS_NOT_ACCEPTED y, tras aceptar, 200', async () => {
    const { tokens } = await prepararEntorno();
    const [version] = await getPool().query('INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (1, ?, ?)', [
      'Términos de prueba de los reportes.',
      'Aviso de privacidad de prueba.',
    ]);

    const bloqueado = await ingresos(tokens.admin, { periodo: 'MES_ACTUAL' });
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');

    await request(app).post('/api/terms/accept').set(con(tokens.admin)).send({ termsVersionId: version.insertId });
    const libre = await ingresos(tokens.admin, { periodo: 'MES_ACTUAL' });
    expect(libre.status).toBe(200);
  });
});
