// T017: controlador de órdenes de servicio (US2). Delega en el servicio.
import { ok, created, noContent, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import {
  validarCreacionOrden,
  validarEdicionOrden,
  validarEntradaOrden,
  validarPartida,
  validarRefaccionOrden,
} from '../validators/order-validator.js';
import * as orderService from '../services/order-service.js';

export const listar = asyncHandler(async (req, res) => {
  const ordenes = await orderService.listar(
    { estado: req.query.estado, texto: req.query.texto },
    req.user
  );
  return ok(res, { datos: ordenes });
});

export const obtenerPorId = asyncHandler(async (req, res) => {
  const orden = await orderService.obtenerPorId(Number(req.params.id), req.user);
  return ok(res, orden);
});

export const asignar = asyncHandler(async (req, res) => {
  const orden = await orderService.asignarMecanico(
    Number(req.params.id),
    req.body?.mechanicId ?? null
  );
  return ok(res, orden);
});

export const listarMecanicos = asyncHandler(async (req, res) => {
  const mecanicos = await orderService.listarMecanicos();
  return ok(res, { datos: mecanicos });
});

export const agregarEntrada = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarEntradaOrden(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const entrada = await orderService.agregarEntrada(
    Number(req.params.id),
    req.body,
    req.user
  );
  return created(res, entrada);
});

export const agregarPartida = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarPartida(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const partida = await orderService.agregarPartida(
    Number(req.params.id),
    req.body,
    req.user
  );
  return created(res, partida);
});

export const borrarPartida = asyncHandler(async (req, res) => {
  await orderService.borrarPartida(
    Number(req.params.id),
    Number(req.params.serviceId),
    req.user
  );
  return noContent(res);
});

export const editar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarEdicionOrden(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const orden = await orderService.editar(Number(req.params.id), req.body);
  return ok(res, orden);
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const estado = req.body?.status;
  if (typeof estado !== 'string' || estado.trim().length === 0) {
    return error(res, 400, 'DATOS_INVALIDOS', 'El estado (status) es obligatorio.');
  }
  const orden = await orderService.cambiarEstado(
    Number(req.params.id),
    { status: estado.trim(), cancellationReason: req.body?.cancellationReason },
    req.user
  );
  return ok(res, orden);
});

export const crear = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCreacionOrden(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const orden = await orderService.crear(req.body, req.user);
  return created(res, orden);
});

/** Historial de servicios del vehículo (Sprint 3, US1; FR-001, RN-10). */
export const historialVehiculo = asyncHandler(async (req, res) => {
  const historial = await orderService.historialVehiculo(Number(req.params.id), {
    order: req.query.order,
  });
  return ok(res, historial);
});

/** Refacción usada en la orden (Sprint 3, US7; FR-011, RN-6/RN-7). */
export const agregarRefaccion = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarRefaccionOrden(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const linea = await orderService.agregarRefaccionOrden(
    Number(req.params.id),
    req.body,
    req.user
  );
  return created(res, linea);
});

/** Retiro de refacción con devolución de stock (Sprint 3, US7; FR-012, RN-8). */
export const retirarRefaccion = asyncHandler(async (req, res) => {
  await orderService.retirarRefaccionOrden(
    Number(req.params.id),
    Number(req.params.partId),
    req.user
  );
  return noContent(res);
});
