// 008-configuracion-seguridad-reportes, T120 (bloque P3, US9; FR-023, FR-024,
// FR-026, CA-6, CA-7): `GET /api/reports/services` y `GET /api/reports/productivity`.
// La población es la de «órdenes cerradas del periodo» (data-model.md, sección 6):
// órdenes `TERMINADO` o `ENTREGADO` cuyo `status_changed_at` cae en el rango (las
// canceladas, las que siguen en trabajo y las de fuera del rango nunca cuentan).
// Servicios: por tipo («Sin tipo» para las líneas sin tipo), con cantidad e
// importe en centavos, por frecuencia. Productividad: por mecánico, con número de
// órdenes e importe de mano de obra («Sin asignar» sin mecánico), sin multiplicar
// filas cuando una orden tiene varias líneas de servicio y de mano de obra.
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

async function prepararEntorno() {
  const hash = await bcrypt.hash(CLAVE, 10);
  const ids = {};
  const tokens = {};
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico Uno', 'MECHANIC'],
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
    [cliente.insertId, 'REP-002-A', 'Nissan', 'Versa', 2020]
  );
  const tipos = {};
  for (const nombre of ['Cambio de aceite', 'Afinación', 'Frenos']) {
    const [tipo] = await getPool().query('INSERT INTO service_types (name, interval_days) VALUES (?, 180)', [nombre]);
    tipos[nombre] = tipo.insertId;
  }
  return { tokens, ids, tipos, clienteId: cliente.insertId, vehiculoId: vehiculo.insertId };
}

let entorno;

/** Orden con estado, mecánico y fecha del último cambio de estado. */
async function orden({ estado = 'ENTREGADO', mecanico = null, fecha = DENTRO } = {}) {
  const [resultado] = await getPool().query(
    'INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason, status_changed_at) VALUES (?, ?, ?, ?, 30000, ?, ?)',
    [entorno.clienteId, entorno.vehiculoId, mecanico, estado, 'Servicio', fecha]
  );
  return resultado.insertId;
}

const servicio = (ordenId, importe, tipo = null) =>
  getPool().query('INSERT INTO order_services (order_id, description, amount, service_type_id) VALUES (?, ?, ?, ?)', [
    ordenId,
    'Línea de servicio',
    importe,
    tipo ? entorno.tipos[tipo] : null,
  ]);

const manoDeObra = (ordenId, importe) =>
  getPool().query('INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)', [ordenId, 'Mano de obra', importe]);

const consultar = (reporte, token, consulta = RANGO) =>
  request(app).get(`/api/reports/${reporte}?${new URLSearchParams(consulta).toString()}`).set(con(token));

beforeEach(async () => {
  entorno = await prepararEntorno();
});

