/**
 * Servicio del catálogo de tipos de servicio
 * (008-configuracion-seguridad-reportes, T037; FR-006, FR-010, CA-4, CA-10).
 *
 * La administración (alta, edición y desactivación) es solo de ADMIN y la
 * valida la ruta; la consulta de tipos activos es de los tres roles porque
 * recepción y mecánico los eligen en las líneas de servicio. Ver los inactivos
 * es solo de ADMIN y se valida aquí. Un tipo nunca se borra.
 */
import * as serviceTypeModel from '../models/service-type.js';
import { errores } from '../utils/errors.js';

/** Datos normalizados para guardar (los intervalos ausentes quedan en null). */
function datosDe(payload) {
  return {
    nombre: payload.nombre.trim(),
    intervaloDias: payload.intervaloDias ?? null,
    intervaloKm: payload.intervaloKm ?? null,
  };
}

/** Lista los tipos; los inactivos solo se entregan a ADMIN. */
export async function listar({ incluirInactivos = false } = {}, usuario) {
  if (incluirInactivos && usuario.role !== 'ADMIN') {
    throw errores.noAutorizado();
  }
  return serviceTypeModel.findAll({ incluirInactivos });
}

async function exigirExistente(id) {
  const tipo = await serviceTypeModel.findById(id);
  if (!tipo) {
    throw errores.tipoServicioNoEncontrado();
  }
  return tipo;
}

export async function crear(payload) {
  try {
    return await serviceTypeModel.create(datosDe(payload));
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw errores.tipoServicioDuplicado();
    }
    throw error;
  }
}

/** Los cambios aplican a propuestas futuras; no alteran líneas ni tickets ya registrados. */
export async function editar(id, payload) {
  await exigirExistente(id);
  try {
    return await serviceTypeModel.update(id, datosDe(payload));
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw errores.tipoServicioDuplicado();
    }
    throw error;
  }
}

/** Desactiva o reactiva; las líneas existentes conservan su tipo. */
export async function cambiarEstado(id, activo) {
  await exigirExistente(id);
  return serviceTypeModel.setActive(id, activo);
}

/**
 * Tipo para asignarlo a una línea nueva: debe existir (404) y estar activo (409).
 * Lo usa el alta de líneas de servicio de las órdenes.
 */
export async function obtenerActivo(id) {
  const tipo = await exigirExistente(id);
  if (!tipo.activo) {
    throw errores.tipoServicioInactivo();
  }
  return tipo;
}
