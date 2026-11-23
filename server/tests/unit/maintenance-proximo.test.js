// 007-notificaciones-internas, T010 (FR-012, CA-3, CA-5): regla de «mantenimiento
// próximo» del aviso. Es un pendiente NO vencido cuyo umbral más cercano está a
// 30 días o menos, o a 1,000 km o menos (márgenes constantes solo del aviso).
// «Vencido» conserva la regla existente (RN-11). Funciones puras, sin base de datos.
import {
  MARGEN_PROXIMO_DIAS,
  MARGEN_PROXIMO_KM,
  esProximo,
  esVencido,
} from '../../services/maintenance-state.js';

// Fecha fija de referencia para que las pruebas no dependan del día real.
const HOY = new Date(2026, 10, 22); // 22 de noviembre de 2026 (local)

const pendiente = (datos) => ({ status: 'PENDING', targetDate: null, targetMileage: null, ...datos });

test('los márgenes son 30 días y 1,000 km', () => {
  expect(MARGEN_PROXIMO_DIAS).toBe(30);
  expect(MARGEN_PROXIMO_KM).toBe(1000);
});

describe('esProximo por fecha', () => {
  test('a 30 días del umbral es próximo', () => {
    expect(esProximo(pendiente({ targetDate: '2026-12-22' }), 0, HOY)).toBe(true);
  });

  test('a 31 días del umbral todavía no es próximo', () => {
    expect(esProximo(pendiente({ targetDate: '2026-12-23' }), 0, HOY)).toBe(false);
  });

  test('a 1 día del umbral es próximo', () => {
    expect(esProximo(pendiente({ targetDate: '2026-11-23' }), 0, HOY)).toBe(true);
  });
});

describe('esProximo por kilometraje', () => {
  test('a 1,000 km del umbral es próximo', () => {
    expect(esProximo(pendiente({ targetMileage: 51000 }), 50000, HOY)).toBe(true);
  });

  test('a 1,001 km del umbral todavía no es próximo', () => {
    expect(esProximo(pendiente({ targetMileage: 51001 }), 50000, HOY)).toBe(false);
  });

  test('a 1 km del umbral es próximo', () => {
    expect(esProximo(pendiente({ targetMileage: 50001 }), 50000, HOY)).toBe(true);
  });
});

describe('esProximo con ambos umbrales', () => {
  test('basta que se cumpla el margen de uno: fecha cercana y kilometraje lejano', () => {
    const mantenimiento = pendiente({ targetDate: '2026-12-05', targetMileage: 60000 });
    expect(esProximo(mantenimiento, 50000, HOY)).toBe(true);
  });

  test('basta que se cumpla el margen de uno: fecha lejana y kilometraje cercano', () => {
    const mantenimiento = pendiente({ targetDate: '2027-06-30', targetMileage: 50500 });
    expect(esProximo(mantenimiento, 50000, HOY)).toBe(true);
  });

  test('si ninguno entra en su margen no es próximo', () => {
    const mantenimiento = pendiente({ targetDate: '2027-06-30', targetMileage: 60000 });
    expect(esProximo(mantenimiento, 50000, HOY)).toBe(false);
  });
});

describe('esProximo con un solo umbral', () => {
  test('solo fecha: se evalúa únicamente la fecha (el kilometraje actual no influye)', () => {
    expect(esProximo(pendiente({ targetDate: '2026-12-01' }), 999999, HOY)).toBe(true);
    expect(esProximo(pendiente({ targetDate: '2027-03-01' }), 999999, HOY)).toBe(false);
  });

  test('solo kilometraje: se evalúa únicamente el kilometraje (la fecha de hoy no influye)', () => {
    expect(esProximo(pendiente({ targetMileage: 50400 }), 50000, new Date(2030, 0, 1))).toBe(true);
    expect(esProximo(pendiente({ targetMileage: 70000 }), 50000, new Date(2030, 0, 1))).toBe(false);
  });

  test('sin ningún umbral no es próximo', () => {
    expect(esProximo(pendiente({}), 50000, HOY)).toBe(false);
  });
});

describe('esProximo no incluye lo vencido ni lo que no está pendiente', () => {
  test('un mantenimiento vencido por fecha no es próximo', () => {
    const mantenimiento = pendiente({ targetDate: '2026-11-22' });
    expect(esVencido(mantenimiento, 0, HOY)).toBe(true);
    expect(esProximo(mantenimiento, 0, HOY)).toBe(false);
  });

  test('un mantenimiento vencido por kilometraje no es próximo', () => {
    const mantenimiento = pendiente({ targetMileage: 50000 });
    expect(esVencido(mantenimiento, 50500, HOY)).toBe(true);
    expect(esProximo(mantenimiento, 50500, HOY)).toBe(false);
  });

  test('con un umbral vencido y el otro dentro del margen sigue siendo vencido, no próximo', () => {
    const mantenimiento = pendiente({ targetDate: '2026-12-01', targetMileage: 50000 });
    expect(esVencido(mantenimiento, 50000, HOY)).toBe(true);
    expect(esProximo(mantenimiento, 50000, HOY)).toBe(false);
  });

  test.each(['COMPLETED', 'CANCELLED'])('un mantenimiento %s nunca es próximo', (status) => {
    expect(esProximo({ status, targetDate: '2026-11-25', targetMileage: null }, 0, HOY)).toBe(false);
  });
});

describe('esVencido conserva su comportamiento actual (sin cambios por esta feature)', () => {
  test('vencido cuando la fecha llegó o el kilometraje se alcanzó', () => {
    expect(esVencido(pendiente({ targetDate: '2026-11-22' }), 0, HOY)).toBe(true);
    expect(esVencido(pendiente({ targetDate: '2026-11-23' }), 0, HOY)).toBe(false);
    expect(esVencido(pendiente({ targetMileage: 50000 }), 50000, HOY)).toBe(true);
    expect(esVencido(pendiente({ targetMileage: 50001 }), 50000, HOY)).toBe(false);
  });

  test('con ambos umbrales rige el primero que se cumpla', () => {
    const mantenimiento = pendiente({ targetDate: '2027-01-01', targetMileage: 50000 });
    expect(esVencido(mantenimiento, 50000, HOY)).toBe(true);
  });

  test('no está vencido si no está pendiente', () => {
    expect(esVencido({ status: 'CANCELLED', targetDate: '2020-01-01', targetMileage: null }, 0, HOY)).toBe(false);
  });
});
