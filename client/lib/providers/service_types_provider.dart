/// Estado del catálogo de tipos de servicio (008-configuracion-seguridad-reportes,
/// T040; FR-006, FR-007, CA-4).
///
/// ADMIN administra el catálogo (alta, edición y desactivación; sin borrado) y ve
/// también los inactivos; los demás roles solo consultan los tipos activos para
/// elegirlos en una línea de servicio. Como es un proveedor global, escucha la
/// sesión y descarta su estado al cerrar sesión o al entrar otro usuario.
library;

import 'package:flutter/foundation.dart';

import '../models/service_type.dart';
import '../services/api_client.dart';
import 'auth_provider.dart';

/// Resultado de guardar o cambiar el estado: éxito o el mensaje a mostrar.
class ResultadoTipoServicio {
  final bool exito;
  final String mensaje;

  const ResultadoTipoServicio(this.exito, this.mensaje);
}

class ServiceTypesProvider extends ChangeNotifier {
  final ApiClient api;
  final AuthProvider auth;

  ServiceTypesProvider(this.api, this.auth) {
    _usuarioId = auth.usuario?.id;
    auth.addListener(_alCambiarSesion);
  }

  List<TipoServicio> tipos = const [];
  bool cargando = false;
  bool cargado = false;
  String? error;

  int? _usuarioId;
  int _generacion = 0;
  bool _liberado = false;

  static const String _mensajeError = 'No se pudo cargar el catálogo de servicios.';

  /// Tipos que se pueden elegir en una línea nueva.
  List<TipoServicio> get activos => tipos.where((tipo) => tipo.activo).toList();

  /// Tipo por id (para mostrar su nombre en las líneas de una orden); null si no se conoce.
  TipoServicio? porId(int? id) {
    for (final tipo in tipos) {
      if (tipo.id == id) return tipo;
    }
    return null;
  }

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    _generacion++;
    tipos = const [];
    cargando = false;
    cargado = false;
    error = null;
    notifyListeners();
  }

  /// Carga (o recarga) el catálogo: ADMIN con inactivos, el resto solo activos.
  Future<void> cargar() async {
    if (_liberado || auth.usuario == null || cargando) return;

    final generacion = _generacion;
    cargando = true;
    error = null;
    notifyListeners();

    try {
      final sufijo = auth.esAdmin ? '?incluirInactivos=true' : '';
      final respuesta = await api.get('/service-types$sufijo');
      if (generacion != _generacion) return;
      tipos = (respuesta['datos'] as List<dynamic>? ?? [])
          .map((dato) => TipoServicio.desdeJson(dato as Map<String, dynamic>))
          .toList();
      cargado = true;
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generacion) return;
      // 401: la sesión vencida la gestiona el AuthProvider.
      error = excepcion.status == 401 ? null : _mensajeError;
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

  Map<String, dynamic> _cuerpo(String nombre, int? dias, int? km) => {
        'nombre': nombre.trim(),
        'intervaloDias': dias,
        'intervaloKm': km,
      };

  /// Crea un tipo nuevo (solo ADMIN; el servidor valida nombre único e intervalos).
  Future<ResultadoTipoServicio> crear({
    required String nombre,
    int? intervaloDias,
    int? intervaloKm,
  }) =>
      _guardar(() => api.post('/service-types', _cuerpo(nombre, intervaloDias, intervaloKm)));

  /// Edita un tipo; los cambios aplican a propuestas futuras, no a líneas ya registradas.
  Future<ResultadoTipoServicio> editar(
    int id, {
    required String nombre,
    int? intervaloDias,
    int? intervaloKm,
  }) =>
      _guardar(() => api.put('/service-types/$id', _cuerpo(nombre, intervaloDias, intervaloKm)));

  Future<ResultadoTipoServicio> _guardar(Future<Map<String, dynamic>> Function() peticion) async {
    try {
      await peticion();
      await _recargarSilencioso();
      return const ResultadoTipoServicio(true, 'Tipo de servicio guardado.');
    } on ExcepcionApi catch (excepcion) {
      return ResultadoTipoServicio(false, excepcion.mensaje);
    } catch (_) {
      return const ResultadoTipoServicio(false, 'No se pudo guardar el tipo de servicio.');
    }
  }

  /// Desactiva o reactiva un tipo (nunca se borra).
  Future<ResultadoTipoServicio> cambiarEstado(int id, {required bool activo}) async {
    try {
      await api.patch('/service-types/$id/status', {'activo': activo});
      await _recargarSilencioso();
      return ResultadoTipoServicio(true, activo ? 'Tipo de servicio reactivado.' : 'Tipo de servicio desactivado.');
    } on ExcepcionApi catch (excepcion) {
      return ResultadoTipoServicio(false, excepcion.mensaje);
    } catch (_) {
      return const ResultadoTipoServicio(false, 'No se pudo cambiar el estado del tipo de servicio.');
    }
  }

  /// Vuelve a leer la lista sin mostrar el indicador de carga.
  Future<void> _recargarSilencioso() async {
    final generacion = _generacion;
    try {
      final sufijo = auth.esAdmin ? '?incluirInactivos=true' : '';
      final respuesta = await api.get('/service-types$sufijo');
      if (generacion != _generacion || _liberado) return;
      tipos = (respuesta['datos'] as List<dynamic>? ?? [])
          .map((dato) => TipoServicio.desdeJson(dato as Map<String, dynamic>))
          .toList();
      cargado = true;
      notifyListeners();
    } catch (_) {
      // La acción ya se realizó; si falla la recarga se mantiene la lista previa.
    }
  }

  @override
  void dispose() {
    _liberado = true;
    auth.removeListener(_alCambiarSesion);
    super.dispose();
  }
}
