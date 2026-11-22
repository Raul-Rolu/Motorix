// 006-complemento-precios-compra, T026 (US3): el precio de compra solo lo ve y
// lo escribe el administrador (FR-005, FR-006, CA-3, CA-4). Contrato por rol
// sobre TODAS las rutas que devuelven refacciones. Corre contra `motorix_test`.
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

const NO_ADMIN = ['recepcion', 'mecanico'];

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
  const [[mecanico]] = await getPool().query("SELECT id FROM users WHERE username = 'mecanico'");

  // Refacciones: una con todos los datos y otra pendiente de precio de venta.
  const conPrecio = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      name: 'Pastillas de freno',
      code: 'RV-001',
      stock: 10,
      salePrice: 150,
      purchasePrice: 95.5,
      category: 'FRENOS',
      brand: 'Brembo',
    });
  const pendiente = await request(app)
    .post('/api/parts')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ name: 'Batería 12V', code: 'RV-002', stock: 5, purchasePrice: 620 });

  // Orden asignada al mecánico, con un servicio y una refacción usada.
  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ fullName: 'Cliente de Visibilidad', phone: '5533334444' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      clientId: cliente.body.id,
      plates: 'vis-001-a',
      brand: 'Nissan',
      model: 'Versa',
      year: 2021,
    });
  const orden = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({
      vehicleId: vehiculo.body.id,
      mechanicId: mecanico.id,
      mileageEntry: 40000,
      reason: 'Prueba de visibilidad',
    });
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orden.body.id, 'Servicio de prueba', 500]
  );
  return {
    tokens,
    orderId: orden.body.id,
    parteId: conPrecio.body.id,
    pendienteId: pendiente.body.id,
  };
}

const tieneClave = (objeto) => Object.prototype.hasOwnProperty.call(objeto, 'purchasePrice');

/** Ninguna clave del cuerpo (en cualquier nivel) menciona el precio de compra. */
function sinPrecioDeCompra(cuerpo) {
  return !/purchase[_]?price/i.test(JSON.stringify(cuerpo));
}

describe('GET /api/parts: el precio de compra solo llega al administrador (CA-3)', () => {
  test.each([
    ['el listado', '/api/parts'],
    ['el filtro ?pending-price=true', '/api/parts?pending-price=true'],
    ['la búsqueda ?q=', '/api/parts?q=RV'],
  ])('%s', async (_nombre, ruta) => {
    const { tokens } = await prepararEntorno();

    const admin = await request(app).get(ruta).set('Authorization', `Bearer ${tokens.admin}`);
    expect(admin.status).toBe(200);
    expect(admin.body.datos.length).toBeGreaterThan(0);
    for (const parte of admin.body.datos) {
      expect(tieneClave(parte)).toBe(true);
    }

    for (const rol of NO_ADMIN) {
      const respuesta = await request(app)
        .get(ruta)
        .set('Authorization', `Bearer ${tokens[rol]}`);
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.datos.length).toBeGreaterThan(0);
      for (const parte of respuesta.body.datos) {
        // La clave no existe (no llega como null) y la categoría sí llega.
        expect(tieneClave(parte)).toBe(false);
        expect('category' in parte).toBe(true);
        expect('brand' in parte).toBe(true);
      }
      expect(sinPrecioDeCompra(respuesta.body)).toBe(true);
    }
  });

  test('el administrador recibe el valor del precio de compra', async () => {
    const { tokens } = await prepararEntorno();
    const admin = await request(app)
      .get('/api/parts')
      .set('Authorization', `Bearer ${tokens.admin}`);
    const pastillas = admin.body.datos.find((p) => p.code === 'RV-001');
    expect(pastillas.purchasePrice).toBe(95.5);
    expect(pastillas.salePrice).toBe(150);
  });
});

