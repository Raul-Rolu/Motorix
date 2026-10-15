// T060: pruebas de integración de alerta de stock bajo (US8, FR-015, CA-7, SC-005).
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

async function buscarPorCodigo(token, code) {
  const listado = await request(app)
    .get(`/api/parts?q=${code}`)
    .set('Authorization', `Bearer ${token}`);
  return listado.body.datos.find((p) => p.code === code);
}

test('stock por encima del mínimo no genera la alerta', async () => {
  const { token } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción sana', code: 'SANA-001', stock: 10, minStock: 3 });

  expect(alta.body.lowStock).toBe(false);
  expect((await buscarPorCodigo(token, 'SANA-001')).lowStock).toBe(false);
});

test('llevar el stock hasta el mínimo activa la alerta en la siguiente consulta', async () => {
  const { token } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción ajustable', code: 'AJU-001', stock: 10, minStock: 4 });

  // Ajuste de conteo que deja el stock exactamente en el mínimo.
  const ajuste = await request(app)
    .post(`/api/parts/${alta.body.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: -6, reason: 'Conteo cíclico' });
  expect(ajuste.body.stockResult).toBe(4);

  const consulta = await buscarPorCodigo(token, 'AJU-001');
  expect(consulta.stock).toBe(4);
  expect(consulta.lowStock).toBe(true); // stock <= mínimo (FR-015)
});

test('una salida que cruza el mínimo refleja la alerta en la siguiente consulta', async () => {
  const { token } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción crítico', code: 'CRI-001', stock: 6, minStock: 2 });

  expect((await buscarPorCodigo(token, 'CRI-001')).lowStock).toBe(false);

  const ajuste = await request(app)
    .post(`/api/parts/${alta.body.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: -5, reason: 'Faltante de conteo' });
  expect(ajuste.body.stockResult).toBe(1);

  const consulta = await buscarPorCodigo(token, 'CRI-001');
  expect(consulta.stock).toBe(1);
  expect(consulta.lowStock).toBe(true);
});

test('refacciones sin stock mínimo configurado nunca alertan con stock positivo', async () => {
  const { token } = await prepararEntorno();
  const alta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción sin mínimo', code: 'SIN-001', stock: 1 });

  expect(alta.body.minStock).toBe(0);
  expect(alta.body.lowStock).toBe(false);
});
