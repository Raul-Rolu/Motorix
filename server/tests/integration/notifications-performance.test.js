// 007-notificaciones-internas, T072 (FR-017, CA-13): rendimiento de
// `GET /api/notifications` con volumen ampliado (10 a 50 veces el de la
// demostración): 1,000 órdenes (200 activas, 100 de ellas detenidas), 600 citas
// (100 PROGRAMADAS de hoy), 400 refacciones (100 en alerta), 500 mantenimientos
// pendientes en 300 vehículos (100 vencidos o próximos) y 200 lecturas.
// Una llamada de calentamiento descartada y 5 mediciones por rol; el MÁXIMO de
// cada rol debe ser menor de 1,000 ms y cada petición debe usar 10 consultas SQL
// o menos (incluida la de autenticación), sin N+1. Corre contra `motorix_test`.
//
// Si la variable de entorno EVIDENCIA_RENDIMIENTO apunta a un archivo, los
// tiempos medidos se guardan ahí (T073).
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';
import { crearApp } from '../../app.js';
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

const app = crearApp();

const LIMITE_MS = 1000;
const LIMITE_CONSULTAS = 10;
const MEDICIONES = 5;

const volumen = {
  ordenes: 1000,
  ordenesActivas: 200,
  ordenesDetenidas: 100,
  citas: 600,
  citasDeHoy: 100,
  refacciones: 400,
  refaccionesEnAlerta: 100,
  mantenimientos: 500,
  vehiculos: 300,
  mantenimientosConAviso: 100,
  lecturas: 200,
};

