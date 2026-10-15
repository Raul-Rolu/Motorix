// T030: pruebas unitarias del folio del ticket (US3, FR-012; research D4).
//
// Funciones puras: sin red, sin base de datos y deterministas.
import {
  generarFolio,
  esFolioValido,
  anioDelFolio,
} from '../../services/ticket-folio.js';

test('el folio se genera con el formato TCK-AAAA-NNNN (FR-012)', () => {
  expect(generarFolio(2026, 1)).toBe('TCK-2026-0001');
  expect(generarFolio(2026, 42)).toBe('TCK-2026-0042');
  expect(generarFolio(2026, 1234)).toBe('TCK-2026-1234');
});

test('el folio válido se reconoce y los formatos ajenos se rechazan', () => {
  expect(esFolioValido('TCK-2026-0001')).toBe(true);
  expect(esFolioValido('TCK-9999-9999')).toBe(true);

  expect(esFolioValido('tck-2026-0001')).toBe(false);
  expect(esFolioValido('TCK-26-1')).toBe(false);
  expect(esFolioValido('TCK-2026-1')).toBe(false);
  expect(esFolioValido('FAC-2026-0001')).toBe(false);
  expect(esFolioValido('')).toBe(false);
  expect(esFolioValido(null)).toBe(false);
  expect(esFolioValido(20260001)).toBe(false);
});

test('el año del folio se extrae para auditoría por periodo', () => {
  expect(anioDelFolio('TCK-2026-0007')).toBe(2026);
  expect(anioDelFolio('no es folio')).toBeNull();
  expect(anioDelFolio(undefined)).toBeNull();
});
