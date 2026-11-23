// 008-configuracion-seguridad-reportes, T031 (bloque P1, US3; FR-006, FR-007,
// CA-4): catálogo de tipos de servicio con intervalo en días y/o km. Se crea,
// edita y desactiva (nunca se borra); los tres roles consultan los activos; las
// líneas de servicio de una orden pueden llevar un tipo activo (opcional) y las
// líneas sin tipo no cambian de forma. Corre contra `motorix_test`.
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

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  const ids = {};
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico', 'MECHANIC'],
  ]) {
    const [usuario] = await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
    ids[username] = usuario.insertId;
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  return { tokens, ids };
}

/** Orden en DIAGNOSTICO (admite partidas) asignada al mecánico. */
async function crearOrden(mecanicoId, placas = 'TIP-001-A') {
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', [
    'Cliente Tipos',
    '5550001111',
  ]);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, placas, 'Nissan', 'Versa', 2020]
  );
  const [orden] = await getPool().query(
    `INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason)
     VALUES (?, ?, ?, 'DIAGNOSTICO', 50000, 'Prueba de tipos')`,
    [cliente.insertId, vehiculo.insertId, mecanicoId]
  );
  return orden.insertId;
}

const con = (token) => ({ Authorization: `Bearer ${token}` });
const crearTipo = (token, cuerpo) => request(app).post('/api/service-types').set(con(token)).send(cuerpo);
const listar = (token, consulta = '') =>
  request(app).get(`/api/service-types${consulta}`).set(con(token));

const ACEITE = { nombre: 'Cambio de aceite', intervaloDias: 180, intervaloKm: 5000 };

describe('alta, edición y consulta', () => {
  test('el administrador crea un tipo con días y km y queda activo', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await crearTipo(tokens.admin, ACEITE);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ ...ACEITE, activo: true });
    expect(respuesta.body.id).toEqual(expect.any(Number));
  });

  test('se aceptan tipos con solo días o solo km', async () => {
    const { tokens } = await prepararEntorno();

    const dias = await crearTipo(tokens.admin, { nombre: 'Revisión de frenos', intervaloDias: 180 });
    const km = await crearTipo(tokens.admin, { nombre: 'Rotación de neumáticos', intervaloKm: 10000 });

    expect(dias.status).toBe(201);
    expect(dias.body.intervaloKm).toBeNull();
    expect(km.status).toBe(201);
    expect(km.body.intervaloDias).toBeNull();
  });

  test('un nombre repetido, sin distinguir mayúsculas, responde 409 SERVICE_TYPE_DUPLICATE', async () => {
    const { tokens } = await prepararEntorno();
    await crearTipo(tokens.admin, ACEITE);

    const repetido = await crearTipo(tokens.admin, { ...ACEITE, nombre: 'CAMBIO DE ACEITE' });

    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe('SERVICE_TYPE_DUPLICATE');
  });

  test.each([
    ['sin ningún intervalo', { nombre: 'Sin intervalos' }],
    ['intervalos nulos', { nombre: 'Nulos', intervaloDias: null, intervaloKm: null }],
    ['nombre vacío', { nombre: '  ', intervaloDias: 30 }],
    ['nombre de más de 80 caracteres', { nombre: 'a'.repeat(81), intervaloDias: 30 }],
    ['días en cero', { nombre: 'Cero', intervaloDias: 0 }],
    ['días negativos', { nombre: 'Negativo', intervaloDias: -5 }],
    ['días mayores a 3,650', { nombre: 'Muchos días', intervaloDias: 3651 }],
    ['km mayores a 500,000', { nombre: 'Muchos km', intervaloKm: 500001 }],
    ['días decimales', { nombre: 'Decimal', intervaloDias: 2.5 }],
    ['km en texto', { nombre: 'Texto', intervaloKm: '5000' }],
  ])('%s → 400 DATOS_INVALIDOS y no se guarda', async (_nombre, cuerpo) => {
    const { tokens } = await prepararEntorno();

    const respuesta = await crearTipo(tokens.admin, cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM service_types');
    expect(Number(total)).toBe(0);
  });

  test('PUT edita el tipo; un tipo inexistente responde 404 SERVICE_TYPE_NOT_FOUND', async () => {
    const { tokens } = await prepararEntorno();
    const creado = await crearTipo(tokens.admin, ACEITE);

    const edicion = await request(app)
      .put(`/api/service-types/${creado.body.id}`)
      .set(con(tokens.admin))
      .send({ nombre: 'Cambio de aceite sintético', intervaloDias: 120, intervaloKm: 7500 });
    const inexistente = await request(app)
      .put('/api/service-types/999999')
      .set(con(tokens.admin))
      .send(ACEITE);

    expect(edicion.status).toBe(200);
    expect(edicion.body).toMatchObject({ nombre: 'Cambio de aceite sintético', intervaloDias: 120, intervaloKm: 7500 });
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.codigo).toBe('SERVICE_TYPE_NOT_FOUND');
  });

  test('editar a un nombre que ya tiene otro tipo responde 409; conservar el propio nombre es válido', async () => {
    const { tokens } = await prepararEntorno();
    const uno = await crearTipo(tokens.admin, ACEITE);
    const dos = await crearTipo(tokens.admin, { nombre: 'Afinación', intervaloDias: 365 });

    const choque = await request(app)
      .put(`/api/service-types/${dos.body.id}`)
      .set(con(tokens.admin))
      .send({ nombre: 'cambio de aceite', intervaloDias: 365 });
    const propio = await request(app)
      .put(`/api/service-types/${uno.body.id}`)
      .set(con(tokens.admin))
      .send({ ...ACEITE, intervaloDias: 150 });

    expect(choque.status).toBe(409);
    expect(choque.body.error.codigo).toBe('SERVICE_TYPE_DUPLICATE');
    expect(propio.status).toBe(200);
  });
});

