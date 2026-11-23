/**
 * Servicio de clientes por avisar (007-notificaciones-internas, T064; FR-014,
 * FR-015, FR-019, CA-10, CA-11).
 *
 * La lista es DERIVADA (RN-10): hechos de orden terminada sin entregar, cita de
 * mañana y mantenimiento vencido o próximo, menos los ya registrados en
 * `client_notices`. Marcar como avisado solo registra quién, cuándo y una nota:
 * el sistema nunca envía el aviso al cliente por ningún canal (el aviso lo hace
 * la persona de recepción). Los permisos (solo ADMIN y RECEPTIONIST) se
 * validan en la ruta; MECHANIC recibe 403.
 *
 * Un hecho se avisa UNA sola vez: la restricción única (notice_type, fact_id)
 * resuelve la concurrencia. Un mantenimiento avisado como próximo que luego
 * vence es el MISMO hecho y no vuelve a la lista; uno nuevo (otro registro) sí.
 */
import * as clientNoticeModel from '../models/client-notice.js';
import * as maintenanceModel from '../models/maintenance.js';
import { esProximo, esVencido, hoyLocal } from './maintenance-state.js';
import { obtenerAjustes } from './settings-service.js';
import { errores } from '../utils/errors.js';
import { diasDespues, fechaCorta } from '../utils/fechas.js';

/** Orden de presentación de los tipos de hecho en la lista. */
const ORDEN_DE_TIPOS = Object.freeze(['ORDEN_TERMINADA', 'CITA_MANANA', 'MANTENIMIENTO']);

function hechoDeOrden(orden) {
  return {
    tipo: 'ORDEN_TERMINADA',
    hechoId: orden.id,
    motivo: `Vehículo listo (orden #${orden.id})`,
    cliente: orden.cliente,
    vehiculo: orden.vehiculo,
    fechaReferencia: orden.fechaReferencia,
  };
}

function hechoDeCita(cita) {
  return {
    tipo: 'CITA_MANANA',
    hechoId: cita.id,
    motivo: `Cita mañana a las ${cita.hora}`,
    cliente: cita.cliente,
    vehiculo: cita.vehiculo,
    fechaReferencia: cita.fecha,
  };
}

/**
 * Mantenimientos vencidos primero y después los próximos; el resto no se avisa.
 * «Próximo» usa los márgenes configurados (008, FR-004), los mismos del centro
 * de notificaciones.
 */
function hechosDeMantenimiento(mantenimientos, kilometrajes, margenes) {
  const vencidos = [];
  const proximos = [];
  for (const mantenimiento of mantenimientos) {
    const kmActual = kilometrajes.get(mantenimiento.vehicleId) ?? 0;
    const esDeVencido = esVencido(mantenimiento, kmActual);
    if (!esDeVencido && !esProximo(mantenimiento, kmActual, undefined, margenes)) {
      continue;
    }
    (esDeVencido ? vencidos : proximos).push({
      tipo: 'MANTENIMIENTO',
      hechoId: mantenimiento.id,
      motivo: `${esDeVencido ? 'Mantenimiento vencido' : 'Mantenimiento próximo'}: ${mantenimiento.description}`,
      cliente: mantenimiento.cliente,
      vehiculo: mantenimiento.vehiculo,
      fechaReferencia: mantenimiento.targetDate,
    });
  }
  return [...vencidos, ...proximos];
}

/** Hechos pendientes de avisar: orden terminada, cita de mañana y mantenimiento. */
export async function listarClientesPorAvisar() {
  const manana = fechaCorta(diasDespues(1, hoyLocal()));
  const [ordenes, citas, mantenimientos, kilometrajes, ajustes] = await Promise.all([
    clientNoticeModel.findOrdenesTerminadasPendientes(),
    clientNoticeModel.findCitasPendientesPorFecha(manana),
    clientNoticeModel.findMantenimientosPendientes(),
    maintenanceModel.findCurrentMileageByVehicles(),
    obtenerAjustes(),
  ]);
  const margenes = { dias: ajustes.margenProximoDias, km: ajustes.margenProximoKm };

  const datos = [
    ...ordenes.map(hechoDeOrden),
    ...citas.map(hechoDeCita),
    ...hechosDeMantenimiento(mantenimientos, kilometrajes, margenes),
  ];
  datos.sort((a, b) => ORDEN_DE_TIPOS.indexOf(a.tipo) - ORDEN_DE_TIPOS.indexOf(b.tipo));
  return { total: datos.length, datos };
}

function detallesDelAvisoPrevio(aviso) {
  return { avisadoPor: aviso.avisadoPor, fecha: aviso.fecha };
}

/**
 * Registra que `usuario` avisó al cliente por un hecho. El hecho debe estar
 * pendiente: ya avisado → CLIENT_NOTICE_DUPLICATE (con quién y cuándo);
 * inexistente o ya no aplica → CLIENT_NOTICE_NOT_PENDING.
 */
export async function marcarAvisado(usuario, { tipo, hechoId, nota }) {
  const idDelHecho = Number(hechoId);

  const previo = await clientNoticeModel.findPorHecho(tipo, idDelHecho);
  if (previo) {
    throw errores.avisoClienteDuplicado(detallesDelAvisoPrevio(previo));
  }

  const { datos } = await listarClientesPorAvisar();
  const hecho = datos.find((candidato) => candidato.tipo === tipo && candidato.hechoId === idDelHecho);
  if (!hecho) {
    throw errores.avisoClienteNoPendiente();
  }

  try {
    return await clientNoticeModel.crear({
      clientId: hecho.cliente.id,
      tipo,
      hechoId: idDelHecho,
      nota: typeof nota === 'string' && nota.trim() !== '' ? nota.trim() : null,
      userId: usuario.id,
    });
  } catch (error) {
    // Otra persona lo registró entre la comprobación y el alta: la restricción única lo impide.
    if (error?.code === 'ER_DUP_ENTRY') {
      const ganador = await clientNoticeModel.findPorHecho(tipo, idDelHecho);
      throw errores.avisoClienteDuplicado(ganador ? detallesDelAvisoPrevio(ganador) : undefined);
    }
    throw error;
  }
}
