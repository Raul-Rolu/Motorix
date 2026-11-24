/// Estado de la sesión (T028, US1; research D12 y D13).
///
/// Maneja el login con el campo único de identificación (usuario o correo,
/// RN-16), la expiración de la sesión (401 → volver al login) y el logout.
///
/// 008 (FR-016): guarda los minutos de inactividad que informa el servidor,
/// distingue el cierre por inactividad del cierre por expiración y renueva el
/// token (`POST /auth/renew`); QUIÉN decide cuándo renovar o cerrar es el
/// `SessionProvider`.
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

  /// true si la sesión se cerró por inactividad del usuario (008, FR-016); el
  /// login lo muestra como «Tu sesión se cerró por inactividad.».
  bool cierrePorInactividad = false;

  /// Minutos de inactividad vigentes (el ajuste del servidor; 30 por omisión).
  int inactividadMinutos = 30;

  bool _renovando = false;

  /// Lo fija el `SessionProvider`: dice si, al recibir un 401, el usuario ya había
  /// cumplido (casi) la inactividad. El token vence más o menos a la vez que la
  /// inactividad, así que un sondeo en segundo plano puede recibir el 401 antes de
  /// que la revisión de la sesión cierre; en ese caso el motivo real es la
  /// inactividad (008, FR-016).
  bool Function()? inactividadCumplida;

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
    cierrePorInactividad = false;
    notifyListeners();

    try {
      final respuesta = await api.post('/auth/login', {
        'identificacion': identificacion.trim(),
        'contrasena': contrasena,
      });
      api.token = respuesta['token'] as String;
      inactividadMinutos = (respuesta['inactividadMinutos'] as num?)?.toInt() ?? 30;
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

  /// Renueva el token con `POST /auth/renew` (008, FR-016). Nunca hay dos
  /// renovaciones en paralelo. Devuelve true si se obtuvo un token nuevo; ante un
  /// 401 el cliente HTTP ya cierra la sesión como expirada, y ante otro error (red,
  /// 500) la sesión sigue y se reintenta más adelante.
  Future<bool> renovarToken() async {
    if (_renovando || usuario == null) return false;
    _renovando = true;
    final idUsuario = usuario?.id;
    try {
      final respuesta = await api.post('/auth/renew', {});
      // Si mientras tanto cambió la sesión, el token nuevo ya no corresponde.
      if (usuario?.id != idUsuario || usuario == null) return false;
      api.token = respuesta['token'] as String;
      inactividadMinutos =
          (respuesta['inactividadMinutos'] as num?)?.toInt() ?? inactividadMinutos;
      return true;
    } catch (_) {
      return false;
    } finally {
      _renovando = false;
    }
  }

  void cerrarSesion() {
    api.token = null;
    usuario = null;
    error = null;
    sesionExpirada = false;
    cierrePorInactividad = false;
    notifyListeners();
  }

  /// La sesión se cerró porque el usuario estuvo inactivo (008, FR-016).
  void cerrarSesionPorInactividad() {
    if (usuario == null) return;
    api.token = null;
    usuario = null;
    error = null;
    sesionExpirada = false;
    cierrePorInactividad = true;
    notifyListeners();
    alExpirar?.call();
  }

  /// El servidor respondió 401: la sesión expiró o el usuario fue desactivado.
  void cerrarSesionPorExpiracion() {
    // Otra petición en vuelo ya cerró la sesión por inactividad: se conserva ese motivo.
    if (usuario == null && cierrePorInactividad) return;
    // El 401 llegó porque el token venció junto con la inactividad: no es una
    // expiración inesperada sino el cierre por inactividad.
    if (usuario != null && (inactividadCumplida?.call() ?? false)) {
      cerrarSesionPorInactividad();
      return;
    }
    api.token = null;
    usuario = null;
    error = null;
    sesionExpirada = true;
    cierrePorInactividad = false;
    notifyListeners();
    alExpirar?.call();
  }
}
