// T024 (Sprint 3): controlador de mantenimientos (US3/US4). Delega en el servicio.
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import {
  validarRegistroMantenimiento,
  validarCancelacionMantenimiento,
} from '../validators/maintenance-validator.js';
import * as maintenanceService from '../services/maintenance-service.js';

/**
 * Propuesta del próximo mantenimiento desde una orden (008, FR-008, CA-5).
 * `orderId` es un entero positivo; no crea ningún mantenimiento.
 */
export const proponer = asyncHandler(async (req, res) => {
  const texto = String(req.query.orderId ?? '');
  if (!/^[1-9][0-9]*$/.test(texto)) {
    return error(res, 400, 'DATOS_INVALIDOS', 'La orden (orderId) es obligatoria y debe ser un identificador válido.');
  }
  return ok(res, await maintenanceService.proponerDesdeOrden(Number(texto), req.user));
});

export const listar = asyncHandler(async (req, res) => {
  // 008 (FR-018): el filtro de vehículo debe ser un identificador válido; otro valor es un 400.
  const vehiculo = req.query.vehicleId;
  if (vehiculo !== undefined && vehiculo !== '' && !/^[1-9][0-9]{0,14}$/.test(String(vehiculo))) {
    return error(res, 400, 'DATOS_INVALIDOS', 'El vehículo (vehicleId) debe ser un identificador válido.');
  }
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
