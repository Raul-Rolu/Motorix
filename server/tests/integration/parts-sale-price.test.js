// 005-precio-venta-refacciones, T007 (US1): precio de venta en alta y
// edición de refacciones (FR-001, CA-1, CA-2; contracts/api-rest.md).
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

async function tokenAdmin() {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['admin', 'admin@motorix.local', hash, 'Administrador', 'ADMIN']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'admin', contrasena: 'Usuario123' });
  return login.body.token;
}

test('el alta con salePrice guarda el precio y lo devuelve en la consulta (CA-1)', async () => {
  const token = await tokenAdmin();

  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Filtro de aceite', code: 'FLT-010', stock: 5, salePrice: 85.5 });

  expect(alta.status).toBe(201);
  expect(alta.body.salePrice).toBe(85.5);

  const listado = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${token}`);
  const guardada = listado.body.datos.find((p) => p.id === alta.body.id);
  expect(guardada.salePrice).toBe(85.5);
});

test('el alta sin salePrice deja la refacción pendiente de precio (salePrice null)', async () => {
  const token = await tokenAdmin();

  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Batería 12V 60Ah', code: 'BAT-060', stock: 3 });

  expect(alta.status).toBe(201);
  expect(alta.body.salePrice).toBeNull();
});

test('la edición asigna, cambia y limpia el precio de venta', async () => {
  const token = await tokenAdmin();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Pastillas de freno', code: 'PAS-220', stock: 4 });

  const asignacion = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ salePrice: 90 });
  expect(asignacion.status).toBe(200);
  expect(asignacion.body.salePrice).toBe(90);

  const cambio = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ salePrice: 120.25 });
  expect(cambio.status).toBe(200);
  expect(cambio.body.salePrice).toBe(120.25);

  const limpieza = await request(app)
    .put(`/api/parts/${alta.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ salePrice: null });
  expect(limpieza.status).toBe(200);
  expect(limpieza.body.salePrice).toBeNull();
});

test('un salePrice negativo se rechaza con DATOS_INVALIDOS sin crear la refacción (CA-2)', async () => {
  const token = await tokenAdmin();

  const rechazo = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción mal precio', code: 'BAD-001', stock: 1, salePrice: -5 });

  expect(rechazo.status).toBe(400);
  expect(rechazo.body.error.codigo).toBe('DATOS_INVALIDOS');

  const listado = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${token}`);
  expect(listado.body.datos.find((p) => p.code === 'BAD-001')).toBeUndefined();
});
