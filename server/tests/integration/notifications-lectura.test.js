// 007-notificaciones-internas, T050 (US6; FR-006, CA-6): lectura de avisos por
// usuario con `POST /api/notifications/reads`. La lectura es por usuario; la
// clave se valida contra los avisos VIGENTES del propio usuario
// (NOTIFICATION_NOT_FOUND si no existe, ya no aplica o su rol no puede verla);
// si la condición deja de cumplirse el aviso desaparece y si cambia de estado
// vuelve como no leído. Corre contra `motorix_test`.
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

function fechaLocal(diasDesdeHoy) {
  const fecha = new Date();
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() + diasDesdeHoy);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico']) {
    tokens[username] = await iniciarSesion(username);
  }
  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', [
    'Cliente de lectura',
    '5550009999',
  ]);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, 'LEC-001-A', 'Mazda', 'CX-5', 2021]
  );
  return { tokens, clienteId: cliente.insertId, vehiculoId: vehiculo.insertId };
}

async function iniciarSesion(username) {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: username, contrasena: 'Usuario123' });
  return login.body.token;
}

async function crearMantenimiento(vehiculoId, fechaObjetivo, descripcion = 'Mantenimiento de prueba') {
  const [resultado] = await getPool().query(
    "INSERT INTO maintenance_plans (vehicle_id, description, target_date, status) VALUES (?, ?, ?, 'PENDING')",
    [vehiculoId, descripcion, fechaObjetivo]
  );
  return resultado.insertId;
}

const avisos = (token) =>
  request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
const marcar = (token, cuerpo) =>
  request(app).post('/api/notifications/reads').set('Authorization', `Bearer ${token}`).send(cuerpo);
const lecturasGuardadas = async () => {
  const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM notification_reads');
  return Number(total);
};
const avisoPorClave = (respuesta, clave) => respuesta.body.datos.find((aviso) => aviso.clave === clave);

