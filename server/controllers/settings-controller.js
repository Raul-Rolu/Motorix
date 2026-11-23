// 008-configuracion-seguridad-reportes, T020 (FR-002, CA-1): controlador de la
// configuración. HTTP fino: valida el cuerpo, delega en el servicio y traduce la
// respuesta. La autorización (solo ADMIN) la hace el ruteador (RN-15).
import { ok, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarAjustes } from '../validators/settings-validator.js';
import * as settingsService from '../services/settings-service.js';

/** Ajustes vigentes (con valores de respaldo para lo que no se haya guardado). */
export const consultar = asyncHandler(async (req, res) => {
  return ok(res, await settingsService.consultar());
});

/** Guarda un subconjunto de ajustes; un solo error rechaza todo el guardado. */
export const actualizar = asyncHandler(async (req, res) => {
  const { errores, cambios } = validarAjustes(req.body);
  if (errores.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', errores.join(' '));
  }
  return ok(res, await settingsService.actualizar(cambios, req.user));
});
