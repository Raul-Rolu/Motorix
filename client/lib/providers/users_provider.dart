/// Estado de la gestión de usuarios (T037, US2).
library;

import 'package:flutter/foundation.dart';

import '../models/user.dart';
import '../services/api_client.dart';

class UsersProvider extends ChangeNotifier {
  final ApiClient api;

  UsersProvider(this.api);

  List<Usuario> usuarios = [];
  bool cargando = false;
  String? error;

  Future<void> recargar() async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final respuesta = await api.get('/users');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      usuarios = datos
          .map((d) => Usuario.desdeJson(d as Map<String, dynamic>))
          .toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  Future<bool> crear({
    required String username,
    required String email,
    required String password,
    required String fullName,
    required String role,
  }) async {
    try {
      await api.post('/users', {
        'username': username,
        'email': email,
        'password': password,
        'fullName': fullName,
        'role': role,
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
    required String username,
    required String email,
    required String fullName,
    required String role,
  }) async {
    try {
      await api.put('/users/$id', {
        'username': username,
        'email': email,
        'fullName': fullName,
        'role': role,
      });
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  Future<bool> cambiarEstado(int id, bool activo) async {
    try {
      await api.patch('/users/$id/status', {'active': activo});
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }
}
