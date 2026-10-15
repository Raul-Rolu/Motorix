/// Estado del módulo de vehículos (T060, US5/US6).
library;

import 'package:flutter/foundation.dart';

import '../models/vehicle.dart';
import '../services/api_client.dart';

class VehiclesProvider extends ChangeNotifier {
  final ApiClient api;

  VehiclesProvider(this.api);

  List<Vehiculo> vehiculos = [];
  bool cargando = false;
  String? error;

  Future<void> recargar() async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final respuesta = await api.get('/vehicles');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      vehiculos =
          datos.map((d) => Vehiculo.desdeJson(d as Map<String, dynamic>)).toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  Future<bool> crear({
    required int clientId,
    required String plates,
    required String brand,
    required String model,
    required int year,
    String? color,
    String? notes,
  }) async {
    try {
      await api.post('/vehicles', {
        'clientId': clientId,
        'plates': plates,
        'brand': brand,
        'model': model,
        'year': year,
        if (color != null && color.isNotEmpty) 'color': color,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Edita datos y/o reasocia el propietario (FR-009, US6).
  Future<bool> editar({
    required int id,
    required int clientId,
    required String plates,
    required String brand,
    required String model,
    required int year,
    String? color,
    String? notes,
  }) async {
    try {
      await api.put('/vehicles/$id', {
        'clientId': clientId,
        'plates': plates,
        'brand': brand,
        'model': model,
        'year': year,
        if (color != null && color.isNotEmpty) 'color': color,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
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
