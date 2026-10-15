// T033: pruebas de contrato de /api/users (US2).
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

async function tokenDeAdmin() {
  const hash = await bcrypt.hash('Admin1234', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['contratoadmin', 'contratoadmin@motorix.local', hash, 'Admin Contrato', 'ADMIN']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'contratoadmin', contrasena: 'Admin1234' });
  return login.body.token;
}

test('las respuestas de usuarios siguen el contrato y nunca exponen passwordHash', async () => {
  const token = await tokenDeAdmin();

  const creacion = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({
      username: 'formato',
      email: 'formato@motorix.local',
      password: 'Formato123',
      fullName: 'Formato Contrato',
      role: 'MECHANIC',
    });
  expect(creacion.status).toBe(201);
  expect(creacion.body).toEqual({
    id: expect.any(Number),
    username: 'formato',
    email: 'formato@motorix.local',
    fullName: 'Formato Contrato',
    role: 'MECHANIC',
    active: true,
  });

  const lista = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.status).toBe(200);
  expect(Array.isArray(lista.body.datos)).toBe(true);
  expect(JSON.stringify(lista.body)).not.toContain('$2b$');

  const invalido = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: '', email: 'no-es-correo', password: 'x', fullName: '', role: 'OTRO' });
  expect(invalido.status).toBe(400);
  expect(invalido.body).toEqual({
    error: { codigo: 'DATOS_INVALIDOS', mensaje: expect.any(String) },
  });
});
