// 007-notificaciones-internas, T012 (US1; FR-001 a FR-003 y FR-005, CA-1, CA-2,
// CA-3, CA-5): cálculo de los avisos al consultar `GET /api/notifications`.
// Este bloque inicial cubre la forma de la respuesta y el aviso de mantenimiento
// vencido; las historias siguientes agregan bloques para los demás tipos.
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

/** Crea un cliente y un vehículo (por SQL) y devuelve sus ids. */
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

/** Kilometraje actual del vehículo = el de su última orden (RN-4). */
async function registrarKilometraje(clienteId, vehiculoId, kilometraje) {
  await getPool().query(
    'INSERT INTO service_orders (client_id, vehicle_id, mileage_entry, reason) VALUES (?, ?, ?, ?)',
    [clienteId, vehiculoId, kilometraje, 'Ingreso para el kilometraje']
  );
}

async function crearMantenimiento({
  vehiculoId,
  descripcion,
  fechaObjetivo = null,
  kilometrajeObjetivo = null,
  estado = 'PENDING',
}) {
  const [resultado] = await getPool().query(
    'INSERT INTO maintenance_plans (vehicle_id, description, target_date, target_mileage, status) VALUES (?, ?, ?, ?, ?)',
    [vehiculoId, descripcion, fechaObjetivo, kilometrajeObjetivo, estado]
  );
  return resultado.insertId;
}

const avisos = (token) =>
  request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);

describe('GET /api/notifications: forma de la respuesta (CA-1)', () => {
  test('sin avisos devuelve { total: 0, noLeidos: 0, datos: [] }', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('un mantenimiento vencido por fecha genera MANTENIMIENTO:<id>:VENCIDO con el texto del contrato', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('GHI-789-C');
    const id = await crearMantenimiento({
      vehiculoId,
      descripcion: 'Cambio de aceite y filtros',
      fechaObjetivo: fechaLocal(-160),
    });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(1);
    expect(respuesta.body.noLeidos).toBe(1);
    expect(respuesta.body.datos).toEqual([
      {
        clave: `MANTENIMIENTO:${id}:VENCIDO`,
        grupo: 'MANTENIMIENTO_VENCIDO',
        estado: 'VENCIDO',
        titulo: 'Mantenimiento vencido',
        detalle: 'Cambio de aceite y filtros · GHI-789-C · vencido hace 160 día(s)',
        leido: false,
        destino: { pantalla: 'VEHICULO', id: vehiculoId },
      },
    ]);
  });

  test('un mantenimiento vencido por kilometraje indica los kilómetros superados', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('DEF-456-B');
    await registrarKilometraje(clienteId, vehiculoId, 60200);
    const id = await crearMantenimiento({
      vehiculoId,
      descripcion: 'Cambio de balatas delanteras',
      kilometrajeObjetivo: 58000,
    });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0]).toMatchObject({
      clave: `MANTENIMIENTO:${id}:VENCIDO`,
      estado: 'VENCIDO',
      detalle: 'Cambio de balatas delanteras · DEF-456-B · kilometraje superado en 2200 km',
      destino: { pantalla: 'VEHICULO', id: vehiculoId },
    });
  });

  test('un mantenimiento cuyo umbral de fecha es hoy se anuncia como «vence hoy»', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('JKL-012-D');
    await crearMantenimiento({
      vehiculoId,
      descripcion: 'Revisión general',
      fechaObjetivo: fechaLocal(0),
    });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos[0].detalle).toBe('Revisión general · JKL-012-D · vence hoy');
  });

  test('cada aviso expone solo los campos del contrato', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('ABC-123-A');
    await crearMantenimiento({
      vehiculoId,
      descripcion: 'Revisión de suspensión',
      fechaObjetivo: fechaLocal(-5),
    });

    const respuesta = await avisos(tokens.admin);

    expect(Object.keys(respuesta.body).sort()).toEqual(['datos', 'noLeidos', 'total']);
    expect(Object.keys(respuesta.body.datos[0]).sort()).toEqual(
      ['clave', 'destino', 'detalle', 'estado', 'grupo', 'leido', 'titulo'].sort()
    );
  });
});

