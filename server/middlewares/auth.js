/**
 * Middleware de autenticación (T013, research D3 y D14).
 *
 * Verifica el JWT de la cabecera `Authorization: Bearer <token>` y comprueba en
 * la base que el usuario exista y esté activo: un token vigente de un usuario
 * desactivado se rechaza con 401 SESION_EXPIRADA (FR-015). El token expira a
 * los 30 minutos (FR-002).
 */
import jwt from 'jsonwebtoken';
import { getPool } from '../config/db.js';
import { errores } from '../utils/errors.js';
import { asyncHandler } from './error-handler.js';

export const SESION_MINUTOS = 30;

/** Firma un JWT con el payload mínimo del sprint (sub, username, role). */
export function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, username: usuario.username, role: usuario.role },
    process.env.JWT_SECRET,
    { expiresIn: `${SESION_MINUTOS}m` }
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
