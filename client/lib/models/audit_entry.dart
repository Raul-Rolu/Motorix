/// Entrada de la bitácora de acciones sensibles
/// (008-configuracion-seguridad-reportes, T074; FR-014, CA-20).
///
/// Refleja `GET /api/audit-log` (contracts/api-rest.md). La bitácora es de solo
/// lectura: el cliente nunca edita ni borra entradas.
library;

/// Nombre en español de cada acción del catálogo.
const Map<String, String> kEtiquetasAccionBitacora = {
  'LOGIN_FAILED': 'Inicio de sesión fallido',
  'USER_CREATED': 'Usuario creado',
  'USER_DEACTIVATED': 'Usuario desactivado',
  'USER_REACTIVATED': 'Usuario reactivado',
  'USER_ROLE_CHANGED': 'Cambio de rol',
  'SETTINGS_UPDATED': 'Configuración modificada',
  'PART_SALE_PRICE_CHANGED': 'Cambio de precio de venta',
  'PART_PURCHASE_PRICE_CHANGED': 'Cambio de precio de compra',
  'TERMS_PUBLISHED': 'Términos publicados',
};

class EntradaBitacora {
  final int id;
  final DateTime fecha;

  /// Cuenta que realizó la acción; null en un inicio de sesión fallido de una
  /// cuenta que no existe.
  final int? usuarioId;
  final String? usuarioNombre;
  final String accion;
  final String entidad;
  final int? entidadId;
  final String? detalle;

  const EntradaBitacora({
    required this.id,
    required this.fecha,
    required this.accion,
    required this.entidad,
    this.usuarioId,
    this.usuarioNombre,
    this.entidadId,
    this.detalle,
  });

  factory EntradaBitacora.desdeJson(Map<String, dynamic> json) {
    final usuario = json['usuario'] as Map<String, dynamic>?;
    return EntradaBitacora(
      id: json['id'] as int? ?? 0,
      fecha: DateTime.tryParse(json['fecha'] as String? ?? '')?.toLocal() ?? DateTime.fromMillisecondsSinceEpoch(0),
      usuarioId: (usuario?['id'] as num?)?.toInt(),
      usuarioNombre: usuario?['nombre'] as String?,
      accion: json['accion'] as String? ?? '',
      entidad: json['entidad'] as String? ?? '',
      entidadId: (json['entidadId'] as num?)?.toInt(),
      detalle: json['detalle'] as String?,
    );
  }

  /// Acción en español (si no está en el catálogo se muestra el código).
  String get etiquetaAccion => kEtiquetasAccionBitacora[accion] ?? accion;

  /// Fecha local legible: `20/11/2026 10:15`.
  String get fechaTexto {
    String dos(int n) => n.toString().padLeft(2, '0');
    return '${dos(fecha.day)}/${dos(fecha.month)}/${fecha.year} ${dos(fecha.hour)}:${dos(fecha.minute)}';
  }
}

/// Usuario que se ofrece en el filtro de la bitácora.
class UsuarioFiltroBitacora {
  final int id;
  final String nombre;

  const UsuarioFiltroBitacora({required this.id, required this.nombre});
}
