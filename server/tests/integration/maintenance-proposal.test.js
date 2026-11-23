// 008-configuracion-seguridad-reportes, T033 (bloque P1, US3; FR-008, CA-5,
// CA-10): `GET /api/maintenances/proposal?orderId=` propone la fecha y el
// kilometraje del próximo mantenimiento a partir de las líneas de servicio con
// tipo e intervalo de una orden (fecha de hoy + el menor intervalo en días;
// kilometraje de entrada de la orden + el menor intervalo en km). No crea nada:
// el usuario corrige y guarda con el alta de mantenimientos de siempre.
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

/** Fecha local `YYYY-MM-DD` a N días de hoy, igual que `hoyLocal()`. */
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
  const ids = {};
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico', 'MECHANIC'],
    ['mecanico2', 'Otro Mecánico', 'MECHANIC'],
  ]) {
    const [usuario] = await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
    ids[username] = usuario.insertId;
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico', 'mecanico2']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  return { tokens, ids };
}

let consecutivoDePlacas = 0;

async function crearOrden(mecanicoId, kilometraje = 50000) {
  consecutivoDePlacas += 1;
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', [
    'Cliente Propuesta',
    '5550001111',
  ]);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, `PRO-${String(consecutivoDePlacas).padStart(3, '0')}-A`, 'Nissan', 'Versa', 2020]
  );
  const [orden] = await getPool().query(
    `INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason)
     VALUES (?, ?, ?, 'TERMINADO', ?, 'Prueba de propuesta')`,
    [cliente.insertId, vehiculo.insertId, mecanicoId, kilometraje]
  );
  return { ordenId: orden.insertId, vehiculoId: vehiculo.insertId };
}

async function crearTipo(nombre, dias, km) {
  const [tipo] = await getPool().query(
    'INSERT INTO service_types (name, interval_days, interval_km) VALUES (?, ?, ?)',
    [nombre, dias, km]
  );
  return tipo.insertId;
}

async function agregarLinea(ordenId, tipoId, descripcion = 'Servicio') {
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount, service_type_id) VALUES (?, ?, 100, ?)',
    [ordenId, descripcion, tipoId]
  );
}

const proponer = (token, consulta) =>
  request(app).get(`/api/maintenances/proposal${consulta}`).set('Authorization', `Bearer ${token}`);

const totalMantenimientos = async () => {
  const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM maintenance_plans');
  return Number(total);
};

test('propone fecha (hoy + días) y kilometraje (entrada + km) del tipo de la orden', async () => {
  const { tokens, ids } = await prepararEntorno();
  const { ordenId } = await crearOrden(ids.mecanico, 50000);
  await agregarLinea(ordenId, await crearTipo('Cambio de aceite', 180, 5000));

  const respuesta = await proponer(tokens.admin, `?orderId=${ordenId}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body).toEqual({
    orderId: ordenId,
    propuesta: { fecha: fechaLocal(180), kilometraje: 55000, servicio: 'Cambio de aceite' },
  });
});

test('un tipo solo con días propone solo fecha y uno solo con km propone solo kilometraje', async () => {
  const { tokens, ids } = await prepararEntorno();
  const { ordenId: soloDias } = await crearOrden(ids.mecanico);
  await agregarLinea(soloDias, await crearTipo('Revisión de frenos', 90, null));
  const { ordenId: soloKm } = await crearOrden(ids.mecanico, 70000);
  await agregarLinea(soloKm, await crearTipo('Rotación de neumáticos', null, 10000));

  const dias = await proponer(tokens.admin, `?orderId=${soloDias}`);
  const km = await proponer(tokens.admin, `?orderId=${soloKm}`);

  expect(dias.body.propuesta).toEqual({ fecha: fechaLocal(90), kilometraje: null, servicio: 'Revisión de frenos' });
  expect(km.body.propuesta).toEqual({ fecha: null, kilometraje: 80000, servicio: 'Rotación de neumáticos' });
});

test('con varios tipos toma el menor intervalo de cada dimensión y nombra el de menor intervalo en días', async () => {
  const { tokens, ids } = await prepararEntorno();
  const { ordenId } = await crearOrden(ids.mecanico, 1000);
  await agregarLinea(ordenId, await crearTipo('Afinación', 365, 10000));
  await agregarLinea(ordenId, await crearTipo('Revisión de frenos', 90, 20000));
  await agregarLinea(ordenId, await crearTipo('Rotación de neumáticos', null, 5000));

  const respuesta = await proponer(tokens.admin, `?orderId=${ordenId}`);

  expect(respuesta.body.propuesta).toEqual({
    fecha: fechaLocal(90),
    kilometraje: 6000,
    servicio: 'Revisión de frenos',
  });
});

test('un tipo ya desactivado sigue proponiendo (es el tipo de la línea)', async () => {
  const { tokens, ids } = await prepararEntorno();
  const { ordenId } = await crearOrden(ids.mecanico);
  const tipoId = await crearTipo('Cambio de aceite', 180, 5000);
  await agregarLinea(ordenId, tipoId);
  await getPool().query('UPDATE service_types SET active = 0 WHERE id = ?', [tipoId]);

  const respuesta = await proponer(tokens.admin, `?orderId=${ordenId}`);

  expect(respuesta.body.propuesta).not.toBeNull();
});

test('una orden sin tipos (líneas sin tipo o sin líneas) responde propuesta null', async () => {
  const { tokens, ids } = await prepararEntorno();
  const { ordenId } = await crearOrden(ids.mecanico);
  await getPool().query(
    "INSERT INTO order_services (order_id, description, amount) VALUES (?, 'Servicio heredado', 100)",
    [ordenId]
  );

  const respuesta = await proponer(tokens.admin, `?orderId=${ordenId}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body).toEqual({ orderId: ordenId, propuesta: null });
});

