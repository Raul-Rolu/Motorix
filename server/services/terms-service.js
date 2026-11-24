/**
 * Servicio de los términos y condiciones
 * (008-configuracion-seguridad-reportes, T092; FR-019 a FR-022, CA-16 a CA-18).
 *
 * Sin ninguna versión publicada no hay compuerta (`vigente: null`, `aceptada:
 * true`). Aceptar es idempotente y solo vale para la versión vigente. Publicar
 * numera con máximo + 1 y registra `TERMS_PUBLISHED` (best-effort) sin guardar
 * el texto en la bitácora.
 */
import * as termsModel from '../models/terms.js';
import * as auditService from './audit-service.js';
import { errores } from '../utils/errors.js';

/** Tamaño fijo de página de las aceptaciones. */
export const TAMANO_PAGINA = 50;

/** La versión vigente y si el usuario la aceptó. */
export async function consultarVigente(usuario) {
  const vigente = await termsModel.findCurrent();
  if (!vigente) {
    return { vigente: null, aceptada: true };
  }
  return { vigente, aceptada: await termsModel.hasAccepted(usuario.id, vigente.id) };
}

/** Acepta la versión indicada, que debe ser la vigente. */
export async function aceptar(usuario, termsVersionId) {
  const version = await termsModel.findById(termsVersionId);
  if (!version) {
    throw errores.recursoNoEncontrado('La versión de los términos');
  }
  const vigente = await termsModel.findCurrent();
  if (vigente.id !== version.id) {
    throw errores.terminosVersionDesactualizada();
  }
  await termsModel.insertAcceptance(usuario.id, version.id);
  return { aceptada: true, version: version.version };
}

/** Publica una versión nueva, que pasa a ser la vigente para todos. */
export async function publicar({ terminos, avisoPrivacidad }, usuario) {
  const id = await termsModel.insertVersion({ terminos, avisoPrivacidad, publicadaPor: usuario.id });
  const creada = await termsModel.findById(id);
  await auditService.registrar('TERMS_PUBLISHED', {
    usuarioId: usuario.id,
    entidadId: creada.id,
    datos: { version: creada.version },
  });
  return creada;
}

/** Página de aceptaciones con la versión vigente. */
export async function listarAceptaciones({ pagina = 1 } = {}) {
  const [vigente, { total, filas }] = await Promise.all([
    termsModel.findCurrent(),
    termsModel.findAcceptancesPage({ limite: TAMANO_PAGINA, desplazamiento: (pagina - 1) * TAMANO_PAGINA }),
  ]);
  return {
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / TAMANO_PAGINA)),
    total,
    vigente: vigente ? { id: vigente.id, version: vigente.version } : null,
    datos: filas,
  };
}
