// T038 (Sprint 3): controlador de refacciones e inventario (US5/US6).
// Delega en el servicio; la autorización real es de los ruteadores (RN-15).
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarParte, validarMovimiento } from '../validators/part-validator.js';
import * as partService from '../services/part-service.js';

export const listar = asyncHandler(async (req, res) => {
  const partes = await partService.listar({ q: req.query.q }, req.user);
  return ok(res, { datos: partes });
});

export const crear = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarParte(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const parte = await partService.crear(req.body, req.user);
  return created(res, parte);
});

export const editar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarParte(req.body, { esEdicion: true });
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const parte = await partService.editar(Number(req.params.id), req.body);
  return ok(res, parte);
});

export const registrarMovimiento = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarMovimiento(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const movimiento = await partService.registrarMovimiento(
    Number(req.params.id),
    req.body,
    req.user
  );
  return created(res, movimiento);
});

export const historialMovimientos = asyncHandler(async (req, res) => {
  const movimientos = await partService.historialMovimientos(Number(req.params.id));
  return ok(res, { datos: movimientos });
});
