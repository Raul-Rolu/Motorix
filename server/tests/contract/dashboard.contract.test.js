// T043: pruebas de contrato del panel de control (US4; contracts/api-rest.md).
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

test('GET /api/dashboard sigue la forma del contrato', async () => {
  const { token } = await prepararEntorno();

  const panel = await request(app)
    .get('/api/dashboard')
    .set('Authorization', `Bearer ${token}`);

  expect(panel.status).toBe(200);
  expect(panel.body).toMatchObject({
    ordenes: {
      RECIBIDO: expect.any(Number),
      DIAGNOSTICO: expect.any(Number),
      EN_REPARACION: expect.any(Number),
      ESPERANDO_REFACCION: expect.any(Number),
      TERMINADO: expect.any(Number),
      ENTREGADO: expect.any(Number),
      CANCELADA: expect.any(Number),
    },
    citas: {
      hoy: expect.any(Number),
      proximas: expect.any(Number),
    },
    mantenimientos: {
      vencidos: expect.any(Number),
      proximos: expect.any(Number),
    },
    inventario: {
      stockBajo: expect.any(Number),
    },
    cobros: {
      hoy: expect.any(Number),
      total: expect.any(Number),
      pendientesDigitales: expect.any(Number),
    },
  });
});
