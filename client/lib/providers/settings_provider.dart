/// Estado de la configuración del taller (008-configuracion-seguridad-reportes,
/// T022; FR-002, CA-1).
///
/// Carga los ajustes y guarda los datos del taller (solo ADMIN: el servidor
/// responde 403 a los demás roles y aquí se muestra un mensaje de permisos).
/// Como es un proveedor global, escucha la sesión y descarta su estado al
/// cerrar sesión o al entrar otro usuario.
library;

import 'package:flutter/foundation.dart';

import '../models/app_settings.dart';
import '../services/api_client.dart';
import 'auth_provider.dart';

/// Resultado de guardar: éxito o el mensaje a mostrar.
class ResultadoAjustes {
  final bool exito;
  final String mensaje;

  const ResultadoAjustes(this.exito, this.mensaje);
}

class SettingsProvider extends ChangeNotifier {
  final ApiClient api;
  final AuthProvider auth;

  SettingsProvider(this.api, this.auth) {
    _usuarioId = auth.usuario?.id;
    auth.addListener(_alCambiarSesion);
  }

  AppSettings? ajustes;
  bool cargando = false;
  String? error;

  /// true si el servidor respondió 403 (el rol no puede ver la configuración).
  bool sinPermiso = false;

  int? _usuarioId;
  int _generacion = 0;
  bool _liberado = false;

  static const String _mensajeError = 'No se pudo cargar la configuración.';
  static const String _mensajeSinPermiso = 'No tiene permisos para ver la configuración.';

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    // Se descarta lo del usuario anterior, incluida cualquier consulta en vuelo.
    _generacion++;
    ajustes = null;
    cargando = false;
    error = null;
    sinPermiso = false;
    notifyListeners();
  }

  /// Carga (o recarga) los ajustes vigentes.
  Future<void> cargar() async {
    if (_liberado || auth.usuario == null || cargando) return;

    final generacion = _generacion;
    cargando = true;
    error = null;
    sinPermiso = false;
    notifyListeners();

    try {
      final respuesta = await api.get('/settings');
      if (generacion != _generacion) return;
      ajustes = AppSettings.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generacion) return;
      if (excepcion.status == 401) {
        error = null; // la sesión vencida la gestiona el AuthProvider
      } else if (excepcion.status == 403) {
        sinPermiso = true;
        error = _mensajeSinPermiso;
      } else {
        error = _mensajeError;
      }
    } catch (_) {
      if (generacion != _generacion) return;
      error = _mensajeError;
    } finally {
      if (generacion == _generacion && !_liberado) {
        cargando = false;
        notifyListeners();
      }
    }
  }

  /// Guarda los datos del taller. El servidor valida y rechaza todo ante un error.
  Future<ResultadoAjustes> guardarTaller({
    required String nombre,
    required String direccion,
    required String telefono,
  }) async {
    final generacion = _generacion;
    try {
      final respuesta = await api.put('/settings', {
        'taller': {
          'nombre': nombre.trim(),
          'direccion': direccion.trim(),
          'telefono': telefono.trim(),
        },
      });
      if (generacion == _generacion) {
        ajustes = AppSettings.desdeJson(respuesta);
        notifyListeners();
      }
      return const ResultadoAjustes(true, 'Datos del taller guardados.');
    } on ExcepcionApi catch (excepcion) {
      if (excepcion.status == 403) {
        return const ResultadoAjustes(false, _mensajeSinPermiso);
      }
      return ResultadoAjustes(false, excepcion.mensaje);
    } catch (_) {
      return const ResultadoAjustes(false, 'No se pudo guardar la configuración.');
    }
  }

  @override
  void dispose() {
    _liberado = true;
    auth.removeListener(_alCambiarSesion);
    super.dispose();
  }
}
