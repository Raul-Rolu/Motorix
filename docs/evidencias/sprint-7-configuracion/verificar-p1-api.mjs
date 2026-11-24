#!/usr/bin/env node
/**
 * Verificación por la API (solo lectura) de los datos de ejemplo del bloque P1
 * del Sprint 7 (008-configuracion-seguridad-reportes, T049/T057, CA-1 a CA-5,
 * CA-10, CA-12, CA-14).
 *
 * Uso: node docs/evidencias/sprint-7-configuracion/verificar-p1-api.mjs [URL_BASE] [--aceptar-terminos]
 * Precondición: la API corre contra motorix_test (o una base desechable) con las
 * migraciones 001-021 y los seeds 001-010. Las cuentas son las de ejemplo y
 * pueden cambiarse con QS_ADMIN_CLAVE, QS_RECEPCION_CLAVE y QS_MECANICO_CLAVE.
 * No escribe nada, salvo con `--aceptar-terminos` (paso opcional para bases con
 * las migraciones 022-023 y el seed 011): cada cuenta de ejemplo acepta la
 * versión vigente de los términos; sin la bandera, y con una versión sin aceptar,
 * el guion se detiene explicando qué hacer. Código de salida 0 solo si todo coincide.
 */
const argumentos = process.argv.slice(2);
const aceptarTerminos = argumentos.includes('--aceptar-terminos');
const base = (argumentos.find((a) => !a.startsWith('--')) ?? 'http://localhost:3055').replace(/\/+$/, '');
const cuentas = {
  admin: ['admin', process.env.QS_ADMIN_CLAVE ?? 'Admin123'],
  recepcion: ['recepcion', process.env.QS_RECEPCION_CLAVE ?? 'Recepcion123'],
  mecanico: ['mecanico', process.env.QS_MECANICO_CLAVE ?? 'Mecanico123'],
};

let fallas = 0;
function verificar(condicion, texto, detalle = '') {
  console.log(`${condicion ? 'OK   ' : 'FALLA'} ${texto}${condicion ? '' : ` -> ${detalle}`}`);
  if (!condicion) fallas += 1;
}


/**
 * Paso opcional (008, bloque P2, compuerta de términos): con una versión vigente
 * sin aceptar, la API responde 403 TERMS_NOT_ACCEPTED a todo lo demás. Sin la
 * bandera `--aceptar-terminos` el guion se detiene con una explicación; con ella,
 * cada cuenta acepta la versión vigente (POST /api/terms/accept). En una base sin
 * versión publicada (o sin la migración 023) no hace nada.
 */
async function aceptarTerminosSiFalta(rol, token) {
  const actual = await fetch(`${base}/api/terms/current`, { headers: { Authorization: `Bearer ${token}` } });
  if (actual.status !== 200) return;
  const { vigente, aceptada } = await actual.json();
  if (!vigente || aceptada) return;
  if (!aceptarTerminos) {
    console.error(
      `${rol} debe aceptar la versión ${vigente.version} de los términos antes de continuar. ` +
        'Vuelva a ejecutar con --aceptar-terminos (registra la aceptación de las cuentas de ejemplo).'
    );
    process.exit(2);
  }
  const respuesta = await fetch(`${base}/api/terms/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ termsVersionId: vigente.id }),
  });
  verificar(respuesta.status === 200, `${rol} acepta la versión ${vigente.version} de los términos`, String(respuesta.status));
}

async function api(ruta, token) {
  const respuesta = await fetch(`${base}${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: respuesta.status, cuerpo: await respuesta.json().catch(() => null) };
}

/** Fecha local AAAA-MM-DD a N días de hoy. */
function fechaLocal(dias) {
  const f = new Date();
  f.setHours(0, 0, 0, 0);
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

const tokens = {};
for (const [rol, [usuario, clave]] of Object.entries(cuentas)) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificacion: usuario, contrasena: clave }),
  });
  tokens[rol] = (await r.json()).token;
  verificar(Boolean(tokens[rol]), `inicio de sesión de ${rol}`);
  await aceptarTerminosSiFalta(rol, tokens[rol]);
}

// US1/US2: configuración (solo ADMIN).
const ajustes = await api('/api/settings', tokens.admin);
verificar(ajustes.status === 200, 'ADMIN consulta la configuración', String(ajustes.status));
verificar(ajustes.cuerpo?.taller?.nombre === 'Motorix', 'datos del taller sembrados', JSON.stringify(ajustes.cuerpo?.taller));
verificar(
  ajustes.cuerpo?.operacion?.margenProximoDias === 30 &&
    ajustes.cuerpo?.operacion?.margenProximoKm === 1000 &&
    ajustes.cuerpo?.operacion?.diasOrdenDetenida === 3,
  'márgenes de operación: 30 días, 1,000 km y 3 días',
  JSON.stringify(ajustes.cuerpo?.operacion)
);
for (const rol of ['recepcion', 'mecanico']) {
  const prohibido = await api('/api/settings', tokens[rol]);
  verificar(prohibido.status === 403, `${rol} recibe 403 en la configuración`, String(prohibido.status));
}

