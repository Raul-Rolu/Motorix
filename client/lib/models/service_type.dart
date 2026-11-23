/// Tipo de servicio del catálogo (008-configuracion-seguridad-reportes, T040;
/// FR-006, FR-007, RN-12).
///
/// Refleja `GET /api/service-types` (contracts/api-rest.md): nombre, intervalo en
/// días y/o kilómetros (al menos uno) y si está activo. Un tipo usado nunca se
/// borra; solo se desactiva.
library;

class TipoServicio {
  final int id;
  final String nombre;
  final int? intervaloDias;
  final int? intervaloKm;
  final bool activo;

  const TipoServicio({
    required this.id,
    required this.nombre,
    this.intervaloDias,
    this.intervaloKm,
    this.activo = true,
  });

  factory TipoServicio.desdeJson(Map<String, dynamic> json) => TipoServicio(
        id: json['id'] as int? ?? 0,
        nombre: json['nombre'] as String? ?? '',
        intervaloDias: (json['intervaloDias'] as num?)?.toInt(),
        intervaloKm: (json['intervaloKm'] as num?)?.toInt(),
        activo: json['activo'] as bool? ?? true,
      );

  /// Texto del intervalo para las listas: «180 días · 5,000 km», «90 días» o «10,000 km».
  String get resumenIntervalo {
    final partes = <String>[
      if (intervaloDias != null) '$intervaloDias días',
      if (intervaloKm != null) '${_conMiles(intervaloKm!)} km',
    ];
    return partes.join(' · ');
  }

  /// Entero con separador de miles (5000 → 5,000).
  static String _conMiles(int valor) {
    final texto = valor.toString();
    final buffer = StringBuffer();
    for (var i = 0; i < texto.length; i++) {
      if (i > 0 && (texto.length - i) % 3 == 0) buffer.write(',');
      buffer.write(texto[i]);
    }
    return buffer.toString();
  }
}
