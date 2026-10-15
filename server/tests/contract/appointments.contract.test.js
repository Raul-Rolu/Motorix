// T035: pruebas de contrato de citas (US1).
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

function fechaFutura(dias = 5) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

test('la creación, el listado y los errores de citas siguen el contrato', async () => {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción', 'RECEPTIONIST']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const token = login.body.token;

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Contrato Cita', phone: '5588889999' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'cc-001-a',
      brand: 'Nissan', model: 'March', year: 2020,
    });

  const creacion = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      vehicleId: vehiculo.body.id,
      appointmentDate: fechaFutura(),
      appointmentTime: '10:30',
      reason: 'Revisión de frenos',
    });

  expect(creacion.status).toBe(201);
  expect(creacion.body).toMatchObject({
    id: expect.any(Number),
    clientId: cliente.body.id,
    vehicleId: vehiculo.body.id,
    appointmentDate: fechaFutura(),
    appointmentTime: expect.stringContaining(':'),
    reason: 'Revisión de frenos',
    status: 'PROGRAMADA',
    cancellationReason: null,
  });

  const lista = await request(app)
    .get('/api/appointments?texto=Contrato Cita')
    .set('Authorization', `Bearer ${token}`);
  expect(lista.status).toBe(200);
  expect(lista.body).toEqual({
    datos: expect.arrayContaining([
      expect.objectContaining({ id: expect.any(Number), status: 'PROGRAMADA' }),
    ]),
  });

  const invalida = await request(app)
    .post('/api/appointments')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clientId: cliente.body.id,
      vehicleId: vehiculo.body.id,
      appointmentDate: 'no-es-fecha',
      appointmentTime: '10:00',
      reason: 'X',
    });
  expect(invalida.status).toBe(400);
  expect(invalida.body).toEqual({
    error: { codigo: 'DATOS_INVALIDOS', mensaje: expect.any(String) },
  });

  const inexistente = await request(app)
    .get('/api/appointments/99999')
    .set('Authorization', `Bearer ${token}`);
  expect(inexistente.status).toBe(404);
  expect(inexistente.body).toEqual({
    error: { codigo: 'CITA_NO_ENCONTRADA', mensaje: expect.any(String) },
  });
});
