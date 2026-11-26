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

/// Un uso de una refacción en una orden cerrada (una fila de «Refacciones»). Los
/// importes que faltan (`sinCosto`, `sinPrecio`) llegan nulos: nunca se muestran
/// como 0.
class LineaRefaccion {
  final int ordenId;
  final int parteId;
  final String codigo;
  final String nombre;
  final int cantidad;
  final int? precioVentaCentavos;
  final int? precioCompraCentavos;
  final int? ventasCentavos;
  final int? costoCentavos;
  final int? margenCentavos;
  final bool sinCosto;
  final bool sinPrecio;

  const LineaRefaccion({
    required this.ordenId,
    required this.parteId,
    required this.codigo,
    required this.nombre,
    required this.cantidad,
    this.precioVentaCentavos,
    this.precioCompraCentavos,
    this.ventasCentavos,
    this.costoCentavos,
    this.margenCentavos,
    required this.sinCosto,
    required this.sinPrecio,
  });

  factory LineaRefaccion.desdeJson(Map<String, dynamic> json) => LineaRefaccion(
        ordenId: _entero(json['ordenId']),
        parteId: _entero(json['parteId']),
        codigo: json['codigo'] as String? ?? '',
        nombre: json['nombre'] as String? ?? '',
        cantidad: _entero(json['cantidad']),
        precioVentaCentavos: (json['precioVentaCentavos'] as num?)?.toInt(),
        precioCompraCentavos: (json['precioCompraCentavos'] as num?)?.toInt(),
        ventasCentavos: (json['ventasCentavos'] as num?)?.toInt(),
        costoCentavos: (json['costoCentavos'] as num?)?.toInt(),
        margenCentavos: (json['margenCentavos'] as num?)?.toInt(),
        sinCosto: json['sinCosto'] as bool? ?? false,
        sinPrecio: json['sinPrecio'] as bool? ?? false,
      );

  /// `FRN-PAS-220 · Orden #12`.
  String get detalle => '$codigo · Orden #$ordenId';
}

/// Totales de las líneas COMPLETAS del rango (todas, no solo la página).
class TotalesRefacciones {
  final int ventasCentavos;
  final int costoCentavos;
  final int margenCentavos;
  final int lineasSinCosto;
  final int lineasSinPrecio;

  const TotalesRefacciones({
    required this.ventasCentavos,
    required this.costoCentavos,
    required this.margenCentavos,
    required this.lineasSinCosto,
    required this.lineasSinPrecio,
  });

  factory TotalesRefacciones.desdeJson(Map<String, dynamic> json) => TotalesRefacciones(
        ventasCentavos: _entero(json['ventasCentavos']),
        costoCentavos: _entero(json['costoCentavos']),
        margenCentavos: _entero(json['margenCentavos']),
        lineasSinCosto: _entero(json['lineasSinCosto']),
        lineasSinPrecio: _entero(json['lineasSinPrecio']),
      );

  /// Aviso de las líneas incompletas, o `null` si todas están completas.
  String? get aviso {
    final c = lineasSinCosto;
    final p = lineasSinPrecio;
    if (c == 0 && p == 0) return null;
    final partes = <String>[
      if (c > 0) '$c ${c == 1 ? 'línea' : 'líneas'} sin costo',
      if (p > 0) (c > 0 ? '$p sin precio' : '$p ${p == 1 ? 'línea' : 'líneas'} sin precio'),
    ];
    final verbo = (c + p) == 1 ? 'no se incluye' : 'no se incluyen';
    return '${partes.join(' y ')} $verbo en estos totales.';
  }
}

/// Reporte de refacciones (`GET /api/reports/parts`), paginado.
class ReporteRefacciones {
  final String desde;
  final String hasta;
  final int pagina;
  final int totalPaginas;
  final int total;
  final TotalesRefacciones totales;
  final List<LineaRefaccion> datos;