describe('desactivación y consulta por rol', () => {
  test('desactivar y reactivar con PATCH; el tipo no se borra y no existe DELETE', async () => {
    const { tokens } = await prepararEntorno();
    const creado = await crearTipo(tokens.admin, ACEITE);

    const baja = await request(app)
      .patch(`/api/service-types/${creado.body.id}/status`)
      .set(con(tokens.admin))
      .send({ activo: false });
    const borrado = await request(app).delete(`/api/service-types/${creado.body.id}`).set(con(tokens.admin));

    expect(baja.status).toBe(200);
    expect(baja.body.activo).toBe(false);
    expect(borrado.status).toBe(404);
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM service_types');
    expect(Number(total)).toBe(1);

    const alta = await request(app)
      .patch(`/api/service-types/${creado.body.id}/status`)
      .set(con(tokens.admin))
      .send({ activo: true });
    expect(alta.body.activo).toBe(true);
  });

  test('PATCH con un valor que no es booleano responde 400', async () => {
    const { tokens } = await prepararEntorno();
    const creado = await crearTipo(tokens.admin, ACEITE);

    const respuesta = await request(app)
      .patch(`/api/service-types/${creado.body.id}/status`)
      .set(con(tokens.admin))
      .send({ activo: 'no' });

    expect(respuesta.status).toBe(400);
  });

  test('GET devuelve solo los activos por omisión, ordenados por nombre, a los tres roles', async () => {
    const { tokens } = await prepararEntorno();
    await crearTipo(tokens.admin, { nombre: 'Zeta', intervaloDias: 10 });
    const inactivo = await crearTipo(tokens.admin, { nombre: 'Inactivo', intervaloDias: 10 });
    await crearTipo(tokens.admin, { nombre: 'Alfa', intervaloKm: 1000 });
    await request(app)
      .patch(`/api/service-types/${inactivo.body.id}/status`)
      .set(con(tokens.admin))
      .send({ activo: false });

    for (const rol of ['admin', 'recepcion', 'mecanico']) {
      const respuesta = await listar(tokens[rol]);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.datos.map((t) => t.nombre)).toEqual(['Alfa', 'Zeta']);
    }
  });

  test('con ?incluirInactivos=true el administrador ve también los inactivos', async () => {
    const { tokens } = await prepararEntorno();
    const inactivo = await crearTipo(tokens.admin, { nombre: 'Inactivo', intervaloDias: 10 });
    await request(app)
      .patch(`/api/service-types/${inactivo.body.id}/status`)
      .set(con(tokens.admin))
      .send({ activo: false });

    const respuesta = await listar(tokens.admin, '?incluirInactivos=true');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos.map((t) => t.nombre)).toEqual(['Inactivo']);
    expect(respuesta.body.datos[0].activo).toBe(false);
  });
});

