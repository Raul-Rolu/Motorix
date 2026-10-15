/**
 * Servicio de citas (T038, US1; Sprint 2).
 * Reglas: vehículo activo del cliente (RN-2), unicidad de horario por
 * vehículo (CA-1), edición y cambio de estado solo desde PROGRAMADA,
 * motivo obligatorio al cancelar (FR-003).
 */
import * as appointmentModel from '../models/appointment.js';
import * as clientModel from '../models/client.js';
import * as vehicleModel from '../models/vehicle.js';
import { errores } from '../utils/errors.js';

export async function listar(filtros = {}) {
  return appointmentModel.findAll({
    fecha: filtros.fecha || null,
    texto: filtros.texto || null,
  });
}

export async function obtenerPorId(id) {
  const cita = await appointmentModel.findById(id);
  if (!cita) {
    throw errores.citaNoEncontrada();
  }
  return cita;
}

/** Valida cliente activo y vehículo existente que le pertenezca (RN-2). */
async function validarClienteYVehiculo(clientId, vehicleId) {
  const cliente = await clientModel.findById(clientId);
  if (!cliente || !cliente.active) {
    throw errores.clienteNoEncontrado();
  }
  const vehiculo = await vehicleModel.findById(vehicleId);
  if (!vehiculo || vehiculo.clientId !== clientId) {
    throw errores.vehiculoNoDisponible(
      'El vehículo indicado no existe o no pertenece al cliente seleccionado.'
    );
  }
  return vehiculo;
}

async function verificarUnicidad(vehicleId, fecha, hora, excluirId = null) {
  const duplicada = await appointmentModel.findByVehicleAndSlot(
    vehicleId,
    fecha,
    hora,
    excluirId
  );
  if (duplicada) {
    throw errores.citaDuplicada();
  }
}

export async function crear(datos, usuario) {
  const clientId = Number(datos.clientId);
  const vehicleId = Number(datos.vehicleId);
  await validarClienteYVehiculo(clientId, vehicleId);
  await verificarUnicidad(vehicleId, datos.appointmentDate, datos.appointmentTime);

  try {
    return await appointmentModel.create({
      clientId,
      vehicleId,
      appointmentDate: datos.appointmentDate,
      appointmentTime: datos.appointmentTime,
      reason: datos.reason.trim(),
      createdBy: usuario.id,
    });
  } catch (error) {
    // Carrera entre dos registros simultáneos: la llave única es la garantía.
    if (error?.code === 'ER_DUP_ENTRY') {
      throw errores.citaDuplicada();
    }
    throw error;
  }
}

export async function editar(id, datos) {
  const cita = await appointmentModel.findById(id);
  if (!cita) {
    throw errores.citaNoEncontrada();
  }
  if (cita.status !== 'PROGRAMADA') {
    throw errores.citaNoModificable(cita.status);
  }

  const clientId = Number(datos.clientId);
  const vehicleId = Number(datos.vehicleId);
  await validarClienteYVehiculo(clientId, vehicleId);
  await verificarUnicidad(vehicleId, datos.appointmentDate, datos.appointmentTime, id);

  try {
    return await appointmentModel.update(id, {
      clientId,
      vehicleId,
      appointmentDate: datos.appointmentDate,
      appointmentTime: datos.appointmentTime,
      reason: datos.reason.trim(),
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw errores.citaDuplicada();
    }
    throw error;
  }
}

/** COMPLETADA o CANCELADA con motivo; solo desde PROGRAMADA (FR-003). */
export async function cambiarEstado(id, datos) {
  const cita = await appointmentModel.findById(id);
  if (!cita) {
    throw errores.citaNoEncontrada();
  }
  if (cita.status !== 'PROGRAMADA') {
    throw errores.citaNoModificable(cita.status);
  }

  return appointmentModel.setStatus(id, {
    status: datos.status,
    cancellationReason:
      datos.status === 'CANCELADA' ? datos.cancellationReason.trim() : null,
  });
}
