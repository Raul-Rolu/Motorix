// T036: controlador de usuarios (US2). HTTP fino, delega en el servicio.
import { ok, created, noContent, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import {
  validarCreacionUsuario,
  validarEdicionUsuario,
  validarCambioEstadoUsuario,
} from '../validators/user-validator.js';
import * as userService from '../services/user-service.js';

export const listar = asyncHandler(async (req, res) => {
  const usuarios = await userService.listar();
  return ok(res, { datos: usuarios });
});

export const obtenerPorId = asyncHandler(async (req, res) => {
  const usuario = await userService.obtenerPorId(Number(req.params.id));
  return ok(res, usuario);
});

export const crear = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCreacionUsuario(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const usuario = await userService.crear(req.body);
  return created(res, usuario);
});

export const editar = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarEdicionUsuario(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const usuario = await userService.editar(Number(req.params.id), req.body);
  return ok(res, usuario);
});

export const cambiarEstado = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCambioEstadoUsuario(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  await userService.cambiarEstado(Number(req.params.id), req.body.active);
  return noContent(res);
});
