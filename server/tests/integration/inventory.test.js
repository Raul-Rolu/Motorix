// T030: pruebas de integración de movimientos de inventario (US5, FR-009, RN-6/RN-8, Q3).
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

async function crearParte(token, stock = 10) {
  const respuesta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Refacción base', code: `REF-${Math.floor(Math.random() * 100000)}`, stock });
  return respuesta.body;
}

test('una entrada IN suma al stock de la refacción', async () => {
  const { token } = await prepararEntorno();
  const parte = await crearParte(token, 10);

  const entrada = await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'IN', quantity: 5, reason: 'Reposición del proveedor' });

  expect(entrada.status).toBe(201);
  expect(entrada.body).toMatchObject({ stockResult: 15 });

  const verificacion = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${token}`);
  expect(verificacion.body.datos.find((p) => p.id === parte.id).stock).toBe(15);
});

test('un AJUSTE con signo suma o resta según corresponda', async () => {
  const { token } = await prepararEntorno();
  const parte = await crearParte(token, 10);

  const positivo = await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: 2, reason: 'Conteo cíclico: sobrante' });
  expect(positivo.status).toBe(201);
  expect(positivo.body.stockResult).toBe(12);

  const negativo = await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: -4, reason: 'Conteo cíclico: faltante' });
  expect(negativo.status).toBe(201);
  expect(negativo.body.stockResult).toBe(8);
});

test('un AJUSTE que dejaría stock negativo se rechaza sin modificar el stock (Q3, RN-8)', async () => {
  const { token } = await prepararEntorno();
  const parte = await crearParte(token, 10);

  const rechazo = await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: -15, reason: 'Ajuste demasiado grande' });

  expect(rechazo.status).toBe(422);
  expect(rechazo.body.error.codigo).toBe('MOVEMENT_INVALID');

  const verificacion = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${token}`);
  expect(verificacion.body.datos.find((p) => p.id === parte.id).stock).toBe(10);
});

test('un movimiento con cantidad 0 se rechaza con MOVEMENT_INVALID (422)', async () => {
  const { token } = await prepararEntorno();
  const parte = await crearParte(token, 10);

  const rechazo = await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'IN', quantity: 0, reason: 'Nada que registrar' });

  expect(rechazo.status).toBe(422);
  expect(rechazo.body.error.codigo).toBe('MOVEMENT_INVALID');
});

test('el movimiento sin motivo se rechaza con DATOS_INVALIDOS (400)', async () => {
  const { token } = await prepararEntorno();
  const parte = await crearParte(token, 10);

  const rechazo = await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'IN', quantity: 3 });

  expect(rechazo.status).toBe(400);
  expect(rechazo.body.error.codigo).toBe('DATOS_INVALIDOS');
});

test('un tipo de movimiento no admitido públicamente (OUT) se rechaza', async () => {
  const { token } = await prepararEntorno();
  const parte = await crearParte(token, 10);

  const rechazo = await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'OUT', quantity: 1, reason: 'Salida manual indebida' });

  expect(rechazo.status).toBe(400);
  expect(rechazo.body.error.codigo).toBe('DATOS_INVALIDOS');
});

test('el stock resultante siempre coincide con el acumulado de movimientos (SC-004)', async () => {
  const { token } = await prepararEntorno();
  const parte = await crearParte(token, 10);

  await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'IN', quantity: 7, reason: 'Compra extra' });
  await request(app)
    .post(`/api/parts/${parte.id}/movements`)
    .set('Authorization', `Bearer ${token}`)
    .send({ movementType: 'ADJUSTMENT', quantity: -3, reason: 'Ajuste por conteo' });

  const [[acumulado]] = await getPool().query(
    'SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_movements WHERE part_id = ?',
    [parte.id]
  );
  const verificacion = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${token}`);
  expect(verificacion.body.datos.find((p) => p.id === parte.id).stock).toBe(
    Number(acumulado.total)
  );
});
