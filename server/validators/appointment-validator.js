// T037: validador de payloads de citas (US1, research D14).
// clientId, vehicleId, appointmentDate, appointmentTime y reason obligatorios;
// la fecha debe ser igual o posterior a hoy al crear/editar y la hora HH:MM.
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function hoyIso() {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

export function validarCreacionCita(payload) {
  const errores = [];

  if (payload?.clientId == null || !Number.isInteger(Number(payload.clientId))) {
    errores.push('El cliente (clientId) es obligatorio.');
  }
  if (payload?.vehicleId == null || !Number.isInteger(Number(payload.vehicleId))) {
    errores.push('El vehículo (vehicleId) es obligatorio.');
  }
  if (!payload?.appointmentDate || !FECHA_RE.test(String(payload.appointmentDate))) {
    errores.push('La fecha (appointmentDate) es obligatoria con formato YYYY-MM-DD.');
  } else if (String(payload.appointmentDate) < hoyIso()) {
    errores.push('La fecha de la cita no puede ser anterior a hoy.');
  }
  if (!payload?.appointmentTime || !HORA_RE.test(String(payload.appointmentTime))) {
    errores.push('La hora (appointmentTime) es obligatoria con formato HH:MM.');
  }
  if (typeof payload?.reason !== 'string' || payload.reason.trim().length === 0) {
    errores.push('El motivo (reason) es obligatorio.');
  } else if (payload.reason.trim().length > 255) {
    errores.push('El motivo (reason) no puede exceder 255 caracteres.');
  }
  return errores;
}

/** Cambio de estado de la cita: COMPLETADA o CANCELADA con motivo obligatorio. */
export function validarCambioEstadoCita(payload) {
  const errores = [];
  const estado = payload?.status;

  if (!['COMPLETADA', 'CANCELADA'].includes(estado)) {
    errores.push('El estado (status) debe ser COMPLETADA o CANCELADA.');
  }
  if (estado === 'CANCELADA') {
    const motivo = payload?.cancellationReason;
    if (typeof motivo !== 'string' || motivo.trim().length === 0) {
      errores.push('El motivo de cancelación (cancellationReason) es obligatorio.');
    } else if (motivo.trim().length > 255) {
      errores.push('El motivo de cancelación no puede exceder 255 caracteres.');
    }
  }
  return errores;
}
