/// Sección del shell solicitada desde un aviso (007-notificaciones-internas,
/// T055; FR-007, CA-7).
///
/// `AppShell` cambia de sección con un índice local: este proveedor le permite
/// a otra parte de la interfaz (el panel de avisos) pedir que se abra una
/// sección (Inventario, Citas, Clientes por avisar) sin conocer sus índices.
/// El shell escucha la solicitud, cambia de sección y la consume.
library;

import 'package:flutter/foundation.dart';

/// Secciones del shell que un aviso puede abrir.
enum SeccionShell { inventario, citas, clientesPorAvisar }

class ShellNavigationProvider extends ChangeNotifier {
  /// Sección pedida y aún no atendida por el shell; null si no hay solicitud.
  SeccionShell? solicitada;

  /// Pide abrir una sección; el shell la atiende al reconstruirse.
  void solicitar(SeccionShell seccion) {
    solicitada = seccion;
    notifyListeners();
  }

  /// Devuelve la solicitud pendiente y la limpia (sin notificar).
  SeccionShell? consumir() {
    final seccion = solicitada;
    solicitada = null;
    return seccion;
  }
}
