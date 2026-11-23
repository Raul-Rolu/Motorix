// 008-configuracion-seguridad-reportes, T015 (bloque P1, US1; FR-001, FR-002,
// FR-005, CA-1, CA-3): API de ajustes. Sin filas guardadas se usan los valores
// de respaldo; `PUT` guarda un subconjunto y rechaza todo ante un error.
// En P1 la API expone solo los grupos `taller` y `operacion`; `seguridad` se
// habilita en P2 (por ahora se rechaza). Corre contra `motorix_test`.
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

async function iniciarSesionAdmin() {
  const hash = await bcrypt.hash('Admin12345', 10);
  const [usuario] = await getPool().query(
    "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('admin', 'admin@motorix.local', ?, 'Administrador', 'ADMIN')",
    [hash]
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'admin', contrasena: 'Admin12345' });
  return { token: login.body.token, usuarioId: usuario.insertId };
}

const consultar = (token) => request(app).get('/api/settings').set('Authorization', `Bearer ${token}`);
const guardar = (token, cuerpo) =>
  request(app).put('/api/settings').set('Authorization', `Bearer ${token}`).send(cuerpo);

const RESPALDO = {
  taller: { nombre: 'Motorix', direccion: 'Av. Taller 123, Col. Centro', telefono: '555-000-0000' },
  operacion: { margenProximoDias: 30, margenProximoKm: 1000, diasOrdenDetenida: 3 },
};

test('sin filas guardadas GET devuelve los valores de respaldo y los límites (CA-3)', async () => {
  const { token } = await iniciarSesionAdmin();

  const respuesta = await consultar(token);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body).toMatchObject(RESPALDO);
  expect(respuesta.body.limites).toEqual({
    margenProximoDias: [1, 365],
    margenProximoKm: [100, 50000],
    diasOrdenDetenida: [1, 90],
  });
});

test('en P1 la respuesta no incluye el grupo seguridad ni su límite', async () => {
  const { token } = await iniciarSesionAdmin();

  const respuesta = await consultar(token);

  expect(respuesta.body).not.toHaveProperty('seguridad');
  expect(respuesta.body.limites).not.toHaveProperty('minutosInactividad');
});

test('PUT guarda un subconjunto, registra al autor y GET devuelve lo guardado (CA-1)', async () => {
  const { token, usuarioId } = await iniciarSesionAdmin();

  const respuesta = await guardar(token, {
    taller: { nombre: 'Taller El Pistón', telefono: '555-123-4567' },
  });

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.taller).toEqual({
    nombre: 'Taller El Pistón',
    direccion: RESPALDO.taller.direccion,
    telefono: '555-123-4567',
  });
  expect(respuesta.body.operacion).toEqual(RESPALDO.operacion);

  const [filas] = await getPool().query(
    'SELECT setting_key, setting_value, updated_by FROM settings ORDER BY setting_key'
  );
  expect(filas).toEqual([
    { setting_key: 'shop.name', setting_value: 'Taller El Pistón', updated_by: usuarioId },
    { setting_key: 'shop.phone', setting_value: '555-123-4567', updated_by: usuarioId },
  ]);

  const lectura = await consultar(token);
  expect(lectura.body.taller.nombre).toBe('Taller El Pistón');
});

test('PUT guarda también los márgenes y los días de orden detenida', async () => {
  const { token } = await iniciarSesionAdmin();

  const respuesta = await guardar(token, {
    operacion: { margenProximoDias: 15, margenProximoKm: 500, diasOrdenDetenida: 5 },
  });

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.operacion).toEqual({
    margenProximoDias: 15,
    margenProximoKm: 500,
    diasOrdenDetenida: 5,
  });
});

test('guardar dos veces actualiza la fila y no la duplica', async () => {
  const { token } = await iniciarSesionAdmin();

  await guardar(token, { taller: { nombre: 'Primero' } });
  await guardar(token, { taller: { nombre: 'Segundo' } });

  const [[{ total }]] = await getPool().query(
    "SELECT COUNT(*) AS total FROM settings WHERE setting_key = 'shop.name'"
  );
  expect(Number(total)).toBe(1);
  expect((await consultar(token)).body.taller.nombre).toBe('Segundo');
});

describe('PUT rechaza todo el guardado con 400 DATOS_INVALIDOS y no guarda nada', () => {
  test.each([
    ['nombre vacío', { taller: { nombre: '   ' } }],
    ['nombre de más de 100 caracteres', { taller: { nombre: 'a'.repeat(101) } }],
    ['dirección de más de 150 caracteres', { taller: { direccion: 'a'.repeat(151) } }],
    ['teléfono con letras', { taller: { telefono: '555-ABC' } }],
    ['campo desconocido', { taller: { color: 'rojo' } }],
    ['grupo desconocido', { otro: { x: 1 } }],
    ['margen de días en cero', { operacion: { margenProximoDias: 0 } }],
    ['margen de días mayor al límite', { operacion: { margenProximoDias: 366 } }],
    ['margen de km menor al límite', { operacion: { margenProximoKm: 99 } }],
    ['días de orden detenida mayores al límite', { operacion: { diasOrdenDetenida: 91 } }],
    ['valor decimal', { operacion: { margenProximoDias: 2.5 } }],
    ['valor en texto', { operacion: { margenProximoDias: '15' } }],
    ['grupo seguridad (aún no disponible en P1)', { seguridad: { minutosInactividad: 30 } }],
    ['cuerpo vacío', {}],
  ])('%s', async (_nombre, cuerpo) => {
    const { token } = await iniciarSesionAdmin();

    const respuesta = await guardar(token, cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM settings');
    expect(Number(total)).toBe(0);
  });

  test('un error en un grupo impide guardar los campos válidos de otro', async () => {
    const { token } = await iniciarSesionAdmin();

    const respuesta = await guardar(token, {
      taller: { nombre: 'Taller válido' },
      operacion: { margenProximoDias: 0 },
    });

    expect(respuesta.status).toBe(400);
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM settings');
    expect(Number(total)).toBe(0);
  });
});

test('un valor guardado inválido en la base se ignora y se usa el respaldo (el servidor no falla)', async () => {
  const { token } = await iniciarSesionAdmin();
  await getPool().query(
    "INSERT INTO settings (setting_key, setting_value) VALUES ('maintenance.margin_days', 'abc'), ('shop.name', '   ')"
  );

  const respuesta = await consultar(token);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.operacion.margenProximoDias).toBe(30);
  expect(respuesta.body.taller.nombre).toBe('Motorix');
});
