/// Modelo de cita del taller (T040, US1; Sprint 2).
library;

class Cita {
  final int? id;
  final int clientId;
  final int vehicleId;
  final String appointmentDate;
  final String appointmentTime;
  final String reason;
  final String status;
  final String? cancellationReason;

  // Relaciones enriquecidas del listado y el detalle.
  final String? clientName;
  final String? plates;
  final String? vehicleDescription;

  const Cita({
    this.id,
    required this.clientId,
    required this.vehicleId,
    required this.appointmentDate,
    required this.appointmentTime,
    required this.reason,
    this.status = 'PROGRAMADA',
    this.cancellationReason,
    this.clientName,
    this.plates,
    this.vehicleDescription,
  });

  factory Cita.desdeJson(Map<String, dynamic> json) {
    final hora = json['appointmentTime'] as String? ?? '';
    return Cita(
        id: json['id'] as int?,
        clientId: json['clientId'] as int? ?? 0,
        vehicleId: json['vehicleId'] as int? ?? 0,
        appointmentDate: json['appointmentDate'] as String? ?? '',
        appointmentTime: hora.length >= 5 ? hora.substring(0, 5) : hora,
        reason: json['reason'] as String? ?? '',
        status: json['status'] as String? ?? 'PROGRAMADA',
        cancellationReason: json['cancellationReason'] as String?,
        clientName: json['clientName'] as String?,
        plates: json['plates'] as String?,
        vehicleDescription: json['vehicleDescription'] as String?,
      );
  }

  /// Nombre del estado en español para la interfaz.
  String get nombreEstado {
    switch (status) {
      case 'PROGRAMADA':
        return 'Programada';
      case 'COMPLETADA':
        return 'Completada';
      case 'CANCELADA':
        return 'Cancelada';
      default:
        return status;
    }
  }

  bool get esEditable => status == 'PROGRAMADA';
}
