/// Modelo de vehículo con su propietario (T059, US5/US6).
class Vehiculo {
  final int? id;
  final int clientId;
  final String plates;
  final String brand;
  final String model;
  final int year;
  final String? color;
  final String? notes;
  final Duenio? duenio;

  const Vehiculo({
    this.id,
    required this.clientId,
    required this.plates,
    required this.brand,
    required this.model,
    required this.year,
    this.color,
    this.notes,
    this.duenio,
  });

  factory Vehiculo.desdeJson(Map<String, dynamic> json) => Vehiculo(
        id: json['id'] as int?,
        clientId: json['clientId'] as int? ?? 0,
        plates: json['plates'] as String? ?? '',
        brand: json['brand'] as String? ?? '',
        model: json['model'] as String? ?? '',
        year: json['year'] as int? ?? 0,
        color: json['color'] as String?,
        notes: json['notes'] as String?,
        duenio: json['duenio'] is Map<String, dynamic>
            ? Duenio.desdeJson(json['duenio'] as Map<String, dynamic>)
            : null,
      );

  Map<String, dynamic> aJson() => {
        'clientId': clientId,
        'plates': plates,
        'brand': brand,
        'model': model,
        'year': year,
        if (color != null && color!.isNotEmpty) 'color': color,
        if (notes != null && notes!.isNotEmpty) 'notes': notes,
      };
}

/// Propietario del vehículo (cliente).
class Duenio {
  final int? id;
  final String fullName;
  final String phone;
  final bool active;

  const Duenio({
    this.id,
    required this.fullName,
    required this.phone,
    this.active = true,
  });

  factory Duenio.desdeJson(Map<String, dynamic> json) => Duenio(
        id: json['id'] as int?,
        fullName: json['fullName'] as String? ?? '',
        phone: json['phone'] as String? ?? '',
        active: json['active'] as bool? ?? true,
      );
}
