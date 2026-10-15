// T009: pruebas unitarias de la máquina de estados de órdenes (Sprint 2, CA-8).
// Cubren cada transición válida por rol, las inválidas, la pausa con retorno,
// los retrocesos permitidos, los saltos solo-administrador y los estados finales.
import {
  transicionValida,
  esEstadoFinal,
  ESTADOS_ORDEN,
} from '../../../services/order-state.js';

const ES = ESTADOS_ORDEN;

test('el mecánico dueño avanza en la secuencia de trabajo', () => {
  expect(
    transicionValida({ estadoActual: ES.RECIBIDO, estadoNuevo: ES.DIAGNOSTICO, rol: 'MECHANIC', esDuenio: true })
  ).toEqual({ valido: true, motivo: null });
  expect(
    transicionValida({ estadoActual: ES.DIAGNOSTICO, estadoNuevo: ES.EN_REPARACION, rol: 'MECHANIC', esDuenio: true })
  ).toEqual({ valido: true, motivo: null });
  expect(
    transicionValida({ estadoActual: ES.EN_REPARACION, estadoNuevo: ES.TERMINADO, rol: 'MECHANIC', esDuenio: true })
  ).toEqual({ valido: true, motivo: null });
});

test('recepción y administración también pueden avanzar los estados de trabajo', () => {
  for (const rol of ['ADMIN', 'RECEPTIONIST']) {
    expect(
      transicionValida({ estadoActual: ES.RECIBIDO, estadoNuevo: ES.DIAGNOSTICO, rol })
    ).toEqual({ valido: true, motivo: null });
    expect(
      transicionValida({ estadoActual: ES.EN_REPARACION, estadoNuevo: ES.TERMINADO, rol })
    ).toEqual({ valido: true, motivo: null });
  }
});

test('el mecánico no puede operar una orden que no es suya', () => {
  const resultado = transicionValida({
    estadoActual: ES.RECIBIDO,
    estadoNuevo: ES.DIAGNOSTICO,
    rol: 'MECHANIC',
    esDuenio: false,
  });
  expect(resultado.valido).toBe(false);
  expect(resultado.motivo).toContain('no está asignada');
});

test('la pausa por refacción regresa al estado desde el que se pausó', () => {
  expect(
    transicionValida({ estadoActual: ES.DIAGNOSTICO, estadoNuevo: ES.ESPERANDO_REFACCION, rol: 'MECHANIC', esDuenio: true })
  ).toEqual({ valido: true, motivo: null });
  expect(
    transicionValida({ estadoActual: ES.EN_REPARACION, estadoNuevo: ES.ESPERANDO_REFACCION, rol: 'RECEPTIONIST' })
  ).toEqual({ valido: true, motivo: null });

  // La salida de la pausa solo permite regresar al estado de origen.
  expect(
    transicionValida({
      estadoActual: ES.ESPERANDO_REFACCION,
      estadoNuevo: ES.EN_REPARACION,
      rol: 'MECHANIC',
      esDuenio: true,
      estadoOrigenPausa: ES.EN_REPARACION,
    })
  ).toEqual({ valido: true, motivo: null });
  expect(
    transicionValida({
      estadoActual: ES.ESPERANDO_REFACCION,
      estadoNuevo: ES.TERMINADO,
      rol: 'MECHANIC',
      esDuenio: true,
      estadoOrigenPausa: ES.EN_REPARACION,
    }).valido
  ).toBe(false);
});

test('los retrocesos permitidos funcionan para el mecánico dueño', () => {
  expect(
    transicionValida({ estadoActual: ES.TERMINADO, estadoNuevo: ES.EN_REPARACION, rol: 'MECHANIC', esDuenio: true })
  ).toEqual({ valido: true, motivo: null });
  expect(
    transicionValida({ estadoActual: ES.EN_REPARACION, estadoNuevo: ES.DIAGNOSTICO, rol: 'MECHANIC', esDuenio: true })
  ).toEqual({ valido: true, motivo: null });
});

