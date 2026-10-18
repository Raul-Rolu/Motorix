/// Modelo de orden de servicio (T028, US4; Sprint 2; ampliado en el Sprint 3
/// con las refacciones usadas de la US7).
///
/// Cubre el listado (con cliente, placas y mecánico enriquecidos) y el
/// detalle completo (cliente, vehículo, mecánico, entradas, partidas,
/// refacciones y totales informativos; FR-015).
library;

import 'order_part.dart';

class OrdenServicio {
  final int? id;
  final int clientId;
  final int vehicleId;
  final int? mechanicId;
  final String status;
  final String? previousState;
  final int mileageEntry;
  final bool mileageCorrection;
  final String reason;
  final String? notes;
  final String? cancellationReason;
  final String? createdAt;

  // Listado enriquecido (GET /api/orders).
  final String? clientName;
  final String? plates;
  final String? mechanicName;

  // Detalle (GET /api/orders/:id).
  final ClienteRef? client;
  final VehiculoRef? vehicle;
  final MecanicoRef? mechanic;
  final List<EntradaOrden> entries;
  final List<PartidaOrden> services;
  final List<PartidaOrden> labor;
  final List<RefaccionOrden> refacciones;
  final TotalesOrden? totals;

  const OrdenServicio({
    this.id,
    required this.clientId,
    required this.vehicleId,
    this.mechanicId,
    required this.status,
    this.previousState,
    required this.mileageEntry,
    this.mileageCorrection = false,
    required this.reason,
    this.notes,
    this.cancellationReason,
    this.createdAt,
    this.clientName,
    this.plates,
    this.mechanicName,
    this.client,
    this.vehicle,
    this.mechanic,
    this.entries = const [],
    this.services = const [],
    this.labor = const [],
    this.refacciones = const [],
    this.totals,
  });

  factory OrdenServicio.desdeJson(Map<String, dynamic> json) => OrdenServicio(
        id: json['id'] as int?,
        clientId: json['clientId'] as int? ?? 0,
        vehicleId: json['vehicleId'] as int? ?? 0,
        mechanicId: json['mechanicId'] as int?,
        status: json['status'] as String? ?? 'RECIBIDO',
        previousState: json['previousState'] as String?,
        mileageEntry: json['mileageEntry'] as int? ?? 0,
        mileageCorrection: json['mileageCorrection'] as bool? ?? false,
        reason: json['reason'] as String? ?? '',
        notes: json['notes'] as String?,
        cancellationReason: json['cancellationReason'] as String?,
        createdAt: json['createdAt']?.toString(),
        clientName: json['clientName'] as String?,
        plates: json['plates'] as String?,
        mechanicName: json['mechanicName'] as String?,
        client: json['client'] is Map<String, dynamic>
            ? ClienteRef.desdeJson(json['client'] as Map<String, dynamic>)
            : null,
        vehicle: json['vehicle'] is Map<String, dynamic>
            ? VehiculoRef.desdeJson(json['vehicle'] as Map<String, dynamic>)
            : null,
        mechanic: json['mechanic'] is Map<String, dynamic>
            ? MecanicoRef.desdeJson(json['mechanic'] as Map<String, dynamic>)
            : null,
        entries: (json['entries'] as List<dynamic>? ?? [])
            .map((e) => EntradaOrden.desdeJson(e as Map<String, dynamic>))
            .toList(),
        services: (json['services'] as List<dynamic>? ?? [])
            .map((e) => PartidaOrden.desdeJson(e as Map<String, dynamic>))
            .toList(),
        labor: (json['labor'] as List<dynamic>? ?? [])
            .map((e) => PartidaOrden.desdeJson(e as Map<String, dynamic>))
            .toList(),
        refacciones: (json['refacciones'] as List<dynamic>? ?? [])
            .map((e) => RefaccionOrden.desdeJson(e as Map<String, dynamic>))
            .toList(),
        totals: json['totals'] is Map<String, dynamic>
            ? TotalesOrden.desdeJson(json['totals'] as Map<String, dynamic>)
            : null,
      );

  /// Estados finales: el historial queda en solo lectura (RN-9).
  bool get esFinal => status == 'ENTREGADO' || status == 'CANCELADA';

  /// Nombre del estado en español para la interfaz.
  String get nombreEstado {
    switch (status) {
      case 'RECIBIDO':
        return 'Recibido';
      case 'DIAGNOSTICO':
        return 'Diagnóstico';
      case 'EN_REPARACION':
        return 'En reparación';
      case 'ESPERANDO_REFACCION':
        return 'Esperando refacción';
      case 'TERMINADO':
        return 'Terminado';
      case 'ENTREGADO':
        return 'Entregado';
      case 'CANCELADA':
        return 'Cancelada';
      default:
        return status;
    }
  }
}

