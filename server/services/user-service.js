/**
 * Servicio de gestión de usuarios (T035, US2).
 * Reglas: duplicados rechazados (username/email únicos) y el último
 * administrador activo no puede desactivarse (edge case del spec).
 */
import bcrypt from 'bcrypt';
import * as userModel from '../models/user.js';
import { errores } from '../utils/errors.js';

const COSTO_BCRYPT = 10;

/** Quita el hash de la contraseña de cualquier representación de usuario. */
function sinHash(usuario) {
  if (!usuario) {
    return null;
  }
  const { passwordHash, ...resto } = usuario;
  return resto;
}

export async function listar() {
  const usuarios = await userModel.findAll();
  return usuarios.map(sinHash);
}

export async function obtenerPorId(id) {
  const usuario = await userModel.findById(id);
  if (!usuario) {
    throw errores.recursoNoEncontrado('El usuario');
  }
  return sinHash(usuario);
}

export async function crear(datos) {
  const hash = await bcrypt.hash(datos.password, COSTO_BCRYPT);
  try {
    const usuario = await userModel.create({
      username: datos.username.trim(),
      email: datos.email.trim().toLowerCase(),
      passwordHash: hash,
      fullName: datos.fullName.trim(),
      role: datos.role,
    });
    return sinHash(usuario);
  } catch (error) {
    // Violación de unicidad (username o email duplicado).
    if (error?.code === 'ER_DUP_ENTRY') {
      throw errores.usuarioDuplicado();
    }
    throw error;
  }
}

export async function editar(id, datos) {
  const existente = await userModel.findById(id);
  if (!existente) {
    throw errores.recursoNoEncontrado('El usuario');
  }
  try {
    const usuario = await userModel.update(id, {
      email: datos.email.trim().toLowerCase(),
      fullName: datos.fullName.trim(),
      role: datos.role,
    });
    return sinHash(usuario);
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw errores.usuarioDuplicado();
    }
    throw error;
  }
}

/** Desactiva o reactiva sin borrado físico (FR-015); guarda al último admin. */
export async function cambiarEstado(id, activo) {
  const usuario = await userModel.findById(id);
  if (!usuario) {
    throw errores.recursoNoEncontrado('El usuario');
  }
  if (!activo && usuario.role === 'ADMIN') {
    const otrosAdmins = await userModel.countActiveAdmins(id);
    if (otrosAdmins === 0) {
      throw errores.ultimoAdmin();
    }
  }
  return sinHash(await userModel.setStatus(id, activo));
}
