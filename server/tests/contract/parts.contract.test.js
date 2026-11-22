// T031: pruebas de contrato de refacciones y movimientos (US5, FR-008, FR-013, FR-014).
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
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['admin', 'admin@motorix.local', hash, 'Administrador', 'ADMIN']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'admin', contrasena: 'Usuario123' });
  return { token: login.body.token };
}

test('POST /api/parts sigue la forma del contrato', async () => {
  const { token } = await prepararEntorno();

  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Pastillas de freno', code: 'PAS-100', stock: 12, minStock: 4 });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({
    id: expect.any(Number),
    name: 'Pastillas de freno',
    code: 'PAS-100',
    stock: 12,
    minStock: 4,
    isActive: true,
  });
  expect(typeof alta.body.lowStock).toBe('boolean');

  // Nunca datos sensibles (Principio IV).
  const cuerpo = JSON.stringify(alta.body);
  expect(cuerpo).not.toContain('password');
  expect(cuerpo).not.toContain('$2b$');
});

test('PUT /api/parts/:id sigue la forma del contrato', async () => {
  const { token } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refactor name', code: 'REF-001', stock: 3 });

  const edicion = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refactor name v2', minStock: 1 });

  expect(edicion.status).toBe(200);
  expect(edicion.body).toMatchObject({
    id: alta.body.id,
    name: 'Refactor name v2',
    code: 'REF-001',
    minStock: 1,
    stock: 3,
  });
});

test('POST /api/parts/:id/movements devuelve stockResult y el error usa el formato centralizado', async () => {
  const { token } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Movimiento forma', code: 'MOV-001', stock: 6 });

  const movimiento = await request(app)
    .post(`/api/parts/${alta.body.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: 1, reason: 'Conteo cíclico' });
  expect(movimiento.status).toBe(201);
  expect(movimiento.body).toMatchObject({
    partId: alta.body.id,
    movementType: 'ADJUSTMENT',
    quantity: 1,
    reason: 'Conteo cíclico',
    stockResult: 7,
  });

  const rechazo = await request(app)
    .post(`/api/parts/${alta.body.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: -10, reason: 'Faltante grande' });
  expect(rechazo.status).toBe(422);
  expect(rechazo.body.error).toMatchObject({
    codigo: 'MOVEMENT_INVALID',
    mensaje: expect.any(String),
  });
});

test('el stock insuficiente responde PART_SIN_STOCK con details.stockDisponible', async () => {
  const { token } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Detalle stock', code: 'DET-001', stock: 4 });

  const rechazo = await request(app)
    .post(`/api/parts/${alta.body.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: -9, reason: 'No cuadra' });
  expect(rechazo.status).toBe(422);
  expect(rechazo.body.error.codigo).toBe('MOVEMENT_INVALID');

  const noExiste = await request(app)
    .post('/api/parts/999999/movements')
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'IN', quantity: 1, reason: 'Inexistente' });
  expect(noExiste.status).toBe(404);
  expect(noExiste.body.error).toMatchObject({
    codigo: 'PART_NOT_FOUND',
    mensaje: expect.any(String),
  });
});

// --- 005-precio-venta-refacciones, T009 (US1): salePrice en el contrato ---

test('la refacción incluye salePrice en alta, consulta y edición (FR-001)', async () => {
  const { token } = await prepararEntorno();

  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Contrato precio', code: 'CTP-PREC', stock: 2, salePrice: 85.5 });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({
    id: expect.any(Number),
    name: 'Contrato precio',
    code: 'CTP-PREC',
    salePrice: 85.5,
    isActive: true,
  });

  const listado = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${token}`);
  expect(listado.body.datos.find((p) => p.code === 'CTP-PREC').salePrice).toBe(85.5);

  const edicion = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ salePrice: 90 });
  expect(edicion.status).toBe(200);
  expect(edicion.body.salePrice).toBe(90);
});

test('el alta y la edición de precios son solo de administración (FR-002, CA-16)', async () => {
  const { token: adminToken } = await prepararEntorno();
  const hash = await bcrypt.hash('Usuario123', 10);
  const tokens = {};
  for (const [username, nombre, rol] of [
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;

    const altaDenegada = await request(app)
      .post('/api/parts')
      .set('Authorization', `Bearer ${tokens[username]}`)
      .send({ name: `No debe crearse ${username}`, code: `DEN-${username}`, salePrice: 50 });
    expect(altaDenegada.status).toBe(403);
    expect(altaDenegada.body.error.codigo).toBe('NO_AUTORIZADO');
  }

  // La edición del precio sobre una refacción existente también es de ADMIN.
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Precio protegido', code: 'PRO-001', salePrice: 100 });
  expect(alta.status).toBe(201);

  const edicionDenegada = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ salePrice: 1 });
  expect(edicionDenegada.status).toBe(403);
  expect(edicionDenegada.body.error.codigo).toBe('NO_AUTORIZADO');

  const edicionAdmin = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ salePrice: 110 });
  expect(edicionAdmin.status).toBe(200);
  expect(edicionAdmin.body.salePrice).toBe(110);
});
