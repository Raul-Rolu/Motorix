// 007-notificaciones-internas, T058 (US7; FR-014, FR-015, CA-10, CA-11): clientes
// por avisar. `GET /api/client-notices/pending` lista los hechos (orden
// terminada sin entregar, cita de mañana, mantenimiento próximo o vencido) con
// cliente, teléfono, vehículo y motivo; `POST /api/client-notices` registra
// quién avisó, cuándo y una nota opcional (≤ 255). Un hecho se avisa UNA sola
// vez (restricción única (notice_type, fact_id)); un hecho nuevo vuelve a
// aparecer. Corre contra `motorix_test`.
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
    ['recepcion', 'Recepción del Taller', 'RECEPTIONIST'],
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
  const [[recepcion]] = await getPool().query("SELECT id FROM users WHERE username = 'recepcion'");
  return { tokens, recepcionId: recepcion.id };
}

/** Cliente con teléfono y un vehículo; devuelve sus ids y datos. */
async function crearCliente(nombre, telefono, placas, marca = 'Nissan', modelo = 'Versa') {
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', [
    nombre,
    telefono,
  ]);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, placas, marca, modelo, 2020]
  );
  return {
    clienteId: cliente.insertId,
    vehiculoId: vehiculo.insertId,
    datos: {
      cliente: { id: cliente.insertId, nombreCompleto: nombre, telefono },
      vehiculo: { id: vehiculo.insertId, placas, marca, modelo },
    },
  };
}

async function crearOrden(c, estado, { diasSinCambio = 1 } = {}) {
  const [resultado] = await getPool().query(
    `INSERT INTO service_orders (client_id, vehicle_id, status, mileage_entry, reason, status_changed_at)
     VALUES (?, ?, ?, 40000, 'Ruido al frenar', DATE_SUB(NOW(), INTERVAL ? DAY))`,
    [c.clienteId, c.vehiculoId, estado, diasSinCambio]
  );
  return resultado.insertId;
}

async function crearCita(c, fecha, { hora = '09:00:00', estado = 'PROGRAMADA' } = {}) {
  const [resultado] = await getPool().query(
    'INSERT INTO appointments (client_id, vehicle_id, appointment_date, appointment_time, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
    [c.clienteId, c.vehiculoId, fecha, hora, 'Revisión de aire acondicionado', estado]
  );
  return resultado.insertId;
}

async function crearMantenimiento(c, descripcion, fechaObjetivo, estado = 'PENDING') {
  const [resultado] = await getPool().query(
    'INSERT INTO maintenance_plans (vehicle_id, description, target_date, status) VALUES (?, ?, ?, ?)',
    [c.vehiculoId, descripcion, fechaObjetivo, estado]
  );
  return resultado.insertId;
}

const pendientes = (token) =>
  request(app).get('/api/client-notices/pending').set('Authorization', `Bearer ${token}`);
const avisar = (token, cuerpo) =>
  request(app).post('/api/client-notices').set('Authorization', `Bearer ${token}`).send(cuerpo);
const hechosPendientes = (respuesta) =>
  respuesta.body.datos.map((hecho) => `${hecho.tipo}:${hecho.hechoId}`);
const avisosGuardados = async () => {
  const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM client_notices');
  return Number(total);
};