describe('orden y conteo (CA-1)', () => {
  test('dentro del grupo el más vencido va primero y total = noLeidos', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('ORD-001-A');
    const reciente = await crearMantenimiento({
      vehiculoId,
      descripcion: 'Vencido hace poco',
      fechaObjetivo: fechaLocal(-2),
    });
    const antiguo = await crearMantenimiento({
      vehiculoId,
      descripcion: 'Vencido hace mucho',
      fechaObjetivo: fechaLocal(-90),
    });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos.map((aviso) => aviso.clave)).toEqual([
      `MANTENIMIENTO:${antiguo}:VENCIDO`,
      `MANTENIMIENTO:${reciente}:VENCIDO`,
    ]);
    expect(respuesta.body.total).toBe(2);
    expect(respuesta.body.noLeidos).toBe(2);
  });
});

describe('coincidencia con el panel de control y con la lista de Mantenimientos (CA-5)', () => {
  test('los avisos de vencido coinciden con mantenimientos.vencidos del panel y con isOverdue de la lista', async () => {
    const { tokens } = await prepararEntorno();
    const a = await crearVehiculo('CAA-001-A');
    const b = await crearVehiculo('CBB-002-B');
    await registrarKilometraje(b.clienteId, b.vehiculoId, 60200);

    // Dos vencidos (uno por fecha y otro por kilometraje).
    await crearMantenimiento({ vehiculoId: a.vehiculoId, descripcion: 'Vencido por fecha', fechaObjetivo: fechaLocal(-30) });
    await crearMantenimiento({ vehiculoId: b.vehiculoId, descripcion: 'Vencido por km', kilometrajeObjetivo: 58000 });
    // No generan aviso de vencido: futuro, cancelado y completado.
    await crearMantenimiento({ vehiculoId: a.vehiculoId, descripcion: 'Futuro', fechaObjetivo: fechaLocal(200) });
    await crearMantenimiento({ vehiculoId: a.vehiculoId, descripcion: 'Cancelado', fechaObjetivo: fechaLocal(-30), estado: 'CANCELLED' });
    await crearMantenimiento({ vehiculoId: a.vehiculoId, descripcion: 'Completado', fechaObjetivo: fechaLocal(-30), estado: 'COMPLETED' });

    const centro = await avisos(tokens.admin);
    const panel = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokens.admin}`);
    const lista = await request(app).get('/api/maintenances').set('Authorization', `Bearer ${tokens.admin}`);

    const vencidosDelCentro = centro.body.datos.filter((aviso) => aviso.grupo === 'MANTENIMIENTO_VENCIDO');
    const vencidosDeLaLista = lista.body.datos.filter((mantenimiento) => mantenimiento.isOverdue);
    expect(vencidosDelCentro).toHaveLength(2);
    expect(vencidosDelCentro).toHaveLength(panel.body.mantenimientos.vencidos);
    expect(vencidosDelCentro).toHaveLength(vencidosDeLaLista.length);
    expect(vencidosDelCentro.map((aviso) => aviso.clave).sort()).toEqual(
      vencidosDeLaLista.map((m) => `MANTENIMIENTO:${m.id}:VENCIDO`).sort()
    );
  });
});

describe('los avisos se derivan al consultar y no se copian a otra tabla (CA-2)', () => {
  test('consultar no escribe nada: solo existe notification_reads y queda vacía', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('DER-001-A');
    await crearMantenimiento({ vehiculoId, descripcion: 'Vencido', fechaObjetivo: fechaLocal(-10) });

    await avisos(tokens.admin);
    await avisos(tokens.admin);

    const [tablas] = await getPool().query(
      `SELECT TABLE_NAME AS nombre FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND (TABLE_NAME LIKE '%notif%' OR TABLE_NAME LIKE '%aviso%' OR TABLE_NAME LIKE '%alert%')
         AND TABLE_NAME <> 'client_notices'`
    );
    expect(tablas.map((tabla) => tabla.nombre)).toEqual(['notification_reads']);
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM notification_reads');
    expect(Number(total)).toBe(0);
  });

  test('el aviso refleja de inmediato los datos reales: al completar el mantenimiento desaparece', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('DER-002-B');
    const id = await crearMantenimiento({ vehiculoId, descripcion: 'Vencido', fechaObjetivo: fechaLocal(-10) });

    expect((await avisos(tokens.admin)).body.total).toBe(1);

    await getPool().query("UPDATE maintenance_plans SET status = 'COMPLETED' WHERE id = ?", [id]);

    expect((await avisos(tokens.admin)).body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });
});
