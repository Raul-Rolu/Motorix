// 008-configuracion-seguridad-reportes, T024 (bloque P1, US2; FR-004, FR-005,
// CA-2, CA-3): los márgenes de «Próximo» (días y km) y los días de orden
// detenida son ajustes del administrador. El centro de notificaciones y la lista
// de clientes por avisar los respetan; sin valores guardados los resultados son
// los del Sprint 6 (30 días, 1,000 km y 3 días); la lista de Mantenimientos y el
// panel de control no cambian. Corre contra `motorix_test`.
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
});

afterEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

/** Fecha local `YYYY-MM-DD` a N días de hoy (negativo = pasado), igual que `hoyLocal()`. */
function fechaLocal(diasDesdeHoy) {
  const fecha = new Date();
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() + diasDesdeHoy);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  return { tokens };
}

async function crearVehiculo(placas) {
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', [
    `Cliente ${placas}`,
    '5550001111',
  ]);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, placas, 'Chevrolet', 'Aveo', 2017]
  );
  return { clienteId: cliente.insertId, vehiculoId: vehiculo.insertId };
}

async function registrarKilometraje(clienteId, vehiculoId, kilometraje) {
  await getPool().query(
    'INSERT INTO service_orders (client_id, vehicle_id, mileage_entry, reason) VALUES (?, ?, ?, ?)',
    [clienteId, vehiculoId, kilometraje, 'Ingreso para el kilometraje']
  );
}

async function crearMantenimiento({ vehiculoId, descripcion, fechaObjetivo = null, kilometrajeObjetivo = null }) {
  const [resultado] = await getPool().query(
    "INSERT INTO maintenance_plans (vehicle_id, description, target_date, target_mileage, status) VALUES (?, ?, ?, ?, 'PENDING')",
    [vehiculoId, descripcion, fechaObjetivo, kilometrajeObjetivo]
  );
  return resultado.insertId;
}

/** Orden activa (RECIBIDO) cuyo último cambio de estado fue hace `dias` días. */
async function crearOrdenSinCambios({ clienteId, vehiculoId, dias }) {
  const [resultado] = await getPool().query(
    `INSERT INTO service_orders (client_id, vehicle_id, mileage_entry, reason, status, status_changed_at)
     VALUES (?, ?, 1000, 'Orden de prueba', 'RECIBIDO', DATE_SUB(NOW(), INTERVAL ? DAY))`,
    [clienteId, vehiculoId, dias]
  );
  return resultado.insertId;
}

const avisos = (token) =>
  request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
const porAvisar = (token) =>
  request(app).get('/api/client-notices/pending').set('Authorization', `Bearer ${token}`);
const configurar = (token, operacion) =>
  request(app).put('/api/settings').set('Authorization', `Bearer ${token}`).send({ operacion });

const claves = (respuesta) => respuesta.body.datos.map((aviso) => aviso.clave);

/**
 * Datos comunes: un mantenimiento a 25 días (próximo con 30, no con 15), otro a
 * 10 días (próximo con ambos), uno por km a 700 km (próximo con 1,000, no con
 * 500) y órdenes sin cambios hace 4 y 6 días.
 */
async function sembrarCasos() {
  const a = await crearVehiculo('AAA-111-A');
  const b = await crearVehiculo('BBB-222-B');
  const c = await crearVehiculo('CCC-333-C');
  await registrarKilometraje(c.clienteId, c.vehiculoId, 50000);

  const veinticincoDias = await crearMantenimiento({
    vehiculoId: a.vehiculoId,
    descripcion: 'Mantenimiento a 25 días',
    fechaObjetivo: fechaLocal(25),
  });
  const diezDias = await crearMantenimiento({
    vehiculoId: b.vehiculoId,
    descripcion: 'Mantenimiento a 10 días',
    fechaObjetivo: fechaLocal(10),
  });
  const setecientosKm = await crearMantenimiento({
    vehiculoId: c.vehiculoId,
    descripcion: 'Mantenimiento a 700 km',
    kilometrajeObjetivo: 50700,
  });
  const ordenCuatroDias = await crearOrdenSinCambios({ ...a, dias: 4 });
  const ordenSeisDias = await crearOrdenSinCambios({ ...b, dias: 6 });
  return { veinticincoDias, diezDias, setecientosKm, ordenCuatroDias, ordenSeisDias };
}

describe('sin valores guardados: los resultados del Sprint 6 (CA-3)', () => {
  test('próximo a 30 días o 1,000 km y orden detenida a más de 3 días', async () => {
    const { tokens } = await prepararEntorno();
    const caso = await sembrarCasos();

    const centro = await avisos(tokens.admin);

    expect(claves(centro)).toEqual(
      expect.arrayContaining([
        `MANTENIMIENTO:${caso.veinticincoDias}:PROXIMO`,
        `MANTENIMIENTO:${caso.diezDias}:PROXIMO`,
        `MANTENIMIENTO:${caso.setecientosKm}:PROXIMO`,
        `ORDEN:${caso.ordenCuatroDias}:DETENIDA`,
        `ORDEN:${caso.ordenSeisDias}:DETENIDA`,
      ])
    );
  });
});

