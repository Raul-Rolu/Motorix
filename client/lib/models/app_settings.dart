/// Modelo de la configuración del taller (008-configuracion-seguridad-reportes,
/// T022; FR-001, FR-002, FR-004).
///
/// Refleja `GET`/`PUT /api/settings` (contracts/api-rest.md): datos del taller,
/// márgenes de operación y los límites que el servidor valida. Los valores de
/// respaldo los resuelve el servidor; aquí solo se lee lo que devuelve.
library;

class AjustesTaller {
  final String nombre;
  final String direccion;
  final String telefono;

  const AjustesTaller({
    required this.nombre,
    required this.direccion,
    required this.telefono,
  });

  factory AjustesTaller.desdeJson(Map<String, dynamic> json) => AjustesTaller(
        nombre: json['nombre'] as String? ?? '',
        direccion: json['direccion'] as String? ?? '',
        telefono: json['telefono'] as String? ?? '',
      );
}

class AjustesOperacion {
  final int margenProximoDias;
  final int margenProximoKm;
  final int diasOrdenDetenida;

  const AjustesOperacion({
    required this.margenProximoDias,
    required this.margenProximoKm,
    required this.diasOrdenDetenida,
  });

  factory AjustesOperacion.desdeJson(Map<String, dynamic> json) => AjustesOperacion(
        margenProximoDias: (json['margenProximoDias'] as num? ?? 30).toInt(),
        margenProximoKm: (json['margenProximoKm'] as num? ?? 1000).toInt(),
        diasOrdenDetenida: (json['diasOrdenDetenida'] as num? ?? 3).toInt(),
      );
}

/// Ajustes de seguridad (008, P2; FR-016): minutos de inactividad de la sesión.
class AjustesSeguridad {
  final int minutosInactividad;

  const AjustesSeguridad({required this.minutosInactividad});

  factory AjustesSeguridad.desdeJson(Map<String, dynamic> json) =>
      AjustesSeguridad(minutosInactividad: (json['minutosInactividad'] as num? ?? 30).toInt());
}

class AppSettings {
  final AjustesTaller taller;
  final AjustesOperacion operacion;
  final AjustesSeguridad seguridad;

  /// Límites inclusivos `[mínimo, máximo]` por ajuste numérico, tal como los
  /// valida el servidor (p. ej. `margenProximoDias: [1, 365]`).
  final Map<String, List<int>> limites;

  const AppSettings({
    required this.taller,
    required this.operacion,
    this.seguridad = const AjustesSeguridad(minutosInactividad: 30),
    this.limites = const {},
  });

  factory AppSettings.desdeJson(Map<String, dynamic> json) {
    final crudos = json['limites'] as Map<String, dynamic>? ?? {};
    return AppSettings(
      taller: AjustesTaller.desdeJson(json['taller'] as Map<String, dynamic>? ?? {}),
      operacion: AjustesOperacion.desdeJson(json['operacion'] as Map<String, dynamic>? ?? {}),
      seguridad: AjustesSeguridad.desdeJson(json['seguridad'] as Map<String, dynamic>? ?? {}),
      limites: {
        for (final entrada in crudos.entries)
          entrada.key: (entrada.value as List<dynamic>).map((n) => (n as num).toInt()).toList(),
      },
    );
  }
}
