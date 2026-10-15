/// Modelo de cliente del taller (T046, US3).
class Cliente {
  final int? id;
  final String fullName;
  final String phone;
  final String? email;
  final String? notes;
  final bool active;
  final List<VehiculoResumen> vehiculos;

  const Cliente({
    this.id,
    required this.fullName,
    required this.phone,
    this.email,
    this.notes,
    this.active = true,
    this.vehiculos = const [],
  });

  factory Cliente.desdeJson(Map<String, dynamic> json) => Cliente(
        id: json['id'] as int?,
        fullName: json['fullName'] as String? ?? '',
        phone: json['phone'] as String? ?? '',
        email: json['email'] as String?,
        notes: json['notes'] as String?,
        active: json['active'] as bool? ?? true,
        vehiculos: (json['vehiculos'] as List<dynamic>? ?? [])
            .map((v) => VehiculoResumen.desdeJson(v as Map<String, dynamic>))
            .toList(),
      );
}

/// Resumen de vehículo tal como aparece en la ficha del cliente (FR-007).
class VehiculoResumen {
  final int? id;
  final String plates;
  final String brand;
  final String model;
  final int year;

  const VehiculoResumen({
    this.id,
    required this.plates,
    required this.brand,
    required this.model,
    required this.year,
  });

  factory VehiculoResumen.desdeJson(Map<String, dynamic> json) => VehiculoResumen(
        id: json['id'] as int?,
        plates: json['plates'] as String? ?? '',
        brand: json['brand'] as String? ?? '',
        model: json['model'] as String? ?? '',
        year: json['year'] as int? ?? 0,
      );
}
