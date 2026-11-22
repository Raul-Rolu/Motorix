// 007-notificaciones-internas, T017: controlador de avisos internos.
// Delega en el servicio; el rol y el usuario salen SOLO del token (req.user),
// nunca de parámetros, cabeceras ni cuerpo de la petición (RN-15).
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import * as notificationService from '../services/notification-service.js';

/** Avisos del usuario autenticado, con total y no leídos. */
export const listar = asyncHandler(async (req, res) => {
  const resumen = await notificationService.obtenerAvisos(req.user);
  return ok(res, resumen);
});
