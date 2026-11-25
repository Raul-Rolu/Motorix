/// Modelos de los reportes (008-configuracion-seguridad-reportes, T118; FR-023,
/// FR-024). Reflejan `GET /api/reports/*` (contracts/api-rest.md). Solo lectura.
///
/// Los importes llegan en **centavos enteros** (`…Centavos`) y así se conservan:
/// se formatean con [formatearCentavos] sin pasar por coma flotante.
library;

/// Importe en pesos con dos decimales desde centavos enteros: `123450` → `$1234.50`
/// (el mismo formato del resto de la aplicación; los negativos, `-$12.50`).
String formatearCentavos(int centavos) {
  final signo = centavos < 0 ? '-' : '';
  final absoluto = centavos.abs();
  final pesos = absoluto ~/ 100;
  final resto = (absoluto % 100).toString().padLeft(2, '0');
  return '$signo\$$pesos.$resto';
}

const List<String> _meses = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/// `2026-11-05` → `05/11/2026` (si no tiene ese formato se devuelve igual).
String fechaLegible(String fecha) {
  final partes = fecha.split('-');
  if (partes.length != 3) return fecha;
  return '${partes[2]}/${partes[1]}/${partes[0]}';
}

/// `2026-11-05` → `05/11/2026`; `2026-11` → `Noviembre 2026`.
String etiquetaPeriodo(String periodo) {
  final partes = periodo.split('-');
  if (partes.length == 3) return fechaLegible(periodo);
  if (partes.length == 2) {
    final mes = int.tryParse(partes[1]);
    if (mes != null && mes >= 1 && mes <= 12) {
      return '${_meses[mes - 1]} ${partes[0]}';
    }
  }
  return periodo;
}

int _entero(Object? valor) => (valor as num? ?? 0).toInt();

/// Total de un periodo (un día o un mes).
class TotalPeriodo {
  final String periodo;
  final int totalCentavos;

  const TotalPeriodo({required this.periodo, required this.totalCentavos});

  factory TotalPeriodo.desdeJson(Map<String, dynamic> json) => TotalPeriodo(
        periodo: json['periodo'] as String? ?? '',
        totalCentavos: _entero(json['totalCentavos']),
      );

  String get etiqueta => etiquetaPeriodo(periodo);
}

/// Total de un método de pago.
class TotalMetodo {
  final String metodo;
  final int totalCentavos;

  const TotalMetodo({required this.metodo, required this.totalCentavos});

  factory TotalMetodo.desdeJson(Map<String, dynamic> json) => TotalMetodo(
        metodo: json['metodo'] as String? ?? '',
        totalCentavos: _entero(json['totalCentavos']),
      );