  const ReporteRefacciones({
    required this.desde,
    required this.hasta,
    required this.pagina,
    required this.totalPaginas,
    required this.total,
    required this.totales,
    required this.datos,
  });

  factory ReporteRefacciones.desdeJson(Map<String, dynamic> json) {
    final rango = json['rango'] as Map<String, dynamic>? ?? const {};
    return ReporteRefacciones(
      desde: rango['desde'] as String? ?? '',
      hasta: rango['hasta'] as String? ?? '',
      pagina: _entero(json['pagina']),
      totalPaginas: (json['totalPaginas'] as num? ?? 1).toInt(),
      total: _entero(json['total']),
      totales: TotalesRefacciones.desdeJson(json['totales'] as Map<String, dynamic>? ?? const {}),
      datos: (json['datos'] as List<dynamic>? ?? [])
          .map((dato) => LineaRefaccion.desdeJson(dato as Map<String, dynamic>))
          .toList(),
    );
  }

  bool get vacio => total == 0 && datos.isEmpty;
  bool get hayAnterior => pagina > 1;
  bool get haySiguiente => pagina < totalPaginas;
  String get etiquetaTotal => _plural(total, 'línea', 'líneas');
  String get rangoTexto => 'Del ${fechaLegible(desde)} al ${fechaLegible(hasta)}';
}

/// Rotación de una refacción activa (una fila de «Rotación»).
class RotacionRefaccion {
  final int parteId;
  final String codigo;
  final String nombre;
  final int unidadesSalidas;
  final int existencia;
  final double? rotacion;
  final bool sinExistencia;

  const RotacionRefaccion({
    required this.parteId,
    required this.codigo,
    required this.nombre,
    required this.unidadesSalidas,
    required this.existencia,
    this.rotacion,
    required this.sinExistencia,
  });

  factory RotacionRefaccion.desdeJson(Map<String, dynamic> json) => RotacionRefaccion(
        parteId: _entero(json['parteId']),
        codigo: json['codigo'] as String? ?? '',
        nombre: json['nombre'] as String? ?? '',
        unidadesSalidas: _entero(json['unidadesSalidas']),
        existencia: _entero(json['existencia']),
        rotacion: (json['rotacion'] as num?)?.toDouble(),
        sinExistencia: json['sinExistencia'] as bool? ?? false,
      );

  /// `2.00`; con existencia 0 no hay rotación y se muestra «sin existencia».
  String get etiquetaRotacion => rotacion == null ? 'sin existencia' : rotacion!.toStringAsFixed(2);
}

/// Reporte de rotación (`GET /api/reports/rotation`), paginado.
class ReporteRotacion {
  final String desde;
  final String hasta;
  final int pagina;
  final int totalPaginas;
  final int total;
  final List<RotacionRefaccion> datos;

  const ReporteRotacion({
    required this.desde,
    required this.hasta,
    required this.pagina,
    required this.totalPaginas,
    required this.total,
    required this.datos,
  });

  factory ReporteRotacion.desdeJson(Map<String, dynamic> json) {
    final rango = json['rango'] as Map<String, dynamic>? ?? const {};
    return ReporteRotacion(
      desde: rango['desde'] as String? ?? '',
      hasta: rango['hasta'] as String? ?? '',
      pagina: _entero(json['pagina']),
      totalPaginas: (json['totalPaginas'] as num? ?? 1).toInt(),
      total: _entero(json['total']),
      datos: (json['datos'] as List<dynamic>? ?? [])
          .map((dato) => RotacionRefaccion.desdeJson(dato as Map<String, dynamic>))
          .toList(),
    );
  }

  bool get vacio => total == 0 && datos.isEmpty;
  bool get hayAnterior => pagina > 1;
  bool get haySiguiente => pagina < totalPaginas;
  String get etiquetaTotal => _plural(total, 'refacción', 'refacciones');
  String get rangoTexto => 'Del ${fechaLegible(desde)} al ${fechaLegible(hasta)}';
}
