// 008-configuracion-seguridad-reportes (bloque P2, US5; FR-012, CA-20): prueba de
// extremo a extremo con el proceso REAL del servidor (`node server.js`), no con
// supertest. Un inicio de sesión fallido por HTTP debe quedar en `audit_log`, el
// servidor no debe escribir errores de bitácora y al arrancar debe informar a qué
// base está conectado y si la tabla de la bitácora está disponible. Así, un
// servidor mal configurado (base distinta, migración 022 sin aplicar) se detecta
// al arrancar y no en silencio. Corre SOLO contra `motorix_test`.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
  nombreBasePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

const directorioServidor = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const puerto = 3100 + Math.floor(Math.random() * 800);

let proceso = null;
let salida = '';
let errores = '';

/** Arranca `node server.js` apuntando a la base de pruebas y espera a que escuche. */
function arrancarServidor(entorno = {}) {
  salida = '';
  errores = '';
  proceso = spawn(process.execPath, ['server.js'], {
    cwd: directorioServidor,
    env: { ...process.env, DB_NAME: nombreBasePruebas(), PORT: String(puerto), ...entorno },
  });
  proceso.stdout.on('data', (trozo) => {
    salida += trozo.toString();
  });
  proceso.stderr.on('data', (trozo) => {
    errores += trozo.toString();
  });
  return new Promise((resolver, rechazar) => {
    let revisar = null;
    const limite = setTimeout(() => {
      clearInterval(revisar); // sin esto Jest no termina: el temporizador seguiría abierto
      rechazar(new Error(`El servidor no arrancó. Salida: ${salida} ${errores}`));
    }, 8000);
    revisar = setInterval(() => {
      if (salida.includes('Bitácora:') || errores.includes('[bitácora]')) {
        clearTimeout(limite);
        clearInterval(revisar);
        resolver();
      }
    }, 100);
  });
}

async function detenerServidor() {
  if (proceso) {
    const terminado = new Promise((resolver) => proceso.once('exit', resolver));
    proceso.kill();
    await terminado;
    proceso = null;
  }
}

beforeAll(async () => {
  await prepararBaseDePruebas();
});

afterEach(async () => {
  await detenerServidor();
  await limpiarTablas();
});

afterAll(async () => {
  await detenerServidor();
  await cerrarBaseDePruebas();
});

async function iniciarSesion(identificacion, contrasena) {
  const respuesta = await fetch(`http://localhost:${puerto}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificacion, contrasena }),
  });
  return { status: respuesta.status, cuerpo: await respuesta.json() };
}

async function crearAdmin() {
  const hash = await bcrypt.hash('Admin12345', 10);
  const [usuario] = await getPool().query(
    "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('admin', 'admin@motorix.local', ?, 'Administrador', 'ADMIN')",
    [hash]
  );
  return usuario.insertId;
}

describe('arranque del servidor real', () => {
  test('informa la base de datos conectada y que la tabla de la bitácora está disponible', async () => {
    await arrancarServidor();

    expect(salida).toContain(`escuchando en el puerto ${puerto}`);
    expect(salida).toContain(`Base de datos: ${nombreBasePruebas()} en `);
    expect(salida).toContain('Bitácora: tabla audit_log disponible.');
    // Nunca se imprimen credenciales.
    expect(salida + errores).not.toContain(process.env.DB_PASSWORD ?? '\u0000sin-contraseña');
    expect(errores).toBe('');
  });

  test('si falta la tabla de la bitácora (migración 022 sin aplicar) lo grita al arrancar', async () => {
    await getPool().query('RENAME TABLE audit_log TO audit_log_oculta');
    try {
      await arrancarServidor();

      expect(errores).toMatch(/\[bitácora\].*audit_log.*migraci[oó]n 022/i);
      expect(salida).not.toContain('Bitácora: tabla audit_log disponible.');
    } finally {
      await detenerServidor();
      await getPool().query('RENAME TABLE audit_log_oculta TO audit_log');
    }
  });
});

describe('inicios de sesión fallidos contra el proceso real', () => {
  test('una cuenta inexistente y una contraseña incorrecta quedan en audit_log y el servidor no registra errores', async () => {
    const adminId = await crearAdmin();
    await arrancarServidor();

    const inexistente = await iniciarSesion('nadie', 'Mala12345');
    const incorrecta = await iniciarSesion('admin', 'Mala12345');

    expect(inexistente.status).toBe(401);
    expect(incorrecta.status).toBe(401);
    const [filas] = await getPool().query(
      "SELECT user_id, action, entity_type, detail FROM audit_log WHERE action = 'LOGIN_FAILED' ORDER BY id"
    );
    expect(filas).toEqual([
      { user_id: null, action: 'LOGIN_FAILED', entity_type: 'SESSION', detail: 'Identificador: nadie' },
      { user_id: adminId, action: 'LOGIN_FAILED', entity_type: 'SESSION', detail: 'Identificador: admin' },
    ]);
    expect(errores).toBe('');
  });

  test('un inicio de sesión correcto no registra nada', async () => {
    await crearAdmin();
    await arrancarServidor();

    const correcto = await iniciarSesion('admin', 'Admin12345');

    expect(correcto.status).toBe(200);
    const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM audit_log');
    expect(Number(total)).toBe(0);
  });
});
