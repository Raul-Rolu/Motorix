// 006-complemento-precios-compra, T008 (US1): categoría, marca y precio de
// compra en el alta y la edición de refacciones (FR-001, FR-002, FR-004,
// CA-1; contracts/api-rest.md). Corre contra `motorix_test`.
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

function alta(token, cuerpo) {
  return request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Pastillas de freno', code: 'PAS-220', stock: 4, ...cuerpo });
}

async function listado(token) {
  const respuesta = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${token}`);
  return respuesta.body.datos;
}

test('el alta guarda categoría, marca y precio de compra y se vuelven a consultar (CA-1)', async () => {
  const token = await tokenAdmin();

  const respuesta = await alta(token, {
    salePrice: 150,
    category: 'FRENOS',
    brand: 'Brembo',
    purchasePrice: 95.5,
  });

  expect(respuesta.status).toBe(201);
  expect(respuesta.body.category).toBe('FRENOS');
  expect(respuesta.body.brand).toBe('Brembo');
  expect(respuesta.body.purchasePrice).toBe(95.5);
  expect(respuesta.body.salePrice).toBe(150);
  expect(respuesta.body.advertencia).toBeUndefined();

  const guardada = (await listado(token)).find((p) => p.id === respuesta.body.id);
  expect(guardada.category).toBe('FRENOS');
  expect(guardada.brand).toBe('Brembo');
  expect(guardada.purchasePrice).toBe(95.5);
});

test('la edición modifica y limpia categoría, marca y precio de compra (CA-1)', async () => {
  const token = await tokenAdmin();
  const creada = await alta(token, {
    salePrice: 150,
    category: 'FRENOS',
    brand: 'Brembo',
    purchasePrice: 95.5,
  });

  const cambio = await request(app)
    .put(`/api/parts/${creada.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ category: 'MOTOR', brand: 'Bosch', purchasePrice: 100 });
  expect(cambio.status).toBe(200);
  expect(cambio.body.category).toBe('MOTOR');
  expect(cambio.body.brand).toBe('Bosch');
  expect(cambio.body.purchasePrice).toBe(100);

  // Sin los campos en el cuerpo se conservan los valores guardados.
  const sinCambio = await request(app)
    .put(`/api/parts/${creada.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Pastillas de freno delanteras' });
  expect(sinCambio.status).toBe(200);
  expect(sinCambio.body.category).toBe('MOTOR');
  expect(sinCambio.body.brand).toBe('Bosch');
  expect(sinCambio.body.purchasePrice).toBe(100);

  // `null` explícito los vuelve a dejar vacíos.
  const limpieza = await request(app)
    .put(`/api/parts/${creada.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ category: null, brand: null, purchasePrice: null });
  expect(limpieza.status).toBe(200);
  expect(limpieza.body.category).toBeNull();
  expect(limpieza.body.brand).toBeNull();
  expect(limpieza.body.purchasePrice).toBeNull();
});

test('una categoría fuera del catálogo se rechaza y no cambia los datos (CA-1)', async () => {
  const token = await tokenAdmin();

  const rechazada = await alta(token, { category: 'PINTURA' });
  expect(rechazada.status).toBe(400);
  expect(rechazada.body.error.codigo).toBe('DATOS_INVALIDOS');
  const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM parts');
  expect(Number(total)).toBe(0);

  const creada = await alta(token, { category: 'FRENOS' });
  const edicion = await request(app)
    .put(`/api/parts/${creada.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ category: 'PINTURA' });
  expect(edicion.status).toBe(400);
  const [[fila]] = await getPool().query('SELECT category FROM parts WHERE id = ?', [
    creada.body.id,
  ]);
  expect(fila.category).toBe('FRENOS');
});

test('la marca de 50 caracteres se acepta y la de 51 se rechaza (CA-1)', async () => {
  const token = await tokenAdmin();

  const valida = await alta(token, { brand: 'B'.repeat(50) });
  expect(valida.status).toBe(201);
  expect(valida.body.brand).toBe('B'.repeat(50));

  const excedida = await alta(token, { code: 'PAS-221', brand: 'B'.repeat(51) });
  expect(excedida.status).toBe(400);
  expect(excedida.body.error.codigo).toBe('DATOS_INVALIDOS');
});

test('una refacción sin categoría ni marca se acepta y se consulta con nulos (CA-1)', async () => {
  const token = await tokenAdmin();

  const respuesta = await alta(token, { salePrice: 150 });
  expect(respuesta.status).toBe(201);
  expect(respuesta.body.category).toBeNull();
  expect(respuesta.body.brand).toBeNull();
  expect(respuesta.body.purchasePrice).toBeNull();

  const guardada = (await listado(token)).find((p) => p.id === respuesta.body.id);
  expect(guardada.category).toBeNull();
  expect(guardada.brand).toBeNull();
  expect(guardada.purchasePrice).toBeNull();
});

test('un precio de compra negativo o con más de 2 decimales se rechaza (CA-1)', async () => {
  const token = await tokenAdmin();

  const negativo = await alta(token, { purchasePrice: -1 });
  expect(negativo.status).toBe(400);
  expect(negativo.body.error.codigo).toBe('DATOS_INVALIDOS');

  const decimales = await alta(token, { code: 'PAS-221', purchasePrice: 10.123 });
  expect(decimales.status).toBe(400);

  const noNumerico = await alta(token, { code: 'PAS-222', purchasePrice: 'abc' });
  expect(noNumerico.status).toBe(400);
});

test('un precio de venta menor al de compra se guarda con advertencia (FR-004)', async () => {
  const token = await tokenAdmin();

  const respuesta = await alta(token, { salePrice: 80, purchasePrice: 95.5 });
  expect(respuesta.status).toBe(201);
  expect(respuesta.body.salePrice).toBe(80);
  expect(respuesta.body.purchasePrice).toBe(95.5);
  expect(respuesta.body.advertencia).toBe(
    'El precio de venta es menor al precio de compra.'
  );

  // Se guardó a pesar de la advertencia.
  const guardada = (await listado(token)).find((p) => p.id === respuesta.body.id);
  expect(guardada.salePrice).toBe(80);

  // En la edición también se permite con la misma advertencia.
  const sana = await alta(token, { code: 'PAS-221', salePrice: 150, purchasePrice: 95.5 });
  const edicion = await request(app)
    .put(`/api/parts/${sana.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ salePrice: 90 });
  expect(edicion.status).toBe(200);
  expect(edicion.body.salePrice).toBe(90);
  expect(edicion.body.advertencia).toBe(
    'El precio de venta es menor al precio de compra.'
  );
});

test('un precio de venta igual o mayor al de compra no genera advertencia (FR-004)', async () => {
  const token = await tokenAdmin();

  const igual = await alta(token, { salePrice: 95.5, purchasePrice: 95.5 });
  expect(igual.status).toBe(201);
  expect(igual.body.advertencia).toBeUndefined();

  // Sin precio de venta (pendiente) no hay contra qué comparar.
  const pendiente = await alta(token, { code: 'PAS-221', purchasePrice: 620 });
  expect(pendiente.status).toBe(201);
  expect(pendiente.body.salePrice).toBeNull();
  expect(pendiente.body.advertencia).toBeUndefined();
});
