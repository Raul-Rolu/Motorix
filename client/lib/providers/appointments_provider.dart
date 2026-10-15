/// Estado del módulo de citas (T041, US1; FR-001 a FR-003).
library;

import 'package:flutter/foundation.dart';

import '../models/appointment.dart';
import '../services/api_client.dart';

class AppointmentsProvider extends ChangeNotifier {
  final ApiClient api;

  AppointmentsProvider(this.api);

  List<Cita> citas = [];
  bool cargando = false;
  String? error;

  /// Filtros activos del listado (?fecha= y ?texto=).
  String? fechaFiltro;
  String textoFiltro = '';

  Future<void> recargar() async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final parametros = <String>[
        if (fechaFiltro != null && fechaFiltro!.isNotEmpty)
          'fecha=${Uri.encodeComponent(fechaFiltro!)}',
        if (textoFiltro.isNotEmpty) 'texto=${Uri.encodeComponent(textoFiltro)}',
      ];
      final sufijo = parametros.isEmpty ? '' : '?${parametros.join('&')}';
      final respuesta = await api.get('/appointments$sufijo');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      citas = datos.map((d) => Cita.desdeJson(d as Map<String, dynamic>)).toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  Future<bool> crear({
    required int clientId,
    required int vehicleId,
    required String appointmentDate,
    required String appointmentTime,
    required String reason,
  }) async {
    error = null;
    try {
      await api.post('/appointments', {
        'clientId': clientId,
        'vehicleId': vehicleId,
        'appointmentDate': appointmentDate,
        'appointmentTime': appointmentTime,
        'reason': reason,
      });
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  Future<bool> editar({
    required int id,
    required int clientId,
    required int vehicleId,
    required String appointmentDate,
    required String appointmentTime,
    required String reason,
  }) async {
    error = null;
    try {
      await api.put('/appointments/$id', {
        'clientId': clientId,
        'vehicleId': vehicleId,
        'appointmentDate': appointmentDate,
        'appointmentTime': appointmentTime,
        'reason': reason,
      });
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Marca la cita como COMPLETADA (FR-003).
  Future<bool> completar(int id) async {
    error = null;
    try {
      await api.patch('/appointments/$id/status', {'status': 'COMPLETADA'});
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Cancela la cita con motivo obligatorio (FR-003, FR-013).
  Future<bool> cancelar(int id, String motivo) async {
    error = null;
    try {
      await api.patch('/appointments/$id/status', {
        'status': 'CANCELADA',
        'cancellationReason': motivo,
      });
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }
}
