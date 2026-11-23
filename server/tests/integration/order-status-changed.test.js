// 007-notificaciones-internas, T037 (US4; FR-020, CA-15): `status_changed_at`
// es la fecha del ÚLTIMO CAMBIO DE ESTADO de una orden. La actualiza solo
// `orderModel.setStatus` (avance, pausa, reanudación y cancelación) en el mismo
// UPDATE que cambia el estado; el alta la inicia en su creación; editar motivo,
// notas, kilometraje o asignar mecánico NO la modifican; y ninguna respuesta
// existente de órdenes expone la columna ni cambia de forma.
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

/** Fecha antigua y fija: cualquier actualización a «ahora» se distingue sin ambigüedad. */
const FECHA_ANTIGUA = '2026-01-15 08:00:00';

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
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
  const [[mecanico]] = await getPool().query("SELECT id FROM users WHERE username = 'mecanico'");

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ fullName: 'Cliente Estado', phone: '5551112222' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ clientId: cliente.body.id, plates: 'est-001-a', brand: 'Nissan', model: 'Versa', year: 2020 });

  return { tokens, mecanicoId: mecanico.id, vehiculoId: vehiculo.body.id };
}

async function crearOrden(entorno, { mileageEntry = 40000 } = {}) {
  const respuesta = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${entorno.tokens.recepcion}`)
    .send({ vehicleId: entorno.vehiculoId, mileageEntry, reason: 'Ruido al frenar' });
  expect(respuesta.status).toBe(201);
  return respuesta.body.id;
}

/** Fija una fecha antigua de último cambio de estado para detectar cualquier actualización. */
async function envejecer(ordenId) {
  await getPool().query('UPDATE service_orders SET status_changed_at = ? WHERE id = ?', [
    FECHA_ANTIGUA,
    ordenId,
  ]);
}

async function leerFechas(ordenId) {
  const [[fila]] = await getPool().query(
    `SELECT DATE_FORMAT(status_changed_at, '%Y-%m-%d %H:%i:%s') AS estado,
            TIMESTAMPDIFF(SECOND, status_changed_at, NOW()) AS segundosDesdeCambio,
            TIMESTAMPDIFF(SECOND, created_at, status_changed_at) AS segundosDesdeCreacion,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS actualizado
     FROM service_orders WHERE id = ?`,
    [ordenId]
  );
  return fila;
}

const cambiarEstado = (token, ordenId, cuerpo) =>
  request(app)
    .patch(`/api/orders/${ordenId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo);

/** Comprueba que la fecha dejó de ser la antigua y es de «ahora». */
function esReciente(fechas) {
  expect(fechas.estado).not.toBe(FECHA_ANTIGUA);
  expect(Math.abs(fechas.segundosDesdeCambio)).toBeLessThan(10);
}

describe('cada transición de estado actualiza status_changed_at (FR-020)', () => {
  test('avance: RECIBIDO → DIAGNOSTICO', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);
    await envejecer(id);

    const respuesta = await cambiarEstado(entorno.tokens.admin, id, { status: 'DIAGNOSTICO' });

    expect(respuesta.status).toBe(200);
    esReciente(await leerFechas(id));
  });

  test('pausa: pasar a ESPERANDO_REFACCION', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);
    await cambiarEstado(entorno.tokens.admin, id, { status: 'DIAGNOSTICO' });
    await envejecer(id);

    const respuesta = await cambiarEstado(entorno.tokens.admin, id, { status: 'ESPERANDO_REFACCION' });

    expect(respuesta.status).toBe(200);
    esReciente(await leerFechas(id));
  });

  test('reanudación: salir de ESPERANDO_REFACCION al estado de origen', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);
    await cambiarEstado(entorno.tokens.admin, id, { status: 'DIAGNOSTICO' });
    await cambiarEstado(entorno.tokens.admin, id, { status: 'ESPERANDO_REFACCION' });
    await envejecer(id);

    const respuesta = await cambiarEstado(entorno.tokens.admin, id, { status: 'DIAGNOSTICO' });

    expect(respuesta.status).toBe(200);
    esReciente(await leerFechas(id));
  });

  test('cancelación', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);
    await envejecer(id);

    const respuesta = await cambiarEstado(entorno.tokens.recepcion, id, {
      status: 'CANCELADA',
      cancellationReason: 'El cliente se arrepintió',
    });

    expect(respuesta.status).toBe(200);
    esReciente(await leerFechas(id));
  });

  test('una transición rechazada no toca la fecha', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);
    await envejecer(id);

    // RECIBIDO → TERMINADO es un salto de secuencia no permitido.
    const respuesta = await cambiarEstado(entorno.tokens.recepcion, id, { status: 'TERMINADO' });

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    expect((await leerFechas(id)).estado).toBe(FECHA_ANTIGUA);
  });
});

