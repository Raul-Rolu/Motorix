/**
 * Servicio de autenticación (T024, US1; research D3 y D4).
 * Toda la lógica de negocio vive aquí, nunca en controladores (Principio II).
 */
import bcrypt from 'bcrypt';
import * as userModel from '../models/user.js';
import { errores } from '../utils/errors.js';
import { firmarToken } from '../middlewares/auth.js';

const COSTO_BCRYPT = 10;

/** Autentica con usuario o correo en el mismo campo y firma el JWT (RN-16). */
export async function login(identificacion, contrasena) {
  const usuario = await userModel.findByLogin(identificacion);

  // Mismo resultado para usuario inexistente, desactivado o contraseña
  // incorrecta: no se revela si la cuenta existe.
  if (!usuario || !usuario.active) {
    throw errores.credencialesInvalidas();
  }

  const coincide = await bcrypt.compare(contrasena, usuario.passwordHash);
  if (!coincide) {
    throw errores.credencialesInvalidas();
  }

  const token = firmarToken(usuario);
  return {
    token,
    usuario: {
      id: usuario.id,
      username: usuario.username,
      email: usuario.email,
      fullName: usuario.fullName,
      role: usuario.role,
    },
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
