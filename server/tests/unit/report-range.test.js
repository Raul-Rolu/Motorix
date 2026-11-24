// 008-configuracion-seguridad-reportes, T106 (bloque P3, base común; FR-023, CA-6):
// el rango de los reportes. `desde` y `hasta` son fechas locales `AAAA-MM-DD`
// INCLUSIVAS (un reporte de un solo día es `desde = hasta`); `periodo` es
// `MES_ACTUAL` o `MES_ANTERIOR` y se calcula con un «hoy» inyectable, siempre como
// mes completo (del día 1 al último día). El máximo es de 366 días. Funciones
// puras: no tocan la base de datos.
import { resolverRango, agrupacionDe, MAXIMO_DIAS } from '../../utils/report-range.js';

/** «Hoy» local a mediodía (lejos de los cambios de día por huso). */
const hoy = (anio, mes, dia) => new Date(anio, mes - 1, dia, 12, 0, 0);

const HOY = hoy(2026, 11, 24);

describe('desde y hasta (inclusivos)', () => {
  test('devuelve el rango, los límites SQL (fin exclusivo) y el número de días', () => {
    const { errores, rango } = resolverRango({ desde: '2026-11-01', hasta: '2026-11-30' }, HOY);

    expect(errores).toEqual([]);
    expect(rango).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-30',
      desdeSql: '2026-11-01 00:00:00',
      hastaExclusivoSql: '2026-12-01 00:00:00',
      dias: 30,
    });
  });

  test('un solo día (desde = hasta) es válido y cuenta 1 día', () => {
    const { errores, rango } = resolverRango({ desde: '2026-11-15', hasta: '2026-11-15' }, HOY);

    expect(errores).toEqual([]);
    expect(rango.dias).toBe(1);
    expect(rango.hastaExclusivoSql).toBe('2026-11-16 00:00:00');
  });

  test('el último día del mes y del año termina el día siguiente (sin desbordes)', () => {
    expect(resolverRango({ desde: '2026-12-01', hasta: '2026-12-31' }, HOY).rango.hastaExclusivoSql).toBe('2027-01-01 00:00:00');
    expect(resolverRango({ desde: '2026-02-01', hasta: '2026-02-28' }, HOY).rango.hastaExclusivoSql).toBe('2026-03-01 00:00:00');
    expect(resolverRango({ desde: '2024-02-01', hasta: '2024-02-29' }, HOY).rango.hastaExclusivoSql).toBe('2024-03-01 00:00:00');
  });

  test('las fechas futuras son válidas (un reporte vacío no es un error)', () => {
    const { errores } = resolverRango({ desde: '2030-01-01', hasta: '2030-01-31' }, HOY);

    expect(errores).toEqual([]);
  });
});

describe('periodo', () => {
  test('MES_ACTUAL es el mes completo de «hoy»', () => {
    const { errores, rango } = resolverRango({ periodo: 'MES_ACTUAL' }, HOY);

    expect(errores).toEqual([]);
    expect(rango).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-30', dias: 30 });
  });

  test('MES_ANTERIOR es el mes completo anterior', () => {
    const { rango } = resolverRango({ periodo: 'MES_ANTERIOR' }, HOY);

    expect(rango).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31', dias: 31 });
  });

  test('en enero, el mes anterior es diciembre del año previo', () => {
    const { rango } = resolverRango({ periodo: 'MES_ANTERIOR' }, hoy(2027, 1, 15));

    expect(rango).toMatchObject({ desde: '2026-12-01', hasta: '2026-12-31' });
  });

  test.each([
    ['31 de marzo de 2026 → febrero de 2026 (28 días)', hoy(2026, 3, 31), '2026-02-01', '2026-02-28', 28],
    ['31 de marzo de 2024 → febrero bisiesto de 2024 (29 días)', hoy(2024, 3, 31), '2024-02-01', '2024-02-29', 29],
    ['31 de enero → diciembre', hoy(2026, 1, 31), '2025-12-01', '2025-12-31', 31],
    ['1 de mayo → abril (30 días)', hoy(2026, 5, 1), '2026-04-01', '2026-04-30', 30],
    ['29 de febrero de 2024 → enero', hoy(2024, 2, 29), '2024-01-01', '2024-01-31', 31],
  ])('fin de mes: %s', (_nombre, fecha, desde, hasta, dias) => {
    const { rango } = resolverRango({ periodo: 'MES_ANTERIOR' }, fecha);

    expect(rango).toMatchObject({ desde, hasta, dias });
  });

  test('MES_ACTUAL en febrero bisiesto y en diciembre', () => {
    expect(resolverRango({ periodo: 'MES_ACTUAL' }, hoy(2024, 2, 10)).rango).toMatchObject({ desde: '2024-02-01', hasta: '2024-02-29', dias: 29 });
    expect(resolverRango({ periodo: 'MES_ACTUAL' }, hoy(2026, 12, 31)).rango).toMatchObject({
      desde: '2026-12-01',
      hasta: '2026-12-31',
      hastaExclusivoSql: '2027-01-01 00:00:00',
    });
  });

  test.each(['SEMANA', 'mes_actual', 'MES_SIGUIENTE', '', 'MES_ACTUAL,MES_ANTERIOR'])('el periodo «%s» es inválido', (periodo) => {
    const { errores, rango } = resolverRango({ periodo }, HOY);

    expect(rango).toBeNull();
    expect(errores.join(' ')).toMatch(/periodo/i);
  });

  test('periodo junto con desde o hasta es ambiguo y se rechaza', () => {
    for (const consulta of [
      { periodo: 'MES_ACTUAL', desde: '2026-11-01', hasta: '2026-11-30' },
      { periodo: 'MES_ACTUAL', desde: '2026-11-01' },
      { periodo: 'MES_ANTERIOR', hasta: '2026-10-31' },
    ]) {
      const { errores, rango } = resolverRango(consulta, HOY);

      expect(rango).toBeNull();
      expect(errores.join(' ')).toMatch(/periodo.*desde|desde.*periodo/i);
    }
  });
});

