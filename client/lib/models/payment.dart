/// Modelos de cobros de una orden (Sprint 4, US1/US2; FR-001 a FR-004).
///
/// Los pagos son inmutables (FR-006): la aplicación solo los crea y los
/// consulta. Los saldos y el estado de cobro se derivan en el servidor
/// (FR-003/FR-004); los cobros PENDING/EXPIRED jamás cuentan (FR-009).
library;

/// Resumen de cobro de una orden (GET /api/orders/:id/payments).
class PagosDeOrden {
  final double total;
  final double cobrado;
  final double saldoPendiente;

  /// PENDIENTE | PARCIAL | LIQUIDADA (derivado en el servidor).
  final String estadoCobro;
  final List<Pago> pagos;

  /// false = la orden tiene usos de refacciones sin precio (005, FR-009);
  /// en ese estado el servidor rechaza cualquier cobro con
  /// `TOTAL_INCOMPLETO` salvo que la orden ya esté liquidada (FR-016).
  final bool totalCompleto;

  /// Cantidad de usos de refacciones sin precio (005, CA-12).
  final int refaccionesSinPrecio;

  const PagosDeOrden({
    required this.total,
    required this.cobrado,
    required this.saldoPendiente,
    required this.estadoCobro,
    required this.pagos,
    this.totalCompleto = true,
    this.refaccionesSinPrecio = 0,
  });

  factory PagosDeOrden.desdeJson(Map<String, dynamic> json) {
    final datos = json['datos'] as List<dynamic>? ?? [];
    return PagosDeOrden(
      total: (json['total'] as num? ?? 0).toDouble(),
      cobrado: (json['cobrado'] as num? ?? 0).toDouble(),
      saldoPendiente: (json['saldoPendiente'] as num? ?? 0).toDouble(),
      estadoCobro: json['estadoCobro'] as String? ?? 'PENDIENTE',
      totalCompleto: json['totalCompleto'] as bool? ?? true,
      refaccionesSinPrecio: json['refaccionesSinPrecio'] as int? ?? 0,
      pagos: datos
          .map((elemento) => Pago.desdeJson(elemento as Map<String, dynamic>))
          .toList(),
    );
  }

  String get nombreEstadoCobro {
    switch (estadoCobro) {
      case 'LIQUIDADA':
        return 'Liquidada';
      case 'PARCIAL':
        return 'Parcialmente pagada';
      default:
        return 'Sin pagar';
    }
  }
}

/// Un pago concreto de una orden (FR-001).
class Pago {
  final int id;

  /// CASH | CARD | TRANSFER | MERCADO_PAGO.
  final String metodo;
  final double monto;

  /// COMPLETED | PENDING | EXPIRED (solo los COMPLETED cuentan, FR-009).
  final String estado;
  final String? externalReference;
  final String? registradoPor;
  final String? fecha;

  const Pago({
    required this.id,
    required this.metodo,
    required this.monto,
    required this.estado,
    this.externalReference,
    this.registradoPor,
    this.fecha,
  });

  factory Pago.desdeJson(Map<String, dynamic> json) => Pago(
        id: json['id'] as int? ?? 0,
        metodo: json['metodo'] as String? ?? '',
        monto: (json['monto'] as num? ?? 0).toDouble(),
        estado: json['estado'] as String? ?? '',
        externalReference: json['externalReference'] as String?,
        registradoPor:
            (json['registradoPor'] as Map<String, dynamic>?)?['nombreCompleto']
                as String?,
        fecha: json['fecha'] as String?,
      );

  String get nombreMetodo {
    switch (metodo) {
      case 'CASH':
        return 'Efectivo';
      case 'CARD':
        return 'Tarjeta';
      case 'TRANSFER':
        return 'Transferencia';
      case 'MERCADO_PAGO':
        return 'Mercado Pago';
      default:
        return metodo;
    }
  }

  String get nombreEstado {
    switch (estado) {
      case 'COMPLETED':
        return 'Completado';
      case 'PENDING':
        return 'Pendiente';
      case 'EXPIRED':
        return 'Expirado';
      default:
        return estado;
    }
  }
}

/// Cobro digital creado con Mercado Pago (Sprint 4, US2; FR-008/FR-017).
///
/// Solo contiene el enlace de pago y su estado: la aplicación jamás maneja
/// datos de tarjeta ni credenciales del proveedor (RN-14).
class CobroDigital {
  final int id;

  /// PENDING | COMPLETED | EXPIRED.
  final String estado;
  final double monto;
  final String enlace;

  const CobroDigital({
    required this.id,
    required this.estado,
    required this.monto,
    required this.enlace,
  });

  factory CobroDigital.desdeJson(Map<String, dynamic> json) => CobroDigital(
        id: json['id'] as int? ?? 0,
        estado: json['estado'] as String? ?? 'PENDING',
        monto: (json['monto'] as num? ?? 0).toDouble(),
        enlace: json['enlace'] as String? ?? '',
      );

  CobroDigital copiarCon({String? estado}) => CobroDigital(
        id: id,
        estado: estado ?? this.estado,
        monto: monto,
        enlace: enlace,
      );

  String get nombreEstado {
    switch (estado) {
      case 'COMPLETED':
        return 'Confirmado';
      case 'EXPIRED':
        return 'Expirado';
      default:
        return 'Pendiente de confirmación';
    }
  }
}
