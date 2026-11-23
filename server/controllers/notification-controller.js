// 007-notificaciones-internas, T017 y T054: controlador de avisos internos.
// Delega en el servicio; el rol y el usuario salen SOLO del token (req.user),
// nunca de parámetros, cabeceras ni cuerpo de la petición (RN-15).
import { ok, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarLectura } from '../validators/notification-validator.js';
import * as notificationService from '../services/notification-service.js';

/** Avisos del usuario autenticado, con total y no leídos. */
export const listar = asyncHandler(async (req, res) => {
  const resumen = await notificationService.obtenerAvisos(req.user);
  return ok(res, resumen);
});

/** Marca un aviso vigente como leído para el usuario autenticado (US6). */
export const marcarLeido = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarLectura(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const resultado = await notificationService.marcarLeido(req.user, req.body.clave);
  return ok(res, resultado);
});