describe('con márgenes guardados el centro de notificaciones los respeta (CA-2)', () => {
  test('15 días, 500 km y 5 días de orden detenida', async () => {
    const { tokens } = await prepararEntorno();
    const caso = await sembrarCasos();

    const guardado = await configurar(tokens.admin, {
      margenProximoDias: 15,
      margenProximoKm: 500,
      diasOrdenDetenida: 5,
    });
    expect(guardado.status).toBe(200);
    const centro = await avisos(tokens.admin);

    const lista = claves(centro);
    expect(lista).toContain(`MANTENIMIENTO:${caso.diezDias}:PROXIMO`);
    expect(lista).not.toContain(`MANTENIMIENTO:${caso.veinticincoDias}:PROXIMO`);
    expect(lista).not.toContain(`MANTENIMIENTO:${caso.setecientosKm}:PROXIMO`);
    expect(lista).toContain(`ORDEN:${caso.ordenSeisDias}:DETENIDA`);
    expect(lista).not.toContain(`ORDEN:${caso.ordenCuatroDias}:DETENIDA`);
  });

  test('un margen mayor amplía lo que es próximo', async () => {
    const { tokens } = await prepararEntorno();
    const a = await crearVehiculo('DDD-444-D');
    const lejano = await crearMantenimiento({
      vehiculoId: a.vehiculoId,
      descripcion: 'Mantenimiento a 50 días',
      fechaObjetivo: fechaLocal(50),
    });
    expect(claves(await avisos(tokens.admin))).not.toContain(`MANTENIMIENTO:${lejano}:PROXIMO`);

    await configurar(tokens.admin, { margenProximoDias: 60 });

    expect(claves(await avisos(tokens.admin))).toContain(`MANTENIMIENTO:${lejano}:PROXIMO`);
  });

  test('el detalle del aviso próximo solo menciona los umbrales dentro del margen configurado', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('EEE-555-E');
    await registrarKilometraje(clienteId, vehiculoId, 50000);
    const id = await crearMantenimiento({
      vehiculoId,
      descripcion: 'Cambio de bujías',
      fechaObjetivo: fechaLocal(10),
      kilometrajeObjetivo: 50700,
    });

    await configurar(tokens.admin, { margenProximoDias: 15, margenProximoKm: 500 });
    const centro = await avisos(tokens.admin);

    const aviso = centro.body.datos.find((a) => a.clave === `MANTENIMIENTO:${id}:PROXIMO`);
    expect(aviso.detalle).toContain('faltan 10 día(s)');
    expect(aviso.detalle).not.toMatch(/[0-9]+ km/);
  });

  test('la recepción y el mecánico ven los mismos resultados configurados', async () => {
    const { tokens } = await prepararEntorno();
    const caso = await sembrarCasos();
    await getPool().query('UPDATE service_orders SET mechanic_id = (SELECT id FROM users WHERE username = ?)', ['mecanico']);

    await configurar(tokens.admin, { margenProximoDias: 15, diasOrdenDetenida: 5 });

    const recepcion = claves(await avisos(tokens.recepcion));
    expect(recepcion).toContain(`MANTENIMIENTO:${caso.diezDias}:PROXIMO`);
    expect(recepcion).not.toContain(`MANTENIMIENTO:${caso.veinticincoDias}:PROXIMO`);
    const mecanico = claves(await avisos(tokens.mecanico));
    expect(mecanico).toContain(`ORDEN:${caso.ordenSeisDias}:DETENIDA`);
    expect(mecanico).not.toContain(`ORDEN:${caso.ordenCuatroDias}:DETENIDA`);
  });
});

describe('la lista de clientes por avisar usa los mismos márgenes (CA-2)', () => {
  test('el mantenimiento a 25 días está en la lista con 30 días y sale con 15', async () => {
    const { tokens } = await prepararEntorno();
    const caso = await sembrarCasos();

    const antes = await porAvisar(tokens.recepcion);
    const idsAntes = antes.body.datos.filter((h) => h.tipo === 'MANTENIMIENTO').map((h) => h.hechoId);
    expect(idsAntes).toContain(caso.veinticincoDias);

    await configurar(tokens.admin, { margenProximoDias: 15, margenProximoKm: 500 });
    const despues = await porAvisar(tokens.recepcion);
    const idsDespues = despues.body.datos.filter((h) => h.tipo === 'MANTENIMIENTO').map((h) => h.hechoId);

    expect(idsDespues).toContain(caso.diezDias);
    expect(idsDespues).not.toContain(caso.veinticincoDias);
    expect(idsDespues).not.toContain(caso.setecientosKm);
  });
});

describe('la lista de Mantenimientos y el panel de control no cambian (CA-2)', () => {
  test('cambiar los márgenes no modifica GET /api/maintenances ni GET /api/dashboard', async () => {
    const { tokens } = await prepararEntorno();
    await sembrarCasos();
    const lista = () => request(app).get('/api/maintenances').set('Authorization', `Bearer ${tokens.admin}`);
    const panel = () => request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokens.admin}`);
    const listaAntes = await lista();
    const panelAntes = await panel();
    expect(listaAntes.status).toBe(200);
    expect(panelAntes.status).toBe(200);

    await configurar(tokens.admin, { margenProximoDias: 5, margenProximoKm: 100, diasOrdenDetenida: 1 });

    expect((await lista()).body).toEqual(listaAntes.body);
    expect((await panel()).body.mantenimientos).toEqual(panelAntes.body.mantenimientos);
  });
});

describe('límites de los ajustes (CA-2)', () => {
  test.each([
    [{ margenProximoDias: 0 }],
    [{ margenProximoDias: 366 }],
    [{ margenProximoKm: 99 }],
    [{ margenProximoKm: 50001 }],
    [{ diasOrdenDetenida: 0 }],
    [{ diasOrdenDetenida: 91 }],
  ])('PUT %j se rechaza con 400 y no cambia el centro', async (operacion) => {
    const { tokens } = await prepararEntorno();
    const caso = await sembrarCasos();

    const respuesta = await configurar(tokens.admin, operacion);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(claves(await avisos(tokens.admin))).toContain(`MANTENIMIENTO:${caso.veinticincoDias}:PROXIMO`);
  });
});
