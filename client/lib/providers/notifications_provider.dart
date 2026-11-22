/// Estado del centro de notificaciones (007-notificaciones-internas, T019;
/// FR-009, FR-013, CA-1, CA-9, A1).
///
/// Carga los avisos del usuario al iniciar sesión, al cambiar de sección del
/// shell y cada 60 segundos mientras la app está abierta (sin WebSocket).
/// Es un proveedor GLOBAL: por eso escucha la sesión y, al cerrar sesión o al
/// entrar otro usuario, descarta de inmediato la lista, los contadores, las
/// marcas de leído y la respuesta de cualquier consulta que estuviera en vuelo
/// del usuario anterior; así nunca se muestran avisos ajenos.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/notification.dart';
import '../models/vehicle.dart';
import '../services/api_client.dart';
import 'auth_provider.dart';

class NotificationsProvider extends ChangeNotifier {
  final ApiClient api;
  final AuthProvider auth;

  /// Intervalo de la consulta periódica (60 s; configurable solo para pruebas).
  final Duration intervalo;

  NotificationsProvider(
    this.api,
    this.auth, {
    this.intervalo = const Duration(seconds: 60),
  }) {
    _usuarioId = auth.usuario?.id;
    auth.addListener(_alCambiarSesion);
    if (_usuarioId != null) {
      _iniciar();
    }
  }

  List<Aviso> avisos = const [];
  int total = 0;
  int noLeidos = 0;

  /// true mientras llega una carga visible (inicio de sesión o «Reintentar»).
  bool cargando = false;

  /// true cuando ya llegó al menos una respuesta del usuario actual.
  bool cargado = false;

  /// Mensaje genérico en español si la carga falla (sin detalles internos).
  String? error;

  /// Sin avisos pendientes y sin error: el panel muestra el estado vacío.
  bool get vacio => cargado && avisos.isEmpty && error == null;

  Timer? _temporizador;
  int? _usuarioId;
  bool _consultando = false;
  bool _liberado = false;

  /// Se incrementa al limpiar o liberar: invalida las consultas en vuelo.
  int _generacion = 0;

  static const String _mensajeError = 'No se pudieron cargar los avisos.';

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    _limpiar();
    if (id != null) {
      _iniciar();
    }
  }

  void _iniciar() {
    _temporizador?.cancel();
    _temporizador = Timer.periodic(intervalo, (_) => cargar(silencioso: true));
    cargar();
  }

  /// Descarta todo lo del usuario anterior y cancela el temporizador.
  void _limpiar() {
    _temporizador?.cancel();
    _temporizador = null;
    _generacion++;
    _consultando = false;
    avisos = const [];
    total = 0;
    noLeidos = 0;
    cargando = false;
    cargado = false;
    error = null;
    notifyListeners();
  }

  /// Consulta los avisos del usuario autenticado.
  ///
  /// Con `silencioso` (temporizador y cambio de sección) no muestra el
  /// indicador de carga. No lanza una segunda consulta si hay una en curso.
  Future<void> cargar({bool silencioso = false}) async {
    if (_liberado || auth.usuario == null || _consultando) return;

    final generacion = _generacion;
    _consultando = true;
    if (!silencioso) {
      cargando = true;
      error = null;
      notifyListeners();
    }

    try {
      final respuesta = await api.get('/notifications');
      if (generacion != _generacion) return; // respuesta de otro usuario o sesión
      final resumen = ResumenAvisos.desdeJson(respuesta);
      avisos = resumen.avisos;
      total = resumen.total;
      noLeidos = resumen.noLeidos;
      cargado = true;
      error = null;
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generacion) return;
      if (excepcion.status == 401) {
        // Sesión vencida: el AuthProvider cierra la sesión; no es un error de carga.
        _temporizador?.cancel();
        _temporizador = null;
        error = null;
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

  /// Marca un aviso como leído para el usuario (US6; FR-006, CA-6).
  ///
  /// El efecto es inmediato (optimista): la fila se atenúa y el contador baja.
  /// Si el servidor falla se revierte; si responde 404 (el aviso ya no existe o
  /// ya no es vigente) se recarga la lista para reflejar la realidad. Se ignora
  /// la respuesta si mientras tanto cambió la sesión (otro usuario).
  Future<void> marcarLeido(String clave) async {
    final indice = avisos.indexWhere((aviso) => aviso.clave == clave);
    if (_liberado || indice < 0 || avisos[indice].leido) return;

    final generacion = _generacion;
    _cambiarLeido(clave, true);
    try {
      final respuesta = await api.post('/notifications/reads', {'clave': clave});
      if (generacion != _generacion) return;
      noLeidos = (respuesta['noLeidos'] as num?)?.toInt() ?? noLeidos;
      notifyListeners();
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generacion) return;
      if (excepcion.status == 404) {
        await cargar(silencioso: true);
      } else if (excepcion.status != 401) {
        _cambiarLeido(clave, false);
      }
    } catch (_) {
      if (generacion != _generacion) return;
      _cambiarLeido(clave, false);
    }
  }

  /// Cambia la marca de leído de un aviso y ajusta el contador.
  void _cambiarLeido(String clave, bool leido) {
    avisos = [
      for (final aviso in avisos)
        aviso.clave == clave ? aviso.copiarCon(leido: leido) : aviso,
    ];
    noLeidos = avisos.where((aviso) => !aviso.leido).length;
    notifyListeners();
  }

  /// Vehículo de un aviso de mantenimiento (para abrir su historial); null si falla.
  Future<Vehiculo?> cargarVehiculo(int id) async {
    try {
      return Vehiculo.desdeJson(await api.get('/vehicles/$id'));
    } on ExcepcionApi {
      return null;
    }
  }

  /// Reintenta una carga fallida (botón «Reintentar»).
  Future<void> reintentar() => cargar();

  /// El shell cambió de sección: actualiza el contador sin mostrar carga.
  void alCambiarSeccion() {
    cargar(silencioso: true);
  }

  @override
  void dispose() {
    _liberado = true;
    _generacion++;
    _temporizador?.cancel();
    _temporizador = null;
    auth.removeListener(_alCambiarSesion);
    super.dispose();
  }
}
