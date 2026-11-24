/**
 * Middleware de autenticación (T013, research D3 y D14).
 *
 * Verifica el JWT de la cabecera `Authorization: Bearer <token>` y comprueba en
 * la base que el usuario exista y esté activo: un token vigente de un usuario
 * desactivado se rechaza con 401 SESION_EXPIRADA (FR-015). La vigencia del token
 * es el ajuste de inactividad de la configuración (30 minutos por omisión; 008,
 * FR-016): el servidor siempre valida la expiración y la renovación solo ocurre
 * en `POST /api/auth/renew` (FR-002).
 */
import jwt from 'jsonwebtoken';
import { getPool } from '../config/db.js';
import { errores } from '../utils/errors.js';
import { asyncHandler } from './error-handler.js';

/** Vigencia de respaldo en minutos cuando no se indica otra (coincide con el ajuste por omisión). */
export const SESION_MINUTOS = 30;

/**
 * Firma un JWT con el payload mínimo del sprint (sub, username, role) y la
 * vigencia en minutos indicada (el ajuste de inactividad; por omisión 30).
 */
export function firmarToken(usuario, minutos = SESION_MINUTOS) {
  return jwt.sign(
    { sub: usuario.id, username: usuario.username, role: usuario.role },
    process.env.JWT_SECRET,
    { expiresIn: `${minutos}m` }
  );
}

export const auth = asyncHandler(async (req, res, next) => {
  const cabecera = req.headers.authorization ?? '';
  const [esquema, token] = cabecera.split(' ');

  if (esquema !== 'Bearer' || !token) {
    throw errores.noAutenticado();
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Token expirado o firmado con otro secreto: mismo mensaje genérico.
    throw errores.sesionExpirada();
  }

  // Un usuario desactivado pierde el acceso aunque su token aún no expire.
  const [filas] = await getPool().query(
    'SELECT id, username, email, full_name, role, active FROM users WHERE id = ?',
    [payload.sub]
  );
  const usuario = filas[0];
  if (!usuario || !usuario.active) {
    throw errores.sesionExpirada();
  }

  req.user = {
    id: usuario.id,
    username: usuario.username,
    email: usuario.email,
    fullName: usuario.full_name,
    role: usuario.role,
  };
  next();
});
