/// Modelo del panel de control (Sprint 4, US4; FR-014 a FR-016).
///
/// Resumen de solo lectura para administración: todas las cifras se derivan
/// al vuelo en el servidor (research D7) y el dinero cobrado solo suma
/// pagos COMPLETED (FR-007 del spec, SC-007).
library;

class ResumenPanel {
  /// Órdenes activas agrupadas por estado (los estados vacíos vienen en 0).
  final Map<String, int> ordenes;
  final int citasHoy;
  final int citasProximas;
  final int mantenimientosVencidos;
  final int mantenimientosProximos;

  /// Refacciones con stock <= mínimo.
  final int stockBajo;

  /// Dinero cobrado hoy y acumulado (solo pagos COMPLETED).
  final double cobrosHoy;
  final double cobrosTotal;

  /// Cobros digitales PENDING vigentes (los viejos ya caducaron).
  final int pendientesDigitales;

  const ResumenPanel({
    required this.ordenes,
    required this.citasHoy,
    required this.citasProximas,
    required this.mantenimientosVencidos,
    required this.mantenimientosProximos,
    required this.stockBajo,
    required this.cobrosHoy,
    required this.cobrosTotal,
    required this.pendientesDigitales,
  });

  factory ResumenPanel.desdeJson(Map<String, dynamic> json) {
    final ordenes = json['ordenes'] as Map<String, dynamic>? ?? {};
    final citas = json['citas'] as Map<String, dynamic>? ?? {};
    final mantenimientos = json['mantenimientos'] as Map<String, dynamic>? ?? {};
    final inventario = json['inventario'] as Map<String, dynamic>? ?? {};
    final cobros = json['cobros'] as Map<String, dynamic>? ?? {};

    return ResumenPanel(
      ordenes: ordenes.map(
        (clave, valor) => MapEntry(clave, (valor as num?)?.toInt() ?? 0),
      ),
      citasHoy: (citas['hoy'] as num?)?.toInt() ?? 0,
      citasProximas: (citas['proximas'] as num?)?.toInt() ?? 0,
      mantenimientosVencidos: (mantenimientos['vencidos'] as num?)?.toInt() ?? 0,
      mantenimientosProximos: (mantenimientos['proximos'] as num?)?.toInt() ?? 0,
      stockBajo: (inventario['stockBajo'] as num?)?.toInt() ?? 0,
      cobrosHoy: (cobros['hoy'] as num?)?.toDouble() ?? 0,
      cobrosTotal: (cobros['total'] as num?)?.toDouble() ?? 0,
      pendientesDigitales: (cobros['pendientesDigitales'] as num?)?.toInt() ?? 0,
    );
  }

  /// Cantidad de órdenes en curso (excluye canceladas y entregadas).
  int get ordenesEnCurso => [
        ordenes['RECIBIDO'] ?? 0,
        ordenes['DIAGNOSTICO'] ?? 0,
        ordenes['EN_REPARACION'] ?? 0,
        ordenes['ESPERANDO_REFACCION'] ?? 0,
        ordenes['TERMINADO'] ?? 0,
      ].fold(0, (suma, valor) => suma + valor);
}
