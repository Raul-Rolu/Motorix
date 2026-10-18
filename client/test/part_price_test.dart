// 005-precio-venta-refacciones, T010 (US1): modelo Part.salePrice (FR-001).
//
// Sin red: pruebas puras del modelo. `salePrice` nulo = refacción pendiente
// de precio (research D1).
import 'package:flutter_test/flutter_test.dart';
import 'package:motorix_client/models/part.dart';

void main() {
  test('desdeJson interpreta salePrice cuando la refacción tiene precio', () {
    final parte = Part.desdeJson({
      'id': 1,
      'name': 'Filtro de aceite',
      'code': 'FLT-OIL-010',
      'stock': 11,
      'minStock': 4,
      'salePrice': 85.5,
      'isActive': true,
      'lowStock': false,
    });

    expect(parte.salePrice, 85.5);
  });

  test('desdeJson deja salePrice nulo cuando la refacción está pendiente de precio', () {
    final parte = Part.desdeJson({
      'id': 7,
      'name': 'Batería 12V 60Ah',
      'code': 'BAT-12V-60',
      'stock': 5,
      'minStock': 2,
      'salePrice': null,
      'isActive': true,
      'lowStock': false,
    });

    expect(parte.salePrice, isNull);
  });

  test('desdeJson tolera la ausencia de salePrice (respaldo nulo)', () {
    final parte = Part.desdeJson({
      'id': 2,
      'name': 'Pastillas de freno',
      'code': 'FRN-PAS-220',
      'stock': 2,
      'minStock': 5,
    });

    expect(parte.salePrice, isNull);
  });

  test('aJson envía salePrice al guardar (precio o null)', () {
    const conPrecio = Part(
      name: 'Filtro de aceite',
      code: 'FLT-OIL-010',
      salePrice: 85.5,
    );
    expect(conPrecio.aJson()['salePrice'], 85.5);

    const pendiente = Part(name: 'Batería 12V 60Ah', code: 'BAT-12V-60');
    expect(pendiente.aJson()['salePrice'], isNull);
  });
}
