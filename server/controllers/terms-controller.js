// 008-configuracion-seguridad-reportes, T092 (FR-019 a FR-022): controlador de los
// términos y condiciones. HTTP fino: valida, delega en el servicio y traduce la
// respuesta. La autorización (publicar y consultar aceptaciones solo ADMIN) la
// hace el ruteador (RN-15).
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarPublicacion, validarAceptacion, validarPagina } from '../validators/terms-validator.js';
import * as termsService from '../services/terms-service.js';

export const consultarVigente = asyncHandler(async (req, res) => {
  return ok(res, await termsService.consultarVigente(req.user));
});

export const aceptar = asyncHandler(async (req, res) => {
  const { errores, termsVersionId } = validarAceptacion(req.body);
  if (errores.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', errores.join(' '));
  }
  return ok(res, await termsService.aceptar(req.user, termsVersionId));
});

export const publicar = asyncHandler(async (req, res) => {
  const { errores, datos } = validarPublicacion(req.body);
  if (errores.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', errores.join(' '));
  }
  return created(res, await termsService.publicar(datos, req.user));
});

export const listarAceptaciones = asyncHandler(async (req, res) => {
  const { errores, pagina } = validarPagina(req.query);
  if (errores.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', errores.join(' '));
  }
  return ok(res, await termsService.listarAceptaciones({ pagina }));
});
