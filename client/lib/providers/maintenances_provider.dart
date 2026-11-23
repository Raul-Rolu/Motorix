/// Estado del módulo de mantenimientos (Sprint 3, US3/US4).
///
/// Registro con umbrales configurables (RN-11/RN-12), cumplimiento manual
/// (aclaración Q1) y cancelación solo de administración con motivo (Q4).
library;

import 'package:flutter/foundation.dart';

import '../models/maintenance.dart';
import '../services/api_client.dart';

class MaintenancesProvider extends ChangeNotifier {
  final ApiClient api;

  MaintenancesProvider(this.api);

  List<Mantenimiento> mantenimientos = [];
  bool cargando = false;
  String? error;
  String? codigoError;

  /// Filtros activos del listado (US4).
  int? vehicleIdFiltro;
  String? estadoFiltro;

  Future<void> recargar() async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final parametros = <String>[
        if (vehicleIdFiltro != null) 'vehicleId=$vehicleIdFiltro',
        if (estadoFiltro != null && estadoFiltro!.isNotEmpty)
          'status=${Uri.encodeComponent(estadoFiltro!)}',
      ];
      final sufijo = parametros.isEmpty ? '' : '?${parametros.join('&')}';
      final respuesta = await api.get('/maintenances$sufijo');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      mantenimientos = datos
          .map((elemento) =>
              Mantenimiento.desdeJson(elemento as Map<String, dynamic>))
          .toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      mantenimientos = [];
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  /// Registra un mantenimiento nuevo (siempre PENDING).
  Future<Mantenimiento?> registrar({
    required int vehicleId,
    required String descripcion,
    String? targetDate,
    int? targetMileage,
  }) async {
    error = null;
    codigoError = null;
    try {
      final cuerpo = <String, dynamic>{
        'vehicleId': vehicleId,
        'descripcion': descripcion,
        if (targetDate != null && targetDate.isNotEmpty)
          'targetDate': targetDate,
        'targetMileage': ?targetMileage,
      };
      final respuesta = await api.post('/maintenances', cuerpo);
      await recargar();
      return Mantenimiento.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return null;
    }
  }

  /// Órdenes de un vehículo (008, FR-008): se buscan por placas y se filtran por
  /// vehículo; el mecánico solo recibe las suyas (visibilidad de RN-15).
  Future<List<OrdenDeVehiculo>> ordenesDelVehiculo(int vehicleId, String placas) async {
    final respuesta = await api.get('/orders?texto=${Uri.encodeComponent(placas)}');
    final datos = respuesta['datos'] as List<dynamic>? ?? [];
    return datos
        .cast<Map<String, dynamic>>()
        .where((orden) => orden['vehicleId'] == vehicleId)
        .map(OrdenDeVehiculo.desdeJson)
        .toList();
  }

  /// Propuesta del próximo mantenimiento desde una orden (008, FR-008, CA-5).
  /// Devuelve null si la orden no tiene servicios con tipo e intervalo. No crea
  /// nada: el usuario corrige y guarda con [registrar].
  Future<PropuestaMantenimiento?> proponerDesdeOrden(int orderId) async {
    final respuesta = await api.get('/maintenances/proposal?orderId=$orderId');
    final propuesta = respuesta['propuesta'];
    return propuesta is Map<String, dynamic> ? PropuestaMantenimiento.desdeJson(propuesta) : null;
  }

  /// Cumplimiento manual (aclaración Q1): PENDING → COMPLETED.
  Future<bool> completar(int id) async {
    return _accion('/maintenances/$id/complete');
  }

  /// Cancelación (aclaración Q4): solo administración, con motivo obligatorio.
  Future<bool> cancelar(int id, String motivo) async {
    return _accion('/maintenances/$id/cancel', cuerpo: {'reason': motivo});
  }

  Future<bool> _accion(String ruta, {Map<String, dynamic>? cuerpo}) async {
    error = null;
    codigoError = null;
    try {
      if (cuerpo != null) {
        await api.post(ruta, cuerpo);
      } else {
        await api.patch(ruta, const {});
      }
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return false;
    }
  }

  void limpiarFiltros() {
    vehicleIdFiltro = null;
    estadoFiltro = null;
  }
}
