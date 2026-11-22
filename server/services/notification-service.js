/**
 * Servicio de avisos internos (007-notificaciones-internas, T016 y T027; FR-001
 * a FR-005, FR-011, FR-012, CA-1 a CA-5).
 *
 * Los avisos NO se almacenan (RN-10, CA-2): se calculan en cada consulta con
 * datos reales, reutilizando las reglas que ya existen (`esVencido` y
 * `esProximo` de `maintenance-state.js`, las consultas de `maintenanceModel` y
 * de `appointmentModel`) para que las cifras coincidan con el panel de control
 * y con la lista de Mantenimientos. Lo único que se guardará de un aviso es su
 * lectura por usuario (US6).
 *
 * Cada rol recibe solo lo que le corresponde, validado aquí en el servidor
 * (RN-5, RN-15): ADMIN y RECEPTIONIST reciben mantenimientos y citas del día;
 * el stock bajo o agotado es solo de ADMIN; MECHANIC no recibe ningún aviso de
 * mantenimiento, citas ni stock (solo recibirá los de sus órdenes, US4/US5).
 */
import * as maintenanceModel from '../models/maintenance.js';
import * as appointmentModel from '../models/appointment.js';
import * as partModel from '../models/part.js';
import * as notificationModel from '../models/notification.js';
import {
  MARGEN_PROXIMO_DIAS,
  MARGEN_PROXIMO_KM,
  diasRestantes,
  esProximo,
  esVencido,
  hoyLocal,
  kmRestantes,
  proximidad,
} from './maintenance-state.js';
import { construirClave } from '../utils/notification-keys.js';
import { nombreEstadoOrden } from '../utils/notification-text.js';

/** Días sin cambio de estado a partir de los cuales una orden está detenida (el Sprint 7 podrá volverla configurable). */
export const DIAS_ORDEN_DETENIDA = 3;

/** Grupos de aviso en el orden de presentación del panel (contracts/api-rest.md). */
export const GRUPOS = Object.freeze([
  'MANTENIMIENTO_VENCIDO',
  'ORDEN_DETENIDA',
  'STOCK',
  'MANTENIMIENTO_PROXIMO',
  'CITA_DEL_DIA',
]);

/** Roles que reciben avisos de mantenimiento y de citas (data-model.md, sección 6). */
const ROLES_CON_MANTENIMIENTOS_Y_CITAS = Object.freeze(['ADMIN', 'RECEPTIONIST']);

/** El stock es solo de administración (data-model.md, sección 6; CA-4). */
const ROL_CON_STOCK = 'ADMIN';

/** El mecánico solo recibe avisos de las órdenes asignadas a él (CA-4). */
const ROL_MECANICO = 'MECHANIC';

