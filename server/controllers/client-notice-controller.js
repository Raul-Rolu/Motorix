// 007-notificaciones-internas, T064: controlador de clientes por avisar.
// Delega en el servicio; ADMIN y RECEPTIONIST se exigen en la ruta (MECHANIC → 403).
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarAvisoACliente } from '../validators/notification-validator.js';
import * as clientNoticeService from '../services/client-notice-service.js';

/** Hechos pendientes de avisar a un cliente, con teléfono y vehículo. */
export const pendientes = asyncHandler(async (req, res) => {
  const lista = await clientNoticeService.listarClientesPorAvisar();
  return ok(res, lista);
});

/** Registra el aviso al cliente por un hecho (quién, cuándo y nota opcional). */
export const marcar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarAvisoACliente(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const aviso = await clientNoticeService.marcarAvisado(req.user, req.body);
  return created(res, aviso);
});