describe('lista de clientes por avisar (FR-014, CA-10)', () => {
  test('incluye orden terminada, cita de mañana y mantenimiento con cliente, teléfono, vehículo y motivo', async () => {
    const { tokens } = await prepararEntorno();
    const ana = await crearCliente('Ana Sofía Mendoza', '5534567890', 'JKL-012-D', 'Toyota', 'Corolla');
    const maria = await crearCliente('María López Hernández', '5512345678', 'DEF-456-B', 'Mazda', 'CX-5');
    const juan = await crearCliente('Juan Carlos Ramírez', '5523456789', 'GHI-789-C', 'Chevrolet', 'Aveo');
    const orden = await crearOrden(ana, 'TERMINADO');
    const cita = await crearCita(maria, fechaLocal(1), { hora: '09:00:00' });
    const vencido = await crearMantenimiento(juan, 'Cambio de aceite y filtros', fechaLocal(-30));
    const proximo = await crearMantenimiento(maria, 'Cambio de filtros', fechaLocal(10));

    const respuesta = await pendientes(tokens.recepcion);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(4);
    expect(respuesta.body.datos).toEqual([
      {
        tipo: 'ORDEN_TERMINADA',
        hechoId: orden,
        motivo: `Vehículo listo (orden #${orden})`,
        ...ana.datos,
        fechaReferencia: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
      },
      {
        tipo: 'CITA_MANANA',
        hechoId: cita,
        motivo: 'Cita mañana a las 09:00',
        ...maria.datos,
        fechaReferencia: fechaLocal(1),
      },
      {
        tipo: 'MANTENIMIENTO',
        hechoId: vencido,
        motivo: 'Mantenimiento vencido: Cambio de aceite y filtros',
        ...juan.datos,
        fechaReferencia: fechaLocal(-30),
      },
      {
        tipo: 'MANTENIMIENTO',
        hechoId: proximo,
        motivo: 'Mantenimiento próximo: Cambio de filtros',
        ...maria.datos,
        fechaReferencia: fechaLocal(10),
      },
    ]);
  });

  test('ADMIN también ve la lista', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Admin', '5551110000', 'ADM-001-A');
    const orden = await crearOrden(c, 'TERMINADO');

    const respuesta = await pendientes(tokens.admin);

    expect(respuesta.status).toBe(200);
    expect(hechosPendientes(respuesta)).toEqual([`ORDEN_TERMINADA:${orden}`]);
  });

  test('sin hechos devuelve una lista vacía', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await pendientes(tokens.recepcion);

    expect(respuesta.body).toEqual({ total: 0, datos: [] });
  });

  test('solo cuentan las órdenes TERMINADO (no entregadas, canceladas ni en trabajo)', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Órdenes', '5552220000', 'ORD-001-A');
    for (const estado of ['RECIBIDO', 'DIAGNOSTICO', 'EN_REPARACION', 'ESPERANDO_REFACCION', 'ENTREGADO', 'CANCELADA']) {
      await crearOrden(c, estado);
    }
    const terminada = await crearOrden(c, 'TERMINADO');

    const respuesta = await pendientes(tokens.recepcion);

    expect(hechosPendientes(respuesta)).toEqual([`ORDEN_TERMINADA:${terminada}`]);
  });

  test('solo cuentan las citas PROGRAMADAS de mañana (no hoy, ayer, pasado mañana ni canceladas o completadas)', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Citas', '5553330000', 'CIT-001-A');
    await crearCita(c, fechaLocal(0), { hora: '08:00:00' });
    await crearCita(c, fechaLocal(-1), { hora: '08:00:00' });
    await crearCita(c, fechaLocal(2), { hora: '08:00:00' });
    await crearCita(c, fechaLocal(1), { hora: '10:00:00', estado: 'CANCELADA' });
    await crearCita(c, fechaLocal(1), { hora: '11:00:00', estado: 'COMPLETADA' });
    const manana = await crearCita(c, fechaLocal(1), { hora: '16:30:00' });

    const respuesta = await pendientes(tokens.recepcion);

    expect(hechosPendientes(respuesta)).toEqual([`CITA_MANANA:${manana}`]);
    expect(respuesta.body.datos[0].motivo).toBe('Cita mañana a las 16:30');
  });

  test('solo cuentan los mantenimientos pendientes vencidos o próximos', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Mantenimientos', '5554440000', 'MAN-001-A');
    await crearMantenimiento(c, 'Lejano', fechaLocal(200));
    await crearMantenimiento(c, 'Cancelado', fechaLocal(-5), 'CANCELLED');
    await crearMantenimiento(c, 'Completado', fechaLocal(-5), 'COMPLETED');
    const proximo = await crearMantenimiento(c, 'Próximo', fechaLocal(30));
    const vencido = await crearMantenimiento(c, 'Vencido', fechaLocal(-1));

    const respuesta = await pendientes(tokens.recepcion);

    // Los vencidos van antes que los próximos.
    expect(hechosPendientes(respuesta)).toEqual([`MANTENIMIENTO:${vencido}`, `MANTENIMIENTO:${proximo}`]);
  });

  test('si la orden terminada se entrega antes de avisar al cliente, el motivo desaparece', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Entrega', '5555550000', 'ENT-001-A');
    const orden = await crearOrden(c, 'TERMINADO');
    expect(hechosPendientes(await pendientes(tokens.recepcion))).toEqual([`ORDEN_TERMINADA:${orden}`]);

    await getPool().query("UPDATE service_orders SET status = 'ENTREGADO' WHERE id = ?", [orden]);

    expect((await pendientes(tokens.recepcion)).body).toEqual({ total: 0, datos: [] });
  });
});

