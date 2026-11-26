/// Estado de los reportes (008-configuracion-seguridad-reportes, T118, T125, T132
/// y T140; FR-023, FR-027, CA-6, CA-9).
///
/// Solo ADMIN: el servidor responde 403 a los demás roles y aquí se muestra un
/// mensaje de permisos. Todas las pestañas comparten UN filtro de rango (mes
/// actual, mes anterior o un rango libre): cambiarlo invalida los datos de todas
/// las pestañas y consulta solo la activa; las demás se consultan al abrirlas, y
/// volver a una pestaña ya cargada con el mismo filtro no consulta otra vez. Una
/// respuesta lenta de un filtro anterior nunca pisa a la más reciente. Como es un
/// proveedor global, escucha la sesión y descarta su estado al cerrar sesión o al
/// entrar otro usuario. También exporta a CSV la pestaña activa (`exportar`).
library;

import 'package:flutter/foundation.dart';

import '../models/report.dart';
import '../services/api_client.dart';
import '../services/csv_export.dart';
import 'auth_provider.dart';

/// Filtro de rango compartido por las pestañas.
enum FiltroRango { mesActual, mesAnterior, libre }

/// Pestañas de la sección «Reportes» (el orden es el de la barra de pestañas).
enum PestanaReporte { ingresos, servicios, productividad, refacciones, rotacion }

/// Resultado de exportar: éxito (con la ruta guardada) o el mensaje a mostrar.
class ResultadoExportacion {
  final bool exito;
  final String mensaje;

  const ResultadoExportacion(this.exito, this.mensaje);
}

class ReportsProvider extends ChangeNotifier {
  final ApiClient api;
  final AuthProvider auth;
  final GuardarArchivo _guardarArchivo;

  /// `guardarArchivo` se inyecta en las pruebas; por omisión guarda en Descargas.
  ReportsProvider(this.api, this.auth, {GuardarArchivo? guardarArchivo})
      : _guardarArchivo = guardarArchivo ?? guardarCsvEnDescargas {
    _usuarioId = auth.usuario?.id;
    auth.addListener(_alCambiarSesion);
  }

  FiltroRango filtro = FiltroRango.mesActual;

  /// Fechas del rango libre (`AAAA-MM-DD`), solo con [FiltroRango.libre].
  String? desde;
  String? hasta;

  /// Pestaña activa (la que se consulta al cambiar el filtro).
  PestanaReporte pestana = PestanaReporte.ingresos;

  ReporteIngresos? ingresos;
  ReporteServicios? servicios;
  ReporteProductividad? productividad;
  ReporteRefacciones? refacciones;
  ReporteRotacion? rotacion;

  /// true si el servidor respondió 403 (el rol no puede ver los reportes).
  bool sinPermiso = false;

  /// true mientras se exporta un reporte a CSV (una sola exportación a la vez).
  bool exportando = false;

  final Map<PestanaReporte, bool> _cargando = {};
  final Map<PestanaReporte, String?> _errores = {};
  final Map<PestanaReporte, int> _generaciones = {};

  /// Página pedida de las pestañas paginadas (Refacciones y Rotación); 1 por omisión.
  final Map<PestanaReporte, int> _paginas = {};

  int? _usuarioId;
  int _exportacion = 0;
  bool _liberado = false;

  static const String _mensajeError = 'No se pudo cargar el reporte.';
  static const String _mensajeSinPermiso = 'No tiene permisos para ver los reportes.';
  static const String _mensajeErrorExportar = 'No se pudo exportar el reporte.';

  static const int maximoDias = 366;
  static final RegExp _formatoFecha = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

  bool cargando(PestanaReporte p) => _cargando[p] ?? false;
  String? error(PestanaReporte p) => _errores[p];

  /// Compatibilidad con la pestaña «Ingresos» (T118).
  bool get cargandoIngresos => cargando(PestanaReporte.ingresos);
  String? get errorIngresos => error(PestanaReporte.ingresos);

