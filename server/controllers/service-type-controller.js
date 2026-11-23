// 008-configuracion-seguridad-reportes, T037 (FR-006, CA-4): controlador del
// catálogo de tipos de servicio. HTTP fino: valida el cuerpo, delega en el
// servicio y traduce la respuesta. La autorización la hace el ruteador (RN-15).
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import {
  validarTipoServicio,
  validarEstadoTipoServicio,
} from '../validators/service-type-validator.js';
import * as serviceTypeService from '../services/service-type-service.js';

export const listar = asyncHandler(async (req, res) => {
  const datos = await serviceTypeService.listar(
    { incluirInactivos: req.query.incluirInactivos === 'true' },
    req.user
  );
  return ok(res, { datos });
});

export const crear = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarTipoServicio(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  return created(res, await serviceTypeService.crear(req.body));
});

export const editar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarTipoServicio(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  return ok(res, await serviceTypeService.editar(Number(req.params.id), req.body));
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarEstadoTipoServicio(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  return ok(res, await serviceTypeService.cambiarEstado(Number(req.params.id), req.body.activo));
});
