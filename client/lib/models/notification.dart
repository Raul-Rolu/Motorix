/// Modelos del centro de notificaciones (007-notificaciones-internas, T018).
///
/// Reflejan la respuesta de `GET /api/notifications` (contracts/api-rest.md):
/// los avisos se calculan en el servidor al consultar; aquí solo se leen y se
/// agrupan para mostrarlos.
library;

/// Grupos de aviso en su orden de presentación en el panel.
///
/// El orden de los valores es el orden visual: primero lo más urgente.
enum GrupoAviso {
  mantenimientoVencido('MANTENIMIENTO_VENCIDO', 'Mantenimientos vencidos'),
  ordenDetenida('ORDEN_DETENIDA', 'Órdenes detenidas'),
  stock('STOCK', 'Stock bajo o agotado'),
  mantenimientoProximo('MANTENIMIENTO_PROXIMO', 'Mantenimientos próximos'),
  citaDelDia('CITA_DEL_DIA', 'Citas de hoy');

  /// Código que envía el servidor en `grupo`.
  final String codigo;

  /// Título del grupo en el panel.
  final String titulo;

  const GrupoAviso(this.codigo, this.titulo);

  /// Grupo para un código del servidor, o null si es desconocido.
  static GrupoAviso? desdeCodigo(String? codigo) {
    for (final grupo in GrupoAviso.values) {
      if (grupo.codigo == codigo) return grupo;
    }
    return null;
  }
}

/// Pantalla a la que lleva un aviso: orden, vehículo, inventario o citas.
class DestinoAviso {
  /// `ORDEN | VEHICULO | INVENTARIO | CITAS`.
  final String pantalla;
  final int? id;

  const DestinoAviso({required this.pantalla, this.id});

  factory DestinoAviso.desdeJson(Map<String, dynamic>? json) => DestinoAviso(
        pantalla: json?['pantalla'] as String? ?? '',
        id: (json?['id'] as num?)?.toInt(),
      );
}

/// Un aviso derivado de datos reales; se identifica por su `clave`.
class Aviso {
  /// Identidad del aviso: `TIPO:ID:ESTADO` (cambia si el aviso empeora).
  final String clave;
  final GrupoAviso grupo;

  /// Estado dentro del tipo: `VENCIDO`, `PROXIMO`, `HOY`, `BAJO`, `AGOTADO`, `DETENIDA`.
  final String estado;
  final String titulo;
  final String detalle;
  final bool leido;
  final DestinoAviso destino;

  const Aviso({
    required this.clave,
    required this.grupo,
    required this.estado,
    required this.titulo,
    required this.detalle,
    required this.leido,
    required this.destino,
  });

  /// Aviso del servidor; null si su grupo es desconocido (se ignora).
  static Aviso? desdeJson(Map<String, dynamic> json) {
    final grupo = GrupoAviso.desdeCodigo(json['grupo'] as String?);
    if (grupo == null) return null;
    return Aviso(
      clave: json['clave'] as String? ?? '',
      grupo: grupo,
      estado: json['estado'] as String? ?? '',
      titulo: json['titulo'] as String? ?? '',
      detalle: json['detalle'] as String? ?? '',
      leido: json['leido'] as bool? ?? false,
      destino: DestinoAviso.desdeJson(json['destino'] as Map<String, dynamic>?),
    );
  }

  Aviso copiarCon({bool? leido}) => Aviso(
        clave: clave,
        grupo: grupo,
        estado: estado,
        titulo: titulo,
        detalle: detalle,
        leido: leido ?? this.leido,
        destino: destino,
      );
}

/// Respuesta completa de `GET /api/notifications`.
class ResumenAvisos {
  final int total;
  final int noLeidos;
  final List<Aviso> avisos;

  const ResumenAvisos({
    required this.total,
    required this.noLeidos,
    required this.avisos,
  });

  factory ResumenAvisos.desdeJson(Map<String, dynamic> json) {
    final avisos = (json['datos'] as List<dynamic>? ?? [])
        .map((dato) => Aviso.desdeJson(dato as Map<String, dynamic>))
        .whereType<Aviso>()
        .toList();
    return ResumenAvisos(
      total: (json['total'] as num?)?.toInt() ?? avisos.length,
      noLeidos: (json['noLeidos'] as num?)?.toInt() ??
          avisos.where((aviso) => !aviso.leido).length,
      avisos: avisos,
    );
  }
}
