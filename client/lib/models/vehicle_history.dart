/// Modelo del historial de servicios de un vehículo (Sprint 3, US1/US2).
///
/// Refleja la respuesta de `GET /api/vehicles/:id/history`: el historial se
/// deriva de las órdenes terminadas/entregadas (RN-10) y cada servicio
/// conserva el kilometraje registrado en su momento (RN-3) con la constancia
/// de corrección (RN-4).
library;

class HistorialVehiculo {
  final VehiculoHistorial vehiculo;
  final List<ServicioHistorial> historial;

  const HistorialVehiculo({required this.vehiculo, required this.historial});

  factory HistorialVehiculo.desdeJson(Map<String, dynamic> json) =>
      HistorialVehiculo(
        vehiculo: VehiculoHistorial.desdeJson(
            (json['vehiculo'] ?? {}) as Map<String, dynamic>),
        historial: (json['historial'] as List<dynamic>? ?? [])
            .map((servicio) => ServicioHistorial.desdeJson(
                servicio as Map<String, dynamic>))
            .toList(),
      );
}

/// Datos del vehículo del historial (claves en español del contrato).
class VehiculoHistorial {
  final int id;
  final String placas;
  final String marca;
  final String modelo;
  final int anio;
  final int kilometrajeActual;

  const VehiculoHistorial({
    required this.id,
    required this.placas,
    required this.marca,
    required this.modelo,
    required this.anio,
    required this.kilometrajeActual,
  });

  factory VehiculoHistorial.desdeJson(Map<String, dynamic> json) =>
      VehiculoHistorial(
        id: json['id'] as int? ?? 0,
        placas: json['placas'] as String? ?? '',
        marca: json['marca'] as String? ?? '',
        modelo: json['modelo'] as String? ?? '',
        anio: json['anio'] as int? ?? 0,
        kilometrajeActual: json['kilometrajeActual'] as int? ?? 0,
      );
}

/// Un servicio del historial (una orden terminada o entregada).
class ServicioHistorial {
  final int orderId;
  final String fecha;
  final int kilometraje;
  final bool correccionKilometraje;
  final String motivo;
  final String? notas;
  final String? ultimaEntrada;
  final MecanicoHistorial? mecanico;
  final ResumenServicio resumen;
  final List<RefaccionHistorial> refacciones;

  const ServicioHistorial({
    required this.orderId,
    required this.fecha,
    required this.kilometraje,
    required this.correccionKilometraje,
    required this.motivo,
    this.notas,
    this.ultimaEntrada,
    this.mecanico,
    required this.resumen,
    required this.refacciones,
  });

  factory ServicioHistorial.desdeJson(Map<String, dynamic> json) =>
      ServicioHistorial(
        orderId: json['orderId'] as int? ?? 0,
        fecha: json['fecha'] as String? ?? '',
        kilometraje: json['kilometraje'] as int? ?? 0,
        correccionKilometraje: json['correccionKilometraje'] as bool? ?? false,
        motivo: json['motivo'] as String? ?? '',
        notas: json['notas'] as String?,
        ultimaEntrada: json['ultimaEntrada'] as String?,
        mecanico: json['mecanico'] is Map<String, dynamic>
            ? MecanicoHistorial.desdeJson(
                json['mecanico'] as Map<String, dynamic>)
            : null,
        resumen: ResumenServicio.desdeJson(
            (json['resumen'] ?? {}) as Map<String, dynamic>),
        refacciones: (json['refacciones'] as List<dynamic>? ?? [])
            .map((refaccion) => RefaccionHistorial.desdeJson(
                refaccion as Map<String, dynamic>))
            .toList(),
      );
}

/// Mecánico que atendió el servicio.
class MecanicoHistorial {
  final int id;
  final String nombreCompleto;

  const MecanicoHistorial({required this.id, required this.nombreCompleto});

  factory MecanicoHistorial.desdeJson(Map<String, dynamic> json) =>
      MecanicoHistorial(
        id: json['id'] as int? ?? 0,
        nombreCompleto: json['nombreCompleto'] as String? ?? '',
      );
}

/// Resumen cuantitativo del trabajo realizado en el servicio.
class ResumenServicio {
  final int servicios;
  final int manoObra;
  final int refacciones;
  final double total;

  const ResumenServicio({
    required this.servicios,
    required this.manoObra,
    required this.refacciones,
    required this.total,
  });

  factory ResumenServicio.desdeJson(Map<String, dynamic> json) =>
      ResumenServicio(
        servicios: json['servicios'] as int? ?? 0,
        manoObra: json['manoObra'] as int? ?? 0,
        refacciones: json['refacciones'] as int? ?? 0,
        total: (json['total'] as num?)?.toDouble() ?? 0,
      );
}

/// Refacción utilizada en el servicio (nombre y cantidad).
class RefaccionHistorial {
  final String nombre;
  final int cantidad;

  const RefaccionHistorial({required this.nombre, required this.cantidad});

  factory RefaccionHistorial.desdeJson(Map<String, dynamic> json) =>
      RefaccionHistorial(
        nombre: json['nombre'] as String? ?? '',
        cantidad: json['cantidad'] as int? ?? 0,
      );
}
