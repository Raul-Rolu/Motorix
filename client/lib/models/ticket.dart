/// Modelo del ticket de servicio (Sprint 4, US3; FR-011 a FR-013).
///
/// El contenido del ticket se deriva al vuelo en el servidor: la aplicación
/// solo lo muestra e imprime, sin persistir importes (CA-4, research D4).
library;

/// Un servicio facturado del ticket (nombre + precio unitario del trabajo).
class TicketPartida {
  final String nombre;
  final double precio;

  const TicketPartida({required this.nombre, required this.precio});

  factory TicketPartida.desdeJson(Map<String, dynamic> json) => TicketPartida(
        nombre: json['nombre'] as String? ?? '',
        precio: (json['precio'] as num? ?? 0).toDouble(),
      );
}

/// Una refacción usada en la orden, con su precio congelado (005, CA-13).
///
/// En una orden ya liquidada con usos heredados sin precio, `unitPrice` y
/// `amount` llegan nulos con `sinPrecio: true` (FR-016, CA-21).
class TicketRefaccion {
  final String nombre;
  final String codigo;
  final int cantidad;

  /// Precio unitario congelado al uso; null = sin precio de venta.
  final double? unitPrice;

  /// Importe de la línea (`unitPrice × cantidad`); null sin precio.
  final double? amount;

  const TicketRefaccion({
    required this.nombre,
    required this.codigo,
    required this.cantidad,
    this.unitPrice,
    this.amount,
  });

  bool get sinPrecio => unitPrice == null;

  factory TicketRefaccion.desdeJson(Map<String, dynamic> json) => TicketRefaccion(
        nombre: json['nombre'] as String? ?? '',
        codigo: json['codigo'] as String? ?? '',
        cantidad: json['cantidad'] as int? ?? 0,
        unitPrice: (json['unitPrice'] as num?)?.toDouble(),
        amount: (json['amount'] as num?)?.toDouble(),
      );
}

/// Un método de pago registrado en la orden (FR-001).
class TicketPago {
  final String metodo;
  final double monto;

  /// COMPLETED | PENDING | EXPIRED (solo los COMPLETED liquidan).
  final String estado;

  const TicketPago({
    required this.metodo,
    required this.monto,
    required this.estado,
  });

  factory TicketPago.desdeJson(Map<String, dynamic> json) => TicketPago(
        metodo: json['metodo'] as String? ?? '',
        monto: (json['monto'] as num? ?? 0).toDouble(),
        estado: json['estado'] as String? ?? '',
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
}

/// Ticket completo de una orden de servicio (respuesta de GET /api/tickets/:orderId).
class TicketServicio {
  final String folio;
  final String fecha;
  final String tallerNombre;
  final String tallerDireccion;
  final String tallerTelefono;
  final String clienteNombre;
  final String vehiculoDescripcion;
  final String placas;
  final int kilometraje;
  final List<TicketPartida> servicios;
  final List<TicketRefaccion> refacciones;
  final double manoObra;
  final double subtotal;
  final double total;
  final List<TicketPago> metodosDePago;
  final String estadoPago;
  final double saldoPendiente;

  /// false = falta el precio de venta de alguna refacción usada (005, FR-013);
  /// solo puede ocurrir en órdenes ya liquidadas (FR-016).
  final bool totalCompleto;

  const TicketServicio({
    required this.folio,
    required this.fecha,
    required this.tallerNombre,
    required this.tallerDireccion,
    required this.tallerTelefono,
    required this.clienteNombre,
    required this.vehiculoDescripcion,
    required this.placas,
    required this.kilometraje,
    required this.servicios,
    required this.refacciones,
    required this.manoObra,
    required this.subtotal,
    required this.total,
    required this.metodosDePago,
    required this.estadoPago,
    required this.saldoPendiente,
    this.totalCompleto = true,
  });

  factory TicketServicio.desdeJson(Map<String, dynamic> json) {
    final taller = json['taller'] as Map<String, dynamic>? ?? {};
    final cliente = json['cliente'] as Map<String, dynamic>? ?? {};
    final vehiculo = json['vehiculo'] as Map<String, dynamic>? ?? {};
    final servicios = json['servicios'] as List<dynamic>? ?? [];
    final refacciones = json['refacciones'] as List<dynamic>? ?? [];
    final pagos = json['metodosDePago'] as List<dynamic>? ?? [];

    return TicketServicio(
      folio: json['folio'] as String? ?? '',
      fecha: json['fecha'] as String? ?? '',
      tallerNombre: taller['nombre'] as String? ?? '',
      tallerDireccion: taller['direccion'] as String? ?? '',
      tallerTelefono: taller['telefono'] as String? ?? '',
      clienteNombre: cliente['nombreCompleto'] as String? ?? '',
      vehiculoDescripcion: [
        vehiculo['marca'] as String? ?? '',
        vehiculo['modelo'] as String? ?? '',
        if (vehiculo['anio'] != null) '${vehiculo['anio']}',
      ].where((parte) => parte.isNotEmpty).join(' '),
      placas: vehiculo['placas'] as String? ?? '',
      kilometraje: vehiculo['kilometraje'] as int? ?? 0,
      servicios: servicios
          .map((elemento) =>
              TicketPartida.desdeJson(elemento as Map<String, dynamic>))
          .toList(),
      refacciones: refacciones
          .map((elemento) =>
              TicketRefaccion.desdeJson(elemento as Map<String, dynamic>))
          .toList(),
      manoObra: (json['manoObra'] as num? ?? 0).toDouble(),
      subtotal: (json['subtotal'] as num? ?? 0).toDouble(),
      total: (json['total'] as num? ?? 0).toDouble(),
      metodosDePago: pagos
          .map((elemento) =>
              TicketPago.desdeJson(elemento as Map<String, dynamic>))
          .toList(),
      estadoPago: json['estadoPago'] as String? ?? 'PENDIENTE',
      saldoPendiente: (json['saldoPendiente'] as num? ?? 0).toDouble(),
      totalCompleto: json['totalCompleto'] as bool? ?? true,
    );
  }

  String get nombreEstadoPago {
    switch (estadoPago) {
      case 'LIQUIDADA':
        return 'Pagada';
      case 'PARCIAL':
        return 'Parcialmente pagada';
      default:
        return 'Sin pagar';
    }
  }
}
