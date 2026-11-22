/// Refacción usada en una orden de servicio (Sprint 3, US7; FR-011/FR-012).
///
/// Cada línea corresponde a una salida (OUT) atómica de inventario con la
/// orden; al retirarla se genera la devolución (IN) y la línea desaparece
/// (RN-8, research D5).
library;

class RefaccionOrden {
  final int id;
  final int partId;
  final String nombre;
  final String code;
  final int quantity;

  /// Precio congelado al momento de agregarla (005, FR-004); null = uso
  /// heredado sin precio (total incompleto, FR-008).
  final double? unitPrice;

  /// Importe de la línea (`unitPrice × quantity`); null sin precio.
  final double? amount;

  const RefaccionOrden({
    required this.id,
    required this.partId,
    required this.nombre,
    required this.code,
    required this.quantity,
    this.unitPrice,
    this.amount,
  });

  bool get sinPrecio => unitPrice == null;

  factory RefaccionOrden.desdeJson(Map<String, dynamic> json) => RefaccionOrden(
        id: json['id'] as int? ?? 0,
        partId: json['partId'] as int? ?? 0,
        nombre: json['nombre'] as String? ?? '',
        code: json['code'] as String? ?? '',
        quantity: json['quantity'] as int? ?? 0,
        unitPrice: (json['unitPrice'] as num?)?.toDouble(),
        amount: (json['amount'] as num?)?.toDouble(),
      );
}
