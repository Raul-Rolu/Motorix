/**
 * Middleware de autorización por roles (T014, research D6, RN-5 y RN-15).
 *
 * Se monta DESPUÉS de `auth`. Los permisos se validan SIEMPRE en el servidor;
 * ocultar opciones en el frontend no es seguridad suficiente.
 */
import { errores } from '../utils/errors.js';

export function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return next(errores.noAutenticado());
    }
    if (!rolesPermitidos.includes(req.user.role)) {
      return next(errores.noAutorizado());
    }
    return next();
  };
}
