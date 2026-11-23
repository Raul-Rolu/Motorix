#!/usr/bin/env node
/**
 * Verificación por la API (solo lectura) de los datos de ejemplo del Sprint 6
 * (007-notificaciones-internas, T070, CA-12).
 *
 * Uso: node docs/evidencias/sprint-6-notificaciones/verificar-avisos-api.mjs [URL_BASE]
 * Precondición: la API corre contra motorix_test (o una base desechable) con las
 * migraciones 001-018 y los seeds 001-009. Las cuentas son las de ejemplo y
 * pueden cambiarse con QS_ADMIN_CLAVE, QS_RECEPCION_CLAVE y QS_MECANICO_CLAVE.
 * No escribe nada. Código de salida 0 solo si todo coincide.
 */
const base = (process.argv[2] ?? 'http://localhost:3055').replace(/\/+$/, '');
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

async function api(ruta, token) {
  const respuesta = await fetch(`${base}${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: respuesta.status, cuerpo: await respuesta.json().catch(() => null) };
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
}

for (const rol of ['admin', 'recepcion', 'mecanico']) {
  const r = await api('/api/notifications', tokens[rol]);
  const tipos = {};
  for (const aviso of r.cuerpo?.datos ?? []) {
    tipos[aviso.grupo] = (tipos[aviso.grupo] ?? 0) + 1;
  }
  console.log(`  ${rol}: total=${r.cuerpo?.total} noLeidos=${r.cuerpo?.noLeidos} grupos=${JSON.stringify(tipos)}`);
  if (rol === 'admin') {
    for (const tipo of ['MANTENIMIENTO_VENCIDO', 'ORDEN_DETENIDA', 'STOCK', 'MANTENIMIENTO_PROXIMO', 'CITA_DEL_DIA']) {
      verificar((tipos[tipo] ?? 0) >= 1, `ADMIN tiene al menos un aviso de ${tipo}`, JSON.stringify(tipos));
    }
    const bajos = (r.cuerpo?.datos ?? []).filter((a) => a.grupo === 'STOCK' && a.titulo === 'Stock bajo');
    verificar(bajos.length >= 1, 'ADMIN tiene un aviso de stock BAJO', JSON.stringify(tipos));
  }
}

const lista = await api('/api/client-notices/pending', tokens.recepcion);
const hechos = (lista.cuerpo?.datos ?? []).map((h) => `${h.tipo}:${h.hechoId}`);
console.log(`  clientes por avisar (recepcion): ${JSON.stringify(hechos)}`);
verificar(hechos.includes('ORDEN_TERMINADA:6'), 'Clientes por avisar incluye la orden 6', JSON.stringify(hechos));
verificar(hechos.some((h) => h.startsWith('CITA_MANANA:')), 'Clientes por avisar incluye una cita de mañana', JSON.stringify(hechos));
verificar(
  hechos.filter((h) => h.startsWith('MANTENIMIENTO:')).length >= 2,
  'Clientes por avisar incluye mantenimientos (vencidos y próximo)',
  JSON.stringify(hechos)
);
verificar(hechos.includes('MANTENIMIENTO:6'), 'Clientes por avisar incluye el mantenimiento 6 (próximo)', JSON.stringify(hechos));
const mecanico = await api('/api/client-notices/pending', tokens.mecanico);
verificar(mecanico.status === 403, 'MECHANIC recibe 403 en Clientes por avisar', `status ${mecanico.status}`);

console.log(`Código de salida del guion: ${fallas === 0 ? 0 : 1}`);
process.exit(fallas === 0 ? 0 : 1);
