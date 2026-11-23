// 008-configuracion-seguridad-reportes, T013 (bloque P1; FR-004, CA-2, CA-3):
// `esProximo` acepta márgenes opcionales (los ajustes del administrador) y, sin
// ellos, conserva los márgenes de 30 días y 1,000 km del Sprint 6. Archivo nuevo:
// no se edita `maintenance-proximo.test.js`. Funciones puras, sin base de datos.
import {
  MARGEN_PROXIMO_DIAS,
  MARGEN_PROXIMO_KM,
  esProximo,
  esVencido,
} from '../../services/maintenance-state.js';

// Fecha fija de referencia para que las pruebas no dependan del día real.
const HOY = new Date(2026, 10, 22); // 22 de noviembre de 2026 (local)

const pendiente = (datos) => ({ status: 'PENDING', targetDate: null, targetMileage: null, ...datos });

test('las constantes del Sprint 6 siguen exportadas como valores de respaldo', () => {
  expect(MARGEN_PROXIMO_DIAS).toBe(30);
  expect(MARGEN_PROXIMO_KM).toBe(1000);
});

describe('márgenes explícitos por fecha', () => {
  const margenes = { dias: 15, km: 500 };

  test('a 15 días del umbral es próximo', () => {
    expect(esProximo(pendiente({ targetDate: '2026-12-07' }), 0, HOY, margenes)).toBe(true);
  });

  test('a 16 días del umbral ya no es próximo', () => {
    expect(esProximo(pendiente({ targetDate: '2026-12-08' }), 0, HOY, margenes)).toBe(false);
  });

  test('un margen mayor al de respaldo amplía lo que es próximo', () => {
    const lejano = pendiente({ targetDate: '2027-01-11' }); // 50 días
    expect(esProximo(lejano, 0, HOY)).toBe(false);
    expect(esProximo(lejano, 0, HOY, { dias: 60, km: 1000 })).toBe(true);
  });
});

describe('márgenes explícitos por kilometraje', () => {
  const margenes = { dias: 15, km: 500 };

  test('a 500 km del umbral es próximo', () => {
    expect(esProximo(pendiente({ targetMileage: 50500 }), 50000, HOY, margenes)).toBe(true);
  });

  test('a 501 km del umbral ya no es próximo', () => {
    expect(esProximo(pendiente({ targetMileage: 50501 }), 50000, HOY, margenes)).toBe(false);
  });
});

describe('sin márgenes se usan los de respaldo', () => {
  test('30 días sí y 31 no', () => {
    expect(esProximo(pendiente({ targetDate: '2026-12-22' }), 0, HOY)).toBe(true);
    expect(esProximo(pendiente({ targetDate: '2026-12-23' }), 0, HOY)).toBe(false);
  });

  test('1,000 km sí y 1,001 no', () => {
    expect(esProximo(pendiente({ targetMileage: 51000 }), 50000, HOY)).toBe(true);
    expect(esProximo(pendiente({ targetMileage: 51001 }), 50000, HOY)).toBe(false);
  });

  test('márgenes parciales usan el respaldo para lo que falte', () => {
    expect(esProximo(pendiente({ targetDate: '2026-12-22' }), 0, HOY, { dias: 15 })).toBe(false);
    expect(esProximo(pendiente({ targetMileage: 51000 }), 50000, HOY, { dias: 15 })).toBe(true);
  });
});

describe('lo vencido nunca es próximo, con cualquier margen', () => {
  test('un mantenimiento vencido por fecha no es próximo aunque el margen sea enorme', () => {
    const vencido = pendiente({ targetDate: '2026-11-01' });
    expect(esVencido(vencido, 0, HOY)).toBe(true);
    expect(esProximo(vencido, 0, HOY, { dias: 365, km: 50000 })).toBe(false);
  });

  test('uno cancelado o completado nunca es próximo', () => {
    const base = { targetDate: '2026-11-30', targetMileage: null };
    expect(esProximo({ ...base, status: 'CANCELLED' }, 0, HOY, { dias: 60, km: 1000 })).toBe(false);
    expect(esProximo({ ...base, status: 'COMPLETED' }, 0, HOY, { dias: 60, km: 1000 })).toBe(false);
  });
});
