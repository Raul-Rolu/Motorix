/**
 * Servicio de clientes (T044 US3, T051 US4, T064 US6).
 * La edición nunca pierde los vehículos asociados (FR-006); el detalle
 * incluye los vehículos del cliente (FR-007).
 */
import * as clientModel from '../models/client.js';
import * as vehicleModel from '../models/vehicle.js';
import { errores } from '../utils/errors.js';

export async function listar({ incluirInactivos = false } = {}) {
  return clientModel.findAll({ incluirInactivos });
}

/** Detalle del cliente con sus vehículos asociados (FR-007, US6). */
export async function obtenerPorId(id) {
  const cliente = await clientModel.findById(id);
  if (!cliente) {
    throw errores.recursoNoEncontrado('El cliente');
  }
  const vehiculos = await vehicleModel.findByClient(id);
  return { ...cliente, vehiculos };
}

export async function crear(datos) {
  return clientModel.create({
    fullName: datos.fullName.trim(),
    phone: datos.phone.trim(),
    email: datos.email ? datos.email.trim().toLowerCase() : null,
    notes: datos.notes ?? null,
  });
}

/** Edita los datos del cliente conservando sus vehículos (FR-006). */
export async function editar(id, datos) {
  const existente = await clientModel.findById(id);
  if (!existente) {
    throw errores.recursoNoEncontrado('El cliente');
  }
  return clientModel.update(id, {
    fullName: datos.fullName.trim(),
    phone: datos.phone.trim(),
    email: datos.email ? datos.email.trim().toLowerCase() : null,
    notes: datos.notes ?? null,
  });
}

/** Desactiva o reactiva sin borrado físico (FR-015). */
export async function cambiarEstado(id, activo) {
  const cliente = await clientModel.findById(id);
  if (!cliente) {
    throw errores.recursoNoEncontrado('El cliente');
  }
  return clientModel.setStatus(id, activo);
}
