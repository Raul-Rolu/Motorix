// T039: controlador de citas (US1). Delega en el servicio.
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import {
  validarCreacionCita,
  validarCambioEstadoCita,
} from '../validators/appointment-validator.js';
import * as appointmentService from '../services/appointment-service.js';

/** AAAA-MM-DD que existe en el calendario (rechaza 2026-13-45 o 2026-02-31). */
function esFechaReal(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

export const listar = asyncHandler(async (req, res) => {
  // 008 (FR-018): el filtro de fecha debe ser AAAA-MM-DD; otro valor es un 400, no un error interno.
  const fecha = req.query.fecha;
  if (fecha !== undefined && fecha !== '' && !esFechaReal(String(fecha))) {
    return error(res, 400, 'DATOS_INVALIDOS', 'La fecha debe tener el formato AAAA-MM-DD.');
  }
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