describe('líneas de servicio con tipo (FR-007)', () => {
  const agregarServicio = (token, ordenId, extra = {}) =>
    request(app)
      .post(`/api/orders/${ordenId}/services`)
      .set(con(token))
      .send({ description: 'Cambio de aceite', amount: 650, kind: 'SERVICE', ...extra });

  test('una línea de servicio guarda un tipo activo y el detalle de la orden lo expone', async () => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);
    const tipo = await crearTipo(tokens.admin, ACEITE);

    const linea = await agregarServicio(tokens.admin, ordenId, { serviceTypeId: tipo.body.id });

    expect(linea.status).toBe(201);
    expect(linea.body.serviceTypeId).toBe(tipo.body.id);
    const detalle = await request(app).get(`/api/orders/${ordenId}`).set(con(tokens.admin));
    expect(detalle.body.services[0].serviceTypeId).toBe(tipo.body.id);
  });

  test('el mecánico asignado también puede elegir un tipo activo en su orden', async () => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);
    const tipo = await crearTipo(tokens.admin, ACEITE);

    const linea = await agregarServicio(tokens.mecanico, ordenId, { serviceTypeId: tipo.body.id });

    expect(linea.status).toBe(201);
    expect(linea.body.serviceTypeId).toBe(tipo.body.id);
  });

  test('las líneas sin tipo NO incluyen serviceTypeId (respuestas existentes sin cambios)', async () => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);

    const linea = await agregarServicio(tokens.admin, ordenId);

    expect(linea.status).toBe(201);
    expect(linea.body).not.toHaveProperty('serviceTypeId');
    const detalle = await request(app).get(`/api/orders/${ordenId}`).set(con(tokens.admin));
    expect(detalle.body.services[0]).not.toHaveProperty('serviceTypeId');
  });

  test('un tipo inexistente responde 404 SERVICE_TYPE_NOT_FOUND y no agrega la línea', async () => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);

    const linea = await agregarServicio(tokens.admin, ordenId, { serviceTypeId: 999999 });

    expect(linea.status).toBe(404);
    expect(linea.body.error.codigo).toBe('SERVICE_TYPE_NOT_FOUND');
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM order_services');
    expect(Number(total)).toBe(0);
  });

  test('un tipo inactivo responde 409 SERVICE_TYPE_INACTIVE', async () => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);
    const tipo = await crearTipo(tokens.admin, ACEITE);
    await request(app)
      .patch(`/api/service-types/${tipo.body.id}/status`)
      .set(con(tokens.admin))
      .send({ activo: false });

    const linea = await agregarServicio(tokens.admin, ordenId, { serviceTypeId: tipo.body.id });

    expect(linea.status).toBe(409);
    expect(linea.body.error.codigo).toBe('SERVICE_TYPE_INACTIVE');
  });

  test('un tipo en una línea de mano de obra se rechaza con 400', async () => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);
    const tipo = await crearTipo(tokens.admin, ACEITE);

    const linea = await agregarServicio(tokens.admin, ordenId, { kind: 'LABOR', serviceTypeId: tipo.body.id });

    expect(linea.status).toBe(400);
    expect(linea.body.error.codigo).toBe('DATOS_INVALIDOS');
  });

  test.each([['abc'], [0], [-1], [1.5]])('un serviceTypeId inválido (%p) responde 400', async (valor) => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);

    const linea = await agregarServicio(tokens.admin, ordenId, { serviceTypeId: valor });

    expect(linea.status).toBe(400);
  });

  test('desactivar un tipo usado conserva el tipo en las líneas existentes', async () => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);
    const tipo = await crearTipo(tokens.admin, ACEITE);
    await agregarServicio(tokens.admin, ordenId, { serviceTypeId: tipo.body.id });

    await request(app)
      .patch(`/api/service-types/${tipo.body.id}/status`)
      .set(con(tokens.admin))
      .send({ activo: false });

    const detalle = await request(app).get(`/api/orders/${ordenId}`).set(con(tokens.admin));
    expect(detalle.body.services[0].serviceTypeId).toBe(tipo.body.id);
    const [[fila]] = await getPool().query('SELECT service_type_id FROM order_services WHERE order_id = ?', [ordenId]);
    expect(fila.service_type_id).toBe(tipo.body.id);
  });

  test('editar un tipo no altera las líneas ya registradas', async () => {
    const { tokens, ids } = await prepararEntorno();
    const ordenId = await crearOrden(ids.mecanico);
    const tipo = await crearTipo(tokens.admin, ACEITE);
    await agregarServicio(tokens.admin, ordenId, { serviceTypeId: tipo.body.id });

    await request(app)
      .put(`/api/service-types/${tipo.body.id}`)
      .set(con(tokens.admin))
      .send({ nombre: 'Otro nombre', intervaloDias: 30 });

    const [[fila]] = await getPool().query(
      'SELECT description, amount, service_type_id FROM order_services WHERE order_id = ?',
      [ordenId]
    );
    expect(fila).toMatchObject({ description: 'Cambio de aceite', service_type_id: tipo.body.id });
    expect(Number(fila.amount)).toBe(650);
  });
});