describe('otras rutas que devuelven datos de refacciones (CA-3)', () => {
  test('el detalle de orden no incluye el precio de compra con ningún rol', async () => {
    const { tokens, orderId, parteId } = await prepararEntorno();
    await request(app)
      .post(`/api/orders/${orderId}/parts`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ partId: parteId, quantity: 1 });

    for (const rol of ['admin', 'recepcion', 'mecanico']) {
      const detalle = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${tokens[rol]}`);
      expect(detalle.status).toBe(200);
      expect(detalle.body.refacciones).toHaveLength(1);
      expect(sinPrecioDeCompra(detalle.body)).toBe(true);
    }
  });

  test('POST y DELETE /api/orders/:id/parts no devuelven el precio de compra', async () => {
    const { tokens, orderId, parteId } = await prepararEntorno();

    // El mecánico asignado (rol no ADMIN) agrega y retira la refacción.
    const alta = await request(app)
      .post(`/api/orders/${orderId}/parts`)
      .set('Authorization', `Bearer ${tokens.mecanico}`)
      .send({ partId: parteId, quantity: 2 });
    expect(alta.status).toBe(201);
    expect(sinPrecioDeCompra(alta.body)).toBe(true);

    const baja = await request(app)
      .delete(`/api/orders/${orderId}/parts/${alta.body.id}`)
      .set('Authorization', `Bearer ${tokens.mecanico}`);
    expect([200, 204]).toContain(baja.status);
    expect(sinPrecioDeCompra(baja.body)).toBe(true);
  });

  test('el ticket no incluye el precio de compra (ADMIN y RECEPTIONIST; el mecánico no lo consulta)', async () => {
    const { tokens, orderId, parteId } = await prepararEntorno();
    await request(app)
      .post(`/api/orders/${orderId}/parts`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ partId: parteId, quantity: 1 });

    for (const rol of ['admin', 'recepcion']) {
      const ticket = await request(app)
        .get(`/api/tickets/${orderId}`)
        .set('Authorization', `Bearer ${tokens[rol]}`);
      expect(ticket.status).toBe(200);
      expect(ticket.body.refacciones).toHaveLength(1);
      expect(sinPrecioDeCompra(ticket.body)).toBe(true);
    }
    const mecanico = await request(app)
      .get(`/api/tickets/${orderId}`)
      .set('Authorization', `Bearer ${tokens.mecanico}`);
    expect(mecanico.status).toBe(403);
  });

  test('el historial de movimientos es solo de administración y no filtra el precio de compra', async () => {
    const { tokens, parteId } = await prepararEntorno();
    for (const rol of NO_ADMIN) {
      const respuesta = await request(app)
        .get(`/api/parts/${parteId}/movements`)
        .set('Authorization', `Bearer ${tokens[rol]}`);
      expect(respuesta.status).toBe(403);
    }
    const admin = await request(app)
      .get(`/api/parts/${parteId}/movements`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(admin.status).toBe(200);
    expect(sinPrecioDeCompra(admin.body)).toBe(true);
  });
});

describe('escritura de categoría, marca y precio de compra solo para ADMIN (CA-4)', () => {
  test.each(NO_ADMIN)('%s no puede dar de alta ni modificar esos datos (403 NO_AUTORIZADO)', async (rol) => {
    const { tokens, parteId } = await prepararEntorno();

    const alta = await request(app)
      .post('/api/parts')
      .set('Authorization', `Bearer ${tokens[rol]}`)
      .send({
        name: 'Intruso',
        code: 'RV-999',
        category: 'MOTOR',
        brand: 'Marca',
        purchasePrice: 10,
      });
    expect(alta.status).toBe(403);
    expect(alta.body.error.codigo).toBe('NO_AUTORIZADO');

    for (const cambio of [{ category: 'MOTOR' }, { brand: 'Otra' }, { purchasePrice: 1 }]) {
      const edicion = await request(app)
        .put(`/api/parts/${parteId}`)
        .set('Authorization', `Bearer ${tokens[rol]}`)
        .send(cambio);
      expect(edicion.status).toBe(403);
      expect(edicion.body.error.codigo).toBe('NO_AUTORIZADO');
    }

    // Nada cambió en la base.
    const [[fila]] = await getPool().query(
      'SELECT category, brand, purchase_price FROM parts WHERE id = ?',
      [parteId]
    );
    expect(fila.category).toBe('FRENOS');
    expect(fila.brand).toBe('Brembo');
    expect(Number(fila.purchase_price)).toBe(95.5);
    const [[{ total }]] = await getPool().query(
      "SELECT COUNT(*) AS total FROM parts WHERE code = 'RV-999'"
    );
    expect(Number(total)).toBe(0);
  });
});
