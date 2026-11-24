#!/usr/bin/env node
/**
 * Escenarios E5 a E7 del quickstart del bloque P2 del Sprint 7
 * (008-configuracion-seguridad-reportes, T104) ejecutados contra la API REAL:
 * términos y compuerta (CA-16 a CA-19), bitácora (CA-20, CA-21) y contraseñas,
 * renovación de sesión y token inválido (CA-22, CA-23). E8 (no exposición e
 * inyección) corre con Jest y E9 (seeds dos veces) con `doble-corrida-seeds-p2.mjs`.
 *
 * Uso: node docs/evidencias/sprint-7-configuracion/escenarios-p2-api.mjs [URL_BASE]
 *
 * PRECONDICIONES: la API corre con DB_NAME=motorix_test (NUNCA contra `motorix`):
 * este guion ESCRIBE (publica términos, crea y edita un usuario y una refacción,
 * cambia ajustes y contraseñas). La base debe estar recién migrada (001-023) y
 * sembrada (001-011); el guion consume datos y no es re-ejecutable sobre la misma
 * base. Se niega a correr si la versión 1 de los términos no está sin aceptar o si
 * la bitácora no tiene solo las 4 entradas de ejemplo. Las contraseñas de las
 * cuentas de ejemplo salen de QS_ADMIN_CLAVE, QS_RECEPCION_CLAVE y QS_MECANICO_CLAVE
 * (o de sus valores de ejemplo). Código de salida 0 solo si todo coincide.
 */
const argumentos = process.argv.slice(2);
const base = (argumentos.find((a) => !a.startsWith('--')) ?? 'http://localhost:3056').replace(/\/+$/, '');
const cuentas = {
  admin: ['admin', process.env.QS_ADMIN_CLAVE ?? 'Admin123'],
  recepcion: ['recepcion', process.env.QS_RECEPCION_CLAVE ?? 'Recepcion123'],
  mecanico: ['mecanico', process.env.QS_MECANICO_CLAVE ?? 'Mecanico123'],
};

let fallas = 0;
function verificar(condicion, texto, detalle = '') {
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'} ${texto}${condicion ? '' : ` -> ${detalle}`}`);
  if (!condicion) fallas += 1;
}

async function api(metodo, ruta, token, cuerpo) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: respuesta.status, cuerpo: await respuesta.json().catch(() => null) };
}

const codigo = (r) => r.cuerpo?.error?.codigo;
const iniciar = async (usuario, clave) => (await api('POST', '/api/auth/login', null, { identificacion: usuario, contrasena: clave }));

/** Segundos de vigencia de un token (exp − iat), sin verificar la firma. */
function vigencia(token) {
  const { exp, iat } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  return exp - iat;
}

const t = {};
for (const [rol, [usuario, clave]] of Object.entries(cuentas)) {
  const r = await iniciar(usuario, clave);
  t[rol] = r.cuerpo?.token;
  if (!t[rol]) {
    console.error(`No se pudo iniciar sesión como ${rol}.`);
    process.exit(2);
  }
}

// Guardia de precondición: base recién sembrada (términos sin aceptar y solo los ejemplos).
const inicial = await api('GET', '/api/terms/current', t.admin);
if (inicial.cuerpo?.vigente?.version !== 1 || inicial.cuerpo?.aceptada !== false) {
  console.error('La base no está recién sembrada (versión 1 de los términos sin aceptar). Se detiene sin escribir.');
  process.exit(2);
}
const textoV1 = inicial.cuerpo.vigente;

