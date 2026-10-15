// T052: pruebas de integración de la lista de próximos mantenimientos (US4, FR-007, Q5, SC-003).
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

function fechaFutura(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  // Fecha local (no UTC): la API y los cálculos de vencimiento usan el día local.
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

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

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ fullName: 'Lista Mantenimientos', phone: '5522334455' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'lm-001-a',
      brand: 'Volkswagen',
      model: 'Gol',
      year: 2018,
    });

  // El kilometraje actual del vehículo se deriva de las órdenes (RN-3).
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      vehicleId: vehiculo.body.id,
      mileageEntry: 80000,
      reason: 'Servicio que fija el kilometraje',
    });
  await getPool().query("UPDATE service_orders SET status = 'TERMINADO' WHERE id = ?", [
    orden.body.id,
  ]);

  return { tokens, vehiculoId: vehiculo.body.id };
}

async function crearMantenimiento(token, vehiculoId, descripcion, umbrales) {
  const respuesta = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, descripcion, ...umbrales });
  return respuesta.body;
}

test('los vencidos aparecen primero y los pendientes por proximidad del umbral (Q5)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const lejano = await crearMantenimiento(tokens.admin, vehiculoId, 'Mantenimiento lejano', {
    targetDate: fechaFutura(300),
  });
  const cercano = await crearMantenimiento(tokens.admin, vehiculoId, 'Mantenimiento cercano', {
    targetDate: fechaFutura(10),
  });
  // Vencido por kilometraje: objetivo por debajo del actual (80000).
  const vencido = await crearMantenimiento(tokens.admin, vehiculoId, 'Mantenimiento vencido km', {
    targetMileage: 75000,
  });

  const listado = await request(app)
    .get('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.recepcion}`);

  expect(listado.status).toBe(200);
  const ids = listado.body.datos.map((m) => m.id);
  expect(ids).toEqual([vencido.id, cercano.id, lejano.id]);

  expect(listado.body.datos[0]).toMatchObject({
    isOverdue: true,
    kmLeft: -5000,
  });
  expect(listado.body.datos[1].isOverdue).toBe(false);
  expect(listado.body.datos[1].daysLeft).toBeLessThanOrEqual(10);
});

test('los vencidos por fecha también encabezan la lista', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const futuro = await crearMantenimiento(tokens.admin, vehiculoId, 'Futuro', {
    targetDate: fechaFutura(90),
  });
  const vencidoFecha = await crearMantenimiento(tokens.admin, vehiculoId, 'Vencido por fecha', {
    targetDate: fechaFutura(5),
  });
  // Se coloca la fecha en el pasado directamente (la API exige fecha >= hoy).
  await getPool().query('UPDATE maintenance_plans SET target_date = ? WHERE id = ?', [
    fechaFutura(-10),
    vencidoFecha.id,
  ]);

  const listado = await request(app)
    .get('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.admin}`);

  expect(listado.status).toBe(200);
  expect(listado.body.datos.map((m) => m.id)).toEqual([vencidoFecha.id, futuro.id]);
  expect(listado.body.datos[0].isOverdue).toBe(true);
  expect(listado.body.datos[0].daysLeft).toBeLessThan(0);
});

test('los cancelados no aparecen por defecto y el filtro status los consulta', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const cancelado = await crearMantenimiento(tokens.admin, vehiculoId, 'Se cancela', {
    targetDate: fechaFutura(20),
  });
  await request(app)
    .patch(`/api/maintenances/${cancelado.id}/cancel`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ reason: 'Ya no aplica' });
  const vigente = await crearMantenimiento(tokens.admin, vehiculoId, 'Vigente', {
    targetDate: fechaFutura(20),
  });

  const porDefecto = await request(app)
    .get('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(porDefecto.body.datos.map((m) => m.id)).toEqual([vigente.id]);

  const soloCancelados = await request(app)
    .get('/api/maintenances?status=CANCELLED')
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(soloCancelados.body.datos.map((m) => m.id)).toEqual([cancelado.id]);
});

test('el filtro vehicleId limita la lista a un vehículo', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ fullName: 'Segundo vehículo', phone: '5566778899' });
  const otroVehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'lm-002-a',
      brand: 'Nissan',
      model: 'March',
      year: 2021,
    });

  const delPrimero = await crearMantenimiento(tokens.admin, vehiculoId, 'Del primero', {
    targetDate: fechaFutura(30),
  });
  const delSegundo = await crearMantenimiento(tokens.admin, otroVehiculo.body.id, 'Del segundo', {
    targetDate: fechaFutura(30),
  });

  const filtrado = await request(app)
    .get(`/api/maintenances?vehicleId=${vehiculoId}`)
    .set('Authorization', `Bearer ${tokens.recepcion}`);

  expect(filtrado.status).toBe(200);
  expect(filtrado.body.datos.map((m) => m.id)).toEqual([delPrimero.id]);
  expect(filtrado.body.datos.map((m) => m.id)).not.toContain(delSegundo.id);
});

test('el listado incluye los datos de cliente y vehículo para el aviso (FR-007)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  await crearMantenimiento(tokens.admin, vehiculoId, 'Con datos de contacto', {
    targetDate: fechaFutura(15),
  });

  const listado = await request(app)
    .get('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.recepcion}`);

  expect(listado.status).toBe(200);
  const mantenimiento = listado.body.datos[0];
  expect(mantenimiento.vehiculo).toMatchObject({
    id: vehiculoId,
    placas: 'LM-001-A',
    marca: 'Volkswagen',
    modelo: 'Gol',
  });
  expect(mantenimiento.cliente).toMatchObject({
    nombreCompleto: 'Lista Mantenimientos',
    telefono: '5522334455',
  });
});

test('el listado es solo de recepción y administración (RN-15)', async () => {
  const { tokens } = await prepararEntorno();

  const mecanicoIntenta = await request(app)
    .get('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`);

  expect(mecanicoIntenta.status).toBe(403);
});
