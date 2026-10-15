/// Modelo de mantenimiento (Sprint 3, US3/US4, RN-11/RN-12).
///
/// Los umbrales son opcionales individualmente pero al menos uno debe existir
/// (aclaración Q2: un vehículo admite varios mantenimientos pendientes).
/// `isOverdue`, `daysLeft` y `kmLeft` los calcula el servidor (FR-006).
library;

/// Estados posibles de un mantenimiento.
const String kEstadoPendiente = 'PENDING';
const String kEstadoCompletado = 'COMPLETED';
const String kEstadoCancelado = 'CANCELLED';

class Mantenimiento {
  final int? id;
  final int vehicleId;
  final String description;
  final String? targetDate;
  final int? targetMileage;
  final String status;
  final String? completedAt;
  final String? cancelledAt;
  final String? cancellationReason;
  final String? createdAt;
  final VehiculoMantenimiento? vehiculo;
  final ClienteMantenimiento? cliente;
  final int kilometrajeActual;
  final bool isOverdue;
  final int? daysLeft;
  final int? kmLeft;

  const Mantenimiento({
    this.id,
    required this.vehicleId,
    required this.description,
    this.targetDate,
    this.targetMileage,
    this.status = kEstadoPendiente,
    this.completedAt,
    this.cancelledAt,
    this.cancellationReason,
    this.createdAt,
    this.vehiculo,
    this.cliente,
    this.kilometrajeActual = 0,
    this.isOverdue = false,
    this.daysLeft,
    this.kmLeft,
  });

  bool get pendiente => status == kEstadoPendiente;
  bool get completado => status == kEstadoCompletado;
  bool get cancelado => status == kEstadoCancelado;

  factory Mantenimiento.desdeJson(Map<String, dynamic> json) => Mantenimiento(
        id: json['id'] as int?,
        vehicleId: json['vehicleId'] as int? ?? 0,
        description: json['description'] as String? ?? '',
        targetDate: json['targetDate'] as String?,
        targetMileage: json['targetMileage'] as int?,
        status: json['status'] as String? ?? kEstadoPendiente,
        completedAt: json['completedAt'] as String?,
        cancelledAt: json['cancelledAt'] as String?,
        cancellationReason: json['cancellationReason'] as String?,
        createdAt: json['createdAt'] as String?,
        vehiculo: json['vehiculo'] is Map<String, dynamic>
            ? VehiculoMantenimiento.desdeJson(
                json['vehiculo'] as Map<String, dynamic>)
            : null,
        cliente: json['cliente'] is Map<String, dynamic>
            ? ClienteMantenimiento.desdeJson(
                json['cliente'] as Map<String, dynamic>)
            : null,
        kilometrajeActual: json['kilometrajeActual'] as int? ?? 0,
        isOverdue: json['isOverdue'] as bool? ?? false,
        daysLeft: json['daysLeft'] as int?,
        kmLeft: json['kmLeft'] as int?,
      );

  Map<String, dynamic> aJson() => {
        'vehicleId': vehicleId,
        'descripcion': description,
        if (targetDate != null && targetDate!.isNotEmpty)
          'targetDate': targetDate,
        if (targetMileage != null) 'targetMileage': targetMileage,
      };
}

/// Datos del vehículo mostrados en la lista de próximos (US4).
class VehiculoMantenimiento {
  final int id;
  final String placas;
  final String marca;
  final String modelo;

  const VehiculoMantenimiento({
    required this.id,
    required this.placas,
    required this.marca,
    required this.modelo,
  });

  factory VehiculoMantenimiento.desdeJson(Map<String, dynamic> json) =>
      VehiculoMantenimiento(
        id: json['id'] as int? ?? 0,
        placas: json['placas'] as String? ?? '',
        marca: json['marca'] as String? ?? '',
        modelo: json['modelo'] as String? ?? '',
      );
}

/// Datos del cliente para el aviso al taller (US4, FR-007).
class ClienteMantenimiento {
  final int id;
  final String nombreCompleto;
  final String telefono;

  const ClienteMantenimiento({
    required this.id,
    required this.nombreCompleto,
    required this.telefono,
  });

  factory ClienteMantenimiento.desdeJson(Map<String, dynamic> json) =>
      ClienteMantenimiento(
        id: json['id'] as int? ?? 0,
        nombreCompleto: json['nombreCompleto'] as String? ?? '',
        telefono: json['telefono'] as String? ?? '',
      );
}