// ---------------------------------------------------------------- E5 -----
console.log('E5 - Términos y condiciones (CA-16 a CA-19)');
const rutasDeModulos = ['/api/clients', '/api/orders', '/api/notifications', '/api/me'];
for (const rol of ['admin', 'recepcion', 'mecanico']) {
  const r = await api('GET', '/api/me', t[rol]);
  verificar(r.status === 403 && codigo(r) === 'TERMS_NOT_ACCEPTED', `${rol}: sin aceptar recibe 403 TERMS_NOT_ACCEPTED`, JSON.stringify(r));
}
for (const ruta of rutasDeModulos) {
  const r = await api('GET', ruta, t.recepcion);
  verificar(r.status === 403 && codigo(r) === 'TERMS_NOT_ACCEPTED', `recepcion sin aceptar: GET ${ruta} → 403 TERMS_NOT_ACCEPTED`, String(r.status));
}
const exentas = [
  ['GET', '/api/terms/current', 200],
  ['POST', '/api/auth/renew', 200],
  ['POST', '/api/auth/logout', 204],
];
for (const [metodo, ruta, esperado] of exentas) {
  const r = await api(metodo, ruta, t.mecanico);
  verificar(r.status === esperado, `mecanico sin aceptar: ${metodo} ${ruta} responde ${esperado}`, String(r.status));
}
for (const [rol, [usuario, clave]] of Object.entries(cuentas)) {
  const aceptar = await api('POST', '/api/terms/accept', t[rol], { termsVersionId: textoV1.id });
  verificar(aceptar.status === 200, `${rol}: acepta la versión 1 (POST /api/terms/accept)`, String(aceptar.status));
  const otra = await iniciar(usuario, clave);
  t[rol] = otra.cuerpo?.token;
  const libre = await api('GET', '/api/me', t[rol]);
  verificar(libre.status === 200, `${rol}: en el siguiente inicio de sesión ya no se vuelve a pedir`, String(libre.status));
}
verificar(
  /uso permitido/i.test(textoV1.terminos) && /confidencialidad/i.test(textoV1.terminos) && /cuentas personales/i.test(textoV1.terminos) && /aviso de privacidad/i.test(textoV1.avisoPrivacidad) && /plantilla/i.test(textoV1.terminos),
  'la versión 1 cubre uso permitido, confidencialidad, cuentas personales y aviso de privacidad, y advierte que es plantilla'
);
const rechazadaPorRol = await api('POST', '/api/terms', t.recepcion, {
  terminos: 'Texto de prueba suficientemente largo.',
  avisoPrivacidad: 'Aviso de prueba suficientemente largo.',
});
verificar(rechazadaPorRol.status === 403 && codigo(rechazadaPorRol) === 'NO_AUTORIZADO', 'recepcion no puede publicar términos (403 NO_AUTORIZADO)', String(rechazadaPorRol.status));
const corta = await api('POST', '/api/terms', t.admin, { terminos: 'corto', avisoPrivacidad: 'corto' });
verificar(corta.status === 400 && codigo(corta) === 'DATOS_INVALIDOS', 'publicar textos de menos de 20 caracteres → 400 DATOS_INVALIDOS', String(corta.status));
const publicada = await api('POST', '/api/terms', t.admin, {
  terminos: 'Términos propios del taller, versión dos, publicados durante la verificación.',
  avisoPrivacidad: 'Aviso de privacidad propio del taller, versión dos.',
});
verificar(publicada.status === 201 && publicada.cuerpo?.version === 2, 'admin publica la versión 2', JSON.stringify(publicada.cuerpo));
for (const rol of ['admin', 'recepcion', 'mecanico']) {
  const r = await api('GET', '/api/me', t[rol]);
  verificar(r.status === 403 && codigo(r) === 'TERMS_NOT_ACCEPTED', `${rol}: con la versión 2 vuelve a necesitar aceptar (incluido el autor)`, String(r.status));
}
const vieja = await api('POST', '/api/terms/accept', t.admin, { termsVersionId: textoV1.id });
verificar(vieja.status === 409 && codigo(vieja) === 'TERMS_VERSION_OUTDATED', 'aceptar la versión 1 ya no es posible (409 TERMS_VERSION_OUTDATED)', String(vieja.status));
for (const rol of ['admin', 'recepcion', 'mecanico']) {
  const r = await api('POST', '/api/terms/accept', t[rol], { termsVersionId: publicada.cuerpo?.id });
  verificar(r.status === 200, `${rol}: acepta la versión 2`, String(r.status));
}
const aceptaciones = await api('GET', '/api/terms/acceptances', t.admin);
verificar(
  aceptaciones.status === 200 && aceptaciones.cuerpo?.vigente?.version === 2 && aceptaciones.cuerpo?.total === 6,
  'admin ve la versión vigente (2) y 6 aceptaciones (3 cuentas × 2 versiones)',
  JSON.stringify([aceptaciones.cuerpo?.vigente, aceptaciones.cuerpo?.total])
);
const aceptacionesRecepcion = await api('GET', '/api/terms/acceptances', t.recepcion);
verificar(aceptacionesRecepcion.status === 403, 'recepcion no ve las aceptaciones (403)', String(aceptacionesRecepcion.status));