describe('el alta de una orden inicia la fecha en su creación', () => {
  test('status_changed_at es la hora de creación', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);

    const fechas = await leerFechas(id);

    expect(Math.abs(fechas.segundosDesdeCreacion)).toBeLessThan(5);
    expect(Math.abs(fechas.segundosDesdeCambio)).toBeLessThan(10);
  });
});

describe('las demás ediciones NO modifican status_changed_at', () => {
  test('editar motivo, notas y kilometraje', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);
    await envejecer(id);

    const respuesta = await request(app)
      .put(`/api/orders/${id}`)
      .set('Authorization', `Bearer ${entorno.tokens.recepcion}`)
      .send({ reason: 'Ruido y vibración al frenar', notes: 'El cliente vuelve el lunes', mileageEntry: 40100 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.reason).toBe('Ruido y vibración al frenar');
    // La edición cambió el registro (updated_at), pero la fecha del último cambio de estado sigue igual.
    expect((await leerFechas(id)).estado).toBe(FECHA_ANTIGUA);
  });

  test('asignar y liberar mecánico', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);
    await envejecer(id);

    const asignacion = await request(app)
      .patch(`/api/orders/${id}/assignment`)
      .set('Authorization', `Bearer ${entorno.tokens.recepcion}`)
      .send({ mechanicId: entorno.mecanicoId });
    expect(asignacion.status).toBe(200);
    expect((await leerFechas(id)).estado).toBe(FECHA_ANTIGUA);

    const liberacion = await request(app)
      .patch(`/api/orders/${id}/assignment`)
      .set('Authorization', `Bearer ${entorno.tokens.recepcion}`)
      .send({ mechanicId: null });
    expect(liberacion.status).toBe(200);
    expect((await leerFechas(id)).estado).toBe(FECHA_ANTIGUA);
  });
});

describe('ninguna respuesta existente de órdenes expone la columna ni cambia de forma', () => {
  test('detalle, listado, edición y cambio de estado no incluyen status_changed_at', async () => {
    const entorno = await prepararEntorno();
    const id = await crearOrden(entorno);
    const auth = { Authorization: `Bearer ${entorno.tokens.admin}` };

    const respuestas = [
      await request(app).get(`/api/orders/${id}`).set(auth),
      await request(app).get('/api/orders').set(auth),
      await request(app).put(`/api/orders/${id}`).set(auth).send({ reason: 'Ruido', mileageEntry: 40000 }),
      await cambiarEstado(entorno.tokens.admin, id, { status: 'DIAGNOSTICO' }),
    ];

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(200);
      expect(JSON.stringify(respuesta.body)).not.toMatch(/status_?changed_?at/i);
    }
    // La forma de una orden sigue siendo la de siempre.
    const detalle = respuestas[0].body;
    expect(detalle).toMatchObject({ id, status: 'RECIBIDO', reason: 'Ruido al frenar' });
    expect(Object.keys(detalle)).toEqual(expect.arrayContaining(['id', 'status', 'mechanicId', 'updatedAt']));
  });
});
