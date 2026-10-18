/// Estado de los cobros de una orden (Sprint 4, US1/US2; FR-001 a FR-004).
///
/// Carga el resumen de cobro de la orden y registra pagos manuales; en la
/// US2 se amplía con el cobro digital por Mercado Pago.
library;

import 'package:flutter/foundation.dart';

import '../models/payment.dart';
import '../services/api_client.dart';

class PaymentsProvider extends ChangeNotifier {
  final ApiClient api;

  PaymentsProvider(this.api);

  PagosDeOrden? pagos;
  bool cargando = false;
  String? error;
  String? codigoError;

  /// Carga el resumen de cobro de la orden (total, cobrado, saldo, pagos).
  Future<void> cargar(int orderId) async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final respuesta = await api.get('/orders/$orderId/payments');
      pagos = PagosDeOrden.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      pagos = null;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }

  /// Registra un pago manual (nace COMPLETED en el servidor, FR-001).
  /// Con total incompleto el servidor responde `TOTAL_INCOMPLETO` (005,
  /// FR-009) y el mensaje queda en `error` con su código en `codigoError`;
  /// el formulario además bloquea el envío con su aviso ámbar.
  /// Devuelve el pago creado o null con el mensaje en `error`.
  Future<Pago?> registrar(
    int orderId, {
    required String metodo,
    required double monto,
  }) async {
    error = null;
    codigoError = null;
    try {
      final respuesta = await api.post('/orders/$orderId/payments', {
        'metodo': metodo,
        'monto': monto,
      });
      // Recarga para reflejar los saldos y la liquidación (FR-004).
      await cargar(orderId);
      return Pago.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return null;
    }
  }

  // --- US2: cobro digital con Mercado Pago (FR-008, FR-017) ---

  /// Último cobro digital creado, con su enlace de pago.
  CobroDigital? cobroDigital;

  /// Crea el cobro digital y guarda el enlace de pago (FR-017).
  /// La aplicación solo recibe el enlace: nunca datos de tarjeta (RN-14).
  Future<CobroDigital?> crearCobroDigital(
    int orderId, {
    required double monto,
  }) async {
    error = null;
    codigoError = null;
    notifyListeners();
    try {
      final respuesta = await api.post('/orders/$orderId/payments/digital', {
        'monto': monto,
      });
      cobroDigital = CobroDigital.desdeJson(respuesta);
      notifyListeners();
      return cobroDigital;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      cobroDigital = null;
      notifyListeners();
      return null;
    }
  }

  /// Verifica el cobro con el proveedor bajo demanda (decisión Q1) y
  /// recarga los saldos; devuelve el estado resultante o null con `error`.
  Future<Pago?> verificarCobro(int paymentId, int orderId) async {
    error = null;
    codigoError = null;
    notifyListeners();
    try {
      final respuesta = await api.post('/payments/$paymentId/verify', {});
      final pago = Pago.desdeJson(respuesta);
      cobroDigital = cobroDigital?.copiarCon(estado: pago.estado);
      await cargar(orderId);
      return pago;
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      notifyListeners();
      return null;
    }
  }
}
