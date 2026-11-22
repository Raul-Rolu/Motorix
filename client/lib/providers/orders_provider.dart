/// Estado del módulo de órdenes de servicio (T029, US4; Sprint 2).
///
/// Listado con filtros por rol (el servidor limita la visibilidad del
/// mecánico), detalle, asignación manual y operaciones de las historias
/// posteriores (entradas, partidas y estados).
library;

import 'package:flutter/foundation.dart';

import '../models/part.dart';
import '../models/service_order.dart';
import '../services/api_client.dart';

/// Mecánico activo para el selector de asignación.
class MecanicoActivo {
  final int id;
  final String username;
  final String fullName;

  const MecanicoActivo({
    required this.id,
    required this.username,
    required this.fullName,
  });

  factory MecanicoActivo.desdeJson(Map<String, dynamic> json) => MecanicoActivo(
        id: json['id'] as int? ?? 0,
        username: json['username'] as String? ?? '',
        fullName: json['fullName'] as String? ?? '',
      );
}

class OrdersProvider extends ChangeNotifier {
  final ApiClient api;

  OrdersProvider(this.api);

  List<OrdenServicio> ordenes = [];
  List<MecanicoActivo> mecanicos = [];
  OrdenServicio? ordenActual;
  bool cargando = false;
  String? error;

  /// Catálogo de refacciones activas para usar en una orden (US7).
  List<Part> partesDisponibles = [];

  /// Último código de error devuelto por la API (para la corrección RN-4).
  String? codigoError;

  /// Filtros activos del listado.
  String? estadoFiltro;
  String textoFiltro = '';

  Future<void> recargar() async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final parametros = <String>[
        if (estadoFiltro != null && estadoFiltro!.isNotEmpty)
          'estado=${Uri.encodeComponent(estadoFiltro!)}',
        if (textoFiltro.isNotEmpty) 'texto=${Uri.encodeComponent(textoFiltro)}',
      ];
      final sufijo = parametros.isEmpty ? '' : '?${parametros.join('&')}';
      final respuesta = await api.get('/orders$sufijo');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      ordenes = datos
          .map((d) => OrdenServicio.desdeJson(d as Map<String, dynamic>))
          .toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  /// Mecánicos activos para la asignación manual (FR-008).
  Future<void> recargarMecanicos() async {
    try {
      final respuesta = await api.get('/orders/mechanics');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      mecanicos = datos
          .map((d) => MecanicoActivo.desdeJson(d as Map<String, dynamic>))
          .toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
    }
  }

  /// Detalle completo de la orden (FR-015); devuelve null si falla.
  Future<OrdenServicio?> obtenerDetalle(int id) async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final respuesta = await api.get('/orders/$id');
      ordenActual = OrdenServicio.desdeJson(respuesta);
      return ordenActual;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      return null;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  void limpiarDetalle() {
    ordenActual = null;
    error = null;
  }

  /// Crea una orden (RN-2/RN-3/RN-4). Devuelve false y expone `error`
  /// con el código disponible para proponer la corrección de kilometraje.
  Future<bool> crear({
    required int vehicleId,
    required int mileageEntry,
    required String reason,
    String? notes,
    bool mileageCorrection = false,
    int? mechanicId,
  }) async {
    error = null;
    try {
      await api.post('/orders', {
        'vehicleId': vehicleId,
        'mileageEntry': mileageEntry,
        'reason': reason,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (mileageCorrection) 'mileageCorrection': true,
        'mechanicId': ?mechanicId,
      });
      await recargar();
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return false;
    }
  }

  /// Asigna, reasigna o libera el mecánico (FR-009).
  Future<bool> asignar(int id, int? mechanicId) async {
    error = null;
    try {
      await api.patch('/orders/$id/assignment', {'mechanicId': mechanicId});
      await recargar();
      await obtenerDetalle(id);
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Cambia el estado según la máquina de estados (FR-012).
  Future<bool> transicionar(
    int id,
    String status, {
    String? cancellationReason,
    bool correction = false,
  }) async {
    error = null;
    try {
      await api.patch('/orders/$id/status', {
        'status': status,
        if (cancellationReason != null && cancellationReason.isNotEmpty)
          'cancellationReason': cancellationReason,
        if (correction) 'correction': true,
      });
      await recargar();
      await obtenerDetalle(id);
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Agrega una entrada fechada (diagnóstico, observación, recomendación).
  Future<bool> agregarEntrada(int id, String entryType, String content) async {
    error = null;
    try {
      await api.post('/orders/$id/entries', {
        'entryType': entryType,
        'content': content,
      });
      await obtenerDetalle(id);
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Agrega una partida de servicio o mano de obra (informativa).
  Future<bool> agregarPartida(
    int id,
    String description,
    double amount,
    String kind,
  ) async {
    error = null;
    try {
      await api.post('/orders/$id/services', {
        'description': description,
        'amount': amount,
        'kind': kind,
      });
      await obtenerDetalle(id);
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Borra una partida agregada por error (antes de cerrar la orden).
  Future<bool> borrarPartida(int orderId, int serviceId) async {
    error = null;
    try {
      await api.delete('/orders/$orderId/services/$serviceId');
      await obtenerDetalle(orderId);
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
      return false;
    }
  }

  /// Refacciones activas del inventario para agregar a la orden (US7, FR-011).
  Future<void> recargarPartesDisponibles() async {
    try {
      final respuesta = await api.get('/parts');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      partesDisponibles = datos
          .map((d) => Part.desdeJson(d as Map<String, dynamic>))
          .where((parte) => parte.isActive)
          .toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      notifyListeners();
    }
  }

  /// Usa una refacción en la orden: salida atómica de inventario (RN-6/RN-7).
  /// Si la refacción no tiene precio de venta el backend responde
  /// `PART_SIN_PRECIO` (005, FR-005) y `codigoError` lo expone para avisar;
  /// al salir bien recarga el detalle con el total que ya suma las
  /// refacciones (005, FR-007).
  Future<bool> agregarRefaccion(int orderId, int partId, int cantidad) async {
    error = null;
    codigoError = null;
    try {
      await api.post('/orders/$orderId/parts', {
        'partId': partId,
        'quantity': cantidad,
      });
      await obtenerDetalle(orderId);
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return false;
    }
  }

  /// Retira la refacción: la devolución restaura el stock (RN-8, FR-012).
  Future<bool> quitarRefaccion(int orderId, int orderPartId) async {
    error = null;
    codigoError = null;
    try {
      await api.delete('/orders/$orderId/parts/$orderPartId');
      await obtenerDetalle(orderId);
      return true;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return false;
    }
  }
}
