/**
 * Controlador de autenticación (T026, US1).
 * HTTP fino: valida el payload, delega en el servicio y traduce la respuesta.
 */
import { ok, noContent, error } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { validarLogin, validarCambioContrasena } from '../validators/auth-validator.js';
import * as authService from '../services/auth-service.js';

export const login = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarLogin(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'DATOS_INVALIDOS', erroresDeValidacion.join(' '));
  }
  const { identificacion, contrasena } = req.body;
  const resultado = await authService.login(identificacion, contrasena);
  return ok(res, resultado);
});

/** Renueva el token con la actividad del usuario (008, FR-016); sin cuerpo. */
export const renew = asyncHandler(async (req, res) => {
  return ok(res, await authService.renovar(req.user));
});

export const changePassword = asyncHandler(async (req, res) => {
  const erroresDeValidacion = validarCambioContrasena(req.body);
  if (erroresDeValidacion.length > 0) {
    return error(res, 400, 'CONTRASENA_INVALIDA', erroresDeValidacion.join(' '));
  }
  const { contrasenaActual, contrasenaNueva } = req.body;
  await authService.changePassword(req.user.id, contrasenaActual, contrasenaNueva);
  return noContent(res);
});

// El logout es del lado del cliente (el token se descarta; no se revoca y solo
// vence con su vigencia). Se expone el endpoint, con `authBase` (sin la compuerta
// de términos), para dejar constancia del cierre de sesión.
export const logout = asyncHandler(async (req, res) => noContent(res));