/** Fecha local `YYYY-MM-DD` (la misma que usa `hoyLocal()` para «hoy»). */
function fechaCorta(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

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

/** Texto de lo que falta: solo los umbrales que entran en el margen del aviso. */
function detalleDeProximidad(mantenimiento, kmActual) {
  const faltantes = [];
  const dias = diasRestantes(mantenimiento.targetDate);
  if (dias != null && dias <= MARGEN_PROXIMO_DIAS) {
    faltantes.push(`${dias} día(s)`);
  }
  const km = kmRestantes(mantenimiento.targetMileage, kmActual);
  if (km != null && km <= MARGEN_PROXIMO_KM) {
    faltantes.push(`${km} km`);
  }
  return `faltan ${faltantes.join(' o ')}`;
}

/**
 * Avisos de mantenimiento vencido y próximo a partir de los mismos pendientes y
 * del mismo kilometraje actual: vencido usa `esVencido` (RN-11, la regla del
 * panel y de la lista) y próximo usa `esProximo` (márgenes de 30 días o 1,000 km).
 */
async function avisosDeMantenimiento() {
  const [pendientes, kilometrajes] = await Promise.all([
    maintenanceModel.findAll({ status: 'PENDING' }),
    maintenanceModel.findCurrentMileageByVehicles(),
  ]);

  const avisos = [];
  for (const mantenimiento of pendientes) {
    const kmActual = kilometrajes.get(mantenimiento.vehicleId) ?? 0;
    const vencido = esVencido(mantenimiento, kmActual);
    if (!vencido && !esProximo(mantenimiento, kmActual)) {
      continue;
    }
    const detalleDelMotivo = vencido
      ? detalleDeVencimiento(mantenimiento, kmActual)
      : detalleDeProximidad(mantenimiento, kmActual);
    avisos.push({
      clave: construirClave('MANTENIMIENTO', mantenimiento.id, vencido ? 'VENCIDO' : 'PROXIMO'),
      grupo: vencido ? 'MANTENIMIENTO_VENCIDO' : 'MANTENIMIENTO_PROXIMO',
      estado: vencido ? 'VENCIDO' : 'PROXIMO',
      titulo: vencido ? 'Mantenimiento vencido' : 'Mantenimiento próximo',
      detalle: [mantenimiento.description, mantenimiento.vehiculo.placas, detalleDelMotivo].join(' · '),
      leido: false,
      destino: { pantalla: 'VEHICULO', id: mantenimiento.vehicleId },
      // Interno: orden por urgencia (el más vencido o el más cercano primero); no se devuelve.
      urgencia: proximidad(mantenimiento, kmActual) ?? 0,
      desempate: mantenimiento.id,
    });
  }
  return avisos;
}

/** Avisos de citas de hoy: solo las PROGRAMADAS (no canceladas ni completadas). */
async function avisosDeCitasDelDia() {
  const citas = await appointmentModel.findProgramadasPorFecha(fechaCorta(hoyLocal()));
  return citas.map((cita) => {
    const hora = String(cita.appointmentTime).slice(0, 5);
    const [horas, minutos] = hora.split(':').map(Number);
    return {
      clave: construirClave('CITA', cita.id, 'HOY'),
      grupo: 'CITA_DEL_DIA',
      estado: 'HOY',
      titulo: 'Cita de hoy',
      detalle: [hora, cita.cliente.nombreCompleto, cita.vehiculo.placas, cita.reason].join(' · '),
      leido: false,
      destino: { pantalla: 'CITAS', id: cita.id },
      // Interno: las citas van por hora.
      urgencia: horas * 60 + minutos,
      desempate: -cita.id,
    };
  });
}

/**
 * Avisos de orden detenida (FR-010): orden activa sin cambio de estado desde
 * hace más de DIAS_ORDEN_DETENIDA días, medido con `status_changed_at` (que
 * solo actualiza `orderModel.setStatus`). ADMIN y RECEPTIONIST reciben todas;
 * con `mechanicId` (MECHANIC) solo las órdenes asignadas a ese mecánico: una
 * orden sin mecánico no se devuelve a ningún mecánico (CA-4).
 */
async function avisosDeOrdenesDetenidas(mechanicId = null) {
  const ordenes = await notificationModel.findOrdenesDetenidas({
    dias: DIAS_ORDEN_DETENIDA,
    mechanicId,
  });
  return ordenes.map((orden) => ({
    clave: construirClave('ORDEN', orden.id, 'DETENIDA'),
    grupo: 'ORDEN_DETENIDA',
    estado: 'DETENIDA',
    titulo: 'Orden detenida',
    detalle: `Orden #${orden.id} · ${orden.plates} · ${nombreEstadoOrden(orden.status)}, sin cambios hace ${orden.diasSinCambio} día(s)`,
    leido: false,
    destino: { pantalla: 'ORDEN', id: orden.id },
    // Interno: la más antigua primero (más horas sin cambio = más urgente).
    urgencia: -orden.horasSinCambio,
    desempate: -orden.id,
  }));
}

/**
 * Avisos de stock bajo (0 < stock <= mínimo) y agotado (stock 0) con la misma
 * condición que el panel de control (`CONDICION_STOCK_EN_ALERTA`, CA-5). Solo
 * se calculan para ADMIN: RECEPTIONIST y MECHANIC nunca ejecutan esta consulta.
 */
async function avisosDeStock() {
  const refacciones = await partModel.findEnAlerta();
  return refacciones.map((refaccion) => {
    const agotada = refaccion.stock === 0;
    const nombre = `${refaccion.name} (${refaccion.code})`;
    return {
      clave: construirClave('STOCK', refaccion.id, agotada ? 'AGOTADO' : 'BAJO'),
      grupo: 'STOCK',
      estado: agotada ? 'AGOTADO' : 'BAJO',
      titulo: agotada ? 'Stock agotado' : 'Stock bajo',
      detalle: agotada
        ? `${nombre} · sin existencias`
        : `${nombre} · quedan ${refaccion.stock}, mínimo ${refaccion.minStock}`,
      leido: false,
      destino: { pantalla: 'INVENTARIO', id: refaccion.id },
      // Interno: los agotados primero y después los de menos existencias.
      urgencia: refaccion.stock,
      desempate: -refaccion.id,
    };
  });
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
  // Solo se calcula lo que el rol puede recibir (el resto ni siquiera se consulta).
  const calculos = [];
  if (ROLES_CON_MANTENIMIENTOS_Y_CITAS.includes(usuario.role)) {
    calculos.push(avisosDeMantenimiento(), avisosDeCitasDelDia(), avisosDeOrdenesDetenidas());
  } else if (usuario.role === ROL_MECANICO) {
    // El mecánico solo recibe avisos de SUS órdenes (id tomado del token, nunca de la petición).
    calculos.push(avisosDeOrdenesDetenidas(usuario.id));
  }
  if (usuario.role === ROL_CON_STOCK) {
    calculos.push(avisosDeStock());
  }

  const avisos = (await Promise.all(calculos)).flat();
  avisos.sort(compararAvisos);
  const datos = avisos.map(({ urgencia, desempate, ...aviso }) => aviso);
  return {
    total: datos.length,
    noLeidos: datos.filter((aviso) => !aviso.leido).length,
    datos,
  };
}