describe('servicios más frecuentes: población', () => {
  test('cuentan las órdenes TERMINADO y ENTREGADO; ningún otro estado', async () => {
    for (const estado of ['TERMINADO', 'ENTREGADO']) {
      await servicio(await orden({ estado }), 100, 'Frenos');
    }
    for (const estado of ['RECIBIDO', 'DIAGNOSTICO', 'EN_REPARACION', 'ESPERANDO_REFACCION', 'CANCELADA']) {
      await servicio(await orden({ estado }), 999, 'Frenos');
    }

    const respuesta = await consultar('services', entorno.tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([{ tipo: 'Frenos', cantidad: 2, importeCentavos: 20000, importe: 200 }]);
  });

  test('el rango es inclusivo en hora local y solo cuenta el último cambio de estado', async () => {
    await servicio(await orden({ fecha: '2026-10-31 23:59:59' }), 1, 'Frenos'); // fuera
    await servicio(await orden({ fecha: '2026-11-01 00:00:00' }), 2, 'Frenos'); // dentro
    await servicio(await orden({ fecha: '2026-11-30 23:59:59' }), 4, 'Frenos'); // dentro
    await servicio(await orden({ fecha: '2026-12-01 00:00:00' }), 8, 'Frenos'); // fuera

    const respuesta = await consultar('services', entorno.tokens.admin);

    expect(respuesta.body.datos).toEqual([{ tipo: 'Frenos', cantidad: 2, importeCentavos: 600, importe: 6 }]);
  });
});

describe('servicios más frecuentes: agrupación', () => {
  test('agrupa por tipo y «Sin tipo», con cantidad e importe, por frecuencia descendente', async () => {
    const a = await orden();
    const b = await orden();
    await servicio(a, 650, 'Cambio de aceite');
    await servicio(b, 700, 'Cambio de aceite');
    await servicio(a, 400, 'Afinación');
    await servicio(a, 120.5);
    await servicio(b, 80);
    await servicio(b, 40);

    const respuesta = await consultar('services', entorno.tokens.admin);

    expect(respuesta.body.rango).toEqual(RANGO);
    expect(respuesta.body.datos).toEqual([
      { tipo: 'Sin tipo', cantidad: 3, importeCentavos: 24050, importe: 240.5 },
      { tipo: 'Cambio de aceite', cantidad: 2, importeCentavos: 135000, importe: 1350 },
      { tipo: 'Afinación', cantidad: 1, importeCentavos: 40000, importe: 400 },
    ]);
  });

  test('con la misma cantidad, ordena por nombre; «Sin tipo» no se oculta ni va siempre al final', async () => {
    const a = await orden();
    await servicio(a, 10, 'Frenos');
    await servicio(a, 10, 'Afinación');
    await servicio(a, 10);

    const respuesta = await consultar('services', entorno.tokens.admin);

    expect(respuesta.body.datos.map((d) => d.tipo)).toEqual(['Afinación', 'Frenos', 'Sin tipo']);
  });

  test('un tipo desactivado sigue apareciendo con su nombre', async () => {
    await servicio(await orden(), 50, 'Frenos');
    await getPool().query('UPDATE service_types SET active = 0 WHERE id = ?', [entorno.tipos.Frenos]);

    const respuesta = await consultar('services', entorno.tokens.admin);

    expect(respuesta.body.datos.map((d) => d.tipo)).toEqual(['Frenos']);
  });

  test('los importes se suman en centavos exactos (0.10 + 0.20 = 30 centavos)', async () => {
    const a = await orden();
    await servicio(a, 0.1, 'Frenos');
    await servicio(a, 0.2, 'Frenos');
    await servicio(a, 99999999.99, 'Afinación');

    const respuesta = await consultar('services', entorno.tokens.admin);

    const frenos = respuesta.body.datos.find((d) => d.tipo === 'Frenos');
    const afinacion = respuesta.body.datos.find((d) => d.tipo === 'Afinación');
    expect(frenos.importeCentavos).toBe(30);
    expect(frenos.importe).toBe(0.3);
    expect(afinacion.importeCentavos).toBe(9999999999);
    expect(Number.isInteger(frenos.importeCentavos)).toBe(true);
  });

  test('las líneas de otras órdenes (fuera de población) no se mezclan', async () => {
    await servicio(await orden(), 100, 'Frenos');
    await servicio(await orden({ estado: 'CANCELADA' }), 5000, 'Frenos');
    await servicio(await orden({ fecha: '2026-09-10 10:00:00' }), 7000, 'Frenos');

    const respuesta = await consultar('services', entorno.tokens.admin);

    expect(respuesta.body.datos).toEqual([{ tipo: 'Frenos', cantidad: 1, importeCentavos: 10000, importe: 100 }]);
  });

  test('rango sin órdenes cerradas → lista vacía (no es un error)', async () => {
    const respuesta = await consultar('services', entorno.tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ rango: RANGO, datos: [] });
  });
});

