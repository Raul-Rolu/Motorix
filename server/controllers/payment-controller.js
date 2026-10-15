// T014 (Sprint 4): controlador de pagos (US1/US2).
// Delega en el servicio; la autorización real es de los ruteadores (RN-15).
import { ok, created, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarPago, validarCobroDigital } from '../validators/payment-validator.js';
import * as paymentService from '../services/payment-service.js';

export const listar = asyncHandler(async (req, res) => {
  const resultado = await paymentService.listar(Number(req.params.id));
  return ok(res, resultado);
});

export const registrar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarPago(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const pago = await paymentService.registrar(Number(req.params.id), req.body, req.user);
  return created(res, pago);
});

export const obtener = asyncHandler(async (req, res) => {
  const pago = await paymentService.obtenerPorId(Number(req.params.id));
  return ok(res, pago);
});

// --- US2: cobro digital con Mercado Pago (T026) ---

export const crearDigital = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCobroDigital(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const cobro = await paymentService.crearCobroDigital(
    Number(req.params.id),
    req.body,
    req.user
  );
  return created(res, cobro);
});

export const verificar = asyncHandler(async (req, res) => {
  const pago = await paymentService.verificarCobro(Number(req.params.id));
  return ok(res, pago);
});
