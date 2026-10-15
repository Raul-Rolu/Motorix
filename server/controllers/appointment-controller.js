// T039: controlador de citas (US1). Delega en el servicio.
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import {
  validarCreacionCita,
  validarCambioEstadoCita,
} from '../validators/appointment-validator.js';
import * as appointmentService from '../services/appointment-service.js';

export const listar = asyncHandler(async (req, res) => {
  const citas = await appointmentService.listar({
    fecha: req.query.fecha,
    texto: req.query.texto,
  });
  return ok(res, { datos: citas });
});

export const obtenerPorId = asyncHandler(async (req, res) => {
  const cita = await appointmentService.obtenerPorId(Number(req.params.id));
  return ok(res, cita);
});

export const crear = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCreacionCita(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const cita = await appointmentService.crear(req.body, req.user);
  return created(res, cita);
});

export const editar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCreacionCita(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const cita = await appointmentService.editar(Number(req.params.id), req.body);
  return ok(res, cita);
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCambioEstadoCita(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const cita = await appointmentService.cambiarEstado(Number(req.params.id), req.body);
  return ok(res, cita);
});