describe('marcar a un cliente como avisado (FR-015, CA-11)', () => {
  test('guarda quién, cuándo y la nota, y saca el hecho de la lista', async () => {
    const { tokens, recepcionId } = await prepararEntorno();
    const c = await crearCliente('Ana Sofía Mendoza', '5534567890', 'AVI-001-A');
    const orden = await crearOrden(c, 'TERMINADO');
    const otra = await crearCita(c, fechaLocal(1));

    const respuesta = await avisar(tokens.recepcion, { tipo: 'ORDEN_TERMINADA', hechoId: orden, nota: 'No contestó' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({
      id: expect.any(Number),
      tipo: 'ORDEN_TERMINADA',
      hechoId: orden,
      nota: 'No contestó',
      avisadoPor: { id: recepcionId, nombreCompleto: 'Recepción del Taller' },
      fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
    });
    const [[fila]] = await getPool().query(
      `SELECT client_id, notice_type, fact_id, note, notified_by,
              TIMESTAMPDIFF(SECOND, notified_at, NOW()) AS segundos
       FROM client_notices`
    );
    expect(fila).toMatchObject({
      client_id: c.clienteId,
      notice_type: 'ORDEN_TERMINADA',
      fact_id: orden,
      note: 'No contestó',
      notified_by: recepcionId,
    });
    expect(Math.abs(fila.segundos)).toBeLessThan(10);
    // Sale de la lista; los demás hechos siguen.
    expect(hechosPendientes(await pendientes(tokens.recepcion))).toEqual([`CITA_MANANA:${otra}`]);
  });

  test('la nota es opcional (sin nota queda en null) y admite hasta 255 caracteres', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Notas', '5556660000', 'NOT-001-A');
    const sinNota = await crearOrden(c, 'TERMINADO');
    const conLimite = await crearOrden(c, 'TERMINADO');

    const a = await avisar(tokens.recepcion, { tipo: 'ORDEN_TERMINADA', hechoId: sinNota });
    const b = await avisar(tokens.recepcion, { tipo: 'ORDEN_TERMINADA', hechoId: conLimite, nota: 'x'.repeat(255) });

    expect(a.status).toBe(201);
    expect(a.body.nota).toBeNull();
    expect(b.status).toBe(201);
    expect(b.body.nota).toHaveLength(255);
  });

  test('una nota de 256 caracteres se rechaza (400) y no se registra nada', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Nota Larga', '5557770000', 'NOT-002-B');
    const orden = await crearOrden(c, 'TERMINADO');

    const respuesta = await avisar(tokens.recepcion, { tipo: 'ORDEN_TERMINADA', hechoId: orden, nota: 'x'.repeat(256) });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(await avisosGuardados()).toBe(0);
    expect(hechosPendientes(await pendientes(tokens.recepcion))).toEqual([`ORDEN_TERMINADA:${orden}`]);
  });

  test.each([
    ['sin cuerpo', undefined],
    ['sin tipo', { hechoId: 1 }],
    ['tipo fuera del catálogo', { tipo: 'FACTURA', hechoId: 1 }],
    ['sin hechoId', { tipo: 'ORDEN_TERMINADA' }],
    ['hechoId no numérico', { tipo: 'ORDEN_TERMINADA', hechoId: 'abc' }],
    ['hechoId cero', { tipo: 'ORDEN_TERMINADA', hechoId: 0 }],
    ['hechoId negativo', { tipo: 'ORDEN_TERMINADA', hechoId: -4 }],
    ['nota que no es texto', { tipo: 'ORDEN_TERMINADA', hechoId: 1, nota: 12 }],
  ])('rechaza %s con 400 DATOS_INVALIDOS', async (_descripcion, cuerpo) => {
    const { tokens } = await prepararEntorno();

    const respuesta = await avisar(tokens.recepcion, cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(await avisosGuardados()).toBe(0);
  });

  test('avisar dos veces el mismo hecho responde 409 CLIENT_NOTICE_DUPLICATE con quién y cuándo, sin duplicar', async () => {
    const { tokens, recepcionId } = await prepararEntorno();
    const c = await crearCliente('Cliente Repetido', '5558880000', 'DUP-001-A');
    const orden = await crearOrden(c, 'TERMINADO');
    await avisar(tokens.recepcion, { tipo: 'ORDEN_TERMINADA', hechoId: orden, nota: 'Primera vez' });

    const segunda = await avisar(tokens.admin, { tipo: 'ORDEN_TERMINADA', hechoId: orden });

    expect(segunda.status).toBe(409);
    expect(segunda.body.error.codigo).toBe('CLIENT_NOTICE_DUPLICATE');
    expect(segunda.body.error.details.avisadoPor).toEqual({ id: recepcionId, nombreCompleto: 'Recepción del Taller' });
    expect(segunda.body.error.details.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(await avisosGuardados()).toBe(1);
  });

  test('dos solicitudes simultáneas del mismo hecho producen un solo registro (restricción única)', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Concurrente', '5559990000', 'CON-001-A');
    const orden = await crearOrden(c, 'TERMINADO');

    const [a, b] = await Promise.all([
      avisar(tokens.recepcion, { tipo: 'ORDEN_TERMINADA', hechoId: orden }),
      avisar(tokens.admin, { tipo: 'ORDEN_TERMINADA', hechoId: orden }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const perdedora = a.status === 409 ? a : b;
    expect(perdedora.body.error.codigo).toBe('CLIENT_NOTICE_DUPLICATE');
    expect(await avisosGuardados()).toBe(1);
  });

  test('un hecho que no está pendiente responde 409 CLIENT_NOTICE_NOT_PENDING y no se registra', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente No Pendiente', '5551230000', 'NOP-001-A');
    const entregada = await crearOrden(c, 'ENTREGADO');
    const enTrabajo = await crearOrden(c, 'DIAGNOSTICO');
    const citaCancelada = await crearCita(c, fechaLocal(1), { estado: 'CANCELADA' });
    const citaHoy = await crearCita(c, fechaLocal(0), { hora: '10:00:00' });
    const completado = await crearMantenimiento(c, 'Completado', fechaLocal(-3), 'COMPLETED');
    const lejano = await crearMantenimiento(c, 'Lejano', fechaLocal(300));

    for (const cuerpo of [
      { tipo: 'ORDEN_TERMINADA', hechoId: entregada },
      { tipo: 'ORDEN_TERMINADA', hechoId: enTrabajo },
      { tipo: 'CITA_MANANA', hechoId: citaCancelada },
      { tipo: 'CITA_MANANA', hechoId: citaHoy },
      { tipo: 'MANTENIMIENTO', hechoId: completado },
      { tipo: 'MANTENIMIENTO', hechoId: lejano },
      { tipo: 'ORDEN_TERMINADA', hechoId: 987654 },
    ]) {
      const respuesta = await avisar(tokens.recepcion, cuerpo);
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.codigo).toBe('CLIENT_NOTICE_NOT_PENDING');
    }
    expect(await avisosGuardados()).toBe(0);
  });

  test('el tipo del aviso debe corresponder al hecho: una orden no se avisa como cita', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Tipo', '5554560000', 'TIP-001-A');
    const orden = await crearOrden(c, 'TERMINADO');

    const respuesta = await avisar(tokens.recepcion, { tipo: 'CITA_MANANA', hechoId: orden });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.codigo).toBe('CLIENT_NOTICE_NOT_PENDING');
  });
});