  /// Nombre en español (un método desconocido se muestra con su código).
  String get etiqueta {
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

/// Reporte de ingresos del rango (`GET /api/reports/income`).
class ReporteIngresos {
  final String desde;
  final String hasta;

  /// `DIA` (rangos de hasta 62 días) o `MES`.
  final String agrupacion;
  final int totalCentavos;
  final List<TotalPeriodo> porPeriodo;
  final List<TotalMetodo> porMetodo;

  const ReporteIngresos({
    required this.desde,
    required this.hasta,
    required this.agrupacion,
    required this.totalCentavos,
    required this.porPeriodo,
    required this.porMetodo,
  });

  factory ReporteIngresos.desdeJson(Map<String, dynamic> json) {
    final rango = json['rango'] as Map<String, dynamic>? ?? const {};
    return ReporteIngresos(
      desde: rango['desde'] as String? ?? '',
      hasta: rango['hasta'] as String? ?? '',
      agrupacion: json['agrupacion'] as String? ?? 'DIA',
      totalCentavos: _entero(json['totalCentavos']),
      porPeriodo: (json['porPeriodo'] as List<dynamic>? ?? [])
          .map((dato) => TotalPeriodo.desdeJson(dato as Map<String, dynamic>))
          .toList(),
      porMetodo: (json['porMetodo'] as List<dynamic>? ?? [])
          .map((dato) => TotalMetodo.desdeJson(dato as Map<String, dynamic>))
          .toList(),
    );
  }

  /// Sin ningún cobro en el rango.
  bool get vacio => totalCentavos == 0 && porPeriodo.isEmpty && porMetodo.isEmpty;

  String get rangoTexto => 'Del ${fechaLegible(desde)} al ${fechaLegible(hasta)}';
}

String _plural(int n, String singular, String plural) => '$n ${n == 1 ? singular : plural}';

/// Un tipo de servicio del reporte «Servicios» (`tipo` ya viene como «Sin tipo»
/// cuando las líneas no tienen tipo).
class ServicioReporte {
  final String tipo;
  final int cantidad;
  final int importeCentavos;

  const ServicioReporte({required this.tipo, required this.cantidad, required this.importeCentavos});

  factory ServicioReporte.desdeJson(Map<String, dynamic> json) => ServicioReporte(
        tipo: json['tipo'] as String? ?? 'Sin tipo',
        cantidad: _entero(json['cantidad']),
        importeCentavos: _entero(json['importeCentavos']),
      );

  String get etiquetaCantidad => _plural(cantidad, 'servicio', 'servicios');
}

/// Reporte de servicios más frecuentes (`GET /api/reports/services`).
class ReporteServicios {
  final String desde;
  final String hasta;
  final List<ServicioReporte> datos;

  const ReporteServicios({required this.desde, required this.hasta, required this.datos});

  factory ReporteServicios.desdeJson(Map<String, dynamic> json) {
    final rango = json['rango'] as Map<String, dynamic>? ?? const {};
    return ReporteServicios(
      desde: rango['desde'] as String? ?? '',
      hasta: rango['hasta'] as String? ?? '',
      datos: (json['datos'] as List<dynamic>? ?? [])
          .map((dato) => ServicioReporte.desdeJson(dato as Map<String, dynamic>))
          .toList(),
    );
  }

  bool get vacio => datos.isEmpty;
  int get totalCantidad => datos.fold(0, (suma, fila) => suma + fila.cantidad);
  int get totalCentavos => datos.fold(0, (suma, fila) => suma + fila.importeCentavos);
  String get etiquetaTotalCantidad => _plural(totalCantidad, 'servicio', 'servicios');
  String get rangoTexto => 'Del ${fechaLegible(desde)} al ${fechaLegible(hasta)}';
}

/// Productividad de un mecánico (`nombre` nulo = «Sin asignar»).
class MecanicoReporte {
  final int? id;
  final String? nombre;
  final int ordenes;
  final int manoObraCentavos;

  const MecanicoReporte({this.id, this.nombre, required this.ordenes, required this.manoObraCentavos});

  factory MecanicoReporte.desdeJson(Map<String, dynamic> json) {
    final mecanico = json['mecanico'] as Map<String, dynamic>?;
    return MecanicoReporte(
      id: (mecanico?['id'] as num?)?.toInt(),
      nombre: mecanico?['nombre'] as String?,
      ordenes: _entero(json['ordenes']),
      manoObraCentavos: _entero(json['manoObraCentavos']),
    );
  }

  bool get sinAsignar => nombre == null;
  String get etiqueta => nombre ?? 'Sin asignar';
  String get etiquetaOrdenes => _plural(ordenes, 'orden', 'órdenes');
}

/// Reporte de productividad por mecánico (`GET /api/reports/productivity`).
class ReporteProductividad {
  final String desde;
  final String hasta;
  final List<MecanicoReporte> datos;

  const ReporteProductividad({required this.desde, required this.hasta, required this.datos});

  factory ReporteProductividad.desdeJson(Map<String, dynamic> json) {
    final rango = json['rango'] as Map<String, dynamic>? ?? const {};
    return ReporteProductividad(
      desde: rango['desde'] as String? ?? '',
      hasta: rango['hasta'] as String? ?? '',
      datos: (json['datos'] as List<dynamic>? ?? [])
          .map((dato) => MecanicoReporte.desdeJson(dato as Map<String, dynamic>))
          .toList(),
    );
  }

  bool get vacio => datos.isEmpty;
  int get totalOrdenes => datos.fold(0, (suma, fila) => suma + fila.ordenes);
  int get totalManoObraCentavos => datos.fold(0, (suma, fila) => suma + fila.manoObraCentavos);
  String get etiquetaTotalOrdenes => _plural(totalOrdenes, 'orden', 'órdenes');
  String get rangoTexto => 'Del ${fechaLegible(desde)} al ${fechaLegible(hasta)}';
}
