/**
 * Middleware centralizado de manejo de errores (T011, research D10, Principio VI).
 *
 * Debe montarse DESPUÉS de todas las rutas. Traduce AppError al formato del
 * contrato y cualquier otro error a un 500 genérico: NUNCA se exponen stack
 * traces ni detalles internos al usuario final (Principio IV).
 */
import { AppError } from '../utils/errors.js';

export function errorHandler(err, req, res, next) {
  // Si la respuesta ya fue enviada, se delega al manejo por defecto de Express.
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    const cuerpo = { codigo: err.codigo, mensaje: err.mensaje ?? err.message };
    if (err.details !== undefined) {
      cuerpo.details = err.details;
    }
    return res.status(err.status).json({ error: cuerpo });
  }

  // Errores de parseo de JSON u otros errores de Express con estado conocido.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { codigo: 'DATOS_INVALIDOS', mensaje: 'El cuerpo de la petición no es JSON válido.' },
    });
  }

  // Error inesperado: se registra en el servidor, no en la respuesta.
  console.error('Error interno no controlado:', err);
  return res.status(500).json({
    error: {
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error interno; intente de nuevo o contacte al administrador.',
    },
  });
}

/** Envuelve controladores async para propagar rechazos al errorHandler. */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