test('DIAGNOSTICO a RECIBIDO solo lo hace el administrador', () => {
  expect(
    transicionValida({ estadoActual: ES.DIAGNOSTICO, estadoNuevo: ES.RECIBIDO, rol: 'ADMIN' })
  ).toEqual({ valido: true, motivo: null });
  expect(
    transicionValida({ estadoActual: ES.DIAGNOSTICO, estadoNuevo: ES.RECIBIDO, rol: 'RECEPTIONIST' }).valido
  ).toBe(false);
  expect(
    transicionValida({ estadoActual: ES.DIAGNOSTICO, estadoNuevo: ES.RECIBIDO, rol: 'MECHANIC', esDuenio: true }).valido
  ).toBe(false);
});

test('los saltos de secuencia solo los hace el administrador', () => {
  expect(
    transicionValida({ estadoActual: ES.RECIBIDO, estadoNuevo: ES.TERMINADO, rol: 'ADMIN' })
  ).toEqual({ valido: true, motivo: null });
  const mecanico = transicionValida({
    estadoActual: ES.RECIBIDO,
    estadoNuevo: ES.TERMINADO,
    rol: 'MECHANIC',
    esDuenio: true,
  });
  expect(mecanico.valido).toBe(false);
  expect(mecanico.motivo).toContain('Transición no permitida');
  expect(
    transicionValida({ estadoActual: ES.RECIBIDO, estadoNuevo: ES.TERMINADO, rol: 'RECEPTIONIST' }).valido
  ).toBe(false);
});

test('la entrega es de recepción y administración, nunca del mecánico', () => {
  expect(
    transicionValida({ estadoActual: ES.TERMINADO, estadoNuevo: ES.ENTREGADO, rol: 'RECEPTIONIST' })
  ).toEqual({ valido: true, motivo: null });
  expect(
    transicionValida({ estadoActual: ES.TERMINADO, estadoNuevo: ES.ENTREGADO, rol: 'ADMIN' })
  ).toEqual({ valido: true, motivo: null });
  expect(
    transicionValida({ estadoActual: ES.TERMINADO, estadoNuevo: ES.ENTREGADO, rol: 'MECHANIC', esDuenio: true }).valido
  ).toBe(false);
});

test('ENTREGADO y CANCELADA son estados finales sin transiciones', () => {
  expect(esEstadoFinal(ES.ENTREGADO)).toBe(true);
  expect(esEstadoFinal(ES.CANCELADA)).toBe(true);
  expect(esEstadoFinal(ES.TERMINADO)).toBe(false);

  expect(
    transicionValida({ estadoActual: ES.ENTREGADO, estadoNuevo: ES.EN_REPARACION, rol: 'ADMIN' }).valido
  ).toBe(false);
  expect(
    transicionValida({ estadoActual: ES.CANCELADA, estadoNuevo: ES.RECIBIDO, rol: 'ADMIN' }).valido
  ).toBe(false);
});

test('la cancelación la hacen recepción o administración desde cualquier estado previo', () => {
  for (const rol of ['ADMIN', 'RECEPTIONIST']) {
    expect(
      transicionValida({ estadoActual: ES.RECIBIDO, estadoNuevo: ES.CANCELADA, rol })
    ).toEqual({ valido: true, motivo: null });
    expect(
      transicionValida({ estadoActual: ES.TERMINADO, estadoNuevo: ES.CANCELADA, rol })
    ).toEqual({ valido: true, motivo: null });
  }
  expect(
    transicionValida({ estadoActual: ES.RECIBIDO, estadoNuevo: ES.CANCELADA, rol: 'MECHANIC', esDuenio: true }).valido
  ).toBe(false);
  // Cancelar desde ENTREGADO está prohibido (ya es historial).
  expect(
    transicionValida({ estadoActual: ES.ENTREGADO, estadoNuevo: ES.CANCELADA, rol: 'ADMIN' }).valido
  ).toBe(false);
});

test('permanecer en el mismo estado no es una transición válida', () => {
  expect(
    transicionValida({ estadoActual: ES.DIAGNOSTICO, estadoNuevo: ES.DIAGNOSTICO, rol: 'ADMIN' }).valido
  ).toBe(false);
});

test('faltan datos obligatorios para validar', () => {
  expect(transicionValida({}).valido).toBe(false);
  expect(
    transicionValida({ estadoActual: ES.RECIBIDO, estadoNuevo: ES.DIAGNOSTICO, rol: '' }).valido
  ).toBe(false);
});
