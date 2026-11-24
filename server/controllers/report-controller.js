// 008-configuracion-seguridad-reportes, T117 (bloque P3; FR-023, FR-028, CA-10):
// controlador de los reportes. HTTP fino: valida el rango, delega en el servicio y
// traduce la respuesta. La autorización (solo ADMIN) la hace el ruteador (RN-15),
// así que un rol sin permiso recibe 403 antes de que se valide nada.
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { errores } from '../utils/errors.js';
import { validarRangoDeReporte } from '../validators/report-validator.js';
import * as reportService from '../services/report-service.js';

/** Rango de la consulta o `400 RANGO_INVALIDO`. */
function rangoDe(req) {
  const { errores: lista, rango } = validarRangoDeReporte(req.query);
  if (lista.length > 0) {
    throw errores.rangoInvalido(lista.join(' '));
  }
  return rango;
}

export const ingresos = asyncHandler(async (req, res) => {
  return ok(res, await reportService.ingresos(rangoDe(req)));
});
