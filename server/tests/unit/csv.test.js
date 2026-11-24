// 008-configuracion-seguridad-reportes, T108 (bloque P3, base común; FR-027, CA-9):
// la serialización a CSV de los reportes. UTF-8 con BOM (para que Excel respete
// acentos y eñes), filas separadas por `\r\n`, celdas con comas, comillas o saltos
// de línea entre comillas dobles (con las comillas internas duplicadas) y
// NEUTRALIZACIÓN de las celdas de texto que empiezan con `=`, `+`, `-`, `@`,
// tabulador o retorno de carro (inyección de fórmulas): se les antepone `'`.
// Los importes salen de centavos enteros con punto y dos decimales y nunca se
// neutralizan (un margen negativo es un número, no una fórmula). Funciones puras.
import { aCsv, escaparCelda, importeCsv, BOM } from '../../utils/csv.js';

describe('BOM y separadores', () => {
  test('el cuerpo empieza con el BOM de UTF-8', () => {
    const csv = aCsv(['A'], [['x']]);

    expect(BOM).toBe('﻿');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.indexOf('﻿', 1)).toBe(-1);
  });

  test('encabezados y filas van separados por coma y terminan en CRLF', () => {
    const csv = aCsv(['Nombre', 'Cantidad'], [['Aceite', 2], ['Filtro', 10]]);

    expect(csv).toBe('﻿Nombre,Cantidad\r\nAceite,2\r\nFiltro,10\r\n');
  });

  test('sin filas devuelve solo los encabezados', () => {
    expect(aCsv(['A', 'B'], [])).toBe('﻿A,B\r\n');
  });

  test('las celdas nulas o indefinidas salen vacías', () => {
    expect(aCsv(['A', 'B', 'C'], [[null, undefined, 'x']])).toBe('﻿A,B,C\r\n,,x\r\n');
  });
});

describe('comillas, comas y saltos de línea', () => {
  test('una celda con coma va entre comillas', () => {
    expect(escaparCelda('Filtro, de aceite')).toBe('"Filtro, de aceite"');
  });

  test('las comillas dobles internas se duplican y la celda va entre comillas', () => {
    expect(escaparCelda('Llanta 15" "Pro"')).toBe('"Llanta 15"" ""Pro"""');
  });

  test('un salto de línea (LF, CR o CRLF) dentro de la celda se conserva entre comillas', () => {
    expect(escaparCelda('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"');
    expect(escaparCelda('a\r\nb')).toBe('"a\r\nb"');
    expect(escaparCelda('a\rb')).toBe('"a\rb"');
  });

  test('una celda sin caracteres especiales no lleva comillas', () => {
    expect(escaparCelda('Cambio de aceite')).toBe('Cambio de aceite');
  });

  test('una fila con celdas especiales se serializa completa', () => {
    const csv = aCsv(['Descripción', 'Nota'], [['Frenos, delanteros', 'dijo "ya"\nluego']]);

    expect(csv).toBe('﻿Descripción,Nota\r\n"Frenos, delanteros","dijo ""ya""\nluego"\r\n');
  });
});

describe('acentos y eñes', () => {
  test('se conservan tal cual (el BOM y UTF-8 se encargan de Excel)', () => {
    const csv = aCsv(['Refacción', 'Año'], [['Pastilla niño ñandú', 'Mecánico Peña']]);

    expect(csv).toBe('﻿Refacción,Año\r\nPastilla niño ñandú,Mecánico Peña\r\n');
    expect(Buffer.from(csv, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });
});

describe('importes en centavos', () => {
  test.each([
    [123450, '1234.50'],
    [5, '0.05'],
    [0, '0.00'],
    [100, '1.00'],
    [99999999, '999999.99'],
    [9999999999, '99999999.99'],
    [-1250, '-12.50'],
    [-5, '-0.05'],
  ])('%i centavos → %s', (centavos, esperado) => {
    expect(aCsv(['Importe'], [[importeCsv(centavos)]])).toBe(`﻿Importe\r\n${esperado}\r\n`);
  });

  test('un importe negativo NO se neutraliza (es un número, no una fórmula)', () => {
    expect(escaparCelda(importeCsv(-1250))).toBe('-12.50');
  });

  test('un importe nulo (por ejemplo «sin costo») sale vacío', () => {
    expect(aCsv(['Costo'], [[importeCsv(null)]])).toBe('﻿Costo\r\n\r\n');
    expect(aCsv(['Costo'], [[importeCsv(undefined)]])).toBe('﻿Costo\r\n\r\n');
  });

  test('los números simples (cantidades) salen sin formato especial y los negativos tampoco se neutralizan', () => {
    expect(escaparCelda(12)).toBe('12');
    expect(escaparCelda(0)).toBe('0');
    expect(escaparCelda(2.5)).toBe('2.5');
    expect(escaparCelda(-3)).toBe('-3');
  });

  test('un importe no entero o no numérico se rechaza (los reportes trabajan en centavos enteros)', () => {
    expect(() => importeCsv(12.5)).toThrow();
    expect(() => importeCsv('abc')).toThrow();
    expect(() => importeCsv(NaN)).toThrow();
  });
});

describe('neutralización de fórmulas', () => {
  test.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+cmd|calc', "'+cmd|calc"],
    ['-2+3', "'-2+3"],
    ['@SUM(1)', "'@SUM(1)"],
    ['\t=1+1', "'\t=1+1"],
    ['\r=1+1', '"\'\r=1+1"'],
    ['=HYPERLINK("http://x","clic")', '"\'=HYPERLINK(""http://x"",""clic"")"'],
    ['=1,2', '"\'=1,2"'],
  ])('«%s» se neutraliza anteponiendo una comilla simple', (entrada, esperado) => {
    expect(escaparCelda(entrada)).toBe(esperado);
  });

  test.each(['=', '+', '-', '@'])('el carácter solo «%s» también se neutraliza', (caracter) => {
    expect(escaparCelda(caracter)).toBe(`'${caracter}`);
  });

  test('solo cuenta el PRIMER carácter: un signo en medio no se toca', () => {
    expect(escaparCelda('a=b')).toBe('a=b');
    expect(escaparCelda('Cambio +1')).toBe('Cambio +1');
    expect(escaparCelda('Kit - delantero')).toBe('Kit - delantero');
    expect(escaparCelda('correo@motorix.local')).toBe('correo@motorix.local');
  });

  test('la neutralización aplica también a los encabezados', () => {
    expect(aCsv(['=cmd'], [])).toBe("﻿'=cmd\r\n");
  });

  test('una fila de reporte con una descripción maliciosa sale neutralizada y el resto intacto', () => {
    const csv = aCsv(['Descripción', 'Importe'], [['=HYPERLINK("x")', importeCsv(150000)]]);

    expect(csv).toBe('﻿Descripción,Importe\r\n"\'=HYPERLINK(""x"")",1500.00\r\n');
  });

  test('no se neutraliza dos veces ni se altera un texto que ya empieza con una comilla simple', () => {
    expect(escaparCelda("'=ya")).toBe("'=ya");
  });
});
