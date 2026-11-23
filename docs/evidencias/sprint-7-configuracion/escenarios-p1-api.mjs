#!/usr/bin/env node
/**
 * Escenarios E2 a E4 del quickstart del bloque P1 del Sprint 7
 * (008-configuracion-seguridad-reportes, T057) ejecutados contra la API REAL:
 * datos del taller en el ticket (CA-1), márgenes y orden detenida (CA-2, CA-3),
 * catálogo, línea con tipo, propuesta y «Próximo servicio» (CA-4, CA-5, CA-14) y
 * permisos por rol (CA-10).
 *
 * Uso: node docs/evidencias/sprint-7-configuracion/escenarios-p1-api.mjs [URL_BASE]
 *
 * PRECONDICIONES: la API corre con DB_NAME=motorix_test (NUNCA contra `motorix`):
 * este guion ESCRIBE (cambia ajustes, crea una orden, tipos y un mantenimiento).
 * La base debe estar recién migrada (001-021) y sembrada (001-010); el guion
 * consume datos y no es re-ejecutable sobre la misma base. El guion se niega a
 * correr si la configuración no está en sus valores de respaldo o si falta el
 * ticket de ejemplo 9001. Cuentas de ejemplo: QS_ADMIN_CLAVE, QS_RECEPCION_CLAVE y
 * QS_MECANICO_CLAVE permiten cambiar sus contraseñas. Código de salida 0 solo si
 * todo coincide.
 */
const base = (process.argv[2] ?? 'http://localhost:3055').replace(/\/+$/, '');
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

