/// Estado de los reportes (008-configuracion-seguridad-reportes, T118; FR-023,
/// CA-6).
///
/// Solo ADMIN: el servidor responde 403 a los demás roles y aquí se muestra un
/// mensaje de permisos. Todas las pestañas comparten un único filtro de rango
/// (mes actual, mes anterior o un rango libre). Una respuesta lenta de un filtro
/// anterior nunca pisa a la más reciente. Como es un proveedor global, escucha la
/// sesión y descarta su estado al cerrar sesión o al entrar otro usuario.
library;

import 'package:flutter/foundation.dart';

import '../models/report.dart';
import '../services/api_client.dart';
import 'auth_provider.dart';

/// Filtro de rango compartido por las pestañas.
enum FiltroRango { mesActual, mesAnterior, libre }

class ReportsProvider extends ChangeNotifier {
  final ApiClient api;
  final AuthProvider auth;

  ReportsProvider(this.api, this.auth) {
    _usuarioId = auth.usuario?.id;
    auth.addListener(_alCambiarSesion);
  }

  FiltroRango filtro = FiltroRango.mesActual;

  /// Fechas del rango libre (`AAAA-MM-DD`), solo con [FiltroRango.libre].
  String? desde;
  String? hasta;

  // --- Ingresos ---
  ReporteIngresos? ingresos;
  bool cargandoIngresos = false;
  String? errorIngresos;

  /// true si el servidor respondió 403 (el rol no puede ver los reportes).
  bool sinPermiso = false;

  int? _usuarioId;
  int _generacion = 0;
  bool _liberado = false;

  static const String _mensajeError = 'No se pudo cargar el reporte.';
  static const String _mensajeSinPermiso = 'No tiene permisos para ver los reportes.';

  static const int maximoDias = 366;
  static final RegExp _formatoFecha = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    // Se descarta lo del usuario anterior, incluida cualquier consulta en vuelo.
    _generacion++;
    filtro = FiltroRango.mesActual;
    desde = null;
    hasta = null;
    ingresos = null;
    cargandoIngresos = false;
    errorIngresos = null;
    sinPermiso = false;
    notifyListeners();
  }

  // ---------------------------------------------------------------- Validación

  /// La fecha como `DateTime` UTC si es `AAAA-MM-DD` real; `null` si no.
  static DateTime? leerFecha(String texto) {
    final partes = _formatoFecha.firstMatch(texto);
    if (partes == null) return null;
    final anio = int.parse(partes.group(1)!);
    final mes = int.parse(partes.group(2)!);
    final dia = int.parse(partes.group(3)!);
    final fecha = DateTime.utc(anio, mes, dia);
    if (fecha.year != anio || fecha.month != mes || fecha.day != dia) return null;
    return fecha;
  }

  /// Mensaje de error de una fecha suelta, o `null` si es válida.
  static String? validarFecha(String? valor) =>
      leerFecha((valor ?? '').trim()) == null ? 'Use el formato AAAA-MM-DD.' : null;

  /// Mensaje de error de la fecha final respecto de la inicial, o `null`.
  static String? validarHasta(String? hasta, String? desde) {
    final formato = validarFecha(hasta);
    if (formato != null) return formato;
    final inicio = leerFecha((desde ?? '').trim());
    if (inicio == null) return null; // el error de la fecha inicial ya se muestra
    final fin = leerFecha((hasta ?? '').trim())!;
    if (fin.isBefore(inicio)) return 'La fecha final no puede ser anterior a la inicial.';
    if (fin.difference(inicio).inDays + 1 > maximoDias) {
      return 'El rango no puede exceder $maximoDias días.';
    }
    return null;
  }

  // ------------------------------------------------------------------- Consulta

  /// Parámetros del filtro activo.
  String get _consulta {
    switch (filtro) {
      case FiltroRango.mesActual:
        return 'periodo=MES_ACTUAL';
      case FiltroRango.mesAnterior:
        return 'periodo=MES_ANTERIOR';
      case FiltroRango.libre:
        return 'desde=$desde&hasta=$hasta';
    }
  }

  Future<void> seleccionarMesActual() {
    filtro = FiltroRango.mesActual;
    return cargarIngresos();
  }

  Future<void> seleccionarMesAnterior() {
    filtro = FiltroRango.mesAnterior;
    return cargarIngresos();
  }

  /// Consulta un rango libre ya validado en la interfaz.
  Future<void> aplicarRango(String desde, String hasta) {
    filtro = FiltroRango.libre;
    this.desde = desde.trim();
    this.hasta = hasta.trim();
    return cargarIngresos();
  }

  /// Carga (o recarga) el reporte de ingresos con el filtro actual.
  Future<void> cargarIngresos() async {
    if (_liberado || auth.usuario == null) return;

    final generacion = ++_generacion;
    cargandoIngresos = true;
    errorIngresos = null;
    sinPermiso = false;
    ingresos = null;
    notifyListeners();

    try {
      final respuesta = await api.get('/reports/income?$_consulta');
      if (generacion != _generacion) return;
      ingresos = ReporteIngresos.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generacion) return;
      if (excepcion.status == 401 || excepcion.codigo == 'TERMS_NOT_ACCEPTED') {
        errorIngresos = null; // la sesión o la pantalla de aceptación lo gestionan
      } else if (excepcion.status == 403) {
        sinPermiso = true;
        errorIngresos = _mensajeSinPermiso;
      } else if (excepcion.codigo == 'RANGO_INVALIDO') {
        errorIngresos = excepcion.mensaje;
      } else {
        errorIngresos = _mensajeError;
      }
    } catch (_) {
      if (generacion != _generacion) return;
      errorIngresos = _mensajeError;
    } finally {
      if (generacion == _generacion && !_liberado) {
        cargandoIngresos = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _liberado = true;
    auth.removeListener(_alCambiarSesion);
    super.dispose();
  }
}
