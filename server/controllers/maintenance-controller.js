// T024 (Sprint 3): controlador de mantenimientos (US3/US4). Delega en el servicio.
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import {
  validarRegistroMantenimiento,
  validarCancelacionMantenimiento,
} from '../validators/maintenance-validator.js';
import * as maintenanceService from '../services/maintenance-service.js';

export const listar = asyncHandler(async (req, res) => {
  const mantenimientos = await maintenanceService.listar({
    vehicleId: req.query.vehicleId,
    status: req.query.status,
  });
  return ok(res, { datos: mantenimientos });
});

export const registrar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarRegistroMantenimiento(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  // RN-11: al menos uno de los dos umbrales, con su propio código de error.
  if (!req.body?.targetDate && req.body?.targetMileage == null) {
    return error(
      res,
      422,
      'MAINTENANCE_INVALID_THRESHOLD',
      'Debe indicar al menos un umbral: fecha objetivo (targetDate), kilometraje (targetMileage) o ambos.'
    );
  }
  const mantenimiento = await maintenanceService.registrar(req.body, req.user);
  return created(res, mantenimiento);
});

export const completar = asyncHandler(async (req, res) => {
  const mantenimiento = await maintenanceService.completar(
    Number(req.params.id),
    req.user
  );
  return ok(res, mantenimiento);
});

export const cancelar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCancelacionMantenimiento(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const mantenimiento = await maintenanceService.cancelar(
    Number(req.params.id),
    req.body,
    req.user
  );
  return ok(res, mantenimiento);
});
