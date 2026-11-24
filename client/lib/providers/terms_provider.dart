/// Estado de los términos y condiciones con aviso de privacidad
/// (008-configuracion-seguridad-reportes, T094; FR-019 a FR-022, CA-16 a CA-18).
///
/// Dos usos:
/// - Todos los roles: al iniciar sesión consulta la versión vigente y, si falta
///   aceptarla, avisa (`alPendiente`) para llevar al usuario a la pantalla de
///   aceptación. También avisa cuando CUALQUIER petición recibe
///   `403 TERMS_NOT_ACCEPTED` (callback del cliente HTTP), una sola vez hasta que
///   se acepte. Si la consulta falla, no se bloquea nada: la compuerta real es la
///   del servidor.
/// - Solo ADMIN: versión vigente, aceptaciones paginadas de 50 y publicación de
///   una versión nueva.
/// Como es un proveedor global, escucha la sesión y descarta su estado al cerrar
/// sesión o al entrar otro usuario.
library;

import 'package:flutter/foundation.dart';

import '../models/terms.dart';
import '../services/api_client.dart';
import 'auth_provider.dart';

/// Resultado de publicar: éxito o el mensaje a mostrar.
class ResultadoTerminos {
  final bool exito;
  final String mensaje;

  const ResultadoTerminos(this.exito, this.mensaje);
}

class TermsProvider extends ChangeNotifier {
  final ApiClient api;
  final AuthProvider auth;

  TermsProvider(this.api, this.auth) {
    _usuarioId = auth.usuario?.id;
    auth.addListener(_alCambiarSesion);
    api.onTerminosPendientes = _alRechazoDelServidor;
  }

  /// Lo fija la aplicación: lleva al usuario a la pantalla de aceptación.
  void Function()? alPendiente;

  // --- Aceptación (todos los roles) ---
  VersionTerminos? vigente;
  bool aceptada = true;
  bool cargando = false;
  bool aceptando = false;
  String? error;

  /// true si el servidor rechazó una petición con TERMS_NOT_ACCEPTED.
  bool _bloqueado = false;

  /// true una vez ordenada la navegación a la pantalla (evita repetirla).
  bool _avisado = false;

  Future<void>? _consultaEnCurso;

  // --- Administración (solo ADMIN) ---
  List<AceptacionTerminos> aceptaciones = const [];
  int pagina = 1;
  int totalPaginas = 1;
  int total = 0;
  bool cargandoAdmin = false;
  bool cargadoAdmin = false;
  String? errorAdmin;
  bool sinPermiso = false;
  bool publicando = false;

  int? _usuarioId;
  int _generacion = 0;
  int _cargaAdmin = 0;
  bool _liberado = false;

  static const String _mensajeError = 'No se pudo conectar con el servidor; verifique que esté en ejecución.';
  static const String _mensajeErrorAdmin = 'No se pudieron cargar los términos.';
  static const String _mensajeSinPermiso = 'No tiene permisos para administrar los términos.';
  static const String _mensajeDesactualizada =
      'Se publicó una versión nueva de los términos; revise el texto y acepte de nuevo.';

  /// Falta aceptar: el servidor lo rechazó o la versión vigente no está aceptada.
  bool get pendiente => _bloqueado || (vigente != null && !aceptada);

