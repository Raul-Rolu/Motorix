/// Estado de la bitácora (008-configuracion-seguridad-reportes, T074; FR-014,
/// CA-20).
///
/// Solo ADMIN: el servidor responde 403 a los demás roles y aquí se muestra un
/// mensaje de permisos. Consulta paginada de 50 en 50 con filtros por fecha,
/// usuario y acción. Como es un proveedor global, escucha la sesión y descarta su
/// estado al cerrar sesión o al entrar otro usuario.
library;

import 'package:flutter/foundation.dart';

import '../models/audit_entry.dart';
import '../services/api_client.dart';
import 'auth_provider.dart';

class AuditProvider extends ChangeNotifier {
  final ApiClient api;
  final AuthProvider auth;

  AuditProvider(this.api, this.auth) {
    _usuarioId = auth.usuario?.id;
    auth.addListener(_alCambiarSesion);
  }

  List<EntradaBitacora> entradas = const [];
  int pagina = 1;
  int totalPaginas = 1;
  int total = 0;
  bool cargando = false;
  bool cargado = false;
  String? error;

  /// true si el servidor respondió 403 (el rol no puede ver la bitácora).
  bool sinPermiso = false;

  /// Filtros activos (null = sin filtro).
  String? desde;
  String? hasta;
  int? usuarioFiltro;
  String? accionFiltro;

  /// Usuarios para el filtro.
  List<UsuarioFiltroBitacora> usuarios = const [];

  int? _usuarioId;
  int _generacion = 0;
  bool _liberado = false;

  static const String _mensajeError = 'No se pudo cargar la bitácora.';
  static const String _mensajeSinPermiso = 'No tiene permisos para ver la bitácora.';

  bool get hayFiltros => desde != null || hasta != null || usuarioFiltro != null || accionFiltro != null;
  bool get hayAnterior => pagina > 1;
  bool get haySiguiente => pagina < totalPaginas;

  void _alCambiarSesion() {
    final id = auth.usuario?.id;
    if (id == _usuarioId) return;
    _usuarioId = id;
    _generacion++;
    entradas = const [];
    pagina = 1;
    totalPaginas = 1;
    total = 0;
    cargando = false;
    cargado = false;
    error = null;
    sinPermiso = false;
    desde = hasta = accionFiltro = null;
    usuarioFiltro = null;
    usuarios = const [];
    notifyListeners();
  }

  /// Parámetros de la consulta: página y solo los filtros activos.
  String get _consulta {
    final partes = <String>[
      'pagina=$pagina',
      if (desde != null) 'desde=$desde',
      if (hasta != null) 'hasta=$hasta',
      if (usuarioFiltro != null) 'usuarioId=$usuarioFiltro',
      if (accionFiltro != null) 'accion=$accionFiltro',
    ];
    return partes.join('&');
  }

  /// Carga la página indicada con los filtros actuales.
  Future<void> cargar({int? pagina}) async {
    if (_liberado || auth.usuario == null) return;
    if (pagina != null) this.pagina = pagina;

    final generacion = ++_generacion;
    cargando = true;
    error = null;
    sinPermiso = false;
    notifyListeners();

    try {
      final respuesta = await api.get('/audit-log?$_consulta');
      if (generacion != _generacion) return;
      entradas = (respuesta['datos'] as List<dynamic>? ?? [])
          .map((dato) => EntradaBitacora.desdeJson(dato as Map<String, dynamic>))
          .toList();
      this.pagina = (respuesta['pagina'] as num?)?.toInt() ?? this.pagina;
      totalPaginas = (respuesta['totalPaginas'] as num?)?.toInt() ?? 1;
      total = (respuesta['total'] as num?)?.toInt() ?? entradas.length;
      cargado = true;
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

  /// Aplica los filtros y vuelve a la página 1.
  Future<void> aplicarFiltros({String? desde, String? hasta, int? usuarioId, String? accion}) {
    this.desde = desde;
    this.hasta = hasta;
    usuarioFiltro = usuarioId;
    accionFiltro = accion;
    return cargar(pagina: 1);
  }

  Future<void> limpiarFiltros() => aplicarFiltros();

  Future<void> irAPagina(int destino) => cargar(pagina: destino);

  /// Usuarios para el filtro (no crítico: si falla, el filtro queda vacío).
  Future<void> cargarUsuarios() async {
    if (_liberado || auth.usuario == null) return;
    try {
      final respuesta = await api.get('/users');
      usuarios = (respuesta['datos'] as List<dynamic>? ?? [])
          .map((dato) => dato as Map<String, dynamic>)
          .map((u) => UsuarioFiltroBitacora(
                id: (u['id'] as num).toInt(),
                nombre: (u['fullName'] as String?) ?? (u['username'] as String? ?? ''),
              ))
          .toList();
      if (!_liberado) notifyListeners();
    } catch (_) {
      // Sin la lista de usuarios el resto de la bitácora sigue funcionando.
    }
  }

  @override
  void dispose() {
    _liberado = true;
    auth.removeListener(_alCambiarSesion);
    super.dispose();
  }
}
