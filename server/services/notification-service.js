/**
 * Servicio de avisos internos (007-notificaciones-internas, T016; FR-001 a
 * FR-005, CA-1 a CA-3, CA-5).
 *
 * Los avisos NO se almacenan (RN-10, CA-2): se calculan en cada consulta con
 * datos reales, reutilizando las reglas que ya existen (`esVencido` de
 * `maintenance-state.js` y las consultas de `maintenanceModel`) para que las
 * cifras coincidan con el panel de control y con la lista de Mantenimientos.
 * Lo único que se guardará de un aviso es su lectura por usuario (US6).
 *
 * Cada rol recibe solo lo que le corresponde, validado aquí en el servidor
 * (RN-5, RN-15): ADMIN y RECEPTIONIST ven los mantenimientos; MECHANIC no ve
 * ningún aviso de mantenimiento (solo verá los de sus órdenes, US4/US5).
 */
import * as maintenanceModel from '../models/maintenance.js';
import { esVencido, diasRestantes, kmRestantes, proximidad } from './maintenance-state.js';
import { construirClave } from '../utils/notification-keys.js';

/** Grupos de aviso en el orden de presentación del panel (contracts/api-rest.md). */
export const GRUPOS = Object.freeze([
  'MANTENIMIENTO_VENCIDO',
  'ORDEN_DETENIDA',
  'STOCK',
  'MANTENIMIENTO_PROXIMO',
  'CITA_DEL_DIA',
]);

/** Roles que reciben avisos de mantenimiento (data-model.md, sección 6). */
const ROLES_CON_MANTENIMIENTOS = Object.freeze(['ADMIN', 'RECEPTIONIST']);

/** Texto del motivo del vencimiento: por fecha, por kilometraje o por ambos. */
function detalleDeVencimiento(mantenimiento, kmActual) {
  const motivos = [];
  const dias = diasRestantes(mantenimiento.targetDate);
  if (dias != null) {
    if (dias < 0) {
      motivos.push(`vencido hace ${Math.abs(dias)} día(s)`);
    } else if (dias === 0) {
      motivos.push('vence hoy');
    }
  }
  const km = kmRestantes(mantenimiento.targetMileage, kmActual);
  if (km != null) {
    if (km < 0) {
      motivos.push(`kilometraje superado en ${Math.abs(km)} km`);
    } else if (km === 0) {
      motivos.push('kilometraje alcanzado');
    }
  }
  return motivos.join(' y ');
}

/**
 * Avisos de mantenimiento vencido: pendientes cuyo umbral ya se cumplió según
 * la regla existente (`esVencido`, RN-11), la misma del panel y de la lista.
 */
async function avisosDeMantenimientoVencido() {
  const [pendientes, kilometrajes] = await Promise.all([
    maintenanceModel.findAll({ status: 'PENDING' }),
    maintenanceModel.findCurrentMileageByVehicles(),
  ]);

  const avisos = [];
  for (const mantenimiento of pendientes) {
    const kmActual = kilometrajes.get(mantenimiento.vehicleId) ?? 0;
    if (!esVencido(mantenimiento, kmActual)) {
      continue;
    }
    avisos.push({
      clave: construirClave('MANTENIMIENTO', mantenimiento.id, 'VENCIDO'),
      grupo: 'MANTENIMIENTO_VENCIDO',
      estado: 'VENCIDO',
      titulo: 'Mantenimiento vencido',
      detalle: [
        mantenimiento.description,
        mantenimiento.vehiculo.placas,
        detalleDeVencimiento(mantenimiento, kmActual),
      ].join(' · '),
      leido: false,
      destino: { pantalla: 'VEHICULO', id: mantenimiento.vehicleId },
      // Interno: orden por urgencia (el más vencido primero); no se devuelve.
      urgencia: proximidad(mantenimiento, kmActual) ?? 0,
      desempate: mantenimiento.id,
    });
  }
  return avisos;
}

/** Orden de presentación: por grupo y, dentro del grupo, el más urgente primero. */
function compararAvisos(a, b) {
  const porGrupo = GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo);
  if (porGrupo !== 0) {
    return porGrupo;
  }
  if (a.urgencia !== b.urgencia) {
    return a.urgencia - b.urgencia;
  }
  // Mismo criterio de desempate que la lista de Mantenimientos: el más reciente primero.
  return b.desempate - a.desempate;
}

/**
 * Avisos del usuario autenticado, calculados al consultar.
 * @param {{ id: number, role: string }} usuario - Usuario del token (nunca de la petición).
 * @returns {Promise<{ total: number, noLeidos: number, datos: object[] }>}
 */
export async function obtenerAvisos(usuario) {
  const avisos = [];

  if (ROLES_CON_MANTENIMIENTOS.includes(usuario.role)) {
    avisos.push(...(await avisosDeMantenimientoVencido()));
  }

  avisos.sort(compararAvisos);
  const datos = avisos.map(({ urgencia, desempate, ...aviso }) => aviso);
  return {
    total: datos.length,
    noLeidos: datos.filter((aviso) => !aviso.leido).length,
    datos,
  };
}
