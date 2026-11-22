/**
 * Textos de los avisos (007-notificaciones-internas, T042).
 *
 * El nombre en español del estado de una orden lo arma el servidor para el
 * detalle del aviso: el mapeo equivalente que ya existe vive solo en el
 * cliente Flutter (`nombreEstadoOrden`), así que el servidor no puede depender
 * de él. Funciones puras, sin base de datos.
 */

const NOMBRES_ESTADO_ORDEN = Object.freeze({
  RECIBIDO: 'Recibido',
  DIAGNOSTICO: 'Diagnóstico',
  EN_REPARACION: 'En reparación',
  ESPERANDO_REFACCION: 'Esperando refacción',
  TERMINADO: 'Terminado',
  ENTREGADO: 'Entregado',
  CANCELADA: 'Cancelada',
});

/** Nombre del estado de una orden en español; si es desconocido devuelve el código tal cual. */
export function nombreEstadoOrden(estado) {
  return NOMBRES_ESTADO_ORDEN[estado] ?? String(estado);
}
