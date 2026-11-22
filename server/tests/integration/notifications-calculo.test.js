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

// --- US2 (T023): mantenimientos próximos y citas del día -------------------

async function crearCita({
  clienteId,
  vehiculoId,
  fecha,
  hora = '10:00:00',
  motivo = 'Revisión de frenos delanteros',
  estado = 'PROGRAMADA',
}) {
  const [resultado] = await getPool().query(
    'INSERT INTO appointments (client_id, vehicle_id, appointment_date, appointment_time, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
    [clienteId, vehiculoId, fecha, hora, motivo, estado]
  );
  return resultado.insertId;
}

const clavesDe = (respuesta, grupo) =>
  respuesta.body.datos.filter((aviso) => aviso.grupo === grupo).map((aviso) => aviso.clave);

describe('mantenimiento próximo (FR-012, CA-3)', () => {
  test('a 30 días del umbral de fecha es próximo, con el texto del contrato', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('PRX-001-A');
    const id = await crearMantenimiento({
      vehiculoId,
      descripcion: 'Cambio de filtros',
      fechaObjetivo: fechaLocal(30),
    });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos).toEqual([
      {
        clave: `MANTENIMIENTO:${id}:PROXIMO`,
        grupo: 'MANTENIMIENTO_PROXIMO',
        estado: 'PROXIMO',
        titulo: 'Mantenimiento próximo',
        detalle: 'Cambio de filtros · PRX-001-A · faltan 30 día(s)',
        leido: false,
        destino: { pantalla: 'VEHICULO', id: vehiculoId },
      },
    ]);
  });

  test('a 31 días del umbral de fecha todavía no es próximo', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('PRX-002-B');
    await crearMantenimiento({ vehiculoId, descripcion: 'Lejano', fechaObjetivo: fechaLocal(31) });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('a 1,000 km del umbral de kilometraje es próximo y a 1,001 km no', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('PRX-003-C');
    await registrarKilometraje(clienteId, vehiculoId, 50000);
    const cerca = await crearMantenimiento({ vehiculoId, descripcion: 'Cerca', kilometrajeObjetivo: 51000 });
    await crearMantenimiento({ vehiculoId, descripcion: 'Lejos', kilometrajeObjetivo: 51001 });

    const respuesta = await avisos(tokens.admin);

    expect(clavesDe(respuesta, 'MANTENIMIENTO_PROXIMO')).toEqual([`MANTENIMIENTO:${cerca}:PROXIMO`]);
    expect(respuesta.body.datos[0].detalle).toBe('Cerca · PRX-003-C · faltan 1000 km');
  });

  test('con ambos umbrales dentro del margen el detalle los menciona a los dos', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('PRX-004-D');
    await registrarKilometraje(clienteId, vehiculoId, 50000);
    await crearMantenimiento({
      vehiculoId,
      descripcion: 'Doble umbral',
      fechaObjetivo: fechaLocal(10),
      kilometrajeObjetivo: 50400,
    });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos[0].detalle).toBe('Doble umbral · PRX-004-D · faltan 10 día(s) o 400 km');
  });

  test('un mantenimiento vencido es aviso de vencido y no de próximo', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('PRX-005-E');
    await crearMantenimiento({ vehiculoId, descripcion: 'Vencido', fechaObjetivo: fechaLocal(-3) });

    const respuesta = await avisos(tokens.admin);

    expect(clavesDe(respuesta, 'MANTENIMIENTO_PROXIMO')).toEqual([]);
    expect(clavesDe(respuesta, 'MANTENIMIENTO_VENCIDO')).toHaveLength(1);
  });

  test.each(['CANCELLED', 'COMPLETED'])('un mantenimiento %s cercano no genera aviso', async (estado) => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('PRX-006-F');
    await crearMantenimiento({ vehiculoId, descripcion: 'Cercano', fechaObjetivo: fechaLocal(5), estado });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('los próximos del centro son un subconjunto de mantenimientos.proximos del panel', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('PRX-007-G');
    const cercano = await crearMantenimiento({ vehiculoId, descripcion: 'Cercano', fechaObjetivo: fechaLocal(12) });
    await crearMantenimiento({ vehiculoId, descripcion: 'Lejano', fechaObjetivo: fechaLocal(300) });
    await crearMantenimiento({ vehiculoId, descripcion: 'Vencido', fechaObjetivo: fechaLocal(-1) });

    const centro = await avisos(tokens.admin);
    const panel = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokens.admin}`);
    const lista = await request(app).get('/api/maintenances').set('Authorization', `Bearer ${tokens.admin}`);

    const proximosDelCentro = clavesDe(centro, 'MANTENIMIENTO_PROXIMO');
    const pendientesNoVencidos = lista.body.datos
      .filter((m) => m.status === 'PENDING' && !m.isOverdue)
      .map((m) => `MANTENIMIENTO:${m.id}:PROXIMO`);
    // El panel cuenta todo pendiente no vencido (2); el centro solo los que entran en el margen (1).
    expect(panel.body.mantenimientos.proximos).toBe(2);
    expect(proximosDelCentro).toEqual([`MANTENIMIENTO:${cercano}:PROXIMO`]);
    expect(proximosDelCentro.length).toBeLessThan(panel.body.mantenimientos.proximos);
    for (const clave of proximosDelCentro) {
      expect(pendientesNoVencidos).toContain(clave);
    }
    // Los vencidos siguen coincidiendo al 100 % con el panel.
    expect(clavesDe(centro, 'MANTENIMIENTO_VENCIDO')).toHaveLength(panel.body.mantenimientos.vencidos);
  });

  test('dentro del grupo el más cercano va primero', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('PRX-008-H');
    const lejos = await crearMantenimiento({ vehiculoId, descripcion: 'A 25 días', fechaObjetivo: fechaLocal(25) });
    const cerca = await crearMantenimiento({ vehiculoId, descripcion: 'A 3 días', fechaObjetivo: fechaLocal(3) });

    const respuesta = await avisos(tokens.admin);

    expect(clavesDe(respuesta, 'MANTENIMIENTO_PROXIMO')).toEqual([
      `MANTENIMIENTO:${cerca}:PROXIMO`,
      `MANTENIMIENTO:${lejos}:PROXIMO`,
    ]);
  });
});

describe('cita del día (FR-011, CA-3)', () => {
  test('una cita de hoy PROGRAMADA genera CITA:<id>:HOY con hora, cliente, placas y motivo', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('CIT-001-A');
    const id = await crearCita({ clienteId, vehiculoId, fecha: fechaLocal(0), hora: '10:00:00' });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos).toEqual([
      {
        clave: `CITA:${id}:HOY`,
        grupo: 'CITA_DEL_DIA',
        estado: 'HOY',
        titulo: 'Cita de hoy',
        detalle: '10:00 · Cliente CIT-001-A · CIT-001-A · Revisión de frenos delanteros',
        leido: false,
        destino: { pantalla: 'CITAS', id },
      },
    ]);
  });

  test.each(['CANCELADA', 'COMPLETADA'])('una cita de hoy %s no genera aviso', async (estado) => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('CIT-002-B');
    await crearCita({ clienteId, vehiculoId, fecha: fechaLocal(0), estado });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('las citas de otro día (ayer o mañana) no generan aviso de cita del día', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('CIT-003-C');
    await crearCita({ clienteId, vehiculoId, fecha: fechaLocal(-1), hora: '09:00:00' });
    await crearCita({ clienteId, vehiculoId, fecha: fechaLocal(1), hora: '09:00:00' });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('las citas del día van ordenadas por hora', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('CIT-004-D');
    const tarde = await crearCita({ clienteId, vehiculoId, fecha: fechaLocal(0), hora: '16:30:00' });
    const manana = await crearCita({ clienteId, vehiculoId, fecha: fechaLocal(0), hora: '08:15:00' });

    const respuesta = await avisos(tokens.admin);

    expect(clavesDe(respuesta, 'CITA_DEL_DIA')).toEqual([`CITA:${manana}:HOY`, `CITA:${tarde}:HOY`]);
    expect(respuesta.body.datos[0].detalle).toMatch(/^08:15 · /);
  });
});

describe('orden de presentación entre grupos', () => {
  test('vencidos, próximos y citas aparecen en ese orden', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('GRP-001-A');
    await crearCita({ clienteId, vehiculoId, fecha: fechaLocal(0) });
    await crearMantenimiento({ vehiculoId, descripcion: 'Próximo', fechaObjetivo: fechaLocal(7) });
    await crearMantenimiento({ vehiculoId, descripcion: 'Vencido', fechaObjetivo: fechaLocal(-7) });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos.map((aviso) => aviso.grupo)).toEqual([
      'MANTENIMIENTO_VENCIDO',
      'MANTENIMIENTO_PROXIMO',
      'CITA_DEL_DIA',
    ]);
    expect(respuesta.body.total).toBe(3);
  });
});

// --- US3 (T030): stock bajo o agotado ---------------------------------------

async function crearRefaccion({
  nombre = 'Pastillas de freno delanteras',
  codigo,
  stock,
  minimo,
  activa = 1,
}) {
  const [resultado] = await getPool().query(
    'INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES (?, ?, ?, ?, ?)',
    [nombre, codigo, stock, minimo, activa]
  );
  return resultado.insertId;
}

describe('stock bajo o agotado (FR-002, CA-3)', () => {
  test('0 < stock <= mínimo genera STOCK:<id>:BAJO con el texto del contrato', async () => {
    const { tokens } = await prepararEntorno();
    const id = await crearRefaccion({ codigo: 'FRN-PAS-220', stock: 2, minimo: 5 });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos).toEqual([
      {
        clave: `STOCK:${id}:BAJO`,
        grupo: 'STOCK',
        estado: 'BAJO',
        titulo: 'Stock bajo',
        detalle: 'Pastillas de freno delanteras (FRN-PAS-220) · quedan 2, mínimo 5',
        leido: false,
        destino: { pantalla: 'INVENTARIO', id },
      },
    ]);
  });

  test('stock igual al mínimo ya es stock bajo', async () => {
    const { tokens } = await prepararEntorno();
    const id = await crearRefaccion({ nombre: 'Bujía de iridio', codigo: 'BUJ-IR-001', stock: 8, minimo: 8 });

    const respuesta = await avisos(tokens.admin);

    expect(clavesDe(respuesta, 'STOCK')).toEqual([`STOCK:${id}:BAJO`]);
  });

  test('stock 0 genera STOCK:<id>:AGOTADO', async () => {
    const { tokens } = await prepararEntorno();
    const id = await crearRefaccion({ nombre: 'Batería 12V', codigo: 'BAT-12V-60', stock: 0, minimo: 2 });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos).toEqual([
      {
        clave: `STOCK:${id}:AGOTADO`,
        grupo: 'STOCK',
        estado: 'AGOTADO',
        titulo: 'Stock agotado',
        detalle: 'Batería 12V (BAT-12V-60) · sin existencias',
        leido: false,
        destino: { pantalla: 'INVENTARIO', id },
      },
    ]);
  });

  test('una refacción inactiva o con stock por encima del mínimo no genera aviso', async () => {
    const { tokens } = await prepararEntorno();
    await crearRefaccion({ codigo: 'INA-001', stock: 1, minimo: 5, activa: 0 });
    await crearRefaccion({ codigo: 'INA-002', stock: 0, minimo: 5, activa: 0 });
    await crearRefaccion({ codigo: 'OK-001', stock: 6, minimo: 5 });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('los agotados van primero y después los de menos existencias', async () => {
    const { tokens } = await prepararEntorno();
    const poco = await crearRefaccion({ codigo: 'ORD-POCO', stock: 1, minimo: 5 });
    const mas = await crearRefaccion({ codigo: 'ORD-MAS', stock: 4, minimo: 5 });
    const agotado = await crearRefaccion({ codigo: 'ORD-CERO', stock: 0, minimo: 5 });

    const respuesta = await avisos(tokens.admin);

    expect(clavesDe(respuesta, 'STOCK')).toEqual([
      `STOCK:${agotado}:AGOTADO`,
      `STOCK:${poco}:BAJO`,
      `STOCK:${mas}:BAJO`,
    ]);
  });

  test('al reponer el stock por encima del mínimo el aviso desaparece', async () => {
    const { tokens } = await prepararEntorno();
    const id = await crearRefaccion({ codigo: 'REP-001', stock: 2, minimo: 5 });
    expect(clavesDe(await avisos(tokens.admin), 'STOCK')).toEqual([`STOCK:${id}:BAJO`]);

    await getPool().query('UPDATE parts SET stock = 10 WHERE id = ?', [id]);

    expect((await avisos(tokens.admin)).body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('al pasar de bajo a agotado la clave cambia (vuelve como no leído)', async () => {
    const { tokens } = await prepararEntorno();
    const id = await crearRefaccion({ codigo: 'CAM-001', stock: 2, minimo: 5 });
    const antes = clavesDe(await avisos(tokens.admin), 'STOCK');

    await getPool().query('UPDATE parts SET stock = 0 WHERE id = ?', [id]);
    const despues = clavesDe(await avisos(tokens.admin), 'STOCK');

    expect(antes).toEqual([`STOCK:${id}:BAJO`]);
    expect(despues).toEqual([`STOCK:${id}:AGOTADO`]);
    expect(despues).not.toEqual(antes);
  });

  test('el stock va entre los vencidos y los próximos en el orden de presentación', async () => {
    const { tokens } = await prepararEntorno();
    const { vehiculoId } = await crearVehiculo('STK-001-A');
    await crearRefaccion({ codigo: 'GRP-001', stock: 1, minimo: 5 });
    await crearMantenimiento({ vehiculoId, descripcion: 'Próximo', fechaObjetivo: fechaLocal(7) });
    await crearMantenimiento({ vehiculoId, descripcion: 'Vencido', fechaObjetivo: fechaLocal(-7) });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos.map((aviso) => aviso.grupo)).toEqual([
      'MANTENIMIENTO_VENCIDO',
      'STOCK',
      'MANTENIMIENTO_PROXIMO',
    ]);
  });
});

describe('coincidencia del stock con el panel de control y con el inventario (CA-5)', () => {
  test('bajo + agotado = inventario.stockBajo del panel = refacciones activas con lowStock de GET /api/parts', async () => {
    const { tokens } = await prepararEntorno();
    // En alerta: dos bajas (una igual al mínimo) y una agotada.
    await crearRefaccion({ codigo: 'COI-001', stock: 2, minimo: 5 });
    await crearRefaccion({ codigo: 'COI-002', stock: 8, minimo: 8 });
    await crearRefaccion({ codigo: 'COI-003', stock: 0, minimo: 3 });
    // No cuentan: stock suficiente e inactivas (aunque estén bajo el mínimo).
    await crearRefaccion({ codigo: 'COI-004', stock: 34, minimo: 10 });
    await crearRefaccion({ codigo: 'COI-005', stock: 0, minimo: 1, activa: 0 });
    await crearRefaccion({ codigo: 'COI-006', stock: 1, minimo: 2, activa: 0 });

    const centro = await avisos(tokens.admin);
    const panel = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${tokens.admin}`);
    const inventario = await request(app).get('/api/parts').set('Authorization', `Bearer ${tokens.admin}`);

    const delCentro = clavesDe(centro, 'STOCK');
    const enAlertaDelInventario = inventario.body.datos.filter((parte) => parte.isActive && parte.lowStock);
    expect(delCentro).toHaveLength(3);
    expect(delCentro).toHaveLength(panel.body.inventario.stockBajo);
    expect(delCentro).toHaveLength(enAlertaDelInventario.length);
    const ids = enAlertaDelInventario.map((parte) => parte.id).sort((a, b) => a - b);
    expect(delCentro.map((clave) => Number(clave.split(':')[1])).sort((a, b) => a - b)).toEqual(ids);
  });
});