// US3: catálogo (lectura para los tres roles; inactivos solo ADMIN).
for (const rol of ['admin', 'recepcion', 'mecanico']) {
  const tipos = await api('/api/service-types', tokens[rol]);
  const nombres = (tipos.cuerpo?.datos ?? []).map((t) => t.nombre);
  verificar(
    nombres.length === 4 && nombres.includes('Cambio de aceite'),
    `${rol} consulta los 4 tipos de servicio activos`,
    JSON.stringify(nombres)
  );
}
const inactivosRecepcion = await api('/api/service-types?incluirInactivos=true', tokens.recepcion);
verificar(inactivosRecepcion.status === 403, 'recepcion recibe 403 al pedir inactivos', String(inactivosRecepcion.status));

// US4: ticket de la orden 9001 con instantánea y «Próximo servicio».
const ticket = await api('/api/tickets/9001', tokens.recepcion);
console.log(`  ticket 9001: ${JSON.stringify({ folio: ticket.cuerpo?.folio, taller: ticket.cuerpo?.taller, proximoServicio: ticket.cuerpo?.proximoServicio })}`);
verificar(ticket.status === 200, 'recepcion abre el ticket de la orden 9001', String(ticket.status));
verificar(
  ticket.cuerpo?.proximoServicio?.fecha !== undefined &&
    ticket.cuerpo?.proximoServicio?.kilometraje === 36200,
  'el ticket 9001 muestra el próximo servicio (kilometraje 31,200 + 5,000)',
  JSON.stringify(ticket.cuerpo?.proximoServicio)
);
// La fecha base es la emisión del ticket (hace 1 día): emisión + 180 días.
verificar(
  ticket.cuerpo?.proximoServicio?.fecha === fechaLocal(179),
  'la fecha del próximo servicio es la de emisión del ticket más 180 días',
  JSON.stringify(ticket.cuerpo?.proximoServicio)
);
verificar(ticket.cuerpo?.total === 950 && ticket.cuerpo?.estadoPago === 'LIQUIDADA', 'el ticket 9001 está liquidado por 950', JSON.stringify({ total: ticket.cuerpo?.total, estado: ticket.cuerpo?.estadoPago }));

// Un ticket de un sprint anterior no cambia: sin «Próximo servicio».
const anterior = await api('/api/tickets/4', tokens.recepcion);
verificar(anterior.status === 200 && anterior.cuerpo?.proximoServicio === undefined, 'el ticket de la orden 4 (anterior al sprint) NO muestra próximo servicio', JSON.stringify(anterior.cuerpo?.proximoServicio));
verificar(anterior.cuerpo?.taller?.nombre === 'Motorix', 'el ticket anterior usa los datos vigentes del taller');

// US3: propuesta desde la orden 9001 (el mecánico de ejemplo es el asignado).
const propuesta = await api('/api/maintenances/proposal?orderId=9001', tokens.mecanico);
console.log(`  propuesta 9001: ${JSON.stringify(propuesta.cuerpo)}`);
verificar(
  propuesta.status === 200 &&
    propuesta.cuerpo?.propuesta?.fecha === fechaLocal(180) &&
    propuesta.cuerpo?.propuesta?.kilometraje === 36200 &&
    propuesta.cuerpo?.propuesta?.servicio === 'Cambio de aceite',
  'la propuesta desde la orden 9001 es hoy + 180 días y 36,200 km',
  JSON.stringify(propuesta.cuerpo)
);
const recepcionPropone = await api('/api/maintenances/proposal?orderId=9001', tokens.recepcion);
verificar(recepcionPropone.status === 403, 'recepcion recibe 403 en la propuesta', String(recepcionPropone.status));

// Lo del Sprint 6 sigue igual: avisos sin cambios y la orden entregada no se avisa.
const lista = await api('/api/client-notices/pending', tokens.recepcion);
const hechos = (lista.cuerpo?.datos ?? []).map((h) => `${h.tipo}:${h.hechoId}`);
verificar(!hechos.includes('ORDEN_TERMINADA:9001'), 'la orden entregada 9001 no aparece en clientes por avisar', JSON.stringify(hechos));
const avisos = await api('/api/notifications', tokens.admin);
verificar(avisos.status === 200, 'el centro de avisos sigue respondiendo', String(avisos.status));

console.log(fallas === 0 ? 'Resultado: TODO OK' : `Resultado: ${fallas} verificación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
