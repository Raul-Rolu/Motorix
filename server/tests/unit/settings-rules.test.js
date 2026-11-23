// 008-configuracion-seguridad-reportes, T010 (bloque P1; FR-002, FR-004, FR-005,
// CA-2, CA-3): valores de respaldo, límites y validación de los ajustes.
// Funciones puras, sin base de datos.
import {
  CLAVES,
  VALORES_RESPALDO,
  LIMITES,
  resolverValor,
} from '../../utils/settings-defaults.js';
import { validarAjustes } from '../../validators/settings-validator.js';

describe('valores de respaldo', () => {
  test('repiten exactamente los valores de las constantes anteriores', () => {
    expect(VALORES_RESPALDO[CLAVES.NOMBRE]).toBe('Motorix');
    expect(VALORES_RESPALDO[CLAVES.DIRECCION]).toBe('Av. Taller 123, Col. Centro');
    expect(VALORES_RESPALDO[CLAVES.TELEFONO]).toBe('555-000-0000');
    expect(VALORES_RESPALDO[CLAVES.MARGEN_DIAS]).toBe(30);
    expect(VALORES_RESPALDO[CLAVES.MARGEN_KM]).toBe(1000);
    expect(VALORES_RESPALDO[CLAVES.DIAS_ORDEN_DETENIDA]).toBe(3);
    expect(VALORES_RESPALDO[CLAVES.MINUTOS_INACTIVIDAD]).toBe(30);
  });

  test('las claves tienen el nombre acordado', () => {
    expect(CLAVES).toEqual({
      NOMBRE: 'shop.name',
      DIRECCION: 'shop.address',
      TELEFONO: 'shop.phone',
      MARGEN_DIAS: 'maintenance.margin_days',
      MARGEN_KM: 'maintenance.margin_km',
      DIAS_ORDEN_DETENIDA: 'orders.stalled_days',
      MINUTOS_INACTIVIDAD: 'session.inactivity_minutes',
    });
  });

  test('los límites son los de data-model.md', () => {
    expect(LIMITES[CLAVES.MARGEN_DIAS]).toEqual([1, 365]);
    expect(LIMITES[CLAVES.MARGEN_KM]).toEqual([100, 50000]);
    expect(LIMITES[CLAVES.DIAS_ORDEN_DETENIDA]).toEqual([1, 90]);
    expect(LIMITES[CLAVES.MINUTOS_INACTIVIDAD]).toEqual([5, 120]);
  });
});

describe('resolverValor (valor guardado o respaldo)', () => {
  test('sin valor guardado devuelve el respaldo', () => {
    expect(resolverValor(CLAVES.MARGEN_DIAS, undefined)).toBe(30);
    expect(resolverValor(CLAVES.NOMBRE, undefined)).toBe('Motorix');
  });

  test('un entero guardado válido se convierte a número', () => {
    expect(resolverValor(CLAVES.MARGEN_DIAS, '15')).toBe(15);
    expect(resolverValor(CLAVES.MARGEN_KM, '500')).toBe(500);
  });

  test('un valor guardado inválido o fuera de rango cae al respaldo', () => {
    expect(resolverValor(CLAVES.MARGEN_DIAS, 'abc')).toBe(30);
    expect(resolverValor(CLAVES.MARGEN_DIAS, '0')).toBe(30);
    expect(resolverValor(CLAVES.MARGEN_DIAS, '366')).toBe(30);
    expect(resolverValor(CLAVES.MARGEN_KM, '99')).toBe(1000);
    expect(resolverValor(CLAVES.DIAS_ORDEN_DETENIDA, '2.5')).toBe(3);
    expect(resolverValor(CLAVES.MINUTOS_INACTIVIDAD, '4')).toBe(30);
  });

  test('un nombre vacío guardado cae al respaldo; una dirección vacía es válida', () => {
    expect(resolverValor(CLAVES.NOMBRE, '   ')).toBe('Motorix');
    expect(resolverValor(CLAVES.DIRECCION, '')).toBe('');
  });
});

