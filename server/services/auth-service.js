/**
 * Servicio de autenticación (T024, US1; research D3 y D4).
 * Toda la lógica de negocio vive aquí, nunca en controladores (Principio II).
 */
import bcrypt from 'bcrypt';
import * as userModel from '../models/user.js';
import { errores } from '../utils/errors.js';
import { firmarToken } from '../middlewares/auth.js';
import * as auditService from './audit-service.js';
import { obtenerAjustes } from './settings-service.js';

const COSTO_BCRYPT = 10;

/**
 * Registra un inicio de sesión fallido en la bitácora (008, FR-012, CA-20):
 * cuenta inexistente (sin usuario), inactiva o contraseña incorrecta. Solo se
 * guarda el identificador tecleado (truncado), NUNCA la contraseña. No cambia la
 * respuesta al usuario.
 */
async function registrarFallo(usuario, identificacion) {
  await auditService.registrar('LOGIN_FAILED', {
    usuarioId: usuario?.id ?? null,
    datos: { identificador: identificacion },
  });
}

/** Autentica con usuario o correo en el mismo campo y firma el JWT (RN-16). */
export async function login(identificacion, contrasena) {
  const usuario = await userModel.findByLogin(identificacion);

  // Mismo resultado para usuario inexistente, desactivado o contraseña
  // incorrecta: no se revela si la cuenta existe.
  if (!usuario || !usuario.active) {
    await registrarFallo(usuario, identificacion);
    throw errores.credencialesInvalidas();
  }

  const coincide = await bcrypt.compare(contrasena, usuario.passwordHash);
  if (!coincide) {
    await registrarFallo(usuario, identificacion);
    throw errores.credencialesInvalidas();
  }

  // La vigencia del token es el ajuste de inactividad (008, FR-016); el cliente
  // la usa para cerrar la sesión por inactividad y para renovar el token.
  const { minutosInactividad } = await obtenerAjustes();
  const token = firmarToken(usuario, minutosInactividad);
  return {
    token,
    inactividadMinutos: minutosInactividad,
    usuario: {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      fullName: usuario.fullName,
      role: usuario.role,
    },
  };
}

/**
 * Renueva el token de la sesión (008, FR-016, CA-23): el middleware `auth` ya
 * verificó el token vigente y que el usuario siga activo; el nuevo token toma el
 * rol de la base (no el del token anterior) y la vigencia del ajuste vigente. Es
 * la ÚNICA ruta que emite un token fuera del inicio de sesión: la consulta
 * periódica de avisos nunca extiende la sesión.
 * @param {{ id: number, username: string, role: string }} usuario `req.user`.
 */
export async function renovar(usuario) {
  const { minutosInactividad } = await obtenerAjustes();
  return {
    token: firmarToken(usuario, minutosInactividad),
    inactividadMinutos: minutosInactividad,
  };
}

/** Cambia la contraseña de la cuenta propia (FR-011). */
export async function changePassword(userId, contrasenaActual, contrasenaNueva) {
  const usuario = await userModel.findById(userId);
  if (!usuario || !usuario.active) {
    throw errores.credencialesInvalidas();
  }

  const coincide = await bcrypt.compare(contrasenaActual, usuario.passwordHash);
  if (!coincide) {
    throw errores.credencialesInvalidas();
  }

  const hash = await bcrypt.hash(contrasenaNueva, COSTO_BCRYPT);
  await userModel.updatePassword(userId, hash);
}

/** Hash bcrypt para las cuentas de los seeds (costo 10). */
export async function hashContrasena(contrasena) {
  return bcrypt.hash(contrasena, COSTO_BCRYPT);
}
