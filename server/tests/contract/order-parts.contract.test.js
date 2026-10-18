// T044: pruebas de contrato de refacciones en orden (US7; POST/DELETE y bloque en GET).
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
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'mecanico']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );
  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ fullName: 'Contrato Refacciones', phone: '5500112233' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'cr-001-a',
      brand: 'Hyundai',
      model: 'Accent',
      year: 2020,
    });
  const parte = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Contrato parte', code: 'CTP-001', stock: 20, minStock: 2 });
  // Preparación (005-precio-venta-refacciones): registrar un precio de
  // venta antes de usar la refacción en una orden; ninguna aserción cambia.
  await getPool().query('UPDATE parts SET sale_price = ? WHERE id = ?', [
    250.0,
    parte.body.id,
  ]);

  return {
    tokens,
    mecanicoId: mecanico.id,
    vehiculoId: vehiculo.body.id,
    parteId: parte.body.id,
  };
}

test('POST /api/orders/:id/parts y DELETE siguen la forma del contrato', async () => {
  const entorno = await prepararEntorno();
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${entorno.tokens.admin}`)
    .send({
      vehicleId: entorno.vehiculoId,
      mechanicId: entorno.mecanicoId,
      mileageEntry: 50000,
      reason: 'Cambio de refacción',
    });

  const alta = await request(app)
    .post(`/api/orders/${orden.body.id}/parts`)
    .set('Authorization', `Bearer ${entorno.tokens.mecanico}`)
    .send({ partId: entorno.parteId, quantity: 2 });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({
    id: expect.any(Number),
    partId: entorno.parteId,
    quantity: 2,
    stockResult: 18,
  });

  // El detalle de la orden incluye el bloque refacciones (contrato).
  const detalle = await request(app)
    .get(`/api/orders/${orden.body.id}`)
    .set('Authorization', `Bearer ${entorno.tokens.mecanico}`);
  expect(detalle.status).toBe(200);
  expect(Array.isArray(detalle.body.refacciones)).toBe(true);
  expect(detalle.body.refacciones[0]).toMatchObject({
    id: alta.body.id,
    partId: entorno.parteId,
    nombre: 'Contrato parte',
    code: 'CTP-001',
    quantity: 2,
  });

  const retiro = await request(app)
    .delete(`/api/orders/${orden.body.id}/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${entorno.tokens.mecanico}`);
  expect(retiro.status).toBe(204);
  expect(retiro.body).toEqual({});
});

test('los errores de refacciones en orden usan el formato centralizado', async () => {
  const entorno = await prepararEntorno();
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${entorno.tokens.admin}`)
    .send({
      vehicleId: entorno.vehiculoId,
      mechanicId: entorno.mecanicoId,
      mileageEntry: 60000,
      reason: 'Orden para errores',
    });

  const sinStock = await request(app)
    .post(`/api/orders/${orden.body.id}/parts`)
    .set('Authorization', `Bearer ${entorno.tokens.mecanico}`)
    .send({ partId: entorno.parteId, quantity: 999 });
  expect(sinStock.status).toBe(409);
  expect(sinStock.body.error).toMatchObject({
    codigo: 'PART_SIN_STOCK',
    mensaje: expect.any(String),
    details: { stockDisponible: 20 },
  });

  const parteInexistente = await request(app)
    .post(`/api/orders/${orden.body.id}/parts`)
    .set('Authorization', `Bearer ${entorno.tokens.mecanico}`)
    .send({ partId: 999999, quantity: 1 });
  expect(parteInexistente.status).toBe(404);
  expect(parteInexistente.body.error.codigo).toBe('PART_NOT_FOUND');

  const payloadInvalido = await request(app)
    .post(`/api/orders/${orden.body.id}/parts`)
    .set('Authorization', `Bearer ${entorno.tokens.mecanico}`)
    .send({ partId: entorno.parteId, quantity: 0 });
  expect(payloadInvalido.status).toBe(400);
  expect(payloadInvalido.body.error.codigo).toBe('DATOS_INVALIDOS');
});