  bool get hayAnterior => pagina > 1;
  bool get haySiguiente => pagina < totalPaginas;

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    // Se descarta lo del usuario anterior, incluida cualquier consulta en vuelo.
    _generacion++;
    _cargaAdmin++;
    vigente = null;
    aceptada = true;
    cargando = false;
    aceptando = false;
    error = null;
    _bloqueado = false;
    _avisado = false;
    _consultaEnCurso = null;
    aceptaciones = const [];
    pagina = 1;
    totalPaginas = 1;
    total = 0;
    cargandoAdmin = false;
    cargadoAdmin = false;
    errorAdmin = null;
    sinPermiso = false;
    publicando = false;
    notifyListeners();
    // Al iniciar sesión se consulta si hay términos por aceptar.
    if (id != null) {
      verificar();
    }
  }

  /// El servidor respondió `403 TERMS_NOT_ACCEPTED` a una petición cualquiera.
  void _alRechazoDelServidor() {
    if (_liberado || auth.usuario == null) return;
    // Ya se está atendiendo (o ya se llevó al usuario a la pantalla).
    if (_bloqueado && (_consultaEnCurso != null || _avisado)) return;
    _bloqueado = true;
    verificar();
  }

  /// Consulta la versión vigente y, si falta aceptarla, avisa (una sola vez).
  /// Un error no bloquea nada salvo que el servidor ya haya rechazado una petición.
  /// Con `silencioso` en false el error queda en [error] para mostrarlo.
  Future<void> verificar({bool silencioso = true}) {
    if (_liberado || auth.usuario == null) return Future.value();
    final enCurso = _consultaEnCurso;
    if (enCurso != null) return enCurso;
    final consulta = _consultar(silencioso).whenComplete(() => _consultaEnCurso = null);
    _consultaEnCurso = consulta;
    return consulta;
  }

  Future<void> _consultar(bool silencioso) async {
    final generacion = _generacion;
    cargando = true;
    if (!silencioso) error = null;
    notifyListeners();
    try {
      await _leerVigente(generacion);
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generacion) return;
      if (!silencioso && excepcion.status != 401) error = excepcion.mensaje;
    } catch (_) {
      if (generacion != _generacion) return;
      if (!silencioso) error = _mensajeError;
    } finally {
      if (generacion == _generacion && !_liberado) {
        cargando = false;
        notifyListeners();
      }
    }
    if (generacion == _generacion && !_liberado) {
      _avisar();
    }
  }

  /// Lee `GET /terms/current` y actualiza la versión vigente y la aceptación.
  Future<void> _leerVigente(int generacion) async {
    final respuesta = await api.get('/terms/current');
    if (generacion != _generacion) return;
    final dato = respuesta['vigente'];
    vigente = dato is Map<String, dynamic> ? VersionTerminos.desdeJson(dato) : null;
    aceptada = (respuesta['aceptada'] as bool?) ?? true;
    // El servidor ya confirmó el estado real: el bloqueo del 403 deja de hacer falta.
    if (vigente == null || aceptada) {
      _bloqueado = false;
    }
  }

  /// Ordena ir a la pantalla de aceptación, una sola vez por bloqueo.
  void _avisar() {
    if (_avisado || !pendiente) return;
    _avisado = true;
    alPendiente?.call();
  }

  /// Acepta la versión vigente. Devuelve true si quedó aceptada; si no, deja el
  /// motivo en [error].
  Future<bool> aceptar() async {
    final version = vigente;
    if (version == null || aceptando || auth.usuario == null) return false;
    final generacion = _generacion;
    aceptando = true;
    error = null;
    notifyListeners();
    try {
      await api.post('/terms/accept', {'termsVersionId': version.id});
      if (generacion != _generacion) return false;
      aceptada = true;
      _bloqueado = false;
      _avisado = false;
      return true;
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generacion) return false;
      if (excepcion.codigo == 'TERMS_VERSION_OUTDATED') {
        // Se publicó otra versión mientras tanto: se muestra la nueva.
        try {
          await _leerVigente(generacion);
        } catch (_) {
          // Si no se puede actualizar, el mensaje ya explica qué hacer.
        }
        error = _mensajeDesactualizada;
      } else if (excepcion.status != 401) {
        error = excepcion.mensaje;
      }
      return false;
    } catch (_) {
      if (generacion != _generacion) return false;
      error = _mensajeError;
      return false;
    } finally {
      if (generacion == _generacion && !_liberado) {
        aceptando = false;
        notifyListeners();
      }
    }
  }

  // ---------------------------------------------------------------- Administración

  /// Carga las aceptaciones de la página indicada y la versión vigente.
  Future<void> cargarAdmin({int? pagina}) async {
    if (_liberado || auth.usuario == null) return;
    if (pagina != null) this.pagina = pagina;

    final generacion = _generacion;
    final carga = ++_cargaAdmin;
    cargandoAdmin = true;
    errorAdmin = null;
    sinPermiso = false;
    notifyListeners();

    try {
      final respuesta = await api.get('/terms/acceptances?pagina=${this.pagina}');
      if (generacion != _generacion || carga != _cargaAdmin) return;
      aceptaciones = (respuesta['datos'] as List<dynamic>? ?? [])
          .map((dato) => AceptacionTerminos.desdeJson(dato as Map<String, dynamic>))
          .toList();
      this.pagina = (respuesta['pagina'] as num?)?.toInt() ?? this.pagina;
      totalPaginas = (respuesta['totalPaginas'] as num?)?.toInt() ?? 1;
      total = (respuesta['total'] as num?)?.toInt() ?? aceptaciones.length;
      await _leerVigente(generacion);
      if (generacion != _generacion || carga != _cargaAdmin) return;
      cargadoAdmin = true;
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generacion || carga != _cargaAdmin) return;
      if (excepcion.status == 401 || excepcion.codigo == 'TERMS_NOT_ACCEPTED') {
        errorAdmin = null; // la sesión o la pantalla de aceptación lo gestionan
      } else if (excepcion.status == 403) {
        sinPermiso = true;
        errorAdmin = _mensajeSinPermiso;
      } else {
        errorAdmin = _mensajeErrorAdmin;
      }
    } catch (_) {
      if (generacion != _generacion || carga != _cargaAdmin) return;
      errorAdmin = _mensajeErrorAdmin;
    } finally {
      if (generacion == _generacion && carga == _cargaAdmin && !_liberado) {
        cargandoAdmin = false;
        notifyListeners();
      }
    }
  }

  Future<void> irAPagina(int destino) => cargarAdmin(pagina: destino);

  /// Publica una versión nueva. Todos, incluido el autor, deben aceptarla: tras
  /// publicar se avisa para llevar al autor a la pantalla de aceptación.
  Future<ResultadoTerminos> publicar(String terminos, String avisoPrivacidad) async {
    if (publicando || auth.usuario == null) {
      return const ResultadoTerminos(false, 'Ya se está publicando una versión.');
    }
    final generacion = _generacion;
    publicando = true;
    notifyListeners();
    try {
      final respuesta = await api.post('/terms', {
        'terminos': terminos.trim(),
        'avisoPrivacidad': avisoPrivacidad.trim(),
      });
      final nueva = VersionTerminos.desdeJson(respuesta);
      if (generacion == _generacion) {
        vigente = nueva;
        aceptada = false;
        _avisado = false;
        _avisar();
      }
      return ResultadoTerminos(
        true,
        'Versión ${nueva.version} publicada. Todos los usuarios deberán aceptarla.',
      );
    } on ExcepcionApi catch (excepcion) {
      return ResultadoTerminos(false, excepcion.mensaje);
    } catch (_) {
      return const ResultadoTerminos(false, _mensajeError);
    } finally {
      if (generacion == _generacion && !_liberado) {
        publicando = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _liberado = true;
    auth.removeListener(_alCambiarSesion);
    if (api.onTerminosPendientes == _alRechazoDelServidor) {
      api.onTerminosPendientes = null;
    }
    super.dispose();
  }
}
