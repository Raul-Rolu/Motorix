/// Estado del ticket de una orden (Sprint 4, US3; FR-011 a FR-013).
///
/// El servidor emite el ticket bajo demanda (folio único por orden) y su
/// contenido siempre refleja el estado de cobro más reciente (CA-4).
library;

import 'package:flutter/foundation.dart';

import '../models/ticket.dart';
import '../services/api_client.dart';

class TicketsProvider extends ChangeNotifier {
  final ApiClient api;

  TicketsProvider(this.api);

  TicketServicio? ticket;
  bool cargando = false;
  String? error;
  String? codigoError;

  /// Carga (o emite) el ticket de la orden (lo emite el servidor si aún no
  /// existe). Con total incompleto en una orden no liquidada el servidor
  /// responde `TOTAL_INCOMPLETO` (005, FR-010); el mensaje queda en `error`
  /// con su código en `codigoError` y se muestra en la vista.
  Future<void> cargar(int orderId) async {
    cargando = true;
    error = null;
    notifyListeners();
    try {
      final respuesta = await api.get('/tickets/$orderId');
      ticket = TicketServicio.desdeJson(respuesta);
    } on ExcepcionApi catch (excepcion) {
      error = excepcion.mensaje;
      codigoError = excepcion.codigo;
      ticket = null;
    } finally {
      cargando = false;
      notifyListeners();
    }
  }
}