function fechaLocal(diasDesdeHoy) {
  const fecha = new Date();
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() + diasDesdeHoy);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Inserción masiva por lotes: una sola sentencia INSERT por cada `lote` filas. */
async function insertarMasivo(tabla, columnas, filas, lote = 250) {
  for (let inicio = 0; inicio < filas.length; inicio += lote) {
    const parte = filas.slice(inicio, inicio + lote);
    await getPool().query(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES ?`, [parte]);
  }
}

async function sembrarVolumen() {
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
  const [usuarios] = await getPool().query('SELECT id, username FROM users');
  const idDe = Object.fromEntries(usuarios.map((u) => [u.username, u.id]));

  // 100 clientes con 3 vehículos cada uno (300 vehículos).
  await insertarMasivo(
    'clients',
    ['full_name', 'phone'],
    Array.from({ length: 100 }, (_, i) => [`Cliente de carga ${i + 1}`, `55${String(10000000 + i)}`])
  );
  const [clientes] = await getPool().query('SELECT id FROM clients ORDER BY id');
  await insertarMasivo(
    'vehicles',
    ['client_id', 'plates', 'brand', 'model', 'year'],
    Array.from({ length: volumen.vehiculos }, (_, i) => [
      clientes[i % clientes.length].id,
      `PRF-${String(i + 1).padStart(4, '0')}`,
      'Nissan',
      'Versa',
      2020,
    ])
  );
  const [vehiculos] = await getPool().query('SELECT id, client_id FROM vehicles ORDER BY id');

  // Órdenes: 100 detenidas (activas con último cambio hace 10 días), 100 activas
  // recientes y 800 cerradas (entregadas o canceladas). Un tercio de las activas
  // va al mecánico de ejemplo.
  const activos = ['RECIBIDO', 'DIAGNOSTICO', 'EN_REPARACION', 'ESPERANDO_REFACCION'];
  const ordenes = [];
  for (let i = 0; i < volumen.ordenes; i += 1) {
    const vehiculo = vehiculos[i % vehiculos.length];
    let estado;
    let diasSinCambio;
    if (i < volumen.ordenesDetenidas) {
      estado = activos[i % activos.length];
      diasSinCambio = 10;
    } else if (i < volumen.ordenesActivas) {
      estado = activos[i % activos.length];
      diasSinCambio = 1;
    } else {
      estado = i % 2 === 0 ? 'ENTREGADO' : 'CANCELADA';
      diasSinCambio = 30;
    }
    const esActiva = i < volumen.ordenesActivas;
    ordenes.push([
      vehiculo.client_id,
      vehiculo.id,
      esActiva && i % 3 === 0 ? idDe.mecanico : null,
      estado,
      30000 + i,
      'Orden de carga',
      new Date(Date.now() - diasSinCambio * 24 * 3600 * 1000),
    ]);
  }
  await insertarMasivo(
    'service_orders',
    ['client_id', 'vehicle_id', 'mechanic_id', 'status', 'mileage_entry', 'reason', 'status_changed_at'],
    ordenes
  );

  // Citas: 100 PROGRAMADAS de hoy; el resto en otras fechas y estados.
  const citas = [];
  for (let i = 0; i < volumen.citas; i += 1) {
    const vehiculo = vehiculos[i % vehiculos.length];
    const deHoy = i < volumen.citasDeHoy;
    citas.push([
      vehiculo.client_id,
      vehiculo.id,
      deHoy ? fechaLocal(0) : fechaLocal(((i % 20) + 2) * (i % 2 === 0 ? 1 : -1)),
      `${String(8 + (i % 9)).padStart(2, '0')}:00:00`,
      'Cita de carga',
      deHoy ? 'PROGRAMADA' : ['PROGRAMADA', 'COMPLETADA', 'CANCELADA'][i % 3],
    ]);
  }
  await insertarMasivo(
    'appointments',
    ['client_id', 'vehicle_id', 'appointment_date', 'appointment_time', 'reason', 'status'],
    citas
  );

  // Refacciones: 100 en alerta (stock bajo o agotado) y 300 con existencias.
  const refacciones = [];
  for (let i = 0; i < volumen.refacciones; i += 1) {
    const enAlerta = i < volumen.refaccionesEnAlerta;
    refacciones.push([
      `Refacción de carga ${i + 1}`,
      `PRF-REF-${String(i + 1).padStart(4, '0')}`,
      enAlerta ? i % 2 : 50,
      5,
      1,
    ]);
  }
  await insertarMasivo('parts', ['name', 'code', 'stock', 'min_stock', 'is_active'], refacciones);

  // Mantenimientos pendientes: 100 vencidos o próximos, el resto lejanos.
  const mantenimientos = [];
  for (let i = 0; i < volumen.mantenimientos; i += 1) {
    const conAviso = i < volumen.mantenimientosConAviso;
    mantenimientos.push([
      vehiculos[i % vehiculos.length].id,
      `Mantenimiento de carga ${i + 1}`,
      conAviso ? fechaLocal(i % 2 === 0 ? -((i % 40) + 1) : (i % 25) + 1) : fechaLocal(120 + (i % 200)),
      'PENDING',
    ]);
  }
  await insertarMasivo(
    'maintenance_plans',
    ['vehicle_id', 'description', 'target_date', 'status'],
    mantenimientos
  );

  // 200 lecturas repartidas entre los usuarios.
  const lecturas = [];
  const ids = [idDe.admin, idDe.recepcion, idDe.mecanico];
  for (let i = 0; i < volumen.lecturas; i += 1) {
    lecturas.push([ids[i % ids.length], `MANTENIMIENTO_VENCIDO:${i + 1}:VENCIDO`]);
  }
  await insertarMasivo('notification_reads', ['user_id', 'notification_key'], lecturas);
}

async function iniciarSesion(username) {
  const respuesta = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: username, contrasena: 'Usuario123' });
  return respuesta.body.token;
}

async function medirUnaLlamada(token) {
  const pool = getPool();
  const espia = jest.spyOn(pool, 'query');
  const inicio = performance.now();
  const respuesta = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
  const milisegundos = performance.now() - inicio;
  const consultas = espia.mock.calls.length;
  espia.mockRestore();
  return { respuesta, milisegundos, consultas };
}

const informe = [];

beforeAll(async () => {
  await prepararBaseDePruebas();
  await limpiarTablas();
  await sembrarVolumen();
}, 120000);

afterAll(async () => {
  if (process.env.EVIDENCIA_RENDIMIENTO) {
    const encabezado = [
      'Rendimiento de GET /api/notifications (007-notificaciones-internas, T072/T073, CA-13)',
      `Fecha: ${new Date().toISOString()}`,
      `Volumen: ${volumen.ordenes} órdenes (${volumen.ordenesActivas} activas, ${volumen.ordenesDetenidas} detenidas), ` +
        `${volumen.citas} citas (${volumen.citasDeHoy} de hoy), ${volumen.refacciones} refacciones ` +
        `(${volumen.refaccionesEnAlerta} en alerta), ${volumen.mantenimientos} mantenimientos en ${volumen.vehiculos} vehículos ` +
        `(${volumen.mantenimientosConAviso} vencidos o próximos), ${volumen.lecturas} lecturas`,
      `Método: 1 llamada de calentamiento descartada + ${MEDICIONES} mediciones por rol; criterio: máximo < ${LIMITE_MS} ms y ≤ ${LIMITE_CONSULTAS} consultas SQL por petición`,
      '',
    ];
    writeFileSync(process.env.EVIDENCIA_RENDIMIENTO, `${[...encabezado, ...informe].join('\n')}\n`, 'utf8');
  }
  await limpiarTablas();
  await cerrarBaseDePruebas();
});

describe('rendimiento de GET /api/notifications con volumen ampliado (CA-13)', () => {
  test('el volumen sembrado coincide con el definido en el plan', async () => {
    const contar = async (sql) => Number((await getPool().query(sql))[0][0].n);

    expect(await contar('SELECT COUNT(*) AS n FROM service_orders')).toBe(volumen.ordenes);
    expect(await contar("SELECT COUNT(*) AS n FROM service_orders WHERE status NOT IN ('ENTREGADO','CANCELADA','TERMINADO')")).toBe(volumen.ordenesActivas);
    expect(await contar('SELECT COUNT(*) AS n FROM appointments')).toBe(volumen.citas);
    expect(await contar('SELECT COUNT(*) AS n FROM parts')).toBe(volumen.refacciones);
    expect(await contar('SELECT COUNT(*) AS n FROM maintenance_plans')).toBe(volumen.mantenimientos);
    expect(await contar('SELECT COUNT(DISTINCT vehicle_id) AS n FROM maintenance_plans')).toBe(volumen.vehiculos);
    expect(await contar('SELECT COUNT(*) AS n FROM notification_reads')).toBe(volumen.lecturas);
  });

  test.each([
    ['admin', 'ADMIN'],
    ['recepcion', 'RECEPTIONIST'],
    ['mecanico', 'MECHANIC'],
  ])('el máximo de 5 mediciones de %s es menor de 1,000 ms y usa 10 consultas o menos', async (usuario, rol) => {
    const token = await iniciarSesion(usuario);

    // Calentamiento (descartado): conexiones, caché de planes y JIT.
    const calentamiento = await medirUnaLlamada(token);
    expect(calentamiento.respuesta.status).toBe(200);

    const tiempos = [];
    let consultasMaximas = 0;
    let total = 0;
    for (let i = 0; i < MEDICIONES; i += 1) {
      const { respuesta, milisegundos, consultas } = await medirUnaLlamada(token);
      expect(respuesta.status).toBe(200);
      tiempos.push(milisegundos);
      consultasMaximas = Math.max(consultasMaximas, consultas);
      total = respuesta.body.total;
    }
    const maximo = Math.max(...tiempos);
    informe.push(
      `${rol} (${usuario}): total de avisos=${total}; consultas SQL por petición (máx.)=${consultasMaximas}; ` +
        `tiempos ms=[${tiempos.map((t) => t.toFixed(1)).join(', ')}]; máximo=${maximo.toFixed(1)} ms`
    );

    expect(maximo).toBeLessThan(LIMITE_MS);
    expect(consultasMaximas).toBeLessThanOrEqual(LIMITE_CONSULTAS);
    // Con este volumen cada rol ve avisos (la medición no es sobre una lista vacía).
    expect(total).toBeGreaterThan(0);
  }, 60000);
});
