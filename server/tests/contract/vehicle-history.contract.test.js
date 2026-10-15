// T004: pruebas de contrato del historial de servicios del vehículo (US1, FR-001/FR-002).
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
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }

  const loginRecepcion = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const loginMecanico = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'mecanico', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({ fullName: 'Historial Cliente', phone: '5511112222' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'hs-001-a',
      brand: 'Chevrolet',
      model: 'Aveo',
      year: 2018,
    });

  const [[mecanico]] = await getPool().query(
    "SELECT id FROM users WHERE username = 'mecanico'"
  );

  // Orden terminada (aparece en el historial) y otra recibida (no aparece).
  const terminada = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({
      vehicleId: vehiculo.body.id,
      mechanicId: mecanico.id,
      mileageEntry: 84000,
      reason: 'Mantenimiento mayor',
      notes: 'Se cambió correa',
    });
  await getPool().query("UPDATE service_orders SET status = 'TERMINADO' WHERE id = ?", [
    terminada.body.id,
  ]);
  const recibida = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${loginRecepcion.body.token}`)
    .send({
      vehicleId: vehiculo.body.id,
      mileageEntry: 84500,
      reason: 'Ruido en frenos',
    });

  return {
    tokenRecepcion: loginRecepcion.body.token,
    tokenMecanico: loginMecanico.body.token,
    vehiculoId: vehiculo.body.id,
    ordenTerminadaId: terminada.body.id,
    ordenRecibidaId: recibida.body.id,
  };
}

test('el historial sigue la forma del contrato y nunca expone datos sensibles', async () => {
  const entorno = await prepararEntorno();

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history`)
    .set('Authorization', `Bearer ${entorno.tokenRecepcion}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.vehiculo).toMatchObject({
    id: entorno.vehiculoId,
    placas: 'HS-001-A',
    marca: 'Chevrolet',
    modelo: 'Aveo',
  });
  expect(typeof respuesta.body.vehiculo.kilometrajeActual).toBe('number');

  expect(respuesta.body.historial).toHaveLength(1);
  const servicio = respuesta.body.historial[0];
  expect(servicio).toMatchObject({
    orderId: entorno.ordenTerminadaId,
    kilometraje: 84000,
    motivo: 'Mantenimiento mayor',
  });
  expect(typeof servicio.fecha).toBe('string');
  expect(servicio.mecanico).toMatchObject({ id: expect.any(Number) });
  expect(servicio.resumen).toMatchObject({
    servicios: expect.any(Number),
    manoObra: expect.any(Number),
    refacciones: expect.any(Number),
  });
  expect(typeof servicio.resumen.total).toBe('number');

  // La orden en curso (RECIBIDO) no forma parte del historial (RN-10).
  expect(respuesta.body.historial.map((s) => s.orderId)).not.toContain(
    entorno.ordenRecibidaId
  );

  // Nunca datos sensibles (Principio IV).
  const cuerpo = JSON.stringify(respuesta.body);
  expect(cuerpo).not.toContain('password');
  expect(cuerpo).not.toContain('$2b$');
});

test('el mecánico también puede consultar el historial de cualquier vehículo', async () => {
  const entorno = await prepararEntorno();

  const respuesta = await request(app)
    .get(`/api/vehicles/${entorno.vehiculoId}/history`)
    .set('Authorization', `Bearer ${entorno.tokenMecanico}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.historial).toHaveLength(1);
});
