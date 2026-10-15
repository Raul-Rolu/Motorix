// T045/T051: controlador de clientes (US3/US4). Delega en el servicio.
import { ok, created, noContent, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarCliente, } from '../validators/client-validator.js';
import * as clientService from '../services/client-service.js';

export const listar = asyncHandler(async (req, res) => {
  const incluirInactivos = req.query.incluirInactivos === 'true';
  const clientes = await clientService.listar({ incluirInactivos });
  return ok(res, { datos: clientes });
});

export const obtenerPorId = asyncHandler(async (req, res) => {
  const cliente = await clientService.obtenerPorId(Number(req.params.id));
  return ok(res, cliente);
});

export const crear = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCliente(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const cliente = await clientService.crear(req.body);
  return created(res, cliente);
});

export const editar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCliente(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const cliente = await clientService.editar(Number(req.params.id), req.body);
  return ok(res, cliente);
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  if (typeof req.body?.active !== 'boolean') {
    return error(res, 400, 'DATOS_INVALIDOS', 'El campo active debe ser true o false.');
  }
  await clientService.cambiarEstado(Number(req.params.id), req.body.active);
  return noContent(res);
});