/// Cliente propietario de la orden (detalle).
class ClienteRef {
  final int id;
  final String fullName;
  final String phone;

  const ClienteRef({
    required this.id,
    required this.fullName,
    required this.phone,
  });

  factory ClienteRef.desdeJson(Map<String, dynamic> json) => ClienteRef(
        id: json['id'] as int? ?? 0,
        fullName: json['fullName'] as String? ?? '',
        phone: json['phone'] as String? ?? '',
      );
}

/// Vehículo atendido (detalle).
class VehiculoRef {
  final int id;
  final String plates;
  final String brand;
  final String model;
  final int year;

  const VehiculoRef({
    required this.id,
    required this.plates,
    required this.brand,
    required this.model,
    required this.year,
  });

  factory VehiculoRef.desdeJson(Map<String, dynamic> json) => VehiculoRef(
        id: json['id'] as int? ?? 0,
        plates: json['plates'] as String? ?? '',
        brand: json['brand'] as String? ?? '',
        model: json['model'] as String? ?? '',
        year: json['year'] as int? ?? 0,
      );
}

/// Mecánico asignado (detalle).
class MecanicoRef {
  final int id;
  final String username;
  final String fullName;

  const MecanicoRef({
    required this.id,
    required this.username,
    required this.fullName,
  });

  factory MecanicoRef.desdeJson(Map<String, dynamic> json) => MecanicoRef(
        id: json['id'] as int? ?? 0,
        username: json['username'] as String? ?? '',
        fullName: json['fullName'] as String? ?? '',
      );
}

/// Entrada fechada de la orden: diagnóstico, observación o recomendación
/// (historial inmutable con autor y fecha; Clarificación 5).
class EntradaOrden {
  final int id;
  final String entryType;
  final String content;
  final int? createdBy;
  final String? authorName;
  final String? createdAt;

  const EntradaOrden({
    required this.id,
    required this.entryType,
    required this.content,
    this.createdBy,
    this.authorName,
    this.createdAt,
  });

  factory EntradaOrden.desdeJson(Map<String, dynamic> json) => EntradaOrden(
        id: json['id'] as int? ?? 0,
        entryType: json['entryType'] as String? ?? 'DIAGNOSTIC',
        content: json['content'] as String? ?? '',
        createdBy: json['createdBy'] as int?,
        authorName: json['authorName'] as String?,
        createdAt: json['createdAt']?.toString(),
      );

  /// Nombre del tipo de entrada en español.
  String get nombreTipo {
    switch (entryType) {
      case 'DIAGNOSTIC':
        return 'Diagnóstico';
      case 'OBSERVATION':
        return 'Observación';
      case 'RECOMMENDATION':
        return 'Recomendación';
      default:
        return entryType;
    }
  }
}

/// Partida de servicio o mano de obra (informativo; sin pagos en el MVP).
class PartidaOrden {
  final int id;
  final String kind;
  final String description;
  final double amount;

  const PartidaOrden({
    required this.id,
    required this.kind,
    required this.description,
    required this.amount,
  });

  factory PartidaOrden.desdeJson(Map<String, dynamic> json) => PartidaOrden(
        id: json['id'] as int? ?? 0,
        kind: json['kind'] as String? ?? 'SERVICE',
        description: json['description'] as String? ?? '',
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
      );
}

/// Totales informativos de la orden (sin módulo de pagos).
///
/// Incluyen las refacciones usadas (005, FR-007): `parts` suma
/// `unitPrice × quantity`; `totalCompleto` es falso cuando la orden tiene
/// usos sin precio (FR-008), contados en `refaccionesSinPrecio`.
class TotalesOrden {
  final double services;
  final double labor;
  final double parts;
  final double grand;
  final bool totalCompleto;
  final int refaccionesSinPrecio;

  const TotalesOrden({
    required this.services,
    required this.labor,
    required this.grand,
    this.parts = 0,
    this.totalCompleto = true,
    this.refaccionesSinPrecio = 0,
  });

  factory TotalesOrden.desdeJson(Map<String, dynamic> json) => TotalesOrden(
        services: (json['services'] as num?)?.toDouble() ?? 0,
        labor: (json['labor'] as num?)?.toDouble() ?? 0,
        parts: (json['parts'] as num?)?.toDouble() ?? 0,
        grand: (json['grand'] as num?)?.toDouble() ?? 0,
        totalCompleto: json['totalCompleto'] as bool? ?? true,
        refaccionesSinPrecio: json['refaccionesSinPrecio'] as int? ?? 0,
      );
}
