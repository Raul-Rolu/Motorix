// T029: pruebas de integración de refacciones (US5, FR-008, FR-010, FR-013).
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
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }
  return tokens;
}

test('el alta con stock inicial crea la refacción y registra el movimiento IN', async () => {
  const tokens = await prepararEntorno();

  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      name: 'Filtro de aceite',
      code: 'FLT-001',
      stock: 10,
      minStock: 3,
    });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({
    name: 'Filtro de aceite',
    code: 'FLT-001',
    stock: 10,
    minStock: 3,
    isActive: true,
  });

  // El stock inicial queda documentado como movimiento IN (FR-009, SC-004).
  const [[movimiento]] = await getPool().query(
    'SELECT movement_type, quantity, reason FROM inventory_movements WHERE part_id = ?',
    [alta.body.id]
  );
  expect(movimiento).toMatchObject({
    movement_type: 'IN',
    quantity: 10,
    reason: 'Stock inicial',
  });
});

test('un código duplicado se rechaza con PART_DUPLICATE (409)', async () => {
  const tokens = await prepararEntorno();
  await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Bujía', code: 'BUJ-001', stock: 5 });

  const duplicada = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Bujía dos', code: 'BUJ-001', stock: 2 });

  expect(duplicada.status).toBe(409);
  expect(duplicada.body.error.codigo).toBe('PART_DUPLICATE');
});

test('la edición cambia nombre, mínimo y estado pero nunca el stock directamente', async () => {
  const tokens = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Aceite 20W50', code: 'ACE-020', stock: 8, minStock: 2 });

  const edicion = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Aceite sintético 5W30', code: 'ACE-053', minStock: 4 });

  expect(edicion.status).toBe(200);
  expect(edicion.body).toMatchObject({
    name: 'Aceite sintético 5W30',
    code: 'ACE-053',
    minStock: 4,
    stock: 8, // el stock solo cambia vía movimientos (FR-013)
    isActive: true,
  });
});

test('la inactivación es baja lógica: la refacción sigue consultable y conserva su stock', async () => {
  const tokens = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Freno viejo', code: 'FRN-009', stock: 1 });

  const inactiva = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ isActive: false });

  expect(inactiva.status).toBe(200);
  expect(inactiva.body.isActive).toBe(false);
  expect(inactiva.body.stock).toBe(1);

  const listado = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(listado.body.datos.map((p) => p.code)).toContain('FRN-009');
});

test('una refacción inexistente responde PART_NOT_FOUND (404)', async () => {
  const tokens = await prepararEntorno();

  const respuesta = await request(app)
    .put('/api/parts/999999')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'No existe', code: 'NEX-001' });

  expect(respuesta.status).toBe(404);
  expect(respuesta.body.error.codigo).toBe('PART_NOT_FOUND');
});

test('los endpoints de refacciones son solo de administración (RN-15)', async () => {
  const tokens = await prepararEntorno();

  const recepcionIntenta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ name: 'No debería', code: 'NAD-001', stock: 1 });

  expect(recepcionIntenta.status).toBe(403);
});