// --- US4 (T038): órdenes detenidas ------------------------------------------

/** Minutos de «hace N días y 10 minutos»: siempre dentro del día N, lejos de los bordes. */
const hace = (dias) => dias * 1440 + 10;

async function crearOrdenSql({
  clienteId,
  vehiculoId,
  estado = 'DIAGNOSTICO',
  estadoPrevio = null,
  minutosSinCambio,
  mecanicoId = null,
}) {
  const [resultado] = await getPool().query(
    `INSERT INTO service_orders
       (client_id, vehicle_id, mechanic_id, status, previous_state, mileage_entry, reason, status_changed_at)
     VALUES (?, ?, ?, ?, ?, 40000, 'Ruido al frenar', DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
    [clienteId, vehiculoId, mecanicoId, estado, estadoPrevio, minutosSinCambio]
  );
  return resultado.insertId;
}

describe('orden detenida (FR-010, CA-3)', () => {
  test.each([
    ['RECIBIDO', 'Recibido', null],
    ['DIAGNOSTICO', 'Diagnóstico', null],
    ['EN_REPARACION', 'En reparación', null],
    ['ESPERANDO_REFACCION', 'Esperando refacción', 'EN_REPARACION'],
  ])('una orden %s sin cambio de estado hace 5 días genera ORDEN:<id>:DETENIDA', async (estado, nombre, estadoPrevio) => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('ORD-DET-1');
    const id = await crearOrdenSql({ clienteId, vehiculoId, estado, estadoPrevio, minutosSinCambio: hace(5) });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos).toEqual([
      {
        clave: `ORDEN:${id}:DETENIDA`,
        grupo: 'ORDEN_DETENIDA',
        estado: 'DETENIDA',
        titulo: 'Orden detenida',
        // El nombre del estado en español lo genera el servidor.
        detalle: `Orden #${id} · ORD-DET-1 · ${nombre}, sin cambios hace 5 día(s)`,
        leido: false,
        destino: { pantalla: 'ORDEN', id },
      },
    ]);
  });

  test('el plazo es estrictamente de más de 3 días (72 horas)', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('ORD-DET-2');
    const justoAntes = await crearOrdenSql({ clienteId, vehiculoId, minutosSinCambio: 3 * 1440 - 5 });
    const justoDespues = await crearOrdenSql({ clienteId, vehiculoId, minutosSinCambio: 3 * 1440 + 5 });

    const respuesta = await avisos(tokens.admin);

    expect(clavesDe(respuesta, 'ORDEN_DETENIDA')).toEqual([`ORDEN:${justoDespues}:DETENIDA`]);
    expect(JSON.stringify(respuesta.body)).not.toContain(`ORDEN:${justoAntes}:`);
  });

  test.each(['TERMINADO', 'ENTREGADO', 'CANCELADA'])('una orden %s nunca genera aviso de orden detenida', async (estado) => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('ORD-DET-3');
    await crearOrdenSql({ clienteId, vehiculoId, estado, minutosSinCambio: hace(30) });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('cambiar el estado de la orden quita el aviso', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('ORD-DET-4');
    const id = await crearOrdenSql({ clienteId, vehiculoId, estado: 'DIAGNOSTICO', minutosSinCambio: hace(6) });
    expect(clavesDe(await avisos(tokens.admin), 'ORDEN_DETENIDA')).toEqual([`ORDEN:${id}:DETENIDA`]);

    const cambio = await request(app)
      .patch(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ status: 'EN_REPARACION' });

    expect(cambio.status).toBe(200);
    expect((await avisos(tokens.admin)).body).toEqual({ total: 0, noLeidos: 0, datos: [] });
  });

  test('editar motivo, notas o kilometraje no reinicia el plazo: el aviso sigue', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('ORD-DET-5');
    const id = await crearOrdenSql({ clienteId, vehiculoId, minutosSinCambio: hace(6) });

    const edicion = await request(app)
      .put(`/api/orders/${id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ reason: 'Ruido y vibración', notes: 'Se llamó al cliente', mileageEntry: 40500 });

    expect(edicion.status).toBe(200);
    expect(clavesDe(await avisos(tokens.admin), 'ORDEN_DETENIDA')).toEqual([`ORDEN:${id}:DETENIDA`]);
  });

  test('reasignar el mecánico tampoco reinicia el plazo', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('ORD-DET-6');
    const id = await crearOrdenSql({ clienteId, vehiculoId, minutosSinCambio: hace(6) });
    const [[mecanico]] = await getPool().query("SELECT id FROM users WHERE username = 'mecanico'");

    const asignacion = await request(app)
      .patch(`/api/orders/${id}/assignment`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ mechanicId: mecanico.id });

    expect(asignacion.status).toBe(200);
    expect(clavesDe(await avisos(tokens.admin), 'ORDEN_DETENIDA')).toEqual([`ORDEN:${id}:DETENIDA`]);
  });

  test('la más antigua va primero dentro del grupo', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('ORD-DET-7');
    const reciente = await crearOrdenSql({ clienteId, vehiculoId, minutosSinCambio: hace(4) });
    const antigua = await crearOrdenSql({ clienteId, vehiculoId, minutosSinCambio: hace(20) });
    const media = await crearOrdenSql({ clienteId, vehiculoId, minutosSinCambio: hace(9) });

    const respuesta = await avisos(tokens.admin);

    expect(clavesDe(respuesta, 'ORDEN_DETENIDA')).toEqual([
      `ORDEN:${antigua}:DETENIDA`,
      `ORDEN:${media}:DETENIDA`,
      `ORDEN:${reciente}:DETENIDA`,
    ]);
  });

  test('las órdenes detenidas van entre los vencidos y el stock en el orden de presentación', async () => {
    const { tokens } = await prepararEntorno();
    const { clienteId, vehiculoId } = await crearVehiculo('ORD-DET-8');
    await crearOrdenSql({ clienteId, vehiculoId, minutosSinCambio: hace(5) });
    await crearRefaccion({ codigo: 'GRP-ORD', stock: 1, minimo: 5 });
    await crearMantenimiento({ vehiculoId, descripcion: 'Próximo', fechaObjetivo: fechaLocal(7) });
    await crearMantenimiento({ vehiculoId, descripcion: 'Vencido', fechaObjetivo: fechaLocal(-7) });
    await crearCita({ clienteId, vehiculoId, fecha: fechaLocal(0) });

    const respuesta = await avisos(tokens.admin);

    expect(respuesta.body.datos.map((aviso) => aviso.grupo)).toEqual([
      'MANTENIMIENTO_VENCIDO',
      'ORDEN_DETENIDA',
      'STOCK',
      'MANTENIMIENTO_PROXIMO',
      'CITA_DEL_DIA',
    ]);
  });
});
