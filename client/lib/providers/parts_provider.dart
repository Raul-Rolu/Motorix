/// Estado del módulo de inventario (Sprint 3, US5/US6/US8).
///
/// Alta y edición de refacciones (el stock no es editable: solo movimientos,
/// FR-013) y registro de entradas IN con motivo (FR-014).
library;

import 'package:flutter/foundation.dart';

import '../models/part.dart';
import '../services/api_client.dart';

class PartsProvider extends ChangeNotifier {
  final ApiClient api;

  PartsProvider(this.api);

  List<Part> partes = [];
  bool cargando = false;
  String? error;
  String? codigoError;

  /// Búsqueda activa por nombre o código (FR-009, US6).
  String textoFiltro = '';

  Future<void> recargar() async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final sufijo = textoFiltro.isEmpty
          ? ''
          : '?q=${Uri.encodeComponent(textoFiltro)}';
      final respuesta = await api.get('/parts$sufijo');
      final datos = respuesta['datos'] as List<dynamic>? ?? [];
      partes = datos
          .map((elemento) => Part.desdeJson(elemento as Map<String, dynamic>))
          .toList();
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      partes = [];
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  /// Alta de refacción; si el código está duplicado devuelve null (409).
  Future<Part?> crear({
    required String name,
    required String code,
    int stock = 0,
    int minStock = 0,
  }) async {
    return _guardar({
      'name': name,
      'code': code,
      if (stock > 0) 'stock': stock,
      if (minStock > 0) 'minStock': minStock,
    });
  }

  /// Edición de metadatos (nunca el stock, FR-013).
  Future<Part?> editar({
    required int id,
    required String name,
    required String code,
    int minStock = 0,
    bool isActive = true,
  }) async {
    return _guardar(
      {
        'name': name,
        'code': code,
        'minStock': minStock,
        'isActive': isActive,
      },
      id: id,
    );
  }

  Future<Part?> _guardar(Map<String, dynamic> cuerpo, {int? id}) async {
    error = null;
    codigoError = null;
    try {
      final respuesta = id == null
          ? await api.post('/parts', cuerpo)
          : await api.put('/parts/$id', cuerpo);
      await recargar();
      return Part.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return null;
    }
  }

  /// Entrada de stock manual (IN) con motivo obligatorio (FR-014).
  Future<int?> registrarEntrada(int partId, int cantidad, String motivo) async {
    error = null;
    codigoError = null;
    try {
      final respuesta = await api.post('/parts/$partId/movements', {
        'movementType': 'IN',
        'quantity': cantidad,
        'reason': motivo,
      });
      await recargar();
      return respuesta['stockResult'] as int?;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return null;
    }
  }
}
