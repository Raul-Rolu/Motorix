// 008-configuracion-seguridad-reportes, T110-T111 (bloque P3, base común; FR-023,
// FR-028, CA-6, CA-11): validación de las consultas de los reportes (rango,
// paginación y nombre de reporte) y los errores nuevos del catálogo
// `RANGO_INVALIDO` (400) y `REPORT_NOT_FOUND` (404). Funciones puras con mensajes
// en español.
import {
  validarRangoDeReporte,
  validarPaginacion,
  esReporteValido,
  REPORTES,
  LIMITE_POR_DEFECTO,
  LIMITE_MAXIMO,
} from '../../../validators/report-validator.js';
import { errores, AppError } from '../../../utils/errors.js';

const HOY = new Date(2026, 10, 24, 12);

describe('errores del catálogo', () => {
  test('RANGO_INVALIDO es 400 con el mensaje indicado', () => {
    const error = errores.rangoInvalido('El rango no es válido.');

    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(400);
    expect(error.codigo).toBe('RANGO_INVALIDO');
    expect(error.message).toBe('El rango no es válido.');
  });

  test('RANGO_INVALIDO tiene un mensaje por omisión en español', () => {
    expect(errores.rangoInvalido().message).toMatch(/rango/i);
  });

  test('REPORT_NOT_FOUND es 404 en español', () => {
    const error = errores.reporteNoEncontrado();

    expect(error.status).toBe(404);
    expect(error.codigo).toBe('REPORT_NOT_FOUND');
    expect(error.message).toMatch(/reporte/i);
  });
});

describe('validarRangoDeReporte', () => {
  test('acepta desde y hasta y devuelve el rango resuelto', () => {
    const { errores: lista, rango } = validarRangoDeReporte({ desde: '2026-11-01', hasta: '2026-11-30' }, HOY);

    expect(lista).toEqual([]);
    expect(rango).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-30', dias: 30 });
  });

  test('acepta el periodo MES_ANTERIOR', () => {
    expect(validarRangoDeReporte({ periodo: 'MES_ANTERIOR' }, HOY).rango).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' });
  });

  test('un rango inválido devuelve los mensajes y ningún rango', () => {
    const { errores: lista, rango } = validarRangoDeReporte({ desde: '2026-11-30', hasta: '2026-11-01' }, HOY);

    expect(rango).toBeNull();
    expect(lista.length).toBeGreaterThan(0);
  });

  test('los demás parámetros de la consulta (pagina, limite) no afectan al rango', () => {
    const { errores: lista } = validarRangoDeReporte({ desde: '2026-11-01', hasta: '2026-11-30', pagina: '2', limite: '10' }, HOY);

    expect(lista).toEqual([]);
  });
});

describe('validarPaginacion', () => {
  test('sin parámetros usa página 1 y 50 por página', () => {
    expect(LIMITE_POR_DEFECTO).toBe(50);
    expect(LIMITE_MAXIMO).toBe(100);
    expect(validarPaginacion({})).toEqual({ errores: [], pagina: 1, limite: 50 });
  });

  test('acepta página y límite válidos, incluidos los extremos 1 y 100', () => {
    expect(validarPaginacion({ pagina: '3', limite: '25' })).toEqual({ errores: [], pagina: 3, limite: 25 });
    expect(validarPaginacion({ limite: '1' }).limite).toBe(1);
    expect(validarPaginacion({ limite: '100' }).limite).toBe(100);
  });

  test.each(['0', '101', '-5', '1.5', 'abc', '', '1e2', ' 10', '10 ', '0x10'])('el límite «%s» es inválido', (limite) => {
    const resultado = validarPaginacion({ limite });

    expect(resultado.errores.join(' ')).toMatch(/límite/i);
    expect(resultado.errores.join(' ')).toMatch(/1.*100/);
  });

  test.each(['0', '-1', '1.5', 'abc', '', '99999999999'])('la página «%s» es inválida', (pagina) => {
    const resultado = validarPaginacion({ pagina });

    expect(resultado.errores.join(' ')).toMatch(/página/i);
  });

  test('valores que no son texto (arreglos o números) son inválidos', () => {
    expect(validarPaginacion({ limite: ['10', '20'] }).errores.length).toBeGreaterThan(0);
    expect(validarPaginacion({ pagina: ['1', '2'] }).errores.length).toBeGreaterThan(0);
  });

  test('puede acumular los dos errores', () => {
    expect(validarPaginacion({ pagina: '0', limite: '0' }).errores).toHaveLength(2);
  });
});

describe('esReporteValido', () => {
  test('el catálogo tiene los cinco reportes', () => {
    expect(REPORTES).toEqual(['income', 'services', 'productivity', 'parts', 'rotation']);
  });

  test.each(['income', 'services', 'productivity', 'parts', 'rotation'])('«%s» es válido', (nombre) => {
    expect(esReporteValido(nombre)).toBe(true);
  });

  test.each(['', 'INCOME', 'ingresos', 'users', '../etc/passwd', 'income;', 'constructor', '__proto__', 'toString', undefined, null, 5])(
    '«%s» no es un reporte',
    (nombre) => {
      expect(esReporteValido(nombre)).toBe(false);
    }
  );
});
