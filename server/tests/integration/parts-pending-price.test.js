// 005-precio-venta-refacciones, T008 (US1): filtro de refacciones
// pendientes de precio (FR-003, CA-17; contracts/api-rest.md D7).
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

async function crearParte(token, { name, code, salePrice }) {
  const cuerpo = { name, code, stock: 2 };
  if (salePrice !== undefined) {
    cuerpo.salePrice = salePrice;
  }
  const respuesta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo);
  return respuesta.body;
}

test('el filtro pending-price lista solo las refacciones activas sin precio (CA-17)', async () => {
  const tokens = await prepararEntorno();
  const conPrecio = await crearParte(tokens.admin, {
    name: 'Filtro con precio', code: 'FLT-PREC', salePrice: 100,
  });
  const pendiente = await crearParte(tokens.admin, {
    name: 'Batería pendiente', code: 'BAT-PEND',
  });
  const inactivaSinPrecio = await crearParte(tokens.admin, {
    name: 'Refacción inactiva', code: 'REF-INAC',
  });
  await request(app)
    .put(`/api/parts/${inactivaSinPrecio.id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ isActive: false });

  const filtrado = await request(app)
    .get('/api/parts?pending-price=true')
    .set('Authorization', `Bearer ${tokens.admin}`);

  expect(filtrado.status).toBe(200);
  const ids = filtrado.body.datos.map((p) => p.id);
  expect(ids).toEqual([pendiente.id]);
  expect(ids).not.toContain(conPrecio.id);
  expect(ids).not.toContain(inactivaSinPrecio.id);
});

test('el filtro devuelve lista vacía cuando todas las activas tienen precio', async () => {
  const tokens = await prepararEntorno();
  const pendiente = await crearParte(tokens.admin, {
    name: 'Correa pendiente', code: 'COR-PEND',
  });

  const antes = await request(app)
    .get('/api/parts?pending-price=true')
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(antes.body.datos.map((p) => p.id)).toEqual([pendiente.id]);

  await request(app)
    .put(`/api/parts/${pendiente.id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ salePrice: 350 });

  const despues = await request(app)
    .get('/api/parts?pending-price=true')
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(despues.status).toBe(200);
  expect(despues.body.datos).toEqual([]);
});

test('recepción también consulta el filtro de pendientes de precio', async () => {
  const tokens = await prepararEntorno();
  const pendiente = await crearParte(tokens.admin, {
    name: 'Bujía pendiente', code: 'BUJ-PEND', salePrice: 90,
  });
  await crearParte(tokens.admin, { name: 'Aceite pendiente', code: 'ACE-PEND' });

  const filtrado = await request(app)
    .get('/api/parts?pending-price=true')
    .set('Authorization', `Bearer ${tokens.recepcion}`);

  expect(filtrado.status).toBe(200);
  const codigos = filtrado.body.datos.map((p) => p.code);
  expect(codigos).toEqual(['ACE-PEND']);
  expect(codigos).not.toContain('BUJ-PEND');
  expect(pendiente.salePrice).toBe(90);
});