describe('marcar un aviso como leído', () => {
  test('guarda la lectura para el usuario autenticado y baja el contador', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const uno = await crearMantenimiento(vehiculoId, fechaLocal(-5), 'Uno');
    const dos = await crearMantenimiento(vehiculoId, fechaLocal(-9), 'Dos');
    const claveUno = `MANTENIMIENTO:${uno}:VENCIDO`;
    expect((await avisos(tokens.admin)).body.noLeidos).toBe(2);

    const respuesta = await marcar(tokens.admin, { clave: claveUno });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ clave: claveUno, leido: true, noLeidos: 1 });
    const despues = await avisos(tokens.admin);
    expect(despues.body.total).toBe(2);
    expect(despues.body.noLeidos).toBe(1);
    expect(avisoPorClave(despues, claveUno).leido).toBe(true);
    expect(avisoPorClave(despues, `MANTENIMIENTO:${dos}:VENCIDO`).leido).toBe(false);
  });

  test('la lectura es por usuario: otro usuario sigue viendo el aviso como no leído', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const id = await crearMantenimiento(vehiculoId, fechaLocal(-5));
    const clave = `MANTENIMIENTO:${id}:VENCIDO`;

    await marcar(tokens.admin, { clave });

    expect(avisoPorClave(await avisos(tokens.admin), clave).leido).toBe(true);
    expect(avisoPorClave(await avisos(tokens.recepcion), clave).leido).toBe(false);
    const [[fila]] = await getPool().query(
      "SELECT u.username FROM notification_reads r JOIN users u ON u.id = r.user_id WHERE r.notification_key = ?",
      [clave]
    );
    expect(fila.username).toBe('admin');
  });

  test('la lectura persiste: una nueva sesión del mismo usuario la conserva', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const id = await crearMantenimiento(vehiculoId, fechaLocal(-5));
    const clave = `MANTENIMIENTO:${id}:VENCIDO`;
    await marcar(tokens.admin, { clave });

    const nuevoToken = await iniciarSesion('admin');

    expect(avisoPorClave(await avisos(nuevoToken), clave).leido).toBe(true);
  });

  test('es idempotente: marcar dos veces no duplica ni falla', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const id = await crearMantenimiento(vehiculoId, fechaLocal(-5));
    const clave = `MANTENIMIENTO:${id}:VENCIDO`;

    const primera = await marcar(tokens.admin, { clave });
    const segunda = await marcar(tokens.admin, { clave });

    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body).toEqual({ clave, leido: true, noLeidos: 0 });
    expect(await lecturasGuardadas()).toBe(1);
  });

  test('el usuario sale solo del token: un userId en el cuerpo o en la consulta no cambia de quién es la lectura', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const id = await crearMantenimiento(vehiculoId, fechaLocal(-5));
    const clave = `MANTENIMIENTO:${id}:VENCIDO`;
    const [[recepcion]] = await getPool().query("SELECT id FROM users WHERE username = 'recepcion'");

    const respuesta = await request(app)
      .post(`/api/notifications/reads?userId=${recepcion.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ clave, userId: recepcion.id, user_id: recepcion.id });

    expect(respuesta.status).toBe(200);
    expect(avisoPorClave(await avisos(tokens.admin), clave).leido).toBe(true);
    expect(avisoPorClave(await avisos(tokens.recepcion), clave).leido).toBe(false);
  });

  test('sin token responde 401', async () => {
    const respuesta = await request(app)
      .post('/api/notifications/reads')
      .send({ clave: 'MANTENIMIENTO:1:VENCIDO' });

    expect(respuesta.status).toBe(401);
  });
});

describe('validación de la clave (400 DATOS_INVALIDOS)', () => {
  test.each([
    ['sin cuerpo', undefined],
    ['sin clave', {}],
    ['clave vacía', { clave: '' }],
    ['clave que no es texto', { clave: 12 }],
    ['clave sin el formato TIPO:ID:ESTADO', { clave: 'cualquier-cosa' }],
    ['clave de más de 80 caracteres', { clave: `ORDEN:${'1'.repeat(80)}:DETENIDA` }],
    ['tipo desconocido', { clave: 'FACTURA:1:HOY' }],
  ])('rechaza %s', async (_descripcion, cuerpo) => {
    const { tokens } = await prepararEntorno();

    const respuesta = await marcar(tokens.admin, cuerpo);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
    expect(await lecturasGuardadas()).toBe(0);
  });
});

describe('la clave debe ser un aviso vigente del propio usuario (404 NOTIFICATION_NOT_FOUND)', () => {
  test('una clave inexistente no se guarda', async () => {
    const { tokens } = await prepararEntorno();

    const respuesta = await marcar(tokens.admin, { clave: 'MANTENIMIENTO:999:VENCIDO' });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NOTIFICATION_NOT_FOUND');
    expect(await lecturasGuardadas()).toBe(0);
  });

  test('un aviso que ya no aplica (mantenimiento completado) no se puede marcar', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const id = await crearMantenimiento(vehiculoId, fechaLocal(-5));
    await getPool().query("UPDATE maintenance_plans SET status = 'COMPLETED' WHERE id = ?", [id]);

    const respuesta = await marcar(tokens.admin, { clave: `MANTENIMIENTO:${id}:VENCIDO` });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.codigo).toBe('NOTIFICATION_NOT_FOUND');
    expect(await lecturasGuardadas()).toBe(0);
  });

  test('un aviso con el estado equivocado no existe (el mantenimiento es próximo, no vencido)', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const id = await crearMantenimiento(vehiculoId, fechaLocal(10));

    const vencido = await marcar(tokens.admin, { clave: `MANTENIMIENTO:${id}:VENCIDO` });
    const proximo = await marcar(tokens.admin, { clave: `MANTENIMIENTO:${id}:PROXIMO` });

    expect(vencido.status).toBe(404);
    expect(proximo.status).toBe(200);
  });

  test('un aviso de un tipo que el rol no ve no se puede marcar (mecánico y mantenimiento; recepción y stock)', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const mantenimiento = await crearMantenimiento(vehiculoId, fechaLocal(-5));
    const [parte] = await getPool().query(
      "INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES ('Pastillas', 'LEC-PAS', 1, 5, 1)"
    );

    const mecanico = await marcar(tokens.mecanico, { clave: `MANTENIMIENTO:${mantenimiento}:VENCIDO` });
    const recepcion = await marcar(tokens.recepcion, { clave: `STOCK:${parte.insertId}:BAJO` });
    const admin = await marcar(tokens.admin, { clave: `STOCK:${parte.insertId}:BAJO` });

    expect(mecanico.status).toBe(404);
    expect(recepcion.status).toBe(404);
    expect(admin.status).toBe(200);
    expect(await lecturasGuardadas()).toBe(1);
  });

  test('el mecánico puede marcar los avisos de sus órdenes pero no los de otro mecánico', async () => {
    const { tokens, clienteId, vehiculoId } = await prepararEntorno();
    const hash = await bcrypt.hash('Usuario123', 10);
    await getPool().query(
      "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('mecanico2', 'mecanico2@motorix.local', ?, 'Segundo', 'MECHANIC')",
      [hash]
    );
    const [[propio]] = await getPool().query("SELECT id FROM users WHERE username = 'mecanico'");
    const [[ajeno]] = await getPool().query("SELECT id FROM users WHERE username = 'mecanico2'");
    const insertar = async (mecanicoId) => {
      const [orden] = await getPool().query(
        "INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason, status_changed_at) VALUES (?, ?, ?, 'DIAGNOSTICO', 40000, 'Ruido', DATE_SUB(NOW(), INTERVAL 5 DAY))",
        [clienteId, vehiculoId, mecanicoId]
      );
      return orden.insertId;
    };
    const ordenPropia = await insertar(propio.id);
    const ordenAjena = await insertar(ajeno.id);

    const suya = await marcar(tokens.mecanico, { clave: `ORDEN:${ordenPropia}:DETENIDA` });
    const deOtro = await marcar(tokens.mecanico, { clave: `ORDEN:${ordenAjena}:DETENIDA` });

    expect(suya.status).toBe(200);
    expect(deOtro.status).toBe(404);
    expect(await lecturasGuardadas()).toBe(1);
  });
});

describe('vigencia de la lectura (CA-6)', () => {
  test('si la condición deja de cumplirse el aviso desaparece; si reaparece con el mismo estado sigue leído', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const id = await crearMantenimiento(vehiculoId, fechaLocal(-5));
    const clave = `MANTENIMIENTO:${id}:VENCIDO`;
    await marcar(tokens.admin, { clave });

    await getPool().query("UPDATE maintenance_plans SET status = 'COMPLETED' WHERE id = ?", [id]);
    expect((await avisos(tokens.admin)).body).toEqual({ total: 0, noLeidos: 0, datos: [] });
    // La lectura guardada no se borra al desaparecer el aviso.
    expect(await lecturasGuardadas()).toBe(1);

    await getPool().query("UPDATE maintenance_plans SET status = 'PENDING' WHERE id = ?", [id]);
    expect(avisoPorClave(await avisos(tokens.admin), clave).leido).toBe(true);
  });

  test('si el aviso cambia de estado (próximo → vencido) vuelve como no leído', async () => {
    const { tokens, vehiculoId } = await prepararEntorno();
    const id = await crearMantenimiento(vehiculoId, fechaLocal(10));
    const clavePróximo = `MANTENIMIENTO:${id}:PROXIMO`;
    await marcar(tokens.admin, { clave: clavePróximo });
    expect(avisoPorClave(await avisos(tokens.admin), clavePróximo).leido).toBe(true);

    await getPool().query('UPDATE maintenance_plans SET target_date = ? WHERE id = ?', [fechaLocal(-1), id]);

    const despues = await avisos(tokens.admin);
    expect(despues.body.datos).toHaveLength(1);
    expect(despues.body.datos[0]).toMatchObject({ clave: `MANTENIMIENTO:${id}:VENCIDO`, leido: false });
    expect(despues.body.noLeidos).toBe(1);
  });

  test('si el stock pasa de bajo a agotado el aviso vuelve como no leído', async () => {
    const { tokens } = await prepararEntorno();
    const [parte] = await getPool().query(
      "INSERT INTO parts (name, code, stock, min_stock, is_active) VALUES ('Pastillas', 'LEC-STK', 2, 5, 1)"
    );
    await marcar(tokens.admin, { clave: `STOCK:${parte.insertId}:BAJO` });

    await getPool().query('UPDATE parts SET stock = 0 WHERE id = ?', [parte.insertId]);

    const despues = await avisos(tokens.admin);
    expect(despues.body.datos[0]).toMatchObject({ clave: `STOCK:${parte.insertId}:AGOTADO`, leido: false });
  });
});
