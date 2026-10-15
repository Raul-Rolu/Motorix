/// Estado del panel de control (Sprint 4, US4; FR-014 a FR-016).
///
/// Carga el resumen del taller para administración; la vista permite la
/// recarga manual (decisión Q3 del clarify: panel básico con refresco).
library;

import 'package:flutter/foundation.dart';

import '../models/dashboard.dart';
import '../services/api_client.dart';

class DashboardProvider extends ChangeNotifier {
  final ApiClient api;

  DashboardProvider(this.api);

  ResumenPanel? resumen;
  bool cargando = false;
  String? error;
  String? codigoError;

  /// Carga (o recarga) los indicadores del panel.
  Future<void> cargar() async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final respuesta = await api.get('/dashboard');
      resumen = ResumenPanel.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      resumen = null;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }
}
