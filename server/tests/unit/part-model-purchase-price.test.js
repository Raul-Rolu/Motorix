// 006-complemento-precios-compra, T026 (US3, CA-3): `aObjeto` falla cerrada
// con el precio de compra (research D4). Funciones puras, sin base de datos.
import { aObjeto } from '../../models/part.js';

const fila = {
  id: 1,
  name: 'Pastillas de freno',
  code: 'FRN-PAS-220',
  category: 'FRENOS',
  brand: 'Brembo',
  stock: 6,
  min_stock: 3,
  sale_price: '150.00',
  purchase_price: '95.50',
  is_active: 1,
  created_at: '2026-11-21T10:00:00',
};

test('aObjeto sin opción omite purchasePrice: la clave ni siquiera existe', () => {
  const parte = aObjeto(fila);

  expect(Object.prototype.hasOwnProperty.call(parte, 'purchasePrice')).toBe(false);
  expect(JSON.stringify(parte)).not.toContain('purchasePrice');
  // El resto de los datos sí se entrega, incluidas categoría y marca.
  expect(parte).toMatchObject({
    id: 1,
    category: 'FRENOS',
    brand: 'Brembo',
    salePrice: 150,
  });
});

test('aObjeto con incluirPrecioCompra: false también lo omite', () => {
  const parte = aObjeto(fila, { incluirPrecioCompra: false });
  expect(Object.prototype.hasOwnProperty.call(parte, 'purchasePrice')).toBe(false);
});

test('aObjeto solo incluye purchasePrice cuando se pide de forma explícita', () => {
  expect(aObjeto(fila, { incluirPrecioCompra: true }).purchasePrice).toBe(95.5);
  // Pendiente de captura: la clave existe y vale null.
  const pendiente = aObjeto({ ...fila, purchase_price: null }, { incluirPrecioCompra: true });
  expect(pendiente.purchasePrice).toBeNull();
});

test('un índice de Array.map no se interpreta como la opción (regresión de findAll)', () => {
  // `filas.map(aObjeto)` pasaría el índice como segundo argumento: debe seguir omitiendo.
  const partes = [fila, fila, fila].map(aObjeto);
  for (const parte of partes) {
    expect(Object.prototype.hasOwnProperty.call(parte, 'purchasePrice')).toBe(false);
  }
});