function fechaLocal(dias) {
  const f = new Date();
  f.setHours(0, 0, 0, 0);
  f.setDate(f.getDate() + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

const t = {};
for (const [rol, [usuario, clave]] of Object.entries(cuentas)) {
  const r = await api('POST', '/api/auth/login', null, { identificacion: usuario, contrasena: clave });
  t[rol] = r.cuerpo?.token;
  if (!t[rol]) {
    console.error(`No se pudo iniciar sesión como ${rol}.`);
    process.exit(2);
  }
}

// Guardias de precondición: base sembrada y sin cambios.
const inicial = await api('GET', '/api/settings', t.admin);
const ticketEjemplo = await api('GET', '/api/tickets/9001', t.recepcion);
if (
  inicial.cuerpo?.taller?.nombre !== 'Motorix' ||
  inicial.cuerpo?.operacion?.margenProximoDias !== 30 ||
  ticketEjemplo.status !== 200
) {
  console.error('La base no está recién sembrada (configuración de respaldo y ticket 9001). Se detiene sin escribir.');
  process.exit(2);
}

const NUEVO = { nombre: 'Taller El Pistón', direccion: 'Calle Real 45, Col. Norte', telefono: '555-123-4567' };

console.log('===== E2 - Datos del taller en el ticket (CA-1) =====');
const guardado = await api('PUT', '/api/settings', t.admin, { taller: NUEVO });
verificar(guardado.status === 200 && guardado.cuerpo?.taller?.nombre === NUEVO.nombre, 'ADMIN guarda los datos del taller', JSON.stringify(guardado.cuerpo));
for (const rol of ['recepcion', 'mecanico']) {
  const prohibido = await api('PUT', '/api/settings', t[rol], { taller: { nombre: 'Intento' } });
  verificar(prohibido.status === 403, `${rol} no puede editar la configuración (403)`, String(prohibido.status));
}

const orden = await api('POST', '/api/orders', t.recepcion, { vehicleId: 1, mileageEntry: 60000, reason: 'Escenarios P1' });
const ordenId = orden.cuerpo?.id;
verificar(orden.status === 201 && Boolean(ordenId), 'recepción crea una orden nueva para el ticket', JSON.stringify(orden.cuerpo));
await api('PATCH', `/api/orders/${ordenId}/status`, t.recepcion, { status: 'DIAGNOSTICO' });
const lineaSinTipo = await api('POST', `/api/orders/${ordenId}/services`, t.recepcion, {
  description: 'Revisión general',
  amount: 650,
  kind: 'SERVICE',
});
verificar(lineaSinTipo.status === 201 && lineaSinTipo.cuerpo?.serviceTypeId === undefined, 'una línea sin tipo no incluye serviceTypeId', JSON.stringify(lineaSinTipo.cuerpo));

const ticketNuevo = await api('GET', `/api/tickets/${ordenId}`, t.recepcion);
verificar(
  ticketNuevo.status === 200 && ticketNuevo.cuerpo?.taller?.nombre === NUEVO.nombre && ticketNuevo.cuerpo?.taller?.telefono === NUEVO.telefono,
  'el ticket nuevo muestra los datos nuevos del taller',
  JSON.stringify(ticketNuevo.cuerpo?.taller)
);
verificar(ticketNuevo.cuerpo?.proximoServicio === undefined, 'sin tipos, el ticket nuevo no muestra «Próximo servicio»');

await api('PUT', '/api/settings', t.admin, { taller: { nombre: 'Otro Nombre', telefono: '555-999-9999' } });
const ticketIgual = await api('GET', `/api/tickets/${ordenId}`, t.recepcion);
verificar(ticketIgual.cuerpo?.taller?.nombre === NUEVO.nombre, 'cambiar la configuración NO cambia el ticket ya emitido', JSON.stringify(ticketIgual.cuerpo?.taller));
const ticket9001 = await api('GET', '/api/tickets/9001', t.recepcion);
verificar(ticket9001.cuerpo?.taller?.nombre === 'Motorix', 'el ticket de ejemplo 9001 conserva su instantánea', JSON.stringify(ticket9001.cuerpo?.taller));
const ticketAnterior = await api('GET', '/api/tickets/4', t.recepcion);
verificar(ticketAnterior.cuerpo?.taller?.nombre === 'Otro Nombre', 'un ticket anterior al sprint (sin instantánea) muestra los datos vigentes', JSON.stringify(ticketAnterior.cuerpo?.taller));
await api('PUT', '/api/settings', t.admin, { taller: { nombre: 'Motorix', direccion: 'Av. Taller 123, Col. Centro', telefono: '555-000-0000' } });

console.log('===== E3 - Márgenes y orden detenida (CA-2, CA-3) =====');
const claves = async () => (await api('GET', '/api/notifications', t.admin)).cuerpo?.datos?.map((a) => a.clave) ?? [];
const porDefecto = await claves();
verificar(porDefecto.includes('MANTENIMIENTO:6:PROXIMO'), 'con los valores de respaldo, el mantenimiento 6 (vence en 10 días) es próximo');
verificar(porDefecto.includes('ORDEN:3:DETENIDA'), 'con los valores de respaldo, la orden 3 (5 días sin cambio) está detenida');
const listaAntes = await api('GET', '/api/maintenances', t.admin);
const panelAntes = await api('GET', '/api/dashboard', t.admin);

const ajustados = await api('PUT', '/api/settings', t.admin, { operacion: { margenProximoDias: 5, margenProximoKm: 500, diasOrdenDetenida: 10 } });
verificar(ajustados.status === 200, 'ADMIN ajusta los márgenes (5 días, 500 km y 10 días)');
const conAjustes = await claves();
verificar(!conAjustes.includes('MANTENIMIENTO:6:PROXIMO'), 'con margen de 5 días, el mantenimiento a 10 días ya no es próximo');
verificar(!conAjustes.includes('ORDEN:3:DETENIDA'), 'con 10 días de orden detenida, la orden 3 deja de estar detenida');
const pendientes = (await api('GET', '/api/client-notices/pending', t.recepcion)).cuerpo?.datos?.map((h) => `${h.tipo}:${h.hechoId}`) ?? [];
verificar(!pendientes.includes('MANTENIMIENTO:6'), 'clientes por avisar usa el mismo margen', JSON.stringify(pendientes));
const listaDespues = await api('GET', '/api/maintenances', t.admin);
const panelDespues = await api('GET', '/api/dashboard', t.admin);
verificar(JSON.stringify(listaAntes.cuerpo) === JSON.stringify(listaDespues.cuerpo), 'la lista de Mantenimientos no cambia');
verificar(JSON.stringify(panelAntes.cuerpo?.mantenimientos) === JSON.stringify(panelDespues.cuerpo?.mantenimientos), 'el panel de control no cambia (mantenimientos)');
for (const operacion of [{ margenProximoDias: 0 }, { margenProximoDias: 366 }, { margenProximoKm: 99 }, { diasOrdenDetenida: 91 }, { margenProximoDias: 'abc' }]) {
  const rechazado = await api('PUT', '/api/settings', t.admin, { operacion });
  verificar(rechazado.status === 400, `valor fuera de límites ${JSON.stringify(operacion)} → 400`, String(rechazado.status));
}
await api('PUT', '/api/settings', t.admin, { operacion: { margenProximoDias: 30, margenProximoKm: 1000, diasOrdenDetenida: 3 } });
const restaurado = await claves();
verificar(
  restaurado.includes('MANTENIMIENTO:6:PROXIMO') && restaurado.includes('ORDEN:3:DETENIDA'),
  'al volver a los valores de respaldo regresan los avisos del Sprint 6'
);

console.log('===== E4 - Catálogo, línea con tipo, próximo servicio y propuesta (CA-4, CA-5, CA-14) =====');
const duplicado = await api('POST', '/api/service-types', t.admin, { nombre: 'cambio de aceite', intervaloDias: 30 });
verificar(duplicado.status === 409 && duplicado.cuerpo?.error?.codigo === 'SERVICE_TYPE_DUPLICATE', 'un nombre repetido (sin distinguir mayúsculas) se rechaza (409)');
const sinIntervalo = await api('POST', '/api/service-types', t.admin, { nombre: 'Sin intervalos' });
verificar(sinIntervalo.status === 400, 'un tipo sin intervalos se rechaza (400)');
const alta = await api('POST', '/api/service-types', t.admin, { nombre: 'Alineación y balanceo', intervaloDias: 60, intervaloKm: 8000 });
const tipoId = alta.cuerpo?.id;
verificar(alta.status === 201 && Boolean(tipoId), 'ADMIN crea el tipo «Alineación y balanceo» (60 días y 8,000 km)', JSON.stringify(alta.cuerpo));
const altaRecepcion = await api('POST', '/api/service-types', t.recepcion, { nombre: 'Intento', intervaloDias: 10 });
verificar(altaRecepcion.status === 403, 'recepción no administra el catálogo (403)');
const lecturaRecepcion = await api('GET', '/api/service-types', t.recepcion);
verificar(lecturaRecepcion.status === 200 && lecturaRecepcion.cuerpo?.datos?.some((x) => x.id === tipoId), 'recepción sí consulta los tipos activos');

const conTipo = await api('POST', `/api/orders/${ordenId}/services`, t.recepcion, {
  description: 'Alineación y balanceo',
  amount: 400,
  kind: 'SERVICE',
  serviceTypeId: tipoId,
});
verificar(conTipo.status === 201 && conTipo.cuerpo?.serviceTypeId === tipoId, 'recepción agrega una línea con el tipo', JSON.stringify(conTipo.cuerpo));

const ticketConTipo = await api('GET', `/api/tickets/${ordenId}`, t.recepcion);
verificar(
  ticketConTipo.cuerpo?.proximoServicio?.fecha === fechaLocal(60) && ticketConTipo.cuerpo?.proximoServicio?.kilometraje === 68000,
  'el ticket muestra «Próximo servicio»: hoy + 60 días y 60,000 + 8,000 km',
  JSON.stringify(ticketConTipo.cuerpo?.proximoServicio)
);

const propuesta = await api('GET', `/api/maintenances/proposal?orderId=${ordenId}`, t.admin);
verificar(
  propuesta.cuerpo?.propuesta?.fecha === fechaLocal(60) && propuesta.cuerpo?.propuesta?.kilometraje === 68000,
  'la propuesta desde la orden coincide (fecha y kilometraje)',
  JSON.stringify(propuesta.cuerpo)
);
const registro = await api('POST', '/api/maintenances', t.admin, {
  vehicleId: 1,
  descripcion: 'Alineación y balanceo',
  targetDate: propuesta.cuerpo?.propuesta?.fecha,
  targetMileage: 68500, // el usuario corrige el kilometraje propuesto antes de guardar
});
verificar(registro.status === 201 && registro.cuerpo?.targetMileage === 68500, 'el administrador guarda el mantenimiento con el kilometraje corregido', JSON.stringify(registro.cuerpo));

const baja = await api('PATCH', `/api/service-types/${tipoId}/status`, t.admin, { activo: false });
verificar(baja.status === 200 && baja.cuerpo?.activo === false, 'ADMIN desactiva el tipo');
const lineaInactivo = await api('POST', `/api/orders/${ordenId}/services`, t.recepcion, {
  description: 'Otra alineación',
  amount: 100,
  kind: 'SERVICE',
  serviceTypeId: tipoId,
});
verificar(lineaInactivo.status === 409 && lineaInactivo.cuerpo?.error?.codigo === 'SERVICE_TYPE_INACTIVE', 'un tipo inactivo ya no se puede elegir (409)');
const detalle = await api('GET', `/api/orders/${ordenId}`, t.admin);
verificar(detalle.cuerpo?.services?.some((s) => s.serviceTypeId === tipoId), 'la línea existente conserva su tipo desactivado');
const borrado = await api('DELETE', `/api/service-types/${tipoId}`, t.admin);
verificar(borrado.status === 404, 'no existe forma de borrar un tipo (DELETE → 404)');
const inactivosAdmin = await api('GET', '/api/service-types?incluirInactivos=true', t.admin);
verificar(inactivosAdmin.cuerpo?.datos?.some((x) => x.id === tipoId && x.activo === false), 'ADMIN ve el tipo inactivo con ?incluirInactivos=true');

console.log(fallas === 0 ? 'Resultado: TODO OK' : `Resultado: ${fallas} verificación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
