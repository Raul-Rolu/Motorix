/// Términos y condiciones con aviso de privacidad
/// (008-configuracion-seguridad-reportes, T094; FR-019, FR-020, FR-022).
///
/// Refleja `GET /api/terms/current`, `GET /api/terms/acceptances` y
/// `POST /api/terms` (contracts/api-rest.md). Las versiones y las aceptaciones
/// son de solo lectura en el cliente.
library;

/// Fecha local legible: `20/11/2026`.
String fechaCorta(DateTime fecha) {
  String dos(int n) => n.toString().padLeft(2, '0');
  return '${dos(fecha.day)}/${dos(fecha.month)}/${fecha.year}';
}

DateTime _leerFecha(Object? valor) =>
    DateTime.tryParse(valor as String? ?? '')?.toLocal() ?? DateTime.fromMillisecondsSinceEpoch(0);

/// Una versión publicada de los términos y del aviso de privacidad.
class VersionTerminos {
  final int id;
  final int version;
  final String terminos;
  final String avisoPrivacidad;
  final DateTime publicadaEn;

  const VersionTerminos({
    required this.id,
    required this.version,
    required this.terminos,
    required this.avisoPrivacidad,
    required this.publicadaEn,
  });

  factory VersionTerminos.desdeJson(Map<String, dynamic> json) => VersionTerminos(
        id: (json['id'] as num?)?.toInt() ?? 0,
        version: (json['version'] as num?)?.toInt() ?? 0,
        terminos: json['terminos'] as String? ?? '',
        avisoPrivacidad: json['avisoPrivacidad'] as String? ?? '',
        publicadaEn: _leerFecha(json['publicadaEn']),
      );

  String get publicadaTexto => fechaCorta(publicadaEn);
}

/// Una aceptación de un usuario (vista del administrador).
class AceptacionTerminos {
  final int usuarioId;
  final String usuarioNombre;
  final int version;
  final DateTime aceptadaEn;

  const AceptacionTerminos({
    required this.usuarioId,
    required this.usuarioNombre,
    required this.version,
    required this.aceptadaEn,
  });

  factory AceptacionTerminos.desdeJson(Map<String, dynamic> json) {
    final usuario = json['usuario'] as Map<String, dynamic>? ?? const {};
    return AceptacionTerminos(
      usuarioId: (usuario['id'] as num?)?.toInt() ?? 0,
      usuarioNombre: usuario['nombre'] as String? ?? '',
      version: (json['version'] as num?)?.toInt() ?? 0,
      aceptadaEn: _leerFecha(json['aceptadaEn']),
    );
  }

  /// Fecha local legible: `21/11/2026 09:30`.
  String get aceptadaTexto {
    String dos(int n) => n.toString().padLeft(2, '0');
    return '${fechaCorta(aceptadaEn)} ${dos(aceptadaEn.hour)}:${dos(aceptadaEn.minute)}';
  }
}