  bool _tieneDatos(PestanaReporte p) {
    switch (p) {
      case PestanaReporte.ingresos:
        return ingresos != null;
      case PestanaReporte.servicios:
        return servicios != null;
      case PestanaReporte.productividad:
        return productividad != null;
      case PestanaReporte.refacciones:
        return refacciones != null;
      case PestanaReporte.rotacion:
        return rotacion != null;
    }
  }

  /// Las pestañas «Refacciones» y «Rotación» se consultan de 50 en 50.
  static bool esPaginada(PestanaReporte p) => p == PestanaReporte.refacciones || p == PestanaReporte.rotacion;

  /// Página pedida de una pestaña paginada.
  int paginaDe(PestanaReporte p) => _paginas[p] ?? 1;

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    filtro = FiltroRango.mesActual;
    desde = null;
    hasta = null;
    pestana = PestanaReporte.ingresos;
    _descartarDatos();
    notifyListeners();
  }

  /// Descarta los datos de todas las pestañas y cualquier consulta en vuelo.
  void _descartarDatos() {
    for (final p in PestanaReporte.values) {
      _generaciones[p] = (_generaciones[p] ?? 0) + 1;
    }
    _exportacion++;
    exportando = false;
    _cargando.clear();
    _errores.clear();
    _paginas.clear();
    ingresos = null;
    servicios = null;
    productividad = null;
    refacciones = null;
    rotacion = null;
    sinPermiso = false;
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

  // ------------------------------------------------------------------- Filtro

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

  /// Parámetros de la consulta de una pestaña: el filtro y, si es paginada, la página.
  String _consultaDe(PestanaReporte p) => esPaginada(p) ? '$_consulta&pagina=${paginaDe(p)}' : _consulta;

  /// Un filtro nuevo invalida todas las pestañas y consulta solo la activa.
  Future<void> _aplicarFiltro() {
    _descartarDatos();
    return cargar();
  }

  Future<void> seleccionarMesActual() {
    filtro = FiltroRango.mesActual;
    return _aplicarFiltro();
  }

  Future<void> seleccionarMesAnterior() {
    filtro = FiltroRango.mesAnterior;
    return _aplicarFiltro();
  }

  /// Consulta un rango libre ya validado en la interfaz.
  Future<void> aplicarRango(String desde, String hasta) {
    filtro = FiltroRango.libre;
    this.desde = desde.trim();
    this.hasta = hasta.trim();
    return _aplicarFiltro();
  }

  /// Cambia de pestaña: solo consulta si no tiene datos, ni los está cargando, ni
  /// quedó con un error (el error se reintenta con el botón, no solo).
  Future<void> seleccionarPestana(PestanaReporte nueva) async {
    if (pestana == nueva) return;
    pestana = nueva;
    notifyListeners();
    if (!_tieneDatos(nueva) && !cargando(nueva) && error(nueva) == null && !sinPermiso) {
      await cargar(nueva);
    }
  }

  /// Nombre del reporte en la API (`/reports/<ruta>`).
  static String rutaDe(PestanaReporte p) => switch (p) {
        PestanaReporte.ingresos => 'income',
        PestanaReporte.servicios => 'services',
        PestanaReporte.productividad => 'productivity',
        PestanaReporte.refacciones => 'parts',
        PestanaReporte.rotacion => 'rotation',
      };

  // ----------------------------------------------------------------- Exportación

  /// Exporta a CSV el reporte de la pestaña activa con el filtro activo (todo el
  /// rango, sin la página) y lo guarda en Descargas. No cambia lo que se ve. Los
  /// mensajes son en español y nunca llevan trazas ni rutas del sistema de errores.
  Future<ResultadoExportacion> exportar() async {
    if (_liberado || auth.usuario == null) {
      return const ResultadoExportacion(false, 'Inicie sesión para exportar reportes.');
    }
    if (exportando) {
      return const ResultadoExportacion(false, 'Ya se está exportando un reporte.');
    }
    final ruta = rutaDe(pestana);
    final exportacion = _exportacion;
    exportando = true;
    notifyListeners();
    try {
      final RespuestaArchivo archivo;
      try {
        archivo = await api.descargar('/reports/$ruta/export?$_consulta');
      } on ExcepcionApi catch (excepcion) {
        if (excepcion.status == 403 && excepcion.codigo != 'TERMS_NOT_ACCEPTED') {
          return const ResultadoExportacion(false, 'No tiene permisos para exportar reportes.');
        }
        if (excepcion.codigo == 'RANGO_INVALIDO') {
          return ResultadoExportacion(false, excepcion.mensaje);
        }
        return const ResultadoExportacion(false, _mensajeErrorExportar);
      } catch (_) {
        return const ResultadoExportacion(false, _mensajeErrorExportar);
      }
      try {
        final nombre = sanearNombreCsv(archivo.contentDisposition, 'motorix-$ruta.csv');
        final guardado = await _guardarArchivo(nombre, archivo.bytes);
        return ResultadoExportacion(true, 'Archivo guardado en $guardado.');
      } catch (_) {
        return const ResultadoExportacion(false, 'No se pudo guardar el archivo.');
      }
    } finally {
      if (exportacion == _exportacion && !_liberado) {
        exportando = false;
        notifyListeners();
      }
    }
  }

  // ------------------------------------------------------------------ Consulta

  /// Pide otra página de una pestaña paginada (el filtro no cambia).
  Future<void> irAPagina(PestanaReporte p, int pagina) {
    _paginas[p] = pagina;
    return cargar(p);
  }

  Future<void> cargarIngresos() => cargar(PestanaReporte.ingresos);

  /// Carga (o recarga) los datos de una pestaña (por omisión, la activa) con el
  /// filtro actual.
  Future<void> cargar([PestanaReporte? destino]) async {
    if (_liberado || auth.usuario == null) return;
    final p = destino ?? pestana;

    final generacion = (_generaciones[p] ?? 0) + 1;
    _generaciones[p] = generacion;
    _cargando[p] = true;
    _errores[p] = null;
    sinPermiso = false;
    switch (p) {
      case PestanaReporte.ingresos:
        ingresos = null;
      case PestanaReporte.servicios:
        servicios = null;
      case PestanaReporte.productividad:
        productividad = null;
      case PestanaReporte.refacciones:
        refacciones = null;
      case PestanaReporte.rotacion:
        rotacion = null;
    }
    notifyListeners();

    try {
      final respuesta = await api.get('/reports/${rutaDe(p)}?${_consultaDe(p)}');
      if (generacion != _generaciones[p]) return;
      switch (p) {
        case PestanaReporte.ingresos:
          ingresos = ReporteIngresos.desdeJson(respuesta);
        case PestanaReporte.servicios:
          servicios = ReporteServicios.desdeJson(respuesta);
        case PestanaReporte.productividad:
          productividad = ReporteProductividad.desdeJson(respuesta);
        case PestanaReporte.refacciones:
          refacciones = ReporteRefacciones.desdeJson(respuesta);
        case PestanaReporte.rotacion:
          rotacion = ReporteRotacion.desdeJson(respuesta);
      }
    } on ExcepcionApi catch (excepcion) {
      if (generacion != _generaciones[p]) return;
      if (excepcion.status == 401 || excepcion.codigo == 'TERMS_NOT_ACCEPTED') {
        _errores[p] = null; // la sesión o la pantalla de aceptación lo gestionan
      } else if (excepcion.status == 403) {
        sinPermiso = true;
        _errores[p] = _mensajeSinPermiso;
      } else if (excepcion.codigo == 'RANGO_INVALIDO') {
        _errores[p] = excepcion.mensaje;
      } else {
        _errores[p] = _mensajeError;
      }
    } catch (_) {
      if (generacion != _generaciones[p]) return;
      _errores[p] = _mensajeError;
    } finally {
      if (generacion == _generaciones[p] && !_liberado) {
        _cargando[p] = false;
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