describe('productividad por mecánico', () => {
  test('número de órdenes e importe de mano de obra por mecánico, con id y nombre', async () => {
    const uno = [await orden({ mecanico: entorno.ids.mecanico }), await orden({ mecanico: entorno.ids.mecanico, estado: 'TERMINADO' })];
    const dos = await orden({ mecanico: entorno.ids.mecanico2 });
    await manoDeObra(uno[0], 800);
    await manoDeObra(uno[1], 450.25);
    await manoDeObra(dos, 300);

    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rango).toEqual(RANGO);
    expect(respuesta.body.datos).toEqual([
      { mecanico: { id: entorno.ids.mecanico, nombre: 'Mecánico Uno' }, ordenes: 2, manoObraCentavos: 125025, manoObra: 1250.25 },
      { mecanico: { id: entorno.ids.mecanico2, nombre: 'Mecánico Dos' }, ordenes: 1, manoObraCentavos: 30000, manoObra: 300 },
    ]);
  });

  test('una orden con varias líneas de servicio y de mano de obra cuenta UNA vez y no multiplica la mano de obra', async () => {
    const a = await orden({ mecanico: entorno.ids.mecanico });
    for (const importe of [100, 200, 300]) await servicio(a, importe, 'Frenos');
    await manoDeObra(a, 50);
    await manoDeObra(a, 25);

    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0].ordenes).toBe(1);
    expect(respuesta.body.datos[0].manoObraCentavos).toBe(7500);
  });

  test('las órdenes sin mano de obra cuentan con 0', async () => {
    await orden({ mecanico: entorno.ids.mecanico });

    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(respuesta.body.datos).toEqual([
      { mecanico: { id: entorno.ids.mecanico, nombre: 'Mecánico Uno' }, ordenes: 1, manoObraCentavos: 0, manoObra: 0 },
    ]);
  });

  test('«Sin asignar» (mecánico nulo) sale con mecanico null y siempre al final', async () => {
    const sinMecanico = [await orden(), await orden(), await orden()];
    await manoDeObra(sinMecanico[0], 10);
    await manoDeObra(await orden({ mecanico: entorno.ids.mecanico }), 20);

    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(respuesta.body.datos).toEqual([
      { mecanico: { id: entorno.ids.mecanico, nombre: 'Mecánico Uno' }, ordenes: 1, manoObraCentavos: 2000, manoObra: 20 },
      { mecanico: null, ordenes: 3, manoObraCentavos: 1000, manoObra: 10 },
    ]);
  });

  test('ordena por número de órdenes descendente y, a igualdad, por nombre', async () => {
    await orden({ mecanico: entorno.ids.mecanico2 });
    await orden({ mecanico: entorno.ids.mecanico });
    await orden({ mecanico: entorno.ids.mecanico2 });
    await orden({ mecanico: entorno.ids.mecanico });
    await orden({ mecanico: entorno.ids.mecanico2 });

    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(respuesta.body.datos.map((d) => [d.mecanico.nombre, d.ordenes])).toEqual([
      ['Mecánico Dos', 3],
      ['Mecánico Uno', 2],
    ]);
  });

  test('no cuentan las canceladas, las que siguen en trabajo ni las de fuera del rango', async () => {
    await orden({ mecanico: entorno.ids.mecanico });
    for (const estado of ['CANCELADA', 'EN_REPARACION', 'RECIBIDO']) {
      await manoDeObra(await orden({ mecanico: entorno.ids.mecanico, estado }), 999);
    }
    await manoDeObra(await orden({ mecanico: entorno.ids.mecanico, fecha: '2026-12-01 00:00:00' }), 999);

    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(respuesta.body.datos).toEqual([
      { mecanico: { id: entorno.ids.mecanico, nombre: 'Mecánico Uno' }, ordenes: 1, manoObraCentavos: 0, manoObra: 0 },
    ]);
  });

  test('un mecánico desactivado conserva su nombre en el reporte', async () => {
    await orden({ mecanico: entorno.ids.mecanico2 });
    await getPool().query('UPDATE users SET active = 0 WHERE id = ?', [entorno.ids.mecanico2]);

    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(respuesta.body.datos[0].mecanico.nombre).toBe('Mecánico Dos');
  });

  test('del mecánico solo se expone id y nombre (nunca correo, usuario ni hash)', async () => {
    await orden({ mecanico: entorno.ids.mecanico });

    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(Object.keys(respuesta.body.datos[0].mecanico).sort()).toEqual(['id', 'nombre']);
    expect(JSON.stringify(respuesta.body)).not.toMatch(/email|username|password|hash|token|motorix\.local/i);
  });

  test('rango sin órdenes cerradas → lista vacía', async () => {
    const respuesta = await consultar('productivity', entorno.tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ rango: RANGO, datos: [] });
  });
});

describe('rango inválido y compuerta (ambos reportes)', () => {
  test.each(['services', 'productivity'])('%s: sin rango → 400 RANGO_INVALIDO', async (reporte) => {
    const respuesta = await consultar(reporte, entorno.tokens.admin, {});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('RANGO_INVALIDO');
  });

  test.each(['services', 'productivity'])('%s: más de 366 días → 400 RANGO_INVALIDO', async (reporte) => {
    const respuesta = await consultar(reporte, entorno.tokens.admin, { desde: '2025-11-23', hasta: '2026-11-24' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('RANGO_INVALIDO');
  });

  test.each(['services', 'productivity'])('%s: acepta el atajo de mes', async (reporte) => {
    const respuesta = await consultar(reporte, entorno.tokens.admin, { periodo: 'MES_ANTERIOR' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([]);
  });

  test.each(['services', 'productivity'])('%s: una carga de inyección se rechaza y las tablas quedan intactas', async (reporte) => {
    await orden({ mecanico: entorno.ids.mecanico });

    const respuesta = await consultar(reporte, entorno.tokens.admin, { desde: "2026-11-01'; DROP TABLE service_orders; --", hasta: '2026-11-30' });

    expect(respuesta.status).toBe(400);
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM service_orders');
    expect(Number(total)).toBe(1);
  });

  test.each(['services', 'productivity'])('%s: con una versión de términos sin aceptar responde 403 TERMS_NOT_ACCEPTED', async (reporte) => {
    await getPool().query('INSERT INTO terms_versions (version, terms_text, privacy_text) VALUES (1, ?, ?)', [
      'Términos de prueba de los reportes.',
      'Aviso de privacidad de prueba.',
    ]);

    const respuesta = await consultar(reporte, entorno.tokens.admin);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('TERMS_NOT_ACCEPTED');
  });
});
