/**
 * Servicio de vehículos (T057 US5, T065 US6).
 * RN-1: no existe vehículo sin propietario; placas únicas (supuesto del spec);
 * la reasociación valida que el nuevo propietario exista y esté activo.
 */
import * as vehicleModel from '../models/vehicle.js';
import * as clientModel from '../models/client.js';
import { errores } from '../utils/errors.js';

export async function listar() {
  return vehicleModel.findAll();
}

export async function obtenerPorId(id) {
  const vehiculo = await vehicleModel.findById(id);
  if (!vehiculo) {
    throw errores.recursoNoEncontrado('El vehículo');
  }
  return vehiculo;
}

/** Valida que el propietario exista y esté activo (RN-1). */
async function validarPropietario(clientId) {
  const duenio = await clientModel.findById(clientId);
  if (!duenio || !duenio.active) {
    throw errores.clienteNoEncontrado();
  }
  return duenio;
}

export async function crear(datos) {
  await validarPropietario(Number(datos.clientId));
  try {
    return await vehicleModel.create({
      clientId: Number(datos.clientId),
      plates: datos.plates.trim().toUpperCase(),
      brand: datos.brand.trim(),
      model: datos.model.trim(),
      year: Number(datos.year),
      color: datos.color ?? null,
      notes: datos.notes ?? null,
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw errores.vehiculoDuplicado();
    }
    throw error;
  }
}

/** Edita datos y/o reasocia el propietario (FR-009, US6). */
export async function editar(id, datos) {
  const existente = await vehicleModel.findById(id);
  if (!existente) {
    throw errores.recursoNoEncontrado('El vehículo');
  }
  await validarPropietario(Number(datos.clientId));
  try {
    return await vehicleModel.update(id, {
      clientId: Number(datos.clientId),
      plates: datos.plates.trim().toUpperCase(),
      brand: datos.brand.trim(),
      model: datos.model.trim(),
      year: Number(datos.year),
      color: datos.color ?? null,
      notes: datos.notes ?? null,
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw errores.vehiculoDuplicado();
    }
    throw error;
  }
}
