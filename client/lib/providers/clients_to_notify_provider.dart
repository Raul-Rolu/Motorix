/// Estado de «Clientes por avisar» (007-notificaciones-internas, T065; FR-014,
/// FR-015, CA-10, CA-11).
///
/// Carga los hechos pendientes de avisar a un cliente y registra el aviso
/// (quién, cuándo y una nota opcional). El sistema no envía nada al cliente:
/// la persona de recepción llama o avisa en persona y aquí solo se registra.
/// Como es un proveedor global, escucha la sesión y descarta su lista al cerrar
/// sesión o al entrar otro usuario.
library;

import 'package:flutter/foundation.dart';

import '../models/notification.dart';
import '../services/api_client.dart';
import 'auth_provider.dart';

/// Resultado de registrar un aviso: éxito o el mensaje a mostrar.
class ResultadoAviso {
  final bool exito;
  final String mensaje;

  const ResultadoAviso(this.exito, this.mensaje);
}

class ClientsToNotifyProvider extends ChangeNotifier {
  final ApiClient api;
  final AuthProvider auth;

  ClientsToNotifyProvider(this.api, this.auth) {
    _usuarioId = auth.usuario?.id;
    auth.addListener(_alCambiarSesion);
  }

  List<ClientePorAvisar> hechos = const [];
  bool cargando = false;
  bool cargado = false;
  String? error;

  /// true si el servidor respondió 403 (el rol no puede ver la lista).
  bool sinPermiso = false;

  bool get vacio => cargado && hechos.isEmpty && error == null;

  int? _usuarioId;
  int _generacion = 0;
  bool _consultando = false;
  bool _liberado = false;

  static const String _mensajeError = 'No se pudo cargar la lista de clientes por avisar.';
  static const String _mensajeSinPermiso = 'No tiene permisos para ver los clientes por avisar.';

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    // Se descarta todo lo del usuario anterior, incluida cualquier consulta en vuelo.
    _generacion++;
    _consultando = false;
    hechos = const [];
    cargando = false;
    cargado = false;
    error = null;
    sinPermiso = false;
    notifyListeners();
  }

  /// Carga (o recarga) la lista; con `silencioso` no muestra el indicador de carga.
  Future<void> cargar({bool silencioso = false}) async {
    if (_liberado || auth.usuario == null || _consultando) return;

    final generacion = _generacion;
    _consultando = true;
    if (!silencioso) {
      cargando = true;
      error = null;
      sinPermiso = false;
      notifyListeners();
    }

    try {
      final respuesta = await api.get('/client-notices/pending');
      if (generacion != _generacion) return;
      hechos = (respuesta['datos'] as List<dynamic>? ?? [])
          .map((dato) => ClientePorAvisar.desdeJson(dato as Map<String, dynamic>))
          .toList();
      cargado = true;
      error = null;
      sinPermiso = false;
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
        _consultando = false;
        notifyListeners();
      }
    }
  }

  /// Registra que se avisó al cliente por este hecho. Si sale bien el cliente
  /// sale de la lista; si ya lo avisó otra persona (409) o el hecho ya no está
  /// pendiente, se informa y se recarga la lista.
  Future<ResultadoAviso> marcarAvisado(ClientePorAvisar hecho, {String? nota}) async {
    final generacion = _generacion;
    final texto = nota?.trim() ?? '';
    try {
      await api.post('/client-notices', {
        'tipo': hecho.tipo,
        'hechoId': hecho.hechoId,
        if (texto.isNotEmpty) 'nota': texto,
      });
      if (generacion == _generacion) {
        hechos = hechos.where((h) => h.clave != hecho.clave).toList();
        notifyListeners();
      }
      return const ResultadoAviso(true, 'Cliente marcado como avisado.');
    } on ExcepcionApi catch (excepcion) {
      if (excepcion.status == 409) {
        await cargar(silencioso: true);
        return ResultadoAviso(false, excepcion.mensaje);
      }
      return const ResultadoAviso(false, 'No se pudo registrar el aviso.');
    } catch (_) {
      return const ResultadoAviso(false, 'No se pudo registrar el aviso.');
    }
  }

  @override
  void dispose() {
    _liberado = true;
    _generacion++;
    auth.removeListener(_alCambiarSesion);
    super.dispose();
  }
}
