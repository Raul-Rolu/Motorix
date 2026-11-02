#!/usr/bin/env node
/**
 * Validación del quickstart del Sprint 5 (precio de venta de refacciones)
 * contra la API REAL. Sustituye al guion de la corrida anterior, que no estaba
 * versionado (hallazgo H-12 de docs/aseguramiento-calidad-sprint-5.md).
 *
 * Uso:
 *   node docs/evidencias/aseguramiento/quickstart-005.mjs [URL_BASE] --base-de-pruebas
 *
 *   URL_BASE  opcional; por defecto http://localhost:3055
 *
 * PRECONDICIONES (ver también la sección «Guion» del documento de calidad):
 *   1. La API debe estar arrancada con DB_NAME=motorix_test (NUNCA contra la
 *      base de demostración): este guion crea clientes, vehículos, órdenes,
 *      pagos y refacciones, y vuelve a aplicar los seeds.
 *   2. La base motorix_test debe estar recién migrada y sembrada (migraciones
 *      001-016 y seeds 001-008). El guion consume datos: no es re-ejecutable
 *      sobre la misma base sin recrearla.
 *   3. Este proceso necesita DB_NAME=motorix_test en su entorno y las
 *      variables DB_HOST, DB_PORT, DB_USER y DB_PASSWORD (se completan desde
 *      server/.env si no están definidas). Ningún secreto vive en este archivo.
 *   4. El cliente `mysql` debe estar en el PATH o indicarse con la variable
 *      MYSQL_BIN (ruta completa de mysql.exe). Se usa para insertar un marcador
 *      de identidad y para recrear los «usos heredados sin precio»
 *      (order_parts.unit_price NULL), que la API impide crear a propósito
 *      (PART_SIN_PRECIO). Toda escritura por mysql va fija a `-D motorix_test`.
 *   5. Antes de escribir por la API, el guion inserta una refacción marcador
 *      inactiva (QS5-MARCADOR-<sufijo>) en motorix_test y exige que la API la
 *      devuelva; si no, termina con código 2 sin escribir nada más.
 *
 * Numeración de escenarios (en orden de ejecución):
 *   E1  Puesta en marcha del quickstart + idempotencia del seed 008 (R-06)
 *   E2-E9  Escenarios manuales 1 a 8 del quickstart
 *   E10 Recuperación tras asignar el precio: cobro y ticket (H-07, CA-10)
 *
 * Nota sobre E1 y el hallazgo H-14: E1 aplica el seed dos veces A PROPÓSITO para
 * medir su idempotencia. El seed 004 (Sprint 2) no es idempotente: order_services
 * y order_labor no tienen llave única y cada apply-seeds.mjs vuelve a insertar las
 * filas de las órdenes 2 y 4. El guion lo detecta, lo informa como
 * [HALLAZGO H-14] (no cuenta como falla ni cambia el código de salida) y
 * restaura la base: borra de ambas tablas las filas con id mayor al máximo
 * registrado antes de E1, solo si son duplicados exactos de las originales.
 *
 * Solo usa fetch y módulos nativos de Node (sin dependencias nuevas).
 * Código de salida: 0 solo si todas las verificaciones pasan. La última línea
 * impresa es «Codigo de salida del guion: N».
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raizRepo = path.resolve(__dirname, '..', '..', '..');

// ---------------------------------------------------------------------------
// Argumentos y entorno
// ---------------------------------------------------------------------------
const argumentos = process.argv.slice(2);
const baseUrl = (argumentos.find((a) => !a.startsWith('--')) ?? 'http://localhost:3055').replace(/\/+$/, '');

if (!argumentos.includes('--base-de-pruebas')) {
  console.error(
    'Falta el argumento --base-de-pruebas. Este guion modifica datos: ' +
      'confirma con esa bandera que la API usa la base motorix_test.'
  );
  process.exit(2);
}

console.log('AVISO: el servidor debe estar arrancado con DB_NAME=motorix_test.');
console.log('       Nunca ejecutes este guion contra la base de demostración.');

/** Completa variables ausentes desde server/.env (formato CLAVE=valor). */
function cargarEnvDelServidor() {
  const archivo = path.join(raizRepo, 'server', '.env');
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
cargarEnvDelServidor();

if (process.env.DB_NAME !== 'motorix_test') {
  console.error(
    `DB_NAME vale "${process.env.DB_NAME ?? ''}" en este proceso; debe ser motorix_test. ` +
      'Define DB_NAME=motorix_test antes de ejecutar el guion.'
  );
  process.exit(2);
}

const credenciales = {
  host: process.env.DB_HOST ?? 'localhost',
  port: String(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME,
};

// Cuentas de ejemplo documentadas en README.md (seed 001); se pueden sustituir por entorno.
const cuentas = {
  admin: [process.env.QS_ADMIN_USUARIO ?? 'admin', process.env.QS_ADMIN_CLAVE ?? 'Admin123'],
  recepcion: [process.env.QS_RECEPCION_USUARIO ?? 'recepcion', process.env.QS_RECEPCION_CLAVE ?? 'Recepcion123'],
  mecanico: [process.env.QS_MECANICO_USUARIO ?? 'mecanico', process.env.QS_MECANICO_CLAVE ?? 'Mecanico123'],
};

// ---------------------------------------------------------------------------
// Utilidades de verificación
// ---------------------------------------------------------------------------
let total = 0;
const fallidas = [];
let escenarioActual = '';

function escenario(titulo) {
  escenarioActual = titulo;
  console.log(`\n===== ${titulo} =====`);
}

/** Registra una verificación e imprime [OK] o [FALLA] con su criterio. */
function verificar(condicion, texto, criterio, detalle = '') {
  total += 1;
  const etiqueta = `${texto} (${criterio})`;
  if (condicion) {
    console.log(`  [OK] ${etiqueta}${detalle ? ` - ${detalle}` : ''}`);
  } else {
    console.log(`  [FALLA] ${etiqueta}${detalle ? ` - ${detalle}` : ''}`);
    fallidas.push(`[${escenarioActual}] ${etiqueta}`);
  }
  return Boolean(condicion);
}

/** Hallazgos conocidos: se informan aparte y no afectan el código de salida. */
const hallazgos = [];

function hallazgo(id, descripcion, detalle) {
  hallazgos.push({ id, descripcion, detalle });
  console.log(`  [HALLAZGO ${id}] ${descripcion} - ${detalle}`);
}

/** Error para detener el guion cuando continuar no es seguro (ya se registró la falla). */
class DetenerGuion extends Error {}

const casi = (a, b) => Number.isFinite(Number(a)) && Math.abs(Number(a) - Number(b)) < 0.005;
const texto = (valor) => JSON.stringify(valor);

async function api(metodo, ruta, token, cuerpo) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  let body = null;
  const crudo = await respuesta.text();
  if (crudo) {
    try {
      body = JSON.parse(crudo);
    } catch {
      body = crudo;
    }
  }
  return { status: respuesta.status, body };
}

/** Ruta del cliente mysql: MYSQL_BIN o, por defecto, "mysql" del PATH. */
const mysqlBin = process.env.MYSQL_BIN || 'mysql';

/** Mensaje claro cuando el ejecutable de mysql no existe. */
function errorDeMysql(resultado) {
  if (resultado.error?.code === 'ENOENT') {
    return (
      `No se encontró el cliente mysql ("${mysqlBin}"). Agrégalo al PATH o define ` +
      'MYSQL_BIN con la ruta completa de mysql.exe.'
    );
  }
  return `mysql falló: ${resultado.error?.message ?? resultado.stderr}`;
}

/**
 * Ejecuta SQL con el cliente mysql (solo para escrituras de preparación).
 * La base es SIEMPRE motorix_test (valor fijo, nunca una variable).
 */
function sql(consulta) {
  const resultado = spawnSync(
    mysqlBin,
    ['-h', credenciales.host, '-P', credenciales.port, '-u', credenciales.user, '-D', 'motorix_test', '-N', '-B', '-e', consulta],
    { encoding: 'utf8', env: { ...process.env, MYSQL_PWD: credenciales.password } }
  );
  if (resultado.error || resultado.status !== 0) {
    throw new Error(errorDeMysql(resultado));
  }
  return resultado.stdout.trim();
}

/** Inserta un uso heredado (unit_price NULL), como los de antes de la migración 016. */
function insertarUsoSinPrecio(orderId, partId, cantidad = 1) {
  if (![orderId, partId, cantidad].every(Number.isInteger)) throw new Error('Identificadores inválidos');
  sql(`INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES (${orderId}, ${partId}, ${cantidad}, NULL)`);
}

const TABLAS_PARTIDAS = ['order_services', 'order_labor'];

const filasDeSql = (consulta) =>
  sql(consulta)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((linea) => linea.split('\t'));

/**
 * Registro de order_services y order_labor (H-14): por orden 2 y 4, conteo de
 * filas y suma de amount; id máximo de cada tabla; y las filas originales.
 */
function registroDePartidas() {
  const registro = {};
  for (const tabla of TABLAS_PARTIDAS) {
    const porOrden = {};
    for (const [orden, filas, suma] of filasDeSql(
      `SELECT order_id, COUNT(*), COALESCE(SUM(amount), 0) FROM ${tabla} WHERE order_id IN (2, 4) GROUP BY order_id ORDER BY order_id`
    )) {
      porOrden[orden] = { filas: Number(filas), suma: Number(suma) };
    }
    const maxId = Number(filasDeSql(`SELECT COALESCE(MAX(id), 0) FROM ${tabla}`)[0]?.[0] ?? 0);
    const originales = filasDeSql(`SELECT order_id, description, amount FROM ${tabla} WHERE order_id IN (2, 4) ORDER BY id`).map(
      ([orden, descripcion, importe]) => `${orden}|${descripcion}|${Number(importe)}`
    );
    registro[tabla] = { porOrden, maxId, originales };
  }
  return registro;
}

/**
 * Restaura el estado original del seed 004: borra las filas con id mayor al id
 * máximo registrado antes de aplicar los seeds. Antes comprueba que TODAS sean
 * duplicados exactos (order_id, description, amount) de las filas originales;
 * si alguna no lo es, no borra nada, registra una falla y detiene el guion.
 * Solo se invoca después de guardiaDeIdentidad() (la base es motorix_test fija).
 */
function restaurarPartidas(antes) {
  const aBorrar = {};
  for (const tabla of TABLAS_PARTIDAS) {
    const originales = new Set(antes[tabla].originales);
    const extra = filasDeSql(`SELECT id, order_id, description, amount FROM ${tabla} WHERE id > ${antes[tabla].maxId} ORDER BY id`);
    const ajenas = extra.filter(([, orden, descripcion, importe]) => !originales.has(`${orden}|${descripcion}|${Number(importe)}`));
    if (ajenas.length > 0) {
      verificar(false, `Las filas nuevas de ${tabla} no son duplicados exactos de las originales; no se borra nada`, 'H-14', `ids: ${ajenas.map((f) => f[0]).join(', ')}`);
      throw new DetenerGuion(`Filas inesperadas en ${tabla}`);
    }
    aBorrar[tabla] = extra.length;
  }
  for (const tabla of TABLAS_PARTIDAS) {
    if (aBorrar[tabla] === 0) {
      console.log(`  Restauración: ${tabla} sin filas duplicadas que borrar`);
      continue;
    }
    const borradas = filasDeSql(`DELETE FROM ${tabla} WHERE id > ${antes[tabla].maxId}; SELECT ROW_COUNT();`).pop()?.[0];
    console.log(`  Restauración: se borraron ${borradas} filas de ${tabla} (id > ${antes[tabla].maxId})`);
  }
}

// ---------------------------------------------------------------------------
// Operaciones de apoyo sobre la API
// ---------------------------------------------------------------------------
const tokens = {};
let contador = 0;
const sufijo = String(Date.now()).slice(-6);

async function iniciarSesiones() {
  for (const [rol, [usuario, clave]] of Object.entries(cuentas)) {
    const r = await api('POST', '/api/auth/login', null, { identificacion: usuario, contrasena: clave });
    verificar(r.status === 200 && Boolean(r.body?.token), `Inicio de sesión de ${rol}`, 'precondición', `status ${r.status}`);
    tokens[rol] = r.body?.token;
  }
}

const listarPartes = async (consulta = '') =>
  (await api('GET', `/api/parts${consulta}`, tokens.admin)).body?.datos ?? [];

async function crearParte(nombre, precio) {
  contador += 1;
  const cuerpo = { name: nombre, code: `QS5-${sufijo}-${contador}`, stock: 10, minStock: 1 };
  if (precio !== undefined) cuerpo.salePrice = precio;
  const r = await api('POST', '/api/parts', tokens.admin, cuerpo);
  if (r.status !== 201) throw new Error(`No se pudo crear la refacción "${nombre}" (status ${r.status})`);
  return r.body;
}

/** Crea cliente, vehículo y orden asignada al mecánico, con una partida de servicio. */
async function crearOrden(mecanicoId, servicio) {
  contador += 1;
  const cliente = await api('POST', '/api/clients', tokens.recepcion, { fullName: `Cliente QS ${sufijo}-${contador}`, phone: '5566667777' });
  const vehiculo = await api('POST', '/api/vehicles', tokens.recepcion, {
    clientId: cliente.body?.id,
    plates: `QS5-${sufijo}-${contador}`,
    brand: 'Toyota',
    model: 'Corolla',
    year: 2020,
  });
  const orden = await api('POST', '/api/orders', tokens.recepcion, {
    vehicleId: vehiculo.body?.id,
    mechanicId: mecanicoId,
    mileageEntry: 10000,
    reason: 'Validación quickstart 005',
  });
  if (orden.status !== 201) throw new Error(`No se pudo crear la orden de prueba (status ${orden.status})`);
  const id = orden.body.id;
  await api('PATCH', `/api/orders/${id}/status`, tokens.mecanico, { status: 'DIAGNOSTICO' });
  const partida = await api('POST', `/api/orders/${id}/services`, tokens.mecanico, { description: 'Servicio de validación', amount: servicio, kind: 'SERVICE' });
  if (partida.status !== 201) throw new Error(`No se pudo agregar el servicio (status ${partida.status})`);
  return id;
}

const detalle = async (id) => (await api('GET', `/api/orders/${id}`, tokens.recepcion)).body;
const cobros = async (id) => (await api('GET', `/api/orders/${id}/payments`, tokens.recepcion)).body;
const pagar = (id, monto) => api('POST', `/api/orders/${id}/payments`, tokens.recepcion, { metodo: 'CASH', monto });
const ticket = (id) => api('GET', `/api/tickets/${id}`, tokens.recepcion);

/** Conteos de refacciones, usos y movimientos de inventario, consultados por la API. */
async function instantanea() {
  const partes = await listarPartes();
  let movimientos = 0;
  const stock = {};
  for (const parte of partes) {
    const m = await api('GET', `/api/parts/${parte.id}/movements`, tokens.admin);
    movimientos += (m.body?.datos ?? []).length;
    stock[parte.id] = parte.stock;
  }
  let usos = 0;
  for (const id of [1, 2, 3, 4, 5]) {
    usos += ((await detalle(id))?.refacciones ?? []).length;
  }
  return { refacciones: partes.length, usos, movimientos, stock };
}

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------
let mecanicoId;
let ordenSinPrecioA; // orden no liquidada con un uso heredado sin precio (E6, E10)
let parteA;

async function e1PuestaEnMarcha() {
  escenario('E1 - Puesta en marcha e idempotencia del seed 008 (quickstart «Puesta en marcha», R-06)');
  const salud = await api('GET', '/api/health');
  verificar(salud.status === 200 && salud.body?.baseDatos === 'ok', 'La API responde y alcanza su base de datos', 'precondición', texto(salud.body));
  verificar(spawnSync(mysqlBin, ['--version']).status === 0, `El cliente mysql está disponible (${mysqlBin})`, 'precondición');
  if (salud.status !== 200) throw new Error('La API no responde; se detiene la validación.');
  await iniciarSesiones();

  const partes = await listarPartes();
  const conPrecio = partes.filter((p) => p.id >= 1 && p.id <= 6 && p.salePrice !== null);
  verificar(conPrecio.length === 6, 'Las 6 refacciones de ejemplo tienen precio de venta', 'CA-18, FR-015', `con precio: ${conPrecio.length}`);
  const pendientes = await listarPartes('?pending-price=true');
  verificar(pendientes.length === 1 && pendientes[0].code === 'BAT-12V-60', 'Existe una sola refacción activa sin precio (Batería 12V 60Ah)', 'CA-18, CA-17', texto(pendientes.map((p) => p.code)));

  const orden2 = await detalle(2);
  mecanicoId = orden2?.mechanic?.id;
  verificar(Number.isInteger(mecanicoId), 'La orden 2 trae mecánico asignado (se usa para las órdenes de prueba)', 'precondición');
  verificar((orden2?.refacciones ?? []).length === 2, 'La orden 2 tiene 2 usos de refacciones con precio congelado', 'FR-015', `usos: ${(orden2?.refacciones ?? []).length}`);
  let incompletas = 0;
  for (const id of [1, 2, 3, 4, 5]) {
    if ((await detalle(id))?.totals?.totalCompleto !== true) incompletas += 1;
  }
  verificar(incompletas === 0, 'Ninguna orden de ejemplo tiene el total incompleto', 'CA-20, FR-015', `incompletas: ${incompletas}`);

  // R-06: aplicar el seed dos veces y comparar los conteos antes y después.
  const antes = await instantanea();
  const partidasAntes = registroDePartidas(); // H-14: servicios y mano de obra de las órdenes 2 y 4
  const rutaSeeds = path.join(raizRepo, 'database', 'scripts', 'apply-seeds.mjs');
  for (const vez of [1, 2]) {
    const r = spawnSync(process.execPath, [rutaSeeds], {
      cwd: raizRepo,
      encoding: 'utf8',
      env: { ...process.env, DB_NAME: 'motorix_test' },
    });
    verificar(r.status === 0, `apply-seeds.mjs termina con código 0 (ejecución ${vez})`, 'R-06', r.status === 0 ? '' : (r.stderr || r.stdout).trim().slice(0, 200));
  }
  const despues = await instantanea();
  verificar(antes.refacciones === despues.refacciones, 'El conteo de refacciones no cambia tras aplicar el seed dos veces', 'R-06', `${antes.refacciones} -> ${despues.refacciones}`);
  verificar(antes.usos === despues.usos, 'El conteo de usos en órdenes no cambia', 'R-06', `${antes.usos} -> ${despues.usos}`);
  verificar(antes.movimientos === despues.movimientos, 'El conteo de movimientos de inventario no cambia', 'R-06', `${antes.movimientos} -> ${despues.movimientos}`);
  verificar(texto(antes.stock) === texto(despues.stock), 'El stock de cada refacción no cambia (valores absolutos)', 'R-06, INC-03', texto(despues.stock));

  // H-14: el seed 004 (Sprint 2) no tiene llave única en order_services ni order_labor.
  const partidasDespues = registroDePartidas();
  const nombres = { order_services: 'servicios', order_labor: 'mano de obra' };
  let duplicado = false;
  for (const tabla of TABLAS_PARTIDAS) {
    for (const orden of [2, 4]) {
      const a = partidasAntes[tabla].porOrden[orden] ?? { filas: 0, suma: 0 };
      const d = partidasDespues[tabla].porOrden[orden] ?? { filas: 0, suma: 0 };
      const cambio = `orden ${orden} ${nombres[tabla]}: ${a.filas} filas / ${a.suma} -> ${d.filas} filas / ${d.suma}`;
      if (a.filas === d.filas && casi(a.suma, d.suma)) {
        verificar(true, `${tabla}: conteo y suma de la orden ${orden} no cambian tras aplicar el seed dos veces`, 'R-06, H-14', cambio);
      } else {
        duplicado = true;
        hallazgo('H-14', `${tabla} cambió tras aplicar el seed dos veces`, cambio);
      }
    }
  }
  if (duplicado) {
    // Restaura el estado original del seed para que E2-E10 corran sobre 600, 500, 840 y 1940.
    restaurarPartidas(partidasAntes);
    const restaurado = registroDePartidas();
    verificar(
      TABLAS_PARTIDAS.every((t) => texto(restaurado[t].porOrden) === texto(partidasAntes[t].porOrden) && restaurado[t].maxId === partidasAntes[t].maxId),
      'Servicios y mano de obra de las órdenes 2 y 4 quedan restaurados al estado previo a E1',
      'H-14',
      texto(TABLAS_PARTIDAS.map((t) => restaurado[t].porOrden))
    );
  }
}

async function e2PrecioEnFicha() {
  escenario('E2 - Precio de venta en la ficha de la refacción (quickstart 1: CA-2, CA-17)');
  const pendiente = (await listarPartes('?pending-price=true'))[0];
  const negativo = await api('PUT', `/api/parts/${pendiente.id}`, tokens.admin, { salePrice: -5 });
  verificar(negativo.status === 400, 'Un precio negativo se rechaza con 400', 'CA-2', `status ${negativo.status}`);
  const texto2 = await api('PUT', `/api/parts/${pendiente.id}`, tokens.admin, { salePrice: 'abc' });
  verificar(texto2.status === 400, 'Un precio no numérico se rechaza con 400', 'CA-2', `status ${texto2.status}`);
  const igual = (await listarPartes()).find((p) => p.id === pendiente.id);
  verificar(igual?.salePrice === null, 'El precio inválido no se guarda (sigue pendiente)', 'CA-2');
  const asignado = await api('PUT', `/api/parts/${pendiente.id}`, tokens.admin, { salePrice: 99.5 });
  verificar(asignado.status === 200 && casi(asignado.body?.salePrice, 99.5), 'La administración asigna el precio', 'CA-1, FR-001', `status ${asignado.status}`);
  const vacia = await listarPartes('?pending-price=true');
  verificar(vacia.length === 0, 'Con todas las activas con precio, la lista de pendientes queda vacía', 'CA-17', `pendientes: ${vacia.length}`);
}

async function e3Roles() {
  escenario('E3 - Solo administración edita precios (quickstart 2: CA-16, FR-002)');
  for (const rol of ['recepcion', 'mecanico']) {
    const r = await api('PUT', '/api/parts/1', tokens[rol], { salePrice: 1 });
    verificar(r.status === 403, `El servidor deniega a ${rol} editar el precio`, 'CA-16, FR-002', `status ${r.status}`);
  }
  const parte1 = (await listarPartes()).find((p) => p.id === 1);
  verificar(casi(parte1?.salePrice, 120), 'El precio de la refacción 1 sigue en 120.00', 'CA-16');
}

async function e4TotalConRefacciones() {
  escenario('E4 - El total de la orden incluye las refacciones (quickstart 3: CA-6, CA-4, CA-5, CA-15)');
  const base = (await detalle(2)).totals;
  verificar(
    casi(base.services, 600) && casi(base.labor, 500) && casi(base.parts, 840) && casi(base.grand, 1940) && base.totalCompleto === true,
    'Total de la orden 2 = servicios 600 + mano de obra 500 + refacciones 840 = 1940',
    'CA-6, FR-007',
    texto(base)
  );

  await api('PUT', '/api/parts/1', tokens.admin, { salePrice: 200 });
  const trasCambio = (await detalle(2)).totals;
  verificar(casi(trasCambio.grand, 1940), 'Cambiar el precio de la refacción no altera el total ya registrado', 'CA-4, FR-006', `total ${trasCambio.grand}`);

  const stockAntes = (await listarPartes()).find((p) => p.id === 1).stock;
  const agregada = await api('POST', '/api/orders/2/parts', tokens.mecanico, { partId: 1, quantity: 1 });
  verificar(agregada.status === 201 && casi(agregada.body?.unitPrice, 200), 'Agregar la refacción a la orden usa el precio vigente (200)', 'CA-5, FR-004', `status ${agregada.status}, unitPrice ${agregada.body?.unitPrice}`);
  const trasAgregar = (await detalle(2)).totals;
  verificar(casi(trasAgregar.grand, 2140), 'El total sube por el importe de la línea agregada (2140)', 'CA-6', `total ${trasAgregar.grand}`);

  const retiro = await api('DELETE', `/api/orders/2/parts/${agregada.body?.id}`, tokens.mecanico);
  verificar(retiro.status === 204, 'Retirar la línea agregada responde 204', 'CA-15', `status ${retiro.status}`);
  const trasRetiro = (await detalle(2)).totals;
  verificar(casi(trasRetiro.grand, 1940), 'El total baja por el importe de la línea retirada (1940)', 'CA-15, FR-007', `total ${trasRetiro.grand}`);
  const stockDespues = (await listarPartes()).find((p) => p.id === 1).stock;
  verificar(stockDespues === stockAntes, 'El stock se repone al retirar la refacción', 'CA-15', `${stockAntes} -> ${stockDespues}`);

  await api('PUT', '/api/parts/1', tokens.admin, { salePrice: 120 }); // restaura el precio de ejemplo
}

async function e5RechazoSinPrecio() {
  escenario('E5 - Rechazo al usar una refacción sin precio (quickstart 4: CA-8, FR-005)');
  const sinPrecio = await crearParte('Refacción sin precio QS');
  verificar(sinPrecio.salePrice === null, 'La refacción de prueba se crea sin precio', 'precondición');
  const totalAntes = (await detalle(2)).totals.grand;
  const r = await api('POST', '/api/orders/2/parts', tokens.mecanico, { partId: sinPrecio.id, quantity: 1 });
  verificar(r.status === 409 && r.body?.error?.codigo === 'PART_SIN_PRECIO', 'El mecánico recibe PART_SIN_PRECIO (409)', 'CA-8, FR-005', `status ${r.status}, código ${r.body?.error?.codigo}`);
  const stock = (await listarPartes()).find((p) => p.id === sinPrecio.id).stock;
  verificar(stock === 10, 'El stock no cambia tras el rechazo', 'CA-8', `stock ${stock}`);
  verificar(casi((await detalle(2)).totals.grand, totalAntes), 'El total de la orden no cambia tras el rechazo', 'CA-8');
}

async function e6Cobro() {
  escenario('E6 - Cobro de la orden con refacciones (quickstart 5: CA-12, CA-10, FR-009)');
  const resumen = await cobros(2);
  verificar(
    casi(resumen.total, 1940) && casi(resumen.cobrado, 800) && casi(resumen.saldoPendiente, 1140) && resumen.estadoCobro === 'PARCIAL',
    'El resumen usa el total con refacciones: total 1940, cobrado 800, saldo 1140, PARCIAL',
    'CA-12, FR-012',
    texto({ total: resumen.total, cobrado: resumen.cobrado, saldo: resumen.saldoPendiente, estado: resumen.estadoCobro })
  );
  const pago = await pagar(2, 1140);
  verificar(pago.status === 201, 'Recepción registra el pago del saldo', 'CA-12', `status ${pago.status}`);
  const liquidada = await cobros(2);
  verificar(liquidada.estadoCobro === 'LIQUIDADA' && casi(liquidada.saldoPendiente, 0), 'La orden 2 queda LIQUIDADA con saldo 0', 'CA-12', texto({ estado: liquidada.estadoCobro, saldo: liquidada.saldoPendiente }));

  // Orden de prueba A: no liquidada, con un uso heredado sin precio (precondición explícita).
  parteA = await crearParte('Refacción pendiente A');
  ordenSinPrecioA = await crearOrden(mecanicoId, 300);
  insertarUsoSinPrecio(ordenSinPrecioA, parteA.id);
  const d = await detalle(ordenSinPrecioA);
  const r = await cobros(ordenSinPrecioA);
  verificar(
    d.totals.totalCompleto === false && d.totals.refaccionesSinPrecio === 1 && casi(d.totals.grand, 300) && r.estadoCobro !== 'LIQUIDADA',
    'PRECONDICIÓN: la orden de prueba A queda incompleta (total 300, 1 uso sin precio, no liquidada) antes de cobrar',
    'FR-008, CA-9',
    texto(d.totals)
  );
  const bloqueo = await pagar(ordenSinPrecioA, 100);
  verificar(bloqueo.status === 409 && bloqueo.body?.error?.codigo === 'TOTAL_INCOMPLETO', 'El pago de la orden incompleta se bloquea con TOTAL_INCOMPLETO (409)', 'CA-10, FR-009', `status ${bloqueo.status}, código ${bloqueo.body?.error?.codigo}`);
  const lista = bloqueo.body?.error?.details?.refaccionesSinPrecio;
  verificar(
    Array.isArray(lista) && lista.length === 1 && lista[0].partId === parteA.id && 'orderPartId' in lista[0] && 'nombre' in lista[0],
    'details.refaccionesSinPrecio lista la refacción faltante {orderPartId, partId, nombre}',
    'CA-9, CA-10',
    texto(lista)
  );
}

async function e7Ticket() {
  escenario('E7 - Ticket de la orden con refacciones (quickstart 6: CA-13, CA-14, CA-10, CA-21)');
  const t = await ticket(2);
  const d = await detalle(2);
  verificar(t.status === 200, 'El ticket de la orden 2 (liquidada) se emite', 'CA-13', `status ${t.status}`);
  verificar(casi(t.body?.total, d.totals.grand) && casi(t.body?.total, 1940), 'El total del ticket es idéntico al de la orden (1940)', 'CA-14, FR-013', `${t.body?.total} = ${d.totals.grand}`);
  const lineas = t.body?.refacciones ?? [];
  const suma = lineas.reduce((acc, l) => acc + Number(l.amount ?? 0), 0);
  verificar(
    lineas.length === 2 && lineas.every((l) => l.unitPrice !== null && l.amount !== null && l.sinPrecio === false) && casi(suma, d.totals.parts),
    'Cada refacción trae cantidad, precio e importe, y los importes suman 840',
    'CA-13, FR-014',
    texto(lineas)
  );
  const incompleto = await ticket(ordenSinPrecioA);
  verificar(incompleto.status === 409 && incompleto.body?.error?.codigo === 'TOTAL_INCOMPLETO', 'El ticket de la orden incompleta no liquidada se bloquea con TOTAL_INCOMPLETO (409)', 'CA-10, FR-010', `status ${incompleto.status}, código ${incompleto.body?.error?.codigo}`);

  // Orden B: liquidada y, después, con un uso heredado sin precio (CA-21).
  const parteB = await crearParte('Refacción pendiente B');
  const ordenB = await crearOrden(mecanicoId, 600);
  const cobroB = await pagar(ordenB, 600);
  insertarUsoSinPrecio(ordenB, parteB.id);
  const resumenB = await cobros(ordenB);
  verificar(
    cobroB.status === 201 && resumenB.estadoCobro === 'LIQUIDADA' && resumenB.totalCompleto === false,
    'PRECONDICIÓN: la orden B está liquidada y tiene un uso sin precio',
    'FR-016, CA-21',
    texto({ estado: resumenB.estadoCobro, totalCompleto: resumenB.totalCompleto })
  );
  const tB = await ticket(ordenB);
  const lineaB = (tB.body?.refacciones ?? []).find((l) => l.sinPrecio === true);
  verificar(
    tB.status === 200 && casi(tB.body?.total, 600) && Boolean(lineaB) && lineaB.unitPrice === null && lineaB.amount === null,
    'El ticket de la orden liquidada se emite con el total histórico (600) y la línea «sin precio»',
    'CA-21, FR-016',
    `status ${tB.status}, total ${tB.body?.total}`
  );
  ordenLiquidadaB = { id: ordenB, parte: parteB };
}
let ordenLiquidadaB;

async function e8Adopcion() {
  escenario('E8 - Adopción del precio en órdenes abiertas (quickstart 7: CA-19, CA-11)');
  const parteC = await crearParte('Refacción pendiente C');
  const ordenC = await crearOrden(mecanicoId, 1000);
  const parcial = await pagar(ordenC, 800);
  insertarUsoSinPrecio(ordenC, parteC.id);
  const antes = await detalle(ordenC);
  verificar(
    parcial.status === 201 && antes.totals.totalCompleto === false && casi(antes.totals.grand, 1000),
    'PRECONDICIÓN: la orden C tiene un pago parcial de 800 y un uso sin precio',
    'CA-19',
    texto(antes.totals)
  );
  const asignacion = await api('PUT', `/api/parts/${parteC.id}`, tokens.admin, { salePrice: 150 });
  verificar(asignacion.status === 200, 'El administrador asigna el precio de venta (150)', 'FR-011', `status ${asignacion.status}`);
  const despues = await detalle(ordenC);
  const resumen = await cobros(ordenC);
  verificar(
    despues.totals.totalCompleto === true && casi(despues.totals.grand, 1150) && casi(resumen.cobrado, 800) && casi(resumen.saldoPendiente, 350) && resumen.estadoCobro === 'PARCIAL',
    'El uso heredado adopta el precio: total 1150, pago de 800 conservado, saldo 350, PARCIAL',
    'CA-19, FR-011',
    texto({ total: resumen.total, cobrado: resumen.cobrado, saldo: resumen.saldoPendiente, estado: resumen.estadoCobro })
  );

  // CA-11: la orden ya pagada (B) no adopta el precio asignado después.
  await api('PUT', `/api/parts/${ordenLiquidadaB.parte.id}`, tokens.admin, { salePrice: 80 });
  const resumenB = await cobros(ordenLiquidadaB.id);
  verificar(
    casi(resumenB.total, 600) && resumenB.estadoCobro === 'LIQUIDADA' && resumenB.totalCompleto === false,
    'La orden ya liquidada (B) conserva su total original y no adopta el precio',
    'CA-11, FR-011',
    texto({ total: resumenB.total, estado: resumenB.estadoCobro })
  );
}

async function e9Historial() {
  escenario('E9 - El historial del vehículo suma las refacciones (quickstart 8: CA-6)');
  const orden = await detalle(2);
  const vehiculoId = orden?.vehicle?.id; // el vehículo se consulta, no se fija
  verificar(Number.isInteger(vehiculoId), 'Se obtiene el vehículo al que pertenece la orden 2', 'precondición', `vehículo ${vehiculoId}`);
  const avance = await api('PATCH', '/api/orders/2/status', tokens.mecanico, { status: 'TERMINADO' });
  verificar(avance.status === 200, 'La orden 2 pasa a TERMINADO (el historial solo muestra órdenes terminadas o entregadas)', 'precondición', `status ${avance.status}`);
  const h = await api('GET', `/api/vehicles/${vehiculoId}/history`, tokens.recepcion);
  const entrada = (h.body?.historial ?? []).find((e) => e.orderId === 2);
  verificar(h.status === 200 && Boolean(entrada), `La orden 2 aparece en el historial del vehículo ${vehiculoId}`, 'CA-6', `status ${h.status}`);
  const detalleOrden = await detalle(2);
  verificar(casi(entrada?.resumen?.total, detalleOrden.totals.grand), 'El total del historial coincide con el detalle de la orden (1940)', 'CA-6, FR-007', `${entrada?.resumen?.total} = ${detalleOrden.totals.grand}`);
}

async function e10Recuperacion() {
  escenario('E10 - Cobro y ticket funcionan tras asignar el precio (H-07, CA-10)');
  const antes = await pagar(ordenSinPrecioA, 100);
  verificar(antes.status === 409 && antes.body?.error?.codigo === 'TOTAL_INCOMPLETO', 'PRECONDICIÓN: la orden A sigue bloqueada antes de asignar el precio', 'CA-10', `status ${antes.status}`);
  const asignacion = await api('PUT', `/api/parts/${parteA.id}`, tokens.admin, { salePrice: 150 });
  verificar(asignacion.status === 200, 'La administración asigna el precio a la refacción de la orden A', 'CA-10, FR-011', `status ${asignacion.status}`);
  const d = await detalle(ordenSinPrecioA);
  verificar(d.totals.totalCompleto === true && casi(d.totals.grand, 450), 'La orden A recalcula su total completo (300 + 150 = 450)', 'CA-11, FR-011', texto(d.totals));
  const pago = await pagar(ordenSinPrecioA, 100);
  verificar(pago.status === 201, 'El cobro que estaba bloqueado ahora se registra', 'CA-10, H-07', `status ${pago.status}`);
  const t = await ticket(ordenSinPrecioA);
  verificar(t.status === 200 && casi(t.body?.total, 450), 'El ticket que estaba bloqueado ahora se emite con el total completo (450)', 'CA-10, CA-14, H-07', `status ${t.status}, total ${t.body?.total}`);
  const resto = await pagar(ordenSinPrecioA, 350);
  const resumen = await cobros(ordenSinPrecioA);
  verificar(resto.status === 201 && resumen.estadoCobro === 'LIQUIDADA', 'Se paga el saldo restante y la orden A queda LIQUIDADA', 'CA-12', `estado ${resumen.estadoCobro}`);
}

// ---------------------------------------------------------------------------
// Guardia de identidad de la base (se ejecuta ANTES de cualquier escritura por la API)
// ---------------------------------------------------------------------------
/**
 * Inserta con mysql, directamente en motorix_test, una refacción marcador
 * inactiva y con precio, y comprueba que la API la devuelve. Si no aparece, la
 * API apunta a otra base: se termina con código 2 sin escribir nada más.
 * El marcador (inactiva y con precio) no altera las comprobaciones de E1:
 * no es una de las refacciones 1 a 6 y no cuenta como pendiente de precio.
 */
async function guardiaDeIdentidad() {
  const codigo = `QS5-MARCADOR-${sufijo}`;
  const abortar = (mensaje) => {
    console.error(mensaje);
    console.log('Codigo de salida del guion: 2');
    process.exit(2);
  };
  try {
    sql(`INSERT INTO parts (name, code, stock, min_stock, is_active, sale_price) VALUES ('Marcador de identidad QS5', '${codigo}', 0, 0, 0, 1.00)`);
  } catch (error) {
    abortar(`No se pudo insertar el marcador en motorix_test: ${error.message}`);
  }
  let aparece = false;
  try {
    const login = await api('POST', '/api/auth/login', null, { identificacion: cuentas.admin[0], contrasena: cuentas.admin[1] });
    if (login.status === 200 && login.body?.token) {
      const partes = (await api('GET', '/api/parts', login.body.token)).body?.datos ?? [];
      aparece = partes.some((p) => p.code === codigo);
    }
  } catch {
    aparece = false;
  }
  if (!aparece) {
    abortar('La API NO está conectada a motorix_test; detén el guion y arranca la API con DB_NAME=motorix_test');
  }
  console.log(`  [OK] La API está conectada a motorix_test (marcador ${codigo} visible) (guardia de identidad)`);
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------
const escenarios = [e1PuestaEnMarcha, e2PrecioEnFicha, e3Roles, e4TotalConRefacciones, e5RechazoSinPrecio, e6Cobro, e7Ticket, e8Adopcion, e9Historial, e10Recuperacion];

console.log(`\nValidación del quickstart 005 contra ${baseUrl}`);
await guardiaDeIdentidad();
for (const ejecutar of escenarios) {
  try {
    await ejecutar();
  } catch (error) {
    if (error instanceof DetenerGuion) {
      console.log(`  El guion se detiene: ${error.message}`);
      break; // la falla ya quedó registrada; continuar no es seguro
    }
    verificar(false, `El escenario terminó con una excepción: ${error.message}`, 'ejecución');
    if (ejecutar === e1PuestaEnMarcha) break; // sin API o sin sesión no tiene sentido continuar
  }
}

const aprobadas = total - fallidas.length;
console.log(`\n===== Resumen: ${aprobadas}/${total} verificaciones OK =====`);
if (fallidas.length > 0) {
  console.log('Verificaciones fallidas:');
  for (const f of fallidas) console.log(`  - ${f}`);
}
if (hallazgos.length > 0) {
  console.log('\nHallazgos conocidos (no suman a las fallidas ni afectan el código de salida):');
  console.log('  - H-14: el seed 004 (Sprint 2) no es idempotente; apply-seeds duplica servicios y mano de obra de las órdenes 2 y 4');
  for (const h of hallazgos) console.log(`      ${h.detalle}`);
}
const codigoDeSalida = fallidas.length === 0 ? 0 : 1;
console.log(`\nCodigo de salida del guion: ${codigoDeSalida}`);
process.exit(codigoDeSalida);
