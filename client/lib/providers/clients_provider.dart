/// Estado del módulo de clientes (T047, US3/US4/US6).
library;

import 'package:flutter/foundation.dart';

import '../models/client.dart';
import '../services/api_client.dart';

class ClientsProvider extends ChangeNotifier {
  final ApiClient api;

  ClientsProvider(this.api);

  List<Cliente> clientes = [];
  bool cargando = false;
  String? error;

  Future<void> recargar() async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final respuesta = await api.get('/clients');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      clientes =
          datos.map((d) => Cliente.desdeJson(d as Map<String, dynamic>)).toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  /// Clientes activos, para los selectores de propietario (FR-015).
  List<Cliente> get activos => clientes.where((c) => c.active).toList();

  Future<bool> crear({
    required String fullName,
    required String phone,
    String? email,
    String? notes,
  }) async {
    try {
      await api.post('/clients', {
        'fullName': fullName,
        'phone': phone,
        if (email != null && email.isNotEmpty) 'email': email,
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

  Future<bool> editar({
    required int id,
    required String fullName,
    required String phone,
    String? email,
    String? notes,
  }) async {
    try {
      await api.put('/clients/$id', {
        'fullName': fullName,
        'phone': phone,
        if (email != null && email.isNotEmpty) 'email': email,
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

  /// Desactivar o reactivar sin borrado físico (FR-015).
  Future<bool> cambiarEstado(int id, bool activo) async {
    try {
      await api.patch('/clients/$id/status', {'active': activo});
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Detalle del cliente con sus vehículos (FR-007, US6).
  Future<Cliente?> obtenerDetalle(int id) async {
    try {
      final json = await api.get('/clients/$id');
      return Cliente.desdeJson(json);
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return null;
    }
  }
}
