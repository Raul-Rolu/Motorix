// 008-configuracion-seguridad-reportes, T069 (FR-014, CA-20): controlador de la
// bitácora. HTTP fino: valida los filtros y delega en el servicio. La
// autorización (solo ADMIN) la hace el ruteador (RN-15). Solo consulta: no hay
// operaciones de edición, borrado ni exportación.
import { ok, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarFiltros } from '../validators/audit-validator.js';
import * as auditService from '../services/audit-service.js';

export const listar = asyncHandler(async (req, res) => {
  const { errores, filtros } = validarFiltros(req.query);
  if (errores.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', errores.join(' '));
  }
  return ok(res, await auditService.listar(filtros));
});
