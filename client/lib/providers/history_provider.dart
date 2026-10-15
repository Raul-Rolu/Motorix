/// Estado del historial de servicios del vehículo (Sprint 3, US1/US2).
///
/// Consulta el historial derivado de las órdenes terminadas (RN-10) y expone
/// el kilometraje actual del vehículo para programar mantenimientos (RN-11).
library;

import 'package:flutter/foundation.dart';

import '../models/vehicle_history.dart';
import '../services/api_client.dart';

class HistoryProvider extends ChangeNotifier {
  final ApiClient api;

  HistoryProvider(this.api);

  HistorialVehiculo? historial;
  bool cargando = false;
  String? error;

  /// Último vehículo consultado (para recargar tras cerrar una orden).
  int? _vehiculoId;

  Future<void> cargar(int vehicleId) async {
    _vehiculoId = vehicleId;
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final respuesta = await api.get('/vehicles/$vehicleId/history');
      historial = HistorialVehiculo.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      historial = null;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  /// Vuelve a consultar el último vehículo cargado.
  Future<void> recargar() async {
    final vehicleId = _vehiculoId;
    if (vehicleId != null) {
      await cargar(vehicleId);
    }
  }

  void limpiar() {
    historial = null;
    error = null;
    _vehiculoId = null;
    notifyListeners();
  }
}