// ---------------------------------------------------------------- E6 -----
console.log('E6 - Bitácora (CA-20, CA-21)');
const claveNuevaUsuario = 'Secreto123x';
await iniciar('visitante-inexistente', 'ClaveQueNoSeGuarda1'); // inicio de sesión fallido
const alta = await api('POST', '/api/users', t.admin, {
  username: 'prueba.p2', email: 'prueba.p2@motorix.local', fullName: 'Usuario de prueba P2', role: 'MECHANIC', password: claveNuevaUsuario,
});
verificar(alta.status === 201, 'admin da de alta un usuario', JSON.stringify(alta.cuerpo));
const idNuevo = alta.cuerpo?.id;
const cambioRol = await api('PUT', `/api/users/${idNuevo}`, t.admin, {
  username: 'prueba.p2', email: 'prueba.p2@motorix.local', fullName: 'Usuario de prueba P2', role: 'RECEPTIONIST',
});
verificar(cambioRol.status === 200, 'admin cambia el rol del usuario', String(cambioRol.status));
verificar((await api('PATCH', `/api/users/${idNuevo}/status`, t.admin, { active: false })).status === 204, 'admin desactiva al usuario');
verificar((await api('PATCH', `/api/users/${idNuevo}/status`, t.admin, { active: true })).status === 204, 'admin lo reactiva');
const ajustes = await api('PUT', '/api/settings', t.admin, { taller: { telefono: '555-999-0000' } });
verificar(ajustes.status === 200, 'admin cambia un ajuste del taller', String(ajustes.status));
const parte = await api('POST', '/api/parts', t.admin, { name: 'Refacción de prueba P2', code: 'P2-PRUEBA-1', stock: 3, salePrice: 100, purchasePrice: 60 });
verificar(parte.status === 201, 'admin crea una refacción', JSON.stringify(parte.cuerpo));
const edicion = await api('PUT', `/api/parts/${parte.cuerpo?.id}`, t.admin, { salePrice: 120, purchasePrice: 71.25 });
verificar(edicion.status === 200, 'admin cambia los precios de venta y de compra', JSON.stringify(edicion.cuerpo));

