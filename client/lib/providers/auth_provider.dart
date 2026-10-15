/// Estado de la sesión (T028, US1; research D12 y D13).
///
/// Maneja el login con el campo único de identificación (usuario o correo,
/// RN-16), la expiración de la sesión (401 → volver al login) y el logout.
library;

import 'package:flutter/foundation.dart';

import '../models/user.dart';
import '../services/api_client.dart';

class AuthProvider extends ChangeNotifier {
  final ApiClient api;

  AuthProvider(this.api) {
    api.onSesionExpirada = cerrarSesionPorExpiracion;
  }

  Usuario? usuario;
  bool cargando = false;
  String? error;
  bool sesionExpirada = false;

  /// Callback de aplicación para navegar al login cuando la sesión expira.
  void Function()? alExpirar;

  bool get autenticado => usuario != null;
  bool get esAdmin => usuario?.role == 'ADMIN';
  bool get puedeGestionarClientes =>
      usuario?.role == 'ADMIN' || usuario?.role == 'RECEPTIONIST';

  /// Crear órdenes y administrar citas/asignaciones: recepción y administración.
  bool get puedeGestionarOrdenes => puedeGestionarClientes;

  /// Es mecánico: su visibilidad de órdenes está limitada a las suyas (RN-15).
  bool get esMecanico => usuario?.role == 'MECHANIC';

  /// Inicia sesión con usuario o correo en el mismo campo (RN-16).
  Future<bool> login(String identificacion, String contrasena) async {
    cargando = true;
    error = null;
    sesionExpirada = false;
    notifyListeners();

    try {
      final respuesta = await api.post('/auth/login', {
        'identificacion': identificacion.trim(),
        'contrasena': contrasena,
      });
      api.token = respuesta['token'] as String;
      usuario = Usuario.desdeJson(respuesta['usuario'] as Map<String, dynamic>);
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      return false;
    } catch (_) {
      error = 'No se pudo conectar con el servidor; verifique que esté en ejecución.';
      return false;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  /// Cambia la contraseña de la cuenta propia (FR-011).
  Future<bool> cambiarContrasena(String actual, String nueva) async {
    try {
      await api.post('/auth/change-password', {
        'contrasenaActual': actual,
        'contrasenaNueva': nueva,
      });
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  void cerrarSesion() {
    api.token = null;
    usuario = null;
    error = null;
    sesionExpirada = false;
    notifyListeners();
  }

  /// El servidor respondió 401: la sesión expiró o el usuario fue desactivado.
  void cerrarSesionPorExpiracion() {
    api.token = null;
    usuario = null;
    error = null;
    sesionExpirada = true;
    notifyListeners();
    alExpirar?.call();
  }
}