test('no crea ningún mantenimiento', async () => {
  const { tokens, ids } = await prepararEntorno();
  const { ordenId } = await crearOrden(ids.mecanico);
  await agregarLinea(ordenId, await crearTipo('Cambio de aceite', 180, 5000));

  await proponer(tokens.admin, `?orderId=${ordenId}`);

  expect(await totalMantenimientos()).toBe(0);
});

describe('validación y permisos', () => {
  test('orderId ausente o no numérico responde 400 DATOS_INVALIDOS', async () => {
    const { tokens } = await prepararEntorno();

    for (const consulta of ['', '?orderId=', '?orderId=abc', '?orderId=0', '?orderId=1.5']) {
      const respuesta = await proponer(tokens.admin, consulta);
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    }
  });

  test('una orden inexistente responde 404 ORDEN_NO_ENCONTRADA', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await proponer(tokens.admin, '?orderId=999999');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('ORDEN_NO_ENCONTRADA');
  });

  test('el mecánico asignado puede proponer desde su orden', async () => {
    const { tokens, ids } = await prepararEntorno();
    const { ordenId } = await crearOrden(ids.mecanico);
    await agregarLinea(ordenId, await crearTipo('Cambio de aceite', 180, 5000));

    const respuesta = await proponer(tokens.mecanico, `?orderId=${ordenId}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.propuesta.servicio).toBe('Cambio de aceite');
  });

  test('otro mecánico recibe 403 FORBIDDEN_ORDER', async () => {
    const { tokens, ids } = await prepararEntorno();
    const { ordenId } = await crearOrden(ids.mecanico);

    const respuesta = await proponer(tokens.mecanico2, `?orderId=${ordenId}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.codigo).toBe('FORBIDDEN_ORDER');
  });

  test('la recepción recibe 403 NO_AUTORIZADO y sin token es 401', async () => {
    const { tokens, ids } = await prepararEntorno();
    const { ordenId } = await crearOrden(ids.mecanico);

    const recepcion = await proponer(tokens.recepcion, `?orderId=${ordenId}`);
    const anonimo = await request(app).get(`/api/maintenances/proposal?orderId=${ordenId}`);

    expect(recepcion.status).toBe(403);
    expect(recepcion.body.error.codigo).toBe('NO_AUTORIZADO');
    expect(anonimo.status).toBe(401);
  });
});

describe('la ruta no interfiere con las existentes', () => {
  test('GET /api/maintenances y el alta siguen funcionando y el alta no requiere la propuesta', async () => {
    const { tokens, ids } = await prepararEntorno();
    const { vehiculoId } = await crearOrden(ids.mecanico);

    const alta = await request(app)
      .post('/api/maintenances')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ vehicleId: vehiculoId, descripcion: 'Cambio de aceite', targetDate: fechaLocal(180) });
    const lista = await request(app).get('/api/maintenances').set('Authorization', `Bearer ${tokens.admin}`);

    expect(alta.status).toBe(201);
    expect(lista.status).toBe(200);
    expect(lista.body.datos).toHaveLength(1);
  });
});