describe('qué cuenta como el mismo hecho y qué como un hecho nuevo (CA-11)', () => {
  test('un mantenimiento avisado como próximo que pasa a vencido es el mismo hecho: no vuelve a la lista', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Mantenimiento', '5557890000', 'MIS-001-A');
    const id = await crearMantenimiento(c, 'Cambio de filtros', fechaLocal(10));
    expect(hechosPendientes(await pendientes(tokens.recepcion))).toEqual([`MANTENIMIENTO:${id}`]);
    await avisar(tokens.recepcion, { tipo: 'MANTENIMIENTO', hechoId: id });

    // Pasa de próximo a vencido.
    await getPool().query('UPDATE maintenance_plans SET target_date = ? WHERE id = ?', [fechaLocal(-1), id]);

    expect((await pendientes(tokens.recepcion)).body).toEqual({ total: 0, datos: [] });
    const repetido = await avisar(tokens.recepcion, { tipo: 'MANTENIMIENTO', hechoId: id });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe('CLIENT_NOTICE_DUPLICATE');
  });

  test('un mantenimiento nuevo (otro registro) del mismo vehículo sí aparece', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Nuevo Mantenimiento', '5550001234', 'NUE-001-A');
    const viejo = await crearMantenimiento(c, 'Cambio de aceite', fechaLocal(10));
    await avisar(tokens.recepcion, { tipo: 'MANTENIMIENTO', hechoId: viejo });

    const nuevo = await crearMantenimiento(c, 'Revisión de frenos', fechaLocal(15));

    expect(hechosPendientes(await pendientes(tokens.recepcion))).toEqual([`MANTENIMIENTO:${nuevo}`]);
  });

  test('otra orden terminada o otra cita del mismo cliente reaparecen como hechos nuevos', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Reincidente', '5554321000', 'REI-001-A');
    const primeraOrden = await crearOrden(c, 'TERMINADO');
    const primeraCita = await crearCita(c, fechaLocal(1), { hora: '09:00:00' });
    await avisar(tokens.recepcion, { tipo: 'ORDEN_TERMINADA', hechoId: primeraOrden });
    await avisar(tokens.recepcion, { tipo: 'CITA_MANANA', hechoId: primeraCita });
    expect((await pendientes(tokens.recepcion)).body.total).toBe(0);

    const segundaOrden = await crearOrden(c, 'TERMINADO');
    const segundaCita = await crearCita(c, fechaLocal(1), { hora: '12:00:00' });

    expect(hechosPendientes(await pendientes(tokens.recepcion))).toEqual([
      `ORDEN_TERMINADA:${segundaOrden}`,
      `CITA_MANANA:${segundaCita}`,
    ]);
  });

  test('un aviso de un tipo no afecta a un hecho de otro tipo con el mismo identificador', async () => {
    const { tokens } = await prepararEntorno();
    const c = await crearCliente('Cliente Mismo Id', '5550987654', 'IDS-001-A');
    // Orden, cita y mantenimiento recién creados suelen compartir el identificador 1.
    const orden = await crearOrden(c, 'TERMINADO');
    const cita = await crearCita(c, fechaLocal(1));
    await avisar(tokens.recepcion, { tipo: 'ORDEN_TERMINADA', hechoId: orden });

    expect(hechosPendientes(await pendientes(tokens.recepcion))).toEqual([`CITA_MANANA:${cita}`]);
  });
});