describe('rangos inválidos', () => {
  test('sin ningún dato de rango se pide indicarlo', () => {
    for (const consulta of [{}, undefined, null]) {
      const { errores, rango } = resolverRango(consulta, HOY);

      expect(rango).toBeNull();
      expect(errores.join(' ')).toMatch(/rango/i);
    }
  });

  test('solo desde o solo hasta es incompleto', () => {
    expect(resolverRango({ desde: '2026-11-01' }, HOY).rango).toBeNull();
    expect(resolverRango({ hasta: '2026-11-30' }, HOY).rango).toBeNull();
    expect(resolverRango({ desde: '2026-11-01' }, HOY).errores.join(' ')).toMatch(/hasta/i);
    expect(resolverRango({ hasta: '2026-11-30' }, HOY).errores.join(' ')).toMatch(/desde/i);
  });

  test('la fecha final anterior a la inicial se rechaza con un mensaje claro', () => {
    const { errores, rango } = resolverRango({ desde: '2026-11-30', hasta: '2026-11-01' }, HOY);

    expect(rango).toBeNull();
    expect(errores.join(' ')).toMatch(/no puede ser anterior/i);
  });

  test.each([
    '2026-13-01',
    '2026-02-30',
    '2026-00-10',
    '2026-11-31',
    '2025-02-29',
    '26-11-01',
    '2026-1-1',
    '2026/11/01',
    '01-11-2026',
    '2026-11-01T00:00:00',
    '2026-11-01 ',
    'ayer',
    '',
    "2026-11-01'; DROP TABLE payments; --",
  ])('el formato de fecha «%s» es inválido', (valor) => {
    const { errores, rango } = resolverRango({ desde: valor, hasta: '2026-12-31' }, HOY);

    expect(rango).toBeNull();
    expect(errores.join(' ')).toMatch(/desde/i);
    expect(errores.join(' ')).toMatch(/AAAA-MM-DD/);
  });

  test('la fecha final con formato inválido también se señala', () => {
    const { errores } = resolverRango({ desde: '2026-11-01', hasta: '31-11-2026' }, HOY);

    expect(errores.join(' ')).toMatch(/hasta/i);
  });

  test.each([[20261101], [['2026-11-01']], [{ a: 1 }], [true]])('un valor que no es texto (%p) es inválido', (valor) => {
    const { errores, rango } = resolverRango({ desde: valor, hasta: '2026-12-31' }, HOY);

    expect(rango).toBeNull();
    expect(errores.length).toBeGreaterThan(0);
  });
});

describe('máximo de 366 días', () => {
  test('el límite es 366', () => {
    expect(MAXIMO_DIAS).toBe(366);
  });

  test('exactamente 366 días (inclusivos) se acepta, también cruzando un año bisiesto', () => {
    const normal = resolverRango({ desde: '2025-11-24', hasta: '2026-11-24' }, HOY);
    const bisiesto = resolverRango({ desde: '2024-01-01', hasta: '2024-12-31' }, HOY);

    expect(normal.errores).toEqual([]);
    expect(normal.rango.dias).toBe(366);
    expect(bisiesto.errores).toEqual([]);
    expect(bisiesto.rango.dias).toBe(366);
  });

  test('367 días se rechazan', () => {
    const { errores, rango } = resolverRango({ desde: '2025-11-23', hasta: '2026-11-24' }, HOY);

    expect(rango).toBeNull();
    expect(errores.join(' ')).toMatch(/366/);
  });

  test('un año no bisiesto completo (365 días) se acepta y varios años se rechazan', () => {
    expect(resolverRango({ desde: '2026-01-01', hasta: '2026-12-31' }, HOY).rango.dias).toBe(365);
    expect(resolverRango({ desde: '2020-01-01', hasta: '2026-12-31' }, HOY).rango).toBeNull();
  });
});

describe('agrupación del reporte de ingresos', () => {
  test('hasta 62 días se agrupa por día y desde 63 por mes', () => {
    expect(agrupacionDe({ dias: 1 })).toBe('DIA');
    expect(agrupacionDe({ dias: 31 })).toBe('DIA');
    expect(agrupacionDe({ dias: 62 })).toBe('DIA');
    expect(agrupacionDe({ dias: 63 })).toBe('MES');
    expect(agrupacionDe({ dias: 366 })).toBe('MES');
  });

  test('coincide con la duración de dos meses completos y de un trimestre', () => {
    expect(agrupacionDe(resolverRango({ desde: '2026-10-01', hasta: '2026-11-30' }, HOY).rango)).toBe('DIA');
    expect(agrupacionDe(resolverRango({ desde: '2026-09-01', hasta: '2026-11-30' }, HOY).rango)).toBe('MES');
  });
});
