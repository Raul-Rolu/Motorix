/**
 * Middleware de autenticación (T013, research D3 y D14).
 *
 * Verifica el JWT de la cabecera `Authorization: Bearer <token>` y comprueba en
 * la base que el usuario exista y esté activo: un token vigente de un usuario
 * desactivado se rechaza con 401 SESION_EXPIRADA (FR-015). La vigencia del token
 * es el ajuste de inactividad de la configuración (30 minutos por omisión; 008,
 * FR-016): el servidor siempre valida la expiración y la renovación solo ocurre
 * en `POST /api/auth/renew` (FR-002).
 *
 * Compuerta de términos (008, FR-021): `auth` exige además haber aceptado la
 * versión vigente de los términos (403 TERMS_NOT_ACCEPTED); `authBase` no.
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

const COLUMNAS_USUARIO = 'u.id, u.username, u.email, u.full_name, u.role, u.active';

/**
 * Consulta de `authBase`: solo el usuario (el comportamiento de siempre).
 */
const CONSULTA_BASE = `SELECT ${COLUMNAS_USUARIO} FROM users u WHERE u.id = ?`;

/**
 * Consulta de `auth`: el usuario MÁS la versión vigente de los términos y si ya
 * la aceptó, todo en una sola consulta (la compuerta no agrega viajes a la base;
 * 008, FR-021, CA-19). `vigente_id` es NULL cuando no hay versión publicada.
 */
const CONSULTA_CON_TERMINOS = `
  SELECT ${COLUMNAS_USUARIO},
         vigente.id AS vigente_id,
         EXISTS (
           SELECT 1 FROM terms_acceptances a
           WHERE a.user_id = u.id AND a.terms_version_id = vigente.id
         ) AS terms_accepted
  FROM users u
  LEFT JOIN (SELECT id FROM terms_versions ORDER BY version DESC LIMIT 1) vigente ON TRUE
  WHERE u.id = ?`;

/**
 * Crea el middleware de autenticación. Con `conCompuerta` también exige haber
 * aceptado la versión vigente de los términos (si existe alguna).
 */
function crearAutenticacion({ conCompuerta }) {
  return asyncHandler(async (req, res, next) => {
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
    const [filas] = await getPool().query(conCompuerta ? CONSULTA_CON_TERMINOS : CONSULTA_BASE, [payload.sub]);
    const usuario = filas[0];
    if (!usuario || !usuario.active) {
      throw errores.sesionExpirada();
    }

    // Compuerta de términos: con una versión vigente sin aceptar no se usa el sistema.
    if (conCompuerta && usuario.vigente_id != null && !usuario.terms_accepted) {
      throw errores.terminosNoAceptados();
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
}

/**
 * Autenticación SIN compuerta de términos (comportamiento previo al bloque P2).
 * Solo para lo que el usuario necesita aun sin haber aceptado: consultar y
 * aceptar la versión vigente, cerrar sesión y renovar el token.
 */
export const authBase = crearAutenticacion({ conCompuerta: false });

/** Autenticación con compuerta de términos: la que usan todas las demás rutas. */
export const auth = crearAutenticacion({ conCompuerta: true });
