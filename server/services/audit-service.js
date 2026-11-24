/**
 * Servicio de la bitácora de acciones sensibles
 * (008-configuracion-seguridad-reportes, T069; FR-011 a FR-014, CA-20, CA-21).
 *
 * `registrar` es «best-effort»: si la escritura falla, el error se registra en el
 * log del servidor y NO interrumpe la operación principal (decisión del plan,
 * riesgo R8). El detalle lo arma `construirDetalle` con una lista permitida de
 * campos: nunca se guardan contraseñas, hashes, tokens, datos de tarjeta ni el
 * importe del precio de compra. `listar` pagina de 50 en 50.
 */
import * as auditModel from '../models/audit.js';
import { ACCIONES, ENTIDAD_DE, construirDetalle } from '../utils/audit-detail.js';

/** Tamaño fijo de página de la consulta. */
export const TAMANO_PAGINA = 50;

/**
 * Registra una acción auditada. Nunca lanza.
 * @param {string} accion Una de `ACCIONES`.
 * @param {{ usuarioId?: number|null, entidadId?: number|null, datos?: object }} [contexto]
 *   `usuarioId` es quien realizó la acción (null si no hay cuenta).
 */
export async function registrar(accion, { usuarioId = null, entidadId = null, datos = {} } = {}) {
  try {
    if (!ACCIONES.includes(accion)) {
      throw new Error(`acción desconocida: ${accion}`);
    }
    await auditModel.insert({
      userId: usuarioId,
      action: accion,
      entityType: ENTIDAD_DE[accion],
      entityId: entidadId,
      detail: construirDetalle(accion, datos),
    });
  } catch (error) {
    // Siempre queda en el log del servidor (nunca se traga en silencio). Solo el
    // código y el motivo del error: nunca los datos de la entrada.
    const motivo = String(error?.sqlMessage ?? error?.message ?? 'error desconocido').slice(0, 200);
    console.error(`[bitácora] No se pudo registrar ${accion} (${error?.code ?? 'sin código'}): ${motivo}`);
  }
}

/** Página de entradas con los filtros ya validados (el controlador usa `validarFiltros`). */
export async function listar({ desde = null, hasta = null, usuarioId = null, accion = null, pagina = 1 } = {}) {
  const { total, filas } = await auditModel.findPage({
    desde,
    hasta,
    usuarioId,
    accion,
    limite: TAMANO_PAGINA,
    desplazamiento: (pagina - 1) * TAMANO_PAGINA,
  });
  return {
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / TAMANO_PAGINA)),
    total,
    datos: filas.map((fila) => ({
      id: fila.id,
      fecha: fila.createdAt,
      usuario: fila.userId == null ? null : { id: fila.userId, nombre: fila.userName },
      accion: fila.action,
      entidad: fila.entityType,
      entidadId: fila.entityId,
      detalle: fila.detail,
    })),
  };
}
