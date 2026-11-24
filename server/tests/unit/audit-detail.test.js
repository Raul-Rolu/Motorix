// 008-configuracion-seguridad-reportes, T065 (bloque P2, US5; FR-012, FR-013,
// CA-21): la función pura que arma el «detalle» de cada entrada de la bitácora.
// Solo lee campos de una lista permitida: nunca incluye contraseñas, hashes,
// tokens, datos de tarjeta ni el importe del precio de compra. Sin base de datos.
import {
  ACCIONES,
  ENTIDAD_DE,
  construirDetalle,
  LONGITUD_IDENTIFICADOR,
} from '../../utils/audit-detail.js';

describe('catálogo de acciones', () => {
  test('las acciones son las del contrato', () => {
    expect(ACCIONES).toEqual([
      'LOGIN_FAILED',
      'USER_CREATED',
      'USER_DEACTIVATED',
      'USER_REACTIVATED',
      'USER_ROLE_CHANGED',
      'SETTINGS_UPDATED',
      'PART_SALE_PRICE_CHANGED',
      'PART_PURCHASE_PRICE_CHANGED',
      'TERMS_PUBLISHED',
    ]);
  });

  test('cada acción tiene su tipo de entidad', () => {
    expect(ENTIDAD_DE).toEqual({
      LOGIN_FAILED: 'SESSION',
      USER_CREATED: 'USER',
      USER_DEACTIVATED: 'USER',
      USER_REACTIVATED: 'USER',
      USER_ROLE_CHANGED: 'USER',
      SETTINGS_UPDATED: 'SETTINGS',
      PART_SALE_PRICE_CHANGED: 'PART',
      PART_PURCHASE_PRICE_CHANGED: 'PART',
      TERMS_PUBLISHED: 'TERMS',
    });
  });
});

describe('textos del contrato', () => {
  test('inicio de sesión fallido: solo el identificador tecleado', () => {
    expect(construirDetalle('LOGIN_FAILED', { identificador: 'recepcion' })).toBe('Identificador: recepcion');
  });

  test('alta de usuario: el rol', () => {
    expect(construirDetalle('USER_CREATED', { rol: 'RECEPTIONIST' })).toBe('Rol: RECEPTIONIST');
  });

  test('baja y reactivación no llevan detalle', () => {
    expect(construirDetalle('USER_DEACTIVATED', {})).toBeNull();
    expect(construirDetalle('USER_REACTIVATED', {})).toBeNull();
  });

  test('cambio de rol: anterior → nuevo', () => {
    expect(construirDetalle('USER_ROLE_CHANGED', { rolAnterior: 'MECHANIC', rolNuevo: 'RECEPTIONIST' })).toBe(
      'Rol: MECHANIC → RECEPTIONIST'
    );
  });

  test('ajustes: la lista de claves modificadas', () => {
    expect(construirDetalle('SETTINGS_UPDATED', { claves: ['shop.name', 'shop.phone'] })).toBe(
      'Claves: shop.name, shop.phone'
    );
  });

  test('precio de venta: anterior → nuevo con dos decimales y «sin precio» cuando no hay', () => {
    expect(construirDetalle('PART_SALE_PRICE_CHANGED', { anterior: 100, nuevo: 120.5 })).toBe(
      'Precio de venta: 100.00 → 120.50'
    );
    expect(construirDetalle('PART_SALE_PRICE_CHANGED', { anterior: null, nuevo: 99 })).toBe(
      'Precio de venta: sin precio → 99.00'
    );
    expect(construirDetalle('PART_SALE_PRICE_CHANGED', { anterior: 99, nuevo: null })).toBe(
      'Precio de venta: 99.00 → sin precio'
    );
  });

  test('publicación de términos: el número de versión', () => {
    expect(construirDetalle('TERMS_PUBLISHED', { version: 2 })).toBe('Versión 2');
  });
});

describe('lo que NUNCA entra en el detalle (CA-21)', () => {
  test('el precio de compra solo registra que se modificó, sin importes', () => {
    const detalle = construirDetalle('PART_PURCHASE_PRICE_CHANGED', {
      anterior: 310.55,
      nuevo: 412.75,
      purchasePrice: 412.75,
    });

    expect(detalle).toBe('Precio de compra modificado');
    expect(detalle).not.toMatch(/310|412/);
  });

  test('los campos secretos que lleguen por error se ignoran en cualquier acción', () => {
    const secretos = {
      contrasena: 'ClaveSecreta999',
      password: 'ClaveSecreta999',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.firma',
      numeroTarjeta: '4111111111111111',
      purchasePrice: 999.99,
    };

    for (const accion of ACCIONES) {
      const detalle = construirDetalle(accion, { ...secretos, identificador: 'ana', rol: 'ADMIN', version: 1, claves: ['shop.name'], anterior: 1, nuevo: 2 });
      const texto = String(detalle ?? '');
      expect(texto).not.toContain('ClaveSecreta999');
      expect(texto).not.toContain('$2b$');
      expect(texto).not.toContain('eyJ');
      expect(texto).not.toContain('4111');
      expect(texto).not.toContain('999.99');
    }
  });

  test('un identificador que parece un hash o un token se omite', () => {
    expect(construirDetalle('LOGIN_FAILED', { identificador: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789' })).toBe(
      'Identificador: [omitido]'
    );
    expect(
      construirDetalle('LOGIN_FAILED', {
        identificador: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsInVzZXIiOiJhIn0.c2lnbmF0dXJhZGVwcnVlYmExMjM0NTY',
      })
    ).toBe('Identificador: [omitido]');
  });
});

describe('longitudes', () => {
  test('el identificador se trunca a 100 caracteres', () => {
    const detalle = construirDetalle('LOGIN_FAILED', { identificador: 'a'.repeat(150) });

    expect(LONGITUD_IDENTIFICADOR).toBe(100);
    expect(detalle).toBe(`Identificador: ${'a'.repeat(100)}`);
  });

  test('un identificador vacío o ausente se registra como «(vacío)»', () => {
    expect(construirDetalle('LOGIN_FAILED', { identificador: '   ' })).toBe('Identificador: (vacío)');
    expect(construirDetalle('LOGIN_FAILED', {})).toBe('Identificador: (vacío)');
    expect(construirDetalle('LOGIN_FAILED', { identificador: 12345 })).toBe('Identificador: (vacío)');
  });

  test('ningún detalle excede 255 caracteres (límite de la columna)', () => {
    const claves = Array.from({ length: 60 }, (_, i) => `clave.muy.larga.numero.${i}`);

    expect(construirDetalle('SETTINGS_UPDATED', { claves }).length).toBeLessThanOrEqual(255);
  });
});

test('una acción desconocida no tiene detalle', () => {
  expect(construirDetalle('OTRA_ACCION', { identificador: 'x' })).toBeNull();
});
