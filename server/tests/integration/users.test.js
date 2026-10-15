// T032: pruebas de integración de gestión de usuarios (US2).
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

async function crearUsuario(overrides = {}) {
  const usuario = {
    username: 'usuario',
    email: 'usuario@motorix.local',
    password_hash: await bcrypt.hash('Usuario123', 10),
    full_name: 'Usuario de Prueba',
    role: 'RECEPTIONIST',
    active: 1,
    ...overrides,
  };
  const [resultado] = await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role, active) VALUES (?, ?, ?, ?, ?, ?)',
    [usuario.username, usuario.email, usuario.password_hash, usuario.full_name, usuario.role, usuario.active]
  );
  return { ...usuario, id: resultado.insertId };
}

async function tokenDe(role = 'ADMIN', username = 'adminprueba') {
  await crearUsuario({ username, email: `${username}@motorix.local`, role });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: username, contrasena: 'Usuario123' });
  return login.body.token;
}

test('el administrador crea, consulta y edita usuarios', async () => {
  const token = await tokenDe('ADMIN');

  const creacion = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({
      username: 'nuevo',
      email: 'nuevo@motorix.local',
      password: 'Nuevo1234',
      fullName: 'Usuario Nuevo',
      role: 'MECHANIC',
    });
  expect(creacion.status).toBe(201);
  expect(creacion.body.username).toBe('nuevo');
  expect(creacion.body).not.toHaveProperty('passwordHash');

  const lista = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.status).toBe(200);
  expect(lista.body.datos.some((u) => u.username === 'nuevo')).toBe(true);

  const edicion = await request(app)
    .put(`/api/users/${creacion.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      username: 'nuevo',
      email: 'editado@motorix.local',
      fullName: 'Usuario Editado',
      role: 'RECEPTIONIST',
    });
  expect(edicion.status).toBe(200);
  expect(edicion.body.role).toBe('RECEPTIONIST');
});

test('crear un usuario con username o email duplicado responde 409', async () => {
  const token = await tokenDe('ADMIN');
  const payload = {
    username: 'duplicado',
    email: 'duplicado@motorix.local',
    password: 'Duplicado123',
    fullName: 'Duplicado',
    role: 'MECHANIC',
  };
  const primero = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  expect(primero.status).toBe(201);

  const segundo = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  expect(segundo.status).toBe(409);
  expect(segundo.body.error.codigo).toBe('USUARIO_DUPLICADO');

  // El mismo resultado aplica si solo se repite el correo.
  const correoRepetido = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...payload, username: 'otro' });
  expect(correoRepetido.status).toBe(409);
});

test('la gestión de usuarios responde 403 para roles no autorizados', async () => {
  const token = await tokenDe('RECEPTIONIST', 'recepcionprueba');
  const respuesta = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${token}`);
  expect(respuesta.status).toBe(403);
  expect(respuesta.body.error.codigo).toBe('NO_AUTORIZADO');
});

test('no se puede desactivar al único administrador activo (ULTIMO_ADMIN)', async () => {
  // Tres administradores: se desactivan dos y el último queda protegido.
  await crearUsuario({ username: 'admin1', email: 'admin1@motorix.local', role: 'ADMIN' });
  await crearUsuario({ username: 'admin2', email: 'admin2@motorix.local', role: 'ADMIN' });
  const admin3 = await crearUsuario({ username: 'admin3', email: 'admin3@motorix.local', role: 'ADMIN' });
  const token = await tokenDe('ADMIN', 'admin4');
  const idDe = async (username) => {
    const [filas] = await getPool().query('SELECT id FROM users WHERE username = ?', [username]);
    return filas[0].id;
  };

  // Se desactivan admin1, admin2 y admin4; quedan activos admin3 y el resto.
  for (const username of ['admin1', 'admin2', 'admin4']) {
    const okDesactivar = await request(app)
      .patch(`/api/users/${await idDe(username)}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false });
    expect(okDesactivar.status).toBe(204);
  }

  // Intentar desactivar al único administrador activo (admin3) con su propio token.
  const loginAdmin3 = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'admin3', contrasena: 'Usuario123' });
  const respuesta = await request(app)
    .patch(`/api/users/${admin3.id}/status`)
    .set('Authorization', `Bearer ${loginAdmin3.body.token}`)
    .send({ active: false });
  expect(respuesta.status).toBe(400);
  expect(respuesta.body.error.codigo).toBe('ULTIMO_ADMIN');
});

test('un usuario desactivado pierde el acceso y lo recupera al reactivarse (FR-015)', async () => {
  const objetivo = await crearUsuario({ username: 'baja', email: 'baja@motorix.local' });
  const token = await tokenDe('ADMIN', 'adminbaja');

  const desactivacion = await request(app)
    .patch(`/api/users/${objetivo.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ active: false });
  expect(desactivacion.status).toBe(204);

  // No puede iniciar sesión con la contraseña correcta.
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'baja', contrasena: 'Usuario123' });
  expect(login.status).toBe(401);

  // Su token vigente también deja de servir.
  const loginPrevio = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'adminbaja', contrasena: 'Usuario123' });
  await request(app)
    .patch(`/api/users/${objetivo.id}/status`)
    .set('Authorization', `Bearer ${loginPrevio.body.token}`)
    .send({ active: false });

  const reactivacion = await request(app)
    .patch(`/api/users/${objetivo.id}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ active: true });
  expect(reactivacion.status).toBe(204);

  const loginDespues = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'baja', contrasena: 'Usuario123' });
  expect(loginDespues.status).toBe(200);
});
