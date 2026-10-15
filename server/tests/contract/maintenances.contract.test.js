// T018: pruebas de contrato de mantenimientos (US3/US4, FR-004 a FR-007).
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

function fechaFutura(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  // Fecha local (no UTC): la API exige que no sea anterior a hoy local.
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

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

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ fullName: 'Contrato Mantenimientos', phone: '5588889999' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'cm-001-a',
      brand: 'Mazda',
      model: '3',
      year: 2022,
    });

  return { tokens, vehiculoId: vehiculo.body.id };
}

test('el listado de mantenimientos sigue la forma del contrato sin datos sensibles', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({
      vehicleId: vehiculoId,
      descripcion: 'Cambio de aceite',
      targetDate: fechaFutura(45),
      targetMileage: 92000,
    });

  const respuesta = await request(app)
    .get('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.recepcion}`);

  expect(respuesta.status).toBe(200);
  expect(respuesta.body.datos).toHaveLength(1);

  const mantenimiento = respuesta.body.datos[0];
  expect(mantenimiento).toMatchObject({
    vehicleId: vehiculoId,
    description: 'Cambio de aceite',
    status: 'PENDING',
    isOverdue: false,
  });
  expect(mantenimiento.targetDate).toBeTruthy();
  expect(typeof mantenimiento.targetMileage).toBe('number');
  expect(mantenimiento.vehiculo).toMatchObject({
    id: vehiculoId,
    placas: 'CM-001-A',
    marca: 'Mazda',
    modelo: '3',
  });
  expect(mantenimiento.cliente).toMatchObject({
    nombreCompleto: 'Contrato Mantenimientos',
  });
  expect(typeof mantenimiento.kilometrajeActual).toBe('number');

  // Nunca datos sensibles (Principio IV).
  const cuerpo = JSON.stringify(respuesta.body);
  expect(cuerpo).not.toContain('password');
  expect(cuerpo).not.toContain('$2b$');
});

test('el alta responde la forma del contrato y el detalle coincide', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const alta = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({
      vehicleId: vehiculoId,
      descripcion: 'Revisión de frenos',
      targetMileage: 100000,
    });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({
    id: expect.any(Number),
    vehicleId: vehiculoId,
    description: 'Revisión de frenos',
    status: 'PENDING',
    targetMileage: 100000,
  });
  expect(alta.body.targetDate).toBeNull();
  expect(alta.body.completedAt).toBeNull();
  expect(alta.body.cancellationReason).toBeNull();
});

test('el cumplimiento y la cancelación devuelven la forma del contrato', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const completado = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Alineación', targetDate: fechaFutura(10) });
  const completadoRespuesta = await request(app)
    .patch(`/api/maintenances/${completado.body.id}/complete`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(completadoRespuesta.status).toBe(200);
  expect(completadoRespuesta.body).toMatchObject({
    id: completado.body.id,
    status: 'COMPLETED',
    completedAt: expect.any(String),
  });

  const cancelado = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Balanceo', targetDate: fechaFutura(20) });
  const canceladoRespuesta = await request(app)
    .patch(`/api/maintenances/${cancelado.body.id}/cancel`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ reason: 'No se realizó por falta de refacción' });
  expect(canceladoRespuesta.status).toBe(200);
  expect(canceladoRespuesta.body).toMatchObject({
    id: cancelado.body.id,
    status: 'CANCELLED',
    cancellationReason: 'No se realizó por falta de refacción',
    cancelledAt: expect.any(String),
  });
});

test('los errores del catálogo siguen el formato centralizado', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const sinUmbral = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Sin umbral' });
  expect(sinUmbral.status).toBe(422);
  expect(sinUmbral.body.error).toMatchObject({
    codigo: 'MAINTENANCE_INVALID_THRESHOLD',
    mensaje: expect.any(String),
  });

  const noExistente = await request(app)
    .patch('/api/maintenances/999999/cancel')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ reason: 'Motivo válido' });
  expect(noExistente.status).toBe(404);
  expect(noExistente.body.error.codigo).toBe('MAINTENANCE_NOT_FOUND');

  const vehiculoInexistente = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: 999999, descripcion: 'Vehículo fantasma', targetDate: fechaFutura(5) });
  expect(vehiculoInexistente.status).toBe(404);
  expect(vehiculoInexistente.body.error.codigo).toBe('VEHICULO_NO_DISPONIBLE');
});

test('el filtro status=CANCELLED consulta cancelados y por defecto se excluyen', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const cancelado = await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Cancelado', targetDate: fechaFutura(8) });
  await request(app)
    .patch(`/api/maintenances/${cancelado.body.id}/cancel`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ reason: 'Ya no aplica' });
  await request(app)
    .post('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ vehicleId: vehiculoId, descripcion: 'Vigente', targetDate: fechaFutura(8) });

  const porDefecto = await request(app)
    .get('/api/maintenances')
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(porDefecto.body.datos.map((m) => m.description)).toEqual(['Vigente']);

  const soloCancelados = await request(app)
    .get('/api/maintenances?status=CANCELLED')
    .set('Authorization', `Bearer ${tokens.admin}`);
  expect(soloCancelados.body.datos.map((m) => m.description)).toEqual(['Cancelado']);
});
