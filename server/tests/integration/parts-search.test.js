// T056: pruebas de integración de búsqueda de inventario (US6, FR-009, FR-010).
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

  await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Filtro de aceite', code: 'FLT-OIL-100', stock: 10 });
  await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Pastillas de freno', code: 'FRN-PAS-200', stock: 6 });
  const obsoleta = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Filtro antiguo', code: 'FLT-OLD-000', stock: 1 });
  await request(app)
    .put(`/api/parts/${obsoleta.body.id}`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ isActive: false });

  return tokens;
}

test('la búsqueda q filtra por nombre y por código', async () => {
  const tokens = await prepararEntorno();

  const porNombre = await request(app)
    .get('/api/parts?q=filtro')
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(porNombre.status).toBe(200);
  // El admin también ve la inactiva que coincide.
  expect(porNombre.body.datos.map((p) => p.code).sort()).toEqual([
    'FLT-OIL-100',
    'FLT-OLD-000',
  ]);

  const porCodigo = await request(app)
    .get('/api/parts?q=FRN-PAS')
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(porCodigo.status).toBe(200);
  expect(porCodigo.body.datos.map((p) => p.code)).toEqual(['FRN-PAS-200']);
});

test('las refacciones inactivas solo las ve el administrador (FR-010)', async () => {
  const tokens = await prepararEntorno();

  const recepcion = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(recepcion.body.datos.map((p) => p.code)).not.toContain('FLT-OLD-000');

  const mecanico = await request(app)
    .get('/api/parts')
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(mecanico.body.datos.map((p) => p.code)).not.toContain('FLT-OLD-000');
  expect(mecanico.body.datos.map((p) => p.code)).toContain('FLT-OIL-100');
});

test('el historial de movimientos es solo de administración con autor, fecha y motivo', async () => {
  const tokens = await prepararEntorno();

  const listado = await request(app)
    .get('/api/parts?q=FLT-OIL-100')
    .set('Authorization', `Bearer ${tokens.admin}`);
  const parteId = listado.body.datos[0].id;

  // Se agrega un movimiento manual para enriquecer la auditoría.
  await request(app)
    .post(`/api/parts/${parteId}/movements`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ movementType: 'IN', quantity: 5, reason: 'Reposición semanal' });

  const historial = await request(app)
    .get(`/api/parts/${parteId}/movements`)
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(historial.status).toBe(200);
  expect(historial.body.datos.length).toBe(2);
  expect(historial.body.datos[0]).toMatchObject({
    movementType: 'IN',
    quantity: 5,
    reason: 'Reposición semanal',
    createdBy: 'Administrador',
  });
  expect(typeof historial.body.datos[0].createdAt).toBe('string');

  const recepcionIntenta = await request(app)
    .get(`/api/parts/${parteId}/movements`)
    .set('Authorization', `Bearer ${tokens.recepcion}`);
  expect(recepcionIntenta.status).toBe(403);

  const mecanicoIntenta = await request(app)
    .get(`/api/parts/${parteId}/movements`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(mecanicoIntenta.status).toBe(403);
});

test('una búsqueda sin resultados devuelve lista vacía sin error', async () => {
  const tokens = await prepararEntorno();

  const respuesta = await request(app)
    .get('/api/parts?q=no-existe-nada')
    .set('Authorization', `Bearer ${tokens.admin}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.datos).toEqual([]);
});
