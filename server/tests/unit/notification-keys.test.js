// 007-notificaciones-internas, T008 (FR-006, CA-6): identidad de un aviso para
// la lectura por usuario. La clave es `TIPO:ID:ESTADO` y cambia cuando el estado
// del aviso cambia, de modo que un aviso que empeora vuelve como no leído.
// Funciones puras, sin base de datos.
import {
  LONGITUD_MAXIMA_CLAVE,
  construirClave,
  descomponerClave,
  esClaveValida,
} from '../../utils/notification-keys.js';

describe('construirClave', () => {
  test.each([
    [['MANTENIMIENTO', 12, 'VENCIDO'], 'MANTENIMIENTO:12:VENCIDO'],
    [['MANTENIMIENTO', 12, 'PROXIMO'], 'MANTENIMIENTO:12:PROXIMO'],
    [['CITA', 7, 'HOY'], 'CITA:7:HOY'],
    [['STOCK', 7, 'BAJO'], 'STOCK:7:BAJO'],
    [['STOCK', 7, 'AGOTADO'], 'STOCK:7:AGOTADO'],
    [['ORDEN', 5, 'DETENIDA'], 'ORDEN:5:DETENIDA'],
  ])('arma la clave de %j', ([tipo, id, estado], esperada) => {
    expect(construirClave(tipo, id, estado)).toBe(esperada);
  });

  test('acepta el identificador como texto numérico', () => {
    expect(construirClave('ORDEN', '5', 'DETENIDA')).toBe('ORDEN:5:DETENIDA');
  });

  test('un cambio de estado cambia la clave (el aviso que empeora vuelve como no leído)', () => {
    expect(construirClave('STOCK', 7, 'BAJO')).not.toBe(construirClave('STOCK', 7, 'AGOTADO'));
    expect(construirClave('MANTENIMIENTO', 3, 'PROXIMO')).not.toBe(
      construirClave('MANTENIMIENTO', 3, 'VENCIDO')
    );
  });

  test.each([
    ['tipo desconocido', ['FACTURA', 1, 'HOY']],
    ['estado que no corresponde al tipo', ['CITA', 7, 'VENCIDO']],
    ['estado desconocido', ['STOCK', 7, 'CRITICO']],
    ['identificador cero', ['ORDEN', 0, 'DETENIDA']],
    ['identificador negativo', ['ORDEN', -3, 'DETENIDA']],
    ['identificador decimal', ['ORDEN', 1.5, 'DETENIDA']],
    ['identificador no numérico', ['ORDEN', 'abc', 'DETENIDA']],
    ['identificador ausente', ['ORDEN', undefined, 'DETENIDA']],
  ])('rechaza %s', (_descripcion, argumentos) => {
    expect(() => construirClave(...argumentos)).toThrow();
  });
});

describe('esClaveValida y descomponerClave', () => {
  test.each([
    'MANTENIMIENTO:12:VENCIDO',
    'MANTENIMIENTO:12:PROXIMO',
    'CITA:7:HOY',
    'STOCK:7:BAJO',
    'STOCK:7:AGOTADO',
    'ORDEN:5:DETENIDA',
  ])('acepta la clave %s y la descompone', (clave) => {
    expect(esClaveValida(clave)).toBe(true);
    const partes = descomponerClave(clave);
    expect(partes).not.toBeNull();
    // Armar de nuevo con las partes devuelve la misma clave.
    expect(construirClave(partes.tipo, partes.id, partes.estado)).toBe(clave);
  });

  test('descompone en tipo, identificador numérico y estado', () => {
    expect(descomponerClave('MANTENIMIENTO:12:VENCIDO')).toEqual({
      tipo: 'MANTENIMIENTO',
      id: 12,
      estado: 'VENCIDO',
    });
  });

  test.each([
    ['vacía', ''],
    ['sin formato', 'x'],
    ['faltan segmentos', 'MANTENIMIENTO:12'],
    ['sobran segmentos', 'MANTENIMIENTO:12:VENCIDO:otro'],
    ['identificador no numérico', 'MANTENIMIENTO:abc:VENCIDO'],
    ['identificador con ceros a la izquierda', 'ORDEN:05:DETENIDA'],
    ['identificador cero', 'ORDEN:0:DETENIDA'],
    ['minúsculas', 'orden:5:detenida'],
    ['estado que no corresponde al tipo', 'CITA:7:VENCIDO'],
    ['tipo desconocido', 'FACTURA:1:HOY'],
    ['espacios', ' ORDEN:5:DETENIDA '],
  ])('rechaza una clave %s', (_descripcion, clave) => {
    expect(esClaveValida(clave)).toBe(false);
    expect(descomponerClave(clave)).toBeNull();
  });

  test.each([undefined, null, 12, {}, []])('rechaza un valor que no es texto (%j)', (valor) => {
    expect(esClaveValida(valor)).toBe(false);
    expect(descomponerClave(valor)).toBeNull();
  });

  test('rechaza una clave de más de 80 caracteres', () => {
    expect(LONGITUD_MAXIMA_CLAVE).toBe(80);
    const largo = `ORDEN:${'1'.repeat(80)}:DETENIDA`;
    expect(largo.length).toBeGreaterThan(80);
    expect(esClaveValida(largo)).toBe(false);
    expect(descomponerClave(largo)).toBeNull();
  });

  test('toda clave válida cabe en la columna notification_key (80 caracteres)', () => {
    const maxima = construirClave('MANTENIMIENTO', 2147483647, 'VENCIDO');
    expect(maxima.length).toBeLessThanOrEqual(LONGITUD_MAXIMA_CLAVE);
  });
});
