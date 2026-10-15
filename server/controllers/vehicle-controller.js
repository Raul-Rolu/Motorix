// T058: controlador de vehículos (US5/US6). Delega en el servicio.
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarVehiculo } from '../validators/vehicle-validator.js';
import * as vehicleService from '../services/vehicle-service.js';

export const listar = asyncHandler(async (req, res) => {
  const vehiculos = await vehicleService.listar();
  return ok(res, { datos: vehiculos });
});

export const obtenerPorId = asyncHandler(async (req, res) => {
  const vehiculo = await vehicleService.obtenerPorId(Number(req.params.id));
  return ok(res, vehiculo);
});

export const crear = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarVehiculo(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const vehiculo = await vehicleService.crear(req.body);
  return created(res, vehiculo);
});

export const editar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarVehiculo(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const vehiculo = await vehicleService.editar(Number(req.params.id), req.body);
  return ok(res, vehiculo);
});
