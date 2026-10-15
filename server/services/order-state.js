/**
 * Máquina de estados de las órdenes de servicio (T008, Sprint 2).
 *
 * Función pura, sin base de datos ni Express: el servicio de órdenes la consulta
 * antes de aplicar cualquier cambio de estado (FR-012, research D2).
 * Reglas (Clarificaciones 1–3):
 * - Avances estrictos: RECIBIDO → DIAGNOSTICO → EN_REPARACION → TERMINADO → ENTREGADO.
 * - ESPERANDO_REFACCION: desde DIAGNOSTICO o EN_REPARACION; la salida regresa
 *   siempre al estado desde el que se pausó.
 * - Retrocesos permitidos para todos los roles de operación:
 *   TERMINADO → EN_REPARACION y EN_REPARACION → DIAGNOSTICO.
 * - Solo administrador: DIAGNOSTICO → RECIBIDO y los saltos de secuencia.
 * - Entrega (TERMINADO → ENTREGADO): solo recepción y administrador.
 * - CANCELADA: desde cualquier estado previo a ENTREGADO, solo recepción y
 *   administrador.
 * - ENTREGADO y CANCELADA son estados finales sin transiciones.
 * - El mecánico solo opera sus propias órdenes (la pertenencia la valida el
 *   servicio con `esDuenio`).
 */

export const ESTADOS_ORDEN = Object.freeze({
  RECIBIDO: 'RECIBIDO',
  DIAGNOSTICO: 'DIAGNOSTICO',
  EN_REPARACION: 'EN_REPARACION',
  ESPERANDO_REFACCION: 'ESPERANDO_REFACCION',
  TERMINADO: 'TERMINADO',
  ENTREGADO: 'ENTREGADO',
  CANCELADA: 'CANCELADA',
});

const OPERACION = ['ADMIN', 'RECEPTIONIST', 'MECHANIC'];
const ADMIN_RECEPCION = ['ADMIN', 'RECEPTIONIST'];

// "__ORIGEN__" significa "regresar al estado desde el que se pausó".
const TRANSICIONES = [
  { desde: 'RECIBIDO', hacia: 'DIAGNOSTICO', roles: OPERACION },
  { desde: 'DIAGNOSTICO', hacia: 'EN_REPARACION', roles: OPERACION },
  { desde: 'DIAGNOSTICO', hacia: 'ESPERANDO_REFACCION', roles: OPERACION },
  { desde: 'DIAGNOSTICO', hacia: 'RECIBIDO', roles: ['ADMIN'] },
  { desde: 'EN_REPARACION', hacia: 'TERMINADO', roles: OPERACION },
  { desde: 'EN_REPARACION', hacia: 'ESPERANDO_REFACCION', roles: OPERACION },
  { desde: 'EN_REPARACION', hacia: 'DIAGNOSTICO', roles: OPERACION },
  { desde: 'ESPERANDO_REFACCION', hacia: '__ORIGEN__', roles: OPERACION },
  { desde: 'TERMINADO', hacia: 'ENTREGADO', roles: ADMIN_RECEPCION },
  { desde: 'TERMINADO', hacia: 'EN_REPARACION', roles: OPERACION },
];

const ESTADOS_FINALES = ['ENTREGADO', 'CANCELADA'];

/**
 * Valida una transición de estado.
 *
 * @param {object} parametros
 * @param {string} parametros.estadoActual - Estado actual de la orden.
 * @param {string} parametros.estadoNuevo - Estado al que se quiere pasar.
 * @param {string} parametros.rol - Rol del usuario que pide el cambio.
 * @param {boolean} [parametros.esDuenio] - La orden está asignada al mecánico.
 * @param {string|null} [parametros.estadoOrigenPausa] - Estado guardado en previous_state.
 * @returns {{ valido: boolean, motivo: string|null }}
 */
export function transicionValida({
  estadoActual,
  estadoNuevo,
  rol,
  esDuenio = false,
  estadoOrigenPausa = null,
}) {
  if (!estadoActual || !estadoNuevo || !rol) {
    return { valido: false, motivo: 'Faltan datos para validar la transición.' };
  }

  if (estadoActual === estadoNuevo) {
    return {
      valido: false,
      motivo: `La orden ya está en el estado ${estadoActual}.`,
    };
  }

  if (ESTADOS_FINALES.includes(estadoActual)) {
    return {
      valido: false,
      motivo: `La orden está ${estadoActual} y no admite cambios (RN-9).`,
    };
  }

  // El mecánico solo trabaja sus propias órdenes.
  if (rol === 'MECHANIC' && !esDuenio) {
    return {
      valido: false,
      motivo: 'La orden no está asignada a este mecánico.',
    };
  }

  // Cancelación: cualquier estado previo a ENTREGADO, solo recepción/administración.
  if (estadoNuevo === 'CANCELADA') {
    if (!ADMIN_RECEPCION.includes(rol)) {
      return {
        valido: false,
        motivo: 'Solo recepción o administración pueden cancelar órdenes.',
      };
    }
    return { valido: true, motivo: null };
  }

  // Saltos de secuencia o retrocesos no tabulados: solo administración.
  const transicion = TRANSICIONES.find(
    (t) =>
      t.desde === estadoActual &&
      (t.hacia === estadoNuevo ||
        (t.hacia === '__ORIGEN__' &&
          estadoNuevo === estadoOrigenPausa))
  );

  if (!transicion) {
    if (rol === 'ADMIN') {
      return { valido: true, motivo: null };
    }
    return {
      valido: false,
      motivo: `Transición no permitida: de ${estadoActual} a ${estadoNuevo}. Avance en la secuencia o use un retroceso permitido.`,
    };
  }

  if (!transicion.roles.includes(rol)) {
    return {
      valido: false,
      motivo: `El rol ${rol} no puede realizar la transición de ${estadoActual} a ${estadoNuevo}.`,
    };
  }

  return { valido: true, motivo: null };
}

/** Estados desde los que es posible pausar por refacción. */
export const ESTADOS_DE_PAUSA = Object.freeze(['DIAGNOSTICO', 'EN_REPARACION']);

/**
 * Estados a los que el rol puede avanzar desde el estado actual
 * (se usa para enriquecer el mensaje de TRANSICION_INVALIDA con las
 * opciones válidas; research D2 y contrato FR-012).
 */
export function estadosSiguientes({ estadoActual, rol, estadoOrigenPausa = null }) {
  if (!estadoActual || !rol || ESTADOS_FINALES.includes(estadoActual)) {
    return [];
  }
  const salidas = new Set();

  for (const transicion of TRANSICIONES) {
    if (transicion.desde !== estadoActual) continue;
    if (!transicion.roles.includes(rol)) continue;
    if (transicion.hacia === '__ORIGEN__') {
      if (estadoOrigenPausa) salidas.add(estadoOrigenPausa);
    } else {
      salidas.add(transicion.hacia);
    }
  }
  if (ADMIN_RECEPCION.includes(rol)) {
    salidas.add('CANCELADA');
  }
  return [...salidas];
}

/** Indica si un estado es final (historial de solo lectura). */
export function esEstadoFinal(estado) {
  return ESTADOS_FINALES.includes(estado);
}
