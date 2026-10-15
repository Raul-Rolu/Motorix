/**
 * Servicio de mantenimientos (Sprint 3, T023, US3/US4).
 *
 * RN-11/RN-12: umbrales configurables por registro (fecha y/o kilometraje).
 * Aclaración Q1: el cumplimiento es manual y la entrega de una orden NUNCA
 * completa un mantenimiento. Aclaración Q4: la cancelación es solo de
 * administración con motivo obligatorio. El vencimiento se deriva del umbral
 * alcanzado (FR-006, research D2).
 */
import * as maintenanceModel from '../models/maintenance.js';
import * as vehicleModel from '../models/vehicle.js';
import { errores } from '../utils/errors.js';
import {
  esVencido,
  proximidad,
  diasRestantes,
  kmRestantes,
} from './maintenance-state.js';

/** Registra un mantenimiento nuevo (siempre PENDING). */
export async function registrar(datos, usuario) {
  const vehicleId = Number(datos.vehicleId);
  const vehiculo = await vehicleModel.findById(vehicleId);
  if (!vehiculo) {
    throw errores.vehiculoNoDisponible();
  }

  const targetMileage =
    datos.targetMileage != null && datos.targetMileage !== ''
      ? Number(datos.targetMileage)
      : null;

  return maintenanceModel.create({
    vehicleId,
    description: datos.descripcion.trim(),
    targetDate: datos.targetDate ? String(datos.targetDate).trim() : null,
    targetMileage,
    createdBy: usuario.id,
  });
}

/**
 * Listado en orden de urgencia (FR-007, aclaración Q5): vencidos primero y
 * después los pendientes por umbral más cercano, sin ventana de tiempo fija.
 * Los cancelados no aparecen a menos que se pidan explícitamente.
 */
export async function listar(filtros = {}) {
  const vehicleId =
    filtros.vehicleId != null && filtros.vehicleId !== ''
      ? Number(filtros.vehicleId)
      : null;
  const status = filtros.status || null;
  const incluirCancelados = status === 'CANCELLED';

  const mantenimientos = await maintenanceModel.findAll({
    vehicleId,
    status,
    incluirCancelados,
  });
  const kilometrajes = await maintenanceModel.findCurrentMileageByVehicles();

  const decorados = mantenimientos.map((mantenimiento) => {
    const kmActual = kilometrajes.get(mantenimiento.vehicleId) ?? 0;
    return {
      ...mantenimiento,
      kilometrajeActual: kmActual,
      isOverdue: esVencido(mantenimiento, kmActual),
      daysLeft: diasRestantes(mantenimiento.targetDate),
      kmLeft: kmRestantes(mantenimiento.targetMileage, kmActual),
    };
  });

  decorados.sort((a, b) => {
    // 1) Vencidos primero.
    if (a.isOverdue !== b.isOverdue) {
      return a.isOverdue ? -1 : 1;
    }
    // 2) Pendientes por proximidad del umbral más cercano.
    const proximidadA = proximidad(a, a.kilometrajeActual);
    const proximidadB = proximidad(b, b.kilometrajeActual);
    if (proximidadA != null && proximidadB != null && proximidadA !== proximidadB) {
      return proximidadA - proximidadB;
    }
    // 3) Más recientes primero.
    return b.id - a.id;
  });

  return decorados;
}

/** Carga el mantenimiento para modificarlo: existe y está PENDING. */
async function obtenerMantenimientoOperable(id) {
  const mantenimiento = await maintenanceModel.findById(id);
  if (!mantenimiento) {
    throw errores.mantenimientoNoEncontrado();
  }
  if (mantenimiento.status !== 'PENDING') {
    throw errores.mantenimientoNoModificable(mantenimiento.status);
  }
  return mantenimiento;
}

/** Cumplimiento manual (aclaración Q1): permitido a los tres roles autorizados. */
export async function completar(id, usuario) {
  await obtenerMantenimientoOperable(id);
  return maintenanceModel.completar(id, usuario.id);
}

/** Cancelación (aclaración Q4): solo administración, con motivo obligatorio. */
export async function cancelar(id, datos, usuario) {
  await obtenerMantenimientoOperable(id);
  return maintenanceModel.cancelar(id, {
    reason: datos.reason.trim(),
    userId: usuario.id,
  });
}