const bitacora = await api('GET', '/api/audit-log', t.admin);
const filas = bitacora.cuerpo?.datos ?? [];
const acciones = new Set(filas.map((f) => f.accion));
const esperadas = ['LOGIN_FAILED', 'USER_CREATED', 'USER_ROLE_CHANGED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'SETTINGS_UPDATED', 'PART_SALE_PRICE_CHANGED', 'PART_PURCHASE_PRICE_CHANGED', 'TERMS_PUBLISHED'];
verificar(bitacora.status === 200 && esperadas.every((a) => acciones.has(a)), 'la bitácora muestra las 9 acciones del catálogo', JSON.stringify([...acciones]));
verificar(filas.every((f) => f.fecha && 'usuario' in f), 'cada entrada trae fecha y usuario (null si no hay cuenta)');
const compra = filas.find((f) => f.accion === 'PART_PURCHASE_PRICE_CHANGED');
verificar(compra?.detalle === 'Precio de compra modificado' && !/71|60/.test(compra.detalle), 'el cambio del precio de compra aparece SIN importes', compra?.detalle);
const venta = filas.find((f) => f.accion === 'PART_SALE_PRICE_CHANGED' && /100\.00 → 120\.00/.test(f.detalle ?? ''));
verificar(Boolean(venta), 'el cambio del precio de venta muestra anterior → nuevo (100.00 → 120.00)');
const fallido = filas.find((f) => f.accion === 'LOGIN_FAILED' && /visitante-inexistente/.test(f.detalle ?? ''));
verificar(fallido && fallido.usuario === null, 'el inicio de sesión fallido de una cuenta inexistente queda con usuario null');
const textoBitacora = JSON.stringify(filas);
verificar(!/\$2[abxy]\$/.test(textoBitacora) && !/eyJ[A-Za-z0-9_-]{10,}\./.test(textoBitacora), 'ninguna entrada contiene hashes ni tokens');
verificar(!textoBitacora.includes(claveNuevaUsuario) && !textoBitacora.includes('ClaveQueNoSeGuarda1') && !textoBitacora.includes(cuentas.admin[1]), 'ninguna entrada contiene las contraseñas usadas');
for (const [metodo, ruta] of [['POST', '/api/audit-log'], ['PUT', '/api/audit-log/1'], ['PATCH', '/api/audit-log/1'], ['DELETE', '/api/audit-log/1'], ['GET', '/api/audit-log/export']]) {
  const r = await api(metodo, ruta, t.admin, metodo === 'GET' || metodo === 'DELETE' ? undefined : {});
  verificar(r.status === 404, `no existe ${metodo} ${ruta} (404)`, String(r.status));
}
for (const rol of ['recepcion', 'mecanico']) {
  const r = await api('GET', '/api/audit-log', t[rol]);
  verificar(r.status === 403, `${rol} recibe 403 en la bitácora`, String(r.status));
}
const filtrada = await api('GET', '/api/audit-log?accion=TERMS_PUBLISHED', t.admin);
verificar(filtrada.cuerpo?.total === 1 && filtrada.cuerpo?.datos?.[0]?.accion === 'TERMS_PUBLISHED', 'el filtro por acción devuelve solo la publicación de términos');
const invalido = await api('GET', '/api/audit-log?desde=2026-13-45', t.admin);
verificar(invalido.status === 400 && codigo(invalido) === 'DATOS_INVALIDOS', 'un filtro de fecha inválido responde 400 DATOS_INVALIDOS', String(invalido.status));

// ---------------------------------------------------------------- E7 -----
console.log('E7 - Contraseñas y sesión por inactividad (CA-22, CA-23)');
const claveActual = cuentas.recepcion[1];
for (const [descripcion, clave] of [
  ['de 7 caracteres', 'Abcde12'],
  ['sin mayúscula', 'abcdefg12'],
  ['sin minúscula', 'ABCDEFG12'],
  ['sin número', 'Abcdefghi'],
]) {
  const r = await api('POST', '/api/auth/change-password', t.recepcion, { contrasenaActual: claveActual, contrasenaNueva: clave });
  verificar(r.status === 400 && codigo(r) === 'CONTRASENA_INVALIDA', `contraseña ${descripcion} → 400 CONTRASENA_INVALIDA`, JSON.stringify(r.cuerpo));
}
const valida = await api('POST', '/api/auth/change-password', t.recepcion, { contrasenaActual: claveActual, contrasenaNueva: 'NuevaClave2026' });
verificar(valida.status === 204, 'una contraseña válida se acepta (204)', String(valida.status));
verificar((await iniciar('recepcion', 'NuevaClave2026')).status === 200, 'se puede iniciar sesión con la contraseña nueva');
verificar((await iniciar('recepcion', claveActual)).status === 401, 'la contraseña anterior ya no sirve (401)');
const restaurar = await api('POST', '/api/auth/change-password', (await iniciar('recepcion', 'NuevaClave2026')).cuerpo?.token, { contrasenaActual: 'NuevaClave2026', contrasenaNueva: claveActual });
verificar(restaurar.status === 204, 'se restaura la contraseña de ejemplo');

const cinco = await api('PUT', '/api/settings', t.admin, { seguridad: { minutosInactividad: 5 } });
verificar(cinco.status === 200 && cinco.cuerpo?.seguridad?.minutosInactividad === 5, 'admin fija 5 minutos de inactividad', JSON.stringify(cinco.cuerpo?.seguridad));
for (const valor of [4, 121]) {
  const r = await api('PUT', '/api/settings', t.admin, { seguridad: { minutosInactividad: valor } });
  verificar(r.status === 400 && codigo(r) === 'DATOS_INVALIDOS', `${valor} minutos de inactividad se rechaza (rango 5 a 120)`, String(r.status));
}
const login5 = await iniciar('mecanico', cuentas.mecanico[1]);
verificar(login5.cuerpo?.inactividadMinutos === 5 && vigencia(login5.cuerpo?.token) === 300, 'el login informa inactividadMinutos 5 y el token dura 300 s', JSON.stringify([login5.cuerpo?.inactividadMinutos, vigencia(login5.cuerpo?.token)]));
const renovado = await api('POST', '/api/auth/renew', login5.cuerpo?.token);
verificar(renovado.status === 200 && renovado.cuerpo?.inactividadMinutos === 5 && vigencia(renovado.cuerpo?.token) === 300, 'POST /api/auth/renew entrega un token nuevo de 300 s', JSON.stringify(renovado.cuerpo));
const aviso = await fetch(`${base}/api/notifications`, { headers: { Authorization: `Bearer ${login5.cuerpo?.token}` } });
verificar(aviso.status === 200 && !aviso.headers.has('authorization') && !('token' in (await aviso.json())), 'la consulta de avisos no emite ni renueva ningún token (no mantiene la sesión)');
await api('PUT', '/api/settings', t.admin, { seguridad: { minutosInactividad: 30 } });
const login30 = await iniciar('mecanico', cuentas.mecanico[1]);
verificar(login30.cuerpo?.inactividadMinutos === 30 && vigencia(login30.cuerpo?.token) === 1800, 'con el ajuste de vuelta a 30, el token vuelve a durar 1800 s');

const basura = await api('GET', '/api/me', 'no-es-un-token');
verificar(basura.status === 401, 'un token inválido responde 401', String(basura.status));
const tokenDelUsuario = (await iniciar('prueba.p2', claveNuevaUsuario)).cuerpo?.token;
await api('POST', '/api/terms/accept', tokenDelUsuario, { termsVersionId: publicada.cuerpo?.id });
verificar(tokenDelUsuario && (await api('GET', '/api/me', tokenDelUsuario)).status === 200, 'el usuario de prueba entra con su token (tras aceptar la versión 2)');
await api('PATCH', `/api/users/${idNuevo}/status`, t.admin, { active: false });
verificar((await api('GET', '/api/me', tokenDelUsuario)).status === 401, 'tras desactivar al usuario, su token deja de servir (401)');
verificar((await api('POST', '/api/auth/renew', tokenDelUsuario)).status === 401, 'tampoco puede renovarlo (401)');
console.log('  (Un token VENCIDO responde 401: lo cubre `session-renewal.test.js`; no se puede esperar la vigencia en un guion.)');

console.log(fallas === 0 ? 'Resultado: TODO OK' : `Resultado: ${fallas} verificación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
