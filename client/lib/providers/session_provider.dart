/// Vigilancia de la inactividad y renovación del token (008-configuracion-
/// seguridad-reportes, T084; FR-016, CA-23).
///
/// Reglas:
/// - Un temporizador de 15 s revisa la sesión mientras hay un usuario autenticado
///   (sin sesión no hay temporizador).
/// - «Actividad» es solo lo que hace el usuario (puntero y teclado, vía
///   `ActividadSesion`). La consulta periódica de avisos NO cuenta: este proveedor
///   no la conoce y ella no lo conoce.
/// - Con actividad nueva desde la última renovación, el token se renueva a lo
///   sumo una vez por `vigencia / 3` (mínimo 60 s) y nunca en paralelo. Como la
///   renovación ocurre en la siguiente revisión, el token siempre dura al menos
///   hasta que se cumpla la inactividad contada desde la última actividad.
/// - Si pasa la vigencia completa (el ajuste de inactividad) sin actividad, se
///   cierra la sesión y el login lo explica.
/// - Una renovación con 401 cierra la sesión como expirada (lo hace el cliente
///   HTTP); un fallo de red o un 500 no la cierra y se reintenta en 60 s.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import 'auth_provider.dart';

class SessionProvider extends ChangeNotifier {
  final AuthProvider auth;

  /// Reloj inyectable (en las pruebas es un reloj falso).
  final DateTime Function() _reloj;

  /// Cada cuánto revisa el temporizador (15 s; configurable solo para pruebas).
  final Duration verificacion;

  /// Espera mínima entre renovaciones y tras un intento fallido.
  static const Duration intervaloMinimo = Duration(seconds: 60);

  /// Margen con el que un 401 se considera cierre por inactividad: el token vence
  /// a los N minutos de emitirse (antes de que el cliente reciba la respuesta) y la
  /// revisión puede llegar hasta 15 s tarde; un minuto cubre ambas cosas.
  static const Duration toleranciaDeVencimiento = Duration(seconds: 60);

  SessionProvider(
    this.auth, {
    DateTime Function()? reloj,
    this.verificacion = const Duration(seconds: 15),
  }) : _reloj = reloj ?? DateTime.now {
    _usuarioId = auth.usuario?.id;
    auth.inactividadCumplida = inactividadCumplida;
    auth.addListener(_alCambiarSesion);
    if (_usuarioId != null) {
      _iniciar();
    }
  }

  Timer? _temporizador;
  int? _usuarioId;
  late DateTime _ultimaActividad;
  late DateTime _ultimaRenovacion;

  /// true si hubo actividad del usuario desde la última renovación pedida.
  bool _actividadPendiente = false;
  DateTime? _ultimoIntentoFallido;
  bool _verificando = false;
  bool _liberado = false;

  /// true mientras el temporizador de vigilancia corre (solo con sesión).
  bool get temporizadorActivo => _temporizador?.isActive ?? false;

  /// Cada cuánto se renueva el token con actividad: vigencia/3, mínimo 60 s.
  Duration get intervaloRenovacion {
    final tercio = Duration(seconds: auth.inactividadMinutos * 60 ~/ 3);
    return tercio < intervaloMinimo ? intervaloMinimo : tercio;
  }

  /// true si el usuario lleva sin actividad casi toda la vigencia (menos la
  /// tolerancia). Con un 401 en ese estado, el motivo del cierre es la inactividad.
  bool inactividadCumplida() {
    if (_liberado || auth.usuario == null) return false;
    final vigencia = Duration(minutes: auth.inactividadMinutos);
    return _reloj().difference(_ultimaActividad) >= vigencia - toleranciaDeVencimiento;
  }

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    _detener();
    if (id != null) {
      _iniciar();
    }
  }

  void _iniciar() {
    final ahora = _reloj();
    _ultimaActividad = ahora;
    _ultimaRenovacion = ahora; // el token del login se emitió ahora
    _ultimoIntentoFallido = null;
    _actividadPendiente = false;
    _temporizador?.cancel();
    _temporizador = Timer.periodic(verificacion, (_) => verificar());
  }

  void _detener() {
    _temporizador?.cancel();
    _temporizador = null;
  }

  /// Registra que el usuario hizo algo (puntero o teclado). Solo guarda la hora:
  /// no notifica ni llama al servidor.
  void registrarActividad() {
    if (_liberado || auth.usuario == null) return;
    _ultimaActividad = _reloj();
    _actividadPendiente = true;
  }

  /// Una revisión del temporizador: renueva el token si corresponde o cierra la
  /// sesión por inactividad. Pública para poder probarla con un reloj falso.
  Future<void> verificar() async {
    if (_liberado || auth.usuario == null || _verificando) return;
    _verificando = true;
    try {
      final ahora = _reloj();
      final vigencia = Duration(minutes: auth.inactividadMinutos);

      // 1) Renovar primero: si hubo actividad desde la última renovación y ya pasó
      //    el intervalo, el token nuevo cubre la inactividad que sigue.
      final hayActividadNueva = _actividadPendiente;
      final intervaloCumplido = ahora.difference(_ultimaRenovacion) >= intervaloRenovacion;
      final reintentoPermitido = _ultimoIntentoFallido == null ||
          ahora.difference(_ultimoIntentoFallido!) >= intervaloMinimo;
      if (hayActividadNueva && intervaloCumplido && reintentoPermitido) {
        final idUsuario = auth.usuario?.id;
        _actividadPendiente = false; // la actividad de ahora en adelante pide otra
        final renovado = await auth.renovarToken();
        // Pudo cerrarse la sesión (401) mientras esperaba la respuesta.
        if (_liberado || auth.usuario == null || auth.usuario?.id != idUsuario) return;
        if (renovado) {
          _ultimaRenovacion = ahora;
          _ultimoIntentoFallido = null;
        } else {
          _ultimoIntentoFallido = ahora;
          _actividadPendiente = true; // se reintenta cuando se permita
        }
      }

      // 2) Cerrar por inactividad cuando se cumple la vigencia sin actividad.
      if (ahora.difference(_ultimaActividad) >= vigencia) {
        _detener();
        auth.cerrarSesionPorInactividad();
      }
    } finally {
      _verificando = false;
    }
  }

  @override
  void dispose() {
    _liberado = true;
    _detener();
    auth.removeListener(_alCambiarSesion);
    if (auth.inactividadCumplida == inactividadCumplida) {
      auth.inactividadCumplida = null;
    }
    super.dispose();
  }
}
