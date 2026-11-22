/// Modelo de refacción del inventario (Sprint 3, US5/US6/US8; FR-008).
///
/// El stock solo cambia con movimientos atómicos (FR-013); `lowStock`
/// (FR-015) lo calcula el servidor como `stock <= minStock`.
library;

/// Catálogo fijo de categorías de refacción (006, FR-002): identificador del
/// servidor → etiqueta en español. Lista del sistema, no administrable.
const Map<String, String> kCategoriasRefaccion = {
  'FRENOS': 'Frenos',
  'MOTOR': 'Motor',
  'SUSPENSION': 'Suspensión',
  'ELECTRICO': 'Eléctrico',
  'TRANSMISION': 'Transmisión',
  'CLIMA': 'Clima',
  'NEUMATICOS': 'Neumáticos',
  'LUBRICANTES': 'Lubricantes',
  'OTRO': 'Otro',
};

class Part {
  final int? id;
  final String name;
  final String code;
  final int stock;
  final int minStock;

  /// Precio de venta (005, FR-001); null = pendiente de precio (D1).
  final double? salePrice;

  /// Identificador de categoría del catálogo fijo; null = sin clasificar (006).
  final String? category;

  /// Marca en texto libre (máx. 50 caracteres); null = sin marca (006).
  final String? brand;

  /// Precio de compra (006, FR-001): el servidor solo lo envía al ADMIN; null =
  /// pendiente de captura o sin permiso para verlo.
  final double? purchasePrice;
  final bool isActive;
  final bool lowStock;

  const Part({
    this.id,
    required this.name,
    required this.code,
    this.stock = 0,
    this.minStock = 0,
    this.salePrice,
    this.category,
    this.brand,
    this.purchasePrice,
    this.isActive = true,
    this.lowStock = false,
  });

  factory Part.desdeJson(Map<String, dynamic> json) {
    final stock = json['stock'] as int? ?? 0;
    final minStock = json['minStock'] as int? ?? 0;
    return Part(
      id: json['id'] as int?,
      name: json['name'] as String? ?? '',
      code: json['code'] as String? ?? '',
      stock: stock,
      minStock: minStock,
      salePrice: (json['salePrice'] as num?)?.toDouble(),
      category: json['category'] as String?,
      brand: json['brand'] as String?,
      purchasePrice: (json['purchasePrice'] as num?)?.toDouble(),
      isActive: json['isActive'] as bool? ?? true,
      // Respaldo del cálculo del servidor por si la API no lo envía.
      lowStock: json['lowStock'] as bool? ?? (stock <= minStock),
    );
  }

  /// Etiqueta en español de la categoría; vacía si no tiene.
  String get nombreCategoria =>
      category == null ? '' : (kCategoriasRefaccion[category] ?? category!);

  Map<String, dynamic> aJson() => {
        'name': name,
        'code': code,
        if (minStock > 0) 'minStock': minStock,
        // Siempre se envía: null deja la refacción pendiente de precio.
        'salePrice': salePrice,
        'category': category,
        'brand': brand,
        if (purchasePrice != null) 'purchasePrice': purchasePrice,
      };
}

/// Movimiento del historial de una refacción (auditoría, FR-009).
class MovimientoInventario {
  final int id;
  final String movementType;
  final int quantity;
  final int? orderId;
  final String reason;
  final String createdAt;
  final String? createdBy;

  const MovimientoInventario({
    required this.id,
    required this.movementType,
    required this.quantity,
    this.orderId,
    required this.reason,
    required this.createdAt,
    this.createdBy,
  });

  factory MovimientoInventario.desdeJson(Map<String, dynamic> json) =>
      MovimientoInventario(
        id: json['id'] as int? ?? 0,
        movementType: json['movementType'] as String? ?? '',
        quantity: json['quantity'] as int? ?? 0,
        orderId: json['orderId'] as int?,
        reason: json['reason'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
        createdBy: json['createdBy'] as String?,
      );
}