describe('validarAjustes: datos del taller', () => {
  test('acepta un subconjunto válido y devuelve solo los cambios enviados', () => {
    const { errores, cambios } = validarAjustes({
      taller: { nombre: '  Taller El Pistón ', telefono: '555-123-4567' },
    });

    expect(errores).toEqual([]);
    expect(cambios).toEqual({
      [CLAVES.NOMBRE]: 'Taller El Pistón',
      [CLAVES.TELEFONO]: '555-123-4567',
    });
  });

  test('rechaza un nombre vacío o de más de 100 caracteres', () => {
    expect(validarAjustes({ taller: { nombre: '   ' } }).errores.length).toBeGreaterThan(0);
    expect(validarAjustes({ taller: { nombre: 'a'.repeat(101) } }).errores.length).toBeGreaterThan(0);
    expect(validarAjustes({ taller: { nombre: 'a'.repeat(100) } }).errores).toEqual([]);
  });

  test('rechaza una dirección de más de 150 caracteres y acepta una vacía', () => {
    expect(validarAjustes({ taller: { direccion: 'a'.repeat(151) } }).errores.length).toBeGreaterThan(0);
    expect(validarAjustes({ taller: { direccion: 'a'.repeat(150) } }).errores).toEqual([]);
    expect(validarAjustes({ taller: { direccion: '' } }).errores).toEqual([]);
  });

  test('rechaza un teléfono con letras o de más de 30 caracteres', () => {
    expect(validarAjustes({ taller: { telefono: '555-ABC-1234' } }).errores.length).toBeGreaterThan(0);
    expect(validarAjustes({ taller: { telefono: '5'.repeat(31) } }).errores.length).toBeGreaterThan(0);
    expect(validarAjustes({ taller: { telefono: '+52 (55) 1234-5678' } }).errores).toEqual([]);
  });

  test('rechaza valores que no son texto', () => {
    expect(validarAjustes({ taller: { nombre: 123 } }).errores.length).toBeGreaterThan(0);
    expect(validarAjustes({ taller: { direccion: null } }).errores.length).toBeGreaterThan(0);
  });
});

describe('validarAjustes: operación', () => {
  test('acepta los límites inclusivos', () => {
    const { errores, cambios } = validarAjustes({
      operacion: { margenProximoDias: 365, margenProximoKm: 100, diasOrdenDetenida: 90 },
    });

    expect(errores).toEqual([]);
    expect(cambios).toEqual({
      [CLAVES.MARGEN_DIAS]: 365,
      [CLAVES.MARGEN_KM]: 100,
      [CLAVES.DIAS_ORDEN_DETENIDA]: 90,
    });
  });

  test.each([
    ['margenProximoDias', 0],
    ['margenProximoDias', 366],
    ['margenProximoKm', 99],
    ['margenProximoKm', 50001],
    ['diasOrdenDetenida', 0],
    ['diasOrdenDetenida', 91],
  ])('rechaza %s = %s (fuera de límites)', (campo, valor) => {
    const { errores } = validarAjustes({ operacion: { [campo]: valor } });
    expect(errores.length).toBeGreaterThan(0);
  });

  test.each([['15'], [2.5], [null], [NaN], [true], ['abc']])(
    'rechaza un margen que no es un entero (%p)',
    (valor) => {
      const { errores } = validarAjustes({ operacion: { margenProximoDias: valor } });
      expect(errores.length).toBeGreaterThan(0);
    }
  );
});

describe('validarAjustes: forma del cuerpo', () => {
  test('un cuerpo vacío o sin grupos se rechaza', () => {
    expect(validarAjustes({}).errores.length).toBeGreaterThan(0);
    expect(validarAjustes(undefined).errores.length).toBeGreaterThan(0);
    expect(validarAjustes('texto').errores.length).toBeGreaterThan(0);
  });

  test('un grupo o campo desconocido se rechaza', () => {
    expect(validarAjustes({ otro: { x: 1 } }).errores.length).toBeGreaterThan(0);
    expect(validarAjustes({ taller: { color: 'rojo' } }).errores.length).toBeGreaterThan(0);
  });

  test('el grupo seguridad se rechaza mientras no esté habilitado (se entrega en P2)', () => {
    const { errores } = validarAjustes({ seguridad: { minutosInactividad: 30 } });
    expect(errores.length).toBeGreaterThan(0);
  });

  test('con el grupo seguridad habilitado valida de 5 a 120 minutos', () => {
    const opciones = { incluirSeguridad: true };
    expect(validarAjustes({ seguridad: { minutosInactividad: 5 } }, opciones).errores).toEqual([]);
    expect(validarAjustes({ seguridad: { minutosInactividad: 120 } }, opciones).errores).toEqual([]);
    expect(validarAjustes({ seguridad: { minutosInactividad: 4 } }, opciones).errores.length).toBeGreaterThan(0);
    expect(validarAjustes({ seguridad: { minutosInactividad: 121 } }, opciones).errores.length).toBeGreaterThan(0);
  });

  test('un solo error invalida todo el guardado (no hay cambios parciales)', () => {
    const { errores, cambios } = validarAjustes({
      taller: { nombre: 'Taller válido' },
      operacion: { margenProximoDias: 0 },
    });

    expect(errores.length).toBeGreaterThan(0);
    expect(cambios).toEqual({});
  });

  test('los mensajes están en español', () => {
    const { errores } = validarAjustes({ taller: { nombre: '' } });
    expect(errores.join(' ')).toMatch(/nombre/i);
  });
});
