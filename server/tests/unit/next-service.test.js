// 008-configuracion-seguridad-reportes, T030 (bloque P1, US3; FR-008, FR-009,
// CA-5): cálculo puro del próximo servicio a partir de los tipos de servicio con
// intervalo. La fecha es la base más el menor intervalo en días y el kilometraje
// es el de la base más el menor intervalo en km; cada dimensión es
// independiente y, sin ningún intervalo, no hay próximo servicio. Sin base de datos.
import { calcularProximoServicio } from '../../utils/next-service.js';

const BASE = new Date(2026, 10, 23); // 23 de noviembre de 2026 (local)

const tipo = (intervaloDias, intervaloKm) => ({ intervaloDias, intervaloKm });

test('un tipo con días y km: fecha base + días y kilometraje base + km', () => {
  const resultado = calcularProximoServicio({
    tipos: [tipo(180, 5000)],
    kilometrajeBase: 78000,
    fechaBase: BASE,
  });

  expect(resultado).toEqual({ fecha: '2027-05-22', kilometraje: 83000 });
});

test('un tipo solo con días no calcula kilometraje', () => {
  expect(
    calcularProximoServicio({ tipos: [tipo(90, null)], kilometrajeBase: 78000, fechaBase: BASE })
  ).toEqual({ fecha: '2027-02-21', kilometraje: null });
});

test('un tipo solo con km no calcula fecha', () => {
  expect(
    calcularProximoServicio({ tipos: [tipo(null, 10000)], kilometrajeBase: 78000, fechaBase: BASE })
  ).toEqual({ fecha: null, kilometraje: 88000 });
});

test('con varios tipos usa el menor intervalo de cada dimensión', () => {
  const resultado = calcularProximoServicio({
    tipos: [tipo(365, 10000), tipo(90, 20000), tipo(null, 5000), tipo(180, null)],
    kilometrajeBase: 1000,
    fechaBase: BASE,
  });

  expect(resultado).toEqual({ fecha: '2027-02-21', kilometraje: 6000 });
});

test('sin tipos o sin ningún intervalo válido no hay próximo servicio (null)', () => {
  expect(calcularProximoServicio({ tipos: [], kilometrajeBase: 1000, fechaBase: BASE })).toBeNull();
  expect(
    calcularProximoServicio({ tipos: [tipo(null, null)], kilometrajeBase: 1000, fechaBase: BASE })
  ).toBeNull();
  expect(
    calcularProximoServicio({ tipos: undefined, kilometrajeBase: 1000, fechaBase: BASE })
  ).toBeNull();
});

test('ignora intervalos no positivos o no enteros', () => {
  expect(
    calcularProximoServicio({
      tipos: [tipo(0, -5), tipo(2.5, 'abc')],
      kilometrajeBase: 1000,
      fechaBase: BASE,
    })
  ).toBeNull();
  expect(
    calcularProximoServicio({
      tipos: [tipo(0, 5000), tipo(30, null)],
      kilometrajeBase: 1000,
      fechaBase: BASE,
    })
  ).toEqual({ fecha: '2026-12-23', kilometraje: 6000 });
});

test('la fecha cruza fin de mes y de año con el formato AAAA-MM-DD', () => {
  expect(
    calcularProximoServicio({
      tipos: [tipo(60, null)],
      kilometrajeBase: 0,
      fechaBase: new Date(2026, 11, 31),
    }).fecha
  ).toBe('2027-03-01');
});

test('respeta el año bisiesto', () => {
  expect(
    calcularProximoServicio({
      tipos: [tipo(60, null)],
      kilometrajeBase: 0,
      fechaBase: new Date(2027, 11, 31),
    }).fecha
  ).toBe('2028-02-29');
});

test('sin kilometraje base no se calcula el kilometraje aunque haya intervalo', () => {
  expect(
    calcularProximoServicio({ tipos: [tipo(30, 5000)], kilometrajeBase: null, fechaBase: BASE })
  ).toEqual({ fecha: '2026-12-23', kilometraje: null });
});
